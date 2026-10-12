// Screenshots of pre-race (difficulty), shop tabs with rewarded items, settings.
import { chromium } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 800 }, locale: 'ru-RU' });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
await page.mouse.click(195, 400);
await page.waitForTimeout(800);
const shot = async (n) => page.screenshot({ path: `${out}/${n}.png` });
await page.evaluate(() => window.game.goPreRace(3)); await page.waitForTimeout(900);
await page.click('.diff-hard', { force: true }); await page.waitForTimeout(300); await shot('s1-prerace');
for (const tab of ['livery', 'rims', 'neon', 'trails', 'coins']) {
  await page.evaluate((tb) => window.game.goShop(tb), tab); await page.waitForTimeout(1200); await shot(`s-${tab}`);
}
console.log('ad items per tab:', await page.evaluate(() => {
  const out = {};
  for (const tab of ['cars', 'paint', 'livery', 'rims', 'neon', 'trails']) { window.game.goShop(tab); out[tab] = document.querySelectorAll('.card .ad-tag').length; }
  window.game.goShop('boosters'); out.boosters = document.querySelectorAll('.grid .btn.ad').length;
  window.game.goShop('coins'); out.coins = document.querySelectorAll('.grid .btn.ad').length;
  return out;
}));
await page.evaluate(() => { window.game.goMenu(); window.game.openSettings(); }); await page.waitForTimeout(500); await shot('s-settings');
await browser.close();
