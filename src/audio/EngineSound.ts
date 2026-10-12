import type { AudioEngine } from './AudioEngine';

/** Continuous synthesized engine + wind + tire screech, driven by speed. */
export class EngineSound {
  private osc: OscillatorNode[] = [];
  private filter!: BiquadFilterNode;
  private gain!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private skidGain!: GainNode;
  private running = false;
  private srcs: AudioScheduledSourceNode[] = [];
  private gear = 1;

  constructor(private a: AudioEngine) {}

  start(character = 0) {
    if (!this.a.ready || this.running) return;
    const ctx = this.a.ctx!;
    this.running = true;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 700;
    this.filter.Q.value = 4;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    const types: OscillatorType[] = ['sawtooth', 'sawtooth', 'square'];
    const det = [0, 7 + character * 3, -1200];
    types.forEach((t, i) => {
      const o = ctx.createOscillator();
      o.type = t;
      o.frequency.value = 60;
      o.detune.value = det[i];
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.5 : 0.35;
      o.connect(g).connect(this.filter);
      o.start();
      this.osc.push(o);
      this.srcs.push(o);
    });
    this.filter.connect(this.gain).connect(this.a.engine);

    const noise = ctx.createBufferSource();
    noise.buffer = this.a.noiseBuffer();
    noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 800;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter).connect(this.windGain).connect(this.a.engine);
    const skidF = ctx.createBiquadFilter();
    skidF.type = 'bandpass';
    skidF.frequency.value = 1700;
    skidF.Q.value = 6;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    noise.connect(skidF).connect(this.skidGain).connect(this.a.engine);
    noise.start();
    this.srcs.push(noise);
  }

  /** v: m/s, vmax: car max speed, throttle 0..1 */
  update(v: number, vmax: number, throttle: number, nitro: boolean, drifting: boolean, active: boolean) {
    if (!this.running) return;
    const ctx = this.a.ctx!;
    const t = ctx.currentTime;
    // fake gearbox
    const ratio = Math.min(1.2, v / vmax);
    const gears = [0, 0.18, 0.36, 0.55, 0.75, 1.3];
    let g = 1;
    while (g < gears.length - 1 && ratio > gears[g]) g++;
    this.gear = g;
    const lo = gears[g - 1], hi = gears[g];
    const rpm = 0.25 + 0.75 * Math.min(1, (ratio - lo) / (hi - lo));
    const base = 45 + rpm * 120 + g * 8 + (nitro ? 20 : 0);
    for (let i = 0; i < this.osc.length; i++) this.osc[i].frequency.setTargetAtTime(base * (i === 2 ? 1 : 1), t, 0.04);
    this.filter.frequency.setTargetAtTime(400 + rpm * 1600 + throttle * 600 + (nitro ? 900 : 0), t, 0.05);
    this.gain.gain.setTargetAtTime(active ? 0.16 + throttle * 0.14 : 0, t, 0.08);
    this.windGain.gain.setTargetAtTime(active ? Math.min(0.25, (v / 80) ** 2 * 0.3) : 0, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(500 + v * 25, t, 0.1);
    this.skidGain.gain.setTargetAtTime(active && drifting ? 0.12 : 0, t, 0.05);
  }

  get currentGear() {
    return this.gear;
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    for (const s of this.srcs) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.srcs = [];
    this.osc = [];
  }
}
