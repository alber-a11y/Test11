import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(2000);
await page.mouse.click(270, 480);
await page.evaluate(() => window.game.startRace(Number(new URLSearchParams(location.search).get('l') ?? 1), []));
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const g = window.game; const out = {};
  const tally = (name, root) => { let n = 0; root.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) n++; }); out[name] = n; };
  tally('race', g.race.group); tally('env', g.world.env.group);
  const trackGroup = g.renderer.scene.children.find((c) => c.name === 'track'); tally('track', trackGroup);
  tally('all', g.renderer.scene);
  out.car = 0; g.race.player.model.root.traverse((o)=>{ if(o.isMesh) out.car++; });
  return JSON.stringify(out);
}));
await browser.close();
