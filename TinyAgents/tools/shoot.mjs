// Headless Chrome screenshot of the running dev server.
// usage: node tools/shoot.mjs <url> <out.png> [--wait ms] [--pre file.js] [--eval "js expression"] [--after ms] [--size 1600x1000]
// --pre runs a script file (an expression, may return a promise) before --eval; --after waits after the eval.
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const [url, out] = args;
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [width, height] = opt('size', '1600x1000').split('x').map(Number);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width, height });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warn') && console.log(`console.${m.type()}:`, m.text()));
await page.goto(url, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, Number(opt('wait', '1500'))));
const pre = opt('pre', null);
if (pre) {
  console.log('pre:', await page.evaluate(readFileSync(pre, 'utf8')));
}
const expr = opt('eval', null);
if (expr) {
  console.log('eval:', await page.evaluate(expr));
}
if (pre || expr) {
  await new Promise((r) => setTimeout(r, Number(opt('after', '400'))));
}
await page.screenshot({ path: out, fullPage: args.includes('--full') });
await browser.close();
