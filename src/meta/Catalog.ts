/** All shop content. Everything is procedural, so items are just parameter sets. */

export interface CarShape {
  length: number;
  width: number;
  clearance: number;
  deck: number; // rear deck height
  hood: number; // hood height near windshield
  nose: number; // front nose height
  tail: number; // rear end height
  roof: number; // roof height
  cabinStart: number; // 0..1 from rear
  cabinEnd: number;
  rearSlope: number; // fraction of cabin used by rear window slope
  frontSlope: number; // fraction used by windshield
  cabinWidth: number; // relative to body width
  box: number; // superellipse exponent (2 = round, 6+ = boxy)
  flare: number; // fender bulge
  wheelR: number;
  wheelW: number;
  wheelbase: number; // 0..1 of length
  spoiler: 0 | 1 | 2; // none / lip / wing
  scoop: boolean;
}

export interface CarStats {
  speed: number; // 1..10
  accel: number;
  grip: number;
  nitro: number;
}

export interface CarDef {
  id: string;
  name: string;
  shape: CarShape;
  stats: CarStats;
  price: number;
  ads?: number; // unlock by watching N rewarded ads instead of coins
  stars?: number; // requires total stars
  exclusive?: boolean; // boss reward only
  paint: string;
  livery: string;
  rim: string;
}

const base: CarShape = {
  length: 4.5,
  width: 2.0,
  clearance: 0.22,
  deck: 0.98,
  hood: 0.92,
  nose: 0.62,
  tail: 0.9,
  roof: 1.32,
  cabinStart: 0.3,
  cabinEnd: 0.66,
  rearSlope: 0.35,
  frontSlope: 0.42,
  cabinWidth: 0.78,
  box: 4,
  flare: 0.08,
  wheelR: 0.38,
  wheelW: 0.32,
  wheelbase: 0.6,
  spoiler: 2,
  scoop: false,
};

const shape = (o: Partial<CarShape>): CarShape => ({ ...base, ...o });

export const CARS: CarDef[] = [
  { id: 'striker', name: 'Striker', shape: shape({}), stats: { speed: 4, accel: 4, grip: 4, nitro: 3 }, price: 0, paint: 'red', livery: 'twin', rim: 'sport' },
  { id: 'muscle', name: 'Muscle 69', shape: shape({ length: 4.8, box: 5.5, deck: 1.0, hood: 1.0, nose: 0.8, tail: 0.95, roof: 1.36, cabinStart: 0.28, cabinEnd: 0.56, rearSlope: 0.45, frontSlope: 0.3, flare: 0.05, spoiler: 1, scoop: true, wheelR: 0.39 }), stats: { speed: 5, accel: 6, grip: 3, nitro: 4 }, price: 1500, paint: 'yellow', livery: 'none', rim: 'classic' },
  { id: 'bug', name: 'Bubble', shape: shape({ length: 4.0, width: 1.85, box: 2.3, deck: 0.95, hood: 0.92, nose: 0.62, tail: 0.75, roof: 1.5, cabinStart: 0.22, cabinEnd: 0.68, rearSlope: 0.5, frontSlope: 0.4, cabinWidth: 0.8, flare: 0.16, spoiler: 0, wheelR: 0.36 }), stats: { speed: 4, accel: 5, grip: 6, nitro: 4 }, price: 0, ads: 3, paint: 'silver', livery: 'none', rim: 'classic' },
  { id: 'kaze', name: 'Kaze GT', shape: shape({ length: 4.6, box: 4.2, deck: 0.98, hood: 0.9, nose: 0.66, roof: 1.3, cabinStart: 0.3, cabinEnd: 0.64, spoiler: 2, flare: 0.1 }), stats: { speed: 6, accel: 5, grip: 6, nitro: 5 }, price: 4000, paint: 'black', livery: 'side', rim: 'mesh' },
  { id: 'rally', name: 'Rally R', shape: shape({ length: 4.1, box: 3.8, deck: 1.05, hood: 0.95, nose: 0.7, tail: 1.0, roof: 1.48, cabinStart: 0.12, cabinEnd: 0.62, rearSlope: 0.15, frontSlope: 0.4, spoiler: 1, flare: 0.12, clearance: 0.3 }), stats: { speed: 5, accel: 7, grip: 7, nitro: 4 }, price: 0, ads: 4, paint: 'blue', livery: 'number', rim: 'rally' },
  { id: 'viper', name: 'Viper X', shape: shape({ length: 4.6, width: 2.05, deck: 0.92, hood: 0.84, nose: 0.52, tail: 0.85, roof: 1.2, cabinStart: 0.32, cabinEnd: 0.62, rearSlope: 0.5, frontSlope: 0.45, flare: 0.14, box: 3.0 }), stats: { speed: 7, accel: 6, grip: 6, nitro: 6 }, price: 9000, paint: 'green', livery: 'twin', rim: 'sport' },
  { id: 'nova', name: 'Nova S', shape: shape({ length: 4.8, box: 4.0, deck: 1.0, hood: 0.95, nose: 0.7, tail: 0.95, roof: 1.42, cabinStart: 0.25, cabinEnd: 0.66, rearSlope: 0.3, frontSlope: 0.35, spoiler: 1 }), stats: { speed: 6, accel: 6, grip: 7, nitro: 5 }, price: 6000, paint: 'white', livery: 'side', rim: 'turbine' },
  { id: 'bolt', name: 'Bolt EV', shape: shape({ length: 4.7, box: 2.8, deck: 0.98, hood: 0.86, nose: 0.6, tail: 0.92, roof: 1.36, cabinStart: 0.22, cabinEnd: 0.7, rearSlope: 0.55, frontSlope: 0.45, spoiler: 0, flare: 0.06 }), stats: { speed: 7, accel: 9, grip: 6, nitro: 5 }, price: 0, ads: 6, paint: 'cyan', livery: 'gradient', rim: 'turbine' },
  { id: 'titan', name: 'Titan', shape: shape({ length: 4.9, width: 2.1, box: 6, deck: 1.15, hood: 1.15, nose: 0.95, tail: 1.1, roof: 1.75, cabinStart: 0.38, cabinEnd: 0.66, rearSlope: 0.12, frontSlope: 0.28, clearance: 0.4, wheelR: 0.46, wheelW: 0.4, spoiler: 0, flare: 0.1 }), stats: { speed: 6, accel: 6, grip: 8, nitro: 6 }, price: 12000, paint: 'orange', livery: 'flames', rim: 'rally' },
  { id: 'retro', name: 'Retro 250', shape: shape({ length: 4.4, box: 2.6, deck: 0.92, hood: 0.88, nose: 0.62, tail: 0.8, roof: 1.3, cabinStart: 0.3, cabinEnd: 0.6, rearSlope: 0.5, frontSlope: 0.35, spoiler: 0, flare: 0.18, wheelR: 0.37 }), stats: { speed: 7, accel: 6, grip: 7, nitro: 6 }, price: 15000, paint: 'racingred', livery: 'number', rim: 'classic' },
  { id: 'blade', name: 'Blade', shape: shape({ length: 4.7, width: 2.1, box: 7, deck: 0.9, hood: 0.78, nose: 0.46, tail: 0.9, roof: 1.14, cabinStart: 0.3, cabinEnd: 0.6, rearSlope: 0.55, frontSlope: 0.5, flare: 0.06, spoiler: 2 }), stats: { speed: 8, accel: 7, grip: 7, nitro: 7 }, price: 22000, paint: 'purple', livery: 'checker', rim: 'mesh' },
  { id: 'mamba', name: 'Mamba', shape: shape({ length: 4.6, width: 2.05, box: 3.2, deck: 0.9, hood: 0.82, nose: 0.5, tail: 0.88, roof: 1.16, cabinStart: 0.34, cabinEnd: 0.6, rearSlope: 0.6, frontSlope: 0.5, flare: 0.16 }), stats: { speed: 8, accel: 8, grip: 8, nitro: 7 }, price: 0, ads: 10, paint: 'lime', livery: 'twin', rim: 'sport' },
  { id: 'phantom', name: 'Phantom', shape: shape({ length: 4.9, width: 2.15, box: 3.6, deck: 0.88, hood: 0.78, nose: 0.44, tail: 0.86, roof: 1.12, cabinStart: 0.36, cabinEnd: 0.62, rearSlope: 0.6, frontSlope: 0.52, flare: 0.14, spoiler: 2 }), stats: { speed: 9, accel: 8, grip: 8, nitro: 8 }, price: 40000, stars: 60, paint: 'carbon', livery: 'side', rim: 'turbine' },
  { id: 'zenith', name: 'Zenith', shape: shape({ length: 4.8, width: 2.1, box: 2.9, deck: 0.86, hood: 0.76, nose: 0.42, tail: 0.84, roof: 1.1, cabinStart: 0.36, cabinEnd: 0.64, rearSlope: 0.65, frontSlope: 0.5, flare: 0.18 }), stats: { speed: 10, accel: 9, grip: 9, nitro: 8 }, price: 75000, stars: 120, paint: 'gold', livery: 'twin', rim: 'mesh' },
  { id: 'inferno', name: 'Inferno', shape: shape({ length: 4.8, width: 2.15, box: 5, deck: 0.9, hood: 0.8, nose: 0.46, tail: 0.92, roof: 1.12, cabinStart: 0.34, cabinEnd: 0.6, rearSlope: 0.55, frontSlope: 0.5, flare: 0.12, spoiler: 2, scoop: true }), stats: { speed: 10, accel: 10, grip: 9, nitro: 10 }, price: 0, exclusive: true, paint: 'lava', livery: 'flames', rim: 'sport' },
];

export interface PaintDef {
  id: string;
  name: string;
  color: number;
  color2?: number; // for chameleon / gradient
  finish: 'gloss' | 'metal' | 'matte' | 'pearl' | 'chrome' | 'carbon';
  price: number;
  ads?: number;
}

export const PAINTS: PaintDef[] = [
  { id: 'red', name: 'Race Red', color: 0xe0201c, finish: 'gloss', price: 0 },
  { id: 'yellow', name: 'Taxi Yellow', color: 0xf5c518, finish: 'gloss', price: 0 },
  { id: 'blue', name: 'Ocean Blue', color: 0x1a5fe0, finish: 'gloss', price: 300 },
  { id: 'white', name: 'Snow', color: 0xf2f2f2, finish: 'gloss', price: 300 },
  { id: 'black', name: 'Midnight', color: 0x15161a, finish: 'gloss', price: 300 },
  { id: 'green', name: 'Venom', color: 0x22b04a, finish: 'gloss', price: 400 },
  { id: 'orange', name: 'Sunset', color: 0xff6a12, finish: 'gloss', price: 400 },
  { id: 'cyan', name: 'Ice', color: 0x22c8e8, finish: 'metal', price: 600 },
  { id: 'purple', name: 'Grape', color: 0x7a2ae0, finish: 'metal', price: 700 },
  { id: 'silver', name: 'Silver', color: 0xb8bcc4, finish: 'metal', price: 500 },
  { id: 'lime', name: 'Acid', color: 0x8ef02a, finish: 'gloss', price: 0, ads: 2 },
  { id: 'pink', name: 'Bubblegum', color: 0xff5ab4, finish: 'gloss', price: 800 },
  { id: 'racingred', name: 'Rosso', color: 0xb5121b, finish: 'metal', price: 900 },
  { id: 'matteblack', name: 'Stealth', color: 0x202226, finish: 'matte', price: 1200 },
  { id: 'mattegreen', name: 'Army', color: 0x4a5a32, finish: 'matte', price: 1200 },
  { id: 'gold', name: 'Gold', color: 0xd8a52a, finish: 'chrome', price: 0, ads: 5 },
  { id: 'chrome', name: 'Chrome', color: 0xdfe4ea, finish: 'chrome', price: 5000 },
  { id: 'carbon', name: 'Carbon', color: 0x222428, finish: 'carbon', price: 3000 },
  { id: 'chameleon', name: 'Chameleon', color: 0x6a2ae0, color2: 0x1ad8a0, finish: 'pearl', price: 0, ads: 4 },
  { id: 'sunrise', name: 'Sunrise', color: 0xff3a6a, color2: 0xffc02a, finish: 'pearl', price: 4000 },
  { id: 'lava', name: 'Lava', color: 0x2a0a06, color2: 0xff4a10, finish: 'pearl', price: 0, ads: 6 },
];

export interface LiveryDef {
  id: string;
  name: string;
  price: number;
  ads?: number;
}

export const LIVERIES: LiveryDef[] = [
  { id: 'none', name: 'Clean', price: 0 },
  { id: 'twin', name: 'Twin Stripes', price: 0 },
  { id: 'side', name: 'Side Line', price: 400 },
  { id: 'number', name: 'Race Number', price: 600 },
  { id: 'checker', name: 'Checker', price: 1000 },
  { id: 'flames', name: 'Flames', price: 0, ads: 3 },
  { id: 'gradient', name: 'Fade', price: 1500 },
  { id: 'camo', name: 'Camo', price: 2000 },
  { id: 'tiger', name: 'Tiger', price: 0, ads: 4 },
  { id: 'bolt', name: 'Lightning', price: 0, ads: 3 },
  { id: 'stars', name: 'Starry', price: 0, ads: 2 },
];

export interface RimDef {
  id: string;
  name: string;
  spokes: number;
  style: 'spoke' | 'mesh' | 'turbine' | 'solid';
  color: number;
  price: number;
  ads?: number;
}

export const RIMS: RimDef[] = [
  { id: 'sport', name: 'Sport', spokes: 5, style: 'spoke', color: 0xc8ccd2, price: 0 },
  { id: 'classic', name: 'Classic', spokes: 8, style: 'spoke', color: 0xe0e2e6, price: 0 },
  { id: 'mesh', name: 'Mesh', spokes: 10, style: 'mesh', color: 0x2a2c30, price: 600 },
  { id: 'rally', name: 'Rally', spokes: 6, style: 'solid', color: 0xf0f0f0, price: 500 },
  { id: 'turbine', name: 'Turbine', spokes: 12, style: 'turbine', color: 0x9aa0a8, price: 900 },
  { id: 'gold', name: 'Gold', spokes: 6, style: 'spoke', color: 0xd8a52a, price: 0, ads: 2 },
  { id: 'red', name: 'Red Line', spokes: 5, style: 'spoke', color: 0xd8201c, price: 1200 },
  { id: 'neonblue', name: 'Electric', spokes: 10, style: 'mesh', color: 0x22a8ff, price: 0, ads: 3 },
  { id: 'carbonred', name: 'Carbon Red', spokes: 7, style: 'turbine', color: 0x8a1018, price: 0, ads: 3 },
  { id: 'bronze', name: 'Bronze', spokes: 6, style: 'solid', color: 0xb8742a, price: 0, ads: 2 },
];

export interface NeonDef {
  id: string;
  name: string;
  color: number; // 0 = off, -1 = rainbow
  price: number;
  ads?: number;
}

export const NEONS: NeonDef[] = [
  { id: 'off', name: 'Off', color: 0, price: 0 },
  { id: 'green', name: 'Toxic', color: 0x2aff5a, price: 500 },
  { id: 'red', name: 'Blood', color: 0xff2a2a, price: 500 },
  { id: 'purple', name: 'Violet', color: 0xb02aff, price: 700 },
  { id: 'blue', name: 'Ice', color: 0x2a8aff, price: 700 },
  { id: 'pink', name: 'Hot Pink', color: 0xff2ab4, price: 0, ads: 2 },
  { id: 'gold', name: 'Gold', color: 0xffc02a, price: 1500 },
  { id: 'rainbow', name: 'Rainbow', color: -1, price: 0, ads: 5 },
  { id: 'cyan', name: 'Cyber', color: 0x2affea, price: 0, ads: 2 },
  { id: 'white', name: 'Daylight', color: 0xf0f6ff, price: 0, ads: 3 },
];

export interface TrailDef {
  id: string;
  name: string;
  colors: [number, number];
  style: 'flame' | 'plasma' | 'rainbow' | 'hearts' | 'lightning';
  price: number;
  ads?: number;
}

export const TRAILS: TrailDef[] = [
  { id: 'fire', name: 'Fire', colors: [0xffd02a, 0xff3a0a], style: 'flame', price: 0 },
  { id: 'blue', name: 'Blue Flame', colors: [0xbff4ff, 0x2a6aff], style: 'flame', price: 800 },
  { id: 'plasma', name: 'Plasma', colors: [0xff9aff, 0x8a2aff], style: 'plasma', price: 1500 },
  { id: 'green', name: 'Toxic', colors: [0xdaff9a, 0x2ad83a], style: 'plasma', price: 0, ads: 2 },
  { id: 'rainbow', name: 'Rainbow', colors: [0xff2a2a, 0x2a2aff], style: 'rainbow', price: 0, ads: 4 },
  { id: 'hearts', name: 'Love', colors: [0xff8ab4, 0xff2a6a], style: 'hearts', price: 2500 },
  { id: 'lightning', name: 'Storm', colors: [0xffffff, 0x2ae8ff], style: 'lightning', price: 4000 },
  { id: 'gold', name: 'Gold Rush', colors: [0xfff4b0, 0xffb01a], style: 'plasma', price: 0, ads: 3 },
  { id: 'ice', name: 'Frost', colors: [0xffffff, 0x8ae0ff], style: 'flame', price: 0, ads: 2 },
];

export type BoosterId = 'startNitro' | 'shield' | 'heart' | 'magnet' | 'coins2x';

export interface BoosterDef {
  id: BoosterId;
  name: string;
  price: number;
  icon: string;
}

export const BOOSTERS: BoosterDef[] = [
  { id: 'startNitro', name: 'booster.startNitro', price: 150, icon: '🚀' },
  { id: 'shield', name: 'booster.shield', price: 200, icon: '🛡️' },
  { id: 'heart', name: 'booster.heart', price: 250, icon: '❤️' },
  { id: 'magnet', name: 'booster.magnet', price: 150, icon: '🧲' },
  { id: 'coins2x', name: 'booster.coins2x', price: 300, icon: '💰' },
];

export const UPGRADE_MAX = 10;
export type UpgradeStat = keyof CarStats;
export const upgradePrice = (level: number) => Math.round(200 * Math.pow(1.5, level));

export const byId = <T extends { id: string }>(arr: T[], id: string): T => arr.find((x) => x.id === id) ?? arr[0];
