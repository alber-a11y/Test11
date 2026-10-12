import { h, coinIco, fmt } from '../dom';
import { t } from '../../i18n/i18n';
import type { Screen } from '../UI';
import type { Game } from '../../core/Game';
import { backButton, btn, currencyBar } from './common';
import { CARS, UPGRADE_MAX, byId, upgradePrice, type UpgradeStat } from '../../meta/Catalog';
import { statsBlock } from './Shop';

export class GarageScreen implements Screen {
  el: HTMLElement;
  private body = h('div', { class: 'shop-body' });
  private cur: ReturnType<typeof currencyBar>;

  constructor(private game: Game) {
    this.cur = currencyBar(game);
    const preview = h('div', { class: 'preview-space' });
    preview.addEventListener('pointerdown', (e) => game.showroom.dragStart(e.clientX));
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.el = h(
      'div',
      { class: 'screen shop' },
      h('div', { class: 'header' }, backButton(() => game.goMenu(), game), h('h1', { class: 'title' }, t('garage')), this.cur.el),
      h('div', { class: 'shop-wrap' }, preview, this.body),
    );
    this.render();
  }

  private onMove = (e: PointerEvent) => this.game.showroom.dragMove(e.clientX);
  private onUp = () => this.game.showroom.dragEnd();

  onHide() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  private switchCar(dir: number) {
    const d = this.game.save.data;
    const owned = CARS.filter((c) => d.ownedCars.includes(c.id));
    const i = owned.findIndex((c) => c.id === d.selectedCar);
    const next = owned[(i + dir + owned.length) % owned.length];
    this.game.eco.equip('car', next.id);
    this.render();
  }

  private render() {
    const g = this.game;
    const d = g.save.data;
    const def = byId(CARS, d.selectedCar);
    const custom = g.eco.custom(def.id);
    g.showroom.setCar(g.eco.look(def.id));
    this.cur.refresh();
    this.body.innerHTML = '';
    const head = h(
      'div',
      { class: 'row', style: 'padding:10px 10px 0;justify-content:space-between' },
      btn('◀', 'dark icon', () => this.switchCar(-1), g),
      h('div', { class: 'title', style: 'font-size:22px;text-align:center' }, def.name),
      btn('▶', 'dark icon', () => this.switchCar(1), g),
    );
    const stats = h('div', { style: 'padding:0 14px' }, statsBlock(def, custom.upgrades));
    const list = h('div', { class: 'upg-list' });
    (['speed', 'accel', 'grip', 'nitro'] as UpgradeStat[]).forEach((st) => {
      const lvl = custom.upgrades[st];
      const pips = h('div', { class: 'pips' }, ...Array.from({ length: UPGRADE_MAX }, (_, i) => h('div', { class: `pip ${i < lvl ? 'on' : ''}` })));
      const row = h('div', { class: 'upg' }, h('div', { class: 'lbl' }, t(`stat.${st}`)), pips);
      if (lvl >= UPGRADE_MAX) row.append(h('div', { class: 'tag' }, t('max')));
      else {
        const price = upgradePrice(lvl);
        const can = d.coins >= price;
        if (can) {
          row.append(
            btn(h('span', { class: 'row', style: 'gap:4px' }, coinIco(), fmt(price)), 'green small', () => {
              if (g.eco.upgrade(def.id, st)) {
                g.audio.sfx.play('buy');
                this.render();
              }
            }, g),
          );
        } else {
          // can't afford: offer the upgrade for a rewarded ad
          row.append(
            btn(t('free'), 'yellow small ad', async () => {
              if (await g.ads.rewarded('free_upgrade')) {
                g.eco.freeUpgrade(def.id, st);
                g.audio.sfx.play('reward');
                this.render();
              }
            }, g),
          );
        }
      }
      list.append(row);
    });
    this.body.append(head, stats, list);
  }
}
