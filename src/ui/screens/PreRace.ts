import { h, coinIco } from '../dom';
import { t } from '../../i18n/i18n';
import type { Screen } from '../UI';
import type { Game } from '../../core/Game';
import { backButton, btn, currencyBar, difficultySeg, difficultyRewardLabel } from './common';
import { BOOSTERS, CARS, byId, type BoosterId } from '../../meta/Catalog';
import { biomeForLevel, isBossLevel } from '../../world/biomes/Biomes';
import { effectiveStats } from '../../gameplay/Racer';

export class PreRaceScreen implements Screen {
  el: HTMLElement;
  private selected = new Set<BoosterId>();
  private grid = h('div', { class: 'boosters' });
  private cur: ReturnType<typeof currencyBar>;

  constructor(private game: Game, readonly level: number) {
    this.cur = currencyBar(game);
    const biome = biomeForLevel(level);
    const body = h('div', { class: 'shop-body', style: 'padding:12px;gap:10px' });
    const content = h('div', { class: 'col grid', style: 'display:flex;padding:0;gap:10px;overflow-y:auto;flex:1' });
    body.append(content);
    content.append(
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between' },
        h('div', { class: 'title', style: 'font-size:26px' }, `${t('level')} ${level}`),
        h('div', { class: 'level-chip' }, t(biome.nameKey), isBossLevel(level) ? h('span', { class: 'boss' }, '👑') : null),
      ),
      this.diffRow(),
      h('div', { style: 'font-size:14px;opacity:.85' }, t('prerace.title')),
      this.grid,
    );
    const trial = this.trialOffer();
    if (trial) content.append(trial);
    const go = btn(t('prerace.go'), 'green big shine start-btn', () => this.start(null), game);
    go.style.flex = 'none';
    body.append(go);
    const preview = h('div', { class: 'preview-space' });
    this.el = h(
      'div',
      { class: 'screen shop' },
      h('div', { class: 'header' }, backButton(() => game.goMenu(), game), h('h1', { class: 'title' }, ''), this.cur.el),
      h('div', { class: 'shop-wrap' }, preview, body),
    );
    // remember auto-selected boosters the player owns
    for (const b of BOOSTERS) if (game.eco.boosterCount(b.id) > 0 && (b.id === 'startNitro' || b.id === 'shield')) this.selected.add(b.id);
    this.renderBoosters();
  }

  private diffRow() {
    const reward = h('span', { class: 'diff-reward' }, difficultyRewardLabel(this.game));
    return h(
      'div',
      { class: 'col', style: 'gap:6px' },
      h('div', { class: 'row', style: 'justify-content:space-between;font-size:14px' }, h('span', { style: 'opacity:.85' }, t('difficulty')), reward),
      difficultySeg(this.game, () => (reward.textContent = difficultyRewardLabel(this.game))),
    );
  }

  private renderBoosters() {
    const eco = this.game.eco;
    this.grid.innerHTML = '';
    for (const b of BOOSTERS) {
      const cnt = eco.boosterCount(b.id);
      const on = this.selected.has(b.id);
      const el = h(
        'div',
        { class: `booster ${on ? 'on' : ''}` },
        h('span', { class: 'cnt' }, `x${cnt}`),
        h('span', { class: 'ico' }, b.icon),
        h('span', null, t(b.name)),
      );
      if (cnt <= 0) {
        const buy = btn(h('span', { class: 'row', style: 'gap:3px' }, coinIco(), String(b.price)), 'green small', (e) => {
          e.stopPropagation();
          if (!eco.spend(b.price)) {
            this.game.audio.sfx.play('error');
            this.game.ui.toast(t('notEnough'));
            return;
          }
          this.game.audio.sfx.play('buy');
          eco.addBooster(b.id, 1);
          this.selected.add(b.id);
          this.renderBoosters();
          this.cur.refresh();
        }, this.game);
        buy.querySelector('.coin-ico')?.setAttribute('style', 'width:16px;height:16px');
        const ad = btn(t('free'), 'yellow small ad', async (e) => {
          e.stopPropagation();
          if (await this.game.ads.rewarded('prerace_booster')) {
            eco.addBooster(b.id, 1);
            this.selected.add(b.id);
            this.game.audio.sfx.play('reward');
            this.renderBoosters();
          }
        }, this.game);
        el.append(h('div', { class: 'col', style: 'gap:4px;width:100%' }, buy, ad));
      } else {
        el.addEventListener('click', () => {
          this.game.audio.sfx.play('tab');
          if (on) this.selected.delete(b.id);
          else this.selected.add(b.id);
          this.renderBoosters();
        });
      }
      this.grid.append(el);
    }
  }

  private trialOffer(): HTMLElement | null {
    const g = this.game;
    const d = g.save.data;
    const mine = effectiveStats(byId(CARS, d.selectedCar), g.eco.custom(d.selectedCar).upgrades);
    const power = (s: { speed: number; accel: number; grip: number; nitro: number }) => s.speed + s.accel + s.grip + s.nitro;
    const candidates = CARS.filter((c) => !c.exclusive && !d.ownedCars.includes(c.id) && power(c.stats) > power(mine));
    if (!candidates.length) return null;
    const car = candidates[(this.level * 7) % candidates.length];
    const img = h('img', { src: g.thumbs.car({ carId: car.id, paint: car.paint, livery: car.livery, rim: car.rim, neon: 'off', trail: 'fire' }, 180, 100) });
    return h(
      'div',
      { class: 'trial' },
      img,
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'title', style: 'font-size:14px' }, t('prerace.trial')), h('div', { style: 'font-size:13px;color:#ffe27a' }, car.name)),
      btn(t('free'), 'yellow small ad', async () => {
        if (await g.ads.rewarded('trial_car')) this.start(car.id);
      }, g),
    );
  }

  private start(trialCarId: string | null) {
    const used: BoosterId[] = [];
    for (const b of this.selected) if (this.game.eco.useBooster(b)) used.push(b);
    this.game.startRace(this.level, used, trialCarId);
  }
}
