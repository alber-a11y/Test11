import { generateLevel } from '../src/world/track/TrackGenerator';
import { FLAG } from '../src/world/track/TrackData';
for (const L of [3, 8, 14, 22]) {
  const { track } = generateLevel(L);
  let maxK = 0, openTurnMeters = 0, turnMeters = 0;
  for (let i = 0; i < track.count; i++) {
    const k = Math.abs(track.curv[i]) - 15 * Math.abs(track.bankAssist[i]) / 3249;
    maxK = Math.max(maxK, k);
    if (Math.abs(track.curv[i]) > 0.008) {
      turnMeters++;
      const outer = track.curv[i] > 0 ? FLAG.WALL_L : FLAG.WALL_R;
      if (!(track.flags[i] & outer) && track.tube[i] < 0.5) openTurnMeters++;
    }
  }
  console.log(L, 'maxK', maxK.toFixed(4), 'R', (1 / maxK).toFixed(0), 'turn m', turnMeters, 'open outer', openTurnMeters);
}
