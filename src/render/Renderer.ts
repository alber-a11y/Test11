import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export type Quality = 'low' | 'medium' | 'high';

const RadialShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0 },
    uVignette: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec2 c = vec2(0.5, 0.55);
      vec2 d = vUv - c;
      vec4 col = vec4(0.0);
      if (uStrength > 0.001) {
        float w = 0.0;
        for (int i = 0; i < 8; i++) {
          float k = float(i) / 7.0;
          float s = 1.0 - uStrength * k * 0.06 * smoothstep(0.1, 0.6, length(d));
          col += texture2D(tDiffuse, c + d * s);
          w += 1.0;
        }
        col /= w;
      } else {
        col = texture2D(tDiffuse, vUv);
      }
      float v = smoothstep(0.95, 0.35, length(d * vec2(1.0, 0.8)));
      col.rgb *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = col;
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene = new THREE.Scene();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private fxaa: ShaderPass;
  private radial: ShaderPass;
  quality: Quality = 'high';
  private pixelRatio = 1;
  private usePost = true;
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3500);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.4, 1.15);
    this.composer.addPass(this.bloom);
    this.radial = new ShaderPass(RadialShader);
    this.composer.addPass(this.radial);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);

    this.setQuality(Renderer.detectQuality());
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize();
  }

  static detectQuality(): Quality {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    if (mobile) return mem >= 6 ? 'medium' : 'low';
    return 'high';
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 1);
    this.usePost = q !== 'low';
    this.renderer.shadowMap.enabled = q !== 'low';
    this.bloom.enabled = q !== 'low';
    this.resize();
  }

  get shadowSize() {
    return this.quality === 'high' ? 2048 : 1024;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * 0.5, h * 0.5);
    (this.fxaa.material.uniforms.resolution.value as THREE.Vector2).set(1 / (w * this.pixelRatio), 1 / (h * this.pixelRatio));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setSpeedEffect(k: number) {
    this.radial.uniforms.uStrength.value = k;
  }

  setExposure(e: number) {
    this.renderer.toneMappingExposure = e;
  }

  render() {
    this.renderer.info.reset();
    if (this.usePost) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Render an arbitrary scene into an image (used for shop thumbnails). */
  snapshot(scene: THREE.Scene, camera: THREE.Camera, w: number, h: number): string {
    const r = this.renderer;
    const prevAlpha = r.getClearAlpha();
    const prevColor = r.getClearColor(new THREE.Color());
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(r.domElement, 0, 0, w, h, 0, 0, w, h);
    r.setClearColor(prevColor, prevAlpha);
    // restore the canvas size only (composer targets were never touched)
    r.setPixelRatio(this.pixelRatio);
    r.setSize(this.width, this.height, false);
    this.render();
    return c.toDataURL('image/png');
  }
}
