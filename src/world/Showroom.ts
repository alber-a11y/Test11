import * as THREE from 'three';
import { CarModel, type CarLook } from '../vehicles/CarModel';
import { CARS, byId } from '../meta/Catalog';
import { cached, makeCanvas, toTexture } from '../render/textures/canvas';

export type ShowroomFraming = 'menu' | 'shop' | 'center';

/** Floating podium with the player's car for menus and the shop. */
export class Showroom {
  readonly group = new THREE.Group();
  private car: CarModel | null = null;
  private lookKey = '';
  private angle = 0.6;
  private time = 0;
  private ringMat: THREE.MeshBasicMaterial;
  framing: ShowroomFraming = 'menu';
  readonly center = new THREE.Vector3(0, 32, 0);
  private dragging = false;
  private dragX = 0;
  private spinVel = 0;

  constructor() {
    const topTex = cached('podium-top', () => {
      const [c, ctx] = makeCanvas(512, 512);
      const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
      g.addColorStop(0, '#3a4a6a');
      g.addColorStop(0.85, '#1a2440');
      g.addColorStop(0.86, '#ffc21a');
      g.addColorStop(0.9, '#ffc21a');
      g.addColorStop(0.91, '#101828');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 3;
      for (let r = 40; r < 210; r += 34) {
        ctx.beginPath();
        ctx.arc(256, 256, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      return toTexture(c, { repeat: false });
    });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.4, 64), [
      new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.4, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.35, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0x1a2440 }),
    ]);
    top.receiveShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1.9, 2.2, 48), new THREE.MeshStandardMaterial({ color: 0x24305a, roughness: 0.5, metalness: 0.5 }));
    base.position.y = -1.3;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x5ad8ff });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.72, 0.08, 8, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 0.6, 6, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5ad8ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    glow.position.y = -5;
    this.group.add(top, base, ring, glow);
    this.group.position.copy(this.center);
  }

  setCar(look: CarLook) {
    const key = JSON.stringify(look);
    if (key === this.lookKey && this.car) return;
    this.lookKey = key;
    if (this.car) {
      this.group.remove(this.car.root);
      this.car.dispose();
    }
    this.car = new CarModel(byId(CARS, look.carId), look);
    this.car.root.position.y = 0.2;
    this.group.add(this.car.root);
  }

  dragStart(x: number) {
    this.dragging = true;
    this.dragX = x;
    this.spinVel = 0;
  }

  dragMove(x: number) {
    if (!this.dragging) return;
    const dx = x - this.dragX;
    this.dragX = x;
    this.angle += dx * 0.01;
    this.spinVel = dx * 0.6;
  }

  dragEnd() {
    this.dragging = false;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewW: number, viewH: number) {
    this.time += dt;
    if (!this.dragging) {
      this.spinVel *= Math.exp(-3 * dt);
      this.angle += (0.25 + this.spinVel) * dt;
    }
    this.ringMat.color.setHSL(0.53 + Math.sin(this.time) * 0.05, 1, 0.6);
    if (this.car) {
      this.car.root.rotation.y = this.angle;
      this.car.update(dt, 0, 0, false, 0, 0);
    }
    const portrait = viewH > viewW;
    const dist = portrait ? 11 : 10.5;
    const target = this.center.clone().add(new THREE.Vector3(0, 0.7, 0));
    camera.position.set(target.x + dist * 0.62, target.y + (portrait ? 2.6 : 3.2), target.z + dist * 0.78);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.fov = portrait ? 52 : 38;
    if (this.framing === 'shop') {
      if (portrait) camera.setViewOffset(viewW, viewH, 0, viewH * 0.27, viewW, viewH);
      else camera.setViewOffset(viewW, viewH, viewW * 0.24, 0, viewW, viewH);
    } else if (this.framing === 'menu') {
      if (portrait) camera.setViewOffset(viewW, viewH, 0, viewH * 0.02, viewW, viewH);
      else camera.clearViewOffset();
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
}
