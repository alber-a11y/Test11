import * as THREE from 'three';
import type { LiveryDef, PaintDef, CarShape } from '../meta/Catalog';
import { cached, hex, makeCanvas, mix, shade, toTexture } from '../render/textures/canvas';
import { Rng } from '../core/Rng';

const W = 512, H = 512;
const luminance = (c: number) => (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;

/** u: around the body (0 bottom, .25 right, .5 top, .75 left); v: along (0 rear, 1 front). */
export function bodyTexture(paint: PaintDef, livery: LiveryDef, shape: CarShape, carId: string): THREE.Texture {
  return cached(`body-${carId}-${paint.id}-${livery.id}`, () => {
    const [c, ctx] = makeCanvas(W, H);
    const X = (u: number) => u * W;
    const Y = (v: number) => (1 - v) * H;
    const base = paint.color;
    const accent = luminance(base) > 0.6 ? 0x16171b : 0xffffff;

    // base coat
    if (paint.color2 !== undefined) {
      const g = ctx.createLinearGradient(0, Y(0), 0, Y(1));
      g.addColorStop(0, hex(paint.color));
      g.addColorStop(1, hex(paint.color2));
      ctx.fillStyle = g;
    } else ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, W, H);
    if (paint.finish === 'carbon') {
      for (let y = 0; y < H; y += 8)
        for (let x = 0; x < W; x += 8) {
          ctx.fillStyle = (x / 8 + y / 8) % 2 ? '#2c2f35' : '#17181c';
          ctx.fillRect(x, y, 8, 8);
        }
    }

    const rng = new Rng(carId.length * 31 + livery.id.length);
    switch (livery.id) {
      case 'twin': {
        ctx.fillStyle = hex(accent);
        for (const o of [-0.045, 0.02]) ctx.fillRect(X(0.5 + o), 0, X(0.025), H);
        break;
      }
      case 'side': {
        ctx.fillStyle = hex(accent);
        ctx.fillRect(0, 0, 0, 0);
        for (const u of [0.22, 0.75]) ctx.fillRect(X(u), 0, X(0.03), H);
        ctx.fillStyle = hex(shade(base, 0.55));
        for (const u of [0.255, 0.715]) ctx.fillRect(X(u), 0, X(0.012), H);
        break;
      }
      case 'number': {
        ctx.fillStyle = hex(accent);
        ctx.fillRect(X(0.49), 0, X(0.02), H);
        for (const u of [0.25, 0.75]) {
          ctx.beginPath();
          ctx.ellipse(X(u), Y(0.5), X(0.06), X(0.075), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.translate(X(u), Y(0.5));
          ctx.rotate(u < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          ctx.fillStyle = hex(base === accent ? 0 : base);
          ctx.font = 'bold 52px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(7 + (carId.length % 80)), 0, 2);
          ctx.restore();
          ctx.fillStyle = hex(accent);
        }
        break;
      }
      case 'checker': {
        const s = 16;
        for (const u0 of [0.13, 0.81]) {
          for (let y = 0; y < H; y += s)
            for (let k = 0; k < 3; k++) {
              ctx.fillStyle = (y / s + k) % 2 ? '#111' : '#fff';
              ctx.fillRect(X(u0) + k * s, y, s, s);
            }
        }
        break;
      }
      case 'flames': {
        const fire = [0xffe02a, 0xff8a1a, 0xe8201a];
        for (const side of [0.25, 0.75]) {
          fire.forEach((fc, li) => {
            ctx.fillStyle = hex(fc);
            const k = 1 - li * 0.18;
            for (let f = 0; f < 6; f++) {
              const u = side + (f - 2.5) * 0.028;
              ctx.beginPath();
              ctx.moveTo(X(u - 0.03 * k), Y(1));
              ctx.quadraticCurveTo(X(u + 0.04), Y(0.7), X(u + rng.range(-0.02, 0.02)), Y((0.25 + rng.next() * 0.25) / k));
              ctx.quadraticCurveTo(X(u - 0.02), Y(0.75), X(u + 0.03 * k), Y(1));
              ctx.fill();
            }
          });
        }
        // hood flames
        ctx.fillStyle = hex(0xff8a1a, 0.9);
        for (let f = 0; f < 5; f++) {
          const u = 0.44 + f * 0.03;
          ctx.beginPath();
          ctx.moveTo(X(u - 0.015), Y(1));
          ctx.quadraticCurveTo(X(u + 0.02), Y(0.85), X(u), Y(0.68 - rng.next() * 0.08));
          ctx.quadraticCurveTo(X(u - 0.01), Y(0.86), X(u + 0.015), Y(1));
          ctx.fill();
        }
        break;
      }
      case 'gradient': {
        const g = ctx.createLinearGradient(0, Y(0), 0, Y(0.8));
        g.addColorStop(0, 'rgba(10,10,14,0.95)');
        g.addColorStop(1, 'rgba(10,10,14,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case 'camo': {
        const cols = [shade(base, 0.6), shade(base, 1.3), mix(base, 0x3a3a2a, 0.6)];
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = hex(rng.pick(cols));
          ctx.beginPath();
          ctx.ellipse(rng.next() * W, rng.next() * H, rng.range(14, 40), rng.range(8, 26), rng.next() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'tiger': {
        ctx.fillStyle = '#121214';
        for (let i = 0; i < 26; i++) {
          const v = rng.next();
          const u = rng.next();
          ctx.beginPath();
          ctx.moveTo(X(u), Y(v));
          ctx.quadraticCurveTo(X(u + 0.08), Y(v + 0.02), X(u + 0.16), Y(v - 0.015));
          ctx.quadraticCurveTo(X(u + 0.08), Y(v + 0.045), X(u), Y(v));
          ctx.fill();
        }
        break;
      }
    }

    // underbody + wheel arches (dark)
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(0, 0, X(0.06), H);
    ctx.fillRect(X(0.94), 0, X(0.06), H);
    const wbHalf = shape.wheelbase / 2;
    for (const v of [0.5 - wbHalf, 0.5 + wbHalf]) {
      for (const u of [0.1, 0.9]) {
        ctx.beginPath();
        ctx.ellipse(X(u), Y(v), X(0.065), (shape.wheelR / shape.length) * H * 1.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // panel gaps / door lines
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (const u of [0.25, 0.75]) {
      const vd = (shape.cabinStart + shape.cabinEnd) / 2;
      ctx.beginPath();
      ctx.moveTo(X(u - 0.08), Y(vd + 0.18));
      ctx.lineTo(X(u + 0.08), Y(vd + 0.18));
      ctx.moveTo(X(u - 0.08), Y(vd - 0.12));
      ctx.lineTo(X(u + 0.08), Y(vd - 0.12));
      ctx.stroke();
    }
    // hood scoop / grille hint
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(X(0.42), Y(1), X(0.16), H * 0.018);
    return toTexture(c, { aniso: 4 });
  });
}

/** Cabin: u across (0 right sill, .5 roof center, 1 left sill), v along cabin (0 rear, 1 front). */
export function cabinTexture(paint: PaintDef, livery: LiveryDef, shape: CarShape, carId: string): THREE.Texture {
  return cached(`cabin-${carId}-${paint.id}-${livery.id}`, () => {
    const CW = 256, CH = 256;
    const [c, ctx] = makeCanvas(CW, CH);
    const X = (u: number) => u * CW;
    const Y = (v: number) => (1 - v) * CH;
    const g = ctx.createLinearGradient(0, 0, CW, 0);
    g.addColorStop(0, '#1b2433');
    g.addColorStop(0.5, '#0a0e16');
    g.addColorStop(1, '#1b2433');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
    const paintCol = paint.finish === 'carbon' ? 0x222428 : paint.color2 ?? paint.color;
    ctx.fillStyle = hex(paintCol);
    // roof panel
    const r0 = shape.rearSlope * 0.9, r1 = 1 - shape.frontSlope * 0.95;
    ctx.fillRect(X(0.3), Y(r1), X(0.4), Y(r0) - Y(r1));
    // pillars and sills
    ctx.fillRect(X(0.27), 0, X(0.04), CH);
    ctx.fillRect(X(0.69), 0, X(0.04), CH);
    ctx.fillRect(0, 0, X(0.05), CH);
    ctx.fillRect(X(0.95), 0, X(0.05), CH);
    const vb = (r0 + r1) / 2;
    ctx.fillRect(0, Y(vb + 0.03), X(0.3), CH * 0.06);
    ctx.fillRect(X(0.7), Y(vb + 0.03), X(0.3), CH * 0.06);
    // stripes over the roof
    if (livery.id === 'twin' || livery.id === 'number') {
      const accent = (((paint.color >> 16) & 255) * 0.3 + ((paint.color >> 8) & 255) * 0.59 + (paint.color & 255) * 0.11) / 255 > 0.6 ? '#16171b' : '#ffffff';
      ctx.fillStyle = accent;
      if (livery.id === 'twin') for (const o of [-0.085, 0.04]) ctx.fillRect(X(0.5 + o), Y(r1), X(0.045), Y(r0) - Y(r1));
      else ctx.fillRect(X(0.48), Y(r1), X(0.04), Y(r0) - Y(r1));
    }
    // glass reflections
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(X(0.32), Y(1));
    ctx.lineTo(X(0.45), Y(1));
    ctx.lineTo(X(0.38), Y(r1));
    ctx.lineTo(X(0.32), Y(r1));
    ctx.fill();
    return toTexture(c, { aniso: 4 });
  });
}

export function paintMaterial(paint: PaintDef, map: THREE.Texture): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ map, color: 0xffffff });
  switch (paint.finish) {
    case 'gloss':
      Object.assign(m, { roughness: 0.38, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.08 });
      break;
    case 'metal':
      Object.assign(m, { roughness: 0.3, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06 });
      break;
    case 'matte':
      Object.assign(m, { roughness: 0.75, metalness: 0.1, clearcoat: 0 });
      break;
    case 'pearl':
      Object.assign(m, { roughness: 0.25, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.9, iridescenceIOR: 1.5 });
      break;
    case 'chrome':
      Object.assign(m, { roughness: 0.1, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.02 });
      break;
    case 'carbon':
      Object.assign(m, { roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
      break;
  }
  m.envMapIntensity = 0.75;
  return m;
}

export function glowTexture(): THREE.Texture {
  return cached('glow', () => {
    const [c, ctx] = makeCanvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return toTexture(c, { repeat: false, srgb: false });
  });
}

export function shadowTexture(): THREE.Texture {
  return cached('blobshadow', () => {
    const [c, ctx] = makeCanvas(64, 128);
    const g = ctx.createRadialGradient(32, 64, 4, 32, 64, 60);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.scale(1, 1);
    ctx.fillRect(0, 0, 64, 128);
    ctx.restore();
    return toTexture(c, { repeat: false, srgb: false });
  });
}
