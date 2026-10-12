// Close-up renders of cars on the podium. Usage: node scripts/cars.mjs <outDir> '["striker","muscle"]'
import { chromium } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
await page.mouse.click(300, 200);
await page.waitForTimeout(500);
const ids = JSON.parse(process.argv[3]);
for (const id of ids) {
  await page.evaluate((id) => {
    const g = window.game;
    g.ui.root.style.display = 'none';
    g.showroom.framing = 'center';
    const def = g.eco.look(id);
    g.showroom.setCar(def);
  }, id);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/car-${id}.png` });
}
await browser.close();
