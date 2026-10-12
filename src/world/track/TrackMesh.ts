import * as THREE from 'three';
import { FLAG, TrackData, SurfaceSample } from './TrackData';
import type { LevelData } from './TrackGenerator';
import {
  ROAD_TILE,
  boostTexture,
  checkerTexture,
  curbTexture,
  roadEmissive,
  roadTexture,
  underTexture,
  wallTexture,
} from '../../render/textures/trackTextures';

const CURB_W = 1.5;
const THICK = 1.3;
const WALL_H = 1.05;
const WALL_T = 0.4;
const CHUNK = 120;

class Builder {
  pos: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  vcount = 0;
  push(p: THREE.Vector3, u: number, v: number) {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    return this.vcount++;
  }
  quad(a: number, b: number, c: number, d: number) {
    // a,b on row i ; c,d on row i+1
    this.idx.push(a, b, c, b, d, c);
  }
  build(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export interface TrackVisual {
  group: THREE.Group;
  dispose(): void;
}

export function buildTrackMesh(level: LevelData): TrackVisual {
  const { track, biome } = level;
  const group = new THREE.Group();
  group.name = 'track';

  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTexture(biome),
    roughness: biome.road.style === 'glass' ? 0.15 : biome.road.style === 'ice' ? 0.35 : 0.82,
    metalness: biome.road.style === 'glass' ? 0.1 : 0.0,
    side: THREE.FrontSide,
    envMapIntensity: biome.road.style === 'glass' ? 1.4 : 0.5,
  });
  const em = roadEmissive(biome);
  if (em) {
    roadMat.emissiveMap = em;
    roadMat.emissive = new THREE.Color(0xffffff);
    roadMat.emissiveIntensity = 1.6;
  }
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(biome), roughness: 0.7 });
  if (biome.road.style === 'neon') {
    curbMat.emissive = new THREE.Color(biome.road.curbA);
    curbMat.emissiveIntensity = 0.6;
  }
  const underMat = new THREE.MeshStandardMaterial({ map: underTexture(biome), roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(biome), roughness: 0.6 });
  const materials = [roadMat, curbMat, underMat, wallMat];

  const smp: SurfaceSample = TrackData.newSample();
  const tmp = new THREE.Vector3();
  const isGap = (i: number) => (track.flags[i] & FLAG.GAP) !== 0;

  for (let start = 0; start < track.count - 1; start += CHUNK) {
    const end = Math.min(track.count - 1, start + CHUNK);
    const road = new Builder();
    const curb = new Builder();
    const under = new Builder();
    const wall = new Builder();
    const ROAD_COLS = 12;
    const rowRoad: number[][] = [];
    const rowCurbL: number[][] = [];
    const rowCurbR: number[][] = [];
    const rowBottom: number[][] = [];
    const rowSideL: number[][] = [];
    const rowSideR: number[][] = [];
    const rowWallL: number[][] = [];
    const rowWallR: number[][] = [];

    for (let i = start; i <= end; i++) {
      const s = i;
      const hw = track.halfWidth[i];
      const v = s / ROAD_TILE;
      // road
      const rr: number[] = [];
      for (let k = 0; k <= ROAD_COLS; k++) {
        const u = k / ROAD_COLS;
        const d = -hw + 2 * hw * u;
        track.surface(s, d, 0, smp);
        rr.push(road.push(smp.pos, u, v));
      }
      rowRoad.push(rr);
      // curbs
      const cl: number[] = [];
      const cr: number[] = [];
      for (let k = 0; k <= 2; k++) {
        const f = k / 2;
        track.surface(s, -hw - CURB_W + CURB_W * f, 0.04, smp);
        cl.push(curb.push(smp.pos, 1 - f, s / 6));
        track.surface(s, hw + CURB_W * f, 0.04, smp);
        cr.push(curb.push(smp.pos, f, s / 6));
      }
      rowCurbL.push(cl);
      rowCurbR.push(cr);
      // bottom + sides
      const bot: number[] = [];
      const BOT_COLS = 6;
      for (let k = 0; k <= BOT_COLS; k++) {
        const f = k / BOT_COLS;
        const d = hw + CURB_W - 2 * (hw + CURB_W) * f; // reversed for downward-facing winding
        track.surface(s, d, 0, smp);
        tmp.copy(smp.pos).addScaledVector(smp.up, -THICK);
        bot.push(under.push(tmp, f * 2, s / 8));
      }
      rowBottom.push(bot);
      // left side: from bottom to top (outer face)
      track.surface(s, -hw - CURB_W, 0.04, smp);
      const lt = under.push(smp.pos, 0, s / 8);
      tmp.copy(smp.pos).addScaledVector(smp.up, -THICK - 0.04);
      const lb = under.push(tmp, 0.35, s / 8);
      rowSideL.push([lt, lb]);
      track.surface(s, hw + CURB_W, 0.04, smp);
      const rt = under.push(smp.pos, 0, s / 8);
      tmp.copy(smp.pos).addScaledVector(smp.up, -THICK - 0.04);
      const rb = under.push(tmp, 0.35, s / 8);
      rowSideR.push([rb, rt]);
      // walls (profiles: inner-bottom, inner-top, outer-top, outer-bottom)
      const wallProfile = (sign: number, b: Builder) => {
        const ids: number[] = [];
        const dIn = sign * (hw + CURB_W - WALL_T);
        const dOut = sign * (hw + CURB_W);
        track.surface(s, dIn, 0, smp);
        ids.push(b.push(smp.pos, s / 8, 0));
        tmp.copy(smp.pos).addScaledVector(smp.up, WALL_H);
        ids.push(b.push(tmp, s / 8, 1));
        track.surface(s, dOut, 0, smp);
        tmp.copy(smp.pos).addScaledVector(smp.up, WALL_H);
        ids.push(b.push(tmp, s / 8, 1));
        ids.push(b.push(smp.pos, s / 8, 0));
        return ids;
      };
      rowWallL.push(wallProfile(-1, wall));
      rowWallR.push(wallProfile(1, wall));
    }

    for (let r = 0; r < rowRoad.length - 1; r++) {
      const i = start + r;
      if (isGap(i) || isGap(i + 1)) continue;
      const a = rowRoad[r], b = rowRoad[r + 1];
      for (let k = 0; k < ROAD_COLS; k++) road.quad(a[k], a[k + 1], b[k], b[k + 1]);
      const cl0 = rowCurbL[r], cl1 = rowCurbL[r + 1];
      for (let k = 0; k < 2; k++) curb.quad(cl0[k], cl0[k + 1], cl1[k], cl1[k + 1]);
      const cr0 = rowCurbR[r], cr1 = rowCurbR[r + 1];
      for (let k = 0; k < 2; k++) curb.quad(cr0[k], cr0[k + 1], cr1[k], cr1[k + 1]);
      const b0 = rowBottom[r], b1 = rowBottom[r + 1];
      for (let k = 0; k < b0.length - 1; k++) under.quad(b0[k], b0[k + 1], b1[k], b1[k + 1]);
      under.quad(rowSideL[r][1], rowSideL[r][0], rowSideL[r + 1][1], rowSideL[r + 1][0]);
      under.quad(rowSideR[r][1], rowSideR[r][0], rowSideR[r + 1][1], rowSideR[r + 1][0]);
      const fl = track.flags[i] & track.flags[i + 1];
      const tubeHere = track.tube[i] > 0.3;
      if (fl & FLAG.WALL_L && !tubeHere) {
        const w0 = rowWallL[r], w1 = rowWallL[r + 1];
        // inner face (faces +right), top, outer
        wall.quad(w0[1], w0[0], w1[1], w1[0]);
        wall.quad(w0[2], w0[1], w1[2], w1[1]);
        wall.quad(w0[3], w0[2], w1[3], w1[2]);
      }
      if (fl & FLAG.WALL_R && !tubeHere) {
        const w0 = rowWallR[r], w1 = rowWallR[r + 1];
        wall.quad(w0[0], w0[1], w1[0], w1[1]);
        wall.quad(w0[1], w0[2], w1[1], w1[2]);
        wall.quad(w0[2], w0[3], w1[2], w1[3]);
      }
    }

    const parts: [Builder, THREE.Material][] = [
      [road, roadMat],
      [curb, curbMat],
      [under, underMat],
      [wall, wallMat],
    ];
    for (const [b, m] of parts) {
      const g = b.build();
      if (!g) continue;
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      mesh.castShadow = m === wallMat;
      group.add(mesh);
    }
  }

  // ---- decorations on the track ----
  addBoostPads(level, group, materials);
  addStartFinish(level, group, materials);

  return {
    group,
    dispose() {
      group.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      });
      for (const m of materials) m.dispose();
    },
  };
}

const _m = new THREE.Matrix4();
const _basisZ = new THREE.Vector3();

export function frameMatrix(smp: SurfaceSample, out: THREE.Matrix4 = _m): THREE.Matrix4 {
  _basisZ.copy(smp.fwd).negate();
  out.makeBasis(smp.right, smp.up, _basisZ);
  out.setPosition(smp.pos);
  return out;
}

function addBoostPads(level: LevelData, group: THREE.Group, mats: THREE.Material[]) {
  const geo = new THREE.PlaneGeometry(3.6, 7);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: boostTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffffff,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  mats.push(mat);
  const smp = TrackData.newSample();
  for (const b of level.boosts) {
    level.track.surface(b.s, b.d, 0.06, smp);
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    m.matrix.copy(frameMatrix(smp));
    m.userData.boost = true;
    group.add(m);
  }
}

function addStartFinish(level: LevelData, group: THREE.Group, mats: THREE.Material[]) {
  const { track } = level;
  const smp = TrackData.newSample();
  const checkerMat = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  mats.push(checkerMat);
  const line = (s: number) => {
    const hw = track.halfWidth[track.index(s)];
    const g = new THREE.PlaneGeometry(hw * 2, 2.2);
    g.rotateX(-Math.PI / 2);
    track.surface(s, 0, 0.05, smp);
    const m = new THREE.Mesh(g, checkerMat);
    m.matrixAutoUpdate = false;
    m.matrix.copy(frameMatrix(smp));
    group.add(m);
  };
  line(48);
  line(track.finishS);

  // finish arch
  const archMat = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.4, metalness: 0.6 });
  const bannerMat = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.5, emissive: 0x222222 });
  mats.push(archMat, bannerMat);
  const arch = (s: number) => {
    const hw = track.halfWidth[track.index(s)] + 1.8;
    track.surface(s, 0, 0, smp);
    const g = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(0.8, 9, 0.8);
    const p1 = new THREE.Mesh(pillarGeo, archMat);
    p1.position.set(-hw, 4.5, 0);
    const p2 = p1.clone();
    p2.position.x = hw;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.8, 1.8, 0.4), bannerMat);
    banner.position.set(0, 8.4, 0);
    g.add(p1, p2, banner);
    g.traverse((o) => (o.castShadow = true));
    g.matrixAutoUpdate = false;
    g.matrix.copy(frameMatrix(smp));
    group.add(g);
  };
  arch(track.finishS);
  arch(48);
}
