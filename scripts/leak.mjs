// Starts and leaves many races; GPU resource counts must stay flat.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 240, height: 320 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
await page.mouse.click(100, 100);
const SAME = !!process.env.SAME;
for (let i = 1; i <= 8; i++) {
  await page.evaluate((l) => window.game.startRace(l, []), SAME ? 4 : i * 3);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.game.goMenu());
  await page.waitForTimeout(500);
  console.log(i, JSON.stringify(await page.evaluate(() => window.game.renderer.renderer.info.memory)));
}
await browser.close();
