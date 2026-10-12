import * as THREE from 'three';
import { Sky } from '../render/Sky';
import { Ground } from '../render/Ground';
import { Environment } from './Environment';
import { buildTrackMesh, TrackVisual } from './track/TrackMesh';
import type { LevelData } from './track/TrackGenerator';
import type { Biome } from './biomes/Biomes';
import type { Renderer } from '../render/Renderer';

/** Owns everything static in the 3D scene: sky, lights, ground, track, props. */
export class World {
  readonly sky = new Sky();
  readonly ground = new Ground();
  readonly env = new Environment();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private track: TrackVisual | null = null;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  biome: Biome | null = null;

  constructor(private r: Renderer) {
    const scene = r.scene;
    scene.add(this.sky.mesh);
    scene.add(this.ground.group);
    scene.add(this.env.group);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(r.shadowSize, r.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    scene.add(this.hemi);
    this.pmrem = new THREE.PMREMGenerator(r.renderer);
  }

  applyBiome(b: Biome) {
    this.biome = b;
    const scene = this.r.scene;
    this.sky.apply(b);
    scene.fog = new THREE.Fog(b.fog.color, b.fog.near, b.fog.far);
    this.sun.color.setHex(b.light.sun);
    this.sun.intensity = b.light.sunIntensity;
    this.hemi.color.setHex(b.light.hemiSky);
    this.hemi.groundColor.setHex(b.light.hemiGround);
    this.hemi.intensity = b.light.hemiIntensity;
    this.r.setExposure(b.light.exposure);
    this.ground.build(b, this.sky.sunDir);
    this.buildEnvMap();
  }

  /** Reflections for car paint come from the procedural sky. */
  private buildEnvMap() {
    const envScene = new THREE.Scene();
    const skyClone = new THREE.Mesh(this.sky.mesh.geometry, this.sky.material);
    envScene.add(skyClone);
    // a bright "ground" band so cars get a nice horizon line reflection
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(100, 100, 6, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: this.biome ? this.biome.sky.horizon : 0xffffff, side: THREE.BackSide }),
    );
    band.position.y = -2;
    envScene.add(band);
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.02, 1, 3000);
    this.r.scene.environment = this.envRT.texture;
    band.geometry.dispose();
    (band.material as THREE.Material).dispose();
  }

  loadLevel(level: LevelData) {
    if (this.biome?.id !== level.biome.id || !this.biome) this.applyBiome(level.biome);
    this.track?.dispose();
    if (this.track) this.r.scene.remove(this.track.group);
    this.track = buildTrackMesh(level);
    this.r.scene.add(this.track.group);
    this.env.build(level);
  }

  clearLevel() {
    if (this.track) {
      this.r.scene.remove(this.track.group);
      this.track.dispose();
      this.track = null;
    }
    this.env.clear();
  }

  /** Keep the shadow camera centered on the focus point (player). */
  update(dt: number, focus: THREE.Vector3, camPos: THREE.Vector3) {
    this.sky.update(dt, camPos);
    this.ground.update(dt, camPos);
    this.env.update(dt);
    this.sun.position.copy(focus).addScaledVector(this.sky.sunDir, 80);
    this.sun.target.position.copy(focus);
  }
}
