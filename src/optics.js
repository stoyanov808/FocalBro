/**
 * OPTICA's simplified educational model: a single effective thin lens,
 * a 36 × 24 mm sensor, and a 30 µm acceptable circle of confusion.
 * All distances inside the model are meters; the focal-length control is mm.
 * Lens aberrations, diffraction, exposure, and pupil magnification are omitted.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  focusDistance: 8,
  aperture: 2.8,
  focalLength: 50,
});

export const SENSOR = Object.freeze({
  width: 0.036,
  height: 0.024,
  circleOfConfusion: 0.00003,
});

export const SUBJECTS = Object.freeze([
  Object.freeze({ id: 'flower', label: 'Flower', distance: 3, color: '#efaa82' }),
  Object.freeze({ id: 'cabin', label: 'Cabin', distance: 8, color: '#d8ba77' }),
  Object.freeze({ id: 'mountains', label: 'Mountains', distance: 24, color: '#74c6d3' }),
]);

export const SETTINGS_LIMITS = Object.freeze({
  focusDistance: Object.freeze({ min: 1, max: 30 }),
  aperture: Object.freeze({ min: 1.4, max: 16 }),
  focalLength: Object.freeze({ min: 24, max: 85 }),
});

export function clampSettings(settings = {}) {
  const result = {};
  for (const [key, { min, max }] of Object.entries(SETTINGS_LIMITS)) {
    const supplied = settings?.[key];
    const numeric = supplied == null || supplied === '' ? NaN : Number(supplied);
    const value = Number.isFinite(numeric) ? numeric : DEFAULT_SETTINGS[key];
    result[key] = Math.min(max, Math.max(min, value));
  }
  return result;
}

/** Optical values share the same aperture and sensor position as the blur. */
export function calculateOptics(settings = DEFAULT_SETTINGS) {
  const { focusDistance: s, aperture: n, focalLength } = clampSettings(settings);
  const f = focalLength / 1000;
  const apertureDiameter = f / n;
  const imageDistance = (f * s) / (s - f);

  // c(u) = [A f / (s − f)] |s/u − 1|. Solving c(u) = c₀ gives
  // u_near = s/(1 + q), u_far = s/(1 − q), q = c₀(s − f)/(A f).
  // At q ≥ 1 even infinity meets the criterion, so the far limit is ∞.
  const q = (SENSOR.circleOfConfusion * (s - f)) / (apertureDiameter * f);
  const radiansToDegrees = 180 / Math.PI;

  return {
    focalMeters: f,
    apertureDiameter,
    imageDistance,
    hyperfocal: f + (apertureDiameter * f) / SENSOR.circleOfConfusion,
    nearLimit: s / (1 + q),
    farLimit: q >= 1 ? Infinity : s / (1 - q),
    // Use the actual image distance, including the small focus-breathing effect.
    fieldOfView: 2 * Math.atan(SENSOR.height / (2 * imageDistance)) * radiansToDegrees,
    horizontalFieldOfView: 2 * Math.atan(SENSOR.width / (2 * imageDistance)) * radiansToDegrees,
  };
}

/** Unsigned blur-circle diameter at the sensor, in meters. */
export function circleOfConfusionAt(distance, settings = DEFAULT_SETTINGS) {
  const { focusDistance: s, aperture: n, focalLength } = clampSettings(settings);
  const f = focalLength / 1000;
  const subjectDistance = Number(distance);
  // Virtual-image subjects inside the focal length are outside this exhibit's model.
  if (!(subjectDistance > f)) return Infinity;
  return ((f / n) * f / (s - f)) * Math.abs(s / subjectDistance - 1);
}

export function formatDistance(distance) {
  if (distance === Infinity) return '∞';
  if (!Number.isFinite(distance) || distance < 0) return '—';
  return `${distance.toFixed(distance < 1 ? 2 : 1)} m`;
}
