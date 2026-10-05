#!/usr/bin/env node
// SparkAE public reference build — the own-file path posts nothing.
//
// tests/browser.mjs proves the whole console reaches no origin while it drives
// bundled samples and small ad-hoc uploads. This asks the narrower question a
// visitor with a real package asks: if I put MY file in, does any of it leave?
//
// It uploads one committed ZIP (tests/fixtures/own-file-stress/, every name in
// it invented) through the real <input>, runs §01 Examine on it exactly as the
// visitor would, and holds four separate witnesses to the answer:
//
//   1. Playwright's route: every request that is not a file:// load is aborted
//      and counted, as browser.mjs does — blocked.length has to be 0.
//   2. Every request the page made at all, by method and URL, read from the
//      request event rather than the route, so a request that never reached a
//      route handler is still seen. None may carry a POST, a body, or the
//      fixture's canary string. (The canary witness covers URLs and text
//      bodies; Playwright's postData() does not expose multipart file parts,
//      so it is a supplement to the method and body-length checks, not a
//      substitute. Fault-injected on 2026-10-05 with a multipart POST of the
//      upload: the method, body, route, request-count and primitive checks
//      all went red; the canary check alone did not.)
//   3. The page's own egress primitives — fetch, XMLHttpRequest.open,
//      navigator.sendBeacon, WebSocket, EventSource — are wrapped before any
//      page script runs and count their calls. None may be called, whether or
//      not a request would have followed.
//   4. The inventory and the run have to show the package was actually READ:
//      the DOCX, the OSCAL JSON and the CSV each listed and none refused, the
//      OSCAL detected as an SSP, the scan rows counted, the run's own parsed
//      list naming all three, and §01 reaching Complete with evidence chunks.
//      A page that uploads nothing because it read nothing would pass 1–3 and
//      prove nothing.
//
// The committed ZIP is also rebuilt from its sources and compared, so the bytes
// a reader can open are the bytes this uploaded.
//
// Needs Playwright (npm i playwright && npx playwright install chromium).
// Usage:  node tests/own-file-stress.mjs [site-root]
//   env PLAYWRIGHT_MODULE  path to the playwright package (default: resolve 'playwright')
//   env CHROMIUM           path to a Chromium binary (default: Playwright's own)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FIXTURE_ZIP, MEMBERS, CANARY, buildFixtureZip } from './fixtures/own-file-stress/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE || require.resolve('playwright');
const pw = await import(pwPath);
const chromium = pw.chromium || (pw.default && pw.default.chromium);
if (!chromium) throw new Error('playwright: chromium export not found at ' + pwPath);

const committed = fs.readFileSync(FIXTURE_ZIP);
const rebuilt = buildFixtureZip();
const [DOCX, OSCAL, CSV] = [MEMBERS[1], MEMBERS[2], MEMBERS[3]];
const base = (p) => p.split('/').pop();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [], blocked = [], requests = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', r => requests.push({
  method: r.method(), url: r.url(), type: r.resourceType(), body: r.postData() || '',
}));
await page.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith('file://')) return route.continue();
  blocked.push(route.request().method() + ' ' + u);
  return route.abort();
});
// Witness 3: wrap the page's egress primitives before its first script runs.
await page.addInitScript(() => {
  const n = { fetch: 0, xhr: 0, beacon: 0, websocket: 0, eventsource: 0 };
  window.__egress = n;
  const f = window.fetch; window.fetch = function () { n.fetch++; return f.apply(this, arguments); };
  const o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function () { n.xhr++; return o.apply(this, arguments); };
  if (navigator.sendBeacon) { const b = navigator.sendBeacon; navigator.sendBeacon = function () { n.beacon++; return b.apply(this, arguments); }; }
  const W = window.WebSocket; window.WebSocket = function () { n.websocket++; return new W(...arguments); };
  const S = window.EventSource; if (S) window.EventSource = function () { n.eventsource++; return new S(...arguments); };
});

const dismissOnboarding = () => page.evaluate(() => { const o = document.getElementById('onb-overlay'); if (o) o.remove(); });
const settleFindings = () => page.waitForFunction(() => {
  const n = document.querySelectorAll('.findings-table .verdict-tag').length;
  const settled = n > 0 && window.__sSettle === n;
  window.__sSettle = n;
  return settled;
}, null, { timeout: 120000, polling: 300 });

await page.goto('file://' + path.join(root, 'demo-standalone.html'));
await dismissOnboarding();
const mode = await page.textContent('#stat-mode');
const requestsBeforeUpload = requests.length;

// ── the visitor's own file goes in ─────────────────────────────────────────
await page.setInputFiles('#ssp-upload-input', [FIXTURE_ZIP]);
await page.waitForFunction(() => {
  const name = (document.querySelector('#ssp-upload-btn .ssp-name') || {}).textContent || '';
  return !/Reading/.test(name) && !!document.querySelector('#ssp-upload-status .upload-clear');
}, null, { timeout: 30000 });
const panel = await page.evaluate(() => {
  const status = document.getElementById('ssp-upload-status');
  // Label and value are adjacent spans; read them apart rather than from the
  // row's concatenated text.
  const rows = Array.from(status.querySelectorAll('.upload-row')).map(r => ({
    label: ((r.querySelector('.upload-label') || {}).textContent || '').trim(),
    value: ((r.querySelector('.upload-value, .upload-warn') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
  }));
  const row = (label) => { const r = rows.find(x => x.label === label); return r ? r.label + ': ' + r.value : ''; };
  return {
    name: (document.querySelector('#ssp-upload-btn .ssp-name') || {}).textContent || '',
    meta: (document.querySelector('#ssp-upload-btn .ssp-meta') || {}).textContent || '',
    files: Array.from(status.querySelectorAll('.upload-file')).map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    received: row('Files received'),
    oscal: row('OSCAL detected'),
    scan: row('Parsed scan output'),
    ssp: row('SSP'),
    scans: row('Vulnerability scans'),
    bound: typeof CUSTOM_PKG_FILES === 'undefined' ? -1 : CUSTOM_PKG_FILES.length,
    report: (typeof CUSTOM_PKG_REPORT !== 'undefined' && CUSTOM_PKG_REPORT && CUSTOM_PKG_REPORT.report)
      ? { parsed: CUSTOM_PKG_REPORT.report.parsed, skipped: CUSTOM_PKG_REPORT.report.skipped.map(s => s.name + ': ' + s.reason), chunks: CUSTOM_PKG_REPORT.report.chunks.length }
      : null,
  };
});
const requestsAfterUpload = requests.length;

// ── §01 Examine on that file, as the visitor would run it ──────────────────
await dismissOnboarding();
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 180000 });
await settleFindings();
await page.waitForTimeout(1500);
const run = await page.evaluate(() => ({
  status: document.getElementById('console-status').textContent.trim(),
  log: document.getElementById('log').textContent.replace(/\s+/g, ' '),
  refused: (document.querySelector('.live-refused') || {}).textContent || '',
  rows: document.querySelectorAll('.findings-table .verdict-tag').length,
  receipt: (document.querySelector('.receipt-grid') || {}).textContent || '',
  egress: window.__egress,
}));
await page.waitForTimeout(1500); // anything deferred after Complete gets its chance to send
const egress = await page.evaluate(() => window.__egress);
await browser.close();

const fileOf = (name) => panel.files.find(t => t.includes(name)) || '';
const nonFile = requests.filter(r => !r.url.startsWith('file://'));
const posts = requests.filter(r => r.method !== 'GET' && r.method !== 'HEAD');
const withBody = requests.filter(r => r.body && r.body.length);
const canaried = requests.filter(r => r.url.includes(CANARY) || r.body.includes(CANARY));
const parsedM = /(\d+) file\(s\) parsed · (\d+) evidence chunks/.exec(run.log) || [];

const checks = [
  ['the committed fixture ZIP is the one its sources build (' + committed.length + ' bytes)', committed.equals(rebuilt), 'rebuilt ' + rebuilt.length + ' bytes'],
  ['the fixture stays small (under 16 KB)', committed.length < 16 * 1024, committed.length + ' bytes'],
  ['no page or console errors', errors.length === 0, errors.join(' | ')],
  ['rail: EXAMINE · automated', mode === 'EXAMINE · automated', mode],
  // 1. the route
  ['no request left the page (every non-file request aborted): blocked.length === 0', blocked.length === 0, blocked.join(' | ')],
  // 2. the request log
  ['every request the page made was a file:// load (' + requests.length + ' seen)', nonFile.length === 0, nonFile.map(r => r.method + ' ' + r.url).join(' | ')],
  ['no request used a method other than GET/HEAD: zero POSTs', posts.length === 0, posts.map(r => r.method + ' ' + r.url).join(' | ')],
  ['no request carried a body', withBody.length === 0, withBody.map(r => r.method + ' ' + r.url + ' (' + r.body.length + ' bytes)').join(' | ')],
  ['no request URL or body carried the fixture canary', canaried.length === 0, canaried.map(r => r.url).join(' | ')],
  ['the upload itself issued no request (' + (requestsAfterUpload - requestsBeforeUpload) + ' during the read)', requestsAfterUpload === requestsBeforeUpload, ''],
  // 3. the page's own egress primitives
  ['the page never called fetch, XMLHttpRequest, sendBeacon, WebSocket or EventSource',
    egress && Object.values(egress).every(v => v === 0), JSON.stringify(egress)],
  // 4. the package was read
  ['the upload is not reported as a failure', !/Upload failed|failed/i.test(panel.name + ' ' + panel.meta), panel.name + ' | ' + panel.meta],
  ['the upload binds one package to the engine', panel.bound === 1, String(panel.bound)],
  ['the inventory lists the DOCX, the OSCAL JSON and the CSV by name',
    !!fileOf(base(DOCX)) && !!fileOf(base(OSCAL)) && !!fileOf(base(CSV)), JSON.stringify(panel.files)],
  ['none of the three is marked "not read"',
    ![DOCX, OSCAL, CSV].some(m => /not read/.test(fileOf(base(m)))), JSON.stringify(panel.files)],
  ['the inventory counts ' + MEMBERS.length + ' files received', new RegExp('^Files received: ' + MEMBERS.length + ' ·').test(panel.received), panel.received],
  ['the OSCAL JSON is detected as a system-security-plan', /^OSCAL detected: 1 SSP/.test(panel.oscal), panel.oscal],
  ['the scanner CSV is parsed: 4 rows, C:1 H:1 M:1 L:1', /^Parsed scan output: 4 rows · C:1 H:1 M:1 L:1/.test(panel.scan), panel.scan],
  ['the artifact inventory marks SSP and Vulnerability scans present',
    panel.ssp === 'SSP: present' && panel.scans === 'Vulnerability scans: present', panel.ssp + ' | ' + panel.scans],
  ['the engine\'s own read parsed all three members and refused none',
    !!panel.report && [DOCX, OSCAL, CSV].every(m => panel.report.parsed.some(p => p.endsWith(m))) && panel.report.skipped.length === 0,
    JSON.stringify(panel.report)],
  ['§01 reaches Complete on the uploaded package', /COMPLETE/.test(run.status), run.status],
  ['the run logs the package as received and parsed: ' + MEMBERS.length + ' file(s), evidence chunks > 0',
    +parsedM[1] === MEMBERS.length && +parsedM[2] > 0, (parsedM[0] || run.log.slice(0, 200))],
  ['the run names the DOCX member it read', run.log.includes(base(DOCX)), ''],
  ['the run refused nothing', !run.refused && !/✗ refused/.test(run.log), run.refused || (run.log.match(/✗ refused[^·]*·[^·]*/) || [''])[0]],
  ['the run painted findings and a receipt', run.rows > 0 && /evidence/.test(run.receipt), 'rows=' + run.rows],
];
let failures = 0;
for (const [msg, pass, detail] of checks) {
  if (!pass) failures++;
  console.log((pass ? '  ok   ' : '  FAIL ') + msg + (pass || !detail ? '' : ' — ' + detail));
}
console.log(`\nrequests observed: ${requests.length} (file:// ${requests.length - nonFile.length}, other ${nonFile.length}, POST/other-method ${posts.length}, with body ${withBody.length}); blocked.length=${blocked.length}; egress=${JSON.stringify(egress)}`);
console.log(failures ? `\n${failures} own-file stress check(s) FAILED` : '\nall own-file stress checks passed');
process.exit(failures ? 1 : 0);
