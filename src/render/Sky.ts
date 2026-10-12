import * as THREE from 'three';
import type { Biome } from '../world/biomes/Biomes';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uCloudColor;
uniform float uClouds;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h > 0.0) {
    col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  } else {
    col = mix(uHorizon, uBottom, pow(clamp(-h * 2.5, 0.0, 1.0), 0.6));
  }
  // sun glow
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * (pow(sd, 900.0) * 3.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);

  // clouds on a virtual dome
  if (h > -0.05 && uClouds > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.4 + vec2(uTime * 0.004, uTime * 0.002);
    float n = fbm(uv * 1.3);
    float n2 = fbm(uv * 3.1 + 7.0);
    float c = smoothstep(1.0 - uClouds, 1.0 - uClouds + 0.35, n * 0.75 + n2 * 0.35);
    float fade = smoothstep(-0.05, 0.12, h) * (1.0 - smoothstep(0.55, 0.95, h) * 0.5);
    vec3 cc = mix(uCloudColor * 0.82, uCloudColor * 1.08, n2);
    col = mix(col, cc, c * fade * 0.9);
  }
  // wispy horizontal streaks (reference look)
  float streak = smoothstep(0.02, 0.0, abs(h - 0.12 - 0.05 * sin(d.x * 3.0 + d.z * 2.0))) * 0.08 * uClouds;
  col += streak;

  if (uStars > 0.0 && h > 0.0) {
    vec2 sp = d.xz / (h + 0.3) * 120.0;
    float st = step(0.997, hash(floor(sp))) * smoothstep(0.0, 0.3, h);
    col += st * uStars * (0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(sp)) * 20.0));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly sunDir = new THREE.Vector3(0.4, 0.55, -0.6).normalize();

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() },
        uSunDir: { value: this.sunDir },
        uCloudColor: { value: new THREE.Color() },
        uClouds: { value: 0.5 },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  apply(b: Biome) {
    const u = this.material.uniforms;
    u.uTop.value.setHex(b.sky.top);
    u.uHorizon.value.setHex(b.sky.horizon);
    u.uBottom.value.setHex(b.sky.bottom);
    u.uSun.value.setHex(b.sky.sun);
    u.uCloudColor.value.setHex(b.sky.cloudColor);
    u.uClouds.value = b.sky.clouds;
    u.uStars.value = b.sky.stars;
  }

  update(dt: number, camPos: THREE.Vector3) {
    this.material.uniforms.uTime.value += dt;
    this.mesh.position.copy(camPos);
  }
}
