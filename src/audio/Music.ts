import type { AudioEngine } from './AudioEngine';
import { Rng } from '../core/Rng';

type Drum = 'four' | 'break' | 'half' | 'dnb' | 'tropical' | 'chill';

interface Style {
  bpm: number;
  root: number; // midi note of tonic
  scale: number[];
  prog: number[]; // scale degrees (0-based) per bar
  drum: Drum;
  lead: OscillatorType;
  bassOct: number;
  swing: number;
  arp: boolean;
  bassRhythm: number[]; // 16 steps, 1 = hit
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYG = [0, 1, 4, 5, 7, 8, 10]; // phrygian dominant

const STYLES: Style[] = [
  // 0 sky — upbeat pop house
  { bpm: 124, root: 62, scale: MAJOR, prog: [0, 4, 5, 3], drum: 'four', lead: 'square', bassOct: -2, swing: 0, arp: true, bassRhythm: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1] },
  // 1 port — funky electro
  { bpm: 118, root: 57, scale: DORIAN, prog: [0, 3, 0, 4], drum: 'break', lead: 'sawtooth', bassOct: -2, swing: 0.08, arp: false, bassRhythm: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0] },
  // 2 bridge — driving rock synth
  { bpm: 132, root: 64, scale: MINOR, prog: [0, 5, 2, 6], drum: 'four', lead: 'sawtooth', bassOct: -2, swing: 0, arp: true, bassRhythm: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
  // 3 slide — tropical
  { bpm: 108, root: 65, scale: MAJOR, prog: [0, 5, 3, 4], drum: 'tropical', lead: 'triangle', bassOct: -2, swing: 0.05, arp: true, bassRhythm: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
  // 4 desert — phrygian groove
  { bpm: 120, root: 62, scale: PHRYG, prog: [0, 1, 0, 6], drum: 'break', lead: 'sawtooth', bassOct: -2, swing: 0.06, arp: false, bassRhythm: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1] },
  // 5 neon — synthwave
  { bpm: 104, root: 57, scale: MINOR, prog: [0, 5, 2, 6], drum: 'half', lead: 'sawtooth', bassOct: -2, swing: 0, arp: true, bassRhythm: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  // 6 snow — chill bounce
  { bpm: 116, root: 67, scale: MAJOR, prog: [3, 4, 2, 5], drum: 'chill', lead: 'triangle', bassOct: -2, swing: 0.1, arp: true, bassRhythm: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
  // 7 volcano — dnb
  { bpm: 172, root: 60, scale: MINOR, prog: [0, 0, 5, 6], drum: 'dnb', lead: 'square', bassOct: -2, swing: 0, arp: false, bassRhythm: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
  // 8 menu — laid back
  { bpm: 100, root: 60, scale: MAJOR, prog: [0, 5, 3, 4], drum: 'chill', lead: 'triangle', bassOct: -2, swing: 0.12, arp: true, bassRhythm: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
];

export const MENU_STYLE = 8;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Step sequencer that plays generated songs entirely with oscillators and noise. */
export class Music {
  private timer: number | null = null;
  private style: Style = STYLES[0];
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private melody: (number | null)[] = [];
  private melody2: (number | null)[] = [];
  private bus: GainNode | null = null;
  private delay: DelayNode | null = null;
  private delayIn: GainNode | null = null;
  intensity = 0.8;
  private playing = -1;
  private seed = 0;

  constructor(private a: AudioEngine) {}

  play(styleIndex: number, seed = 1) {
    if (!this.a.ready) {
      this.a.onUnlock(() => this.play(styleIndex, seed));
      return;
    }
    if (this.playing === styleIndex && this.seed === seed && this.timer !== null) return;
    this.stop();
    this.playing = styleIndex;
    this.seed = seed;
    const ctx = this.a.ctx!;
    this.style = STYLES[styleIndex % STYLES.length];
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
    this.bus.connect(this.a.music);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / this.style.bpm) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2500;
    this.delayIn = ctx.createGain();
    this.delayIn.gain.value = 0.35;
    this.delayIn.connect(this.delay);
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.bus);
    this.composeMelody(seed);
    this.step = 0;
    this.bar = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.bus && this.a.ctx) {
      const b = this.bus;
      b.gain.setTargetAtTime(0, this.a.ctx.currentTime, 0.15);
      setTimeout(() => b.disconnect(), 800);
    }
    this.bus = null;
    this.playing = -1;
  }

  private composeMelody(seed: number) {
    const rng = new Rng(seed * 7919 + this.style.bpm);
    const make = (density: number) => {
      const out: (number | null)[] = [];
      let deg = rng.int(0, 4);
      for (let i = 0; i < 32; i++) {
        const strong = i % 4 === 0;
        if (rng.chance(strong ? density + 0.2 : density - 0.15)) {
          deg += rng.weighted([
            { item: 0, w: 2 },
            { item: 1, w: 3 },
            { item: -1, w: 3 },
            { item: 2, w: 2 },
            { item: -2, w: 2 },
            { item: 4, w: 0.5 },
          ]);
          deg = Math.max(-2, Math.min(9, deg));
          out.push(deg);
        } else out.push(null);
      }
      return out;
    };
    this.melody = make(0.55);
    this.melody2 = make(0.45);
  }

  private degToMidi(deg: number, octave = 0) {
    const sc = this.style.scale;
    const o = Math.floor(deg / sc.length);
    const idx = ((deg % sc.length) + sc.length) % sc.length;
    return this.style.root + sc[idx] + 12 * (o + octave);
  }

  private schedule() {
    const ctx = this.a.ctx;
    if (!ctx || !this.bus) return;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    const stepDur = 60 / this.style.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const swing = this.step % 2 === 1 ? this.style.swing * stepDur : 0;
      this.playStep(this.nextTime + swing, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private playStep(t: number, sd: number) {
    const s = this.step;
    const st = this.style;
    const I = this.intensity;
    const chordDeg = st.prog[this.bar % st.prog.length];
    const section = Math.floor(this.bar / 8) % 4; // intro-ish variation
    const drumsOn = I > 0.3 || section > 0;

    // ---- drums ----
    if (drumsOn) {
      switch (st.drum) {
        case 'four':
          if (s % 4 === 0) this.kick(t);
          if (s === 4 || s === 12) this.snare(t, 0.35);
          if (s % 4 === 2) this.hat(t, 0.12, true);
          else if (I > 0.6) this.hat(t, 0.05);
          break;
        case 'break':
          if (s === 0 || s === 10 || (s === 7 && this.bar % 2)) this.kick(t);
          if (s === 4 || s === 12) this.snare(t, 0.35);
          if (s % 2 === 0) this.hat(t, 0.08);
          if (s === 14) this.hat(t, 0.1, true);
          break;
        case 'half':
          if (s === 0 || s === 6 || s === 10) this.kick(t);
          if (s === 8) this.snare(t, 0.45);
          if (s % 2 === 0) this.hat(t, 0.07);
          break;
        case 'dnb':
          if (s === 0 || s === 10) this.kick(t);
          if (s === 4 || s === 12) this.snare(t, 0.45);
          this.hat(t, s % 2 ? 0.04 : 0.08);
          break;
        case 'tropical':
          if (s % 4 === 0) this.kick(t, 0.7);
          if (s === 3 || s === 6 || s === 11 || s === 14) this.snare(t, 0.18, true);
          if (s % 2 === 0) this.hat(t, 0.05);
          break;
        case 'chill':
          if (s === 0 || s === 7 || s === 10) this.kick(t, 0.6);
          if (s === 4 || s === 12) this.snare(t, 0.2, true);
          if (s % 2 === 0) this.hat(t, 0.04);
          break;
      }
    }

    // ---- bass ----
    if (st.bassRhythm[s]) {
      const oct = st.drum === 'half' && s % 2 ? 1 : 0;
      this.bass(t, mtof(this.degToMidi(chordDeg, st.bassOct + oct)), sd * (st.drum === 'dnb' ? 6 : 1.6));
    }

    // ---- pad (chord) at bar start ----
    if (s === 0) {
      const notes = [0, 2, 4].map((k) => mtof(this.degToMidi(chordDeg + k, -1)));
      this.pad(t, notes, sd * 16);
    }

    // ---- arp ----
    if (st.arp && I > 0.5 && s % 2 === 0) {
      const k = [0, 2, 4, 7][(s / 2) % 4];
      this.pluck(t, mtof(this.degToMidi(chordDeg + k, 1)), 0.035);
    }

    // ---- lead ----
    if (I > 0.45 && section !== 0) {
      const mel = this.bar % 4 === 3 ? this.melody2 : this.melody;
      const idx = (this.bar % 2) * 16 + s;
      const deg = mel[idx];
      if (deg !== null && deg !== undefined) {
        let len = 1;
        while (len < 4 && mel[(idx + len) % 32] === null) len++;
        this.lead(t, mtof(this.degToMidi(deg + chordDeg * 0, 1)), sd * len * 0.95);
      }
    }
  }

  // ---------------- instruments ----------------
  private env(g: GainNode, t: number, vol: number, atk: number, dur: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private kick(t: number, vol = 0.9) {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, vol, 0.002, 0.3);
    o.connect(g).connect(this.bus!);
    o.start(t);
    o.stop(t + 0.35);
  }

  private snare(t: number, vol: number, clap = false) {
    const ctx = this.a.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.a.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = clap ? 1200 : 1800;
    f.Q.value = clap ? 1.5 : 0.8;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.002, clap ? 0.12 : 0.18);
    n.connect(f).connect(g).connect(this.bus!);
    n.start(t, Math.random());
    n.stop(t + 0.25);
    if (!clap) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      const g2 = ctx.createGain();
      this.env(g2, t, vol * 0.5, 0.002, 0.1);
      o.connect(g2).connect(this.bus!);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  private hat(t: number, vol: number, open = false) {
    const ctx = this.a.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.a.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.001, open ? 0.14 : 0.04);
    n.connect(f).connect(g).connect(this.bus!);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  }

  private bass(t: number, freq: number, dur: number) {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = freq / 2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + Math.min(dur, 0.25));
    const g = ctx.createGain();
    this.env(g, t, 0.28, 0.005, dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(this.bus!);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private pad(t: number, notes: number[], dur: number) {
    const ctx = this.a.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    f.connect(g).connect(this.bus!);
    for (const n of notes) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = n;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }

  private pluck(t: number, freq: number, vol: number) {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.002, 0.18);
    o.connect(g).connect(this.bus!);
    g.connect(this.delayIn!);
    o.start(t);
    o.stop(t + 0.2);
  }

  private lead(t: number, freq: number, dur: number) {
    const ctx = this.a.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
    g.gain.setValueAtTime(0.07, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    f.connect(g).connect(this.bus!);
    g.connect(this.delayIn!);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = freq * 0.006;
    lfo.connect(lg);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = this.style.lead;
      o.frequency.value = freq;
      o.detune.value = det;
      lg.connect(o.frequency);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
  }
}
