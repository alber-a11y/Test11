import { h } from '../dom';
import { t } from '../../i18n/i18n';
import type { Screen } from '../UI';

export class LoadingScreen implements Screen {
  el: HTMLElement;
  private bar: HTMLElement;
  private tap: HTMLElement;

  constructor() {
    this.bar = h('div');
    this.tap = h('div', { class: 'tap-start title', style: 'visibility:hidden' }, t('tap.start'));
    this.el = h(
      'div',
      { class: 'screen loading' },
      h('div', { class: 'logo', html: `SKY RUSH<small>${t('logo.sub')}</small>` }),
      h('div', { class: 'loadbar' }, this.bar),
      this.tap,
    );
  }

  setProgress(p: number) {
    this.bar.style.width = `${Math.round(p * 100)}%`;
  }

  waitTap(): Promise<void> {
    this.tap.style.visibility = 'visible';
    return new Promise((resolve) => {
      const go = () => {
        this.el.removeEventListener('pointerdown', go);
        window.removeEventListener('keydown', go);
        resolve();
      };
      this.el.addEventListener('pointerdown', go);
      window.addEventListener('keydown', go);
    });
  }
}
