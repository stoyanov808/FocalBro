import * as THREE from 'three';

// A deliberately small, entirely procedural landscape. Its three focus planes
// are real world-space distances so the photograph and the optical bench agree.
export function createLandscape({ quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.name = 'Alpine light · photographic subject';
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const subjects = [];
  let seed = 73019;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const range = (a, b) => a + random() * (b - a);
  const paintedTexture = (kind) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = kind === 'wood' ? 128 : 512;
    const ctx = canvas.getContext('2d');
    if (kind === 'wood') {
      ctx.fillStyle = '#c5b7a2'; ctx.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 380; i++) {
        const y = range(0, 128), x = range(-120, 512);
        ctx.strokeStyle = `rgba(66,43,26,${range(0.05, 0.28)})`;
        ctx.lineWidth = range(0.5, 1.4);
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 60, y + range(-4, 4), x + 180, y + range(-3, 3), x + range(100, 480), y + range(-2, 2));
        ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const x = range(20, 490), y = range(10, 118);
        for (let r = 2; r < 14; r += 2) {
          ctx.strokeStyle = 'rgba(62,38,23,.24)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(x, y, r * 2.3, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    } else {
      ctx.fillStyle = '#8e997a'; ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 6500; i++) {
        const x = range(0, 512), y = range(0, 512);
        ctx.fillStyle = random() > 0.45 ? 'rgba(50,63,42,.19)' : 'rgba(210,192,130,.2)';
        ctx.beginPath(); ctx.ellipse(x, y, range(1, 8), range(1, 5), range(0, 6), 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 2400; i++) {
        const x = range(0, 512), y = range(0, 512);
        ctx.strokeStyle = random() > 0.5 ? 'rgba(222,207,158,.31)' : 'rgba(58,70,41,.36)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + range(-4, 4), y - range(3, 12)); ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    if (kind !== 'wood') texture.repeat.set(8, 8);
    textures.add(texture);
    return texture;
  };
  const geometry = (g) => { geometries.add(g); return g; };
  const material = (color, options = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...options });
    materials.add(m);
    return m;
  };
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const ball = geometry(new THREE.SphereGeometry(1, 9, 6));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 7));
  const leafCone = geometry(new THREE.ConeGeometry(1, 1, 8));
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const metadata = (object, id, distance) => {
    object.userData.subjectId = id;
    object.userData.distance = distance;
    return object;
  };
  const mesh = (name, geom, mat, position, scale, parent = group, id = 'mountains', distance = 24) => {
    const m = metadata(new THREE.Mesh(geom, mat), id, distance);
    m.name = name;
    if (position) m.position.set(...position);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const instance = (name, geom, mat, entries, id, distance, parent = group) => {
    const m = metadata(new THREE.InstancedMesh(geom, mat, entries.length), id, distance);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    entries.forEach((entry, i) => {
      dummy.position.set(...entry.p);
      dummy.rotation.set(...(entry.r || [0, 0, 0]));
      dummy.scale.set(...entry.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (entry.c !== undefined) m.setColorAt(i, color.set(entry.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    parent.add(m);
    return m;
  };
  const gold = material('#b4ad77', { map: paintedTexture('meadow') });
  const soil = material('#404b3b');
  const rock = material('#657277');
  const darkRock = material('#405560');
  const timberTexture = paintedTexture('wood');
  const wood = material('#96704f', { map: timberTexture });
  const woodLight = material('#be956c', { map: timberTexture });
  const woodDark = material('#302b26');
  const metal = material('#334a4c', { metalness: 0.38, roughness: 0.5 });
  const foliage = material('#ffffff');
  const stemMaterial = material('#6d7950');
  const petalMaterial = material('#e99092', { roughness: 0.67, emissive: '#6e292f', emissiveIntensity: 0.22 });
  const glow = material('#ffe4ad', { emissive: '#ffbf68', emissiveIntensity: 8, roughness: 0.2 });
  const pollenMaterial = material('#efbb54', { emissive: '#ffc76a', emissiveIntensity: 0.7 });

  // Quiet, layered terrain and a narrow ribbon of reflected evening sky.
  const groundPlane = geometry(new THREE.PlaneGeometry(1, 1));
  const floor = mesh('Meadow floor', groundPlane, soil, [0, 0, 17.7], [30, 35.4, 1]);
  floor.rotation.x = -Math.PI / 2;
  const meadow = mesh('Meadow undergrowth', groundPlane, gold, [0, 0.014, 13], [26, 25, 1]);
  meadow.rotation.x = -Math.PI / 2;
  if (quality !== 'photo') {
    // The laboratory has a physical terrain plinth; the photograph only needs
    // the top surfaces and avoids unnecessary grazing-angle box walls.
    mesh('Solid terrain plinth', box, soil, [0, -0.15, 17.7], [30, 0.24, 35.4]);
  }
  const streamPoints = [];
  for (let i = 0; i <= 38; i++) {
    const z = 0.7 + i * 0.53;
    streamPoints.push(new THREE.Vector3(1.9 + Math.sin(z * 0.31) * 0.7 + z * 0.058, 0.024, z));
  }
  const positions = [];
  for (let i = 0; i < streamPoints.length - 1; i++) {
    const a = streamPoints[i], b = streamPoints[i + 1];
    const w = 0.2 + i * 0.013;
    positions.push(a.x - w, a.y, a.z, a.x + w, a.y, a.z, b.x - w, b.y, b.z);
    positions.push(a.x + w, a.y, a.z, b.x + w, b.y, b.z, b.x - w, b.y, b.z);
  }
  const streamGeometry = geometry(new THREE.BufferGeometry());
  streamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  streamGeometry.computeVertexNormals();
  mesh('Silver thread · mountain stream', streamGeometry, material('#668f91', {
    metalness: 0.4, roughness: 0.23, emissive: '#254946', emissiveIntensity: 0.18,
    side: THREE.DoubleSide,
  }));

  const grasses = [], stones = [];
  const grassColors = ['#9b975f', '#bfad70', '#6d7c52', '#c4b17d', '#798462'];
  const grassCount = quality === 'low' ? 900 : 2300;
  for (let i = 0; i < grassCount; i++) {
    const z = range(0.8, 23), x = range(-12, 12);
    const creekX = 1.9 + Math.sin(z * 0.31) * 0.7 + z * 0.058;
    if (Math.abs(x - creekX) < 0.35 + z * 0.025) continue;
    if (Math.abs(x + 1.2) < 1.35 && z > 6.3 && z < 9.2) continue;
    const h = range(0.08, 0.35);
    grasses.push({ p: [x, h * 0.5, z], s: [range(0.012, 0.04), h, 0.014], r: [range(-0.15, 0.15), range(0, Math.PI), range(-0.2, 0.2)], c: grassColors[Math.floor(random() * grassColors.length)] });
  }
  instance('Fine golden meadow grasses', box, material('#ffffff', { side: THREE.DoubleSide }), grasses, 'flower', 3);
  // Dense near-camera tufts have curved, tapered blades rather than distant
  // hairline rectangles. They remain readable in the bottom of the photograph.
  const tuftVertices = [];
  const tuftBlade = (angle, height, bend, spread) => {
    const point = (t, edge) => {
      const width = (1 - t) * 0.037 * edge;
      const radial = spread + t * t * bend;
      return [Math.cos(angle) * radial + Math.sin(angle) * width, t * height, Math.sin(angle) * radial - Math.cos(angle) * width];
    };
    for (let s = 0; s < 5; s++) {
      const a = point(s / 5, -1), b = point(s / 5, 1), c = point((s + 1) / 5, -1), d = point((s + 1) / 5, 1);
      tuftVertices.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  };
  for (let b = 0; b < 7; b++) tuftBlade(b * 2.3999, range(0.68, 1), range(0.06, 0.28), range(0, 0.035));
  const tuftGeometry = geometry(new THREE.BufferGeometry());
  tuftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tuftVertices, 3));
  tuftGeometry.computeVertexNormals();
  const tufts = [];
  const tuftColors = ['#bbc187', '#d5c894', '#8b9d65', '#a1b078', '#778755'];
  const tuftCount = quality === 'low' ? 700 : 1600;
  for (let i = 0; i < tuftCount; i++) {
    const x = range(-4.8, 4.8), z = range(2.3, 10.2);
    const creekX = 1.9 + Math.sin(z * 0.31) * 0.7 + z * 0.058;
    if (Math.abs(x - creekX) < 0.35 + z * 0.025) continue;
    if (Math.abs(x + 1.2) < 1.2 && z > 6.35 && z < 9) continue;
    const height = range(0.26, 0.67) * (z < 4 ? 1.15 : 1);
    tufts.push({ p: [x, 0.018, z], s: [range(0.8, 1.6), height, range(0.8, 1.6)], r: [0, range(0, Math.PI * 2), 0], c: tuftColors[Math.floor(random() * tuftColors.length)] });
  }
  instance('Sculpted meadow grass tufts', tuftGeometry, material('#ffffff', { side: THREE.DoubleSide, roughness: 1 }), tufts, 'flower', 3);
  for (let i = 0; i < 130; i++) {
    const z = range(1.1, 20);
    const creekX = 1.9 + Math.sin(z * 0.31) * 0.7 + z * 0.058;
    const size = range(0.05, 0.2);
    stones.push({ p: [creekX + (random() > 0.5 ? 1 : -1) * (0.35 + z * 0.024 + range(0, 0.2)), size * 0.3, z], s: [size * 1.4, size * 0.7, size], r: [0, range(0, 6), 0], c: random() > 0.5 ? '#a6aaa0' : '#697776' });
  }
  instance('Streamside pebbles', ball, rock, stones, 'mountains', 24);
  const meadowStones = [];
  for (let i = 0; i < 90; i++) {
    const size = range(0.028, 0.14);
    meadowStones.push({ p: [range(-3.8, 3.8), size * 0.3, range(3.7, 9.1)], s: [size * 1.8, size * 0.7, size], r: [0, range(0, 6), 0], c: ['#93927c', '#a3a38c', '#777f6f'][i % 3] });
  }
  instance('Scattered warm meadow stones', ball, rock, meadowStones, 'flower', 3);

  // Main flowers face the lens. Several overlapping depth layers make actual
  // depth of field visible even when the nearest subject is selected.
  const flowerGroup = new THREE.Group();
  flowerGroup.name = 'Foreground · wild cosmos';
  metadata(flowerGroup, 'flower', 3);
  group.add(flowerGroup);
  const stems = [], petals = [], centers = [], leaves = [];
  const flowerColors = ['#eda2aa', '#f6b5ad', '#de7c88', '#efbfbb', '#d5777c'];
  const addFlower = (x, z, h, size, index) => {
    const sway = Math.sin(index * 2.17) * 0.07;
    stems.push({ p: [x - sway / 2, h / 2, z], s: [0.006, h, 0.006], r: [0, 0, -sway / h] });
    centers.push({ p: [x, h, z - 0.012], s: [size * 0.23, size * 0.22, size * 0.13] });
    const petalColor = flowerColors[index % flowerColors.length];
    for (let p = 0; p < 8; p++) {
      const angle = p * Math.PI / 4 + index * 0.11;
      petals.push({
        p: [x + Math.cos(angle) * size * 0.52, h + Math.sin(angle) * size * 0.52, z + Math.sin(p * 2) * size * 0.06],
        s: [size * 0.5, size * 0.26, size * 0.095], r: [0.12, 0, angle], c: petalColor,
      });
    }
    for (let l = 0; l < 3; l++) {
      const side = l % 2 ? -1 : 1;
      leaves.push({ p: [x + side * size * 0.31, h * (0.35 + l * 0.17), z], s: [size * 0.46, size * 0.1, size * 0.09], r: [0, 0.3, side * 0.55] });
    }
  };
  // A clear, isolated hero blossom lands almost exactly on the optical axis.
  addFlower(0.08, 3, 1.2, 0.11, 0);
  for (let i = 1; i < 46; i++) addFlower(range(-1.38, 1.45), range(2.5, 4.1), range(0.54, 1.26), range(0.072, 0.125), i);
  for (let i = 0; i < 32; i++) {
    const centerX = i % 2 ? 1.1 : -2.7;
    addFlower(centerX + range(-0.55, 0.55), range(4.5, 6.5), range(0.28, 0.6), range(0.036, 0.063), i + 47);
  }
  instance('Wildflower stems', cylinder, stemMaterial, stems, 'flower', 3, flowerGroup);
  instance('Coral cosmos petals', ball, petalMaterial, petals, 'flower', 3, flowerGroup);
  instance('Golden flower hearts', ball, pollenMaterial, centers, 'flower', 3, flowerGroup);
  instance('Fine wildflower leaves', ball, stemMaterial, leaves, 'flower', 3, flowerGroup);
  subjects.push({ id: 'flower', label: 'Wildflowers', distance: 3, object: flowerGroup });

  // A timber cabin, assembled in real dimensions. The front faces -Z, toward
  // the photographic camera; wood joints, roof seams and windows remain legible.
  const cabin = new THREE.Group();
  cabin.name = 'Midground · lantern cabin';
  cabin.position.set(-1.2, 0, 8);
  metadata(cabin, 'cabin', 8);
  group.add(cabin);
  const cabinMesh = (name, geom, mat, p, s) => mesh(name, geom, mat, p, s, cabin, 'cabin', 8);
  cabinMesh('Stone foundation', box, darkRock, [0, 0.14, 0], [2.12, 0.28, 1.86]);
  cabinMesh('Timber cabin core', box, wood, [0, 0.92, 0], [1.96, 1.48, 1.64]);
  for (let row = 0; row < 12; row++) {
    const y = 0.24 + row * 0.12;
    const tint = row % 3 === 0 ? woodLight : wood;
    cabinMesh(`Front timber course ${row + 1}`, box, tint, [0, y, -0.84], [2.07, 0.108, 0.07]);
    cabinMesh(`Right timber course ${row + 1}`, box, tint, [1.01, y, 0], [0.065, 0.108, 1.72]);
    cabinMesh(`Left timber course ${row + 1}`, box, tint, [-1.01, y, 0], [0.065, 0.108, 1.72]);
    for (const x of [-0.87, 0.87]) cabinMesh('Hand-forged board nail', ball, metal, [x, y + 0.022, -0.881], [0.005, 0.005, 0.003]);
    if (row % 2 === 0) cabinMesh('Staggered timber joint', box, woodDark, [row % 4 ? 0.34 : -0.31, y, -0.88], [0.007, 0.108, 0.008]);
  }
  for (const x of [-0.94, 0.94]) cabinMesh('Exposed corner beam', box, woodDark, [x, 0.94, -0.89], [0.09, 1.6, 0.11]);
  // A triangular gable keeps the building's silhouette recognizable.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-1, 0); gableShape.lineTo(1, 0); gableShape.lineTo(0, 0.64); gableShape.closePath();
  const gableGeometry = geometry(new THREE.ShapeGeometry(gableShape));
  const gable = cabinMesh('Front wooden gable', gableGeometry, material('#a4825d', { map: timberTexture, side: THREE.DoubleSide }), [0, 1.65, -0.866], [1, 1, 1]);
  gable.rotation.y = Math.PI;
  for (let row = 0; row < 5; row++) {
    const y = 1.7 + row * 0.11;
    const width = 2 * (1 - (y - 1.65) / 0.64);
    cabinMesh('Gable fine timber joint', box, woodDark, [0, y, -0.879], [Math.max(0.03, width), 0.008, 0.012]);
  }
  const roofAngle = Math.atan2(0.7, 1.18);
  for (const side of [-1, 1]) {
    const panel = cabinMesh(side < 0 ? 'West roof plane' : 'East roof plane', box, metal, [side * 0.57, 1.985, 0], [1.34, 0.065, 2.02]);
    panel.rotation.z = -side * roofAngle;
    for (let line = 0; line < 10; line++) {
      const rib = cabinMesh(`Standing seam ${side}-${line}`, box, material('#425b5b', { metalness: 0.48 }), [side * 0.57, 2.02, -0.91 + line * 0.202], [1.34, 0.027, 0.026]);
      rib.rotation.z = -side * roofAngle;
    }
  }
  cabinMesh('Roof ridge cap', cylinder, metal, [0, 2.34, 0], [0.045, 2.09, 0.045]).rotation.x = Math.PI / 2;
  cabinMesh('Chimney stack', box, material('#715c52'), [-0.5, 2.24, 0.28], [0.24, 0.83, 0.24]);
  cabinMesh('Chimney cap', box, darkRock, [-0.5, 2.68, 0.28], [0.33, 0.07, 0.33]);
  for (let row = 0; row < 5; row++) cabinMesh('Chimney mortar line', box, woodDark, [-0.5, 2.02 + row * 0.12, 0.153], [0.242, 0.012, 0.007]);
  const window = (x, y, z, side = false) => {
    const frame = cabinMesh('Deep window surround', box, woodDark, [x, y, z], side ? [0.1, 0.6, 0.57] : [0.57, 0.6, 0.1]);
    const light = cabinMesh('Honey-lit window glass', box, glow, [x + (side ? 0.056 : 0), y, z - (side ? 0 : 0.056)], side ? [0.018, 0.45, 0.42] : [0.42, 0.45, 0.018]);
    cabinMesh('Window center mullion', box, woodLight, [x + (side ? 0.07 : 0), y, z - (side ? 0 : 0.073)], side ? [0.021, 0.48, 0.028] : [0.028, 0.48, 0.021]);
    cabinMesh('Window crossbar', box, woodLight, [x + (side ? 0.07 : 0), y + 0.02, z - (side ? 0 : 0.073)], side ? [0.021, 0.027, 0.45] : [0.45, 0.027, 0.021]);
    return { frame, light };
  };
  window(-0.58, 1.04, -0.89); window(0.58, 1.04, -0.89); window(1.045, 1.02, 0.14, true);
  cabinMesh('Oak front door', box, woodDark, [0, 0.71, -0.896], [0.38, 1.07, 0.065]);
  for (let i = 0; i < 4; i++) cabinMesh('Door vertical plank', box, wood, [-0.135 + i * 0.09, 0.71, -0.94], [0.08, 1.02, 0.028]);
  cabinMesh('Brass door latch', ball, glow, [-0.12, 0.76, -0.971], [0.018, 0.018, 0.018]);
  cabinMesh('Porch deck', box, woodLight, [0, 0.185, -1.1], [2.2, 0.08, 0.6]);
  for (let i = 0; i < 11; i++) cabinMesh('Porch deck joint', box, woodDark, [-1 + i * 0.2, 0.229, -1.1], [0.008, 0.01, 0.57]);
  cabinMesh('Lower entrance step', box, rock, [0, 0.05, -1.59], [0.73, 0.1, 0.3]);
  cabinMesh('Upper entrance step', box, woodLight, [0, 0.12, -1.41], [0.67, 0.1, 0.24]);
  for (const x of [-0.93, 0.93]) {
    cabinMesh('Porch post', box, woodDark, [x, 0.55, -1.25], [0.057, 0.72, 0.057]);
    cabinMesh('Porch lantern bracket', box, metal, [x, 1.37, -0.99], [0.025, 0.07, 0.21]);
    cabinMesh('Porch lantern light', ball, glow, [x, 1.29, -1.07], [0.043, 0.066, 0.043]);
    cabinMesh('Porch lantern cap', box, metal, [x, 1.37, -1.07], [0.1, 0.025, 0.1]);
  }
  subjects.push({ id: 'cabin', label: 'Alpine cabin', distance: 8, object: cabin });

  // Individual tiered crowns create a readable pine silhouette with a very
  // small triangle budget. Coloured tiers preserve detail in a dark exposure.
  const trunks = [], crowns = [], needleSprigs = [], branches = [];
  const trees = [
    [-3.7, 7.8, 3.4], [1.8, 9.8, 3.6], [-4.9, 10.5, 4.6], [3.6, 13.4, 4.2],
    [-2.9, 13.8, 4.4], [-6.3, 15.7, 5.4], [6.4, 15, 4.3], [0.8, 15.8, 3.9],
    [-7.5, 20, 5.8], [8.8, 22, 6.1], [-4.9, 21.5, 4.8], [4.8, 19.5, 4.5],
  ];
  for (let t = 0; t < trees.length; t++) {
    const [x, z, h] = trees[t];
    trunks.push({ p: [x, h * 0.34, z], s: [h * 0.025, h * 0.68, h * 0.025] });
    const tiers = quality === 'low' ? 5 : 7;
    for (let n = 0; n < tiers; n++) {
      const f = n / tiers;
      const radius = h * (0.25 - f * 0.2);
      crowns.push({ p: [x, h * (0.37 + f * 0.55), z], s: [radius, h * (0.35 - f * 0.14), radius], r: [0, t * 0.41 + n * 0.28, 0], c: ['#426957', '#527a5f', '#598566', '#688f6d'][n % 4] });
      for (let b = 0; b < 9; b++) {
        const angle = b * Math.PI * 2 / 9 + n * 0.37 + t;
        const length = radius * range(0.74, 1.07);
        const y = h * (0.27 + f * 0.63);
        needleSprigs.push({ p: [x + Math.sin(angle) * length * 0.72, y, z + Math.cos(angle) * length * 0.72], s: [length * 0.19, length * 0.9, length * 0.19], r: [Math.cos(angle) * 0.88, 0, -Math.sin(angle) * 0.88], c: ['#406b55', '#73966f', '#5f875f'][b % 3] });
        branches.push({ p: [x + Math.sin(angle) * length * 0.5, y - length * 0.09, z + Math.cos(angle) * length * 0.5], s: [0.013, length, 0.013], r: [Math.cos(angle) * 1.32, 0, -Math.sin(angle) * 1.32] });
      }
    }
  }
  instance('Pine trunks', cylinder, woodDark, trunks, 'cabin', 8);
  instance('Layered alpine pine needles', leafCone, foliage, crowns, 'cabin', 8);
  instance('Asymmetric fine pine boughs', leafCone, foliage, needleSprigs, 'cabin', 8);
  instance('Visible radial pine branches', cylinder, woodDark, branches, 'cabin', 8);

  // Faceted mountain ranges carry vertex colours instead of image textures.
  // Each ridge is a solid, irregular silhouette rather than a stack of cones.
  const mountains = new THREE.Group();
  mountains.name = 'Background · dusk mountain range';
  metadata(mountains, 'mountains', 24);
  group.add(mountains);
  const ridge = (name, peaks, z, baseColor, snow = false) => {
    const vertices = [], colors = [];
    const base = new THREE.Color(baseColor);
    const triangle = (a, b, c, tint) => {
      vertices.push(...a, ...b, ...c);
      const shade = base.clone().multiplyScalar(tint);
      for (let i = 0; i < 3; i++) colors.push(shade.r, shade.g, shade.b);
    };
    // The silhouette is also the crest of a solid sculpted landform. A broad
    // front foot and a faceted back slope make it substantial on the bench.
    const frontZ = z - (z > 30 ? 3.3 : 1.7);
    const backZ = Math.min(35.3, z + 5.2);
    for (let i = 0; i < peaks.length - 1; i++) {
      const a = peaks[i], b = peaks[i + 1];
      const midX = (a[0] + b[0]) / 2, midY = Math.min(a[1], b[1]) * 0.31;
      const middle = [midX, midY, z - range(0.45, 1.8)];
      triangle([a[0], a[1], z], [b[0], b[1], z], middle, range(0.93, 1.27));
      triangle([a[0], a[1], z], middle, [a[0], -0.1, frontZ], range(0.78, 1.1));
      triangle([b[0], b[1], z], [b[0], -0.1, frontZ], middle, range(0.62, 0.92));
      triangle([a[0], -0.1, frontZ], middle, [b[0], -0.1, frontZ], range(0.63, 0.91));
      const rearMiddle = [midX, midY * 1.6, (z + backZ) / 2];
      triangle([a[0], a[1], z], rearMiddle, [b[0], b[1], z], range(0.83, 1.05));
      triangle([a[0], a[1], z], [a[0], -0.1, backZ], rearMiddle, range(0.75, 1.04));
      triangle([b[0], b[1], z], rearMiddle, [b[0], -0.1, backZ], range(0.62, 0.85));
      triangle([a[0], -0.1, backZ], [b[0], -0.1, backZ], rearMiddle, range(0.66, 0.93));
      triangle([a[0], -0.1, frontZ], [b[0], -0.1, frontZ], [a[0], -0.1, backZ], 0.64);
      triangle([a[0], -0.1, backZ], [b[0], -0.1, frontZ], [b[0], -0.1, backZ], 0.64);
      if (i === 0) triangle([a[0], a[1], z], [a[0], -0.1, frontZ], [a[0], -0.1, backZ], 0.79);
      if (i === peaks.length - 2) triangle([b[0], b[1], z], [b[0], -0.1, backZ], [b[0], -0.1, frontZ], 0.82);
    }
    const geom = geometry(new THREE.BufferGeometry());
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    mesh(name, geom, material('#ffffff', { vertexColors: true, flatShading: true, side: THREE.DoubleSide }), null, null, mountains, 'mountains', 24);
    if (snow) {
      const snowVertices = [];
      for (let i = 1; i < peaks.length - 1; i++) {
        const [x, h] = peaks[i];
        if (h < 5.9 || h < peaks[i - 1][1] || h < peaks[i + 1][1]) continue;
        snowVertices.push(x, h + 0.008, z - 0.014, x - 0.69, h - 0.86, z - 0.035, x - 0.08, h - 0.6, z - 0.08);
        snowVertices.push(x, h + 0.008, z - 0.014, x - 0.08, h - 0.6, z - 0.08, x + 0.8, h - 0.96, z + 0.12);
      }
      const sg = geometry(new THREE.BufferGeometry());
      sg.setAttribute('position', new THREE.Float32BufferAttribute(snowVertices, 3));
      sg.computeVertexNormals();
      mesh(`${name} · sunlit snow`, sg, material('#b9c9c4', { side: THREE.DoubleSide, roughness: 1, emissive: '#293b3b', emissiveIntensity: 0.25 }), null, null, mountains, 'mountains', 24);
    }
  };
  ridge('Distant blue silhouette', [[-20, 1], [-15, 5.4], [-12, 4], [-8, 8.2], [-5, 5.7], [-1, 8.6], [3, 5.3], [7, 7.5], [11, 3.5], [16, 6.7], [21, 1]], 34, '#416a77');
  ridge('Glacier ridge', [[-17, 0.4], [-12, 4.3], [-9, 3.5], [-5.3, 7.6], [-2.2, 4.8], [1, 8], [4, 4.5], [7, 6.6], [10, 3.2], [15, 0.3]], 27, '#315e66', true);
  ridge('Foreground granite faces', [[-16, 0], [-11, 2.8], [-8, 4.7], [-5, 3], [-1.5, 5.8], [1.7, 3], [5, 5.7], [8, 3.9], [12, 1.9], [16, 0]], 24, '#345350');
  subjects.push({ id: 'mountains', label: 'Mountain ridge', distance: 24, object: mountains });

  // Discrete emissive highlights at all three distances turn into optical
  // bokeh circles in the photograph. They also give the bench miniature life.
  const lights = [];
  for (let i = 0; i < 24; i++) {
    const z = range(2.7, 4.3);
    lights.push({ p: [range(-1.65, 1.5), range(0.35, 1.15), z], s: [0.014, 0.014, 0.014], c: '#ffd7a0' });
  }
  instance('Foreground firefly lights', ball, glow, lights, 'flower', 3);
  const farLights = [];
  for (let i = 0; i < 32; i++) {
    const z = range(6.7, 17);
    farLights.push({ p: [range(-4.8, 4.8), range(0.18, 1.3), z], s: [0.035, 0.035, 0.035], c: i % 4 ? '#ffcf83' : '#a6e0d5' });
  }
  instance('Meadow lantern glints', ball, glow, farLights, 'cabin', 8);
  const horizonLights = [];
  for (let i = 0; i < 22; i++) horizonLights.push({ p: [range(-10, 10), range(0.25, 1.6), range(21.5, 25)], s: [0.048, 0.048, 0.048], c: '#ffd7a0' });
  instance('Distant valley lights', ball, glow, horizonLights, 'mountains', 24);

  return {
    group,
    subjects,
    animate(time) {
      // The specimen stays still while photographing it; a subtle glow pulse
      // is sufficient to make the larger optical-bench view feel alive.
      pollenMaterial.emissiveIntensity = 0.68 + Math.sin(time * 0.7) * 0.04;
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
