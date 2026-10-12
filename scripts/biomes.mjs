import { chromium } from '@playwright/test';
const out = process.argv[2];
const cases = JSON.parse(process.argv[3]); // [[level, segKind], ...]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 432, height: 768 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/?ts=4');
await page.waitForTimeout(1500);
await page.mouse.click(200, 350);
await page.waitForTimeout(500);
await page.evaluate(() => { window.game.save.data.tutorialDone = true; });
for (const [lvl, kind, back] of cases) {
  await page.evaluate(([l, k, b]) => {
    const g = window.game;
    g.startRace(l, []);
    const r = g.race;
    r.countdown = 0.01;
    r.autoPlayer = true;
    const seg = r.level.segments.find((s) => s.kind === k) ?? r.level.segments[3];
    const s0 = seg.start - (b ?? 40);
    r.racers.forEach((x, i) => { x.s = s0 + 10 + i * 9 - (x.isPlayer ? 14 : 0); x.v = 45; x.d = [-3, 3, 0, -3, 3, 0][i]; });
    console.log(l, r.level.biome.id, k, seg.start);
  }, [lvl, kind, back]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/b-${lvl}-${kind}.png` });
  console.log('shot', lvl, kind, await page.evaluate(() => { const r = window.game.race; return `${r.level.biome.id} s=${r.player.s|0} st=${r.player.state}`; }));
}
await browser.close();
