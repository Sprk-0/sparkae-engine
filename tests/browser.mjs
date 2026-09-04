#!/usr/bin/env node
// SparkAE public reference build — browser-level conformance.
//
// Drives demo-standalone.html in headless Chromium exactly as a visitor would,
// with EVERY request that is not a file:// load aborted and counted, and
// compares what the page shows with the golden fixture:
//
//   * no page error, no console error, no network request of any kind
//   * the rail says EXAMINE · automated and the pinned sample date
//   * the seven gate pills carry the engine's canonical names
//   * Satisfied / Other Than Satisfied / Not Reviewed / review-required on
//     screen equal tests/golden/sample-ssp.expected.json
//   * the receipt strip and the downloaded receipt carry the golden verdict digest
//   * two OSCAL downloads from the same run are byte-identical
//   * the summary states INTERVIEW and TEST were not performed
//   * the console narrates no scripted lifecycle activity, and does narrate gate 7
//   * an upload containing a PDF: the refusal is logged and shown, the run
//     continues on the readable file, and the date field defaults to today
//
// Needs Playwright (npm i playwright && npx playwright install chromium).
// Usage:  node tests/browser.mjs [site-root]
//   env PLAYWRIGHT_MODULE  path to the playwright package (default: resolve 'playwright')
//   env CHROMIUM           path to a Chromium binary (default: Playwright's own)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));
const golden = JSON.parse(fs.readFileSync(path.join(here, 'golden', 'sample-ssp.expected.json'), 'utf8'));

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE || require.resolve('playwright');
const { chromium } = await import(pwPath);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [], blocked = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith('file://')) return route.continue();
  blocked.push(u);
  return route.abort();
});

const dismissOnboarding = () => page.evaluate(() => { const o = document.getElementById('onb-overlay'); if (o) o.remove(); });

await page.goto('file://' + path.join(root, 'demo-standalone.html'));
const date = await page.inputValue('#assessment-date');
const mode = await page.textContent('#stat-mode');
await dismissOnboarding();
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 180000 });
await page.waitForTimeout(2500); // number animations settle
const num = async (sel) => +(await page.textContent(sel));
const sat = await num('#live-r-sat'), ots = await num('#live-r-ots'), nr = await num('#live-r-nr'), review = await num('#live-r-review');
const receipt = await page.textContent('.receipt-grid');
const log = await page.textContent('#log');
const pills = await page.$$eval('.gate-pill', els => els.map(e => e.textContent.replace(/^\d+/, '')));

async function download(kind) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(k => downloadLive(k), kind)]);
  const p = path.join(os.tmpdir(), 'sparkae-browser-' + kind + '-' + process.pid + '-' + Date.now());
  await dl.saveAs(p);
  const bytes = fs.readFileSync(p);
  fs.unlinkSync(p);
  return bytes;
}
const ar1 = await download('ar'), ar2 = await download('ar');
const rec = JSON.parse((await download('receipt')).toString());
const summary = (await download('summary')).toString();

// An empty date field must stop the run visibly, never fall back to a hidden date.
await page.fill('#assessment-date', '');
await dismissOnboarding();
await page.click('#run-btn');
await page.waitForFunction(() => /assessment date required/.test(document.getElementById('console-status').textContent), null, { timeout: 30000 }).catch(() => {});
const emptyDateStatus = await page.textContent('#console-status');
await page.fill('#assessment-date', golden.assessment_date);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkae-upload-'));
fs.writeFileSync(path.join(tmp, 'ssp.txt'), 'AC-2 Account Management. Accounts are reviewed quarterly by the ISSO per SSP section 5.2. Most recent scan: 2026-05-28.');
fs.writeFileSync(path.join(tmp, 'scan.pdf'), '%PDF-1.7 not parsed in the browser build');
await page.setInputFiles('#ssp-upload-input', [path.join(tmp, 'ssp.txt'), path.join(tmp, 'scan.pdf')]);
await page.waitForTimeout(800);
const uploadDate = await page.inputValue('#assessment-date');
await dismissOnboarding();
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 180000 });
const log2 = await page.textContent('#log');
const refused = await page.textContent('.live-refused').catch(() => '');
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });

const checks = [
  ['no page or console errors', errors.length === 0, errors.join(' | ')],
  ['no request left the page (every non-file request aborted)', blocked.length === 0, blocked.join(' | ')],
  ['rail: EXAMINE · automated', mode === 'EXAMINE · automated', mode],
  ['sample date pinned to ' + golden.assessment_date, date === golden.assessment_date, date],
  ['seven canonical gate pills', pills.join(',') === 'Presence,Concepts,Strength,ODP,Contradiction,Temporal,Determination', pills.join(',')],
  [`on screen: ${sat} SAT / ${ots} OTS / ${nr} NR / ${review} review-required = golden`,
    sat === golden.satisfied && ots === golden.other_than_satisfied && nr === golden.not_reviewed && review === golden.review_required, ''],
  ['receipt strip shows the golden verdict digest', receipt.includes(golden.verdict_digest), ''],
  ['downloaded receipt carries the golden verdict digest', rec.verdict_digest === golden.verdict_digest, rec.verdict_digest],
  ['two OSCAL downloads are byte-identical (' + ar1.length + ' bytes)', ar1.equals(ar2), ''],
  ['summary states INTERVIEW and TEST were not performed', summary.includes('INTERVIEW and TEST were not performed'), ''],
  ['console narrates no scripted lifecycle activity', !/appendices reviewed|functional test report on file|penetration test|SAR ready for AO/.test(log), ''],
  ['console narrates gate 7 · Determination', /gate 7 · Determination/.test(log), ''],
  ['an empty assessment date stops the run with a visible message', /assessment date required/.test(emptyDateStatus), emptyDateStatus],
  ['upload defaults the date field to today', uploadDate === new Date().toISOString().slice(0, 10), uploadDate],
  ['upload: PDF refusal logged', /refused scan\.pdf/.test(log2), ''],
  ['upload: refusal shown in the results', /scan\.pdf/.test(refused), ''],
];
let failures = 0;
for (const [msg, pass, detail] of checks) {
  if (!pass) failures++;
  console.log((pass ? '  ok   ' : '  FAIL ') + msg + (pass || !detail ? '' : ' — ' + detail));
}
console.log(failures ? `\n${failures} browser check(s) FAILED` : '\nall browser checks passed');
process.exit(failures ? 1 : 0);
