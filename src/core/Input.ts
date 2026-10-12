export type TouchScheme = 'zones' | 'drag';

interface TouchPtr {
  id: number;
  x0: number;
  x: number;
  side: -1 | 1;
}

/**
 * Unified input: keyboard, touch (two screen halves) and gamepad.
 * Mobile uses manual throttle: any finger on screen = gas; left/right half steers; release = brake.
 */
export class Input {
  enabled = true;
  scheme: TouchScheme = 'zones';
  throttle = 0;
  brake = 0;
  steer = 0;
  usingTouch = false;
  private keys = new Set<string>();
  private touches = new Map<number, TouchPtr>();
  private nitroQueued = false;
  private pauseQueued = false;
  private muteQueued = false;
  private gpNitroPrev = false;
  private gpPausePrev = false;
  private layer: HTMLElement;

  constructor(touchLayer: HTMLElement) {
    this.layer = touchLayer;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.reset());
    touchLayer.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  /** Touch steering layer is active only during a race. */
  setTouchActive(active: boolean) {
    this.layer.style.pointerEvents = active ? 'auto' : 'none';
    if (!active) this.touches.clear();
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const k = e.code;
    const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'Home', 'End'];
    if (gameKeys.includes(k)) e.preventDefault();
    if (down) {
      this.usingTouch = false;
      if (!this.keys.has(k)) {
        if (k === 'Space' || k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyN') this.nitroQueued = true;
        if (k === 'Escape' || k === 'KeyP') this.pauseQueued = true;
        if (k === 'KeyM') this.muteQueued = true;
      }
      this.keys.add(k);
    } else this.keys.delete(k);
  }

  private onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.usingTouch = e.pointerType !== 'mouse';
    const side = e.clientX < window.innerWidth / 2 ? -1 : 1;
    this.touches.set(e.pointerId, { id: e.pointerId, x0: e.clientX, x: e.clientX, side });
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX;
    if (this.scheme === 'zones') t.side = e.clientX < window.innerWidth / 2 ? -1 : 1;
    else {
      const range = Math.min(90, window.innerWidth * 0.12);
      if (t.x - t.x0 > range) t.x0 = t.x - range;
      if (t.x0 - t.x > range) t.x0 = t.x + range;
    }
  }

  private onPointerUp(e: PointerEvent) {
    this.touches.delete(e.pointerId);
  }

  pressNitro() {
    this.nitroQueued = true;
  }

  consumeNitro() {
    const v = this.nitroQueued;
    this.nitroQueued = false;
    return v && this.enabled;
  }

  consumePause() {
    const v = this.pauseQueued;
    this.pauseQueued = false;
    return v;
  }

  consumeMute() {
    const v = this.muteQueued;
    this.muteQueued = false;
    return v;
  }

  reset() {
    this.keys.clear();
    this.touches.clear();
    this.nitroQueued = false;
    this.pauseQueued = false;
    this.throttle = this.brake = this.steer = 0;
  }

  update() {
    if (!this.enabled) {
      this.throttle = this.brake = this.steer = 0;
      return;
    }
    const k = this.keys;
    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    let steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);

    if (this.touches.size > 0) {
      throttle = 1;
      if (this.scheme === 'zones') {
        let l = false, r = false;
        for (const t of this.touches.values()) {
          if (t.side < 0) l = true;
          else r = true;
        }
        steer = (r ? 1 : 0) - (l ? 1 : 0);
      } else {
        const t = this.touches.values().next().value as TouchPtr;
        const range = Math.min(90, window.innerWidth * 0.12);
        steer = Math.max(-1, Math.min(1, (t.x - t.x0) / range));
      }
    } else if (this.usingTouch && throttle === 0) {
      // finger released on mobile = brake
      brake = Math.max(brake, 0.55);
    }

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) steer = ax;
      if (p.buttons[7]?.value > 0.1) throttle = Math.max(throttle, p.buttons[7].value);
      if (p.buttons[6]?.value > 0.1) brake = Math.max(brake, p.buttons[6].value);
      if (p.buttons[12]?.pressed) throttle = 1;
      if (p.buttons[13]?.pressed) brake = 1;
      const n = !!(p.buttons[0]?.pressed || p.buttons[5]?.pressed);
      if (n && !this.gpNitroPrev) this.nitroQueued = true;
      this.gpNitroPrev = n;
      const ps = !!p.buttons[9]?.pressed;
      if (ps && !this.gpPausePrev) this.pauseQueued = true;
      this.gpPausePrev = ps;
      break;
    }
    this.throttle = throttle;
    this.brake = brake;
    this.steer = steer;
  }
}
