import * as THREE from 'three';
import type { Renderer } from '../render/Renderer';
import { CarModel, type CarLook } from '../vehicles/CarModel';
import { CARS, byId } from '../meta/Catalog';

/** Renders car thumbnails for shop cards (cached data URLs). */
export class Thumbnails {
  private cache = new Map<string, string>();
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 100);

  constructor(private r: Renderer) {
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x445566, 1.4));
    const d = new THREE.DirectionalLight(0xffffff, 2.4);
    d.position.set(4, 8, 6);
    this.scene.add(d);
    this.cam.position.set(6.2, 2.6, 7.2);
    this.cam.lookAt(0, 0.55, 0);
  }

  car(look: CarLook, w = 256, h = 144): string {
    const key = JSON.stringify(look) + w;
    const hit = this.cache.get(key);
    if (hit) return hit;
    this.scene.environment = this.r.scene.environment;
    const m = new CarModel(byId(CARS, look.carId), look);
    m.root.rotation.y = -0.35;
    this.scene.add(m.root);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    const url = this.r.snapshot(this.scene, this.cam, w, h);
    this.scene.remove(m.root);
    m.dispose();
    this.cache.set(key, url);
    return url;
  }
}
