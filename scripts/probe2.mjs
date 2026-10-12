import { chromium } from '@playwright/test';
const L = Number(process.argv[2] ?? 8);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 240, height: 320 } });
await page.goto('http://localhost:5173/?ts=1');
await page.waitForTimeout(1500);
await page.mouse.click(100, 100);
await page.evaluate((l) => {
  const g = window.game; g.save.data.tutorialDone = true; g.renderer.setQuality('low');
  g.startRace(l, []); g.race.countdown = 0.01;
  const r = g.race; const p = r.player;
  window.__log = [];
  // run the sim synchronously, fast
  const input = { throttle: 1, brake: 0, steer: 0, consumeNitro: () => false };
  for (let i = 0; i < 20 * 120 && r.state !== 'finished' && r.state !== 'gameover'; i++) {
    r.update(0.05, input);
    if (i % 4 === 0) {
      const tr = r.track; const k = tr.scalarAt(tr.curv, p.s);
      window.__log.push([p.s | 0, p.d.toFixed(1), p.v.toFixed(0), (p.v * p.v * k).toFixed(0), p.slide.toFixed(1), p.state, r.hearts, tr.flags[tr.index(p.s)]]);
    }
  }
}, L);
const log = await page.evaluate(() => window.__log);
for (const row of log) if (Math.abs(Number(row[3])) > 27 || row[5] !== "drive") console.log(row.join(" "));
await browser.close();
