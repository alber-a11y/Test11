import { CARS, LIVERIES, NEONS, PAINTS, RIMS, TRAILS, UPGRADE_MAX, byId, upgradePrice, type BoosterId, type UpgradeStat } from './Catalog';
import { defaultUpgrades, type CarCustom, type SaveService } from './SaveService';
import type { CarLook } from '../vehicles/CarModel';
import { Rng } from '../core/Rng';

export type ItemKind = 'car' | 'paint' | 'livery' | 'rim' | 'neon' | 'trail';

export const PLACE_REWARD = [120, 80, 55, 30, 20, 12];
/** Harder rivals pay more. */
export const DIFFICULTY_REWARD = { easy: 0.75, normal: 1, hard: 1.35, extreme: 1.75 } as const;
export const levelReward = (level: number, place: number, difficulty: keyof typeof DIFFICULTY_REWARD = 'normal') =>
  Math.round((PLACE_REWARD[place - 1] ?? 10) * (1 + level * 0.06) * DIFFICULTY_REWARD[difficulty]);
export const chestEvery = 5;
export const FREE_COINS = (level: number) => 100 + level * 10;

const today = () => new Date().toISOString().slice(0, 10);

export class Economy {
  constructor(private s: SaveService) {}

  get d() {
    return this.s.data;
  }

  addCoins(n: number) {
    this.d.coins += Math.round(n);
    if (n > 0) this.d.stats.coinsEarned += Math.round(n);
    this.s.save();
  }

  addGems(n: number) {
    this.d.gems += n;
    this.s.save();
  }

  spend(n: number): boolean {
    if (this.d.coins < n) return false;
    this.d.coins -= n;
    this.s.save();
    return true;
  }

  totalStars(): number {
    return Object.values(this.d.stars).reduce((a, b) => a + b, 0);
  }

  // ---------------- ownership ----------------
  private ownedList(kind: ItemKind): string[] {
    switch (kind) {
      case 'car':
        return this.d.ownedCars;
      case 'paint':
        return this.d.owned.paints;
      case 'livery':
        return this.d.owned.liveries;
      case 'rim':
        return this.d.owned.rims;
      case 'neon':
        return this.d.owned.neons;
      case 'trail':
        return this.d.owned.trails;
    }
  }

  isOwned(kind: ItemKind, id: string) {
    return this.ownedList(kind).includes(id);
  }

  grant(kind: ItemKind, id: string) {
    const l = this.ownedList(kind);
    if (!l.includes(id)) l.push(id);
    this.s.save();
  }

  adKey(kind: ItemKind, id: string) {
    return `${kind}:${id}`;
  }

  adProgress(kind: ItemKind, id: string) {
    return this.d.adProgress[this.adKey(kind, id)] ?? 0;
  }

  /** Records a watched ad toward an item; returns true when it got unlocked. */
  addAdProgress(kind: ItemKind, id: string, needed: number): boolean {
    const k = this.adKey(kind, id);
    this.d.adProgress[k] = (this.d.adProgress[k] ?? 0) + 1;
    this.d.stats.adsWatched++;
    if (this.d.adProgress[k] >= needed) {
      this.grant(kind, id);
      return true;
    }
    this.s.save();
    return false;
  }

  // ---------------- per-car customisation ----------------
  custom(carId: string): CarCustom {
    let c = this.d.custom[carId];
    if (!c) {
      const def = byId(CARS, carId);
      c = { paint: def.paint, livery: def.livery, rim: def.rim, neon: 'off', trail: 'fire', upgrades: defaultUpgrades() };
      this.d.custom[carId] = c;
    }
    return c;
  }

  look(carId: string): CarLook {
    const c = this.custom(carId);
    return { carId, paint: c.paint, livery: c.livery, rim: c.rim, neon: c.neon, trail: c.trail };
  }

  equip(kind: ItemKind, id: string) {
    if (kind === 'car') {
      this.d.selectedCar = id;
    } else {
      const c = this.custom(this.d.selectedCar);
      if (kind === 'paint') c.paint = id;
      if (kind === 'livery') c.livery = id;
      if (kind === 'rim') c.rim = id;
      if (kind === 'neon') c.neon = id;
      if (kind === 'trail') c.trail = id;
    }
    this.s.save();
  }

  /** Cars' default paint/livery/rim come free with the car. */
  carDefaultsOwned(carId: string) {
    const def = byId(CARS, carId);
    return { paint: def.paint, livery: def.livery, rim: def.rim };
  }

  isLookItemUsable(kind: ItemKind, id: string, carId: string) {
    if (this.isOwned(kind, id)) return true;
    const dflt = this.carDefaultsOwned(carId);
    return (kind === 'paint' && dflt.paint === id) || (kind === 'livery' && dflt.livery === id) || (kind === 'rim' && dflt.rim === id);
  }

  upgrade(carId: string, stat: UpgradeStat): boolean {
    const c = this.custom(carId);
    const lvl = c.upgrades[stat];
    if (lvl >= UPGRADE_MAX) return false;
    if (!this.spend(upgradePrice(lvl))) return false;
    c.upgrades[stat] = lvl + 1;
    this.s.save();
    return true;
  }

  freeUpgrade(carId: string, stat: UpgradeStat) {
    const c = this.custom(carId);
    if (c.upgrades[stat] < UPGRADE_MAX) c.upgrades[stat]++;
    this.s.save();
  }

  // ---------------- boosters ----------------
  boosterCount(id: BoosterId) {
    return this.d.boosters[id] ?? 0;
  }

  addBooster(id: BoosterId, n = 1) {
    this.d.boosters[id] = (this.d.boosters[id] ?? 0) + n;
    this.s.save();
  }

  useBooster(id: BoosterId): boolean {
    if ((this.d.boosters[id] ?? 0) <= 0) return false;
    this.d.boosters[id]--;
    this.s.save();
    return true;
  }

  // ---------------- progress ----------------
  completeLevel(level: number, place: number, score: number) {
    const stars = place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0;
    this.d.stats.races++;
    if (place === 1) this.d.stats.wins++;
    if (stars > 0) {
      this.d.stars[level] = Math.max(this.d.stars[level] ?? 0, stars);
      if (level >= this.d.level) this.d.level = level + 1;
    }
    this.d.bestScore[level] = Math.max(this.d.bestScore[level] ?? 0, score);
    this.s.save();
    return stars;
  }

  skipLevel(level: number) {
    if (level >= this.d.level) this.d.level = level + 1;
    this.s.save();
  }

  // ---------------- chests ----------------
  chestState(chestLevel: number): 'locked' | 'ready' | 'opened' {
    if (this.d.chestsOpened.includes(chestLevel)) return 'opened';
    return this.d.level > chestLevel ? 'ready' : 'locked';
  }

  /** Rolls and grants chest content. */
  openChest(chestLevel: number): { coins: number; gems: number; item?: { kind: ItemKind; id: string; name: string } } {
    const rng = new Rng(chestLevel * 977 + 3);
    const coins = 250 + chestLevel * 40;
    const gems = rng.int(1, 3);
    let item: { kind: ItemKind; id: string; name: string } | undefined;
    if (chestLevel % 10 === 0) {
      // boss chest: exclusive car on the first one, then cosmetics
      const boss = CARS.find((c) => c.exclusive)!;
      if (!this.isOwned('car', boss.id)) item = { kind: 'car', id: boss.id, name: boss.name };
    }
    if (!item) {
      const pools: { kind: ItemKind; list: { id: string; name: string }[] }[] = [
        { kind: 'paint', list: PAINTS },
        { kind: 'livery', list: LIVERIES },
        { kind: 'rim', list: RIMS },
        { kind: 'neon', list: NEONS },
        { kind: 'trail', list: TRAILS },
      ];
      const candidates = pools.flatMap((p) => p.list.filter((x) => !this.isOwned(p.kind, x.id)).map((x) => ({ kind: p.kind, id: x.id, name: x.name })));
      if (candidates.length && rng.chance(0.75)) item = rng.pick(candidates);
    }
    this.d.chestsOpened.push(chestLevel);
    this.addCoins(coins);
    this.addGems(gems);
    if (item) this.grant(item.kind, item.id);
    return { coins, gems, item };
  }

  // ---------------- daily / wheel / free coins ----------------
  dailyAvailable(): boolean {
    return this.d.daily.lastClaim !== today();
  }

  dailyDayIndex(): number {
    const last = this.d.daily.lastClaim;
    if (!last) return 0;
    const diff = Math.round((Date.parse(today()) - Date.parse(last)) / 86400000);
    if (diff === 1) return this.d.daily.streak % 7;
    if (diff === 0) return (this.d.daily.streak - 1 + 7) % 7;
    return 0;
  }

  static DAILY = [100, 150, 200, 300, 400, 600, 1000];

  claimDaily(mult: number) {
    const idx = this.dailyDayIndex();
    const reward = Economy.DAILY[idx] * mult;
    this.d.daily.streak = idx + 1;
    this.d.daily.lastClaim = today();
    this.addCoins(reward);
    if (idx === 6) this.addGems(3 * mult);
    return reward;
  }

  wheelFree(): boolean {
    return this.d.wheel.lastSpin !== today();
  }

  markWheelSpin(free: boolean) {
    if (free) this.d.wheel.lastSpin = today();
    this.s.save();
  }

  freeCoinsLeft(limit: number) {
    if (this.d.freeCoinsAds.day !== today()) return limit;
    return Math.max(0, limit - this.d.freeCoinsAds.count);
  }

  freeGemsLeft(limit: number) {
    const f = this.d.freeGemsAds ?? { day: '', count: 0 };
    if (f.day !== today()) return limit;
    return Math.max(0, limit - f.count);
  }

  markFreeGems() {
    if (!this.d.freeGemsAds || this.d.freeGemsAds.day !== today()) this.d.freeGemsAds = { day: today(), count: 0 };
    this.d.freeGemsAds.count++;
    this.d.stats.adsWatched++;
    this.s.save();
  }

  /** Coin bag: watch N ads in a row (progress is kept), then the bag pays out and resets. */
  static COIN_BAG_ADS = 3;
  coinBagProgress() {
    return this.d.adProgress['bag'] ?? 0;
  }

  addCoinBagProgress(): boolean {
    const n = this.coinBagProgress() + 1;
    this.d.stats.adsWatched++;
    if (n >= Economy.COIN_BAG_ADS) {
      this.d.adProgress['bag'] = 0;
      this.s.save();
      return true;
    }
    this.d.adProgress['bag'] = n;
    this.s.save();
    return false;
  }

  markFreeCoins() {
    if (this.d.freeCoinsAds.day !== today()) this.d.freeCoinsAds = { day: today(), count: 0 };
    this.d.freeCoinsAds.count++;
    this.d.stats.adsWatched++;
    this.s.save();
  }
}
