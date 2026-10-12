import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on('pageerror', (e) => console.log('ERR', e.message, e.stack));
await page.goto(process.argv[2] ?? 'http://localhost:5173/');
await page.waitForTimeout(2000);
await page.mouse.click(270, 480);
await page.waitForTimeout(500);
await page.evaluate(() => window.game.startRace(1, []));
  console.log(JSON.stringify(await page.evaluate(() => { const i = window.game.renderer.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; })));
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1000);
  console.log(JSON.stringify(await page.evaluate(() => { const i = window.game.renderer.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; })));
  console.log(JSON.stringify(await page.evaluate(() => { const g = window.game; const r = g.race; return { paused: g.paused, ad: g.adActive, hidden: document.hidden, mode: g.mode, st: r.state, cd: r.countdown.toFixed(2), s: r.player.s.toFixed(1) }; })));
}
await browser.close();
