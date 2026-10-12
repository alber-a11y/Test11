import * as THREE from 'three';
import type { PickupKind, PickupSpawn } from '../world/track/TrackGenerator';
import { TrackData } from '../world/track/TrackData';
import { cached, makeCanvas, toTexture } from '../render/textures/canvas';

export interface PickupItem extends PickupSpawn {
  alive: boolean;
  index: number; // instance index within its kind
  world: THREE.Vector3;
  pull: number; // magnet pull progress
}

const heartShape = () => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-0.2, -0.65, -1, -0.2, -1, 0.3);
  s.bezierCurveTo(-1, 0.85, -0.35, 1.0, 0, 0.55);
  s.bezierCurveTo(0.35, 1.0, 1, 0.85, 1, 0.3);
  s.bezierCurveTo(1, -0.2, 0.2, -0.65, 0, -0.9);
  return s;
};
const starShape = () => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.45 : 1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
};

function labelTexture(text: string, bg: string, fg: string) {
  return cached(`label-${text}-${bg}`, () => {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = 'italic 900 60px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 68);
    return toTexture(c, { repeat: false });
  });
}

function nitroTexture() {
  return cached('nitro-can', () => {
    const [c, ctx] = makeCanvas(128, 64);
    ctx.fillStyle = '#1e5fe8';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NOZ', 64, 34);
    return toTexture(c, { repeat: false });
  });
}

const COLORS: Record<PickupKind, number> = {
  coin: 0xffd02a,
  star: 0x5ad8ff,
  heart: 0xff3a5a,
  nitro: 0x3a8aff,
  shield: 0x5ae8ff,
  magnet: 0xff4a3a,
  x2: 0xb05aff,
  gem: 0xd05aff,
};
export const pickupColor = (k: PickupKind) => COLORS[k];

export class Pickups {
  readonly group = new THREE.Group();
  items: PickupItem[] = [];
  private meshes = new Map<PickupKind, THREE.InstancedMesh>();
  private time = 0;
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpUp = new THREE.Vector3(0, 1, 0);

  private makeGeo(kind: PickupKind): [THREE.BufferGeometry, THREE.Material] {
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
    switch (kind) {
      case 'coin': {
        const g = new THREE.CylinderGeometry(0.7, 0.7, 0.16, 24);
        g.rotateX(Math.PI / 2);
        return [g, std({ color: 0xffc81a, metalness: 0.9, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.6 })];
      }
      case 'star': {
        const g = new THREE.ExtrudeGeometry(starShape(), { depth: 0.25, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
        g.center();
        return [g, std({ color: 0x7ae8ff, emissive: 0x2a9aff, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3 })];
      }
      case 'heart': {
        const g = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.35, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3 });
        g.center();
        return [g, std({ color: 0xff2a4a, emissive: 0xc0102a, emissiveIntensity: 0.7, roughness: 0.3 })];
      }
      case 'nitro': {
        const g = new THREE.CylinderGeometry(0.42, 0.42, 1.5, 18);
        return [g, std({ map: nitroTexture(), metalness: 0.6, roughness: 0.3, emissive: 0x1030a0, emissiveIntensity: 0.4 })];
      }
      case 'shield': {
        const g = new THREE.IcosahedronGeometry(0.8, 2);
        return [g, std({ color: 0x5ae8ff, emissive: 0x2ab8ff, emissiveIntensity: 1, transparent: true, opacity: 0.75, roughness: 0.1 })];
      }
      case 'magnet': {
        const g = new THREE.TorusGeometry(0.6, 0.22, 10, 20, Math.PI);
        g.rotateZ(Math.PI);
        return [g, std({ color: 0xff3a2a, emissive: 0x801010, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.4 })];
      }
      case 'x2': {
        const g = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 28);
        g.rotateX(Math.PI / 2);
        return [g, std({ map: labelTexture('x2', '#8a2ae0', '#fff'), emissive: 0x3a0a6a, emissiveIntensity: 0.6, roughness: 0.4 })];
      }
      case 'gem': {
        const g = new THREE.OctahedronGeometry(0.75, 0);
        g.scale(0.8, 1.2, 0.8);
        return [g, std({ color: 0xd05aff, emissive: 0x8a1ad0, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.5, flatShading: true })];
      }
    }
  }

  build(spawns: PickupSpawn[], track: TrackData) {
    this.clear();
    const smp = TrackData.newSample();
    const byKind = new Map<PickupKind, PickupItem[]>();
    for (const sp of spawns) {
      track.surface(sp.s, sp.d, sp.h, smp);
      const list = byKind.get(sp.kind) ?? [];
      const item: PickupItem = { ...sp, alive: true, index: list.length, world: smp.pos.clone(), pull: 0 };
      list.push(item);
      byKind.set(sp.kind, list);
      this.items.push(item);
    }
    for (const [kind, list] of byKind) {
      const [g, m] = this.makeGeo(kind);
      this.geometries.push(g);
      this.materials.push(m);
      const im = new THREE.InstancedMesh(g, m, list.length);
      im.frustumCulled = false;
      im.castShadow = kind !== 'shield';
      this.meshes.set(kind, im);
      this.group.add(im);
    }
    this.items.sort((a, b) => a.s - b.s);
    this.update(0);
  }

  /** Hide a collected item. */
  collect(item: PickupItem) {
    item.alive = false;
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    for (const item of this.items) {
      const im = this.meshes.get(item.kind)!;
      if (!item.alive) {
        this.tmpS.set(0, 0, 0);
        this.tmpM.compose(item.world, this.tmpQ.identity(), this.tmpS);
        im.setMatrixAt(item.index, this.tmpM);
        continue;
      }
      const spin = item.kind === 'coin' ? t * 3 + item.s * 0.2 : t * 1.8;
      this.tmpQ.setFromAxisAngle(this.tmpUp, spin);
      const pulse = item.kind === 'heart' ? 1 + Math.sin(t * 6) * 0.1 : 1;
      this.tmpS.setScalar(pulse * (item.kind === 'coin' ? 1 : 1.15));
      const bob = Math.sin(t * 2.5 + item.s) * 0.15;
      const p = item.world.clone();
      p.y += bob;
      this.tmpM.compose(p, this.tmpQ, this.tmpS);
      im.setMatrixAt(item.index, this.tmpM);
    }
    for (const im of this.meshes.values()) im.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const im of this.meshes.values()) this.group.remove(im);
    this.meshes.clear();
    this.items = [];
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries = [];
    this.materials = [];
  }
}
