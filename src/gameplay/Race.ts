import * as THREE from 'three';
import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import { clamp, damp } from '../core/math';
import type { Input } from '../core/Input';
import { FLAG, TrackData } from '../world/track/TrackData';
import type { LevelData, PickupKind } from '../world/track/TrackGenerator';
import { CARS, NEONS, PAINTS, LIVERIES, RIMS, type BoosterId, type CarDef, type UpgradeStat } from '../meta/Catalog';
import type { CarLook } from '../vehicles/CarModel';
import { Racer, driveStats, effectiveStats, type AiProfile } from './Racer';
import { Pickups, pickupColor, type PickupItem } from './Pickups';
import { Obstacles } from './Obstacles';
import type { Effects } from '../render/Particles';
import { cached, makeCanvas, toTexture } from '../render/textures/canvas';
import { lang, placeSuffix } from '../i18n/i18n';

/** Black pennant with the racer's place, like on the reference shots. */
function placeFlagTexture(place: number, boss: boolean) {
  return cached(`placeflag-${place}-${boss}-${lang}`, () => {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(10, 8, 6, 120);
    ctx.fillStyle = boss ? '#b0101a' : '#15161b';
    ctx.beginPath();
    ctx.moveTo(16, 8);
    ctx.lineTo(124, 8);
    ctx.lineTo(112, 34);
    ctx.lineTo(124, 60);
    ctx.lineTo(16, 60);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c81e1e';
    ctx.fillRect(16, 8, 6, 52);
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 900 36px Arial Black, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(place), 30, 36);
    ctx.font = 'italic 900 20px Arial Black, Arial, sans-serif';
    ctx.fillText(placeSuffix(place, 'racer'), 30 + ctx.measureText(String(place)).width * 1.8, 30);
    return toTexture(c, { repeat: false });
  });
}

const CURB_W = 1.5;
const WALL_T = 0.4;
const AIR_G = 26;
const BANK_G = 15;
const RAMP_KICK = 0.25;

export type RaceState = 'countdown' | 'racing' | 'dying' | 'gameover' | 'finished';

export interface RaceEvents {
  countdown: number;
  go: void;
  pickup: { kind: PickupKind; pos: THREE.Vector3; combo: number };
  heartLost: { hearts: number; reason: 'fall' | 'crash' };
  crash: { pos: THREE.Vector3; hard: boolean };
  wall: { pos: THREE.Vector3; strength: number };
  bump: { strength: number };
  nitro: void;
  boost: void;
  jump: void;
  land: { hard: boolean };
  fall: void;
  respawn: void;
  overtake: { place: number };
  finish: RaceResult;
  gameover: void;
  shieldBreak: void;
  nitroReady: void;
  botFall: { name: string };
}

export interface RaceResult {
  place: number;
  coins: number;
  gems: number;
  score: number;
  time: number;
  stars: number;
}

export interface RaceSetup {
  level: LevelData;
  playerDef: CarDef;
  look: CarLook;
  upgrades: Partial<Record<UpgradeStat, number>>;
  boosters: BoosterId[];
  trialCar?: boolean;
  difficulty?: Difficulty;
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';

/** How strong rivals are. Rewards scale with it (see Economy.difficultyRewardMult). */
export const DIFFICULTY: Record<Difficulty, { strength: number; skill: number; band: number; nitro: number; mistakes: number }> = {
  easy: { strength: -0.08, skill: -0.08, band: 0.6, nitro: 0.6, mistakes: 1.6 },
  normal: { strength: -0.02, skill: 0, band: 1.1, nitro: 1.2, mistakes: 0.9 },
  hard: { strength: 0.03, skill: 0.04, band: 1.4, nitro: 1.7, mistakes: 0.5 },
  extreme: { strength: 0.08, skill: 0.08, band: 1.8, nitro: 2.3, mistakes: 0.25 },
};

const BOT_NAMES = ['Blaze', 'Viper', 'Nitro', 'Comet', 'Raven', 'Tank', 'Flash', 'Ghost', 'Rocket', 'Zed', 'Dash', 'Storm'];

export class Race {
  readonly events = new EventBus<RaceEvents>();
  readonly group = new THREE.Group();
  readonly level: LevelData;
  readonly track: TrackData;
  readonly racers: Racer[] = [];
  readonly player: Racer;
  readonly pickups = new Pickups();
  readonly obstacles = new Obstacles();
  state: RaceState = 'countdown';
  countdown = 3.5;
  time = 0;
  /** Two lives: the first fall is free, the second one ends the race (game over). */
  hearts = 2;
  readonly maxHearts = 3;
  readonly difficulty: Difficulty;
  private diffCfg: (typeof DIFFICULTY)[Difficulty];
  coins = 0;
  gems = 0;
  score = 0;
  combo = 0;
  comboTimer = 0;
  revivesUsed = 0;
  coinMultiplier = 1;
  private dyingTimer = 0;
  private smp = TrackData.newSample();
  private tmpV = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();
  private lastCountdown = 4;
  private finishedCount = 0;
  private pickupCursor = 0;
  private rng: Rng;
  private effects: Effects;

  constructor(setup: RaceSetup, effects: Effects) {
    this.level = setup.level;
    this.track = setup.level.track;
    this.effects = effects;
    this.rng = new Rng(setup.level.seed ^ 0x77);
    const diff = setup.level.difficulty;
    this.difficulty = setup.difficulty ?? 'normal';
    const dc = (this.diffCfg = DIFFICULTY[this.difficulty]);

    // ---- player ----
    const pStats = driveStats(effectiveStats(setup.playerDef, setup.upgrades));
    this.player = new Racer(setup.playerDef, setup.look, pStats, true, 'YOU', null);
    // ---- bots: car quality scales with level ----
    const pool = CARS.filter((c) => !c.exclusive);
    const lvl = setup.level.level;
    const botCount = 5;
    const usedNames = new Set<string>();
    for (let i = 0; i < botCount; i++) {
      const isBoss = setup.level.boss && i === 0;
      const def = isBoss ? CARS.find((c) => c.exclusive)! : pool[Math.min(pool.length - 1, Math.floor(this.rng.range(0, Math.min(pool.length, 3 + lvl / 3))))];
      const paint = this.rng.pick(PAINTS.filter((p) => p.finish !== 'chrome'));
      const look: CarLook = {
        carId: def.id,
        paint: isBoss ? def.paint : paint.id,
        livery: isBoss ? def.livery : this.rng.pick(LIVERIES).id,
        rim: this.rng.pick(RIMS).id,
        neon: isBoss ? 'red' : this.rng.chance(0.4) ? this.rng.pick(NEONS.slice(1, 5)).id : 'off',
        trail: 'fire',
      };
      // bots get stats comparable to the player's, scaled with difficulty
      const base = driveStats(effectiveStats(def));
      const pl = pStats;
      const strength = (lvl <= 2 ? 0.9 : 0.93 + diff * 0.1) + dc.strength + (isBoss ? 0.06 : 0) + this.rng.range(-0.04, 0.03);
      const stats = {
        maxSpeed: (base.maxSpeed * 0.35 + pl.maxSpeed * 0.65) * strength,
        accel: (base.accel * 0.4 + pl.accel * 0.6) * strength,
        grip: (base.grip * 0.4 + pl.grip * 0.6) * (0.95 + diff * 0.08),
        nitroTime: base.nitroTime,
      };
      const ai: AiProfile = {
        skill: clamp(0.86 + diff * 0.12 + dc.skill + this.rng.range(-0.05, 0.04) + (isBoss ? 0.05 : 0), 0.7, 1.04),
        speedFactor: 1,
        lane: this.rng.pick([-3.5, 0, 3.5]),
        aggression: this.rng.next(),
        nitroChance: (0.15 + diff * 0.4) * dc.nitro,
      };
      let name = this.rng.pick(BOT_NAMES);
      while (usedNames.has(name)) name = this.rng.pick(BOT_NAMES);
      usedNames.add(name);
      this.racers.push(new Racer(def, look, stats, false, isBoss ? 'BOSS' : name, ai));
    }
    this.racers.push(this.player);
    // grid: player starts last (like the reference)
    const grid = [
      [70, -3.2],
      [70, 3.2],
      [61, -3.2],
      [61, 3.2],
      [52, -3.2],
      [44, 0],
    ];
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: placeFlagTexture(6, r.name === 'BOSS'), depthWrite: false, fog: false }));
      sp.scale.set(2.6, 2.6, 1);
      sp.center.set(0.1, 0);
      sp.renderOrder = 6;
      this.group.add(sp);
      this.flags.set(r, sp);
    }
    this.racers.forEach((r, i) => {
      r.s = grid[i][0];
      r.d = grid[i][1];
      r.targetD = r.d;
      r.place = i + 1;
      this.group.add(r.model.root);
    });

    // ---- boosters ----
    for (const b of setup.boosters) {
      if (b === 'heart') this.hearts += 1;
      if (b === 'shield') this.player.shieldTime = 8;
      if (b === 'magnet') this.player.magnetTime = 20;
      if (b === 'coins2x') this.coinMultiplier = 2;
      if (b === 'startNitro') this.player.nitroCharges = 2;
    }
    this.startNitro = setup.boosters.includes('startNitro');

    this.pickups.build(this.level.pickups, this.track);
    this.obstacles.build(this.level.obstacles, this.track);
    this.group.add(this.pickups.group, this.obstacles.group);
    for (const r of this.racers) this.pose(r, 0);
  }

  private startNitro = false;
  private flags = new Map<Racer, THREE.Sprite>();
  private flagPlace = new Map<Racer, number>();
  /** Debug / attract mode: the player's car is driven by the AI. */
  autoPlayer = false;

  get playerPlace() {
    return this.player.place;
  }

  get progress() {
    return clamp(this.player.s / this.track.finishS, 0, 1);
  }

  // =====================================================================
  update(dt: number, input: Input) {
    if (this.state === 'gameover') {
      this.updateVisualsOnly(dt);
      return;
    }
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCountdown && n <= 3 && n >= 1) {
        this.lastCountdown = n;
        this.events.emit('countdown', n);
      }
      if (this.countdown <= 0) {
        this.state = 'racing';
        for (const r of this.racers) r.state = 'drive';
        if (this.startNitro) {
          this.player.nitroTime = this.player.stats.nitroTime;
          this.player.v = 25;
          this.events.emit('nitro', undefined);
        }
        this.events.emit('go', undefined);
      }
      this.updateVisualsOnly(dt);
      this.player.throttle = input.throttle;
      return;
    }
    this.time += dt;

    // ---- player control ----
    const p = this.player;
    if (this.state === 'racing' && p.state !== 'finished' && this.autoPlayer) {
      this.autopilot(p, dt, false);
    } else if (this.state === 'racing' && p.state !== 'finished') {
      p.throttle = input.throttle;
      p.brake = input.brake;
      p.steerSm = damp(p.steerSm, input.steer, 9, dt);
      if (input.consumeNitro()) this.tryNitro(p);
    } else if (p.state === 'finished') {
      this.autopilot(p, dt, true);
    }

    for (const r of this.racers) if (!r.isPlayer) this.autopilot(r, dt, false);
    for (const r of this.racers) this.physics(r, dt);
    this.collideRacers(dt);
    this.updatePickups(dt);
    this.updateObstacles(dt);
    this.rank();
    for (const r of this.racers) this.pose(r, dt);
    this.pickups.update(dt);
    this.obstacles.update(dt, this.track);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    if (this.state === 'dying') {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) {
        this.state = 'gameover';
        this.events.emit('gameover', undefined);
      }
    }
  }

  private updateVisualsOnly(dt: number) {
    for (const r of this.racers) this.pose(r, dt);
    this.pickups.update(dt);
  }

  // =====================================================================
  private tryNitro(r: Racer) {
    if (r.nitroCharges <= 0 || r.nitroTime > 0 || r.state !== 'drive') return;
    r.nitroCharges--;
    r.nitroTime = r.stats.nitroTime;
    if (r.isPlayer) this.events.emit('nitro', undefined);
  }

  private hwAt(s: number) {
    return this.track.scalarAt(this.track.halfWidth, s) + CURB_W;
  }

  private physics(r: Racer, dt: number) {
    const tr = this.track;
    if (r.state === 'fall') {
      r.fallTimer -= dt;
      r.fallVel.y -= 30 * dt;
      r.fallPos.addScaledVector(r.fallVel, dt);
      if (r.fallPos.y < 0.5 && r.fallVel.y < 0 && r.fallTimer > 0.2) {
        if (this.level.biome.ground === 'ocean' || this.level.biome.ground === 'deepocean') this.effects.splash(r.fallPos.clone());
        else this.effects.explosion(r.fallPos.clone());
        r.fallVel.set(0, 0, 0);
        r.fallTimer = Math.min(r.fallTimer, 0.2);
      }
      if (r.fallTimer <= 0) this.respawn(r);
      return;
    }
    if (r.state === 'grid') return;

    const st = r.stats;
    const flags = tr.flags[tr.index(r.s)];
    // timers
    if (r.nitroTime > 0) r.nitroTime -= dt;
    if (r.boostTime > 0) r.boostTime -= dt;
    if (r.shieldTime > 0) r.shieldTime -= dt;
    if (r.invulnTime > 0) r.invulnTime -= dt;
    if (r.magnetTime > 0) r.magnetTime -= dt;
    if (r.x2Time > 0) r.x2Time -= dt;
    // nitro recharge
    if (r.nitroCharges < 3) {
      r.nitroMeter += dt / 13 + (r.drifting ? dt / 10 : 0) + (r.state === 'air' ? dt / 6 : 0);
      if (r.nitroMeter >= 1) {
        r.nitroMeter = 0;
        r.nitroCharges++;
        if (r.isPlayer) this.events.emit('nitroReady', undefined);
      }
    } else r.nitroMeter = 0;

    // ---- longitudinal ----
    const nitro = r.nitroTime > 0;
    const boost = r.boostTime > 0;
    const vmax = st.maxSpeed * r.band * (nitro ? 1.32 : 1) * (boost ? 1.18 : 1);
    if (r.state === 'drive' || r.state === 'finished') {
      if (r.throttle > 0.01) {
        const k = Math.max(0, 1 - Math.pow(r.v / vmax, 3));
        r.v += (st.accel * r.band * k * r.throttle + (nitro ? 16 : 0)) * dt;
      } else {
        r.v -= (5 + 0.004 * r.v * r.v) * dt;
      }
      if (r.brake > 0.01) r.v -= 30 * r.brake * dt;
      if (r.v > vmax) r.v -= Math.min(r.v - vmax, 14 * dt);
      // slopes (skip inside loops)
      if (!(flags & FLAG.LOOP)) {
        const fy = tr.fwd[tr.index(r.s) * 3 + 1];
        r.v -= 9.8 * 0.55 * fy * dt;
      } else r.v = Math.max(r.v, 32);
      if (nitro && r.v < vmax) r.v += 4 * dt;
    }
    r.v = Math.max(0, r.v);

    // ---- lateral ----
    const airK = r.state === 'air' ? 0.45 : 1;
    const targetLat = r.steerSm * (7.5 + r.v * 0.13) * airK;
    r.latV = damp(r.latV, targetLat, 9, dt);
    const tube = tr.scalarAt(tr.tube, r.s);
    r.drifting = false;
    let sliding = false;
    if (r.state === 'drive' || r.state === 'finished') {
      const kappa = tr.scalarAt(tr.curv, r.s);
      const need = r.v * r.v * kappa - BANK_G * tr.scalarAt(tr.bankAssist, r.s);
      const grip = st.grip * this.level.biome.grip * (tube > 0.5 ? 1.5 : 1) * (r.brake > 0.3 ? 1.08 : 1);
      const excess = Math.abs(need) - grip;
      if (excess > 0) {
        // lateral momentum builds up while the tyres are past their limit
        r.slide = clamp(r.slide - Math.sign(need) * excess * 0.85 * dt, -18, 18);
        r.drifting = excess > 1.5;
        r.v -= excess * 0.06 * dt;
        sliding = true;
      }
    }
    if (!sliding) r.slide = damp(r.slide, 0, r.state === 'air' ? 0.5 : 2.2, dt);
    r.d += (r.latV + r.slide) * dt;

    // ---- along track ----
    r.s += r.v * dt;
    if (r.s >= tr.length - 2) {
      r.s = tr.length - 2;
      r.v = Math.min(r.v, 5);
    }

    // ---- edges ----
    const hw = this.hwAt(r.s);
    const flagsNow = tr.flags[tr.index(r.s)];
    const carHalf = r.halfWidth;
    const inTube = tube > 0.5;
    for (const side of [-1, 1]) {
      const wallFlag = side < 0 ? FLAG.WALL_L : FLAG.WALL_R;
      const hasWall = inTube || (flagsNow & wallFlag) !== 0 || (flagsNow & FLAG.LOOP) !== 0;
      if (!hasWall) continue;
      const limit = inTube ? hw - 0.6 : hw - WALL_T - carHalf;
      if (side * r.d > limit) {
        const pen = side * r.d - limit;
        r.d = side * limit;
        const impact = Math.abs(r.latV + r.slide);
        // scraping along the barrier while sliding out costs speed
        if (!inTube && side * r.slide > 0) r.v -= (3 + Math.abs(r.slide) * 1.6) * dt;
        if (side * (r.latV + r.slide) > 0) {
          r.latV = -side * Math.min(4, impact * 0.4);
          r.slide = 0;
        }
        if (!inTube && (impact > 3 || pen > 0.2)) {
          r.v *= 1 - Math.min(0.05, impact * 0.004);
          if (r.isPlayer) {
            this.tr2(r.s, r.d + side * carHalf, 0.5);
            this.events.emit('wall', { pos: this.smp.pos.clone(), strength: impact });
            this.effects.sparks(this.smp.pos, this.tmpV.copy(this.smp.fwd).multiplyScalar(r.v * 0.6));
          }
        }
      }
    }

    // ---- jumps & air ----
    if (r.state === 'drive') {
      if (flagsNow & FLAG.RAMP) {
        r.state = 'air';
        r.vh = r.v * RAMP_KICK;
        r.airTime = 0;
        if (r.isPlayer) this.events.emit('jump', undefined);
      } else if (flagsNow & FLAG.GAP) {
        // drove into a gap slowly
        r.state = 'air';
        r.vh = 0;
      }
    }
    if (r.state === 'air') {
      r.airTime += dt;
      r.vh -= AIR_G * dt;
      r.h += r.vh * dt;
      if (r.h <= 0) {
        r.h = 0;
        if (flagsNow & FLAG.GAP) {
          this.startFall(r, 'fall');
          return;
        }
        r.state = 'drive';
        const hard = r.vh < -12;
        r.vh = 0;
        if (r.isPlayer) {
          this.events.emit('land', { hard });
          this.addScore(Math.round(r.airTime * 60));
          this.tr2(r.s, r.d, 0.2);
          this.effects.dust(this.smp.pos);
        }
      }
    }

    // ---- falling off the edge ----
    if (!inTube && Math.abs(r.d) > hw + 0.15) {
      this.startFall(r, 'fall');
      return;
    }

    // ---- finish ----
    if (r.state !== 'finished' && r.s >= tr.finishS) {
      r.state = 'finished';
      r.finishTime = this.time;
      this.finishedCount++;
      r.place = this.finishedCount;
      if (r.isPlayer) this.finishPlayer();
    }
  }

  private tr2(s: number, d: number, h: number) {
    this.track.surface(s, d, h, this.smp);
  }

  private startFall(r: Racer, reason: 'fall' | 'crash') {
    this.track.surface(r.s, r.d, r.h, this.smp);
    r.fallPos.copy(this.smp.pos);
    r.fallVel
      .copy(this.smp.fwd)
      .multiplyScalar(r.v * 0.8)
      .addScaledVector(this.smp.right, (r.latV + r.slide) * 1.2)
      .addScaledVector(this.smp.up, Math.max(2, r.vh));
    r.fallSpin.set(this.rng.range(-3, 3), this.rng.range(-2, 2), this.rng.range(-4, 4));
    r.state = 'fall';
    r.fallTimer = 1.5;
    r.nitroTime = 0;
    if (!r.isPlayer) this.events.emit('botFall', { name: r.name });
    if (r.isPlayer) {
      this.events.emit('fall', undefined);
      if (r.shieldTime > 0) {
        r.shieldTime = 0;
        this.events.emit('shieldBreak', undefined);
      }
      this.loseHeart(reason);
    }
  }

  private loseHeart(reason: 'fall' | 'crash') {
    if (this.state !== 'racing') return;
    this.hearts--;
    this.events.emit('heartLost', { hearts: this.hearts, reason });
    if (this.hearts <= 0) {
      this.state = 'dying';
      this.dyingTimer = reason === 'fall' ? 1.6 : 1.2;
    }
  }

  private safeS(s: number) {
    const tr = this.track;
    let k = Math.max(60, s - 30);
    for (let i = 0; i < 400; i++) {
      const f = tr.flags[tr.index(k)];
      const f2 = tr.flags[tr.index(k + 12)];
      if (!(f & (FLAG.GAP | FLAG.RAMP | FLAG.LOOP)) && !(f2 & (FLAG.GAP | FLAG.RAMP)) && tr.up[tr.index(k) * 3 + 1] > 0.7) return k;
      k -= 2;
      if (k < 60) return 60;
    }
    return k;
  }

  private respawn(r: Racer) {
    if (r.isPlayer && (this.state === 'dying' || this.state === 'gameover')) {
      r.fallTimer = 0;
      return;
    }
    r.s = this.safeS(r.s);
    r.d = 0;
    r.h = 0;
    r.vh = 0;
    r.latV = 0;
    r.slide = 0;
    r.v = r.stats.maxSpeed * 0.3;
    r.state = r.s >= this.track.finishS ? 'finished' : 'drive';
    r.invulnTime = 2;
    if (r.isPlayer) this.events.emit('respawn', undefined);
  }

  /** Revive after game over (rewarded ad). */
  revive() {
    const p = this.player;
    this.hearts = 1;
    this.state = 'racing';
    this.revivesUsed++;
    p.state = 'fall';
    p.fallTimer = 0;
    this.respawn(p);
    p.shieldTime = 4;
    p.invulnTime = 3;
    p.nitroCharges = Math.max(p.nitroCharges, 1);
  }

  // =====================================================================
  private autopilot(r: Racer, dt: number, finished: boolean) {
    if (r.state === 'fall' || r.state === 'grid') return;
    const tr = this.track;
    const ai = r.ai ?? { skill: finished ? 0.8 : 0.97, speedFactor: 1, lane: 0, aggression: 0, nitroChance: finished ? 0 : 0.8 };
    // look ahead for the tightest curve
    const look = 20 + r.v * 1.4;
    let maxNeed = 0;
    let rampAhead = false;
    for (let x = 0; x < look; x += 4) {
      const i = tr.index(r.s + x);
      const k = Math.abs(tr.curv[i]) - (BANK_G * Math.abs(tr.bankAssist[i])) / Math.max(400, r.v * r.v);
      if (k > maxNeed) maxNeed = k;
      if (tr.flags[i] & FLAG.RAMP) rampAhead = true;
    }
    const grip = r.stats.grip * this.level.biome.grip * (tr.scalarAt(tr.tube, r.s) > 0.5 ? 1.5 : 1);
    // occasional overconfident moment: carries too much speed into a turn
    if (!r.isPlayer && !finished && r.mistakeTime <= 0 && maxNeed > 0.014 && this.rng.chance((0.015 + ai.aggression * 0.04) * this.diffCfg.mistakes * dt)) r.mistakeTime = 2.5;
    const mistake = r.mistakeTime > 0 ? 1.8 : 1;
    if (r.mistakeTime > 0) r.mistakeTime -= dt;
    let target = maxNeed > 0.0005 ? Math.sqrt((grip * ai.skill * mistake) / maxNeed) : 999;
    target = Math.min(target, r.stats.maxSpeed * (finished ? 0.5 : 1.05));
    if (rampAhead) target = Math.max(target, r.stats.maxSpeed);
    if (r.mistakeTime > 0) target = r.stats.maxSpeed * 1.1;

    // rubber band against the player (keeps races tight): changes the bot's real top speed
    if (!finished && !r.isPlayer) {
      const gap = this.player.s - r.s;
      r.band = 1 + clamp(gap / 260, -0.07, 0.13) * this.diffCfg.band;
      target *= r.band;
    } else r.band = 1;
    r.throttle = r.v < target ? 1 : 0;
    r.brake = r.v > target + 4 ? clamp((r.v - target) / 10, 0, 1) : 0;

    // lane choice: avoid obstacles and other racers
    r.laneTimer -= dt;
    if (r.laneTimer <= 0) {
      r.laneTimer = 1.5 + this.rng.next() * 2;
      r.targetD = ai.lane + this.rng.range(-1.5, 1.5);
    }
    let td = r.targetD;
    for (const o of this.obstacles.list) {
      if (!o.alive) continue;
      const ds = o.s - r.s;
      if (ds < 0) continue;
      if (ds > 45) break;
      if (Math.abs(o.d - td) < o.radius + 1.6) {
        td = o.d + (td >= o.d ? 1 : -1) * (o.radius + 2.4);
        if (Math.abs(td) > this.hwAt(r.s) - CURB_W - 0.5) td = o.d - Math.sign(td - o.d) * (o.radius + 2.4);
      }
    }
    const lim = this.hwAt(r.s) - CURB_W - 0.8;
    td = clamp(td, -lim, lim);
    // compensate expected slide on curves
    const steer = clamp((td - r.d) * 0.45 - r.slide * 0.15, -1, 1) * (r.mistakeTime > 0 ? 0.1 : 1);
    r.steerSm = damp(r.steerSm, steer, 6, dt);

    // nitro on straights
    if (!finished && r.nitroCharges > 0 && r.nitroTime <= 0 && maxNeed < 0.004 && this.rng.chance(ai.nitroChance * dt)) this.tryNitro(r);
  }

  private collideRacers(dt: number) {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.state === 'fall' || a.state === 'grid') continue;
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.state === 'fall' || b.state === 'grid') continue;
        const ds = b.s - a.s;
        const dd = b.d - a.d;
        const lenSum = (a.model.def.shape.length + b.model.def.shape.length) / 2;
        const widSum = a.halfWidth + b.halfWidth;
        if (Math.abs(ds) > lenSum || Math.abs(dd) > widSum || Math.abs(a.h - b.h) > 1.5) continue;
        const overlapD = widSum - Math.abs(dd);
        const overlapS = lenSum - Math.abs(ds);
        if (overlapD < overlapS * 0.7) {
          // side contact
          const push = (overlapD / 2 + 0.02) * Math.sign(dd || 1);
          a.d -= push;
          b.d += push;
          const rel = (b.latV - a.latV) * Math.sign(dd || 1);
          if (rel < 0) {
            a.latV += rel * 0.5 * Math.sign(dd || 1);
            b.latV -= rel * 0.5 * Math.sign(dd || 1);
          }
          if ((a.isPlayer || b.isPlayer) && Math.abs(rel) > 2) this.events.emit('bump', { strength: Math.abs(rel) });
        } else {
          // rear-end: the one behind slows down, front gets a nudge
          const [back, front] = ds > 0 ? [a, b] : [b, a];
          back.s = front.s - lenSum;
          // deflect sideways so the faster car slips past instead of being blocked
          const side = Math.sign(back.d - front.d) || (this.rng.chance(0.5) ? 1 : -1);
          back.latV += side * 2.5;
          front.latV -= side * 1;
          if (back.v > front.v) {
            const dv = back.v - front.v;
            back.v -= dv * 0.45;
            front.v += dv * 0.3;
            if ((a.isPlayer || b.isPlayer) && dv > 1.5) this.events.emit('bump', { strength: dv });
          }
        }
      }
    }
    void dt;
  }

  private rank() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.state === 'finished' && b.state === 'finished') return a.finishTime - b.finishTime;
      if (a.state === 'finished') return -1;
      if (b.state === 'finished') return 1;
      return b.s - a.s;
    });
    const prev = this.player.place;
    sorted.forEach((r, i) => {
      if (r.state !== 'finished' || r.place === 0) r.place = i + 1;
    });
    if (this.player.state !== 'finished' && this.state === 'racing' && this.player.place < prev) {
      this.addScore(50 * (prev - this.player.place));
      this.events.emit('overtake', { place: this.player.place });
    }
  }

  addScore(n: number) {
    this.score += n * (this.player.x2Time > 0 ? 2 : 1);
  }

  // =====================================================================
  private updatePickups(dt: number) {
    const p = this.player;
    if (p.state === 'fall') return;
    const items = this.pickups.items;
    while (this.pickupCursor < items.length && items[this.pickupCursor].s < p.s - 10) this.pickupCursor++;
    this.track.surface(p.s, p.d, p.h + 0.8, this.smp);
    const ppos = this.smp.pos.clone();
    const magnet = p.magnetTime > 0;
    for (let i = this.pickupCursor; i < items.length; i++) {
      const it = items[i];
      if (it.s > p.s + 40) break;
      if (!it.alive) continue;
      const ds = it.s - p.s;
      if (magnet && (it.kind === 'coin' || it.kind === 'star') && ds < 30 && ds > -4 && Math.abs(it.d - p.d) < 16) {
        it.pull = Math.min(1, it.pull + dt * 2.5);
        it.world.lerp(ppos, it.pull * 0.35);
        if (it.world.distanceTo(ppos) < 2.2) this.collect(it, ppos);
        continue;
      }
      const dh = it.h - (p.h + 1);
      if (Math.abs(ds) < 2.6 && Math.abs(it.d - p.d) < p.halfWidth + 0.8 && Math.abs(dh) < 2.2) this.collect(it, ppos);
    }
  }

  private collect(it: PickupItem, pos: THREE.Vector3) {
    this.pickups.collect(it);
    const p = this.player;
    const mult = p.x2Time > 0 ? 2 : 1;
    switch (it.kind) {
      case 'coin':
        this.coins += this.coinMultiplier * mult;
        this.addScore(10);
        break;
      case 'star':
        this.combo++;
        this.comboTimer = 3;
        this.addScore(100 * this.combo);
        break;
      case 'heart':
        this.hearts = Math.min(this.maxHearts, this.hearts + 1);
        break;
      case 'nitro':
        p.nitroCharges = Math.min(3, p.nitroCharges + 1);
        break;
      case 'shield':
        p.shieldTime = 6;
        break;
      case 'magnet':
        p.magnetTime = 9;
        break;
      case 'x2':
        p.x2Time = 10;
        break;
      case 'gem':
        this.gems++;
        this.addScore(250);
        break;
    }
    this.effects.pickup(it.world.clone(), pickupColor(it.kind));
    this.events.emit('pickup', { kind: it.kind, pos, combo: this.combo });
  }

  private updateObstacles(dt: number) {
    for (const r of this.racers) {
      if (r.state === 'fall' || r.h > 1.5) continue;
      for (const o of this.obstacles.list) {
        if (!o.alive) continue;
        const ds = o.s - r.s;
        if (ds > 4) break;
        if (ds < -4) continue;
        if (Math.abs(ds) > r.model.def.shape.length / 2 + 0.6) continue;
        if (Math.abs(o.d - r.d) > o.radius + r.halfWidth) continue;
        this.track.surface(o.s, o.d, 0.8, this.smp);
        const pos = this.smp.pos.clone();
        this.obstacles.knock(o, this.smp.fwd, r.v);
        this.effects.sparks(pos, this.tmpV.copy(this.smp.fwd).multiplyScalar(r.v * 0.3), 16);
        if (!r.isPlayer) {
          r.v *= 0.7;
          continue;
        }
        if (r.shieldTime > 0 || r.invulnTime > 0) {
          this.events.emit('crash', { pos, hard: false });
          this.addScore(25);
          continue;
        }
        r.v *= 0.45;
        r.invulnTime = 1.6;
        r.latV = (r.d > o.d ? 1 : -1) * 4;
        r.nitroTime = 0;
        this.events.emit('crash', { pos, hard: true });
        this.effects.explosion(pos);
      }
    }
    void dt;
  }

  private finishPlayer() {
    const place = this.player.place;
    this.state = 'finished';
    const stars = place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0;
    this.addScore([1000, 700, 500, 300, 200, 100][place - 1] ?? 100);
    this.track.surface(this.player.s + 10, 0, 2, this.smp);
    this.effects.celebrate(this.smp.pos.clone());
    this.events.emit('finish', { place, coins: this.coins, gems: this.gems, score: this.score, time: this.time, stars });
  }

  // =====================================================================
  private pose(r: Racer, dt: number) {
    const m = r.model;
    if (r.state === 'fall') {
      m.root.matrixAutoUpdate = true;
      m.root.position.copy(r.fallPos);
      m.root.rotation.x += r.fallSpin.x * dt;
      m.root.rotation.y += r.fallSpin.y * dt;
      m.root.rotation.z += r.fallSpin.z * dt;
      r.pos.copy(r.fallPos);
      m.update(dt, r.v * 0.3, 0, false, 0, 0);
      m.root.visible = r.fallPos.y > -2;
      const fl = this.flags.get(r);
      if (fl) fl.visible = false;
      return;
    }
    m.root.visible = true;
    m.root.matrixAutoUpdate = false;
    const smp = this.smp;
    this.track.surface(r.s, r.d, r.h, smp);
    // heading follows lateral motion
    const lat = r.latV + r.slide;
    const yaw = Math.atan2(lat, Math.max(r.v, 6)) * 0.85;
    const fwd = this.tmpV.copy(smp.fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(smp.right, Math.sin(yaw));
    const right = new THREE.Vector3().crossVectors(fwd, smp.up).normalize();
    const back = fwd.clone().negate();
    this.tmpM.makeBasis(right, smp.up, back);
    this.tmpM.setPosition(smp.pos);
    m.root.matrix.copy(this.tmpM);
    m.root.matrixWorldNeedsUpdate = true;
    r.pos.copy(smp.pos);
    r.up.copy(smp.up);
    r.fwd.copy(smp.fwd);
    // body lean is smoothed so on/off throttle (AI bang-bang control, bumps) doesn't make the car twitch
    const rollT = -r.steerSm * 0.03 - clamp(r.slide * 0.008, -0.04, 0.04);
    let pitchT = r.throttle > 0 ? 0.01 : r.brake > 0 ? -0.02 : 0;
    if (r.state === 'air') pitchT = clamp(r.vh * -0.012, -0.2, 0.15);
    if (dt > 0) {
      r.visRoll = damp(r.visRoll, rollT, 6, dt);
      r.visPitch = damp(r.visPitch, pitchT, r.state === 'air' ? 6 : 4, dt);
    }
    m.update(dt, r.v, r.steerSm, r.nitroTime > 0 || r.boostTime > 0, r.visRoll, r.visPitch);
    m.shieldMesh.visible = r.shieldTime > 0;
    const flag = this.flags.get(r);
    if (flag) {
      const ahead = r.s - this.player.s;
      const near = ahead > 5 && ahead < 140;
      flag.visible = near && this.state !== 'countdown';
      if (flag.visible) {
        flag.position.copy(smp.pos).addScaledVector(smp.up, 1.5).addScaledVector(right, -r.halfWidth * 0.9);
        if (this.flagPlace.get(r) !== r.place) {
          this.flagPlace.set(r, r.place);
          (flag.material as THREE.SpriteMaterial).map = placeFlagTexture(r.place, r.name === 'BOSS');
        }
      }
    }
    // invulnerability blink
    if (r.invulnTime > 0 && r.shieldTime <= 0) m.body.visible = Math.floor(r.invulnTime * 12) % 2 === 0;
    else m.body.visible = true;
    // effects
    if (dt > 0 && r.state === 'drive') {
      if (r.drifting && Math.random() < 0.6) {
        this.track.surface(r.s - 1.6, r.d, 0.2, smp);
        this.effects.tireSmoke(smp.pos, this.tmpV.copy(smp.up).multiplyScalar(1.5));
      }
      if (r.nitroTime > 0 || r.boostTime > 0) {
        this.track.surface(r.s - r.model.def.shape.length / 2 - 0.4, r.d, 0.35, smp);
        const tc = r.model.trail.colors;
        this.effects.nitroTrail(smp.pos, this.tmpV.copy(smp.fwd).multiplyScalar(-6), tc[0], tc[1]);
      }
    }
    // boost pads (applies to everyone)
    if (dt > 0 && r.state === 'drive') {
      for (const b of this.level.boosts) {
        if (Math.abs(b.s - r.s) < 3.5 && Math.abs(b.d - r.d) < 2.4 && r.boostTime < 0.8) {
          r.boostTime = 1.3;
          r.v = Math.max(r.v, r.stats.maxSpeed * 1.12);
          if (r.isPlayer) this.events.emit('boost', undefined);
        }
      }
    }
  }

  dispose() {
    for (const f of this.flags.values()) f.material.dispose();
    for (const r of this.racers) r.model.dispose();
    this.pickups.clear();
    this.obstacles.dispose();
    this.events.clear();
  }
}
