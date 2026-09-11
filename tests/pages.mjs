// SparkAE public reference build — every published page, served and loaded.
//
// tests/browser.mjs drives demo-standalone.html and tests/assessor.mjs drives
// its assessor layer. Neither loads any other page, and tests/check.mjs only
// PARSES the inline scripts — it never runs them. So status.html's snapshot
// rendering and integrations.html's script had no runtime coverage at all, and
// a page that throws on load would ship green.
//
// The pages are served over HTTP from a local static server rather than opened
// from disk, because that is how visitors reach them and because file:// is
// not a fair test of a served page: a null origin blocks status.html's fetch
// of status-data.json, and a root-absolute asset path resolves to the
// filesystem root. Both work over HTTP and both fail from disk, so testing
// from disk reports faults the site does not have. (browser.mjs keeps using
// file:// on purpose — that the demo works from a disk is its own claim.)
//
// Asks the least a visitor is owed from every page: it renders, it does not
// throw, it reaches no origin but this one, and every internal link resolves.
//
// Needs Playwright (npm i playwright && npx playwright install chromium).
// Usage:  node tests/pages.mjs [site-root]
//   env PLAYWRIGHT_MODULE  path to the playwright package (default: resolve 'playwright')
//   env CHROMIUM           explicit browser binary (default: Playwright's own)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png',
};

// Netlify's shape, as far as these pages depend on it: the root is index.html
// and an extensionless path resolves to the .html file beside it.
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  let file = path.join(root, rel);
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) { rel += '.html'; file += '.html'; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(rel)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;

const pwPath = process.env.PLAYWRIGHT_MODULE || require.resolve('playwright');
const pw = await import(pwPath);
const chromium = pw.chromium || (pw.default && pw.default.chromium);
if (!chromium) throw new Error('playwright: chromium export not found at ' + pwPath);

const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html')).sort();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--no-sandbox'],
});

const checks = [];
for (const file of pages) {
  const page = await browser.newPage();
  const errors = [], offsite = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin)) return route.continue();
    offsite.push(u);
    return route.abort();
  });

  await page.goto(origin + '/' + file, { waitUntil: 'load' });
  await page.waitForTimeout(1200); // let deferred and onload work settle

  const seen = await page.evaluate(() => ({
    title: (document.title || '').trim(),
    text: ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim().length,
    // Same-site targets only; an off-site href is an address, not a load.
    links: Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && !/^(https?:|mailto:|tel:|#|data:)/i.test(h))
      .map((h) => h.split('#')[0].split('?')[0])
      .filter(Boolean),
  }));

  const dead = [...new Set(seen.links)]
    .filter((href) => !fs.existsSync(path.join(root, href.replace(/^\/+/, ''))));

  checks.push(
    [`${file}: no page or console error on load`, errors.length === 0, errors.slice(0, 2).join(' | ')],
    [`${file}: reached no origin but its own`, offsite.length === 0, offsite.slice(0, 2).join(' | ')],
    [`${file}: has a title`, seen.title.length > 0, seen.title],
    [`${file}: rendered visible text`, seen.text > 200, seen.text + ' chars'],
    [`${file}: every internal link resolves`, dead.length === 0, dead.slice(0, 4).join(', ')],
  );
  await page.close();
}
await browser.close();
await new Promise((r) => server.close(r));

let failures = 0;
for (const [name, pass, detail] of checks) {
  if (!pass) failures++;
  console.log((pass ? '  ok   ' : '  FAIL ') + name + (pass || !detail ? '' : '  → ' + detail));
}
console.log(failures ? `\n${failures} check(s) FAILED` : `\nall ${pages.length} published pages load clean`);
process.exit(failures ? 1 : 0);
