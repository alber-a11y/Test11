import { h, coinIco, gemIco, fmt } from '../dom';
import { t, itemName } from '../../i18n/i18n';
import type { Screen } from '../UI';
import type { Game } from '../../core/Game';
import { backButton, btn, currencyBar } from './common';
import { BOOSTERS, CARS, LIVERIES, NEONS, PAINTS, RIMS, TRAILS, byId, type CarDef } from '../../meta/Catalog';
import { Economy, FREE_COINS, type ItemKind } from '../../meta/Economy';
import type { CarLook } from '../../vehicles/CarModel';
import { effectiveStats } from '../../gameplay/Racer';
import { openReward } from './Popups';

export type ShopTab = 'cars' | 'paint' | 'livery' | 'rims' | 'neon' | 'trails' | 'boosters' | 'coins';
const TABS: ShopTab[] = ['cars', 'paint', 'livery', 'rims', 'neon', 'trails', 'boosters', 'coins'];
const KIND: Partial<Record<ShopTab, ItemKind>> = { cars: 'car', paint: 'paint', livery: 'livery', rims: 'rim', neon: 'neon', trails: 'trail' };

interface Item {
  id: string;
  name: string;
  price: number;
  ads?: number;
  stars?: number;
  exclusive?: boolean;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export function statsBlock(def: CarDef, upgrades?: Record<string, number>) {
  const base = def.stats;
  const eff = effectiveStats(def, upgrades);
  const row = (k: 'speed' | 'accel' | 'grip' | 'nitro') =>
    [
      h('span', null, t(`stat.${k}`)),
      h(
        'div',
        { class: 'statbar', style: 'position:relative' },
        h('div', { class: 'up', style: `width:${Math.min(100, eff[k] * 10)}%;position:absolute;left:0;top:0;bottom:0` }),
        h('div', { style: `width:${base[k] * 10}%;position:absolute;left:0;top:0;bottom:0` }),
      ),
    ] as Node[];
  return h('div', { class: 'stats' }, ...row('speed'), ...row('accel'), ...row('grip'), ...row('nitro'));
}

export class ShopScreen implements Screen {
  el: HTMLElement;
  tab: ShopTab;
  private grid = h('div', { class: 'grid' });
  private tabsEl = h('div', { class: 'tabs' });
  private actions = h('div', { class: 'shop-actions' });
  private selected = '';
  private cur: ReturnType<typeof currencyBar>;

  constructor(private game: Game, tab: ShopTab) {
    this.tab = tab;
    this.cur = currencyBar(game);
    const preview = h('div', { class: 'preview-space' });
    preview.addEventListener('pointerdown', (e) => game.showroom.dragStart(e.clientX));
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.el = h(
      'div',
      { class: 'screen shop' },
      h('div', { class: 'header' }, backButton(() => this.leave(), game), h('h1', { class: 'title' }, t('shop')), this.cur.el),
      h('div', { class: 'shop-wrap' }, preview, h('div', { class: 'shop-body' }, this.tabsEl, this.grid, this.actions)),
    );
    this.renderTabs();
    this.selectTab(tab);
  }

  private onMove = (e: PointerEvent) => this.game.showroom.dragMove(e.clientX);
  private onUp = () => this.game.showroom.dragEnd();

  onHide() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  private leave() {
    this.game.goMenu();
  }

  private renderTabs() {
    this.tabsEl.innerHTML = '';
    for (const tb of TABS) {
      const el = h('div', { class: `tab ${tb === this.tab ? 'active' : ''}` }, t(`tab.${tb}`));
      el.addEventListener('click', () => {
        this.game.audio.sfx.play('tab');
        this.selectTab(tb);
      });
      this.tabsEl.append(el);
    }
  }

  private items(): Item[] {
    switch (this.tab) {
      case 'cars':
        return CARS;
      case 'paint':
        return PAINTS;
      case 'livery':
        return LIVERIES;
      case 'rims':
        return RIMS;
      case 'neon':
        return NEONS;
      case 'trails':
        return TRAILS;
      default:
        return [];
    }
  }

  private equippedId(): string {
    const d = this.game.save.data;
    const c = this.game.eco.custom(d.selectedCar);
    switch (this.tab) {
      case 'cars':
        return d.selectedCar;
      case 'paint':
        return c.paint;
      case 'livery':
        return c.livery;
      case 'rims':
        return c.rim;
      case 'neon':
        return c.neon;
      case 'trails':
        return c.trail;
      default:
        return '';
    }
  }

  private selectTab(tb: ShopTab) {
    this.tab = tb;
    this.renderTabs();
    this.selected = this.equippedId();
    this.renderGrid();
    this.applyPreview();
    this.renderActions();
  }

  private owned(id: string) {
    const kind = KIND[this.tab];
    if (!kind) return false;
    return this.game.eco.isLookItemUsable(kind, id, this.game.save.data.selectedCar);
  }

  private previewLook(): CarLook {
    const eco = this.game.eco;
    const d = this.game.save.data;
    if (this.tab === 'cars') {
      const id = this.selected || d.selectedCar;
      if (eco.isOwned('car', id)) return eco.look(id);
      const def = byId(CARS, id);
      return { carId: id, paint: def.paint, livery: def.livery, rim: def.rim, neon: 'off', trail: 'fire' };
    }
    const look = eco.look(d.selectedCar);
    if (this.selected) {
      if (this.tab === 'paint') look.paint = this.selected;
      if (this.tab === 'livery') look.livery = this.selected;
      if (this.tab === 'rims') look.rim = this.selected;
      if (this.tab === 'neon') look.neon = this.selected;
      if (this.tab === 'trails') look.trail = this.selected;
    }
    return look;
  }

  private applyPreview() {
    this.game.showroom.setCar(this.previewLook());
  }

  private thumb(it: Item): HTMLElement {
    const look = this.game.eco.look(this.game.save.data.selectedCar);
    switch (this.tab) {
      case 'cars': {
        const own = this.game.eco.isOwned('car', it.id);
        const def = byId(CARS, it.id);
        const l = own ? this.game.eco.look(it.id) : { carId: it.id, paint: def.paint, livery: def.livery, rim: def.rim, neon: 'off', trail: 'fire' };
        return h('img', { src: this.game.thumbs.car(l, 200, 112), alt: it.name });
      }
      case 'paint': {
        const p = byId(PAINTS, it.id);
        const c2 = p.color2 !== undefined ? hex(p.color2) : hex(p.color);
        const bg =
          p.finish === 'carbon'
            ? 'repeating-conic-gradient(#2c2f35 0 25%, #17181c 0 50%) 0 0/10px 10px'
            : p.finish === 'chrome'
              ? `radial-gradient(circle at 35% 30%, #fff, ${hex(p.color)} 45%, #333)`
              : `radial-gradient(circle at 35% 30%, ${p.finish === 'matte' ? hex(p.color) : '#ffffffaa'}, ${hex(p.color)} 40%, ${c2})`;
        return h('div', { class: 'swatch', style: `background:${bg}` });
      }
      case 'livery':
        return h('img', { src: this.game.thumbs.car({ ...look, livery: it.id }, 200, 112), alt: it.name });
      case 'rims': {
        const r = byId(RIMS, it.id);
        const spokes = Array.from({ length: r.spokes }, (_, i) => `${hex(r.color)} ${(i * 360) / r.spokes}deg ${(i * 360) / r.spokes + (r.style === 'mesh' ? 8 : 14)}deg, transparent 0 ${((i + 1) * 360) / r.spokes}deg`).join(',');
        return h('div', {
          class: 'swatch',
          style: `background: radial-gradient(circle, ${hex(r.color)} 0 14%, transparent 15% 62%, ${hex(r.color)} 63% 70%, #18191c 71%), conic-gradient(${spokes}); border-color:#222`,
        });
      }
      case 'neon': {
        const n = byId(NEONS, it.id);
        const c = n.color === 0 ? '#333' : n.color === -1 ? 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' : hex(n.color);
        return h('div', { class: 'swatch', style: `background:${c};box-shadow:0 0 22px ${n.color > 0 ? hex(n.color) : n.color === -1 ? '#f0f' : 'transparent'}` });
      }
      case 'trails': {
        const tr = byId(TRAILS, it.id);
        const bg = tr.style === 'rainbow' ? 'linear-gradient(90deg, red, orange, yellow, lime, cyan, blue, violet)' : `linear-gradient(90deg, ${hex(tr.colors[0])}, ${hex(tr.colors[1])}, transparent)`;
        return h('div', { style: `width:84px;height:26px;border-radius:13px;background:${bg};box-shadow:0 0 14px ${hex(tr.colors[1])}` });
      }
      default:
        return h('div');
    }
  }

  private priceTag(it: Item): HTMLElement {
    const eco = this.game.eco;
    const kind = KIND[this.tab]!;
    if (this.owned(it.id)) return h('div', { class: 'tag' }, it.id === this.equippedId() ? t('equipped') : t('owned'));
    if (it.exclusive) return h('div', { class: 'tag' }, '👑 ' + t('boss.only'));
    if (it.stars && eco.totalStars() < it.stars) return h('div', { class: 'tag' }, t('stars.need', { n: it.stars }));
    if (it.ads) return h('div', { class: 'tag ad-tag' }, `📺 ${eco.adProgress(kind, it.id)}/${it.ads}`);
    return h('div', { class: 'price' }, coinIco(), fmt(it.price));
  }

  private nameOf(it: Item) {
    const kind = KIND[this.tab];
    return kind && kind !== 'car' ? itemName(kind, it.id, it.name) : it.name;
  }

  private renderGrid() {
    this.grid.innerHTML = '';
    if (this.tab === 'boosters') return this.renderBoosters();
    if (this.tab === 'coins') return this.renderCoins();
    const eq = this.equippedId();
    for (const it of this.items()) {
      const card = h(
        'div',
        { class: `card ${it.id === this.selected ? 'selected' : ''} ${it.id === eq ? 'equipped' : ''}` },
        h('div', { class: 'thumb' }, this.thumb(it)),
        h('div', { class: 'name' }, this.nameOf(it)),
        this.priceTag(it),
      );
      card.addEventListener('click', () => {
        this.game.audio.sfx.play('tab');
        this.selected = it.id;
        // owned items equip immediately on tap
        if (this.owned(it.id) && it.id !== this.equippedId()) {
          this.game.eco.equip(KIND[this.tab]!, it.id);
        }
        this.renderGrid();
        this.applyPreview();
        this.renderActions();
      });
      this.grid.append(card);
    }
  }

  private renderActions() {
    this.actions.innerHTML = '';
    this.cur.refresh();
    if (this.tab === 'boosters' || this.tab === 'coins') {
      this.actions.style.display = 'none';
      return;
    }
    this.actions.style.display = '';
    const it = this.items().find((x) => x.id === this.selected);
    if (!it) return;
    const kind = KIND[this.tab]!;
    const eco = this.game.eco;
    const info = h('div', { class: 'info' }, h('div', { class: 'nm' }, this.nameOf(it)));
    if (this.tab === 'cars') {
      const def = byId(CARS, it.id);
      info.append(statsBlock(def, eco.isOwned('car', it.id) ? eco.custom(it.id).upgrades : undefined));
    }
    this.actions.append(info);
    const owned = this.owned(it.id);
    if (owned) {
      const equipped = it.id === this.equippedId();
      this.actions.append(
        btn(equipped ? t('equipped') : t('equip'), equipped ? 'dark' : 'green', () => {
          eco.equip(kind, it.id);
          this.renderGrid();
          this.renderActions();
        }, this.game),
      );
      return;
    }
    if (it.exclusive) {
      this.actions.append(h('div', { class: 'tag' }, '👑 ' + t('boss.only')));
      return;
    }
    if (it.stars && eco.totalStars() < it.stars) {
      this.actions.append(h('div', { class: 'pill' }, `★ ${eco.totalStars()}/${it.stars}`));
      return;
    }
    if (it.ads) {
      this.actions.append(
        btn(`${eco.adProgress(kind, it.id)}/${it.ads}`, 'yellow ad', async () => {
          const ok = await this.game.ads.rewarded(`shop_${kind}`);
          if (!ok) return;
          const unlocked = eco.addAdProgress(kind, it.id, it.ads!);
          if (unlocked) {
            this.game.audio.sfx.play('reward');
            eco.equip(kind, it.id);
            this.game.ui.toast(`✔ ${this.nameOf(it)}`);
          }
          this.renderGrid();
          this.renderActions();
        }, this.game),
      );
      return;
    }
    const buy = btn(h('span', { class: 'row', style: 'gap:6px' }, coinIco(), fmt(it.price)), 'green', () => {
      if (!eco.spend(it.price)) {
        this.game.audio.sfx.play('error');
        this.game.ui.toast(t('notEnough'));
        this.offerFreeCoins();
        return;
      }
      this.game.audio.sfx.play('buy');
      eco.grant(kind, it.id);
      eco.equip(kind, it.id);
      if (kind === 'car') this.game.ui.toast(t('newCar'));
      this.renderGrid();
      this.renderActions();
    }, this.game);
    if (this.game.save.data.coins < it.price) buy.classList.add('disabled');
    this.actions.append(buy);
  }

  private offerFreeCoins() {
    if (this.tab !== 'coins') setTimeout(() => this.selectTab('coins'), 600);
  }

  private renderBoosters() {
    const eco = this.game.eco;
    for (const b of BOOSTERS) {
      const card = h(
        'div',
        { class: 'card' },
        h('div', { class: 'thumb', style: 'font-size:40px' }, b.icon),
        h('div', { class: 'name' }, t(b.name)),
        h('div', { class: 'tag' }, `x${eco.boosterCount(b.id)}`),
        h(
          'div',
          { class: 'row', style: 'gap:4px' },
          btn(h('span', { class: 'row', style: 'gap:3px' }, coinIco(), String(b.price)), 'green small', () => {
            if (!eco.spend(b.price)) {
              this.game.audio.sfx.play('error');
              this.game.ui.toast(t('notEnough'));
              return;
            }
            this.game.audio.sfx.play('buy');
            eco.addBooster(b.id, 1);
            this.renderGrid();
            this.cur.refresh();
          }, this.game),
          btn('', 'yellow small ad', async () => {
            if (await this.game.ads.rewarded('shop_booster')) {
              eco.addBooster(b.id, 1);
              this.game.audio.sfx.play('reward');
              this.renderGrid();
            }
          }, this.game),
        ),
      );
      card.querySelectorAll('.coin-ico').forEach((c) => c.setAttribute('style', 'width:16px;height:16px'));
      this.grid.append(card);
    }
    this.cur.refresh();
  }

  /** Full-width offer card: text on the left, reward pill + action button stacked on the right. */
  private wideCard(title: string, sub: string, reward: HTMLElement, action: HTMLElement) {
    return h(
      'div',
      { class: 'card wide-card' },
      h(
        'div',
        { class: 'col', style: 'gap:4px;align-items:flex-start;flex:1;min-width:0' },
        h('div', { class: 'title', style: 'font-size:16px;line-height:1.1' }, title),
        h('div', { style: 'font-size:12px;opacity:.8' }, sub),
        reward,
      ),
      action,
    );
  }

  private renderCoins() {
    const eco = this.game.eco;
    const limit = this.game.ads.policy.cfg.freeCoinsPerDay;
    const left = eco.freeCoinsLeft(limit);
    const amount = FREE_COINS(this.game.save.data.level);
    const watch = btn(t('watch'), 'yellow ad', async () => {
      if (eco.freeCoinsLeft(limit) <= 0) return;
      if (await this.game.ads.rewarded('free_coins')) {
        eco.markFreeCoins();
        openReward(this.game, { coins: amount }, () => this.renderGrid());
      }
    }, this.game);
    if (left <= 0) watch.classList.add('disabled');
    this.grid.append(this.wideCard(t('freeCoins'), t('freeCoins.left', { n: left }), h('div', { class: 'pill' }, coinIco(), `+${amount}`), watch));

    const bagAmount = amount * 6;
    const bagN = Economy.COIN_BAG_ADS;
    const bagBtn = btn(`${eco.coinBagProgress()}/${bagN}`, 'yellow ad', async () => {
      if (!(await this.game.ads.rewarded('coin_bag'))) return;
      if (eco.addCoinBagProgress()) openReward(this.game, { coins: bagAmount, title: t('coinBag') }, () => this.renderGrid());
      else {
        this.game.audio.sfx.play('reward');
        this.renderGrid();
      }
    }, this.game);
    this.grid.append(this.wideCard(`💰 ${t('coinBag')}`, t('coinBag.sub', { n: bagN, c: fmt(bagAmount) }), h('div', { class: 'pill' }, coinIco(), `+${fmt(bagAmount)}`), bagBtn));

    // free gems (daily limit)
    const gemLimit = 5;
    const gemsLeft = eco.freeGemsLeft(gemLimit);
    const gemWatch = btn(t('watch'), 'yellow ad', async () => {
      if (eco.freeGemsLeft(gemLimit) <= 0) return;
      if (await this.game.ads.rewarded('free_gems')) {
        eco.markFreeGems();
        openReward(this.game, { gems: 1, title: t('freeGems') }, () => this.renderGrid());
      }
    }, this.game);
    if (gemsLeft <= 0) gemWatch.classList.add('disabled');
    this.grid.append(this.wideCard(t('freeGems'), t('freeCoins.left', { n: gemsLeft }), h('div', { class: 'pill' }, gemIco(), '+1'), gemWatch));
    // gems exchange
    const packs = [
      { gems: 5, coins: 1200 },
      { gems: 15, coins: 4000 },
      { gems: 40, coins: 12000 },
    ];
    for (const p of packs) {
      const card = h(
        'div',
        { class: 'card' },
        h('div', { class: 'thumb' }, h('div', { class: 'reward-big', style: 'font-size:22px;margin:0' }, coinIco(), fmt(p.coins))),
        h('div', { class: 'name' }, `${fmt(p.coins)} ${t('coins')}`),
        btn(h('span', { class: 'row', style: 'gap:4px' }, gemIco(), String(p.gems)), 'purple small', () => {
          if (this.game.save.data.gems < p.gems) {
            this.game.audio.sfx.play('error');
            return;
          }
          eco.addGems(-p.gems);
          eco.addCoins(p.coins);
          this.game.audio.sfx.play('buy');
          this.cur.refresh();
        }, this.game),
      );
      this.grid.append(card);
    }
    this.cur.refresh();
  }

  update() {
    // currency can change through popups
  }
}
