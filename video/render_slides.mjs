// Renders the three slides of slides.html to 1920x1080 PNGs in /work/slides.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('/work/slides', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const slide of [1, 2, 3]) {
  await page.goto(`file:///work/slides.html?s=${slide}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `/work/slides/s${slide}.png` });
  console.log(`slide ${slide} rendered`);
}
await browser.close();
