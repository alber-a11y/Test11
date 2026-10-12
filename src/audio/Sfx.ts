import type { AudioEngine } from './AudioEngine';

type Wave = OscillatorType;

/** Procedural sound effects. Every sound is synthesized on demand. */
export class Sfx {
  private lastPlay = new Map<string, number>();
  constructor(private a: AudioEngine) {}

  private get ctx() {
    return this.a.ctx!;
  }

  private throttle(name: string, minGap: number) {
    const t = performance.now();
    const last = this.lastPlay.get(name) ?? 0;
    if (t - last < minGap) return true;
    this.lastPlay.set(name, t);
    return false;
  }

  private tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; at?: number; slide?: number; attack?: number; dest?: AudioNode; vibrato?: number } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.at ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = opts.vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const vol = opts.vol ?? 0.3;
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.dest ?? this.a.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; vol?: number; at?: number; attack?: number } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.a.noiseBuffer();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'lowpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.a.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  play(name: string, param = 0) {
    if (!this.a.ready) return;
    switch (name) {
      case 'click':
        this.tone(1200, 0.06, { type: 'triangle', vol: 0.18, slide: 900 });
        break;
      case 'tab':
        this.tone(700, 0.05, { type: 'sine', vol: 0.15 });
        break;
      case 'coin': {
        if (this.throttle('coin', 35)) return;
        const k = 1 + Math.min(param, 10) * 0.03;
        this.tone(1318 * k, 0.07, { type: 'square', vol: 0.07 });
        this.tone(1760 * k, 0.18, { type: 'square', vol: 0.07, at: 0.06 });
        break;
      }
      case 'star': {
        const k = 1 + Math.min(param, 8) * 0.06;
        [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f * k, 0.16, { type: 'triangle', vol: 0.14, at: i * 0.045 }));
        break;
      }
      case 'gem':
        [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.12, at: i * 0.06 }));
        this.tone(3136, 0.6, { type: 'sine', vol: 0.05, at: 0.18 });
        break;
      case 'heart':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', vol: 0.18, at: i * 0.07, vibrato: 6 }));
        break;
      case 'powerup':
        this.tone(300, 0.35, { type: 'sawtooth', vol: 0.08, slide: 1400 });
        this.tone(600, 0.35, { type: 'square', vol: 0.05, slide: 2000, at: 0.05 });
        break;
      case 'nitroPickup':
        this.tone(400, 0.2, { type: 'square', vol: 0.08, slide: 900 });
        this.noise(0.25, { type: 'bandpass', freq: 3000, q: 2, vol: 0.12 });
        break;
      case 'nitro':
        this.noise(1.2, { type: 'bandpass', freq: 500, freqEnd: 3500, q: 1.5, vol: 0.45, attack: 0.05 });
        this.tone(90, 0.6, { type: 'sine', vol: 0.4, slide: 45 });
        this.tone(220, 0.5, { type: 'sawtooth', vol: 0.06, slide: 880 });
        break;
      case 'boost':
        this.noise(0.6, { type: 'highpass', freq: 800, freqEnd: 4000, vol: 0.3, attack: 0.03 });
        this.tone(330, 0.3, { type: 'triangle', vol: 0.12, slide: 990 });
        break;
      case 'crash':
        this.noise(0.6, { type: 'lowpass', freq: 3000, freqEnd: 200, vol: 0.7 });
        this.tone(110, 0.45, { type: 'sine', vol: 0.6, slide: 35 });
        this.tone(1800, 0.3, { type: 'square', vol: 0.05, slide: 600 });
        this.tone(2400, 0.4, { type: 'triangle', vol: 0.05, slide: 1100, at: 0.04 });
        break;
      case 'smash':
        this.noise(0.25, { type: 'bandpass', freq: 1800, freqEnd: 600, q: 1, vol: 0.4 });
        this.tone(180, 0.18, { type: 'sine', vol: 0.3, slide: 60 });
        break;
      case 'wall':
        if (this.throttle('wall', 140)) return;
        this.noise(0.22, { type: 'bandpass', freq: 2500, freqEnd: 900, q: 3, vol: Math.min(0.35, 0.1 + param * 0.02) });
        this.tone(140, 0.12, { type: 'sine', vol: 0.2, slide: 70 });
        break;
      case 'bump':
        if (this.throttle('bump', 150)) return;
        this.tone(120, 0.15, { type: 'sine', vol: 0.35, slide: 55 });
        this.noise(0.1, { type: 'lowpass', freq: 900, vol: 0.2 });
        break;
      case 'jump':
        this.tone(220, 0.35, { type: 'triangle', vol: 0.14, slide: 520 });
        this.noise(0.4, { type: 'bandpass', freq: 900, freqEnd: 2200, q: 1, vol: 0.12 });
        break;
      case 'land':
        this.tone(90, 0.22, { type: 'sine', vol: param ? 0.6 : 0.35, slide: 40 });
        this.noise(0.18, { type: 'lowpass', freq: 600, vol: param ? 0.4 : 0.2 });
        break;
      case 'fall':
        this.tone(900, 1.2, { type: 'sawtooth', vol: 0.06, slide: 120 });
        this.tone(1200, 1.2, { type: 'sine', vol: 0.08, slide: 160 });
        break;
      case 'splash':
        this.noise(0.9, { type: 'lowpass', freq: 2000, freqEnd: 300, vol: 0.4 });
        break;
      case 'heartLost':
        [659, 523, 392].forEach((f, i) => this.tone(f, 0.25, { type: 'square', vol: 0.08, at: i * 0.11 }));
        break;
      case 'shieldBreak':
        this.noise(0.4, { type: 'highpass', freq: 3000, vol: 0.3 });
        [2637, 1976, 1568].forEach((f, i) => this.tone(f, 0.2, { type: 'sine', vol: 0.08, at: i * 0.03 }));
        break;
      case 'respawn':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.12, at: i * 0.05 }));
        break;
      case 'count':
        this.tone(440, 0.22, { type: 'square', vol: 0.12 });
        this.tone(880, 0.22, { type: 'sine', vol: 0.06 });
        break;
      case 'go':
        [523, 659, 784].forEach((f) => this.tone(f * 2, 0.6, { type: 'square', vol: 0.08 }));
        this.tone(1046, 0.7, { type: 'sine', vol: 0.12 });
        break;
      case 'overtake':
        if (this.throttle('overtake', 400)) return;
        this.tone(660, 0.1, { type: 'triangle', vol: 0.1 });
        this.tone(990, 0.16, { type: 'triangle', vol: 0.1, at: 0.08 });
        break;
      case 'nitroReady':
        this.tone(1046, 0.1, { type: 'sine', vol: 0.12 });
        this.tone(1568, 0.16, { type: 'sine', vol: 0.1, at: 0.08 });
        break;
      case 'win': {
        const notes = [523, 659, 784, 1046, 784, 1046, 1318];
        notes.forEach((f, i) => this.tone(f, i === notes.length - 1 ? 0.9 : 0.16, { type: 'square', vol: 0.09, at: i * 0.11 }));
        notes.forEach((f, i) => this.tone(f / 2, 0.16, { type: 'triangle', vol: 0.12, at: i * 0.11 }));
        break;
      }
      case 'lose':
        [392, 370, 349, 330].forEach((f, i) => this.tone(f, i === 3 ? 0.8 : 0.28, { type: 'sawtooth', vol: 0.07, at: i * 0.28, vibrato: i === 3 ? 8 : 0 }));
        break;
      case 'gameover':
        this.tone(440, 1.4, { type: 'sawtooth', vol: 0.08, slide: 80 });
        this.tone(220, 1.4, { type: 'square', vol: 0.06, slide: 55, at: 0.1 });
        break;
      case 'buy':
        [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.14, { type: 'square', vol: 0.07, at: i * 0.05 }));
        break;
      case 'error':
        this.tone(160, 0.25, { type: 'square', vol: 0.12 });
        break;
      case 'reward':
        [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.12, at: i * 0.07 }));
        break;
      case 'chest':
        this.noise(0.3, { type: 'bandpass', freq: 600, q: 2, vol: 0.2 });
        [523, 784, 1046, 1568, 2093].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', vol: 0.12, at: 0.15 + i * 0.06 }));
        break;
      case 'spin':
        if (this.throttle('spin', 40)) return;
        this.tone(1800, 0.03, { type: 'square', vol: 0.05 });
        break;
      case 'horn':
        this.tone(415, 0.5, { type: 'sawtooth', vol: 0.08 });
        this.tone(523, 0.5, { type: 'sawtooth', vol: 0.08 });
        break;
    }
  }
}
