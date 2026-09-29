// Drives the Alexa+ simulator through plan.json and records the screen at 1920x1080.
// The parent's voice and Alexa's voice are added afterwards (build.py), so this script
// only simulates speech on screen: mic on, listening light, words appearing as she talks.
// Output: /work/rec/*.webm and /work/timeline.json (when each thing happened).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync('/work/plan.json', 'utf8'));
const durations = JSON.parse(readFileSync('/work/durations.json', 'utf8'));
const url = process.env.SIM_URL ?? 'http://puente-rec-sim:4000/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: '/work/rec', size: { width: 1920, height: 1080 } }
});
const page = await context.newPage();
const t0 = Date.now();
const timeline = [];
const mark = (type, extra = {}) => {
  const entry = { t: (Date.now() - t0) / 1000, type, ...extra };
  timeline.push(entry);
  console.log(JSON.stringify(entry));
};

await page.goto(url);
await page.waitForFunction(() => document.getElementById('skill')?.textContent === 'puente', null, { timeout: 30000 });
await sleep(2000);
mark('ready');

async function parentSays(step) {
  mark('parent', { id: step.id, text: step.say });
  await page.evaluate(
    async ({ text, seconds }) => {
      const mic = document.getElementById('mic');
      const bar = document.getElementById('light-bar');
      const caption = document.getElementById('caption-user');
      for (const id of ['caption-alexa', 'caption-alexa-translation', 'caption-user-translation']) {
        document.getElementById(id).hidden = true;
      }
      mic.classList.add('on');
      bar.className = 'light-bar listening';
      caption.hidden = false;
      const words = text.split(' ');
      for (let i = 1; i <= words.length; i++) {
        caption.textContent = `“${words.slice(0, i).join(' ')}”`;
        await new Promise(resolve => setTimeout(resolve, (seconds * 1000) / words.length));
      }
      mic.classList.remove('on');
      bar.className = 'light-bar';
    },
    { text: step.say, seconds: durations[step.id] }
  );
  const before = await page.evaluate(() => document.getElementById('caption-alexa').textContent);
  await page.evaluate(
    text => fetch('/api/utterance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }),
    step.say
  );
  mark('sent', { id: step.id });
  await page.waitForFunction(
    previous => {
      const caption = document.getElementById('caption-alexa');
      return !caption.hidden && caption.textContent && caption.textContent !== previous;
    },
    before,
    { timeout: 120000 }
  );
  const said = await page.evaluate(() => document.getElementById('caption-alexa').textContent);
  mark('alexa', { id: step.id, text: said });
  // Room for Alexa's voice (added later) and for the English subtitle to appear.
  await sleep((said.length / 12 + 1.4) * 1000);
}

for (const step of plan.demo) {
  if (step.narration) {
    mark('narration', { id: step.narration });
    await sleep(durations[step.narration] * 1000 + 500);
  } else {
    await parentSays(step);
  }
}
await sleep(1500);
mark('end');

const video = page.video();
await context.close();
await browser.close();
writeFileSync('/work/timeline.json', JSON.stringify({ video: await video.path(), events: timeline }, null, 2));
console.log('saved', await video.path());
