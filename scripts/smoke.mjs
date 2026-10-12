// Usage: node scripts/smoke.mjs <url> <outDir> [w] [h]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:5173/?ts=8';
const out = process.argv[3] ?? 'shots';
const w = Number(process.argv[4] ?? 540), h = Number(process.argv[5] ?? 960);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
await page.goto(url);
await page.waitForTimeout(2500);
await shot('01-loading');
await page.mouse.click(w / 2, h / 2);
await page.waitForTimeout(1500);
await shot('02-menu');
await page.click('.play-btn', { force: true });
await page.waitForTimeout(1200);
await shot('03-prerace');
await page.click('.start-btn', { force: true });
await page.waitForTimeout(1500);
await shot('04-countdown');
await page.keyboard.down('KeyW');
await page.waitForTimeout(5000);
await shot('05-race');
await page.keyboard.down('Space');
await page.waitForTimeout(200);
await page.keyboard.up('Space');
await page.waitForTimeout(2500);
await shot('06-race-nitro');
await page.keyboard.down('KeyA');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyA');
await shot('07-race-left');
const state = await page.evaluate(() => { const g = window.game; const r = g.race; return r ? { state: r.state, s: r.player.s|0, v: r.player.v|0, place: r.player.place, hearts: r.hearts, coins: r.coins, pstate: r.player.state } : null; });
console.log('state', JSON.stringify(state));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
