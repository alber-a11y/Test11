import { h, coinIco, ring, fmt } from '../dom';
import { t } from '../../i18n/i18n';
import type { Screen } from '../UI';
import type { Game } from '../../core/Game';
import type { Race } from '../../gameplay/Race';
import { displaySpeed } from '../../gameplay/Racer';
import { ordinal } from '../../core/math';

export class HudScreen implements Screen {
  el: HTMLElement;
  private posVal = h('div', { class: 'val' });
  private speedVal = h('div', { class: 'val' });
  private arcFill = h('div', { class: 'fill' });
  private bar = h('div', { class: 'bar' });
  private hearts = h('div', { class: 'hearts' });
  private coins = h('span');
  private score = h('span');
  private powerups = h('div', { class: 'powerups' });
  private nitro: HTMLElement;
  private nitroNum = h('span', { class: 'num' });
  private nitroRing = h('span');
  private warn = h('div', { class: 'warn' }, t('warn.slow'));
  private vign = h('div', { class: 'vignette-hit' });
  private cd: HTMLElement | null = null;
  private lastHearts = -1;
  private lastPlace = -1;
  private hintTimer = 0;
  private hintEl: HTMLElement | null = null;
  private lastPowerKey = '';

  constructor(private game: Game, private race: Race) {
    this.nitro = h('div', { class: 'nitro-btn interactive' }, this.nitroRing, h('span', { class: 'can' }, 'NOZ'), this.nitroNum);
    this.nitro.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      game.input.pressNitro();
    });
    const pauseBtn = h('div', { class: 'pause-btn interactive' });
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      game.audio.sfx.play('click');
      game.pause();
    });
    this.el = h(
      'div',
      { class: 'screen hud' },
      this.vign,
      h(
        'div',
        { class: 'hud-top' },
        h('div', { class: 'hud-pos' }, h('div', { class: 'lbl' }, t('pos')), this.posVal),
        h('div', { class: 'hud-speed' }, h('div', { class: 'arc' }, this.arcFill), h('div', { class: 'lbl' }, t('kmh')), this.speedVal),
      ),
      h(
        'div',
        { class: 'hud-center' },
        h('div', { class: 'lvl' }, `${t('level')} ${race.level.level}${race.level.boss ? ' 👑' : ''}`),
        h('div', { class: 'hud-progress' }, this.bar, h('div', { class: 'flag' })),
      ),
      h(
        'div',
        { class: 'hud-row2' },
        h('div', { class: 'col', style: 'gap:6px' }, this.hearts, this.powerups),
        h('div', { class: 'hud-coins' }, h('div', { class: 'pill' }, coinIco(), this.coins), h('div', { class: 'pill', style: 'padding-left:12px' }, '★ ', this.score)),
      ),
      pauseBtn,
      this.nitro,
      this.warn,
    );
    if (!game.save.data.tutorialDone) this.showHint();
  }

  private showHint() {
    const mobile = this.game.input.usingTouch || matchMedia('(pointer: coarse)').matches;
    if (mobile) {
      const lines = t('tutorial.mobile').split('\n');
      this.hintEl = h(
        'div',
        { class: 'hint' },
        h('div', { class: 'zone' }, h('div', null, h('b', null, '👈'), lines[1] ?? '')),
        h('div', { class: 'zone' }, h('div', null, h('b', null, '👉'), `${lines[0]}\n${lines[2] ?? ''}`)),
      );
    } else this.hintEl = h('div', { class: 'hint-desktop' }, t('tutorial.desktop'));
    this.el.append(this.hintEl);
    this.hintTimer = 7;
  }

  countdown(text: string, go = false) {
    this.cd?.remove();
    this.cd = h('div', { class: `countdown title ${go ? 'go' : ''}` }, text);
    this.el.append(this.cd);
    const el = this.cd;
    setTimeout(() => el.remove(), go ? 700 : 900);
  }

  showResumeCountdown(left: number) {
    const n = Math.ceil(left / 0.5);
    const txt = left > 0 ? String(Math.max(1, n)) : '';
    if (!txt) {
      this.cd?.remove();
      return;
    }
    if (this.cd?.textContent !== txt) this.countdown(txt);
  }

  floater(text: string, color: string) {
    this.el.querySelectorAll('.floater').forEach((x) => x.remove());
    const f = h('div', { class: 'floater title', style: `color:${color}` }, text);
    this.el.append(f);
    setTimeout(() => f.remove(), 1300);
  }

  hit() {
    this.vign.classList.add('on');
    setTimeout(() => this.vign.classList.remove('on'), 250);
  }

  update(dt: number) {
    const r = this.race;
    const p = r.player;
    if (p.place !== this.lastPlace) {
      this.lastPlace = p.place;
      this.posVal.innerHTML = `${p.place}<sup>${ordinal(p.place)}</sup>`;
    }
    const kmh = displaySpeed(p.v);
    this.speedVal.textContent = String(kmh);
    this.arcFill.style.height = `${Math.min(100, (p.v / (p.stats.maxSpeed * 1.32)) * 100)}%`;
    this.bar.style.width = `calc(${(r.progress * 100).toFixed(1)}% - 8px)`;
    if (r.hearts !== this.lastHearts) {
      this.lastHearts = r.hearts;
      this.hearts.innerHTML = '';
      const total = Math.max(3, r.hearts);
      for (let i = 0; i < total; i++) this.hearts.append(h('span', { class: `heart-ico ${i < r.hearts ? '' : 'off'}` }));
    }
    this.coins.textContent = fmt(r.coins);
    this.score.textContent = fmt(r.score);
    this.nitroNum.textContent = String(p.nitroCharges);
    this.nitro.classList.toggle('empty', p.nitroCharges <= 0 && !p.nitroActive);
    this.nitro.classList.toggle('active', p.nitroActive);
    const prog = p.nitroActive ? p.nitroTime / p.stats.nitroTime : p.nitroCharges >= 3 ? 1 : p.nitroMeter;
    this.nitroRing.innerHTML = ring(prog, 104, p.nitroActive ? '#5ad8ff' : '#ffc21a', 6);
    // power-ups with timers
    const pw: [string, number, number][] = [];
    if (p.shieldTime > 0) pw.push(['🛡️', p.shieldTime, 6]);
    if (p.magnetTime > 0) pw.push(['🧲', p.magnetTime, 9]);
    if (p.x2Time > 0) pw.push(['x2', p.x2Time, 10]);
    const key = pw.map((x) => x[0] + Math.ceil(x[1] * 4)).join();
    if (key !== this.lastPowerKey) {
      this.lastPowerKey = key;
      this.powerups.innerHTML = '';
      for (const [ico, tm, max] of pw) {
        const el = h('div', { class: 'powerup' }, ico);
        el.insertAdjacentHTML('beforeend', ring(Math.min(1, tm / max), 44, '#7ae8ff', 4));
        this.powerups.append(el);
      }
    }
    this.warn.classList.toggle('on', p.drifting && r.state === 'racing' && Math.abs(p.slide) > 2.5);
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0 || (r.time > 4 && p.v > 30)) {
        this.hintTimer = 0;
        this.hintEl?.remove();
        this.game.save.data.tutorialDone = true;
        this.game.save.save();
      }
    }
  }
}
