// Verifies mobile two-zone controls with synthetic touch pointers.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/?ts=6');
await page.waitForTimeout(1500);
await page.touchscreen.tap(195, 400);
await page.waitForTimeout(500);
await page.evaluate(() => { window.game.startRace(1, []); window.game.race.countdown = 0.01; });
await page.waitForTimeout(800);
const ptr = (type, id, x) => page.evaluate(([t, i, xx]) => {
  const target = t === 'pointerdown' ? document.getElementById('touch-layer') : window;
  target.dispatchEvent(new PointerEvent(t, { pointerId: i, pointerType: 'touch', clientX: xx, clientY: 600, bubbles: true, cancelable: true }));
}, [type, id, x]);
const st = () => page.evaluate(() => { const g = window.game; return { thr: g.input.throttle, br: g.input.brake, steer: g.input.steer, v: g.race.player.v.toFixed(1), d: g.race.player.d.toFixed(2) }; });
await ptr('pointerdown', 1, 330);
await page.waitForTimeout(1500);
console.log('right hold', JSON.stringify(await st()));
await ptr('pointerdown', 2, 60);
await page.waitForTimeout(600);
console.log('both', JSON.stringify(await st()));
await ptr('pointerup', 1, 330);
await page.waitForTimeout(600);
console.log('left only', JSON.stringify(await st()));
await ptr('pointerup', 2, 60);
await page.waitForTimeout(800);
console.log('released', JSON.stringify(await st()));
// nitro button
await page.evaluate(() => document.querySelector('.nitro-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })));
await page.waitForTimeout(300);
console.log('nitro', await page.evaluate(() => window.game.race.player.nitroTime > 0));
await browser.close();
