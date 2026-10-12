export type BiomeId = 'sky' | 'port' | 'bridge' | 'slide' | 'desert' | 'neon' | 'snow' | 'volcano';
export type GroundKind = 'ocean' | 'deepocean' | 'sand' | 'snow' | 'lava' | 'city';
export type RoadStyle = 'asphalt' | 'stripes' | 'neon' | 'ice' | 'glass' | 'rock';

export interface Biome {
  id: BiomeId;
  nameKey: string;
  sky: { top: number; horizon: number; bottom: number; sun: number; clouds: number; cloudColor: number; stars: number };
  fog: { color: number; near: number; far: number };
  light: { sun: number; sunIntensity: number; hemiSky: number; hemiGround: number; hemiIntensity: number; exposure: number };
  ground: GroundKind;
  groundColor: number;
  groundColor2: number;
  road: { style: RoadStyle; base: number; base2: number; line: number; edge: number; curbA: number; curbB: number; wall: number; under: number };
  grip: number;
  tubeWeight: number;
  music: number; // music style index
  speedLines: number;
  /** track altitude band: min, max, start */
  altitude?: [number, number, number];
}

export const BIOMES: Biome[] = [
  {
    id: 'sky', nameKey: 'biome.sky',
    sky: { top: 0x1d7fe6, horizon: 0x9fd6ff, bottom: 0x4aa6e8, sun: 0xfff3d0, clouds: 0.55, cloudColor: 0xffffff, stars: 0 },
    fog: { color: 0x9fd2f5, near: 250, far: 1400 },
    light: { sun: 0xfff1dc, sunIntensity: 2.6, hemiSky: 0xbfe3ff, hemiGround: 0xf0c890, hemiIntensity: 0.8, exposure: 1.0 },
    ground: 'ocean', groundColor: 0x1673c7, groundColor2: 0x3fc3e6,
    road: { style: 'stripes', base: 0xff9418, base2: 0xffbe2e, line: 0xfff1b0, edge: 0xffffff, curbA: 0xe8322e, curbB: 0xffffff, wall: 0xf7f2ea, under: 0xe08a2c },
    grip: 1, tubeWeight: 0.3, music: 0, speedLines: 1,
  },
  {
    id: 'port', nameKey: 'biome.port',
    sky: { top: 0x1f7ae0, horizon: 0xa8dcff, bottom: 0x6fb5e8, sun: 0xffffff, clouds: 0.45, cloudColor: 0xffffff, stars: 0 },
    fog: { color: 0xa7d4f2, near: 260, far: 1300 },
    light: { sun: 0xfff4e0, sunIntensity: 2.7, hemiSky: 0xcbe6ff, hemiGround: 0x8a7a6a, hemiIntensity: 1.0, exposure: 1.0 },
    ground: 'ocean', groundColor: 0x0f5e9e, groundColor2: 0x2a8fc4,
    road: { style: 'asphalt', base: 0x4a4f57, base2: 0x3d4148, line: 0xf2f2f2, edge: 0xffc12e, curbA: 0xe8572e, curbB: 0xffffff, wall: 0xd84a35, under: 0x2b2f36 },
    grip: 1, tubeWeight: 0.15, music: 1, speedLines: 0.7, altitude: [9, 30, 12],
  },
  {
    id: 'bridge', nameKey: 'biome.bridge',
    sky: { top: 0x2a86e8, horizon: 0xb5e0ff, bottom: 0x7cc0ee, sun: 0xfff6dd, clouds: 0.35, cloudColor: 0xffffff, stars: 0 },
    fog: { color: 0xb0daf6, near: 240, far: 1300 },
    light: { sun: 0xffeccc, sunIntensity: 2.6, hemiSky: 0xcfe8ff, hemiGround: 0xb07a4a, hemiIntensity: 1.0, exposure: 1.0 },
    ground: 'ocean', groundColor: 0x135f9a, groundColor2: 0x2d9bd0,
    road: { style: 'asphalt', base: 0x484c53, base2: 0x3a3e45, line: 0xf5f5f5, edge: 0xffb21e, curbA: 0xee6a3a, curbB: 0xffffff, wall: 0x8a9099, under: 0x55595f },
    grip: 1, tubeWeight: 0.1, music: 2, speedLines: 0.8, altitude: [30, 75, 42],
  },
  {
    id: 'slide', nameKey: 'biome.slide',
    sky: { top: 0x0a5fd8, horizon: 0x5fd0ff, bottom: 0x1a7fe0, sun: 0xe8fbff, clouds: 0.3, cloudColor: 0xdff6ff, stars: 0 },
    fog: { color: 0x3fa6ef, near: 160, far: 1000 },
    light: { sun: 0xe0f6ff, sunIntensity: 2.4, hemiSky: 0x9fe0ff, hemiGround: 0x1060b0, hemiIntensity: 1.3, exposure: 1.1 },
    ground: 'deepocean', groundColor: 0x0b4fb0, groundColor2: 0x29a8ef,
    road: { style: 'glass', base: 0x2e8cf0, base2: 0x5cc4ff, line: 0xd8f6ff, edge: 0x9ae6ff, curbA: 0x9ae6ff, curbB: 0xffffff, wall: 0x6fd0ff, under: 0x1a62c0 },
    grip: 1, tubeWeight: 1.6, music: 3, speedLines: 1.2,
  },
  {
    id: 'desert', nameKey: 'biome.desert',
    sky: { top: 0x3a8fe0, horizon: 0xffe2b0, bottom: 0xf0c890, sun: 0xfff0c0, clouds: 0.2, cloudColor: 0xfff4e4, stars: 0 },
    fog: { color: 0xf3d6a8, near: 220, far: 1200 },
    light: { sun: 0xffe2b0, sunIntensity: 3.0, hemiSky: 0xffe8c8, hemiGround: 0xc87a40, hemiIntensity: 1.0, exposure: 1.0 },
    ground: 'sand', groundColor: 0xe0a35c, groundColor2: 0xf3c98a,
    road: { style: 'asphalt', base: 0x5a4c44, base2: 0x4c4039, line: 0xfff0d0, edge: 0xffffff, curbA: 0xd8452a, curbB: 0xfff4e0, wall: 0xc8693a, under: 0xa65a32 },
    grip: 0.97, tubeWeight: 0.2, music: 4, speedLines: 0.8,
  },
  {
    id: 'neon', nameKey: 'biome.neon',
    sky: { top: 0x090320, horizon: 0x6a1a8a, bottom: 0x1a0838, sun: 0xff4fd8, clouds: 0.25, cloudColor: 0x5a2a8a, stars: 1 },
    fog: { color: 0x2a0d4a, near: 150, far: 1000 },
    light: { sun: 0xb07aff, sunIntensity: 1.4, hemiSky: 0x7a4aff, hemiGround: 0x200a3a, hemiIntensity: 0.9, exposure: 1.15 },
    ground: 'city', groundColor: 0x120a24, groundColor2: 0x2a1450,
    road: { style: 'neon', base: 0x1a1a26, base2: 0x14141e, line: 0x2ff3ff, edge: 0xff2fd0, curbA: 0xff2fd0, curbB: 0x2ff3ff, wall: 0x2a2440, under: 0x101018 },
    grip: 1, tubeWeight: 0.3, music: 5, speedLines: 1.2,
  },
  {
    id: 'snow', nameKey: 'biome.snow',
    sky: { top: 0x5d9ee8, horizon: 0xe6f2ff, bottom: 0xc8def2, sun: 0xffffff, clouds: 0.5, cloudColor: 0xffffff, stars: 0 },
    fog: { color: 0xdbe9f7, near: 180, far: 1100 },
    light: { sun: 0xffffff, sunIntensity: 2.5, hemiSky: 0xe0eeff, hemiGround: 0x9ab0c8, hemiIntensity: 1.2, exposure: 0.95 },
    ground: 'snow', groundColor: 0xe8f0fa, groundColor2: 0xbcd0e6,
    road: { style: 'ice', base: 0x7f93ad, base2: 0x92a8c2, line: 0xffffff, edge: 0x45c8ff, curbA: 0x2e7be8, curbB: 0xffffff, wall: 0xdfeaf6, under: 0x6f8098 },
    grip: 0.9, tubeWeight: 0.35, music: 6, speedLines: 0.9,
  },
  {
    id: 'volcano', nameKey: 'biome.volcano',
    sky: { top: 0x2a0d12, horizon: 0xd8542a, bottom: 0x5a1a10, sun: 0xffb060, clouds: 0.5, cloudColor: 0x4a2a2a, stars: 0.3 },
    fog: { color: 0x6a2a1a, near: 140, far: 950 },
    light: { sun: 0xffb27a, sunIntensity: 2.0, hemiSky: 0xff9a6a, hemiGround: 0x3a1008, hemiIntensity: 1.0, exposure: 1.1 },
    ground: 'lava', groundColor: 0x2a1410, groundColor2: 0xff5a10,
    road: { style: 'rock', base: 0x3a3436, base2: 0x2e292b, line: 0xffd04a, edge: 0xff6a1a, curbA: 0xff4a1a, curbB: 0x2a2a2a, wall: 0x4a3a36, under: 0x241c1c },
    grip: 1, tubeWeight: 0.25, music: 7, speedLines: 1,
  },
];

export const LEVELS_PER_BIOME = 5;

export function biomeForLevel(level: number): Biome {
  const idx = Math.floor((level - 1) / LEVELS_PER_BIOME) % BIOMES.length;
  return BIOMES[idx];
}

export function isBossLevel(level: number): boolean {
  return level % 10 === 0;
}
