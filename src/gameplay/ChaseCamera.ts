import * as THREE from 'three';
import { damp } from '../core/math';
import type { Racer } from './Racer';

export class ChaseCamera {
  private pos = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private lookOff = new THREE.Vector3();
  private look = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private shake = 0;
  private fov = 62;
  private initialized = false;
  mode: 'chase' | 'orbit' | 'fall' = 'chase';
  private orbitAngle = 0;

  constructor(private camera: THREE.PerspectiveCamera) {}

  reset() {
    this.initialized = false;
    this.mode = 'chase';
    this.shake = 0;
  }

  addShake(k: number) {
    this.shake = Math.min(0.8, this.shake + k);
  }

  update(dt: number, r: Racer, nitro: boolean, portrait: boolean) {
    const cam = this.camera;
    const speedK = Math.min(1, r.v / 70);
    if (this.mode === 'fall' || r.state === 'fall') {
      // hold position and watch the car tumble
      this.look.lerp(r.pos, 1 - Math.exp(-6 * dt));
      cam.position.copy(this.pos);
      cam.up.copy(this.up);
      cam.lookAt(this.look);
      return;
    }
    const dist = (portrait ? 7.2 : 6.4) + speedK * 1.6;
    const height = portrait ? 3.1 : 2.6;
    const desired = new THREE.Vector3().copy(r.pos).addScaledVector(r.fwd, -dist).addScaledVector(r.up, height);
    const lookAt = new THREE.Vector3().copy(r.pos).addScaledVector(r.fwd, 9).addScaledVector(r.up, 1.2);
    if (this.mode === 'orbit') {
      this.orbitAngle += dt * 0.5;
      const right = new THREE.Vector3().crossVectors(r.fwd, r.up).normalize();
      desired
        .copy(r.pos)
        .addScaledVector(r.fwd, Math.cos(this.orbitAngle) * 8)
        .addScaledVector(right, Math.sin(this.orbitAngle) * 8)
        .addScaledVector(r.up, 2.5);
      lookAt.copy(r.pos).addScaledVector(r.up, 0.8);
    }
    // smooth the offset relative to the car (not the absolute position) so speed causes no lag
    const offDesired = desired.sub(r.pos);
    const lookDesired = lookAt.sub(r.pos);
    if (!this.initialized) {
      this.offset.copy(offDesired);
      this.lookOff.copy(lookDesired);
      this.up.copy(r.up);
      this.initialized = true;
    }
    this.offset.lerp(offDesired, 1 - Math.exp(-6 * dt));
    this.lookOff.lerp(lookDesired, 1 - Math.exp(-10 * dt));
    this.pos.copy(r.pos).add(this.offset);
    this.look.copy(r.pos).add(this.lookOff);
    this.up.lerp(r.up, 1 - Math.exp(-5 * dt)).normalize();
    cam.position.copy(this.pos);
    if (this.shake > 0) {
      const s = this.shake * 0.1;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 3.5);
    }
    cam.up.copy(this.up);
    cam.lookAt(this.look);
    const targetFov = (portrait ? 70 : 60) + speedK * 10 + (nitro ? 8 : 0);
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}

/** White streaks rushing past the camera (reference look). */
export class SpeedLines {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private n = 40;
  private mat: THREE.LineBasicMaterial;

  constructor() {
    this.pos = new Float32Array(this.n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    for (let i = 0; i < this.n; i++) this.respawn(i, true);
  }

  private respawn(i: number, anyZ: boolean) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 14;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.8 + 3;
    const z = anyZ ? -Math.random() * 120 : -100 - Math.random() * 30;
    const len = 4 + Math.random() * 8;
    this.pos.set([x, y, z, x, y, z - len], i * 6);
  }

  update(dt: number, speed: number, strength: number) {
    this.mat.opacity = Math.min(0.55, Math.max(0, (speed - 30) / 60) * strength);
    const v = speed * 1.6;
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 6 + 2] += v * dt;
      this.pos[i * 6 + 5] += v * dt;
      if (this.pos[i * 6 + 5] > 2) this.respawn(i, false);
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
