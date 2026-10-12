import * as THREE from 'three';

export const FLAG = {
  WALL_L: 1,
  WALL_R: 2,
  GAP: 4,
  RAMP: 8,
  FINISH: 16,
  LOOP: 32,
  NO_SUPPORT: 64,
} as const;

export const TRACK_STEP = 1; // meters between samples

export interface SurfaceSample {
  pos: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  fwd: THREE.Vector3;
}

/**
 * Sampled track centerline with an orthonormal frame per sample.
 * Cars live in track space: s (distance along), d (lateral offset), h (height above surface).
 */
export class TrackData {
  readonly count: number;
  readonly length: number;
  readonly pos: Float32Array;
  readonly right: Float32Array;
  readonly up: Float32Array;
  readonly fwd: Float32Array;
  readonly halfWidth: Float32Array;
  /** 0 = flat road, 1 = full half-pipe tube. */
  readonly tube: Float32Array;
  readonly tubeRadius = 6.5;
  /** Planar curvature (1/m), positive = turning right. */
  readonly curv: Float32Array;
  /** Gravity component helping in turns (banking), in g units along right axis. */
  readonly bankAssist: Float32Array;
  readonly flags: Uint8Array;
  finishS = 0;

  constructor(count: number) {
    this.count = count;
    this.length = (count - 1) * TRACK_STEP;
    this.pos = new Float32Array(count * 3);
    this.right = new Float32Array(count * 3);
    this.up = new Float32Array(count * 3);
    this.fwd = new Float32Array(count * 3);
    this.halfWidth = new Float32Array(count);
    this.tube = new Float32Array(count);
    this.curv = new Float32Array(count);
    this.bankAssist = new Float32Array(count);
    this.flags = new Uint8Array(count);
  }

  index(s: number): number {
    const i = Math.round(s / TRACK_STEP);
    return i < 0 ? 0 : i >= this.count ? this.count - 1 : i;
  }

  hasFlag(s: number, f: number): boolean {
    return (this.flags[this.index(s)] & f) !== 0;
  }

  private lerpVec(arr: Float32Array, i: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const a = i * 3;
    const b = Math.min(i + 1, this.count - 1) * 3;
    out.set(
      arr[a] + (arr[b] - arr[a]) * t,
      arr[a + 1] + (arr[b + 1] - arr[a + 1]) * t,
      arr[a + 2] + (arr[b + 2] - arr[a + 2]) * t,
    );
    return out;
  }

  private split(s: number): [number, number] {
    const f = Math.max(0, Math.min(s / TRACK_STEP, this.count - 1.0001));
    const i = Math.floor(f);
    return [i, f - i];
  }

  scalarAt(arr: Float32Array, s: number): number {
    const [i, t] = this.split(s);
    const j = Math.min(i + 1, this.count - 1);
    return arr[i] + (arr[j] - arr[i]) * t;
  }

  /** Interpolated centerline frame. */
  frame(s: number, out: SurfaceSample): SurfaceSample {
    const [i, t] = this.split(s);
    this.lerpVec(this.pos, i, t, out.pos);
    this.lerpVec(this.fwd, i, t, out.fwd).normalize();
    this.lerpVec(this.up, i, t, out.up);
    // re-orthonormalize
    out.right.crossVectors(out.fwd, out.up).normalize();
    out.up.crossVectors(out.right, out.fwd).normalize();
    return out;
  }

  /** Point on driving surface at lateral offset d, plus local frame (up = surface normal). */
  surface(s: number, d: number, h: number, out: SurfaceSample): SurfaceSample {
    this.frame(s, out);
    const blend = this.scalarAt(this.tube, s);
    const px = out.pos.x, py = out.pos.y, pz = out.pos.z;
    const rx = out.right.x, ry = out.right.y, rz = out.right.z;
    const ux = out.up.x, uy = out.up.y, uz = out.up.z;
    // flat
    let x = px + rx * d, y = py + ry * d, z = pz + rz * d;
    let nx = ux, ny = uy, nz = uz;
    if (blend > 0.001) {
      const R = this.tubeRadius;
      const a = d / R;
      const sa = Math.sin(a), ca = Math.cos(a);
      // tube center is R above the centerline
      const tx = px + ux * R + (rx * sa - ux * ca) * R;
      const ty = py + uy * R + (ry * sa - uy * ca) * R;
      const tz = pz + uz * R + (rz * sa - uz * ca) * R;
      const tnx = ux * ca - rx * sa;
      const tny = uy * ca - ry * sa;
      const tnz = uz * ca - rz * sa;
      x += (tx - x) * blend; y += (ty - y) * blend; z += (tz - z) * blend;
      nx += (tnx - nx) * blend; ny += (tny - ny) * blend; nz += (tnz - nz) * blend;
    }
    out.up.set(nx, ny, nz).normalize();
    out.right.crossVectors(out.fwd, out.up).normalize();
    out.fwd.crossVectors(out.up, out.right).normalize();
    out.pos.set(x, y, z).addScaledVector(out.up, h);
    return out;
  }

  static newSample(): SurfaceSample {
    return {
      pos: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
    };
  }
}
