import { h } from '../dom';
import { t } from '../../i18n/i18n';
import type { Game } from '../../core/Game';
import { btn } from './common';

export class PauseScreen {
  el: HTMLElement;
  constructor(game: Game) {
    this.el = h(
      'div',
      { class: 'panel' },
      h('h2', { class: 'title' }, t('pause')),
      h(
        'div',
        { class: 'actions' },
        btn(t('resume'), 'green big', () => game.resume(), game),
        btn(t('restart'), 'blue', () => {
          game.ui.closeAllModals();
          game.restartRace(true);
        }, game),
        btn(t('settings'), 'dark', () => game.openSettings(), game),
        btn(t('mainMenu'), 'red', () => {
          game.ui.closeAllModals();
          game.goMenuWithAd('pause_menu');
        }, game),
      ),
    );
  }
}
