import { describe, expect, it } from 'vitest';
import { generateLevel } from '../src/world/track/TrackGenerator';
import { FLAG } from '../src/world/track/TrackData';

function minClearance(level: number) {
  const { track } = generateLevel(level);
  const pts: { s: number; x: number; y: number; z: number; loop: boolean }[] = [];
  for (let s = 0; s < track.length; s += 4) {
    const i = track.index(s);
    pts.push({
      s,
      x: track.pos[i * 3],
      y: track.pos[i * 3 + 1],
      z: track.pos[i * 3 + 2],
      loop: (track.flags[i] & FLAG.LOOP) !== 0,
    });
  }
  let min = Infinity;
  for (let a = 0; a < pts.length; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const pa = pts[a], pb = pts[b];
      if (pb.s - pa.s < 80) continue;
      if (pa.loop || pb.loop) continue;
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
      if (d < min) min = d;
    }
  }
  return min;
}

describe('TrackGenerator', () => {
  it('is deterministic per level', () => {
    const a = generateLevel(17);
    const b = generateLevel(17);
    expect(a.track.length).toBe(b.track.length);
    expect(Array.from(a.track.pos.slice(0, 300))).toEqual(Array.from(b.track.pos.slice(0, 300)));
    expect(a.pickups.length).toBe(b.pickups.length);
  });

  it('produces valid tracks for many levels', () => {
    for (let level = 1; level <= 400; level++) {
      const { track, pickups, obstacles } = generateLevel(level);
      expect(track.length).toBeGreaterThan(900);
      expect(track.finishS).toBeLessThan(track.length);
      let finite = true;
      let minY = Infinity;
      for (let i = 0; i < track.pos.length; i++) if (!Number.isFinite(track.pos[i])) finite = false;
      for (let i = 0; i < track.count; i++) minY = Math.min(minY, track.pos[i * 3 + 1]);
      expect(finite).toBe(true);
      expect(minY).toBeGreaterThan(5);
      expect(pickups.length).toBeGreaterThan(10);
      for (const o of obstacles) expect(o.s).toBeLessThan(track.finishS);
    }
  });

  it('does not self-intersect', () => {
    const bad: string[] = [];
    for (let level = 1; level <= 200; level++) {
      const c = minClearance(level);
      if (c < 18) bad.push(`${level}:${c.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });
});
