import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description='Exercise OPTICA in Chromium with software WebGL.')
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
parser.add_argument('--chromium-path', default='/usr/bin/chromium')
parser.add_argument('--artifacts-dir', default='/tmp/optica-qa')
parser.add_argument('--remaining', action='store_true', help='Run capture, compare, export, experiments, and layouts only.')
parser.add_argument('--resume', action='store_true', help='Run remaining checks after the initial optical controls.')
parser.add_argument('--smoke-only', action='store_true', help='Check initial WebGL readiness and runtime errors only.')
parser.add_argument('--final-targeted', action='store_true', help='Verify ray math, settled blades, actual-depth picking, orbit/reset, and fullscreen.')
args = parser.parse_args()

RESULTS = []
ERRORS = []
ARTIFACTS = Path(args.artifacts_dir)
ARTIFACTS.mkdir(parents=True, exist_ok=True)

def record(name, value=True):
    RESULTS.append({'check': name, 'result': value})
    print(json.dumps(RESULTS[-1]), flush=True)

def diagnostic(page):
    return page.evaluate('window.__OPTICA__.getDiagnostics()')

def photo_hash(page):
    return hashlib.sha256(page.locator('.photograph-canvas').evaluate("canvas => canvas.toDataURL('image/png')").encode()).hexdigest()

def value(page, name, number):
    target = page.get_by_role('spinbutton', name=f'{name} value', exact=True)
    target.fill(str(number))
    target.press('Enter')
    page.wait_for_timeout(700)

def button(page, name):
    page.get_by_role('button', name=name, exact=True).click()
    page.wait_for_timeout(700)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium_path, headless=True, args=[
        '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': 1000, 'height': 900}, device_scale_factor=1,
                                 accept_downloads=True, reduced_motion='reduce')
    page = context.new_page()
    page.set_default_timeout(90000)
    def runtime_error(message):
        ERRORS.append(str(message))
        record('Runtime error', str(message))
    page.on('pageerror', runtime_error)
    page.on('console', lambda message: runtime_error(message.text) if message.type == 'error' else None)
    page.goto(args.base_url, wait_until='domcontentloaded', timeout=90000)
    page.wait_for_function('!!window.__OPTICA__', timeout=90000)
    page.wait_for_timeout(1200)
    initial = diagnostic(page)
    assert initial['settings'] == {'focusDistance': 8, 'aperture': 2.8, 'focalLength': 50}
    record('WebGL and initial settings', initial)
    page.screenshot(path=str(ARTIFACTS / 'desktop.png'))
    if args.final_targeted:
        value(page, 'Aperture', 1.4)
        page.wait_for_function('Math.abs(window.__OPTICA__.getDiagnostics().laboratory.bladeRadius - window.__OPTICA__.getDiagnostics().laboratory.bladeTarget) < .0001')
        wide_radius = diagnostic(page)['laboratory']['bladeRadius']
        value(page, 'Aperture', 16)
        page.wait_for_function('Math.abs(window.__OPTICA__.getDiagnostics().laboratory.bladeRadius - window.__OPTICA__.getDiagnostics().laboratory.bladeTarget) < .0001')
        narrow_radius = diagnostic(page)['laboratory']['bladeRadius']
        assert wide_radius > narrow_radius
        record('Final settled aperture blades', {'f1.4': wide_radius, 'f16': narrow_radius})
        button(page, 'Reset all')
        button(page, 'Light paths')
        rays = diagnostic(page)
        for bundle in rays['laboratory']['rayBundles']:
            expected = rays['photograph']['circlesOfConfusion'][bundle['id']]
            assert abs(bundle['sensorCircleMeters'] - expected) < 1e-12
            assert abs(bundle['sensorCircleScene'] - 2 * .49 * 1.22 / (.085 / 1.4) * expected) < 1e-12
        record('Final ray circles equal photograph circles', rays['laboratory']['rayBundles'])
        button(page, 'Reset all')
        canvas = page.locator('.laboratory-canvas')
        canvas.scroll_into_view_if_needed()
        box = canvas.bounding_box()
        flower = diagnostic(page)['laboratory']['subjectScreenPositions']['flower']
        page.mouse.click(box['x'] + flower['x'], box['y'] + flower['y'])
        page.wait_for_timeout(700)
        picked = diagnostic(page)
        surface = picked['laboratory']['lastPickedSubject']
        assert surface and surface['id'] == 'flower'
        assert abs(surface['distance'] - surface['surfacePoint'][2]) < 1e-9
        assert abs(picked['settings']['focusDistance'] - surface['distance']) < 1e-9
        assert abs(picked['photograph']['focusDistance'] - surface['distance']) < 1e-9
        record('3D picking focuses actual clicked surface depth', surface)
        button(page, 'Reset all')
        canvas.scroll_into_view_if_needed()
        box = canvas.bounding_box()
        handle = diagnostic(page)['laboratory']['focusHandleScreenPosition']
        page.mouse.move(box['x'] + handle['x'], box['y'] + handle['y'])
        page.mouse.down()
        page.mouse.move(box['x'] + handle['x'] + 65, box['y'] + handle['y'] - 10, steps=4)
        page.mouse.up()
        page.wait_for_timeout(700)
        assert abs(diagnostic(page)['settings']['focusDistance'] - 8) > .1
        record('Final focus handle drag')
        button(page, 'Reset all')
        canvas.scroll_into_view_if_needed()
        box = canvas.bounding_box()
        before = diagnostic(page)
        before_hash = photo_hash(page)
        page.mouse.move(box['x'] + box['width'] * .48, box['y'] + box['height'] * .27)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] * .7, box['y'] + box['height'] * .36, steps=8)
        page.mouse.up()
        page.wait_for_timeout(700)
        after = diagnostic(page)
        assert after['settings']['focusDistance'] == 8
        assert after['laboratory']['camera'] != before['laboratory']['camera']
        assert photo_hash(page) == before_hash
        button(page, 'Reset all')
        reset_camera = diagnostic(page)['laboratory']['camera']
        assert all(abs(a - b) < 1e-8 for a, b in zip(reset_camera, initial['laboratory']['camera']))
        record('Final orbit preserves photo; reset returns exact initial camera', reset_camera)
        button(page, 'Fullscreen laboratory')
        fullscreen = page.evaluate('!!document.fullscreenElement')
        if fullscreen:
            page.evaluate('() => document.exitFullscreen()')
        else:
            assert 'Fullscreen is unavailable' in page.locator('.toast').inner_text()
        record('Fullscreen control', fullscreen)
        button(page, 'Reset all')
        button(page, 'Exploded lens')
        button(page, 'Inspect lens detail')
        page.locator('.exhibit').screenshot(path=str(ARTIFACTS / 'lens-assembled-final.png'))
        record('Assembled hollow lens renders in inspection detail')
        button(page, 'Reset all')
    if args.smoke_only:
        record('Runtime errors', ERRORS)
        assert not ERRORS
        (ARTIFACTS / 'results.json').write_text(json.dumps(RESULTS, indent=2))
        browser.close()
        raise SystemExit(0)

    if not args.remaining:
        if not args.resume:
            hashes = {}
            for subject, distance in [('Flower', 3), ('Cabin', 8), ('Mountains', 24)]:
                button(page, subject)
                page.wait_for_function('(target) => Math.abs(window.__OPTICA__.getDiagnostics().laboratory.focusPlaneX - target) < .01',
                                       arg=-3.5 + distance * .25, timeout=30000)
                current = diagnostic(page)
                assert current['settings']['focusDistance'] == distance
                assert current['photograph']['circlesOfConfusion'][subject.lower()] == 0
                assert abs(current['laboratory']['focusPlaneX'] - (-3.5 + distance * .25)) < 0.01
                hashes[subject] = photo_hash(page)
            assert len(set(hashes.values())) == 3
            record('Subject buttons move focus plane and change photograph', hashes)

            # Pick the projected subject geometry, independently of the focus buttons.
            button(page, 'Reset all')
            canvas = page.locator('.laboratory-canvas')
            canvas.scroll_into_view_if_needed()
            box = canvas.bounding_box()
            d = diagnostic(page)
            flower = d['laboratory']['subjectScreenPositions']['flower']
            if flower['visible'] and 0 < flower['x'] < box['width'] and 0 < flower['y'] < box['height']:
                page.mouse.click(box['x'] + flower['x'], box['y'] + flower['y'])
                page.wait_for_timeout(900)
                current = diagnostic(page)
                record('3D flower center picking', current['settings']['focusDistance'])
                surface = current['laboratory']['lastPickedSubject']
                assert surface and abs(current['settings']['focusDistance'] - surface['distance']) < 1e-9

            button(page, 'Cabin')
            canvas.scroll_into_view_if_needed()
            box = canvas.bounding_box()
            handle = diagnostic(page)['laboratory']['focusHandleScreenPosition']
            page.mouse.move(box['x'] + handle['x'], box['y'] + handle['y'])
            page.mouse.down()
            page.mouse.move(box['x'] + handle['x'] + 65, box['y'] + handle['y'] - 10, steps=4)
            page.mouse.up()
            page.wait_for_timeout(1000)
            dragged = diagnostic(page)
            assert abs(dragged['settings']['focusDistance'] - 8) > .1
            assert abs(dragged['photograph']['focusDistance'] - dragged['settings']['focusDistance']) < .01
            record('Draggable focus handle updates laboratory and photographic focus', dragged['settings']['focusDistance'])
            button(page, 'Cabin')
            value(page, 'Aperture', 1.4)
            page.wait_for_function('Math.abs(window.__OPTICA__.getDiagnostics().laboratory.bladeRadius - window.__OPTICA__.getDiagnostics().laboratory.bladeTarget) < .0001')
            wide = diagnostic(page)
            wide_hash = photo_hash(page)
            value(page, 'Aperture', 16)
            page.wait_for_function('Math.abs(window.__OPTICA__.getDiagnostics().laboratory.bladeRadius - window.__OPTICA__.getDiagnostics().laboratory.bladeTarget) < .0001')
            narrow = diagnostic(page)
            narrow_hash = photo_hash(page)
            assert narrow['settings']['aperture'] == 16
            assert narrow['laboratory']['bladeTarget'] < wide['laboratory']['bladeTarget']
            assert narrow['laboratory']['bladeRadius'] < wide['laboratory']['bladeRadius']
            assert narrow['photograph']['circlesOfConfusion']['flower'] < wide['photograph']['circlesOfConfusion']['flower']
            assert narrow_hash != wide_hash
            record('Aperture changes blades, optical blur, rendered photo', {
                'wideBladeRadius': wide['laboratory']['bladeRadius'], 'narrowBladeRadius': narrow['laboratory']['bladeRadius'],
                'wideFlowerCoC': wide['photograph']['circlesOfConfusion']['flower'],
                'narrowFlowerCoC': narrow['photograph']['circlesOfConfusion']['flower']})

            value(page, 'Focal length', 24)
            short = diagnostic(page)
            short_hash = photo_hash(page)
            value(page, 'Focal length', 85)
            long = diagnostic(page)
            assert short['photograph']['fieldOfView'] > long['photograph']['fieldOfView']
            assert short_hash != photo_hash(page)
            record('Focal length changes photo field of view and image', {
                '24mmFoV': short['photograph']['fieldOfView'], '85mmFoV': long['photograph']['fieldOfView']})

            value(page, 'Focus distance', 12.3)
            assert abs(diagnostic(page)['settings']['focusDistance'] - 12.3) < 1e-6
            record('Editable numeric focus distance')
            focus_range = page.locator('#focusDistance-range')
            focus_range.focus()
            focus_range.press('Home')
            focus_range.press('ArrowRight')
            page.wait_for_timeout(700)
            assert abs(diagnostic(page)['settings']['focusDistance'] - 1.1) < 1e-6
            record('Keyboard range control')

        if args.resume:
            # Explicitly settle the mechanical pupil before reading its radius.
            value(page, 'Aperture', 1.4)
            page.wait_for_function('Math.abs(window.__OPTICA__.getDiagnostics().laboratory.bladeRadius - window.__OPTICA__.getDiagnostics().laboratory.bladeTarget) < .0001')
            wide = diagnostic(page)['laboratory']['bladeRadius']
            value(page, 'Aperture', 16)
            page.wait_for_function('Math.abs(window.__OPTICA__.getDiagnostics().laboratory.bladeRadius - window.__OPTICA__.getDiagnostics().laboratory.bladeTarget) < .0001')
            narrow = diagnostic(page)['laboratory']['bladeRadius']
            assert wide > narrow
            record('Settled aperture blades follow f-number', {'f1.4Radius': wide, 'f16Radius': narrow})
            button(page, 'Reset all')
            canvas = page.locator('.laboratory-canvas')
            canvas.scroll_into_view_if_needed()
            box = canvas.bounding_box()
            handle = diagnostic(page)['laboratory']['focusHandleScreenPosition']
            page.mouse.move(box['x'] + handle['x'], box['y'] + handle['y'])
            page.mouse.down()
            page.mouse.move(box['x'] + handle['x'] + 65, box['y'] + handle['y'] - 10, steps=4)
            page.mouse.up()
            page.wait_for_timeout(1000)
            assert abs(diagnostic(page)['settings']['focusDistance'] - 8) > .1
            record('Focus handle remains draggable after restricted picker')
            button(page, 'Reset all')
            before = diagnostic(page)
            canvas.scroll_into_view_if_needed()
            box = canvas.bounding_box()
            page.mouse.move(box['x'] + box['width'] * .48, box['y'] + box['height'] * .27)
            page.mouse.down()
            page.mouse.move(box['x'] + box['width'] * .7, box['y'] + box['height'] * .36, steps=8)
            page.mouse.up()
            page.wait_for_timeout(1000)
            after = diagnostic(page)
            assert after['settings']['focusDistance'] == 8
            assert after['laboratory']['camera'] != before['laboratory']['camera']
            record('Orbit through focus plane surface preserves focus distance')

        button(page, 'Reset all')
        before_hash = photo_hash(page)
        before = diagnostic(page)
        canvas.scroll_into_view_if_needed()
        box = canvas.bounding_box()
        page.mouse.move(box['x'] + box['width'] * .87, box['y'] + box['height'] * .12)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] * .65, box['y'] + box['height'] * .24, steps=12)
        page.mouse.up()
        page.wait_for_timeout(1000)
        after = diagnostic(page)
        record('Orbit gesture diagnostics', {'beforeFocus': before['settings']['focusDistance'], 'afterFocus': after['settings']['focusDistance'], 'beforeCamera': before['laboratory']['camera'], 'afterCamera': after['laboratory']['camera']})
        assert after['laboratory']['camera'] != before['laboratory']['camera']
        assert photo_hash(page) == before_hash
        assert after['photograph']['cameraPosition'] == before['photograph']['cameraPosition']
        record('Inspection orbit leaves photographic image and camera unchanged')

        button(page, 'Light paths')
        assert diagnostic(page)['laboratory']['options']['rays']
        rays = diagnostic(page)
        for bundle in rays['laboratory']['rayBundles']:
            expected = rays['photograph']['circlesOfConfusion'][bundle['id']]
            assert abs(bundle['sensorCircleMeters'] - expected) < 1e-12
            assert abs(bundle['sensorCircleScene'] - 2 * .49 * 1.22 / (.085 / 1.4) * expected) < 1e-12
            if bundle['id'] == 'cabin':
                assert abs(bundle['convergenceX'] - (-5.5)) < 1e-12
        record('Representative ray sensor intersections match photographic CoC', rays['laboratory']['rayBundles'])
        button(page, 'Exploded lens')
        assert not diagnostic(page)['laboratory']['options']['exploded']
        button(page, 'Focus plane')
        assert not diagnostic(page)['laboratory']['options']['focusPlane']
        record('Scene toggles')

    button(page, 'Reset all')
    page.locator('.capture-button').nth(0).click()
    page.wait_for_timeout(700)
    button(page, 'Flower')
    page.locator('.capture-button').nth(1).click()
    page.wait_for_timeout(700)
    captures = diagnostic(page)['captures']
    assert captures[0]['focusDistance'] == 8 and captures[1]['focusDistance'] == 3
    page.get_by_role('button', name='A/B comparison').click()
    page.wait_for_timeout(400)
    comparison = page.get_by_role('slider', name='A/B comparison position')
    comparison.focus()
    comparison.press('Home')
    for _ in range(27): comparison.press('ArrowRight')
    assert comparison.input_value() == '27'
    assert '73%' in page.locator('.compare-view img').nth(1).get_attribute('style')
    with page.expect_download(timeout=90000) as download_info:
        page.get_by_role('button', name='Export comparison PNG').click()
    download = download_info.value
    download.save_as(str(ARTIFACTS / download.suggested_filename))
    assert download.suggested_filename == 'optica-comparison.png'
    assert (ARTIFACTS / download.suggested_filename).read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'
    record('A/B captures preserve settings; comparison slider and PNG export', captures)

    button(page, 'Reset all')
    reset = diagnostic(page)
    assert reset['settings'] == initial['settings']
    assert reset['laboratory']['options'] == initial['laboratory']['options']
    assert reset['captures'] == captures
    assert page.get_by_role('slider', name='A/B comparison position').count() == 0
    record('Reset restores controls, view, and live mode; captures retained')

    button(page, 'Inspect lens detail')
    assert page.locator('.view-tag').inner_text() == 'LENS DETAIL'
    assert diagnostic(page)['laboratory']['camera'] != initial['laboratory']['camera']
    button(page, 'Return to overview')
    button(page, 'Reset inspection view')
    button(page, 'Enlarge photograph')
    assert 'photo-expanded' in page.locator('.photograph-panel').get_attribute('class')
    button(page, 'Enlarge photograph')
    assert 'photo-expanded' not in page.locator('.photograph-panel').get_attribute('class')
    record('Lens detail, view reset, and photograph enlargement')

    page.get_by_role('button', name='EXPERIMENT 01 Find your focus').click()
    page.wait_for_timeout(1000)
    assert diagnostic(page)['settings']['focusDistance'] == 3
    page.wait_for_timeout(3000)
    assert diagnostic(page)['settings']['focusDistance'] == 8
    page.wait_for_timeout(3000)
    assert diagnostic(page)['settings']['focusDistance'] == 24
    record('Guided focus experiment reaches flower, cabin, mountains')
    page.get_by_role('button', name='EXPERIMENT 02 A little more depth').click()
    page.wait_for_timeout(1000)
    assert diagnostic(page)['settings']['aperture'] == 1.4
    page.wait_for_timeout(3300)
    assert diagnostic(page)['settings']['aperture'] == 16
    record('Guided aperture experiment')
    page.get_by_role('button', name='EXPERIMENT 03 Change your perspective').click()
    page.wait_for_timeout(1000)
    assert diagnostic(page)['settings']['focalLength'] == 24
    page.wait_for_timeout(3300)
    assert diagnostic(page)['settings']['focalLength'] == 85
    record('Guided focal-length experiment')
    button(page, 'Reset all')
    page.get_by_role('button', name='Field guide').click()
    assert page.locator('dialog').evaluate('dialog => dialog.open')
    page.get_by_role('button', name='Close field guide').click()
    assert not page.locator('dialog').evaluate('dialog => dialog.open')
    record('Field guide opens and closes')

    page.set_viewport_size({'width': 1440, 'height': 1080})
    button(page, 'Reset all')
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(ARTIFACTS / 'desktop-final.png'), full_page=True)

    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(1000)
    dimensions = page.evaluate('({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })')
    assert dimensions['scrollWidth'] <= dimensions['width']
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(ARTIFACTS / 'mobile-opening.png'))
    button(page, 'Cabin')
    value(page, 'Aperture', 1.4)
    button(page, 'Mountains')
    assert diagnostic(page)['settings']['focusDistance'] == 24
    page.screenshot(path=str(ARTIFACTS / 'mobile.png'))
    record('390 px mobile has no horizontal overflow and working controls', dimensions)
    button(page, 'Reset all')
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(ARTIFACTS / 'mobile-final.png'), full_page=True)
    record('Runtime errors', ERRORS)
    assert not ERRORS
    (ARTIFACTS / 'results.json').write_text(json.dumps(RESULTS, indent=2))
    browser.close()
