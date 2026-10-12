import { h, coinIco, fmt } from '../dom';
import { t } from '../../i18n/i18n';
import type { Screen } from '../UI';
import type { Game } from '../../core/Game';
import type { Race } from '../../gameplay/Race';
import { btn } from './common';

const REVIVE_WINDOW = 8;

export class GameOverScreen implements Screen {
  el: HTMLElement;
  private reviveBtn: HTMLElement | null = null;
  private ringEl: HTMLElement | null = null;
  private left = REVIVE_WINDOW;
  private busy = false;

  constructor(private game: Game, race: Race) {
    const maxRevives = game.ads.policy.cfg.maxRevives;
    const revivesLeft = maxRevives - race.revivesUsed;
    const panel = h(
      'div',
      { class: 'panel' },
      h('h1', { class: 'gameover-title title' }, t('gameover')),
      h('div', { style: 'opacity:.85;margin:6px 0 12px' }, t('gameover.sub')),
      h('div', { class: 'kv' }, h('span', null, '🏁'), h('b', null, `${Math.round(race.progress * 100)}%`)),
      h('div', { class: 'kv' }, h('span', null, t('coins')), h('b', null, coinIco(), `+${fmt(race.coins)}`)),
      h('div', { class: 'kv' }, h('span', null, t('score')), h('b', null, fmt(race.score))),
    );
    const actions = h('div', { class: 'actions' });
    if (revivesLeft > 0) {
      this.ringEl = h('span', { class: 'ring' }, String(REVIVE_WINDOW));
      this.reviveBtn = btn(h('span', null, t('revive')), 'yellow big ad revive-btn shine', () => this.doRevive(), game);
      this.reviveBtn.append(this.ringEl);
      actions.append(this.reviveBtn, h('div', { style: 'font-size:12px;opacity:.75;text-align:center;margin-top:-4px' }, t('revive.left', { n: revivesLeft })));
    }
    actions.append(
      btn(t('restart'), 'green', () => game.restartRace(true), game),
      h(
        'div',
        { class: 'row' },
        btn(t('shop'), 'purple', async () => {
          await game.ads.interstitial('gameover_shop', game.save.data.level);
          game.goShop();
        }, game),
        btn(t('mainMenu'), 'dark', () => game.goMenuWithAd('gameover_menu'), game),
      ),
    );
    panel.append(actions);
    this.el = h('div', { class: 'screen result dim' }, panel);
  }

  private async doRevive() {
    if (this.busy) return;
    this.busy = true;
    const ok = await this.game.revive();
    this.busy = false;
    if (!ok) this.left = Math.max(this.left, 3);
  }

  update(dt: number) {
    if (!this.reviveBtn || this.busy) return;
    this.left -= dt;
    if (this.ringEl) this.ringEl.textContent = String(Math.max(0, Math.ceil(this.left)));
    if (this.left <= 0) {
      this.reviveBtn.nextElementSibling?.remove();
      this.reviveBtn.remove();
      this.reviveBtn = null;
    }
  }
}
