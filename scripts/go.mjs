import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
page.on('pageerror', (e) => console.log('ERR', e.message, e.stack));
await page.goto('http://localhost:5173/?ts=10');
await page.waitForTimeout(2000);
await page.mouse.click(200, 350);
await page.evaluate(() => window.game.startRace(2, []));
await page.waitForFunction(() => window.game.race.state === 'racing', null, { timeout: 60000 });
await page.evaluate(() => { const r = window.game.race; r.hearts = 1; r.player.d = 30; });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(700);
  console.log(JSON.stringify(await page.evaluate(() => { const g = window.game, r = g.race; return { scr: g.ui.currentName, st: r?.state, ps: r?.player.state, h: r?.hearts, d: r?.player.d.toFixed(1), paused: g.paused }; })));
}
await browser.close();
