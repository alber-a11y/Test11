import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { FLAG, TrackData } from './track/TrackData';
import type { LevelData } from './track/TrackGenerator';
import type { Biome } from './biomes/Biomes';
import { containerTexture, windowsTexture, roadTexture, curbTexture } from '../render/textures/trackTextures';
import { cached, hex, makeCanvas, shade, toTexture } from '../render/textures/canvas';
import { glowTexture } from '../vehicles/Livery';

/** XZ spatial hash of track samples for prop clearance queries. */
class TrackGrid {
  private cells = new Map<string, number[]>();
  constructor(private track: TrackData, private cell = 40) {
    for (let i = 0; i < track.count; i += 3) {
      const k = this.key(track.pos[i * 3], track.pos[i * 3 + 2]);
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(i);
    }
  }
  private key(x: number, z: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }
  /** Minimal XZ distance to the track centerline (and that sample's height). */
  nearest(x: number, z: number, maxR: number): { dist: number; y: number } {
    const r = Math.ceil(maxR / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = Infinity, by = 0;
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        const a = this.cells.get(`${cx + i},${cz + j}`);
        if (!a) continue;
        for (const idx of a) {
          const dx = this.track.pos[idx * 3] - x, dz = this.track.pos[idx * 3 + 2] - z;
          const d = Math.hypot(dx, dz);
          if (d < best) {
            best = d;
            by = this.track.pos[idx * 3 + 1];
          }
        }
      }
    return { dist: best, y: by };
  }
}

const lowPoly = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], shadow = false) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  mats.forEach((x, i) => m.setMatrixAt(i, x));
  m.count = mats.length;
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

const M = () => new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
function trs(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  return M().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}

export class Environment {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private animated: ((t: number) => void)[] = [];
  private time = 0;
  private ambient: { pts: THREE.Points; vel: THREE.Vector3; pos: Float32Array; range: number } | null = null;

  build(level: LevelData) {
    this.clear();
    const { track, biome } = level;
    const rng = new Rng(level.seed ^ 0xabc);
    const grid = new TrackGrid(track);
    this.pillars(track, biome);
    const scatter = (count: number, minD: number, maxD: number, clearance: number, fn: (x: number, z: number, near: { dist: number; y: number }) => void) => {
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 8) {
        tries++;
        const i = rng.int(0, track.count - 1);
        const px = track.pos[i * 3], pz = track.pos[i * 3 + 2];
        const ang = rng.next() * Math.PI * 2;
        const r = rng.range(minD, maxD);
        const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
        const near = grid.nearest(x, z, clearance + 10);
        if (near.dist < clearance) continue;
        fn(x, z, near);
        placed++;
      }
    };

    this.buildAmbient(biome);
    switch (biome.id) {
      case 'sky':
        this.islands(rng, scatter, biome, 28);
        this.ribbons(rng, track, biome, 5);
        this.clouds(rng, track, 70, biome);
        break;
      case 'port':
        this.port(rng, scatter, track, grid);
        break;
      case 'bridge':
        this.bridge(rng, track, biome);
        this.islands(rng, scatter, biome, 12);
        this.clouds(rng, track, 30, biome);
        break;
      case 'slide':
        this.islands(rng, scatter, biome, 18, true);
        this.ribbons(rng, track, biome, 4);
        this.floatingBalls(rng, scatter);
        break;
      case 'desert':
        this.mesas(rng, scatter, 45);
        this.cacti(rng, scatter, 120);
        break;
      case 'neon':
        this.city(rng, scatter, 160);
        this.neonRings(track, rng);
        break;
      case 'snow':
        this.mountains(rng, scatter, 40, 0x8090a8, true);
        this.pines(rng, scatter, 220);
        this.clouds(rng, track, 30, biome);
        break;
      case 'volcano':
        this.volcanoes(rng, scatter, 14);
        this.mountains(rng, scatter, 30, 0x3a2a26, false);
        break;
    }
  }

  update(dt: number, camPos?: THREE.Vector3) {
    this.time += dt;
    for (const a of this.animated) a(this.time);
    const amb = this.ambient;
    if (amb && camPos) {
      const p = amb.pos;
      const R = amb.range;
      for (let i = 0; i < p.length; i += 3) {
        p[i] += amb.vel.x * dt + Math.sin(this.time + i) * 0.3 * dt;
        p[i + 1] += amb.vel.y * dt;
        p[i + 2] += amb.vel.z * dt;
        // wrap particles into a box around the camera
        for (let k = 0; k < 3; k++) {
          const c = k === 0 ? camPos.x : k === 1 ? camPos.y : camPos.z;
          let v = p[i + k] - c;
          if (v > R) v -= 2 * R;
          else if (v < -R) v += 2 * R;
          p[i + k] = c + v;
        }
      }
      (amb.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /** Weather / ambience particles: snow, embers, bubbles, dust, neon motes. */
  private buildAmbient(b: Biome) {
    this.ambient = null;
    const cfg: Partial<Record<Biome['id'], { color: number; size: number; vel: [number, number, number]; n: number; additive: boolean }>> = {
      snow: { color: 0xffffff, size: 0.14, vel: [1, -4, 0], n: 900, additive: false },
      volcano: { color: 0xff7a2a, size: 0.1, vel: [0.5, 3, 0], n: 350, additive: true },
      slide: { color: 0xbff4ff, size: 0.12, vel: [0, 2, 0], n: 400, additive: true },
      desert: { color: 0xf3d6a8, size: 0.08, vel: [5, 0.3, 0], n: 400, additive: false },
      neon: { color: 0xff5ad8, size: 0.1, vel: [0, 0.6, 0], n: 300, additive: true },
    };
    const c = cfg[b.id];
    if (!c) return;
    const R = 45;
    const pos = new Float32Array(c.n * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() * 2 - 1) * R;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: c.color,
      size: c.size,
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: c.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: 0.9,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.add(pts);
    this.ambient = { pts, vel: new THREE.Vector3(...c.vel), pos, range: R };
  }

  clear() {
    this.ambient = null;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.animated = [];
    this.group.clear();
  }

  private add(o: THREE.Object3D) {
    this.group.add(o);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry) this.disposables.push(m.geometry);
      if (m.material) {
        const mm = Array.isArray(m.material) ? m.material : [m.material];
        mm.forEach((x) => this.disposables.push(x));
      }
    });
  }

  // ---------------- supports ----------------
  private pillars(track: TrackData, b: Biome) {
    const mats: THREE.Matrix4[] = [];
    const caps: THREE.Matrix4[] = [];
    const steel = b.id === 'bridge';
    for (let s = 30; s < track.count - 10; s += steel ? 36 : 48) {
      const i = track.index(s);
      if (track.flags[i] & (FLAG.NO_SUPPORT | FLAG.GAP)) continue;
      if (track.tube[i] > 0.2 && b.id !== 'slide') continue;
      const x = track.pos[i * 3], y = track.pos[i * 3 + 1], z = track.pos[i * 3 + 2];
      if (y < 4) continue;
      const upY = track.up[i * 3 + 1];
      if (upY < 0.8) continue;
      const h = y - 1.3;
      const yaw = Math.atan2(track.fwd[i * 3], -track.fwd[i * 3 + 2]);
      mats.push(trs(x, h / 2, z, -yaw, 1, h, 1));
      caps.push(trs(x, h - 0.6, z, -yaw, 1, 1, 1));
    }
    const geo = steel ? new THREE.BoxGeometry(2.2, 1, 2.2) : new THREE.CylinderGeometry(1.4, 1.8, 1, 10);
    const mat = new THREE.MeshStandardMaterial({ color: steel ? 0xd0682a : shade(b.road.under, 1.25), roughness: 0.7, metalness: steel ? 0.4 : 0 });
    this.add(instanced(geo, mat, mats, true));
    const capGeo = new THREE.BoxGeometry(10, 1.2, 3);
    this.add(instanced(capGeo, mat, caps, true));
  }

  // ---------------- sky / islands ----------------
  private islands(rng: Rng, scatter: Scatter, b: Biome, count: number, rocky = false) {
    const sand = rocky ? 0x9a7a5a : 0xf1cf8f;
    const sandMats: THREE.Matrix4[] = [];
    const grassMats: THREE.Matrix4[] = [];
    const rockMats: THREE.Matrix4[] = [];
    const palms: [number, number, number, number][] = [];
    scatter(count, 80, 900, 45, (x, z) => {
      const r = rng.range(18, 60);
      sandMats.push(trs(x, 0.8, z, rng.next() * 6, r, rng.range(2, 4), r * rng.range(0.7, 1.2)));
      if (rocky || rng.chance(0.6)) {
        const h = rng.range(rocky ? 40 : 15, rocky ? 140 : 60);
        rockMats.push(trs(x + rng.range(-5, 5), h / 2, z + rng.range(-5, 5), rng.next() * 6, r * 0.55, h, r * 0.5));
      } else {
        grassMats.push(trs(x, 3, z, rng.next() * 6, r * 0.7, 2, r * 0.6));
      }
      const pc = rocky ? 0 : rng.int(1, 4);
      for (let p = 0; p < pc; p++) palms.push([x + rng.range(-r * 0.5, r * 0.5), 3.5, z + rng.range(-r * 0.4, r * 0.4), rng.range(0.8, 1.4)]);
    });
    const disc = new THREE.CylinderGeometry(0.85, 1, 1, 9);
    this.add(instanced(disc, lowPoly(sand), sandMats));
    this.add(instanced(new THREE.CylinderGeometry(0.75, 1, 1, 8), lowPoly(0x5fbf4a), grassMats));
    const rockGeo = new THREE.ConeGeometry(1, 1, 7, 3);
    jitter(rockGeo, 0.12, 3);
    this.add(instanced(rockGeo, lowPoly(rocky ? 0x8c6b4e : 0xb89870), rockMats));
    this.palmTrees(palms);
  }

  private palmTrees(list: [number, number, number, number][]) {
    if (!list.length) return;
    const trunk: THREE.Matrix4[] = [];
    const leaves: THREE.Matrix4[] = [];
    const rng = new Rng(list.length);
    for (const [x, y, z, s] of list) {
      const lean = rng.range(-0.25, 0.25);
      trunk.push(trs(x, y + 5 * s, z, 0, s, 10 * s, s, lean, 0));
      const top = new THREE.Vector3(x + Math.sin(lean) * 0, y + 10 * s, z + Math.sin(lean) * 5 * s);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rng.next();
        leaves.push(trs(top.x + Math.cos(a) * 2.2 * s, top.y - 0.6 * s, top.z + Math.sin(a) * 2.2 * s, -a, 5 * s, 0.35 * s, 1.4 * s, 0, -0.35));
      }
    }
    this.add(instanced(new THREE.CylinderGeometry(0.25, 0.4, 1, 6), lowPoly(0x8a5a32), trunk));
    this.add(instanced(new THREE.BoxGeometry(1, 1, 1), lowPoly(0x2f9a3a), leaves));
  }

  private clouds(rng: Rng, track: TrackData, count: number, b: Biome) {
    const tex = cached('cloud', () => {
      const [c, ctx] = makeCanvas(128, 128);
      const r = new Rng(3);
      for (let i = 0; i < 14; i++) {
        const x = r.range(30, 98), y = r.range(45, 85), rad = r.range(16, 34);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
      }
      return toTexture(c, { repeat: false });
    });
    // one draw call: point sprites with per-cloud size
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const k = track.index(rng.next() * track.length);
      const ang = rng.next() * Math.PI * 2;
      const r = rng.range(40, 500);
      pos.set([track.pos[k * 3] + Math.cos(ang) * r, rng.range(-5, track.pos[k * 3 + 1] - 12), track.pos[k * 3 + 2] + Math.sin(ang) * r], i * 3);
      size[i] = rng.range(40, 110);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const col = new THREE.Color(b.sky.cloudColor);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: tex }, uColor: { value: col }, uScale: { value: window.innerHeight } }]),
      vertexShader: `attribute float aSize; uniform float uScale;
        #include <fog_pars_vertex>
        void main(){ vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(2048.0, aSize * uScale / max(1.0, -mvPosition.z)); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(uMap, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)); gl_FragColor = vec4(uColor * t.rgb, t.a * 0.9); if (gl_FragColor.a < 0.02) discard;
        #include <fog_fragment>
        }`,
    });
    (mat.uniforms.uMap.value as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.add(pts);
  }

  /** Decorative sweeping roads in the sky (as on the reference shots). */
  private ribbons(rng: Rng, track: TrackData, b: Biome, count: number) {
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture(b), roughness: 0.8, side: THREE.DoubleSide });
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(b), roughness: 0.8, side: THREE.DoubleSide });
    this.disposables.push(roadMat, curbMat);
    for (let c = 0; c < count; c++) {
      const k = track.index(rng.next() * track.length);
      const cx = track.pos[k * 3] + rng.range(-1, 1) * 600;
      const cz = track.pos[k * 3 + 2] + rng.range(-1, 1) * 600;
      if (Math.hypot(cx - track.pos[k * 3], cz - track.pos[k * 3 + 2]) < 250) continue;
      const pts: THREE.Vector3[] = [];
      let a = rng.next() * 6, y = rng.range(30, 120);
      for (let i = 0; i < 7; i++) {
        pts.push(new THREE.Vector3(cx + Math.cos(a) * 180 * (i * 0.25 + 0.4), y, cz + Math.sin(a) * 180 * (i * 0.25 + 0.4)));
        a += rng.range(0.4, 0.9);
        y += rng.range(-25, 25);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const N = 160;
      const width = 6;
      const build = (from: number, to: number, mat: THREE.Material, vScale: number) => {
        const pos: number[] = [], uv: number[] = [], idx: number[] = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const p = curve.getPointAt(t);
          const tan = curve.getTangentAt(t);
          const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
          for (const [f, u] of [[from, 0], [to, 1]] as const) {
            const q = p.clone().addScaledVector(side, f * width);
            pos.push(q.x, q.y, q.z);
            uv.push(u, (t * curve.getLength()) / vScale);
          }
          if (i < N) {
            const o = i * 2;
            idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat);
        this.group.add(m);
        this.disposables.push(g);
      };
      build(-1, 1, roadMat, 24);
      build(1, 1.25, curbMat, 6);
      build(-1.25, -1, curbMat, 6);
    }
  }

  private floatingBalls(rng: Rng, scatter: Scatter) {
    const tex = beachBallTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
    const list: THREE.Matrix4[] = [];
    scatter(60, 30, 300, 20, (x, z) => {
      const s = rng.range(1.5, 4);
      list.push(trs(x, s * 0.6, z, rng.next() * 6, s, s, s, rng.next() * 6));
    });
    const m = instanced(new THREE.SphereGeometry(1, 16, 12), mat, list);
    this.add(m);
  }

  // ---------------- port ----------------
  private port(rng: Rng, scatter: Scatter, track: TrackData, grid: TrackGrid) {
    // docks under the whole track
    const dockMats: THREE.Matrix4[] = [];
    for (let s = 0; s < track.count; s += 60) {
      const k = track.index(s);
      dockMats.push(trs(track.pos[k * 3], 0.6, track.pos[k * 3 + 2], rng.next() * 3, 150, 1.2, 150));
    }
    this.add(instanced(new THREE.BoxGeometry(1, 1, 1), lowPoly(0x9aa0a8, { flatShading: false }), dockMats));

    // container stacks
    const colors = [0xd8452e, 0x2a6fd6, 0xe8892a, 0x2a9a5a, 0xc9c2b2, 0x8a3ad6, 0xe0c02a];
    const perColor: THREE.Matrix4[][] = colors.map(() => []);
    const cw = 6.1, ch = 2.6, cd = 2.45;
    scatter(140, 16, 160, 15, (x, z, near) => {
      const yaw = rng.next() * Math.PI;
      const rows = rng.int(1, 3), cols = rng.int(2, 4);
      const levels = rng.int(1, near.dist < 30 ? 3 : 6);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const lx = (r - rows / 2) * cw, lz = (c - cols / 2) * cd;
          const wx = x + Math.cos(yaw) * lx - Math.sin(yaw) * lz;
          const wz = z + Math.sin(yaw) * lx + Math.cos(yaw) * lz;
          if (grid.nearest(wx, wz, 30).dist < 13) continue;
          const lv = Math.max(1, levels - rng.int(0, 2));
          for (let l = 0; l < lv; l++) {
            const ci = rng.int(0, colors.length - 1);
            perColor[ci].push(trs(wx, 1.2 + ch / 2 + l * ch, wz, -yaw, cw, ch, cd));
          }
        }
    });
    const box = new THREE.BoxGeometry(1, 1, 1);
    colors.forEach((c, i) => {
      if (!perColor[i].length) return;
      const mat = new THREE.MeshStandardMaterial({ map: containerTexture(c, i), roughness: 0.75, metalness: 0.2 });
      this.add(instanced(box, mat, perColor[i], true));
    });
    // cargo ships
    for (let n = 0; n < 3; n++) {
      let placed = false;
      for (let t = 0; t < 40 && !placed; t++) {
        const k = track.index(rng.next() * track.length);
        const ang = rng.next() * Math.PI * 2;
        const x = track.pos[k * 3] + Math.cos(ang) * rng.range(110, 260);
        const z = track.pos[k * 3 + 2] + Math.sin(ang) * rng.range(110, 260);
        if (grid.nearest(x, z, 140).dist < 100) continue;
        this.ship(x, z, rng.next() * Math.PI, rng, colors);
        placed = true;
      }
    }
    // cranes
    const crane: THREE.Matrix4[] = [];
    scatter(10, 40, 200, 35, (x, z) => {
      const yaw = rng.next() * 3;
      for (const sx of [-6, 6]) for (const sz of [-4, 4]) {
        const wx = x + Math.cos(yaw) * sx - Math.sin(yaw) * sz;
        const wz = z + Math.sin(yaw) * sx + Math.cos(yaw) * sz;
        crane.push(trs(wx, 20, wz, -yaw, 1.2, 40, 1.2));
      }
      crane.push(trs(x, 40, z, -yaw, 14, 2.5, 60));
    });
    this.add(instanced(new THREE.BoxGeometry(1, 1, 1), lowPoly(0xd8402a, { flatShading: false, roughness: 0.6 }), crane, true));
  }

  private ship(x: number, z: number, yaw: number, rng: Rng, colors: number[]) {
    const g = new THREE.Group();
    const L = 160, W = 28;
    const shape = new THREE.Shape();
    shape.moveTo(-L / 2, -W / 2);
    shape.lineTo(L / 2 - 20, -W / 2);
    shape.quadraticCurveTo(L / 2 + 8, 0, L / 2 - 20, W / 2);
    shape.lineTo(-L / 2, W / 2);
    shape.lineTo(-L / 2, -W / 2);
    const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 16, bevelEnabled: false });
    hullGeo.rotateX(-Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.6, metalness: 0.3 }));
    hull.position.y = -4;
    g.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L - 18, 1.5, W + 0.2), new THREE.MeshStandardMaterial({ color: 0xc8382a }));
    stripe.position.set(-9, -3.2, 0);
    g.add(stripe);
    // name plate
    const [c, ctx] = makeCanvas(512, 96);
    ctx.fillStyle = '#2b2f38';
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(['OCEANIX', 'NOVA STAR', 'BLUWAVE'][rng.int(0, 2)], 256, 50);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(50, 9.4), new THREE.MeshStandardMaterial({ map: toTexture(c, { repeat: false }), roughness: 0.6 }));
    plate.position.set(-10, 6, W / 2 + 0.05);
    g.add(plate);
    const plate2 = plate.clone();
    plate2.rotation.y = Math.PI;
    plate2.position.z = -W / 2 - 0.05;
    g.add(plate2);
    // superstructure
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 18, W - 4), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
    bridge.position.set(-L / 2 + 12, 21, 0);
    g.add(bridge);
    // containers on deck
    const box = new THREE.BoxGeometry(6.1, 2.6, 2.45);
    const groups: THREE.Matrix4[][] = colors.map(() => []);
    for (let bx = -L / 2 + 24; bx < L / 2 - 26; bx += 6.4)
      for (let bz = -W / 2 + 2.5; bz < W / 2 - 2; bz += 2.55) {
        const h = rng.int(2, 6);
        for (let l = 0; l < h; l++) groups[rng.int(0, colors.length - 1)].push(trs(bx, 13.3 + l * 2.6, bz));
      }
    colors.forEach((col, i) => {
      if (!groups[i].length) return;
      g.add(instanced(box, new THREE.MeshStandardMaterial({ map: containerTexture(col, i), roughness: 0.75 }), groups[i]));
    });
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    this.add(g);
  }

  // ---------------- bridge ----------------
  private bridge(rng: Rng, track: TrackData, b: Biome) {
    const legs: THREE.Matrix4[] = [];
    const beams: THREE.Matrix4[] = [];
    const cables: number[] = [];
    for (let s = 120; s < track.count - 80; s += rng.range(160, 240)) {
      const i = track.index(s);
      if (track.flags[i] & (FLAG.LOOP | FLAG.GAP) || track.up[i * 3 + 1] < 0.9 || track.tube[i] > 0.1) continue;
      const x = track.pos[i * 3], y = track.pos[i * 3 + 1], z = track.pos[i * 3 + 2];
      const rx = track.right[i * 3], rz = track.right[i * 3 + 2];
      const yaw = Math.atan2(rx, rz);
      const H = y + 38;
      const off = 13;
      for (const sgn of [-1, 1]) {
        legs.push(trs(x + rx * off * sgn, H / 2, z + rz * off * sgn, yaw, 2.4, H, 2.4));
        // cables down to the deck
        for (let c = 1; c <= 5; c++) {
          for (const dir of [-1, 1]) {
            const fx = track.fwd[i * 3], fz = track.fwd[i * 3 + 2];
            const along = dir * c * 9;
            cables.push(x + rx * off * sgn, H - 2, z + rz * off * sgn);
            const kk = track.index(s + along);
            cables.push(track.pos[kk * 3] + rx * (off - 3) * sgn + fx * 0, track.pos[kk * 3 + 1] + 0.5, track.pos[kk * 3 + 2] + rz * (off - 3) * sgn + fz * 0);
          }
        }
      }
      for (const hh of [y + 14, H - 2]) beams.push(trs(x, hh, z, yaw - Math.PI / 2, off * 2 + 2.4, 2, 2));
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8692a, roughness: 0.55, metalness: 0.45 });
    this.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat, legs, true));
    this.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat, beams, true));
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
    this.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x5a5f66 })));
    void b;
  }

  // ---------------- desert ----------------
  private mesas(rng: Rng, scatter: Scatter, count: number) {
    const tex = cached('strata', () => {
      const [c, ctx] = makeCanvas(64, 256);
      const cols = [0xc8693a, 0xd8844a, 0xb85a30, 0xe0a060, 0xa04a28];
      let y = 0;
      const r = new Rng(9);
      while (y < 256) {
        const h = r.range(8, 30);
        ctx.fillStyle = hex(r.pick(cols));
        ctx.fillRect(0, y, 64, h);
        y += h;
      }
      return toTexture(c);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, flatShading: true, roughness: 0.95 });
    const list: THREE.Matrix4[] = [];
    scatter(count, 60, 800, 40, (x, z) => {
      const r = rng.range(15, 50);
      const h = rng.range(25, 110);
      list.push(trs(x, h / 2, z, rng.next() * 6, r, h, r * rng.range(0.6, 1.2)));
    });
    const geo = new THREE.CylinderGeometry(0.8, 1, 1, 8, 4);
    jitter(geo, 0.06, 5);
    this.add(instanced(geo, mat, list));
  }

  private cacti(rng: Rng, scatter: Scatter, count: number) {
    const list: THREE.Matrix4[] = [];
    const arms: THREE.Matrix4[] = [];
    scatter(count, 15, 300, 14, (x, z) => {
      const h = rng.range(4, 9);
      list.push(trs(x, h / 2, z, 0, 0.7, h, 0.7));
      if (rng.chance(0.7)) arms.push(trs(x + 1.1, h * 0.55, z, 0, 0.5, h * 0.35, 0.5));
      if (rng.chance(0.5)) arms.push(trs(x - 1.1, h * 0.45, z, 0, 0.5, h * 0.3, 0.5));
    });
    const mat = lowPoly(0x3f8a3a);
    this.add(instanced(new THREE.CapsuleGeometry(1, 1, 3, 8), mat, list));
    this.add(instanced(new THREE.CapsuleGeometry(1, 1, 3, 8), mat, arms));
  }

  // ---------------- neon city ----------------
  private city(rng: Rng, scatter: Scatter, count: number) {
    const palette = [0x2ff3ff, 0xff2fd0, 0xffd02f, 0x8a6aff];
    const groups: THREE.Matrix4[][] = palette.map(() => []);
    scatter(count, 30, 700, 22, (x, z, near) => {
      const w = rng.range(14, 34);
      const maxH = near.dist < 60 ? near.y - 8 : near.y + 120;
      const h = Math.max(15, rng.range(20, Math.max(25, maxH)));
      groups[rng.int(0, palette.length - 1)].push(trs(x, h / 2, z, rng.next() * 3, w, h, w * rng.range(0.6, 1.3)));
    });
    const box = new THREE.BoxGeometry(1, 1, 1);
    palette.forEach((c, i) => {
      const tex = windowsTexture(c, i);
      tex.repeat.set(2, 4);
      const mat = new THREE.MeshStandardMaterial({ color: 0x15121f, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.5 });
      this.add(instanced(box, mat, groups[i]));
    });
  }

  private neonRings(track: TrackData, rng: Rng) {
    const colors = [0xff2fd0, 0x2ff3ff];
    for (let s = 200; s < track.count - 100; s += rng.range(90, 160)) {
      const i = track.index(s);
      if (track.flags[i] & (FLAG.LOOP | FLAG.GAP) || track.tube[i] > 0.1) continue;
      const smp = TrackData.newSample();
      track.surface(s, 0, 0, smp);
      const hw = track.halfWidth[i] + 3;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(hw, 0.35, 8, 40, Math.PI),
        new THREE.MeshBasicMaterial({ color: colors[Math.floor(s) % 2] }),
      );
      ring.position.copy(smp.pos);
      ring.lookAt(smp.pos.clone().add(smp.fwd));
      ring.rotateZ(0);
      // orient: torus lies in XY; lookAt aligns -Z? with fwd -> arch spans across road
      const up = smp.up.clone();
      const m = new THREE.Matrix4().makeBasis(smp.right, up, smp.fwd.clone().negate());
      ring.quaternion.setFromRotationMatrix(m);
      this.add(ring);
      const mat = ring.material as THREE.MeshBasicMaterial;
      const phase = rng.next() * 6;
      this.animated.push((t) => mat.color.setHex(Math.sin(t * 3 + phase) > 0 ? colors[0] : colors[1]));
    }
  }

  // ---------------- mountains / snow / volcano ----------------
  private mountains(rng: Rng, scatter: Scatter, count: number, color: number, snowCaps: boolean) {
    const body: THREE.Matrix4[] = [];
    const caps: THREE.Matrix4[] = [];
    scatter(count, 150, 1400, 120, (x, z) => {
      const r = rng.range(80, 220);
      const h = rng.range(90, 320);
      const yaw = rng.next() * 6;
      body.push(trs(x, h / 2, z, yaw, r, h, r));
      if (snowCaps) caps.push(trs(x, h - h * 0.175, z, yaw, r * 0.36, h * 0.36, r * 0.36));
    });
    const geo = new THREE.ConeGeometry(1, 1, 8, 4);
    jitter(geo, 0.08, 7);
    this.add(instanced(geo, lowPoly(color), body));
    if (caps.length) this.add(instanced(new THREE.ConeGeometry(1.03, 1, 8, 1), lowPoly(0xffffff), caps));
  }

  private pines(rng: Rng, scatter: Scatter, count: number) {
    const tiers: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    scatter(count, 12, 400, 12, (x, z) => {
      const s = rng.range(0.8, 1.8);
      trunks.push(trs(x, 1.5 * s, z, 0, 0.5 * s, 3 * s, 0.5 * s));
      for (let t = 0; t < 3; t++) tiers.push(trs(x, (3 + t * 2.4) * s, z, rng.next() * 3, (3.4 - t * 0.9) * s, 4 * s, (3.4 - t * 0.9) * s));
    });
    this.add(instanced(new THREE.CylinderGeometry(1, 1, 1, 5), lowPoly(0x6a4a32), trunks));
    this.add(instanced(new THREE.ConeGeometry(1, 1, 7), lowPoly(0x2f6a4a), tiers, true));
  }

  private volcanoes(rng: Rng, scatter: Scatter, count: number) {
    const body: THREE.Matrix4[] = [];
    const lava: THREE.Matrix4[] = [];
    scatter(count, 200, 1200, 150, (x, z) => {
      const r = rng.range(120, 260);
      const h = rng.range(120, 260);
      body.push(trs(x, h / 2, z, rng.next() * 6, r, h, r));
      lava.push(trs(x, h + 0.5, z, 0, r * 0.22, 1, r * 0.22));
    });
    const geo = new THREE.CylinderGeometry(0.25, 1, 1, 10, 5, true);
    jitter(geo, 0.05, 2);
    this.add(instanced(geo, lowPoly(0x2a1c1a), body));
    this.add(instanced(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshBasicMaterial({ color: 0xff6a1a }), lava));
  }
}

type Scatter = (count: number, minD: number, maxD: number, clearance: number, fn: (x: number, z: number, near: { dist: number; y: number }) => void) => void;

function jitter(geo: THREE.BufferGeometry, amount: number, seed: number) {
  const rng = new Rng(seed);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const map = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = map.get(k);
    if (!o) map.set(k, (o = [rng.range(-amount, amount), rng.range(-amount, amount) * 0.5, rng.range(-amount, amount)]));
    if (Math.abs(p.getY(i)) > 0.49) continue;
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals();
}

export function beachBallTexture(): THREE.Texture {
  return cached('beachball', () => {
    const [c, ctx] = makeCanvas(256, 128);
    const cols = ['#ffffff', '#ff5a3a', '#ffffff', '#2a8fff', '#ffffff', '#ffd02a'];
    cols.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128);
    });
    return toTexture(c);
  });
}
