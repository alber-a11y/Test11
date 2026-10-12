import { Renderer } from '../render/Renderer';
import { World } from '../world/World';
import { Showroom } from '../world/Showroom';
import { Effects } from '../render/Particles';
import { ChaseCamera, SpeedLines } from '../gameplay/ChaseCamera';
import { Input } from './Input';
import { Audio } from '../audio/Audio';
import { MENU_STYLE } from '../audio/Music';
import { SaveService } from '../meta/SaveService';
import { Economy, levelReward } from '../meta/Economy';
import { AdService } from '../ads/AdService';
import { MockProvider } from '../ads/providers/MockProvider';
import { UI } from '../ui/UI';
import { Thumbnails } from '../ui/Thumbnails';
import { generateLevel, type LevelData } from '../world/track/TrackGenerator';
import { biomeForLevel, BIOMES } from '../world/biomes/Biomes';
import { Race, type RaceResult } from '../gameplay/Race';
import { CARS, byId, type BoosterId } from '../meta/Catalog';
import { displaySpeed } from '../gameplay/Racer';
import { setLang, t, placeSuffix, lang } from '../i18n/i18n';
import { track } from '../meta/Analytics';
import { LoadingScreen } from '../ui/screens/Loading';
import { MenuScreen } from '../ui/screens/Menu';
import { MapScreen } from '../ui/screens/MapScreen';
import { ShopScreen, type ShopTab } from '../ui/screens/Shop';
import { GarageScreen } from '../ui/screens/Garage';
import { PreRaceScreen } from '../ui/screens/PreRace';
import { HudScreen } from '../ui/screens/Hud';
import { PauseScreen } from '../ui/screens/Pause';
import { ResultScreen } from '../ui/screens/Result';
import { GameOverScreen } from '../ui/screens/GameOver';
import { openSettings } from '../ui/screens/Settings';
import { installPageGuard } from './PageGuard';

export type GameMode = 'boot' | 'menu' | 'race';

export class Game {
  readonly renderer: Renderer;
  readonly world: World;
  readonly showroom = new Showroom();
  readonly effects = new Effects();
  readonly chase: ChaseCamera;
  readonly speedLines = new SpeedLines();
  readonly input: Input;
  readonly audio = new Audio();
  readonly save = new SaveService();
  readonly eco = new Economy(this.save);
  readonly ui: UI;
  readonly ads: AdService;
  readonly thumbs: Thumbnails;

  mode: GameMode = 'boot';
  race: Race | null = null;
  level: LevelData | null = null;
  trialCarId: string | null = null;
  lastBoosters: BoosterId[] = [];
  paused = false;
  adActive = false;
  private resumeTimer = 0;
  private renderedWhilePaused = false;
  private last = performance.now();
  private hud: HudScreen | null = null;
  private finishTimer = -1;
  private pendingResult: RaceResult | null = null;
  private fpsSamples: number[] = [];
  private menuBiome = -1;
  /** Debug: ?ts=N runs N simulation substeps per frame (for slow headless test runs). */
  private timeScale = Math.max(1, Math.min(20, Number(new URLSearchParams(location.search).get('ts') ?? 1)));

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.world = new World(this.renderer);
    this.chase = new ChaseCamera(this.renderer.camera);
    this.input = new Input(document.getElementById('touch-layer')!);
    this.ui = new UI(document.getElementById('ui-root')!);
    this.thumbs = new Thumbnails(this.renderer);
    const s = this.save.data.settings;
    setLang(s.lang);
    this.input.scheme = s.controls;
    this.applyQuality();
    this.audio.engine.setVolumes(s.music, s.sfx);
    this.audio.engine.setUserMuted(s.muted);

    this.ads = new AdService(new MockProvider(document.getElementById('ad-root')!), {
      begin: () => {
        this.adActive = true;
        document.body.classList.add('ad-active');
        this.audio.engine.setAdMuted(true);
        this.input.enabled = false;
        this.input.reset();
      },
      end: () => {
        this.adActive = false;
        document.body.classList.remove('ad-active');
        this.audio.engine.setAdMuted(false);
        this.input.enabled = true;
        this.input.reset();
        this.last = performance.now();
      },
      toast: (m) => this.ui.toast(m),
    });

    const scene = this.renderer.scene;
    scene.add(this.showroom.group);
    scene.add(this.effects.group);
    scene.add(this.renderer.camera);
    this.renderer.camera.add(this.speedLines.mesh);

    installPageGuard({
      onHidden: () => this.onHidden(),
      onVisible: () => this.onVisible(),
    });
    window.addEventListener('resize', () => this.effects.setViewportHeight(this.renderer.height * this.renderer.renderer.getPixelRatio()));
    this.effects.setViewportHeight(this.renderer.height * this.renderer.renderer.getPixelRatio());
  }

  applyQuality() {
    const q = this.save.data.settings.quality;
    this.renderer.setQuality(q === 'auto' ? Renderer.detectQuality() : q);
    this.effects.setViewportHeight(this.renderer.height * this.renderer.renderer.getPixelRatio());
  }

  // ====================================================================
  async boot() {
    const loading = new LoadingScreen();
    this.ui.show('loading', loading);
    this.ads.init();
    // warm up: build the menu scene while the loading bar fills
    this.world.applyBiome(biomeForLevel(this.save.data.level));
    loading.setProgress(0.35);
    await nextFrame();
    this.showroom.setCar(this.eco.look(this.save.data.selectedCar));
    loading.setProgress(0.6);
    await nextFrame();
    this.mode = 'menu';
    this.showroom.group.visible = true;
    requestAnimationFrame(() => this.loop());
    loading.setProgress(1);
    this.ads.loadingFinished();
    await loading.waitTap();
    this.audio.engine.unlock();
    this.goMenu();
  }

  // ====================================================================
  private enterMenuScene() {
    if (this.mode === 'race') this.leaveRace();
    this.mode = 'menu';
    const lvl = this.save.data.level;
    const bi = BIOMES.indexOf(biomeForLevel(lvl));
    if (bi !== this.menuBiome) {
      this.menuBiome = bi;
      this.world.applyBiome(BIOMES[bi]);
    }
    this.showroom.group.visible = true;
    this.showroom.setCar(this.eco.look(this.save.data.selectedCar));
    this.input.setTouchActive(false);
    this.audio.music.intensity = 0.4;
    this.audio.music.play(MENU_STYLE, 1);
    this.audio.engine.duckMusic(1);
  }

  goMenu() {
    this.enterMenuScene();
    this.showroom.framing = 'menu';
    this.ui.show('menu', new MenuScreen(this));
  }

  async goMenuWithAd(placement: string) {
    await this.ads.interstitial(placement, this.save.data.level);
    this.grantPendingRaceCoins();
    this.goMenu();
  }

  goMap() {
    this.enterMenuScene();
    this.showroom.framing = 'center';
    this.ui.show('map', new MapScreen(this));
  }

  goShop(tab: ShopTab = 'cars') {
    this.enterMenuScene();
    this.showroom.framing = 'shop';
    this.ui.show('shop', new ShopScreen(this, tab));
  }

  goGarage() {
    this.enterMenuScene();
    this.showroom.framing = 'shop';
    this.ui.show('garage', new GarageScreen(this));
  }

  goPreRace(level: number) {
    this.enterMenuScene();
    this.showroom.framing = 'shop';
    this.ui.show('prerace', new PreRaceScreen(this, level));
  }

  openSettings() {
    openSettings(this);
  }

  /** Switch RU/EN and rebuild whatever is on screen. */
  setLanguage(l: 'auto' | 'ru' | 'en') {
    this.save.data.settings.lang = l;
    setLang(l);
    this.save.save();
    const cur = this.ui.current;
    switch (this.ui.currentName) {
      case 'menu':
        this.goMenu();
        break;
      case 'map':
        this.goMap();
        break;
      case 'shop':
        this.goShop((cur as ShopScreen).tab);
        break;
      case 'garage':
        this.goGarage();
        break;
      case 'prerace':
        this.goPreRace((cur as PreRaceScreen).level);
        break;
      case 'hud':
        if (this.race) {
          this.hud = new HudScreen(this, this.race);
          this.ui.show('hud', this.hud);
          if (this.paused && this.resumeTimer <= 0) this.ui.modal(new PauseScreen(this).el, { dismissable: false });
        }
        break;
    }
  }

  get language(): 'ru' | 'en' {
    return lang;
  }

  // ====================================================================
  startRace(levelNum: number, boosters: BoosterId[], trialCarId: string | null = null) {
    if (this.race) this.leaveRace();
    this.mode = 'race';
    this.paused = false;
    this.trialCarId = trialCarId;
    this.lastBoosters = boosters;
    this.showroom.group.visible = false;
    this.renderer.camera.clearViewOffset();
    this.level = generateLevel(levelNum);
    this.world.loadLevel(this.level);
    this.menuBiome = -1;
    const carId = trialCarId ?? this.save.data.selectedCar;
    const def = byId(CARS, carId);
    const look = trialCarId ? { carId, paint: def.paint, livery: def.livery, rim: def.rim, neon: 'blue', trail: 'blue' } : this.eco.look(carId);
    const upgrades = trialCarId ? {} : this.eco.custom(carId).upgrades;
    this.effects.clear();
    this.race = new Race({ level: this.level, playerDef: def, look, upgrades, boosters }, this.effects);
    this.renderer.scene.add(this.race.group);
    this.chase.reset();
    this.finishTimer = -1;
    this.pendingResult = null;
    this.fpsSamples = [];
    this.bindRaceEvents(this.race);
    this.input.reset();
    this.input.setTouchActive(true);
    this.hud = new HudScreen(this, this.race);
    this.ui.show('hud', this.hud);
    this.audio.music.intensity = 0.85;
    this.audio.music.play(this.level.biome.music, levelNum);
    this.audio.engine.duckMusic(1);
    this.audio.car.start(CARS.indexOf(def) % 3);
    this.ads.gameplayStart();
    track('race_start', { level: levelNum, car: carId });
    this.last = performance.now();
  }

  async restartRace(withAd = true) {
    if (!this.level) return;
    const lvl = this.level.level;
    this.grantPendingRaceCoins();
    this.leaveRace();
    if (withAd) await this.ads.interstitial('restart', this.save.data.level);
    // boosters are consumed per race; reuse only those still in stock
    const boosters = this.lastBoosters.filter((b) => this.eco.useBooster(b));
    this.startRace(lvl, boosters, this.trialCarId);
  }

  /** Coins collected during a failed / abandoned race are still credited. */
  private grantPendingRaceCoins() {
    if (this.race && this.race.state !== 'finished' && this.race.coins > 0) {
      this.eco.addCoins(this.race.coins);
      this.eco.addGems(this.race.gems);
      this.race.coins = 0;
      this.race.gems = 0;
    }
  }

  leaveRace() {
    if (!this.race) return;
    this.ads.gameplayStop();
    this.audio.car.stop();
    this.renderer.scene.remove(this.race.group);
    this.race.dispose();
    this.race = null;
    this.hud = null;
    this.world.clearLevel();
    this.effects.clear();
    this.input.setTouchActive(false);
    this.paused = false;
    this.speedLines.update(0, 0, 0);
    this.renderer.setSpeedEffect(0);
  }

  pause() {
    if (this.mode !== 'race' || !this.race || this.paused) return;
    if (this.race.state === 'finished' || this.race.state === 'gameover') return;
    this.paused = true;
    this.renderedWhilePaused = false;
    this.audio.car.update(0, 1, 0, false, false, false);
    this.audio.engine.duckMusic(0.4);
    this.input.reset();
    this.ads.gameplayStop();
    this.ui.modal(new PauseScreen(this).el, { dismissable: false });
  }

  resume() {
    this.ui.closeAllModals();
    this.audio.engine.duckMusic(1);
    this.resumeTimer = 1.5;
    this.hud?.showResumeCountdown(this.resumeTimer);
    this.ads.gameplayStart();
  }

  private bindRaceEvents(race: Race) {
    const sfx = this.audio.sfx;
    const ev = race.events;
    ev.on('countdown', (n) => {
      sfx.play('count');
      this.hud?.countdown(String(n));
    });
    ev.on('go', () => {
      sfx.play('go');
      this.hud?.countdown(t('go'), true);
    });
    ev.on('pickup', ({ kind, combo }) => {
      if (kind === 'coin') sfx.play('coin', combo);
      else if (kind === 'star') {
        sfx.play('star', combo);
        if (combo > 1) this.hud?.floater(t('combo', { n: combo }), '#7ae8ff');
      } else if (kind === 'heart') {
        sfx.play('heart');
        this.hud?.floater('+❤', '#ff5a7a');
      } else if (kind === 'gem') sfx.play('gem');
      else if (kind === 'nitro') sfx.play('nitroPickup');
      else {
        sfx.play('powerup');
        this.hud?.floater(kind === 'x2' ? 'x2!' : kind === 'shield' ? '🛡️' : '🧲', '#fff');
      }
      if (kind !== 'coin') this.vibrate(20);
    });
    ev.on('heartLost', () => {
      sfx.play('heartLost');
      this.hud?.hit();
      this.vibrate(120);
    });
    ev.on('crash', ({ hard }) => {
      sfx.play(hard ? 'crash' : 'smash');
      this.chase.addShake(hard ? 1 : 0.4);
      if (hard) this.vibrate(150);
    });
    ev.on('wall', ({ strength }) => {
      sfx.play('wall', strength);
      this.chase.addShake(Math.min(0.4, strength * 0.04));
    });
    ev.on('bump', ({ strength }) => {
      sfx.play('bump');
      this.chase.addShake(Math.min(0.5, strength * 0.05));
      this.vibrate(30);
    });
    ev.on('nitro', () => {
      sfx.play('nitro');
      this.chase.addShake(0.3);
    });
    ev.on('boost', () => {
      sfx.play('boost');
      this.chase.addShake(0.2);
    });
    ev.on('jump', () => sfx.play('jump'));
    ev.on('land', ({ hard }) => {
      sfx.play('land', hard ? 1 : 0);
      this.chase.addShake(hard ? 0.5 : 0.2);
    });
    ev.on('fall', () => {
      sfx.play('fall');
      this.chase.mode = 'fall';
    });
    ev.on('respawn', () => {
      sfx.play('respawn');
      this.chase.mode = 'chase';
      this.chase.reset();
    });
    ev.on('overtake', ({ place }) => {
      sfx.play('overtake');
      this.hud?.floater(`${place}${placeSuffix(place)}`, '#ffe27a');
    });
    ev.on('shieldBreak', () => sfx.play('shieldBreak'));
    ev.on('nitroReady', () => sfx.play('nitroReady'));
    ev.on('finish', (res) => {
      this.pendingResult = res;
      this.finishTimer = 2.2;
      this.chase.mode = 'orbit';
      sfx.play(res.place <= 3 ? 'win' : 'lose');
      this.audio.engine.duckMusic(0.5);
      this.input.setTouchActive(false);
      this.ads.gameplayStop();
      if (res.place === 1) this.ads.happyTime();
      track('race_finish', { level: race.level.level, place: res.place });
    });
    ev.on('gameover', () => {
      sfx.play('gameover');
      this.audio.car.update(0, 1, 0, false, false, false);
      this.audio.engine.duckMusic(0.35);
      this.input.setTouchActive(false);
      this.ads.gameplayStop();
      track('game_over', { level: race.level.level });
      this.ui.show('gameover', new GameOverScreen(this, race));
    });
  }

  private async showResult(res: RaceResult) {
    if (!this.race || !this.level) return;
    const level = this.level.level;
    const stars = this.eco.completeLevel(level, res.place, res.score);
    const base = levelReward(level, res.place);
    const earned = base + res.coins;
    this.eco.addCoins(earned);
    this.eco.addGems(res.gems);
    // natural break: interstitial before the result screen
    await this.ads.interstitial('level_complete', this.save.data.level);
    this.ui.show('result', new ResultScreen(this, { ...res, stars, base, earned, level, trial: this.trialCarId }));
  }

  async revive(): Promise<boolean> {
    if (!this.race) return false;
    const ok = await this.ads.rewarded('revive');
    if (!ok || !this.race) return false;
    this.race.revive();
    this.chase.mode = 'chase';
    this.chase.reset();
    this.hud = new HudScreen(this, this.race);
    this.ui.show('hud', this.hud);
    this.input.setTouchActive(true);
    this.audio.engine.duckMusic(1);
    this.paused = false;
    this.resumeTimer = 1.5;
    this.hud.showResumeCountdown(this.resumeTimer);
    this.ads.gameplayStart();
    track('revive', { level: this.race.level.level });
    return true;
  }

  vibrate(ms: number) {
    if (this.save.data.settings.vibration && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        /* ignore */
      }
    }
  }

  // ====================================================================
  private onHidden() {
    this.audio.engine.setHiddenMuted(true);
    this.input.reset();
    if (this.mode === 'race' && this.race?.state === 'racing' && !this.paused && !this.adActive) this.pause();
    this.save.flush();
  }

  private onVisible() {
    this.audio.engine.setHiddenMuted(false);
    this.last = performance.now();
  }

  // ====================================================================
  private loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (this.adActive || document.hidden) return;
    dt = Math.min(dt, 1 / 20);
    this.input.update();
    if (this.input.consumeMute()) {
      const s = this.save.data.settings;
      s.muted = !s.muted;
      this.audio.engine.setUserMuted(s.muted);
      this.save.save();
      this.ui.toast(s.muted ? '🔇' : '🔊', 800);
    }

    if (this.mode === 'race' && this.race) {
      if (this.input.consumePause()) {
        if (this.paused && this.resumeTimer <= 0) this.resume();
        else this.pause();
      }
      if (this.paused) {
        if (this.resumeTimer > 0) {
          this.resumeTimer -= dt;
          this.hud?.showResumeCountdown(this.resumeTimer);
          if (this.resumeTimer <= 0) {
            this.paused = false;
            this.input.reset();
          }
        } else {
          if (!this.renderedWhilePaused) {
            this.renderer.render();
            this.renderedWhilePaused = true;
          }
          return;
        }
      } else for (let i = 0; i < this.timeScale; i++) this.updateRace(dt);
    } else if (this.mode === 'menu') {
      this.input.consumePause();
      this.showroom.update(dt, this.renderer.camera, this.renderer.width, this.renderer.height);
      this.world.update(dt, this.showroom.center, this.renderer.camera.position);
    }
    this.ui.update(dt);
    this.save.data.stats.playTime += dt;
    this.renderer.render();
  }

  private updateRace(dt: number) {
    const race = this.race!;
    race.update(dt, this.input);
    this.effects.update(dt);
    const p = race.player;
    const portrait = this.renderer.height > this.renderer.width;
    this.chase.update(dt, p, p.nitroActive || p.boostTime > 0, portrait);
    this.world.update(dt, p.pos, this.renderer.camera.position);
    const k = race.level.biome.speedLines;
    this.speedLines.update(dt, p.v, k * (p.nitroActive ? 1.6 : 1));
    this.renderer.setSpeedEffect(p.nitroActive || p.boostTime > 0 ? 1 : Math.max(0, (p.v - 55) / 30));
    const active = race.state === 'racing' || race.state === 'countdown';
    this.audio.car.update(p.v, p.stats.maxSpeed, active ? (race.state === 'countdown' ? this.input.throttle : p.throttle) : 0, p.nitroActive, p.drifting, active && p.state !== 'fall');
    // final stretch music intensity
    this.audio.music.intensity = race.progress > 0.8 ? 1 : 0.85;
    void displaySpeed;

    if (this.finishTimer > 0) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0 && this.pendingResult) {
        const res = this.pendingResult;
        this.pendingResult = null;
        this.showResult(res);
      }
    }
    this.autoQuality(dt);
  }

  private autoQuality(dt: number) {
    if (this.save.data.settings.quality !== 'auto' || this.fpsSamples.length > 300) return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length === 300) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      const fps = 1 / avg;
      if (fps < 24 && this.renderer.quality !== 'low') this.renderer.setQuality('low');
      else if (fps < 40 && this.renderer.quality === 'high') this.renderer.setQuality('medium');
      this.effects.setViewportHeight(this.renderer.height * this.renderer.renderer.getPixelRatio());
    }
  }
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

