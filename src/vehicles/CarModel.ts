import * as THREE from 'three';
import { CarDef, CarShape, LIVERIES, NEONS, PAINTS, RIMS, TRAILS, byId, type RimDef, type TrailDef } from '../meta/Catalog';
import { bodyTexture, cabinTexture, glowTexture, paintMaterial, shadowTexture } from './Livery';
import { smoothstep } from '../core/math';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface CarLook {
  carId: string;
  paint: string;
  livery: string;
  rim: string;
  neon: string;
  trail: string;
}

/** Merge all direct mesh children of a group by material to cut draw calls. */
function mergeChildren(group: THREE.Object3D, keep: Set<THREE.Object3D>, castShadow = true) {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Object3D[] = [];
  for (const c of group.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || keep.has(m) || Array.isArray(m.material) || m.children.length) continue;
    m.updateMatrix();
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(m.matrix);
    const list = byMat.get(m.material as THREE.Material) ?? [];
    list.push(g);
    byMat.set(m.material as THREE.Material, list);
    remove.push(m);
  }
  for (const r of remove) group.remove(r);
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = castShadow;
    group.add(mesh);
  }
}

const sgnPow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);
const geoCache = new Map<string, { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry }>();

function profile(points: [number, number][], t: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, v0] = points[i];
    const [t1, v1] = points[i + 1];
    if (t <= t1) {
      const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      const e = k * k * (3 - 2 * k);
      return v0 + (v1 - v0) * e;
    }
  }
  return points[points.length - 1][1];
}

export function bodyFunctions(s: CarShape) {
  const tr = 0.5 - s.wheelbase / 2, tf = 0.5 + s.wheelbase / 2;
  const top = (t: number) =>
    profile(
      [
        [0, s.tail],
        [0.1, s.deck],
        [s.cabinStart, s.deck],
        [s.cabinEnd, s.hood],
        [0.9, s.hood * 0.6 + s.nose * 0.4],
        [1, s.nose],
      ],
      t,
    );
  const bottom = (t: number) => s.clearance + 0.12 * Math.pow(Math.abs(2 * t - 1), 6);
  const gauss = (x: number) => Math.exp(-((x / 0.085) ** 2));
  const halfW = (t: number) => {
    const base = (s.width / 2) * (0.9 + 0.1 * Math.sin(Math.PI * t));
    const endW = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 12)), 0.16);
    return (base + s.flare * (gauss(t - tr) + gauss(t - tf)) * 0.5) * endW;
  };
  const endH = (t: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 18)), 0.14);
  return { top, bottom, halfW, endH, tr, tf };
}

function buildGeometries(def: CarDef) {
  const cached = geoCache.get(def.id);
  if (cached) return cached;
  const s = def.shape;
  const f = bodyFunctions(s);
  const NS = 48, NA = 32;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const z = s.length / 2 - t * s.length;
    const top = f.top(t), bot = f.bottom(t);
    const mid = (top + bot) / 2;
    const hh = ((top - bot) / 2) * f.endH(t);
    const hw = f.halfW(t);
    for (let j = 0; j <= NA; j++) {
      const th = (j / NA) * Math.PI * 2;
      const cy = -Math.cos(th);
      let x = hw * sgnPow(Math.sin(th), 2 / s.box);
      const y = mid + hh * sgnPow(cy, 2 / s.box);
      x *= 1 - 0.1 * Math.max(0, cy); // tumblehome toward the top
      pos.push(x, y, z);
      uv.push(j / NA, t);
    }
  }
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(idx);
  body.computeVertexNormals();

  // cabin / greenhouse
  const NC = 28, NP = 20;
  const cp: number[] = [], cu: number[] = [], ci: number[] = [];
  for (let i = 0; i <= NC; i++) {
    const k = i / NC;
    const t = s.cabinStart + (s.cabinEnd - s.cabinStart) * k;
    const z = s.length / 2 - t * s.length;
    const top = f.top(t), bot = f.bottom(t);
    const mid = (top + bot) / 2, hh = (top - bot) / 2;
    const y0 = mid + hh * 0.86;
    const rise = smoothstep(0, s.rearSlope, k) * smoothstep(1, 1 - s.frontSlope, k);
    const h = Math.max(0.001, (s.roof - y0) * Math.pow(rise, 0.85));
    const wc = f.halfW(t) * s.cabinWidth;
    for (let j = 0; j <= NP; j++) {
      const ph = (j / NP) * Math.PI;
      const sinp = Math.sin(ph);
      const x = wc * sgnPow(Math.cos(ph), 2 / 3) * (1 - 0.22 * sinp * Math.min(1, h / 0.3));
      const y = y0 + h * sgnPow(sinp, 2 / 3.2);
      cp.push(x, y, z);
      cu.push(j / NP, k);
    }
  }
  for (let i = 0; i < NC; i++)
    for (let j = 0; j < NP; j++) {
      const a = i * (NP + 1) + j, b = a + 1, c = a + NP + 1, d = c + 1;
      ci.push(a, c, b, b, c, d);
    }
  const cabin = new THREE.BufferGeometry();
  cabin.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  cabin.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
  cabin.setIndex(ci);
  cabin.computeVertexNormals();
  const out = { body, cabin };
  geoCache.set(def.id, out);
  return out;
}

// ---------------- wheels ----------------
const tireGeo = (() => {
  const pts: THREE.Vector2[] = [];
  const R = 1, w = 0.5;
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    pts.push(new THREE.Vector2(R - 0.18 + Math.cos(a) * 0.18, Math.sin(a) * w));
  }
  pts.unshift(new THREE.Vector2(0.62, -w * 0.95));
  pts.push(new THREE.Vector2(0.62, w * 0.95));
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateZ(Math.PI / 2);
  return g;
})();

const tireMat = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.85 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.5, metalness: 0.3 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.35, metalness: 0.6 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a08, emissiveIntensity: 1.1, roughness: 0.3 });
const tailRingMat = new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff5a00, emissiveIntensity: 0.6, roughness: 0.3 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d8, emissiveIntensity: 1.6, roughness: 0.2 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, emissive: 0x333333 });

const rimMatCache = new Map<string, THREE.MeshStandardMaterial>();
function rimMaterial(r: RimDef) {
  let m = rimMatCache.get(r.id);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.25, metalness: 0.9 });
    if (r.id === 'neonblue') {
      m.emissive = new THREE.Color(r.color);
      m.emissiveIntensity = 0.6;
    }
    rimMatCache.set(r.id, m);
  }
  return m;
}

function buildWheel(radius: number, width: number, rim: RimDef, side: number): THREE.Group {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.scale.set(width, radius, radius);
  tire.castShadow = true;
  spin.add(tire);
  const rm = rimMaterial(rim);
  const face = side * width * 0.42;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width * 0.5, 24), darkMat);
  disc.rotation.z = Math.PI / 2;
  spin.add(disc);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.6, radius * 0.045, 6, 28), rm);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = face;
  spin.add(lip);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.14, radius * 0.16, 0.06, 12), rm);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = face;
  spin.add(hub);
  const n = rim.spokes;
  if (rim.style === 'solid') {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, 0.04, 6), rm);
    d.rotation.z = Math.PI / 2;
    d.position.x = face - side * 0.01;
    spin.add(d);
  }
  const spokeGeo = new THREE.BoxGeometry(0.035, radius * 0.5, rim.style === 'mesh' ? radius * 0.06 : radius * 0.13);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sp = new THREE.Mesh(spokeGeo, rm);
    sp.position.set(face, Math.cos(a) * radius * 0.36, Math.sin(a) * radius * 0.36);
    sp.rotation.x = -a;
    if (rim.style === 'turbine') sp.rotation.y = 0.5 * side;
    spin.add(sp);
    if (rim.style === 'mesh') {
      const sp2 = sp.clone();
      sp2.rotation.x = -a + Math.PI / n;
      sp2.rotation.z = 0.5;
      spin.add(sp2);
    }
  }
  mergeChildren(spin, new Set(), true);
  return g;
}

let shieldMat: THREE.ShaderMaterial | null = null;
function shieldMaterial() {
  if (!shieldMat)
    shieldMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x4ad8ff) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float hex = 0.5 + 0.5 * sin(vP.y * 18.0 - uTime * 4.0); float a = f * 0.9 + hex * f * 0.3; gl_FragColor = vec4(uColor * a, a); }`,
    });
  return shieldMat;
}

// ---------------- the model ----------------
export class CarModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly wheels: THREE.Group[] = [];
  private flames: THREE.Mesh[] = [];
  private glow: THREE.Mesh | null = null;
  private glowMat: THREE.MeshBasicMaterial | null = null;
  private neonColor = 0;
  private ownMaterials: THREE.Material[] = [];
  private wheelSpin = 0;
  private time = 0;
  readonly def: CarDef;
  readonly trail: TrailDef;
  shieldMesh: THREE.Mesh;
  private bodyMat!: THREE.Material;
  private cabinMat!: THREE.Material;

  constructor(def: CarDef, look: CarLook) {
    this.def = def;
    const s = def.shape;
    const paint = byId(PAINTS, look.paint);
    const livery = byId(LIVERIES, look.livery);
    const rim = byId(RIMS, look.rim);
    this.trail = byId(TRAILS, look.trail);
    const { body, cabin } = buildGeometries(def);

    const bodyMat = paintMaterial(paint, bodyTexture(paint, livery, s, def.id));
    const cabinMat = paintMaterial(paint, cabinTexture(paint, livery, s, def.id));
    cabinMat.roughness = 0.08;
    cabinMat.metalness = 0.2;
    cabinMat.iridescence = 0;
    this.ownMaterials.push(bodyMat, cabinMat);
    this.bodyMat = bodyMat;
    this.cabinMat = cabinMat;

    const bodyMesh = new THREE.Mesh(body, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = false;
    this.body.add(bodyMesh);
    const cabinMesh = new THREE.Mesh(cabin, cabinMat);
    cabinMesh.castShadow = true;
    this.body.add(cabinMesh);

    const f = bodyFunctions(s);
    const L = s.length, Wd = s.width;
    const zRear = L / 2, zFront = -L / 2;
    const tailY = f.top(0.04) - 0.16;
    // rear panel + tail lights (reference: twin round lights with dark center panel)
    const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.62, 0.2, 0.08), darkMat);
    rearPanel.position.set(0, tailY, zRear - 0.1);
    this.body.add(rearPanel);
    for (const sx of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), tailMat);
      light.rotation.x = Math.PI / 2;
      light.position.set(sx * Wd * 0.33, tailY, zRear - 0.1);
      this.body.add(light);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 6, 18), tailRingMat);
      ring.position.set(sx * Wd * 0.33, tailY, zRear - 0.06);
      this.body.add(ring);
      // headlights
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.12), headMat);
      head.position.set(sx * Wd * 0.3, f.top(0.97) - 0.08, zFront + 0.12);
      head.rotation.y = sx * 0.25;
      this.body.add(head);
      // mirrors
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.14), bodyMat);
      const mt = s.cabinEnd - 0.03;
      mirror.position.set(sx * (f.halfW(mt) * s.cabinWidth + 0.12), f.top(mt) + 0.08, L / 2 - mt * L);
      this.body.add(mirror);
    }
    // diffuser + exhausts + plate
    const diff = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.7, 0.16, 0.3), trimMat);
    diff.position.set(0, s.clearance + 0.12, zRear - 0.12);
    this.body.add(diff);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.02), plateMat);
    plate.position.set(0, tailY - 0.2, zRear - 0.02);
    this.body.add(plate);
    const exGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10);
    const exhausts: THREE.Vector3[] = [];
    for (const sx of [-0.18, 0.18]) {
      const ex = new THREE.Mesh(exGeo, trimMat);
      ex.rotation.x = Math.PI / 2;
      ex.position.set(sx * Wd, s.clearance + 0.1, zRear - 0.02);
      this.body.add(ex);
      exhausts.push(ex.position.clone());
    }
    // grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.5, 0.14, 0.06), darkMat);
    grille.position.set(0, s.clearance + 0.22, zFront + 0.1);
    this.body.add(grille);

    // spoiler
    if (s.spoiler === 2) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.92, 0.05, 0.38), trimMat);
      wing.position.set(0, f.top(0.06) + 0.36, zRear - 0.28);
      wing.rotation.x = -0.12;
      this.body.add(wing);
      for (const sx of [-1, 1]) {
        const end = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.42), trimMat);
        end.position.set(sx * Wd * 0.46, f.top(0.06) + 0.3, zRear - 0.28);
        this.body.add(end);
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.12), trimMat);
        strut.position.set(sx * Wd * 0.26, f.top(0.06) + 0.16, zRear - 0.3);
        this.body.add(strut);
      }
    } else if (s.spoiler === 1) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.8, 0.06, 0.18), trimMat);
      lip.position.set(0, f.top(0.03) + 0.04, zRear - 0.1);
      lip.rotation.x = -0.25;
      this.body.add(lip);
    }
    if (s.scoop) {
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.7), darkMat);
      scoop.position.set(0, f.top(0.78) + 0.04, L / 2 - 0.78 * L);
      this.body.add(scoop);
    }
    mergeChildren(this.body, new Set<THREE.Object3D>([bodyMesh, cabinMesh]), true);
    this.root.add(this.body);

    // wheels
    const wr = s.wheelR;
    for (const t of [f.tr, f.tf]) {
      for (const sx of [-1, 1]) {
        const w = buildWheel(wr, s.wheelW, rim, sx);
        w.position.set(sx * (Wd / 2 - s.wheelW * 0.38 + s.flare * 0.4), wr, L / 2 - t * L);
        this.root.add(w);
        this.wheels.push(w);
      }
    }

    // blob shadow
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(Wd * 1.25, L * 1.1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    shadow.renderOrder = 1;
    this.ownMaterials.push(shadow.material as THREE.Material);
    this.root.add(shadow);

    // underglow
    this.setNeon(look.neon);

    // nitro flames
    const flameMat = new THREE.MeshBasicMaterial({
      color: this.trail.colors[1],
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: this.trail.colors[0],
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ownMaterials.push(flameMat, coreMat);
    const flameGeo = new THREE.ConeGeometry(0.13, 1, 10, 1, true);
    flameGeo.translate(0, -0.5, 0);
    flameGeo.rotateX(-Math.PI / 2);
    for (const p of exhausts) {
      const outer = new THREE.Mesh(flameGeo, flameMat);
      outer.position.copy(p).add(new THREE.Vector3(0, 0, 0.1));
      outer.rotation.y = Math.PI;
      outer.visible = false;
      const inner = new THREE.Mesh(flameGeo, coreMat);
      inner.scale.set(0.55, 0.55, 0.6);
      outer.add(inner);
      this.body.add(outer);
      this.flames.push(outer);
    }

    // shield bubble
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), shieldMaterial());
    this.shieldMesh.scale.set(Wd * 0.85, 1.2, L * 0.62);
    this.shieldMesh.position.y = 0.7;
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);

    this.root.traverse((o) => {
      o.frustumCulled = true;
    });
  }

  setNeon(id: string) {
    const neon = byId(NEONS, id);
    this.neonColor = neon.color;
    if (neon.color === 0) {
      if (this.glow) this.glow.visible = false;
      return;
    }
    if (!this.glow) {
      this.glowMat = new THREE.MeshBasicMaterial({
        map: glowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.95,
      });
      this.ownMaterials.push(this.glowMat);
      this.glow = new THREE.Mesh(new THREE.PlaneGeometry(this.def.shape.width * 1.9, this.def.shape.length * 1.35), this.glowMat);
      this.glow.rotation.x = -Math.PI / 2;
      this.glow.position.y = 0.05;
      this.glow.renderOrder = 2;
      this.root.add(this.glow);
    }
    this.glow.visible = true;
    this.glowMat!.color.setHex(neon.color > 0 ? neon.color : 0xff00ff);
  }

  /** speed m/s, steer -1..1, roll/pitch radians for body lean. */
  update(dt: number, speed: number, steer: number, nitro: boolean, roll: number, pitch: number) {
    this.time += dt;
    const r = this.def.shape.wheelR;
    this.wheelSpin -= (speed / r) * dt;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      (w.children[0] as THREE.Group).rotation.x = this.wheelSpin;
      if (i >= 2) w.rotation.y = -steer * 0.38;
    }
    this.body.rotation.z = roll;
    this.body.rotation.x = pitch;
    for (const f of this.flames) {
      f.visible = nitro;
      if (nitro) {
        const k = 1.1 + Math.sin(this.time * 60) * 0.25 + Math.random() * 0.3;
        f.scale.set(1 + Math.random() * 0.2, 1 + Math.random() * 0.2, k * 1.6);
      }
    }
    if (this.glow && this.neonColor === -1 && this.glowMat) {
      this.glowMat.color.setHSL((this.time * 0.3) % 1, 1, 0.55);
    }
    if (this.shieldMesh.visible) (this.shieldMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
  }

  dispose() {
    for (const m of this.ownMaterials) {
      // paint textures are per-model (not cached)
      if (m === this.bodyMat || m === this.cabinMat) (m as THREE.MeshPhysicalMaterial).map?.dispose();
      m.dispose();
    }
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      // shared geometries (body/cabin/tire) are cached; dispose only per-instance ones
      if (m.geometry && m.geometry !== tireGeo && !isCachedGeometry(m.geometry)) m.geometry.dispose();
    });
  }
}

function isCachedGeometry(g: THREE.BufferGeometry) {
  for (const v of geoCache.values()) if (v.body === g || v.cabin === g) return true;
  return false;
}
