import { chromium } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 720 }, locale: 'ru-RU' });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?ts=10&adpolicy=test');
await page.waitForTimeout(1500);
await page.mouse.click(200, 300);
await page.waitForTimeout(800);
const st = () => page.evaluate(() => ({ scr: window.game.ui.currentName, ad: window.game.adActive, ctx: window.game.audio.engine.ctx?.state, notice: !!document.querySelector('.ad-notice'), mock: !!document.querySelector('.mock-ad') }));
// menu -> shop goes through an interstitial
await page.click('.menu-side.left .btn:nth-child(2)', { force: true });
await page.waitForTimeout(1200);
console.log('menu->shop', JSON.stringify(await st()));
await page.screenshot({ path: `${out}/ad-interstitial.png` });
// try to click through the ad: UI must not react
await page.mouse.click(200, 600);
await page.waitForFunction(() => !window.game.adActive, null, { timeout: 20000 }).catch(() => {});
// interstitial: close button appears after the countdown
await page.waitForSelector('.mock-ad__close.ready', { timeout: 20000 }).catch(() => {});
await page.click('.mock-ad__close', { force: true }).catch(() => {});
await page.waitForTimeout(800);
console.log('after', JSON.stringify(await st()));
// rewarded closed early -> no reward
const coins0 = await page.evaluate(() => window.game.save.data.coins);
await page.evaluate(() => window.game.goShop('coins'));
await page.waitForTimeout(500);
await page.click('.grid .btn.ad', { force: true });
await page.waitForTimeout(700);
await page.click('.mock-ad__close', { force: true });
await page.waitForTimeout(800);
const coins1 = await page.evaluate(() => window.game.save.data.coins);
console.log('rewarded closed early: coins', coins0, '->', coins1, 'toast:', await page.evaluate(() => document.querySelector('.toast')?.textContent));
// context menu blocked
const ctx = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('game-canvas').dispatchEvent(e); return e.defaultPrevented; });
console.log('contextmenu prevented', ctx);
console.log('errors', errs);
await browser.close();
