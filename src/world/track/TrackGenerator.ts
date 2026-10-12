import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { FLAG, TRACK_STEP, TrackData } from './TrackData';
import { Biome, biomeForLevel, isBossLevel } from '../biomes/Biomes';

export type PickupKind = 'coin' | 'star' | 'heart' | 'nitro' | 'shield' | 'magnet' | 'x2' | 'gem';
export type ObstacleKind = 'cone' | 'barrel' | 'barrier' | 'ball' | 'crate';

export interface PickupSpawn { kind: PickupKind; s: number; d: number; h: number }
export interface ObstacleSpawn { kind: ObstacleKind; s: number; d: number; vel: number }
export interface BoostSpawn { s: number; d: number }

export interface LevelData {
  level: number;
  seed: number;
  difficulty: number;
  biome: Biome;
  boss: boolean;
  track: TrackData;
  pickups: PickupSpawn[];
  obstacles: ObstacleSpawn[];
  boosts: BoostSpawn[];
  segments: { kind: string; start: number; end: number }[];
}

interface Ctl {
  yaw: number;
  pitch: number;
  roll: number;
  hw: number;
  tube: number;
  flags: number;
  lat: number;
}

export const BASE_HALF_WIDTH = 7;
const ease = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

export function difficultyFor(level: number): number {
  return 1 - Math.exp(-(level - 1) / 22);
}

export function generateLevel(level: number): LevelData {
  const seed = Rng.hash(level, 0x51c7);
  const rng = new Rng(seed);
  const diff = difficultyFor(level);
  const biome = biomeForLevel(level);
  const boss = isBossLevel(level);

  const ctl: Ctl[] = [];
  const pickups: PickupSpawn[] = [];
  const obstacles: ObstacleSpawn[] = [];
  const boosts: BoostSpawn[] = [];
  const segments: LevelData['segments'] = [];

  let yaw = 0;
  const [altMin, altMax, altStart] = biome.altitude ?? [25, 100, 45];
  let alt = altStart;
  let lat = 0;
  let inTube = false;
  const targetLen = Math.round(1100 + 1500 * diff + rng.range(-100, 150) + (boss ? 300 : 0));

  const cur = () => ctl.length * TRACK_STEP;

  const emit = (len: number, kind: string, fn: (t: number, i: number) => Partial<Ctl>) => {
    const n = Math.max(2, Math.round(len / TRACK_STEP));
    const start = cur();
    const yaw0 = yaw;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const c = fn(t, i);
      const p = c.pitch ?? 0;
      const entry: Ctl = {
        yaw: c.yaw ?? yaw0,
        pitch: p,
        roll: c.roll ?? 0,
        hw: c.hw ?? BASE_HALF_WIDTH,
        tube: c.tube ?? (inTube ? 1 : 0),
        flags: c.flags ?? 0,
        lat: lat + (c.lat ?? 0),
      };
      ctl.push(entry);
      alt += Math.sin(p) * TRACK_STEP;
    }
    const last = ctl[ctl.length - 1];
    yaw = last.yaw;
    lat = last.lat;
    segments.push({ kind, start, end: cur() });
    return start;
  };

  const wallFlags = (chance: number) => {
    let f = 0;
    if (inTube) return 0;
    if (rng.chance(chance)) f |= FLAG.WALL_L;
    if (rng.chance(chance)) f |= FLAG.WALL_R;
    return f;
  };

  // ---------- spawn helpers ----------
  const coinLine = (s0: number, len: number, d: number | ((t: number) => number), spacing = 4.5) => {
    const n = Math.max(3, Math.floor(len / spacing));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pickups.push({ kind: 'coin', s: s0 + t * len, d: typeof d === 'number' ? d : d(t), h: 1.0 });
    }
  };
  const lanes = [-4.2, 0, 4.2];

  const special = (s: number, d: number) => {
    const kind = rng.weighted<PickupKind>([
      { item: 'nitro', w: 30 },
      { item: 'heart', w: 10 },
      { item: 'shield', w: 13 },
      { item: 'magnet', w: 14 },
      { item: 'x2', w: 13 },
      { item: 'gem', w: 6 },
      { item: 'star', w: 14 },
    ]);
    pickups.push({ kind, s, d, h: 1.2 });
  };

  // ---------- segment library ----------
  const straight = (len: number, opts: { open?: boolean; decorate?: boolean } = {}) => {
    const f = opts.open ? 0 : wallFlags(0.35 - diff * 0.25);
    const s0 = emit(len, 'straight', () => ({ flags: f }));
    if (opts.decorate === false) return;
    // coins
    if (rng.chance(0.75)) {
      const lane = rng.pick(lanes);
      if (rng.chance(0.5)) coinLine(s0 + 8, len - 16, lane);
      else {
        const l2 = rng.pick(lanes);
        coinLine(s0 + 8, len - 16, (t) => lane + (l2 - lane) * ease(t));
      }
    }
    // boost pad
    if (len > 50 && rng.chance(0.35)) boosts.push({ s: s0 + rng.range(10, len - 30), d: rng.pick(lanes) });
    // obstacles
    if (len > 50 && rng.chance(0.25 + diff * 0.55)) {
      const s = s0 + rng.range(25, len - 15);
      const free = rng.int(0, 2);
      const kind = rng.weighted<ObstacleKind>([
        { item: 'cone', w: 4 },
        { item: 'barrel', w: 3 },
        { item: biome.id === 'port' ? 'crate' : 'barrier', w: 2 + diff * 3 },
      ]);
      for (let l = 0; l < 3; l++) {
        if (l === free) continue;
        if (l !== free && rng.chance(0.25 + diff * 0.5)) obstacles.push({ kind, s, d: lanes[l], vel: 0 });
      }
      if (!obstacles.some((o) => Math.abs(o.s - s) < 0.01)) obstacles.push({ kind, s, d: lanes[(free + 1) % 3], vel: 0 });
    }
    if (rng.chance(0.3)) special(s0 + len * 0.5, rng.pick(lanes));
  };

  const turn = (len: number, angle: number, bank: number, kind = 'turn') => {
    const f = inTube ? 0 : wallFlags(level <= 2 ? 0.9 : 0.55 - diff * 0.4);
    const yaw0 = yaw;
    const s0 = emit(len, kind, (t) => ({
      yaw: yaw0 + angle * ease(t),
      roll: bank * Math.sign(angle) * Math.sin(Math.PI * t),
      flags: f,
    }));
    // inner line coins (risky racing line)
    if (rng.chance(0.6)) {
      const side = Math.sign(angle) * (rng.chance(0.6) ? 1 : -1) * 4.5;
      coinLine(s0 + 6, len - 12, (t) => side * Math.sin(Math.PI * t), 5);
    }
    if (rng.chance(0.15)) special(s0 + len * 0.5, -Math.sign(angle) * 4.5);
  };

  const pickTurnAngle = (maxAbs: number) => {
    let a = rng.range(0.45, maxAbs) * rng.sign();
    if (Math.abs(yaw + a) > 1.3) a = -a;
    if (Math.abs(yaw) > 0.7 && Math.sign(a) === Math.sign(yaw)) a = -a;
    return a;
  };

  const hill = (len: number, dhWanted: number) => {
    const dh = Math.max(altMin, Math.min(altMax, alt + dhWanted)) - alt;
    const theta = (dh * Math.PI) / (2 * len);
    const f = wallFlags(0.3);
    const s0 = emit(len, 'hill', (t) => ({ pitch: theta * Math.sin(Math.PI * t), flags: f }));
    if (rng.chance(0.6)) coinLine(s0 + 5, len - 10, rng.pick(lanes));
  };

  const rollers = (n: number, amp: number) => {
    const len = n * 60;
    const f = wallFlags(0.4);
    const s0 = emit(len, 'rollers', (t) => ({ pitch: amp * Math.sin(2 * Math.PI * n * t), flags: f }));
    if (rng.chance(0.7)) coinLine(s0 + 5, len - 10, rng.pick(lanes), 6);
  };

  const jump = () => {
    // approach + boost pad
    const app = 45;
    const s0 = emit(app, 'jump-approach', () => ({ flags: FLAG.WALL_L | FLAG.WALL_R }));
    boosts.push({ s: s0 + 12, d: 0 });
    const kick = 0.22;
    emit(26, 'ramp', (t) => ({ pitch: kick * ease(t), flags: FLAG.WALL_L | FLAG.WALL_R | (t > 0.92 ? FLAG.RAMP : 0) }));
    const gap = Math.round(14 + diff * 16 + rng.range(0, 6));
    const gs = emit(gap, 'gap', (t) => ({ pitch: kick - 2 * kick * t, flags: FLAG.GAP | FLAG.NO_SUPPORT }));
    // coins arc over the gap
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pickups.push({ kind: 'coin', s: gs - 6 + t * (gap + 12), d: 0, h: 1 + 6 * Math.sin(Math.PI * t) });
    }
    if (rng.chance(0.5)) special(gs + gap / 2, 0);
    emit(30, 'landing', (t) => ({ pitch: -kick * (1 - ease(t)), flags: FLAG.WALL_L | FLAG.WALL_R }));
  };

  const loop = () => {
    const R = 17;
    const len = Math.round(4 * Math.PI * R);
    const side = rng.sign();
    emit(30, 'loop-entry', () => ({ flags: FLAG.WALL_L | FLAG.WALL_R }));
    const s0 = emit(len, 'loop', (t) => ({
      pitch: 2 * Math.PI * (t - Math.sin(2 * Math.PI * t) / (2 * Math.PI)),
      lat: side * 18 * ease(t),
      flags: FLAG.WALL_L | FLAG.WALL_R | FLAG.LOOP | FLAG.NO_SUPPORT,
      hw: 6,
    }));
    coinLine(s0 + 10, len - 20, 0, 6);
    emit(25, 'loop-exit', () => ({ flags: FLAG.WALL_L | FLAG.WALL_R }));
    // pitch made a full 2PI; altitude returns approximately
  };

  const narrow = (len: number) => {
    const s0 = emit(len, 'narrow', (t) => ({
      hw: BASE_HALF_WIDTH - 2.6 * Math.sin(Math.PI * t),
      flags: wallFlags(0.2),
    }));
    if (rng.chance(0.7)) coinLine(s0 + 10, len - 20, 0, 5);
  };

  const tubeSection = () => {
    emit(30, 'tube-enter', (t) => ({ tube: ease(t) }));
    inTube = true;
    const parts = rng.int(2, 4);
    for (let p = 0; p < parts; p++) {
      const r = rng.next();
      if (r < 0.6) turn(rng.range(90, 140), pickTurnAngle(1.1), 0, 'tube-turn');
      else {
        const s0 = emit(70, 'tube-straight', () => ({}));
        coinLine(s0 + 5, 60, (t) => 4 * Math.sin(t * Math.PI * 2), 4);
        // rolling beach balls
        if (rng.chance(0.4 + diff * 0.5)) {
          const n = rng.int(2, 3 + Math.floor(diff * 3));
          for (let i = 0; i < n; i++)
            obstacles.push({ kind: 'ball', s: s0 + 40 + i * 9, d: rng.range(-5, 5), vel: rng.range(-6, 3) });
        }
      }
    }
    inTube = false;
    emit(30, 'tube-exit', (t) => ({ tube: 1 - ease(t) }));
  };

  const altitudeFix = () => {
    // keep the track inside a comfortable altitude band
    const span = altMax - altMin;
    if (alt < altMin) hill(rng.range(90, 140), Math.min(span * 0.6, rng.range(12, 30)));
    else if (alt > altMax) hill(rng.range(90, 140), -Math.min(span * 0.6, rng.range(12, 30)));
  };

  // ---------- assembly ----------
  emit(70, 'start', () => ({ flags: FLAG.WALL_L | FLAG.WALL_R }));
  straight(60, { decorate: true });

  const weights = () => [
    { item: 'turn', w: 30 },
    { item: 'scurve', w: 12 + diff * 10 },
    { item: 'straight', w: 14 },
    { item: 'hill', w: 12 },
    { item: 'rollers', w: 8 + diff * 6 },
    { item: 'jump', w: 6 + diff * 10 },
    { item: 'loop', w: level >= 3 ? 3 + diff * 5 : 0 },
    { item: 'narrow', w: level >= 4 ? 4 + diff * 6 : 0 },
    { item: 'tube', w: level >= 2 ? 6 * biome.tubeWeight + diff * 3 : 0 },
  ];

  let last = '';
  let heavyCount = 0;
  while (cur() < targetLen - 160) {
    altitudeFix();
    let kind = rng.weighted(weights());
    if ((kind === 'jump' || kind === 'loop' || kind === 'tube') && (last === kind || heavyCount > 0)) kind = 'turn';
    switch (kind) {
      case 'turn': {
        const a = pickTurnAngle(1.0 + diff * 0.6);
        const len = Math.abs(a) * rng.range(70, 105) * (1.1 - diff * 0.4);
        turn(Math.max(45, len), a, rng.range(0.05, 0.3));
        heavyCount = Math.max(0, heavyCount - 1);
        break;
      }
      case 'scurve': {
        const a = pickTurnAngle(0.8 + diff * 0.4);
        const len = rng.range(70, 100) * (1.1 - diff * 0.3);
        turn(len, a, 0.2, 'scurve');
        turn(len, -a * rng.range(0.8, 1.2), 0.2, 'scurve');
        heavyCount = Math.max(0, heavyCount - 1);
        break;
      }
      case 'straight':
        straight(rng.range(60, 120));
        heavyCount = Math.max(0, heavyCount - 1);
        break;
      case 'hill':
        hill(rng.range(80, 140), rng.range(-1, 1) * Math.min(25, (altMax - altMin) * 0.5));
        break;
      case 'rollers':
        rollers(rng.int(2, 3), rng.range(0.1, 0.18));
        break;
      case 'jump':
        jump();
        heavyCount = 1;
        break;
      case 'loop':
        loop();
        heavyCount = 2;
        break;
      case 'narrow':
        narrow(rng.range(70, 110));
        break;
      case 'tube':
        tubeSection();
        heavyCount = 1;
        break;
    }
    last = kind;
  }
  // finish straight
  emit(40, 'pre-finish', () => ({ flags: FLAG.WALL_L | FLAG.WALL_R }));
  const finishStart = emit(140, 'finish', () => ({ flags: FLAG.WALL_L | FLAG.WALL_R }));
  coinLine(finishStart + 5, 40, 0);

  // ---------- integrate positions & frames ----------
  const n = ctl.length + 1;
  const track = new TrackData(n);
  const P = new THREE.Vector3(0, altStart, 0);
  const tmpF = new THREE.Vector3();
  const flatRight = new THREE.Vector3();
  const positions: THREE.Vector3[] = [P.clone()];
  const ups: THREE.Vector3[] = [];
  const upAt = (c: Ctl, f: THREE.Vector3, out: THREE.Vector3) => {
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), sp = Math.sin(c.pitch), cp = Math.cos(c.pitch);
    f.set(sy * cp, sp, -cy * cp);
    const up0 = new THREE.Vector3(-sy * sp, cp, cy * sp);
    const right0 = new THREE.Vector3().crossVectors(f, up0);
    out.copy(up0).multiplyScalar(Math.cos(c.roll)).addScaledVector(right0, Math.sin(c.roll));
    return out;
  };
  let prevLat = 0;
  for (let i = 0; i < ctl.length; i++) {
    const c = ctl[i];
    const up = new THREE.Vector3();
    upAt(c, tmpF, up);
    flatRight.set(Math.cos(c.yaw), 0, Math.sin(c.yaw));
    P.addScaledVector(tmpF, TRACK_STEP).addScaledVector(flatRight, c.lat - prevLat);
    prevLat = c.lat;
    positions.push(P.clone());
    ups.push(up);
  }
  ups.unshift(ups[0].clone());

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = positions[Math.max(0, i - 1)];
    const b = positions[Math.min(n - 1, i + 1)];
    fwd.subVectors(b, a).normalize();
    up.copy(ups[i]);
    right.crossVectors(fwd, up).normalize();
    up.crossVectors(right, fwd).normalize();
    const c = ctl[Math.min(i, ctl.length - 1)];
    track.pos.set([positions[i].x, positions[i].y, positions[i].z], i * 3);
    track.fwd.set([fwd.x, fwd.y, fwd.z], i * 3);
    track.up.set([up.x, up.y, up.z], i * 3);
    track.right.set([right.x, right.y, right.z], i * 3);
    track.halfWidth[i] = c.hw;
    track.tube[i] = c.tube;
    track.flags[i] = c.flags;
    track.bankAssist[i] = -right.y;
  }
  // planar curvature
  const f0 = new THREE.Vector3();
  const f1 = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(n - 1, i + 2);
    f0.fromArray(track.fwd, a * 3);
    f1.fromArray(track.fwd, b * 3);
    right.fromArray(track.right, i * 3);
    track.curv[i] = f1.sub(f0).dot(right) / ((b - a) * TRACK_STEP || 1);
  }
  track.finishS = finishStart + 45;
  for (let s = Math.floor(track.finishS) - 2; s <= track.finishS + 2; s++) track.flags[s] |= FLAG.FINISH;

  // drop pickups/obstacles that ended up in unsafe places
  const filteredPickups = pickups.filter((p) => p.s > 80 && p.s < track.length - 10);
  const filteredObstacles = obstacles.filter((o) => o.s > 120 && o.s < track.finishS - 20);

  return {
    level,
    seed,
    difficulty: diff,
    biome,
    boss,
    track,
    pickups: filteredPickups,
    obstacles: filteredObstacles,
    boosts,
    segments,
  };
}
