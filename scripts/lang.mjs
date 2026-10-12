// Checks RU/EN switching from the main-menu button and screenshots key screens in both languages.
import { chromium } from '@playwright/test';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 760 }, locale: 'ru-RU' });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/?ts=6');
await page.waitForTimeout(1500);
await page.mouse.click(195, 380);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/lang-menu-ru.png` });
await page.click('.lang-btn', { force: true });
await page.waitForTimeout(800);
console.log('after toggle:', await page.evaluate(() => [window.game.language, window.game.save.data.settings.lang, document.querySelector('.play-btn').textContent]));
await page.screenshot({ path: `${out}/lang-menu-en.png` });
await page.click('.lang-btn', { force: true });
await page.waitForTimeout(500);
console.log('back:', await page.evaluate(() => [window.game.language, document.querySelector('.play-btn').textContent]));
await page.evaluate(() => window.game.goShop('paint'));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/lang-shop-ru.png` });
await page.evaluate(() => { window.game.save.data.tutorialDone = true; window.game.startRace(3, []); window.game.race.countdown = 0.01; window.game.race.autoPlayer = true; });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/lang-hud-ru.png` });
// switch language while paused in a race
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.evaluate(() => window.game.setLanguage('en'));
await page.waitForTimeout(500);
console.log('paused after switch:', await page.evaluate(() => [window.game.paused, !!document.querySelector('.modal'), document.querySelector('.hud-pos .lbl').textContent]));
await page.screenshot({ path: `${out}/lang-pause-en.png` });
// reload: language persists
await page.reload();
await page.waitForTimeout(1500);
console.log('persisted:', await page.evaluate(() => window.game.save.data.settings.lang));
await browser.close();
