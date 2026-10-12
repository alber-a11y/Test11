/** Web Audio graph: master -> compressor -> destination, with music / sfx / engine buses. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  engine!: GainNode;
  private noise: AudioBuffer | null = null;
  private musicVol = 0.6;
  private sfxVol = 0.8;
  private userMuted = false;
  private adMuted = false;
  private hiddenMuted = false;
  private unlockCbs: (() => void)[] = [];

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.connect(comp);
      this.music = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.engine = this.ctx.createGain();
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.engine.connect(this.master);
      this.applyVolumes();
      const cbs = this.unlockCbs;
      this.unlockCbs = [];
      cbs.forEach((c) => c());
    }
    if (this.ctx.state !== 'running' && !this.adMuted && !this.hiddenMuted) this.ctx.resume().catch(() => {});
  }

  onUnlock(cb: () => void) {
    if (this.ctx) cb();
    else this.unlockCbs.push(cb);
  }

  get ready() {
    return !!this.ctx;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  noiseBuffer(): AudioBuffer {
    if (!this.noise && this.ctx) {
      const len = this.ctx.sampleRate * 2;
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    }
    return this.noise!;
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  setUserMuted(m: boolean) {
    this.userMuted = m;
    this.applyVolumes();
  }

  get muted() {
    return this.userMuted;
  }

  /** Ads: fully silence and suspend the context; restores the previous state afterwards. */
  setAdMuted(m: boolean) {
    this.adMuted = m;
    this.applyVolumes();
    if (!this.ctx) return;
    if (m) this.ctx.suspend().catch(() => {});
    else if (!this.hiddenMuted) this.ctx.resume().catch(() => {});
  }

  /** Tab hidden / window blurred. */
  setHiddenMuted(m: boolean) {
    this.hiddenMuted = m;
    this.applyVolumes();
    if (!this.ctx) return;
    if (m) this.ctx.suspend().catch(() => {});
    else if (!this.adMuted) this.ctx.resume().catch(() => {});
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const silent = this.userMuted || this.adMuted || this.hiddenMuted;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(silent ? 0 : 1, t, 0.02);
    this.music.gain.setTargetAtTime(this.musicVol * 0.55, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.sfxVol, t, 0.02);
    this.engine.gain.setTargetAtTime(this.sfxVol * 0.5, t, 0.02);
  }

  duckMusic(k: number) {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(this.musicVol * 0.55 * k, this.ctx.currentTime, 0.15);
  }
}
