import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  SENSOR,
  SUBJECTS,
  calculateOptics,
  circleOfConfusionAt,
  clampSettings,
  formatDistance,
} from '../src/optics.js';

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

test('sensor distance satisfies the thin-lens equation and selected subject has zero blur', () => {
  for (const subject of SUBJECTS) {
    const settings = { ...DEFAULT_SETTINGS, focusDistance: subject.distance };
    const optics = calculateOptics(settings);
    close(1 / optics.focalMeters, 1 / subject.distance + 1 / optics.imageDistance);
    close(circleOfConfusionAt(subject.distance, settings), 0);
    for (const other of SUBJECTS.filter((item) => item.id !== subject.id)) {
      assert.ok(circleOfConfusionAt(other.distance, settings) > 0);
    }
  }
});

test('defocus is the geometric ray-bundle diameter at the sensor', () => {
  const settings = { focusDistance: 8, aperture: 2.8, focalLength: 50 };
  const optics = calculateOptics(settings);
  for (const distance of [3, 24, 100]) {
    const subjectImageDistance = optics.focalMeters * distance / (distance - optics.focalMeters);
    const geometricDiameter = optics.apertureDiameter *
      Math.abs(subjectImageDistance - optics.imageDistance) / subjectImageDistance;
    close(circleOfConfusionAt(distance, settings), geometricDiameter);
  }
});

test('doubling f-number halves aperture diameter and defocus; depth of field increases', () => {
  const wide = { ...DEFAULT_SETTINGS, aperture: 2.8 };
  const narrow = { ...DEFAULT_SETTINGS, aperture: 5.6 };
  const wideOptics = calculateOptics(wide);
  const narrowOptics = calculateOptics(narrow);
  close(wideOptics.apertureDiameter, narrowOptics.apertureDiameter * 2);
  close(circleOfConfusionAt(3, wide), circleOfConfusionAt(3, narrow) * 2);
  assert.ok(narrowOptics.nearLimit < wideOptics.nearLimit);
  assert.ok(narrowOptics.farLimit > wideOptics.farLimit);
  close(wideOptics.imageDistance, narrowOptics.imageDistance);
});

test('near and far limits are exact roots of the same circle-of-confusion criterion', () => {
  for (const aperture of [1.4, 2.8, 16]) {
    const settings = { focusDistance: 8, aperture, focalLength: 50 };
    const optics = calculateOptics(settings);
    close(circleOfConfusionAt(optics.nearLimit, settings), SENSOR.circleOfConfusion);
    assert.ok(circleOfConfusionAt(optics.nearLimit * 0.99, settings) > SENSOR.circleOfConfusion);
    if (Number.isFinite(optics.farLimit)) {
      close(circleOfConfusionAt(optics.farLimit, settings), SENSOR.circleOfConfusion);
      assert.ok(circleOfConfusionAt(optics.farLimit * 1.01, settings) > SENSOR.circleOfConfusion);
    } else {
      assert.ok(circleOfConfusionAt(Infinity, settings) <= SENSOR.circleOfConfusion);
    }
    assert.ok(circleOfConfusionAt((optics.nearLimit + 8) / 2, settings) < SENSOR.circleOfConfusion);
  }
});

test('hyperfocal focus includes infinity and the near limit is half the hyperfocal distance', () => {
  const settings = { focusDistance: 8, aperture: 16, focalLength: 24 };
  const hyperfocal = calculateOptics(settings).hyperfocal;
  const atHyperfocal = { ...settings, focusDistance: hyperfocal };
  const optics = calculateOptics(atHyperfocal);
  assert.equal(optics.farLimit, Infinity);
  close(optics.nearLimit, hyperfocal / 2);
  close(circleOfConfusionAt(Infinity, atHyperfocal), SENSOR.circleOfConfusion);
  assert.equal(calculateOptics({ ...settings, focusDistance: 30 }).farLimit, Infinity);
});

test('longer focal length narrows both fields of view and increases distant-subject blur', () => {
  const short = { ...DEFAULT_SETTINGS, focalLength: 24 };
  const long = { ...DEFAULT_SETTINGS, focalLength: 85 };
  const shortOptics = calculateOptics(short);
  const longOptics = calculateOptics(long);
  assert.ok(longOptics.fieldOfView < shortOptics.fieldOfView);
  assert.ok(longOptics.horizontalFieldOfView < shortOptics.horizontalFieldOfView);
  assert.ok(circleOfConfusionAt(24, long) > circleOfConfusionAt(24, short));
  close(2 * longOptics.imageDistance * Math.tan(longOptics.fieldOfView * Math.PI / 360), SENSOR.height);
});

test('control limits and formatting keep incomplete input usable', () => {
  assert.deepEqual(clampSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(clampSettings({ focusDistance: -1, aperture: 99, focalLength: '85' }),
    { focusDistance: 1, aperture: 16, focalLength: 85 });
  assert.deepEqual(clampSettings({ focusDistance: NaN, aperture: '', focalLength: Infinity }), DEFAULT_SETTINGS);
  assert.equal(formatDistance(Infinity), '∞');
  assert.equal(formatDistance(8), '8.0 m');
  assert.equal(formatDistance(NaN), '—');
});
