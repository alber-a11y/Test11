import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 240, height: 320 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
await page.mouse.click(100, 100);
console.log(await page.evaluate(() => {
  const g = window.game; g.startRace(12, []); const r = g.race; r.countdown = 0.01; r.autoPlayer = true;
  const input = { throttle: 1, brake: 0, steer: 0, consumeNitro: () => false };
  let mistakes = 0, maxSlide = 0, maxD = 0, falls = 0; const ex = [];
  r.events.on('botFall', () => falls++);
  for (let i = 0; i < 20 * 90 && r.state === 'racing' || i < 100; i++) {
    r.update(0.05, input);
    for (const b of r.racers) if (!b.isPlayer && b.mistakeTime > 0) { mistakes++; maxSlide = Math.max(maxSlide, Math.abs(b.slide)); maxD = Math.max(maxD, Math.abs(b.d)); if (ex.length < 5 && Math.abs(b.slide) > 3) ex.push([b.s|0, b.v.toFixed(0), b.slide.toFixed(1), b.d.toFixed(1), b.throttle, b.brake.toFixed(2)]); }
  }
  return JSON.stringify({ mistakes, maxSlide, maxD, falls, ex });
}));
await browser.close();
