import { h } from '../dom';
import { t } from '../../i18n/i18n';
import type { Game } from '../../core/Game';
import { btn, difficultySeg } from './common';
import { confirmDialog } from './Popups';

export function openSettings(game: Game) {
  const s = game.save.data.settings;
  const slider = (value: number, on: (v: number) => void) => {
    const el = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(value) }) as HTMLInputElement;
    el.addEventListener('input', () => on(Number(el.value)));
    return el;
  };
  const seg = <T extends string>(options: [T, string][], cur: T, on: (v: T) => void) => {
    const wrap = h('div', { class: 'seg' });
    const render = (val: T) => {
      wrap.innerHTML = '';
      for (const [v, label] of options) {
        const b = h('button', { class: v === val ? 'on' : '' }, label);
        b.addEventListener('click', () => {
          game.audio.sfx.play('tab');
          on(v);
          render(v);
        });
        wrap.append(b);
      }
    };
    render(cur);
    return wrap;
  };
  const apply = () => {
    game.audio.engine.setVolumes(s.music, s.sfx);
    game.audio.engine.setUserMuted(s.muted);
    game.save.save();
  };
  let close = () => {};
  const panel = h(
    'div',
    { class: 'panel' },
    h('h2', { class: 'title' }, t('settings')),
    h('div', { class: 'setting' }, h('span', null, t('music')), slider(s.music, (v) => ((s.music = v), apply()))),
    h('div', { class: 'setting' }, h('span', null, t('sfx')), slider(s.sfx, (v) => ((s.sfx = v), apply()))),
    h('div', { class: 'setting' }, h('span', null, t('sound')), seg<'on' | 'off'>([['off', '🔊'], ['on', '🔇']], s.muted ? 'on' : 'off', (v) => ((s.muted = v === 'on'), apply()))),
    h('div', { class: 'setting' }, h('span', null, t('vibration')), seg<'on' | 'off'>([['on', 'ON'], ['off', 'OFF']], s.vibration ? 'on' : 'off', (v) => ((s.vibration = v === 'on'), apply()))),
    h(
      'div',
      { class: 'setting' },
      h('span', null, t('quality')),
      seg(
        [
          ['auto', t('q.auto')],
          ['low', t('q.low')],
          ['medium', t('q.medium')],
          ['high', t('q.high')],
        ],
        s.quality,
        (v) => {
          s.quality = v;
          game.applyQuality();
          apply();
        },
      ),
    ),
    h('div', { class: 'setting' }, h('span', null, t('difficulty')), difficultySeg(game)),
    h(
      'div',
      { class: 'setting' },
      h('span', null, t('controls')),
      seg(
        [
          ['zones', t('controls.zones')],
          ['drag', t('controls.drag')],
        ],
        s.controls,
        (v) => {
          s.controls = v;
          game.input.scheme = v;
          apply();
        },
      ),
    ),
    h(
      'div',
      { class: 'setting' },
      h('span', null, t('language')),
      seg(
        [
          ['auto', 'AUTO'],
          ['ru', 'RU'],
          ['en', 'EN'],
        ],
        s.lang,
        (v) => {
          close();
          game.setLanguage(v);
          openSettings(game);
        },
      ),
    ),
    h(
      'div',
      { class: 'actions' },
      btn(t('close'), 'green', () => close(), game),
      btn(t('reset.progress'), 'red small', () => {
        confirmDialog(game, t('reset.confirm'), () => {
          game.save.reset();
          close();
          game.goMenu();
        });
      }, game),
    ),
  );
  close = game.ui.modal(panel);
}
