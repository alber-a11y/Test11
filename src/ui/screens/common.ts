import { h, coinIco, gemIco, fmt } from '../dom';
import type { Game } from '../../core/Game';
import { t } from '../../i18n/i18n';
import { DIFFICULTY_REWARD } from '../../meta/Economy';

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

type Diff = 'easy' | 'normal' | 'hard' | 'extreme';

/** Segmented difficulty selector (rivals' strength; harder pays more). */
export function difficultySeg(game: Game, onChange?: (d: Diff) => void) {
  const wrap = h('div', { class: 'seg diff-seg' });
  const render = () => {
    wrap.innerHTML = '';
    const cur = game.save.data.settings.difficulty;
    for (const d of ['easy', 'normal', 'hard', 'extreme'] as Diff[]) {
      const b = h('button', { class: `${d === cur ? 'on' : ''} diff-${d}` }, t(`diff.${d}`));
      b.addEventListener('click', () => {
        game.audio.sfx.play('tab');
        game.save.data.settings.difficulty = d;
        game.save.save();
        render();
        onChange?.(d);
      });
      wrap.append(b);
    }
  };
  render();
  return wrap;
}

export function difficultyRewardLabel(game: Game) {
  return t('diff.reward', { n: DIFFICULTY_REWARD[game.save.data.settings.difficulty] });
}
