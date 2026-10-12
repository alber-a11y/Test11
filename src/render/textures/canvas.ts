import * as THREE from 'three';
import { Rng } from '../../core/Rng';

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export function toTexture(canvas: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

export const hex = (c: number, a = 1) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

export function shade(c: number, k: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

/** Speckle noise overlay — cheap "grain" for asphalt / concrete. */
export function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1, alpha = 0.12) {
  const rng = new Rng(seed);
  for (let i = 0; i < amount; i++) {
    const v = rng.next();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${alpha * rng.next()})` : `rgba(0,0,0,${alpha * rng.next()})`;
    const s = rng.range(1, 2);
    ctx.fillRect(rng.next() * w, rng.next() * h, s, s);
  }
}

const cache = new Map<string, THREE.Texture>();
export function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t as T;
}
