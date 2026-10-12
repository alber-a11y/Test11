import * as THREE from 'three';
import type { ObstacleKind, ObstacleSpawn } from '../world/track/TrackGenerator';
import { TrackData } from '../world/track/TrackData';
import { frameMatrix } from '../world/track/TrackMesh';
import { beachBallTexture } from '../world/Environment';
import { containerTexture } from '../render/textures/trackTextures';
import { cached, makeCanvas, toTexture } from '../render/textures/canvas';

export interface Obstacle extends ObstacleSpawn {
  mesh: THREE.Object3D;
  radius: number; // lateral half size
  alive: boolean;
  knocked: boolean;
  fly: THREE.Vector3;
  spin: THREE.Vector3;
  t: number;
}

const stripeTex = () =>
  cached('barrier-stripes', () => {
    const [c, ctx] = makeCanvas(128, 32);
    for (let i = -2; i < 10; i++) {
      ctx.fillStyle = i % 2 ? '#e8322e' : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(i * 16, 32);
      ctx.lineTo(i * 16 + 16, 0);
      ctx.lineTo(i * 16 + 32, 0);
      ctx.lineTo(i * 16 + 16, 32);
      ctx.fill();
    }
    return toTexture(c);
  });

export class Obstacles {
  readonly group = new THREE.Group();
  list: Obstacle[] = [];
  private mats: Record<string, THREE.Material> = {};
  private geos: Record<string, THREE.BufferGeometry> = {};
  private smp = TrackData.newSample();

  constructor() {
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
    this.mats.cone = std({ color: 0xff6a12, roughness: 0.5 });
    this.mats.white = std({ color: 0xffffff, roughness: 0.5 });
    this.mats.barrel = std({ color: 0xd8322a, roughness: 0.4, metalness: 0.5 });
    this.mats.barrelBand = std({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.5 });
    this.mats.barrier = std({ map: stripeTex(), roughness: 0.6 });
    this.mats.ball = std({ map: beachBallTexture(), roughness: 0.35 });
    this.mats.crate = std({ map: containerTexture(0x2a6fd6, 1), roughness: 0.7, metalness: 0.2 });
    this.geos.cone = new THREE.ConeGeometry(0.42, 1.1, 14);
    this.geos.coneBase = new THREE.BoxGeometry(0.9, 0.08, 0.9);
    this.geos.coneBand = new THREE.CylinderGeometry(0.27, 0.33, 0.18, 14);
    this.geos.barrel = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16);
    this.geos.band = new THREE.CylinderGeometry(0.57, 0.57, 0.12, 16);
    this.geos.barrier = new THREE.BoxGeometry(3.2, 1.1, 0.5);
    this.geos.ball = new THREE.SphereGeometry(1.25, 20, 14);
    this.geos.crate = new THREE.BoxGeometry(3.4, 2.4, 2.4);
  }

  private makeMesh(kind: ObstacleKind): [THREE.Object3D, number] {
    const g = new THREE.Group();
    const m = (geo: string, mat: string, y: number) => {
      const mesh = new THREE.Mesh(this.geos[geo], this.mats[mat]);
      mesh.position.y = y;
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    switch (kind) {
      case 'cone':
        m('coneBase', 'cone', 0.04);
        m('cone', 'cone', 0.6);
        m('coneBand', 'white', 0.75);
        return [g, 0.55];
      case 'barrel':
        m('barrel', 'barrel', 0.65);
        m('band', 'barrelBand', 0.35);
        m('band', 'barrelBand', 0.95);
        return [g, 0.7];
      case 'barrier':
        m('barrier', 'barrier', 0.55);
        return [g, 1.7];
      case 'ball':
        m('ball', 'ball', 1.25);
        return [g, 1.3];
      case 'crate':
        m('crate', 'crate', 1.2);
        return [g, 1.8];
    }
  }

  build(spawns: ObstacleSpawn[], track: TrackData) {
    this.clear();
    for (const sp of spawns) {
      const [mesh, radius] = this.makeMesh(sp.kind);
      const o: Obstacle = { ...sp, mesh, radius, alive: true, knocked: false, fly: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0 };
      this.place(o, track);
      this.group.add(mesh);
      this.list.push(o);
    }
    this.list.sort((a, b) => a.s - b.s);
  }

  private place(o: Obstacle, track: TrackData) {
    track.surface(o.s, o.d, 0, this.smp);
    o.mesh.matrixAutoUpdate = false;
    o.mesh.matrix.copy(frameMatrix(this.smp, new THREE.Matrix4()));
    if (o.kind === 'ball') {
      // spin the ball according to its rolling
      const roll = new THREE.Matrix4().makeRotationX(-o.s / 1.25);
      const lift = new THREE.Matrix4().makeTranslation(0, 1.25, 0);
      const unlift = new THREE.Matrix4().makeTranslation(0, -1.25, 0);
      o.mesh.matrix.multiply(lift).multiply(roll).multiply(unlift);
    }
  }

  knock(o: Obstacle, dir: THREE.Vector3, speed: number) {
    o.knocked = true;
    o.alive = false;
    o.fly.copy(dir).multiplyScalar(speed * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 8, 8 + Math.random() * 6, (Math.random() - 0.5) * 8));
    o.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    o.mesh.matrix.decompose(o.mesh.position, o.mesh.quaternion, o.mesh.scale);
    o.mesh.matrixAutoUpdate = true;
  }

  update(dt: number, track: TrackData) {
    for (const o of this.list) {
      if (o.knocked) {
        o.t += dt;
        o.fly.y -= 25 * dt;
        o.mesh.position.addScaledVector(o.fly, dt);
        o.mesh.rotation.x += o.spin.x * dt;
        o.mesh.rotation.y += o.spin.y * dt;
        o.mesh.rotation.z += o.spin.z * dt;
        if (o.t > 3) o.mesh.visible = false;
        continue;
      }
      if (o.vel !== 0) {
        o.s += o.vel * dt;
        // bounce gently inside the tube
        this.place(o, track);
      }
    }
  }

  clear() {
    for (const o of this.list) this.group.remove(o.mesh);
    this.list = [];
  }

  dispose() {
    this.clear();
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
