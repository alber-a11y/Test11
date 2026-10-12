import { h, coinIco, gemIco, fmt } from '../dom';
import type { Game } from '../../core/Game';

/** Coins / gems pills that refresh themselves. */
export function currencyBar(game: Game) {
  const coins = h('span');
  const gems = h('span');
  const el = h('div', { class: 'row' }, h('div', { class: 'pill' }, coinIco(), coins), h('div', { class: 'pill' }, gemIco(), gems));
  const refresh = () => {
    coins.textContent = fmt(game.save.data.coins);
    gems.textContent = fmt(game.save.data.gems);
  };
  refresh();
  return { el, refresh };
}

export function backButton(onClick: () => void, game: Game) {
  return h(
    'button',
    {
      class: 'btn icon dark',
      onclick: () => {
        game.audio.sfx.play('click');
        onClick();
      },
    },
    '←',
  );
}

/** Wire button click sound. */
export function btn(label: string | Node, cls: string, onClick: (e: MouseEvent) => void, game: Game) {
  return h(
    'button',
    {
      class: `btn ${cls}`,
      onclick: (e: MouseEvent) => {
        game.audio.engine.unlock();
        game.audio.sfx.play('click');
        onClick(e);
      },
    },
    label,
  );
}
