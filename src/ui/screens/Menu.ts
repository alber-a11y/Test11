import { h } from '../dom';
import { t } from '../../i18n/i18n';
import type { Screen } from '../UI';
import type { Game } from '../../core/Game';
import { currencyBar, btn } from './common';
import { biomeForLevel, isBossLevel } from '../../world/biomes/Biomes';
import { openDaily, openWheel } from './Popups';

export class MenuScreen implements Screen {
  el: HTMLElement;
  private cur: ReturnType<typeof currencyBar>;

  constructor(private game: Game) {
    const d = game.save.data;
    this.cur = currencyBar(game);
    const lvl = d.level;
    const biome = biomeForLevel(lvl);
    const side = (ico: string, label: string, cls: string, onClick: () => void, badge = false) => {
      const b = btn(h('span', null, h('span', { class: 'ico' }, ico), h('span', null, label)), `side-btn ${cls}`, onClick, game);
      b.firstElementChild!.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;gap:3px');
      if (badge) b.append(h('span', { class: 'badge' }, '!'));
      return b;
    };
    const left = h(
      'div',
      { class: 'menu-side left' },
      side('🗺️', t('map'), 'dark', () => this.withAd(() => game.goMap())),
      side('🛒', t('shop'), 'purple', () => this.withAd(() => game.goShop())),
      side('🔧', t('garage'), 'dark', () => game.goGarage()),
    );
    const right = h(
      'div',
      { class: 'menu-side right' },
      side('🎁', t('daily'), 'yellow', () => openDaily(game, () => this.refresh()), game.eco.dailyAvailable()),
      side('🎡', t('wheel'), 'green', () => openWheel(game, () => this.refresh()), game.eco.wheelFree()),
      side('⚙️', t('settings'), 'dark', () => game.openSettings()),
    );
    const play = btn(
      h('span', null, t('play'), h('small', null, `${t('level')} ${lvl}`)),
      'green big play-btn shine',
      () => game.goPreRace(lvl),
      game,
    );
    play.firstElementChild!.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;line-height:1');
    this.el = h(
      'div',
      { class: 'screen menu' },
      h(
        'div',
        { class: 'topbar' },
        this.cur.el,
        h('div', { class: 'spacer' }),
        btn(
          h('span', { class: 'lang-label' }, h('b', { class: game.language === 'ru' ? 'on' : '' }, 'RU'), h('i', null, '/'), h('b', { class: game.language === 'en' ? 'on' : '' }, 'EN')),
          'dark small lang-btn',
          () => game.setLanguage(game.language === 'ru' ? 'en' : 'ru'),
          game,
        ),
      ),
      h('div', { class: 'logo', html: 'SKY RUSH' }),
      h('div', { class: 'spacer' }),
      left,
      right,
      h(
        'div',
        { class: 'menu-bottom' },
        h('div', { class: 'level-chip' }, t(biome.nameKey), isBossLevel(lvl) ? h('span', { class: 'boss' }, '👑 ' + t('boss')) : null),
        play,
      ),
    );
    // rotate the car by dragging on empty space
    this.el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement) === this.el) game.showroom.dragStart(e.clientX);
    });
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  private onMove = (e: PointerEvent) => this.game.showroom.dragMove(e.clientX);
  private onUp = () => this.game.showroom.dragEnd();

  private async withAd(fn: () => void) {
    await this.game.ads.interstitial('menu_nav', this.game.save.data.level);
    fn();
  }

  refresh() {
    this.cur.refresh();
    // rebuild to update badges
    if (this.game.ui.currentName === 'menu' && !this.game.ui.hasModal) this.game.goMenu();
  }

  onHide() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  update() {
    // keep currency fresh after rewards
  }
}
