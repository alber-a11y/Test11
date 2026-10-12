import { h, coinIco, gemIco, starIco, fmt, fmtTime } from '../dom';
import { t } from '../../i18n/i18n';
import type { Screen } from '../UI';
import type { Game } from '../../core/Game';
import { btn } from './common';
import { ordinal } from '../../core/math';
import type { RaceResult } from '../../gameplay/Race';
import { CARS, byId } from '../../meta/Catalog';

export interface ResultData extends RaceResult {
  base: number;
  earned: number;
  level: number;
  trial: string | null;
}

export class ResultScreen implements Screen {
  el: HTMLElement;

  constructor(game: Game, r: ResultData) {
    const win = r.place <= 3;
    const panel = h('div', { class: 'panel' });
    panel.append(
      h('div', { class: 'title', style: 'font-size:18px;opacity:.85' }, `${t('level')} ${r.level}`),
      h('div', { class: `place-big title ${win ? '' : 'fail'}` }, r.place === 1 ? t('finish.win') : `${r.place}${ordinal(r.place)}`),
    );
    if (win) panel.append(h('div', { class: 'stars-row' }, starIco(r.stars >= 1), starIco(r.stars >= 2), starIco(r.stars >= 3)));
    else panel.append(h('div', { style: 'margin:8px 0 6px;color:#ffb0a0' }, t('finish.fail')));
    const best = game.save.data.bestScore[r.level] ?? 0;
    const earnedEl = h('b', null, coinIco(), `+${fmt(r.earned)}`);
    panel.append(
      h('div', { class: 'kv' }, h('span', null, t('coins')), earnedEl),
      h('div', { class: 'kv' }, h('span', null, t('score')), h('b', null, fmt(r.score))),
      h('div', { class: 'kv' }, h('span', null, t('time')), h('b', null, fmtTime(r.time))),
      h('div', { class: 'kv' }, h('span', null, t('best')), h('b', null, fmt(Math.max(best, r.score)))),
    );
    if (r.gems > 0) panel.append(h('div', { class: 'kv' }, h('span', null, '💎'), h('b', null, gemIco(), `+${r.gems}`)));
    const actions = h('div', { class: 'actions' });
    if (win) {
      let claimed = false;
      const x3 = btn(t('reward.x3'), 'yellow big ad shine', async () => {
        if (claimed) return;
        if (await game.ads.rewarded('result_x3')) {
          claimed = true;
          game.eco.addCoins(r.earned * 2);
          game.audio.sfx.play('reward');
          earnedEl.innerHTML = '';
          earnedEl.append(coinIco(), `+${fmt(r.earned * 3)}`);
          x3.remove();
        }
      }, game);
      actions.append(
        x3,
        btn(t('next'), 'green big', () => game.goPreRace(r.level + 1), game),
        h('div', { class: 'row' }, btn(t('retry'), 'blue', () => game.restartRace(true), game), btn(t('mainMenu'), 'dark', () => game.goMenu(), game)),
      );
    } else {
      actions.append(
        btn(t('retry'), 'green big', () => game.restartRace(true), game),
        btn(t('skipLevel'), 'yellow ad', async () => {
          if (await game.ads.rewarded('skip_level')) {
            game.eco.skipLevel(r.level);
            game.goPreRace(r.level + 1);
          }
        }, game),
        btn(t('mainMenu'), 'dark', () => game.goMenu(), game),
      );
    }
    panel.append(actions);
    this.el = h('div', { class: 'screen result dim' }, panel);
    if (r.trial) {
      const car = byId(CARS, r.trial);
      setTimeout(() => game.ui.toast(`${t('trial.end')}: ${car.name}`, 3000), 600);
    }
  }
}
