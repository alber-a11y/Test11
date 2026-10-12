import { h, coinIco, gemIco, fmt } from '../dom';
import { t, itemName } from '../../i18n/i18n';
import type { Game } from '../../core/Game';
import { btn } from './common';
import { Economy } from '../../meta/Economy';
import { makeCanvas } from '../../render/textures/canvas';
import { CARS, byId } from '../../meta/Catalog';

export function confirmDialog(game: Game, text: string, onYes: () => void) {
  let close = () => {};
  const panel = h(
    'div',
    { class: 'panel' },
    h('h2', { class: 'title', style: 'font-size:20px' }, text),
    h('div', { class: 'row actions' }, btn(t('no'), 'dark', () => close(), game), btn(t('yes'), 'red', () => (close(), onYes()), game)),
  );
  close = game.ui.modal(panel);
}

/** Generic reward popup with an optional "x2 for ad" button. */
export function openReward(game: Game, r: { coins?: number; gems?: number; title?: string; image?: string; label?: string; doubleable?: boolean }, onDone?: () => void) {
  let close = () => {};
  const big = h('div', { class: 'reward-big title' });
  const paint = (mult: number) => {
    big.innerHTML = '';
    if (r.coins) big.append(coinIco(), `+${fmt(r.coins * mult)}`);
    if (r.gems) big.append(gemIco(), `+${r.gems * mult}`);
  };
  paint(1);
  if (r.coins) game.eco.addCoins(r.coins);
  if (r.gems) game.eco.addGems(r.gems);
  game.audio.sfx.play('reward');
  const actions = h('div', { class: 'actions' });
  if (r.doubleable) {
    const dbl = btn(t('claim.x2'), 'yellow ad shine', async () => {
      if (await game.ads.rewarded('reward_x2')) {
        if (r.coins) game.eco.addCoins(r.coins);
        if (r.gems) game.eco.addGems(r.gems);
        paint(2);
        game.audio.sfx.play('reward');
        dbl.remove();
      }
    }, game);
    actions.append(dbl);
  }
  actions.append(btn(t('claim'), 'green', () => close(), game));
  const panel = h(
    'div',
    { class: 'panel', style: 'text-align:center' },
    h('h2', { class: 'title' }, r.title ?? t('reward')),
    r.image ? h('img', { class: 'reward-img', src: r.image }) : null,
    r.label ? h('div', { class: 'title', style: 'font-size:18px' }, r.label) : null,
    r.coins || r.gems ? big : null,
    actions,
  );
  close = game.ui.modal(panel, { onClose: onDone, dismissable: false });
}

export function openDaily(game: Game, onDone: () => void) {
  const eco = game.eco;
  const idx = eco.dailyDayIndex();
  const available = eco.dailyAvailable();
  let close = () => {};
  const grid = h('div', { class: 'daily-grid' });
  Economy.DAILY.forEach((amount, i) => {
    const done = i < idx || (!available && i === idx);
    grid.append(
      h(
        'div',
        { class: `day ${i === idx && available ? 'today' : ''} ${done ? 'done' : ''}` },
        h('span', null, t('day', { n: i + 1 })),
        h('span', { style: 'font-size:26px' }, i === 6 ? '💎' : '💰'),
        h('span', { class: 'row', style: 'gap:3px' }, fmt(amount)),
      ),
    );
  });
  const actions = h('div', { class: 'actions' });
  if (available) {
    actions.append(
      btn(t('claim.x2'), 'yellow ad shine', async () => {
        if (await game.ads.rewarded('daily_x2')) {
          const amount = eco.claimDaily(2);
          close();
          openReward(game, { coins: 0, title: t('daily'), label: `+${fmt(amount)}` }, onDone);
        }
      }, game),
      btn(t('claim'), 'green', () => {
        const amount = eco.claimDaily(1);
        game.audio.sfx.play('reward');
        close();
        game.ui.toast(`+${fmt(amount)} 💰`);
        onDone();
      }, game),
    );
  } else actions.append(btn(t('close'), 'dark', () => close(), game));
  const panel = h('div', { class: 'panel' }, h('h2', { class: 'title' }, t('daily')), grid, actions);
  close = game.ui.modal(panel);
}

const WHEEL = [
  { label: '100', coins: 100, color: '#ff5a3a' },
  { label: '💎 2', gems: 2, color: '#9a4aff' },
  { label: '250', coins: 250, color: '#ffc21a' },
  { label: '🚀', booster: 'startNitro' as const, color: '#2b8cff' },
  { label: '500', coins: 500, color: '#36d24a' },
  { label: '🛡️', booster: 'shield' as const, color: '#ff8a1a' },
  { label: '150', coins: 150, color: '#22c8e8' },
  { label: '1000', coins: 1000, color: '#ff3ab4' },
];

export function openWheel(game: Game, onDone: () => void) {
  const eco = game.eco;
  const [canvas, ctx] = makeCanvas(600, 600);
  const draw = (rot: number) => {
    ctx.clearRect(0, 0, 600, 600);
    ctx.save();
    ctx.translate(300, 300);
    ctx.rotate(rot);
    const n = WHEEL.length;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n;
      const a1 = a0 + (Math.PI * 2) / n;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 285, a0, a1);
      ctx.closePath();
      ctx.fillStyle = WHEEL[i].color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.save();
      ctx.rotate((a0 + a1) / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'italic 900 40px Arial Black, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 4;
      ctx.fillText(WHEEL[i].label, 190, 0);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.fillStyle = '#123a8f';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffc21a';
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(300, 300, 290, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffc21a';
    ctx.stroke();
  };
  let rot = 0;
  draw(rot);
  let spinning = false;
  let close = () => {};
  const actions = h('div', { class: 'actions' });
  const spin = async (free: boolean) => {
    if (spinning) return;
    if (!free && !(await game.ads.rewarded('wheel_spin'))) return;
    spinning = true;
    eco.markWheelSpin(free);
    const n = WHEEL.length;
    // weighted: bigger prizes rarer
    const weights = [22, 6, 14, 12, 7, 12, 20, 3];
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let target = 0;
    for (let i = 0; i < n; i++) {
      r -= weights[i];
      if (r <= 0) {
        target = i;
        break;
      }
    }
    const start = rot;
    const end = Math.ceil(rot / (Math.PI * 2)) * Math.PI * 2 + Math.PI * 2 * 5 - (target / n) * Math.PI * 2;
    const dur = 4200;
    const t0 = performance.now();
    let lastSeg = -1;
    await new Promise<void>((res) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const e = 1 - Math.pow(1 - k, 4);
        rot = start + (end - start) * e;
        draw(rot);
        const seg = Math.floor((rot / (Math.PI * 2)) * n);
        if (seg !== lastSeg) {
          lastSeg = seg;
          game.audio.sfx.play('spin');
        }
        if (k < 1) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
    spinning = false;
    const prize = WHEEL[target];
    if (prize.booster) {
      eco.addBooster(prize.booster, 1);
      game.audio.sfx.play('reward');
      game.ui.toast(`+1 ${prize.label}`);
    } else {
      close();
      openReward(game, { coins: prize.coins, gems: prize.gems, title: t('wheel') }, onDone);
      return;
    }
    renderActions();
  };
  const renderActions = () => {
    actions.innerHTML = '';
    if (eco.wheelFree()) actions.append(btn(t('spin'), 'green big shine', () => spin(true), game));
    else actions.append(btn(t('spin.extra'), 'yellow big ad', () => spin(false), game));
    actions.append(btn(t('close'), 'dark', () => close(), game));
  };
  renderActions();
  const panel = h('div', { class: 'panel' }, h('h2', { class: 'title' }, t('wheel')), h('div', { class: 'wheel-wrap' }, canvas, h('div', { class: 'pointer' })), actions);
  close = game.ui.modal(panel, { onClose: onDone });
}

export function openChest(game: Game, chestLevel: number, onDone: () => void) {
  game.audio.sfx.play('chest');
  const res = game.eco.openChest(chestLevel);
  let image: string | undefined;
  let label: string | undefined;
  if (res.item) {
    label = itemName(res.item.kind, res.item.id, res.item.name);
    if (res.item.kind === 'car') {
      const def = byId(CARS, res.item.id);
      image = game.thumbs.car({ carId: def.id, paint: def.paint, livery: def.livery, rim: def.rim, neon: 'red', trail: 'fire' }, 320, 180);
      label = `${t('newCar')} ${def.name}`;
    }
  }
  // coins/gems were granted by openChest; show them without double-granting
  let close = () => {};
  const panel = h(
    'div',
    { class: 'panel', style: 'text-align:center' },
    h('h2', { class: 'title' }, `🎁 ${t('chest')}`),
    image ? h('img', { class: 'reward-img', src: image }) : null,
    label ? h('div', { class: 'title', style: 'font-size:18px;color:#ffe27a' }, label) : null,
    h('div', { class: 'reward-big title' }, coinIco(), `+${fmt(res.coins)}`, gemIco(), `+${res.gems}`),
  );
  const actions = h('div', { class: 'actions' });
  const dbl = btn(t('claim.x2'), 'yellow ad shine', async () => {
    if (await game.ads.rewarded('chest_x2')) {
      game.eco.addCoins(res.coins);
      game.eco.addGems(res.gems);
      game.audio.sfx.play('reward');
      const big = panel.querySelector('.reward-big')!;
      big.innerHTML = '';
      big.append(coinIco(), `+${fmt(res.coins * 2)}`, gemIco(), `+${res.gems * 2}`);
      dbl.remove();
    }
  }, game);
  actions.append(dbl, btn(t('claim'), 'green', () => close(), game));
  panel.append(actions);
  close = game.ui.modal(panel, { onClose: onDone, dismissable: false });
}
