import type { BoosterId, UpgradeStat } from './Catalog';

export interface CarCustom {
  paint: string;
  livery: string;
  rim: string;
  neon: string;
  trail: string;
  upgrades: Record<UpgradeStat, number>;
}

export interface Settings {
  music: number;
  sfx: number;
  muted: boolean;
  vibration: boolean;
  quality: 'auto' | 'low' | 'medium' | 'high';
  controls: 'zones' | 'drag';
  lang: 'auto' | 'ru' | 'en';
}

export interface SaveData {
  version: number;
  coins: number;
  gems: number;
  level: number; // highest unlocked level
  stars: Record<number, number>;
  bestScore: Record<number, number>;
  selectedCar: string;
  ownedCars: string[];
  owned: { paints: string[]; liveries: string[]; rims: string[]; neons: string[]; trails: string[] };
  custom: Record<string, CarCustom>;
  boosters: Record<BoosterId, number>;
  adProgress: Record<string, number>; // item key -> rewarded ads watched
  chestsOpened: number[];
  daily: { lastClaim: string; streak: number };
  wheel: { lastSpin: string; extraSpins: number };
  freeCoinsAds: { day: string; count: number };
  settings: Settings;
  stats: { races: number; wins: number; coinsEarned: number; adsWatched: number; playTime: number };
  tutorialDone: boolean;
}

const KEY = 'skyrush.save.v1';
const VERSION = 1;

export const defaultUpgrades = (): Record<UpgradeStat, number> => ({ speed: 0, accel: 0, grip: 0, nitro: 0 });

export function defaultSave(): SaveData {
  return {
    version: VERSION,
    coins: 250,
    gems: 0,
    level: 1,
    stars: {},
    bestScore: {},
    selectedCar: 'striker',
    ownedCars: ['striker'],
    owned: {
      paints: ['red', 'yellow'],
      liveries: ['none', 'twin'],
      rims: ['sport', 'classic'],
      neons: ['off'],
      trails: ['fire'],
    },
    custom: {},
    boosters: { startNitro: 1, shield: 1, heart: 0, magnet: 0, coins2x: 0 },
    adProgress: {},
    chestsOpened: [],
    daily: { lastClaim: '', streak: 0 },
    wheel: { lastSpin: '', extraSpins: 0 },
    freeCoinsAds: { day: '', count: 0 },
    settings: { music: 0.6, sfx: 0.8, muted: false, vibration: true, quality: 'auto', controls: 'zones', lang: 'auto' },
    stats: { races: 0, wins: 0, coinsEarned: 0, adsWatched: 0, playTime: 0 },
    tutorialDone: false,
  };
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const k = '__t';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/** Persists progress in localStorage (swap for a platform cloud save later). */
export class SaveService {
  data: SaveData;
  private store = storage();
  private dirty = false;

  constructor() {
    this.data = this.load();
    window.addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush();
    });
    setInterval(() => this.flush(), 5000);
  }

  private load(): SaveData {
    const def = defaultSave();
    if (!this.store) return def;
    for (const key of [KEY, KEY + '.bak']) {
      try {
        const raw = this.store.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        if (typeof parsed !== 'object' || parsed === null) continue;
        return this.migrate({ ...def, ...parsed, owned: { ...def.owned, ...(parsed.owned ?? {}) }, settings: { ...def.settings, ...(parsed.settings ?? {}) }, stats: { ...def.stats, ...(parsed.stats ?? {}) }, boosters: { ...def.boosters, ...(parsed.boosters ?? {}) } });
      } catch {
        /* try backup */
      }
    }
    return def;
  }

  private migrate(d: SaveData): SaveData {
    d.version = VERSION;
    if (!d.ownedCars.includes(d.selectedCar)) d.selectedCar = d.ownedCars[0] ?? 'striker';
    if (!Number.isFinite(d.coins) || d.coins < 0) d.coins = 0;
    if (!Number.isFinite(d.level) || d.level < 1) d.level = 1;
    return d;
  }

  save() {
    this.dirty = true;
  }

  flush() {
    if (!this.dirty || !this.store) return;
    this.dirty = false;
    try {
      const raw = JSON.stringify(this.data);
      const prev = this.store.getItem(KEY);
      if (prev) this.store.setItem(KEY + '.bak', prev);
      this.store.setItem(KEY, raw);
    } catch {
      /* quota or private mode */
    }
  }

  reset() {
    this.data = defaultSave();
    this.dirty = true;
    this.flush();
  }
}
