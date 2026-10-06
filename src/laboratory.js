import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLandscape } from './landscape.js';
import { calculateOptics } from './optics.js';

const LENS_X = -3.5;
const SENSOR_X = -5.5;
const AXIS_Y = 1.65;
const DISTANCE_SCALE = 0.25;
const COLORS = { flower: 0x74daca, cabin: 0xd8ba7e, mountains: 0xb0b9dc };
const clamp = THREE.MathUtils.clamp;

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function label(text, color = '#a3b5b5', width = 2.05) {
  const texture = canvasTexture(640, 112, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(9, 17, 20, .78)';
    ctx.roundRect(8, 17, w - 16, h - 34, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(139, 177, 174, .13)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '500 40px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 1);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.95 }));
  sprite.scale.set(width, width * 112 / 640, 1);
  sprite.userData.label = true;
  return sprite;
}

function metal(color = 0x3e4c50, roughness = 0.29) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.83, roughness });
}

function ring(radius, tube, material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 48), material);
  mesh.rotation.y = Math.PI / 2;
  mesh.castShadow = true;
  return mesh;
}

function cylinder(radius, length, material, segments = 48, openEnded = false) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments, 1, openEnded), material);
  mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function glassElement(radius, thickness, curve) {
  const profile = [];
  const resolution = 14;
  for (let i = 0; i <= resolution; i++) {
    const r = radius * i / resolution;
    profile.push(new THREE.Vector2(r, thickness / 2 + curve * (1 - (r / radius) ** 2)));
  }
  for (let i = resolution; i >= 0; i--) {
    const r = radius * i / resolution;
    profile.push(new THREE.Vector2(r, -thickness / 2 - curve * (1 - (r / radius) ** 2)));
  }
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), new THREE.MeshPhysicalMaterial({
    color: 0x87c2c9, metalness: 0, roughness: 0.06,
    transmission: 0.64, thickness: 0.14, ior: 1.48,
    transparent: true, opacity: 0.7, side: THREE.DoubleSide,
    clearcoat: 1, clearcoatRoughness: 0.07,
    attenuationColor: new THREE.Color(0x82c6c7), attenuationDistance: 2,
  }));
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

function line(points, color, opacity = 1, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => p.isVector3 ? p : new THREE.Vector3(...p)));
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.11, gapSize: 0.085, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const result = new THREE.Line(geometry, material);
  if (dashed) result.computeLineDistances();
  return result;
}

function releaseObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse(obj => {
    if (obj.geometry) geometries.add(obj.geometry);
    for (const material of Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(item => item.dispose());
  materials.forEach(item => item.dispose());
  textures.forEach(item => item.dispose());
}

/** A physical, inspectable optical bench. Photo-space distances remain in meters. */
export function createLaboratory(canvas, { settings = {}, onFocus, onInspectChange } = {}) {
  let current = { focusDistance: 8, aperture: 5.6, focalLength: 50, ...settings };
  let options = { exploded: true, rays: false, focusPlane: true, labels: true };
  let optics = calculateOptics(current);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1518, 0.026);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x0c1518, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.055);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.42;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(-6.2, 6.0, 10.7);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-1.35, 1.42, 0);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.065;
  controls.minDistance = 6.8;
  controls.maxDistance = 23;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minPolarAngle = 0.25;
  controls.enablePan = false;
  controls.rotateSpeed = 0.58;
  controls.zoomSpeed = 0.8;
  let viewTween = null;
  let disposed = false;
  let frame = 0;
  let frames = 0;
  let renderFrames = 0;
  let needsRender = true;
  let overviewFit = 1;
  let lastRayKey = '';

  scene.add(new THREE.HemisphereLight(0xc1deef, 0x263c32, .85));
  const key = new THREE.DirectionalLight(0xdfeced, 2.15);
  key.position.set(-1, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -10; key.shadow.camera.right = 10;
  key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
  key.shadow.normalBias = 0.018;
  key.shadow.bias = -0.00025;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5cbfb7, 1.6);
  rim.position.set(2, 5, -7);
  scene.add(rim);
  const amberLight = new THREE.PointLight(0xd1b283, 21, 18, 2);
  amberLight.position.set(-5, 4, 1);
  scene.add(amberLight);

  const exhibit = new THREE.Group();
  scene.add(exhibit);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.34, 4.6), new THREE.MeshStandardMaterial({ color: 0x142126, metalness: 0.32, roughness: 0.48 }));
  bench.position.set(-.9, 0.28, 0);
  bench.castShadow = true;
  bench.receiveShadow = true;
  exhibit.add(bench);
  const benchBottom = new THREE.Mesh(new THREE.BoxGeometry(12.7, 0.08, 4.34), metal(0x101e22, 0.55));
  benchBottom.position.set(-.9, 0.065, 0);
  exhibit.add(benchBottom);
  const inset = new THREE.Mesh(new THREE.PlaneGeometry(12.84, 4.44), new THREE.MeshStandardMaterial({ color: 0x17272b, roughness: 0.78, metalness: 0.2 }));
  inset.rotation.x = -Math.PI / 2;
  inset.position.set(-.9, 0.453, 0);
  inset.receiveShadow = true;
  exhibit.add(inset);
  const border = line([[-7.25,.461,-2.15],[5.45,.461,-2.15],[5.45,.461,2.15],[-7.25,.461,2.15],[-7.25,.461,-2.15]],0x526562,.6);
  exhibit.add(border);
  for (let x = -6.7; x < 5.3; x += 0.5) {
    exhibit.add(line([[x,.463,-1.87],[x,.463,1.87]],0x607876,.09));
    exhibit.add(line([[x,.468,1.96],[x,.468,2.04]],0xb6a985,.55));
  }
  for (let z = -1.5; z <= 1.5; z += 0.5) exhibit.add(line([[-6.95,.463,z],[5.2,.463,z]],0x607876,.09));
  exhibit.add(line([[-6.9,.475,0],[5.2,.475,0]],0xc4ac7f,.52,true));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.ShadowMaterial({ opacity: 0.26 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.025;
  ground.receiveShadow = true;
  scene.add(ground);
  const exhibitBadge = label('OPTICA / OPTICAL BENCH', '#a9b7b2', 3.2);
  exhibitBadge.position.set(-1.9, 0.62, 2.17);
  exhibit.add(exhibitBadge);

  const darkMetal = metal(0x253033, 0.28);
  const silver = metal(0x86979b, 0.18);
  const brass = metal(0xa59369, 0.27);
  const black = metal(0x111a1e, 0.37);
  const lens = new THREE.Group();
  lens.position.y = AXIS_Y;
  lens.scale.set(1,1.22,1.22);
  exhibit.add(lens);
  const components = [];
  const addComponent = (object, assembled, exploded) => {
    lens.add(object);
    object.position.x = options.exploded ? exploded : assembled;
    components.push({ object, assembled, exploded });
    return object;
  };

  const engraving = canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#182225'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c4c6bd'; ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const x = i * w / 40;
      ctx.beginPath(); ctx.moveTo(x, 82); ctx.lineTo(x, i % 5 === 0 ? 135 : 110); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#d3d0bd'; ctx.font = '24px monospace';
    ['∞', '24', '8', '3', '1.5', 'OPTICA', '50mm', '1:1.4'].forEach((text, i) => ctx.fillText(text, 64 + i * 128, 174));
    ctx.fillStyle = '#bdac7e'; ctx.fillRect(0, 30, w, 4);
  });
  const barrel = new THREE.Group();
  const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaead, map: engraving, metalness: .8, roughness: .32 });
  // A real open bore keeps the iris and glass visible when assembled.
  barrel.add(cylinder(.81, .54, barrelMaterial, 48, true));
  const boreMaterial=black.clone();
  boreMaterial.side=THREE.BackSide;
  barrel.add(cylinder(.59, .54, boreMaterial, 48, true));
  for(const side of [-1,1]) {
    const face=new THREE.Mesh(new THREE.RingGeometry(.59,.81,48),black);
    face.rotation.y=side*Math.PI/2;
    face.position.x=side*.27;
    face.castShadow=true;
    barrel.add(face);
  }
  for (let i = 0; i < 30; i++) {
    const angle = i * Math.PI * 2 / 30;
    const groove = new THREE.Mesh(new THREE.BoxGeometry(.30, .032, .045), black);
    groove.position.set(-.11, Math.cos(angle) * .811, Math.sin(angle) * .811);
    groove.rotation.x = angle;
    barrel.add(groove);
  }
  for (const x of [-.255, .255]) {
    const detail = ring(.807, .016, brass); detail.position.x = x; barrel.add(detail);
  }
  addComponent(barrel, LENS_X - .33, LENS_X - 1.49);

  const front = new THREE.Group();
  front.add(ring(.72,.07,darkMetal));
  front.add(ring(.646,.025,silver));
  front.add(ring(.76,.011,brass));
  front.add(glassElement(.62,.065,.11));
  addComponent(front, LENS_X, LENS_X);
  const midGlass = new THREE.Group();
  midGlass.add(glassElement(.55,.07,.075));
  midGlass.add(ring(.553,.013,silver));
  addComponent(midGlass, LENS_X - .15, LENS_X - .50);
  const rearGlass = new THREE.Group();
  rearGlass.add(glassElement(.46,.05,.095));
  rearGlass.add(ring(.47,.018,darkMetal));
  addComponent(rearGlass, LENS_X - .48, LENS_X - 1.1);
  const rearMount = new THREE.Group();
  rearMount.add(ring(.65,.055,silver));
  rearMount.add(ring(.72,.025,black));
  for (let i=0;i<6;i++) {
    const screw = new THREE.Mesh(new THREE.SphereGeometry(.026,10,6),brass);
    const a=i*Math.PI/3; screw.position.set(-.055,Math.cos(a)*.65,Math.sin(a)*.65); rearMount.add(screw);
  }
  addComponent(rearMount, LENS_X - .67, LENS_X - 1.85);

  const apertureAssembly = new THREE.Group();
  apertureAssembly.add(ring(.60,.046,brass));
  apertureAssembly.add(ring(.65,.025,darkMetal));
  const blades = [];
  for(let i=0;i<9;i++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3));
    geometry.setIndex([0,1,2,0,2,3]);
    const blade=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:i%2?0x495b60:0x3a4d52,metalness:.92,roughness:.3,side:THREE.DoubleSide}));
    blade.position.x = .009 * i;
    apertureAssembly.add(blade); blades.push(blade);
  }
  addComponent(apertureAssembly,LENS_X-.30,LENS_X-.83);
  // The actual pupil diameter is f/N. The scene uses one constant scale
  // against the largest supported 85 mm f/1.4 opening.
  let bladeRadius = -1;
  let bladeTarget = .49 * optics.apertureDiameter / (.085 / 1.4);
  function updateBlades(radius = bladeRadius) {
    bladeTarget = clamp(.49 * optics.apertureDiameter / (.085 / 1.4), .009, .49);
    const inner = radius < 0 ? bladeTarget : radius;
    if (Math.abs(inner-bladeRadius)<.00001) return;
    bladeRadius=inner;
    blades.forEach((blade,i)=>{
      const a=i*Math.PI*2/9;
      const points=[[inner,a-.17], [.593,a-.35], [.593,a+.49], [inner,a+.53]];
      const position=blade.geometry.attributes.position;
      points.forEach(([r,t],j)=>position.setXYZ(j,0,Math.cos(t)*r,Math.sin(t)*r));
      position.needsUpdate=true; blade.geometry.computeVertexNormals();
    });
  }
  updateBlades();

  const cradle=new THREE.Group();
  const base=new THREE.Mesh(new THREE.BoxGeometry(1.13,.12,1.18),darkMetal);
  base.position.set(LENS_X-.2,.51,0); cradle.add(base);
  for(const z of [-.40,.40]) {
    const post=new THREE.Mesh(new THREE.BoxGeometry(.15,.55,.14),darkMetal);
    post.position.set(LENS_X-.22,.82,z); cradle.add(post);
    const bolt=new THREE.Mesh(new THREE.SphereGeometry(.042,12,8),brass);
    bolt.position.set(LENS_X-.12,.65,z); cradle.add(bolt);
  }
  exhibit.add(cradle);
  const lensLabel=label('01 / COMPOUND LENS', '#9fbdc0', 2.5);
  lensLabel.position.set(-4.75,3.14,-.4); exhibit.add(lensLabel);
  const lensStem=line([[-4.7,2.95,-.4],[-4.7,2.7,-.4]],0x80a19f,.35); exhibit.add(lensStem);

  const sensor=new THREE.Group();
  sensor.position.set(SENSOR_X,AXIS_Y,0);
  const board=new THREE.Mesh(new THREE.BoxGeometry(.075,1.34,1.75),metal(0x192627,.42));
  sensor.add(board);
  const detector=new THREE.Mesh(new THREE.PlaneGeometry(1.35,.90),new THREE.MeshPhysicalMaterial({color:0x273c46,metalness:.4,roughness:.22,clearcoat:1,side:THREE.DoubleSide}));
  detector.rotation.y=Math.PI/2; detector.position.x=.05; sensor.add(detector);
  const framePoints=[[.06,-.51,-.75],[.06,.51,-.75],[.06,.51,.75],[.06,-.51,.75],[.06,-.51,-.75]];
  sensor.add(line(framePoints,0xa89669,.9));
  for(const y of [-.61,.61]) for(const z of [-.78,.78]){
    const screw=new THREE.Mesh(new THREE.SphereGeometry(.034,12,8),silver); screw.position.set(.07,y,z);sensor.add(screw);
  }
  const sensorPost=new THREE.Mesh(new THREE.BoxGeometry(.13,.6,.2),darkMetal);
  sensorPost.position.set(0,-.93,0);sensor.add(sensorPost);
  exhibit.add(sensor);
  const sensorLabel=label('36 × 24 mm SENSOR','#aebbb6',2.2);
  sensorLabel.position.set(-5.95,.81,1.65);exhibit.add(sensorLabel);

  const landscape = createLandscape();
  landscape.group.rotation.y=Math.PI/2;
  landscape.group.scale.set(.108,.33,.25);
  landscape.group.position.set(LENS_X,.48,0);
  exhibit.add(landscape.group);
  scene.updateMatrixWorld(true);
  const subjects=landscape.subjects || [];
  const subjectLabels=new THREE.Group();
  exhibit.add(subjectLabels);
  const subjectInfo=[{id:'flower',distance:3,text:'PETALS  /  3 m',height:2.52},{id:'cabin',distance:8,text:'CABIN  /  8 m',height:3.18},{id:'mountains',distance:24,text:'RIDGE  /  24 m',height:3.45}];
  subjectInfo.filter(subject=>subject.id==='mountains').forEach(subject=>{
    const sprite=label(subject.text,'#adb9d3',2.0);
    sprite.position.set(LENS_X+subject.distance*DISTANCE_SCALE,3.72,0);
    subjectLabels.add(sprite);
  });

  const focusPlane=new THREE.Group();
  const planeMaterial=new THREE.MeshBasicMaterial({color:0x80d6c4,transparent:true,opacity:.075,side:THREE.DoubleSide,depthWrite:false});
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(3.8,2.8),planeMaterial);
  plane.rotation.y=Math.PI/2;
  plane.position.y=1.94;
  focusPlane.add(plane);
  const focusFrame=line([[0,.54,-1.9],[0,3.34,-1.9],[0,3.34,1.9],[0,.54,1.9],[0,.54,-1.9]],0x8bbcab,.48);
  focusPlane.add(focusFrame);
  for(const z of [-1.9,1.9]) focusPlane.add(line([[0,.55,z],[0,1.03,z]],0xc3b68b,.85));
  focusPlane.add(line([[0,AXIS_Y,-1.9],[0,AXIS_Y,1.9]],0x76bcaf,.22,true));
  const handle=new THREE.Mesh(new THREE.SphereGeometry(.088,18,12),new THREE.MeshStandardMaterial({color:0xe2c58c,metalness:.7,roughness:.2,emissive:0x746344,emissiveIntensity:.3}));
  handle.position.set(0,3.46,1.9);focusPlane.add(handle);
  const handleHit=new THREE.Mesh(new THREE.SphereGeometry(.23,10,8),new THREE.MeshBasicMaterial({visible:false}));
  handleHit.position.copy(handle.position);focusPlane.add(handleHit);
  for(const direction of [-1,1]) {
    const arrow=new THREE.ArrowHelper(new THREE.Vector3(direction,0,0),new THREE.Vector3(direction*.12,3.46,1.9),.44,0xc8b487,.13,.095);
    focusPlane.add(arrow);
  }
  const focusLabel=label('FOCUS / DRAG', '#a2c7b5',1.85);
  focusLabel.position.set(0,3.81,1.9);focusPlane.add(focusLabel);
  focusPlane.traverse(obj=>obj.userData.focusPlane=true);
  focusPlane.position.x=LENS_X+current.focusDistance*DISTANCE_SCALE;
  exhibit.add(focusPlane);

  const rays=new THREE.Group();
  exhibit.add(rays);
  const opticalAxis=line([[SENSOR_X-.23,AXIS_Y,0],[3.8,AXIS_Y,0]],0xc0b78c,.20,true);
  rays.add(opticalAxis);
  const effectivePlane=line([[LENS_X,AXIS_Y-.82,0],[LENS_X,AXIS_Y+.82,0]],0xc2ad7f,.5,true);
  rays.add(effectivePlane);
  let rayGroup=new THREE.Group();rays.add(rayGroup);
  let rayBundles=[];
  function rebuildRays() {
    const signature=[current.aperture,current.focalLength,current.focusDistance].join('/');
    if(signature===lastRayKey)return;
    lastRayKey=signature;
    rays.remove(rayGroup);releaseObject(rayGroup);
    rayGroup=new THREE.Group();rays.add(rayGroup);
    const f=current.focalLength/1000;
    const v=optics.imageDistance;
    // One constant radius scale maps the actual f/N pupil to the exhibit iris.
    // Normalize the image-space axis by v to keep the sensor on its mount:
    // rays at that sensor then have exactly A * |1 - v/vu| defocus in meters.
    const pupil=.49*1.22*optics.apertureDiameter/(.085/1.4);
    rayBundles=[];
    subjectInfo.forEach((subject,index)=>{
      const x=LENS_X+subject.distance*DISTANCE_SCALE;
      const sourceY=AXIS_Y+.31+index*.21;
      const sourceZ=index===0?.48:index===1?-.12:-.5;
      const vu=f*subject.distance/(subject.distance-f);
      const convergenceX=LENS_X-(LENS_X-SENSOR_X)*vu/v;
      rayBundles.push({id:subject.id,distance:subject.distance,subjectImageDistance:vu,pupilRadius:pupil,convergenceX,
        sensorCircleMeters:optics.apertureDiameter*Math.abs(1-v/vu),sensorCircleScene:2*pupil*Math.abs(1-v/vu)});
      const imageY=AXIS_Y-(sourceY-AXIS_Y)*.21;
      const imageZ=-sourceZ*.21;
      const color=COLORS[subject.id];
      [-1,0,1].forEach(rayIndex=>{
        const lensY=AXIS_Y+rayIndex*pupil;
        const lensZ=0;
        const source=new THREE.Vector3(x,sourceY,sourceZ);
        const through=new THREE.Vector3(LENS_X,lensY,lensZ);
        const focus=new THREE.Vector3(convergenceX,imageY,imageZ);
        const endX=SENSOR_X-.22;
        const ratio=(endX-LENS_X)/(convergenceX-LENS_X);
        const end=new THREE.Vector3(endX,lensY+(imageY-lensY)*ratio,lensZ+(imageZ-lensZ)*ratio);
        const path=line([source,through,end],color,rayIndex===0?.28:.68);
        rayGroup.add(path);
        if(rayIndex===0) {
          const marker=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
          marker.position.copy(focus);rayGroup.add(marker);
        }
      });
    });
  }
  rebuildRays();

  const raycaster=new THREE.Raycaster();
  raycaster.params.Line.threshold=.035;
  const pointer=new THREE.Vector2();
  let gesture=null;
  let dragging=false;
  let lastPickedSubject=null;
  const setPointer=event=>{
    const rect=canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
  };
  const pickFocus=event=>{
    if(!options.focusPlane)return false;
    setPointer(event);
    // The brass handle and thin frame move focus. The transparent surface
    // leaves orbit gestures and subject clicks available behind the plane.
    return raycaster.intersectObjects([handle,handleHit,focusFrame],false).length>0;
  };
  function pointerDown(event) {
    if(event.button!==0)return;
    viewTween=null;
    gesture={x:event.clientX,y:event.clientY,focus:pickFocus(event),startFocus:current.focusDistance};
    if(gesture.focus) {
      controls.enabled=false;
      const rect=canvas.getBoundingClientRect();
      const origin=new THREE.Vector3(focusPlane.position.x,AXIS_Y,0).project(camera);
      const along=new THREE.Vector3(focusPlane.position.x+1,AXIS_Y,0).project(camera);
      const axis=new THREE.Vector2((along.x-origin.x)*rect.width/2,-(along.y-origin.y)*rect.height/2);
      gesture.axis=axis;
      canvas.setPointerCapture?.(event.pointerId);
      event.stopPropagation();
    }
  }
  function pointerMove(event) {
    if(gesture?.focus) {
      const movement=new THREE.Vector2(event.clientX-gesture.x,event.clientY-gesture.y);
      if(movement.length()>3)dragging=true;
      if(dragging) {
        const worldDelta=movement.dot(gesture.axis)/Math.max(gesture.axis.lengthSq(),1);
        const distance=clamp(gesture.startFocus+worldDelta/DISTANCE_SCALE,1,30);
        current={...current,focusDistance:distance};
        optics=calculateOptics(current);
        focusPlane.position.x=LENS_X+distance*DISTANCE_SCALE;
        rebuildRays();
        onFocus?.(Number(distance.toFixed(2)),null);
        canvas.style.cursor='ew-resize';
      }
      return;
    }
    if(!gesture)canvas.style.cursor=pickFocus(event)?'ew-resize':'grab';
  }
  function pointerUp(event) {
    if(!gesture)return;
    const moved=Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y);
    if(!dragging&&moved<5) {
      setPointer(event);
      const hits=raycaster.intersectObject(landscape.group,true);
      for(const hit of hits) {
        let object=hit.object;
        let found=null;
        while(object&&object!==landscape.group.parent) {
          if(object.userData?.subjectId) { found={id:object.userData.subjectId,distance:object.userData.distance || object.userData.focusDistance};break; }
          const subject=subjects.find(item=>item.object===object||item.mesh===object||item.group===object);
          if(subject){found=subject;break;}
          object=object.parent;
        }
        if(found) {
          const info=subjectInfo.find(item=>item.id===found.id);
          const surfacePoint=landscape.group.worldToLocal(hit.point.clone());
          const distance=clamp(surfacePoint.z,1,30);
          lastPickedSubject={id:found.id,distance,surfacePoint:surfacePoint.toArray()};
          if(distance){current={...current,focusDistance:distance};optics=calculateOptics(current);onFocus?.(distance,Math.abs(distance-(info?.distance||distance))<.5?found.id:null);rebuildRays();}
          break;
        }
      }
    }
    gesture=null;dragging=false;controls.enabled=true;canvas.style.cursor='grab';
    if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerdown',pointerDown,true);
  canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',pointerUp);
  canvas.addEventListener('pointercancel',pointerUp);
  canvas.style.touchAction='none';
  canvas.style.cursor='grab';
  const onControlStart=()=>{viewTween=null;needsRender=true;onInspectChange?.(true);};
  const onControlEnd=()=>onInspectChange?.(false);
  const onControlChange=()=>{needsRender=true;};
  controls.addEventListener('start',onControlStart);
  controls.addEventListener('end',onControlEnd);
  controls.addEventListener('change',onControlChange);

  function resize() {
    if(disposed)return;
    const width=Math.max(canvas.clientWidth,10);
    const height=Math.max(canvas.clientHeight,10);
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    // Preserve the user's orbit direction and target while widening the
    // view enough to fit the whole exhibit in a narrow canvas.
    const nextFit=clamp(1.65/camera.aspect,1,2.5);
    if(Math.abs(nextFit-overviewFit)>.0001) {
      const ratio=nextFit/overviewFit;
      camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
      if(viewTween)viewTween.position.sub(viewTween.target).multiplyScalar(ratio).add(viewTween.target);
      overviewFit=nextFit;
    }
    controls.maxDistance=23*overviewFit;
    camera.updateProjectionMatrix();
    needsRender=true;
  }
  const observer=new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  let lastTime=performance.now();
  let explosion=options.exploded?1:0;
  const animate=time=>{
    if(disposed)return;
    frame=requestAnimationFrame(animate);
    const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;frames++;
    const smoothing=reducedMotion?1:1-Math.exp(-dt*8);
    const mechanicalMotion = Math.abs(bladeRadius-bladeTarget)>.0001 || Math.abs(explosion-(options.exploded?1:0))>.0001;
    const planeMotion = Math.abs(focusPlane.position.x-(LENS_X+current.focusDistance*DISTANCE_SCALE))>.0002;
    const moving = mechanicalMotion || planeMotion || !!viewTween || dragging;
    updateBlades(THREE.MathUtils.lerp(bladeRadius,bladeTarget,smoothing));
    explosion=THREE.MathUtils.lerp(explosion,options.exploded?1:0,smoothing);
    components.forEach(part=>part.object.position.x=THREE.MathUtils.lerp(part.assembled,part.exploded,explosion));
    if(!dragging)focusPlane.position.x=THREE.MathUtils.lerp(focusPlane.position.x,LENS_X+current.focusDistance*DISTANCE_SCALE,smoothing);
    focusPlane.visible=options.focusPlane;
    rays.visible=options.rays;
    subjectLabels.visible=options.labels;
    lensLabel.visible=options.labels;lensStem.visible=options.labels;sensorLabel.visible=options.labels;
    if(viewTween) {
      camera.position.lerp(viewTween.position,smoothing*.73);
      controls.target.lerp(viewTween.target,smoothing*.73);
      if(camera.position.distanceTo(viewTween.position)<.006)viewTween=null;
    }
    const cameraChanged=controls.update();
    if(needsRender||moving||cameraChanged) {
      if(mechanicalMotion)renderer.shadowMap.needsUpdate=true;
      if(!reducedMotion)landscape.animate?.(time/1000);
      renderer.render(scene,camera);
      renderFrames++;
      needsRender=false;
    }
  };
  frame=requestAnimationFrame(animate);

  function setPreset(preset='overview') {
    // Consume pending orbit deltas before assigning an absolute view.
    const damping=controls.enableDamping;
    controls.enableDamping=false;
    controls.update();
    controls.enableDamping=damping;
    const views={
      overview:{position:new THREE.Vector3(-6.2,6.0,10.7),target:new THREE.Vector3(-1.35,1.42,0)},
      lens:{position:new THREE.Vector3(-2.2,4.6,7.3),target:new THREE.Vector3(-4.35,1.6,0)},
      landscape:{position:new THREE.Vector3(6.5,5.7,9),target:new THREE.Vector3(.05,1.25,0)},
    };
    viewTween=views[preset]||views.overview;
    const fit=preset==='lens'?Math.max(1,overviewFit*.74):overviewFit;
    viewTween.position.sub(viewTween.target).multiplyScalar(fit).add(viewTween.target);
    needsRender=true;
    if(reducedMotion){camera.position.copy(viewTween.position);controls.target.copy(viewTween.target);viewTween=null;}
  }
  return {
    update(nextSettings={},nextOptions={}) {
      current={...current,...nextSettings};
      options={...options,...nextOptions};
      optics=calculateOptics(current);
      needsRender=true;
      updateBlades();rebuildRays();
    },
    resetView(){setPreset('overview');},
    setPreset,
    getDiagnostics(){
      scene.updateMatrixWorld(true);
      const project = point => {
        const p = point.clone().project(camera);
        return {x:(p.x+1)*canvas.clientWidth/2,y:(1-p.y)*canvas.clientHeight/2,visible:p.z>=-1&&p.z<=1};
      };
      const subjectScreenPositions = Object.fromEntries(subjects.map(subject => {
        const box = new THREE.Box3().setFromObject(subject.object);
        return [subject.id,{...project(box.getCenter(new THREE.Vector3())),distance:subject.distance}];
      }));
      const focusHandleScreenPosition=project(handle.getWorldPosition(new THREE.Vector3()));
      return {webgl:true,frames,renderFrames,overviewFit,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,settings:{...current},optics:{...optics},imageDistance:optics.imageDistance,apertureDiameter:optics.apertureDiameter,bladeRadius,bladeTarget,rayBundles:rayBundles.map(bundle=>({...bundle})),lastPickedSubject,focusPlaneX:focusPlane.position.x,subjectScreenPositions,focusHandleScreenPosition,options:{...options},camera:camera.position.toArray()};
    },
    dispose(){
      disposed=true;cancelAnimationFrame(frame);observer.disconnect();
      canvas.removeEventListener('pointerdown',pointerDown,true);canvas.removeEventListener('pointermove',pointerMove);
      canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerUp);
      controls.removeEventListener('start',onControlStart);controls.removeEventListener('end',onControlEnd);controls.dispose();
      controls.removeEventListener('change',onControlChange);
      landscape.dispose?.();releaseObject(scene);environment.dispose();renderer.dispose();
    },
  };
}
