// End-to-end UI flow with screenshots. Usage: node scripts/flow.mjs <outDir> [w] [h]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots';
const w = Number(process.argv[3] ?? 540), h = Number(process.argv[4] ?? 960);
const base = process.argv[5] ?? 'http://localhost:5173/?ts=10&ads=fast';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, locale: 'ru-RU' });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); console.log('shot', name); };
const G = (fn, arg) => page.evaluate(fn, arg);
const waitScreen = async (name, timeout = 120000) => { await page.waitForFunction((nm) => window.game.ui.currentName === nm, name, { timeout }); };
const click = (sel) => page.click(sel, { force: true });

await page.goto(base);
await page.waitForTimeout(2000);
await page.mouse.click(w / 2, h / 2);
await waitScreen('menu');
await page.waitForTimeout(800);
await shot('menu');

// race 1 driven by autopilot until finish
await click('.play-btn');
await waitScreen('prerace');
await click('.start-btn');
await waitScreen('hud');
await G(() => { window.game.race.autoPlayer = true; });
await page.waitForTimeout(6000);
await shot('race-auto');
await waitScreen('result', 240000);
await page.waitForTimeout(800);
await shot('result');
console.log('after race', await G(() => ({ level: window.game.save.data.level, coins: window.game.save.data.coins, stars: window.game.save.data.stars })));

// rewarded x3
const x3 = await page.$('.result .btn.ad');
if (x3) {
  await x3.click({ force: true });
  await page.waitForTimeout(400);
  console.log('during ad', await G(() => ({ adActive: window.game.adActive, ctx: window.game.audio.engine.ctx?.state, input: window.game.input.enabled, body: document.body.className })));
  await shot('rewarded-ad');
  await page.waitForFunction(() => !window.game.adActive, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await shot('result-after-x3');
}

// next level -> force game over
await click('.result .btn.green.big');
await waitScreen('prerace');
await shot('prerace-2');
await click('.start-btn');
await waitScreen('hud');
await page.waitForFunction(() => window.game.race.state === 'racing', null, { timeout: 60000 });
await page.keyboard.down('KeyW');
await page.waitForTimeout(3000);
await shot('race-2');
await G(() => { const r = window.game.race; r.hearts = 1; r.startFall(r.player, 'fall'); });
await waitScreen('gameover', 60000);
await page.waitForTimeout(600);
await shot('gameover');
await click('.revive-btn');
await page.waitForTimeout(300);
await shot('revive-ad');
await waitScreen('hud', 60000);
await page.waitForTimeout(1500);
console.log('after revive', await G(() => ({ state: window.game.race.state, hearts: window.game.race.hearts, revives: window.game.race.revivesUsed })));
await shot('after-revive');
await page.keyboard.up('KeyW');

// pause
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await shot('pause');
await click('.modal .btn.red');
await waitScreen('menu', 60000);
await page.waitForTimeout(500);

// shop, garage, map, settings, daily, wheel
await G(() => window.game.goShop('cars'));
await page.waitForTimeout(1500);
await shot('shop-cars');
await G(() => window.game.goShop('paint'));
await page.waitForTimeout(800);
await shot('shop-paint');
await G(() => window.game.goShop('coins'));
await page.waitForTimeout(500);
await shot('shop-coins');
await G(() => window.game.goGarage());
await page.waitForTimeout(800);
await shot('garage');
await G(() => window.game.goMap());
await page.waitForTimeout(800);
await shot('map');
await G(() => window.game.goMenu());
await page.waitForTimeout(300);
await G(() => window.game.openSettings());
await page.waitForTimeout(400);
await shot('settings');
await G(() => window.game.ui.closeAllModals());
await click('.menu-side.right .btn:nth-child(1)');
await page.waitForTimeout(500);
await shot('daily');
await G(() => window.game.ui.closeAllModals());
await click('.menu-side.right .btn:nth-child(2)');
await page.waitForTimeout(500);
await shot('wheel');
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
