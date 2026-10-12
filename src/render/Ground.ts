import * as THREE from 'three';
import type { Biome } from '../world/biomes/Biomes';
import { hex, makeCanvas, speckle, toTexture } from './textures/canvas';
import { Rng } from '../core/Rng';

const waterVert = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float t = uTime;
  float w1 = sin(wp.x * 0.05 + t * 0.9) * 0.6 + sin(wp.z * 0.07 - t * 1.1) * 0.5 + sin((wp.x + wp.z) * 0.13 + t * 1.7) * 0.25;
  wp.y += w1;
  float dx = cos(wp.x * 0.05 + t * 0.9) * 0.03 + cos((wp.x + wp.z) * 0.13 + t * 1.7) * 0.0325;
  float dz = -sin(wp.z * 0.07 - t * 1.1) * 0.0 + cos(wp.z * 0.07 - t * 1.1) * 0.035 + cos((wp.x + wp.z) * 0.13 + t * 1.7) * 0.0325;
  vNormal = normalize(vec3(-dx, 1.0, -dz));
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const waterFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uLava;
varying vec3 vWorld;
varying vec3 vNormal;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 p = vWorld.xz * 0.08;
  float n = noise(p + uTime * 0.25) * 0.5 + noise(p * 2.7 - uTime * 0.35) * 0.35 + noise(p * 7.0 + uTime * 0.6) * 0.15;
  vec3 N = normalize(vNormal + vec3((n - 0.5) * 0.35, 0.0, (noise(p.yx * 3.0 + uTime * 0.3) - 0.5) * 0.35));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col;
  if (uLava > 0.5) {
    float flow = noise(p * 1.5 + vec2(uTime * 0.1, 0.0)) * 0.7 + noise(p * 5.0 - uTime * 0.2) * 0.3;
    float cracks = smoothstep(0.5, 0.62, flow);
    vec3 hot = mix(uShallow, vec3(1.0, 0.75, 0.2), smoothstep(0.62, 0.8, flow));
    col = mix(uDeep, hot * 1.4, cracks);
  } else {
    col = mix(uDeep, uShallow, n * 0.8);
    col = mix(col, uSky, fres * 0.65);
    vec3 H = normalize(V + normalize(uSunDir));
    float spec = pow(max(dot(N, H), 0.0), 220.0);
    col += uSunColor * spec * 2.5;
    float foam = smoothstep(0.78, 0.9, n);
    col += foam * 0.25;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Ground {
  readonly group = new THREE.Group();
  private waterMat: THREE.ShaderMaterial | null = null;
  private mesh: THREE.Mesh | null = null;

  build(b: Biome, sunDir: THREE.Vector3) {
    this.dispose();
    const size = 6000;
    const water = b.ground === 'ocean' || b.ground === 'deepocean' || b.ground === 'lava';
    if (water) {
      const geo = new THREE.PlaneGeometry(size, size, 160, 160);
      geo.rotateX(-Math.PI / 2);
      this.waterMat = new THREE.ShaderMaterial({
        vertexShader: waterVert,
        fragmentShader: waterFrag,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uDeep: { value: new THREE.Color(b.groundColor) },
            uShallow: { value: new THREE.Color(b.groundColor2) },
            uSky: { value: new THREE.Color(b.sky.horizon) },
            uSunDir: { value: sunDir.clone() },
            uSunColor: { value: new THREE.Color(b.light.sun) },
            uLava: { value: b.ground === 'lava' ? 1 : 0 },
          },
        ]),
      });
      this.mesh = new THREE.Mesh(geo, this.waterMat);
    } else {
      const geo = new THREE.PlaneGeometry(size, size, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const tex = groundTexture(b);
      tex.repeat.set(size / 40, size / 40);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: b.ground === 'snow' ? 0.6 : 0.95,
        color: 0xffffff,
      });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.receiveShadow = true;
    }
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  update(dt: number, camPos: THREE.Vector3) {
    if (!this.mesh) return;
    // follow camera in steps to avoid texture swimming
    const snap = 40;
    this.mesh.position.set(Math.round(camPos.x / snap) * snap, 0, Math.round(camPos.z / snap) * snap);
    if (this.waterMat) this.waterMat.uniforms.uTime.value += dt;
  }

  dispose() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
      this.waterMat = null;
    }
  }
}

function groundTexture(b: Biome): THREE.Texture {
  const W = 256;
  const [c, ctx] = makeCanvas(W, W);
  ctx.fillStyle = hex(b.groundColor);
  ctx.fillRect(0, 0, W, W);
  const rng = new Rng(77);
  if (b.ground === 'city') {
    ctx.fillStyle = hex(b.groundColor2);
    for (let i = 0; i < W; i += 32) {
      ctx.fillRect(i, 0, 2, W);
      ctx.fillRect(0, i, W, 2);
    }
  } else {
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = hex(b.groundColor2, 0.25);
      ctx.beginPath();
      ctx.ellipse(rng.next() * W, rng.next() * W, rng.range(10, 50), rng.range(4, 18), rng.next() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, W, W, 3000, 21, 0.1);
  }
  return toTexture(c);
}
