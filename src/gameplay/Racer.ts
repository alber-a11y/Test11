import * as THREE from 'three';
import type { CarDef, CarStats, UpgradeStat } from '../meta/Catalog';
import { CarModel, CarLook } from '../vehicles/CarModel';

export type RacerState = 'grid' | 'drive' | 'air' | 'fall' | 'finished';

export interface DriveStats {
  maxSpeed: number; // m/s
  accel: number; // m/s^2
  grip: number; // lateral m/s^2
  nitroTime: number; // seconds per charge
}

export function effectiveStats(def: CarDef, upgrades?: Partial<Record<UpgradeStat, number>>): CarStats {
  const u = upgrades ?? {};
  return {
    speed: def.stats.speed + (u.speed ?? 0) * 0.3,
    accel: def.stats.accel + (u.accel ?? 0) * 0.3,
    grip: def.stats.grip + (u.grip ?? 0) * 0.3,
    nitro: def.stats.nitro + (u.nitro ?? 0) * 0.3,
  };
}

export function driveStats(st: CarStats): DriveStats {
  return {
    maxSpeed: 47 + st.speed * 2.5,
    accel: 10 + st.accel * 1.3,
    grip: 20 + st.grip * 1.7,
    nitroTime: 2.0 + st.nitro * 0.14,
  };
}

/** km/h shown on the HUD (arcade-scaled). */
export const displaySpeed = (v: number) => Math.round(v * 3.6 * 1.25);

export interface AiProfile {
  skill: number; // fraction of grip it dares to use
  speedFactor: number;
  lane: number;
  aggression: number;
  nitroChance: number;
}

export class Racer {
  readonly model: CarModel;
  readonly name: string;
  stats: DriveStats;
  isPlayer: boolean;
  ai: AiProfile | null;

  s = 0;
  d = 0;
  h = 0;
  v = 0;
  vh = 0;
  latV = 0;
  slide = 0;
  steerSm = 0;
  throttle = 0;
  brake = 0;
  state: RacerState = 'grid';
  drifting = false;
  airTime = 0;

  nitroTime = 0;
  nitroCharges = 1;
  nitroMeter = 0;
  boostTime = 0;
  shieldTime = 0;
  invulnTime = 0;
  magnetTime = 0;
  x2Time = 0;

  place = 6;
  finishTime = 0;
  fallTimer = 0;
  fallPos = new THREE.Vector3();
  fallVel = new THREE.Vector3();
  fallSpin = new THREE.Vector3();
  targetD = 0;
  laneTimer = 0;
  mistakeTime = 0;
  /** Rubber-band multiplier on top speed / acceleration (bots only). */
  band = 1;
  /** Smoothed visual body lean. */
  visRoll = 0;
  visPitch = 0;

  /** Smoothed world pose for camera. */
  readonly pos = new THREE.Vector3();
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly fwd = new THREE.Vector3(0, 0, -1);

  constructor(def: CarDef, look: CarLook, stats: DriveStats, isPlayer: boolean, name: string, ai: AiProfile | null) {
    this.model = new CarModel(def, look);
    this.stats = stats;
    this.isPlayer = isPlayer;
    this.ai = ai;
    this.name = name;
    this.model.root.matrixAutoUpdate = false;
  }

  get nitroActive() {
    return this.nitroTime > 0;
  }

  get halfWidth() {
    return this.model.def.shape.width / 2;
  }
}
