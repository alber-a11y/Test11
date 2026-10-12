import * as THREE from 'three';
import type { Biome } from '../../world/biomes/Biomes';
import { cached, hex, makeCanvas, mix, shade, speckle, toTexture } from './canvas';
import { Rng } from '../../core/Rng';

/** Road surface. u: across road (0..1), v: along road, one tile = ROAD_TILE meters. */
export const ROAD_TILE = 24;

export function roadTexture(b: Biome): THREE.Texture {
  return cached(`road-${b.id}`, () => {
    const W = 512, H = 1024;
    const [c, ctx] = makeCanvas(W, H);
    const r = b.road;
    const lane = (x: number) => x * W;
    switch (r.style) {
      case 'stripes': {
        // longitudinal orange / yellow bands (reference: sky level)
        const bands = 12;
        for (let i = 0; i < bands; i++) {
          ctx.fillStyle = hex(i % 2 ? r.base : r.base2);
          ctx.fillRect((i * W) / bands, 0, W / bands + 1, H);
        }
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.1)');
        g.addColorStop(0.5, 'rgba(0,0,0,0.06)');
        g.addColorStop(1, 'rgba(255,255,255,0.1)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        speckle(ctx, W, H, 5000, 3, 0.06);
        break;
      }
      case 'glass': {
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, hex(r.base2));
        g.addColorStop(0.5, hex(r.base));
        g.addColorStop(1, hex(r.base2));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = hex(r.line);
        for (let y = 0; y < H; y += 128) ctx.fillRect(0, y, W, 10);
        for (let i = 1; i < 6; i++) ctx.fillRect((i * W) / 6 - 2, 0, 4, H);
        ctx.globalAlpha = 1;
        break;
      }
      default: {
        ctx.fillStyle = hex(r.base);
        ctx.fillRect(0, 0, W, H);
        // subtle wheel tracks
        for (const x of [0.17, 0.33, 0.5, 0.67, 0.83]) {
          const g = ctx.createLinearGradient(lane(x - 0.06), 0, lane(x + 0.06), 0);
          g.addColorStop(0, hex(r.base, 0));
          g.addColorStop(0.5, hex(r.base2, 0.9));
          g.addColorStop(1, hex(r.base, 0));
          ctx.fillStyle = g;
          ctx.fillRect(lane(x - 0.06), 0, lane(0.12), H);
        }
        speckle(ctx, W, H, 26000, 7, r.style === 'ice' ? 0.08 : 0.16);
        if (r.style === 'ice') {
          const rng = new Rng(11);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 40; i++) {
            ctx.beginPath();
            let x = rng.next() * W, y = rng.next() * H;
            ctx.moveTo(x, y);
            for (let k = 0; k < 4; k++) {
              x += rng.range(-40, 40);
              y += rng.range(-40, 40);
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        }
        if (r.style === 'rock') {
          const rng = new Rng(5);
          ctx.strokeStyle = 'rgba(255,90,20,0.55)';
          ctx.lineWidth = 2;
          for (let i = 0; i < 18; i++) {
            ctx.beginPath();
            let x = rng.next() * W, y = rng.next() * H;
            ctx.moveTo(x, y);
            for (let k = 0; k < 5; k++) {
              x += rng.range(-30, 30);
              y += rng.range(-50, 50);
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        }
        // dashed lane dividers
        ctx.fillStyle = hex(r.line);
        for (const x of [1 / 3, 2 / 3]) {
          for (let y = 0; y < H; y += 256) {
            ctx.fillRect(lane(x) - 5, y + 40, 10, 150);
          }
        }
        // solid edge lines
        ctx.fillStyle = hex(r.edge);
        ctx.fillRect(lane(0.012), 0, 12, H);
        ctx.fillRect(lane(0.988) - 12, 0, 12, H);
      }
    }
    const t = toTexture(c);
    return t;
  });
}

/** Emissive overlay for neon roads — lines glow. */
export function roadEmissive(b: Biome): THREE.Texture | null {
  if (b.road.style !== 'neon') return null;
  return cached(`road-em-${b.id}`, () => {
    const W = 256, H = 512;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = hex(b.road.line);
    for (const x of [1 / 3, 2 / 3]) for (let y = 0; y < H; y += 128) ctx.fillRect(x * W - 3, y + 20, 6, 75);
    ctx.fillStyle = hex(b.road.edge);
    ctx.fillRect(2, 0, 7, H);
    ctx.fillRect(W - 9, 0, 7, H);
    return toTexture(c);
  });
}

/** Red/white diagonal hazard stripes for the shoulders (reference look). */
export function curbTexture(b: Biome): THREE.Texture {
  return cached(`curb-${b.id}`, () => {
    const W = 128, H = 256;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = hex(b.road.curbB);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = hex(b.road.curbA);
    const step = 64;
    for (let y = -W; y < H + W; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + W * 0.6);
      ctx.lineTo(W, y + W * 0.6 + step / 2);
      ctx.lineTo(0, y + step / 2);
      ctx.closePath();
      ctx.fill();
    }
    // inner yellow guide line like on the reference
    ctx.fillStyle = hex(b.road.edge);
    ctx.fillRect(0, 0, 10, H);
    speckle(ctx, W, H, 600, 9, 0.08);
    return toTexture(c);
  });
}

export function wallTexture(b: Biome): THREE.Texture {
  return cached(`wall-${b.id}`, () => {
    const W = 256, H = 64;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = hex(b.road.wall);
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // red / white blocks on top band
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = hex(i % 2 ? b.road.curbA : b.road.curbB);
      ctx.fillRect((i * W) / 8, 0, W / 8, H * 0.28);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 4; i++) ctx.fillRect((i * W) / 4, 0, 2, H);
    return toTexture(c);
  });
}

export function underTexture(b: Biome): THREE.Texture {
  return cached(`under-${b.id}`, () => {
    const W = 128, H = 128;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = hex(b.road.under);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = hex(shade(b.road.under, 0.8));
    for (let y = 0; y < H; y += 32) ctx.fillRect(0, y, W, 3);
    speckle(ctx, W, H, 1200, 13, 0.1);
    return toTexture(c);
  });
}

export function checkerTexture(): THREE.Texture {
  return cached('checker', () => {
    const [c, ctx] = makeCanvas(256, 64);
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 4; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        ctx.fillRect(x * 16, y * 16, 16, 16);
      }
    const t = toTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

export function boostTexture(): THREE.Texture {
  return cached('boost', () => {
    const W = 128, H = 256;
    const [c, ctx] = makeCanvas(W, H);
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, 'rgba(0,200,255,0.0)');
    g.addColorStop(1, 'rgba(0,220,255,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(4, 0, W - 8, H);
    for (let i = 0; i < 3; i++) {
      const y = H - 40 - i * 75;
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(W / 2, y - 50);
      ctx.lineTo(W - 14, y);
      ctx.lineTo(W - 14, y + 22);
      ctx.lineTo(W / 2, y - 28);
      ctx.lineTo(14, y + 22);
      ctx.closePath();
      ctx.fillStyle = i === 2 ? '#ffffff' : '#7ff3ff';
      ctx.fill();
    }
    return toTexture(c, { repeat: false });
  });
}

const BRANDS = ['OCEANIX', 'BLUWAVE', 'NOVA LINE', 'SEASTAR', 'KRAKEN', 'ZEPHYR', 'ORCA', 'TRITON', 'MARLIN'];

/** Corrugated shipping-container side with fictional brand. */
export function containerTexture(color: number, seed: number): THREE.Texture {
  return cached(`container-${color}-${seed % 4}`, () => {
    const W = 256, H = 128;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = hex(color);
    ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, 0, 3, H);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 4, 0, 2, H);
    }
    ctx.strokeStyle = hex(shade(color, 0.6));
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    if (seed % 4 !== 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(BRANDS[seed % BRANDS.length], W / 2, H / 2);
    }
    speckle(ctx, W, H, 500, seed, 0.12);
    return toTexture(c);
  });
}

export function windowsTexture(color: number, seed: number): THREE.Texture {
  return cached(`windows-${color}-${seed}`, () => {
    const W = 128, H = 256;
    const [c, ctx] = makeCanvas(W, H);
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, W, H);
    const rng = new Rng(seed);
    for (let y = 6; y < H; y += 12)
      for (let x = 6; x < W; x += 12) {
        if (rng.chance(0.55)) {
          ctx.fillStyle = hex(mix(color, 0xffffff, rng.next() * 0.5), rng.range(0.4, 1));
          ctx.fillRect(x, y, 7, 7);
        }
      }
    return toTexture(c);
  });
}
