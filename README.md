# OPTICA

A procedural, interactive camera and optics laboratory. Inspect a physical optical bench, focus a full-frame photographic camera, and compare the photographs you make.

## Portable preview

Generate the standalone preview after cloning the repository:

```sh
npm ci
npm run export:preview
```

Then open `preview/OPTICA.html` directly in a WebGL-capable browser. This standalone preview includes the app, fonts, shaders, and all procedural geometry; it needs neither a server nor network access. Captures and PNG downloads work in the portable preview too. Run `npm run export:preview` again after editing the project; generated previews are excluded from Git.

## Develop

Requires Node.js 22.12+ (Node 24 is supported).

```sh
npm ci
npm run dev -- --port 5173
```

Vite listens on all interfaces. No credentials, backend, downloaded models, or external runtime assets are required. Fonts are bundled locally.

```sh
npm test       # thin-lens model and optical consistency
npm run build # production bundle
npm run preview -- --port 4173
```

For end-to-end checks in this cloud environment (Python Playwright and Chromium are preinstalled):

```sh
python3 tests/browser_checks.py --base-url http://127.0.0.1:5173
```

The browser suite exercises real subject picking, the focus-plane handle, optical controls, camera independence, captures, comparison, PNG export, guided experiments, and responsive layouts. It writes screenshots and results under `/tmp/optica-qa` by default.

## Explore

- Drag the inspection canvas to orbit; pinch or scroll to zoom. The photographic camera stays fixed.
- Focus with the slider, editable number, subject buttons, a click on a landscape subject, or the cyan plane's brass drag handle.
- Change aperture and focal length to alter the iris, framing, rays, and depth-aware photographic blur together.
- Toggle the exploded assembly, light paths, and focus plane. Inspect the lens close up or open the laboratory fullscreen.
- Capture A and B, select A/B comparison, and drag across the photographs. Export a live photograph or the current comparison as PNG.
- Try the three guided experiments. Touching any optical control stops the current experiment.
- Reset all restores the starting optical settings and inspection view, while keeping saved photographs.
- The field guide explains the model and interaction.

## Optical model

All internal lengths use meters. The sensor is 36 × 24 mm; the acceptable circle-of-confusion diameter is 0.03 mm. For focal length `f`, focus distance `s`, f-number `N`, and subject distance `u`:

```text
Aperture diameter A = f / N
Sensor image distance v = f s / (s - f)
Subject image distance vu = f u / (u - f)
Defocus circle c(u) = A |vu - v| / vu
q = c₀ (s - f) / (A f)
Near limit = s / (1 + q)
Far limit = s / (1 - q), or infinity when q ≥ 1
```

The photographic renderer samples a depth texture and converts this same sensor blur diameter into image pixels. Framing uses the actual image distance, including focus breathing. The inspection scene compresses subject distances and normalizes the image-space axis by `v` to keep the sensor on its physical mount. Ray-bundle width uses the same `f/N` pupil and exact defocus ratio; the effective lens plane stays fixed during explosion.

This is a simplified educational thin-lens model. Exposure is compensated. Aberrations, diffraction, pupil magnification, and a complete multi-element ray trace are omitted. Captures are 960 × 640 pixels. Everything in the scene is built from procedural geometry, generated textures, and bundled fonts.

## Code map

- `src/App.jsx`, `src/styles.css`: interface, guided experiments, captures, and comparison.
- `src/optics.js`: shared optical calculations.
- `src/laboratory.js`: physical exhibit, orbiting, object selection, aperture blades, and ray geometry.
- `src/landscape.js`: shared procedural flowers, cabin, trees, mountains, and bokeh lights.
- `src/photograph.js`: independent photographic camera, HDR rendering, and depth-based bokeh shader.

Live processes do not survive an environment snapshot. Restart Vite in the existing checkout for each new task; a Git worktree is unnecessary.
