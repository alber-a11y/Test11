import { chromium } from '@playwright/test';
const levels = JSON.parse(process.argv[2] ?? '[1,5,15]');
const mode = process.argv[3] ?? 'hold';
const difficulty = process.argv[4] ?? 'normal';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 240, height: 320 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/?ts=20&ads=nofill');
await page.waitForTimeout(1500);
await page.mouse.click(100, 100);
await page.evaluate(() => { window.game.save.data.tutorialDone = true; window.game.renderer.setQuality('low'); });
for (const L of levels) {
  await page.evaluate((d) => { window.__diff = d; }, difficulty);
  await page.evaluate(([l, m]) => {
    const g = window.game;
    g.save.data.settings.difficulty = window.__diff; g.startRace(l, []);
    g.race.countdown = 0.01;
    if (m === 'auto') g.race.autoPlayer = true;
    window.__falls = { player: 0, bots: 0 };
    g.race.events.on('fall', () => window.__falls.player++);
    window.__bf = 0; g.race.events.on('botFall', () => window.__bf++);
  }, [L, mode]);
  if (mode === 'hold') await page.keyboard.down('KeyW');
  const t0 = Date.now();
  let res;
  while (Date.now() - t0 < 150000) {
    await page.waitForTimeout(1000);
    res = await page.evaluate(() => { const r = window.game.race; if (!r) return { done: true }; return { st: r.state, prog: r.progress.toFixed(2), place: r.player.place, hearts: r.hearts, t: r.time.toFixed(0), botFalls: window.__bf, falls: window.__falls.player }; });
    if (res.done || res.st === 'finished' || res.st === 'gameover') break;
  }
  if (mode === 'hold') await page.keyboard.up('KeyW');
  console.log('level', L, JSON.stringify(res));
  await page.evaluate(() => window.game.leaveRace());
}
await browser.close();
