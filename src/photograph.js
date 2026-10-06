import * as THREE from 'three';
import { createLandscape } from './landscape.js';
import { calculateOptics, circleOfConfusionAt, clampSettings, SENSOR } from './optics.js';

const PHOTO_WIDTH = 960;
const PHOTO_HEIGHT = 640;

// This camera has its own scene and framebuffer. Moving the laboratory camera
// never changes the photographic viewpoint, focus, or captured image.
export function createPhotoRenderer(canvas, initialSettings) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(PHOTO_WIDTH, PHOTO_HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b7a0a9');
  scene.fog = new THREE.FogExp2('#96a6ae', 0.015);
  const landscape = createLandscape({ quality: 'photo' });
  // Dense vegetation supplies the photographic foreground; the laboratory's
  // broad support surfaces remain in its separate miniature scene.
  landscape.group.traverse((object) => {
    if (['Meadow floor', 'Meadow undergrowth', 'Landscape support plinth'].includes(object.name)) object.visible = false;
  });
  scene.add(landscape.group);
  const ambient = new THREE.HemisphereLight('#ffdfc7', '#617369', 2.05);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight('#ffe1b4', 3.7);
  sunlight.position.set(-6, 9, 2);
  sunlight.target.position.set(0, 0, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.2, far: 48 });
  sunlight.shadow.camera.updateProjectionMatrix();
  sunlight.shadow.bias = -0.0008;
  sunlight.shadow.normalBias = 0.035;
  sunlight.shadow.radius = 2;
  scene.add(sunlight.target);
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight('#bbd9e9', 1.4);
  fill.position.set(7, 4, -2);
  fill.target.position.set(0, 1, 8);
  scene.add(fill.target);
  scene.add(fill);

  const skyGeometry = new THREE.PlaneGeometry(180, 100);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    depthWrite: true,
    vertexShader: `varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
      }
      void main() {
        vec3 horizon = vec3(1.2, 0.45, 0.14);
        vec3 zenith = vec3(0.12, 0.19, 0.36);
        float t = smoothstep(0.53, 0.83, vUv.y);
        vec3 sky = mix(horizon, zenith, t);
        float glow = exp(-pow((vUv.x - 0.22) * 4.5, 2.0)
                         -pow((vUv.y - 0.5) * 12.0, 2.0));
        float wisps = noise(vUv * vec2(9.0, 36.0)) * 0.65 + noise(vUv * vec2(18.0, 72.0)) * 0.35;
        float cloud = smoothstep(0.49, 0.78, wisps) * smoothstep(0.47, 0.56, vUv.y);
        sky = mix(sky, vec3(0.99, 0.72, 0.56), cloud * 0.24);
        gl_FragColor = vec4(sky + vec3(0.4, 0.17, 0.05) * glow, 1.0);
      }`,
    toneMapped: false,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.position.set(0, 5, 75);
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(27, 1.5, 0.08, 130);
  camera.position.set(0, 1.25, 0);
  camera.lookAt(0, 1.25, 10);

  const supportsHDR = Boolean(renderer.getContext().getExtension('EXT_color_buffer_float'));
  const target = new THREE.WebGLRenderTarget(PHOTO_WIDTH, PHOTO_HEIGHT, {
    type: supportsHDR ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 4,
  });
  target.depthTexture = new THREE.DepthTexture(PHOTO_WIDTH, PHOTO_HEIGHT, THREE.UnsignedIntType);

  const uniforms = {
    tColor: { value: target.texture },
    tDepth: { value: target.depthTexture },
    resolution: { value: new THREE.Vector2(PHOTO_WIDTH, PHOTO_HEIGHT) },
    cameraNear: { value: camera.near },
    cameraFar: { value: camera.far },
    focalMeters: { value: 0.05 },
    focusMeters: { value: 8 },
    aperture: { value: 2.8 },
    sensorWidth: { value: SENSOR.width },
    bladeMix: { value: 0.3 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
    vertexShader: `varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      precision highp float;
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float cameraNear;
      uniform float cameraFar;
      uniform float focalMeters;
      uniform float focusMeters;
      uniform float aperture;
      uniform float sensorWidth;
      uniform float bladeMix;
      varying vec2 vUv;

      float distanceAt(vec2 uv) {
        float depth = texture2D(tDepth, uv).x;
        return cameraNear * cameraFar /
          (cameraFar - depth * (cameraFar - cameraNear));
      }

      // The thin-lens circle diameter in metres, projected onto the 36 mm
      // sensor. Convert diameter to radius in framebuffer pixels exactly once.
      float blurRadius(float distance) {
        float circle = focalMeters * focalMeters * abs(distance - focusMeters) /
          max(aperture * distance * (focusMeters - focalMeters), 0.000001);
        return clamp(circle / sensorWidth * resolution.x * 0.5, 0.0, 24.0);
      }

      void main() {
        vec3 center = texture2D(tColor, vUv).rgb;
        float distance = distanceAt(vUv);
        float radius = blurRadius(distance);
        vec3 color = center;
        if (radius > 0.45) {
          // A deterministic sunflower distribution fills the nine-bladed iris.
          // Sampling linear HDR retains the light energy of the cabin bulbs.
          vec3 sum = center;
          float total = 1.0;
          for (int i = 0; i < 48; i++) {
            float index = float(i) + 0.5;
            float angle = index * 2.39996323;
            float diskRadius = sqrt(index / 48.0);
            float sector = mod(angle + 0.34906585, 0.69813170) - 0.34906585;
            float polygonRadius = 0.93969262 / cos(sector);
            float iris = mix(1.0, polygonRadius, bladeMix);
            vec2 offset = vec2(cos(angle), sin(angle)) * diskRadius * radius * iris;
            vec2 sampleUv = clamp(vUv + offset / resolution, vec2(0.001), vec2(0.999));
            float sampleDistance = distanceAt(sampleUv);
            float sampleRadius = blurRadius(sampleDistance);
            // Reject sharp foreground samples from a background blur gather.
            // This keeps an in-focus flower crisp against distant cabin lights.
            float foreground = step(sampleDistance + 0.15, distance);
            float sharpness = 1.0 - smoothstep(0.4, max(radius * 0.7, 0.8), sampleRadius);
            float weight = 1.0 - foreground * sharpness * 0.98;
            sum += texture2D(tColor, sampleUv).rgb * weight;
            total += weight;
          }
          color = sum / total;
        }
        vec2 edge = (vUv - 0.5) * vec2(1.0, 0.88);
        color *= 1.0 - smoothstep(0.16, 0.52, dot(edge, edge)) * 0.20;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const screenScene = new THREE.Scene();
  const screenGeometry = new THREE.PlaneGeometry(2, 2);
  screenScene.add(new THREE.Mesh(screenGeometry, material));
  const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let settings;
  let optics;
  let disposed = false;
  let dirty = true;
  let renderCount = 0;

  function update(nextSettings) {
    const next = clampSettings(nextSettings);
    if (settings && Object.keys(next).every(key => settings[key] === next[key])) return;
    settings = next;
    dirty = true;
    optics = calculateOptics(settings);
    camera.fov = optics.fieldOfView;
    camera.updateProjectionMatrix();
    uniforms.focalMeters.value = optics.focalMeters;
    uniforms.focusMeters.value = settings.focusDistance;
    uniforms.aperture.value = settings.aperture;
    uniforms.bladeMix.value = THREE.MathUtils.clamp((settings.aperture - 1.4) / 7, 0, 1);
  }

  function render() {
    if (disposed || !dirty) return;
    // Keeping the landscape at a fixed instant makes captures reproducible.
    landscape.animate?.(0);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(screenScene, screenCamera);
    dirty = false;
    renderCount++;
  }

  function getDiagnostics() {
    return {
      size: { width: PHOTO_WIDTH, height: PHOTO_HEIGHT },
      cameraPosition: camera.position.toArray(),
      fieldOfView: camera.fov,
      focalLength: settings.focalLength,
      focusDistance: settings.focusDistance,
      aperture: settings.aperture,
      circlesOfConfusion: Object.fromEntries([['flower', 3], ['cabin', 8], ['mountains', 24]]
        .map(([name, distance]) => [name, circleOfConfusionAt(distance, settings)])),
      depthTexture: true,
      hdr: supportsHDR,
      renderCount,
      isolatedFromLab: true,
    };
  }

  function capture() {
    render();
    return canvas.toDataURL('image/png');
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    landscape.dispose?.();
    skyGeometry.dispose();
    skyMaterial.dispose();
    sunlight.shadow.map?.dispose();
    target.depthTexture.dispose();
    target.dispose();
    material.dispose();
    screenGeometry.dispose();
    renderer.dispose();
  }

  update(initialSettings);
  render();
  return { update, render, capture, getDiagnostics, dispose };
}
