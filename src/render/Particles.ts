import * as THREE from 'three';
import { glowTexture } from '../vehicles/Livery';

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

export interface EmitOpts {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  spread?: number;
  count?: number;
  life?: number;
  size?: number;
  sizeEnd?: number;
  color?: number | THREE.Color;
  color2?: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
}

/** A pooled point-sprite particle system (one draw call). */
export class ParticleSystem {
  readonly points: THREE.Points;
  private cap: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size0: Float32Array;
  private size1: Float32Array;
  private grav: Float32Array;
  private dragA: Float32Array;
  private alpha0: Float32Array;
  private sizeAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private posAttr: THREE.BufferAttribute;
  private next = 0;
  private material: THREE.ShaderMaterial;
  private tmpColor = new THREE.Color();
  private tmpColor2 = new THREE.Color();

  constructor(capacity: number, additive: boolean, map: THREE.Texture = glowTexture()) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.dragA = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    g.setAttribute('aColor', this.colorAttr);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewportHeight(h: number) {
    this.material.uniforms.uScale.value = h * 0.9;
  }

  emit(o: EmitOpts) {
    const n = o.count ?? 1;
    const spread = o.spread ?? 1;
    const c1 = typeof o.color === 'number' || o.color === undefined ? this.tmpColor.setHex((o.color as number) ?? 0xffffff) : this.tmpColor.copy(o.color);
    const c2 = o.color2 !== undefined ? this.tmpColor2.setHex(o.color2) : null;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      this.pos[i * 3] = o.pos.x;
      this.pos[i * 3 + 1] = o.pos.y;
      this.pos[i * 3 + 2] = o.pos.z;
      this.vel[i * 3] = (o.vel?.x ?? 0) + (Math.random() - 0.5) * 2 * spread;
      this.vel[i * 3 + 1] = (o.vel?.y ?? 0) + (Math.random() - 0.5) * 2 * spread;
      this.vel[i * 3 + 2] = (o.vel?.z ?? 0) + (Math.random() - 0.5) * 2 * spread;
      const life = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size0[i] = o.size ?? 1;
      this.size1[i] = o.sizeEnd ?? o.size ?? 1;
      this.grav[i] = o.gravity ?? 0;
      this.dragA[i] = o.drag ?? 0;
      this.alpha0[i] = o.alpha ?? 1;
      const c = c2 ? this.tmpColor2.clone().lerp(c1, Math.random()) : c1;
      this.colorAttr.setXYZ(i, c.r, c.g, c.b);
    }
  }

  update(dt: number) {
    const sizes = this.sizeAttr.array as Float32Array;
    const alphas = this.alphaAttr.array as Float32Array;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        alphas[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const drag = Math.exp(-this.dragA[i] * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      sizes[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      alphas[i] = this.alpha0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
  }
}

/** All effect systems used in a race. */
export class Effects {
  readonly group = new THREE.Group();
  readonly glow = new ParticleSystem(1200, true);
  readonly smoke = new ParticleSystem(500, false);
  readonly confetti = new ParticleSystem(400, false);

  constructor() {
    this.group.add(this.smoke.points, this.glow.points, this.confetti.points);
  }

  setViewportHeight(h: number) {
    this.glow.setViewportHeight(h);
    this.smoke.setViewportHeight(h);
    this.confetti.setViewportHeight(h);
  }

  update(dt: number) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.confetti.update(dt);
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    this.confetti.clear();
  }

  sparks(pos: THREE.Vector3, vel: THREE.Vector3, n = 10) {
    this.glow.emit({ pos, vel, count: n, spread: 5, life: 0.35, size: 0.35, sizeEnd: 0.05, color: 0xffd27a, color2: 0xff7a1a, gravity: 18 });
  }

  pickup(pos: THREE.Vector3, color: number) {
    this.glow.emit({ pos, count: 8, spread: 4, life: 0.35, size: 0.55, sizeEnd: 0.05, color, gravity: -2, drag: 3, alpha: 0.7 });
  }

  explosion(pos: THREE.Vector3) {
    this.glow.emit({ pos, count: 40, spread: 9, life: 0.7, size: 3, sizeEnd: 0.4, color: 0xffd04a, color2: 0xff3a0a, drag: 2 });
    this.smoke.emit({ pos, count: 26, spread: 4, life: 1.6, size: 4, sizeEnd: 9, color: 0x333333, color2: 0x777777, gravity: -3, drag: 1.5, alpha: 0.7 });
  }

  tireSmoke(pos: THREE.Vector3, vel: THREE.Vector3) {
    this.smoke.emit({ pos, vel, count: 1, spread: 1, life: 0.9, size: 1.4, sizeEnd: 4.5, color: 0xe8e8e8, gravity: -1, drag: 2, alpha: 0.45 });
  }

  dust(pos: THREE.Vector3) {
    this.smoke.emit({ pos, count: 12, spread: 4, life: 0.8, size: 1.5, sizeEnd: 4, color: 0xd8d0c0, gravity: -1, drag: 3, alpha: 0.5 });
  }

  nitroTrail(pos: THREE.Vector3, vel: THREE.Vector3, c1: number, c2: number) {
    this.glow.emit({ pos, vel, count: 2, spread: 0.6, life: 0.35, size: 0.9, sizeEnd: 0.1, color: c1, color2: c2, drag: 4 });
  }

  splash(pos: THREE.Vector3) {
    this.smoke.emit({ pos, count: 40, spread: 6, life: 1.2, size: 2, sizeEnd: 3.5, color: 0xffffff, color2: 0xbfe8ff, gravity: 14, drag: 0.5, alpha: 0.85 });
  }

  celebrate(pos: THREE.Vector3) {
    const cols = [0xff3a3a, 0xffd02a, 0x3aff6a, 0x3a8aff, 0xff5ad8];
    for (const c of cols)
      this.confetti.emit({ pos, vel: new THREE.Vector3(0, 10, 0), count: 30, spread: 9, life: 2.4, size: 0.5, color: c, gravity: 9, drag: 1.2 });
  }
}
