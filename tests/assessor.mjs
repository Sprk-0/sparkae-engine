// SparkAE public reference build — the assessor layer, in a real browser.
//
// §01 writes the examine statement a SAR needs and lets an assessor revise it,
// and those revisions flow into every export. Two claims there are easy to
// break by accident and expensive to break in front of an assessor:
//
//   * the statement is built from the run — the documents retrieval actually
//     hit, the section cited in the passage, and the objective reworded out of
//     its "Determine if ..." form — and never asserts a confirmation the
//     engine did not make;
//   * a revision changes the artifacts and does NOT change the reproducibility
//     receipt. The verdict digest attests what the ENGINE derived from the
//     evidence; if an assessor could move it, it would attest nothing.
//
// This drives the page with every non-file request aborted, revises an
// objective the engine marked Other Than Satisfied, and reads the downloaded
// OSCAL, POA&M, RET and summary back.
//
// Needs Playwright (npm i playwright && npx playwright install chromium).
// Usage:  node tests/assessor.mjs [site-root]
//   env PLAYWRIGHT_MODULE  path to the playwright package (default: resolve 'playwright')
//   env CHROMIUM           explicit browser binary (default: Playwright's own)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));

const pwPath = process.env.PLAYWRIGHT_MODULE || require.resolve('playwright');
const pw = await import(pwPath);
const chromium = pw.chromium || (pw.default && pw.default.chromium);
if (!chromium) throw new Error('playwright: chromium export not found at ' + pwPath);

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

const dropOnboarding = () => page.evaluate(() => {
  const o = document.getElementById('onb-overlay'); if (o) o.remove();
});

await page.goto('file://' + path.join(root, 'demo-standalone.html'));
await dropOnboarding();
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 180000 });
// Rows paint in batches on timers, so the table keeps growing for a while
// after the first statement appears. Wait for the count to stop moving: two
// consecutive polls agreeing means the painter is done, and the tallies below
// then describe a table that is no longer changing under them.
await page.waitForFunction(() => {
  const n = document.querySelectorAll('.ex-block').length;
  if (!n) return false;
  const settled = window.__exSettleCount === n;
  window.__exSettleCount = n;
  return settled;
}, null, { timeout: 60000, polling: 300 });

const download = async (kind) => {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.evaluate(k => downloadLive(k), kind),
  ]);
  const stream = await dl.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
};

// Both tallies come from one evaluation, so they cannot disagree because a
// batch landed between two separate queries — which is exactly how this read
// 84 collapsed of 72 blocks on a CI runner.
const { blocks, collapsed } = await page.evaluate(() => ({
  blocks: document.querySelectorAll('.ex-block').length,
  collapsed: document.querySelectorAll('.ex-block:not([open])').length,
}));

const arBefore = JSON.parse(await download('ar'));
const poamBefore = await download('poam');
const retBefore = await download('ret');
const receiptBefore = await page.textContent('.receipt-grid');

// Revise an objective the ENGINE marked Other Than Satisfied, so the flip is
// real rather than a no-op on something already satisfied.
const target = await page.evaluate(() => {
  for (const tr of document.querySelectorAll('tr')) {
    const v = tr.querySelector('.verdict-tag'), b = tr.querySelector('.ex-block');
    if (v && b && v.textContent.trim() === 'OTS') return b.getAttribute('data-dif');
  }
  return null;
});
if (!target) { console.log('  FAIL no engine Other Than Satisfied row to revise'); await browser.close(); process.exit(1); }

const block = page.locator(`.ex-block[data-dif="${target}"]`);
await block.locator('summary').click();
const engineStatement = (await block.locator('.ex-text').textContent()) || '';
await block.locator('.ex-btn[data-act="revise"]').click();
await block.locator('.ex-edit').waitFor({ state: 'visible', timeout: 15000 });
const REVISED = 'During the assessment, the assessor examined the SSP and the interview record, and confirmed per §5.2 that the objective is met.';
await block.locator('.ex-edit').fill(REVISED);
await block.locator('.ex-select').selectOption('SAT');
await block.locator('.ex-btn[data-act="save"]').click();
await page.waitForFunction(() => document.querySelectorAll('.ex-block.revised').length === 1, null, { timeout: 30000 });

const flag = (await page.locator('.ex-block.revised .ex-flag').first().textContent()) || '';
const arAfter = JSON.parse(await download('ar'));
const poamAfter = await download('poam');
const retAfter = await download('ret');
const summary = await download('summary');
const receiptAfter = await page.textContent('.receipt-grid');

const findingsOf = (o) => (o['assessment-results'].results[0].findings || []);
const revised = findingsOf(arAfter).filter(f =>
  (f.props || []).some(p => p.name === 'determination-source' && p.value === 'assessor-revision'));
const props = Object.fromEntries((((revised[0] || {}).props) || []).map(p => [p.name, p.value]));
const receiptProps = (o) => JSON.stringify(o['assessment-results'].metadata.props || []);
const rows = (csv) => csv.trim().split('\n').length;

// Revert, and the engine's determination is what stands again.
await page.locator('.ex-block.revised .ex-btn[data-act="reset"]').first().click();
await page.waitForFunction(() => document.querySelectorAll('.ex-block.revised').length === 0, null, { timeout: 30000 });
const poamReverted = await download('poam');

// ── a revision belongs to the run that produced it ──────────────────────────
// Revise again, then assess a DIFFERENT package. An upload review reproduced
// the failure this pins: the revision map was keyed only by objective id and
// never cleared, so a judgement made about one package attached itself to the
// next one's finding for the same objective — and every export consumed it.
await block.locator('summary').click();
await block.locator('.ex-btn[data-act="revise"]').click();
await block.locator('.ex-edit').waitFor({ state: 'visible', timeout: 15000 });
await block.locator('.ex-edit').fill('ISOLATION PROBE: this conclusion applies only to the bundled sample.');
await block.locator('.ex-select').selectOption('SAT');
await block.locator('.ex-btn[data-act="save"]').click();
await page.waitForFunction(() => document.querySelectorAll('.ex-block.revised').length === 1, null, { timeout: 30000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkae-isolation-'));
const other = path.join(tmp, 'other-package.txt');
fs.writeFileSync(other, 'AC-2 Account Management. Accounts are reviewed quarterly by the ISSO per SSP section 5.2. Most recent scan: 2026-05-28.');
await page.setInputFiles('#ssp-upload-input', [other]);
await page.waitForTimeout(1200);
// Uploading other evidence must already have voided the previous run.
const afterUpload = await page.evaluate(() => ({
  revisions: (typeof ASSESSOR_REVISIONS === 'undefined') ? -1 : ASSESSOR_REVISIONS.size,
  exportState: (typeof ENGINE_LAST_RUN === 'undefined') ? 'undefined' : String(ENGINE_LAST_RUN),
}));

await page.evaluate(() => { const o = document.getElementById('onb-overlay'); if (o) o.remove(); });
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 180000 });
await page.waitForFunction(() => document.querySelectorAll('.ex-block').length > 0, null, { timeout: 60000 });
const carriedOver = await page.locator('.ex-block.revised').count();
const poamOther = await download('poam');

// Revise something on THIS package, so what follows has a revision to lose.
// Without this the two assertions below pass on an already-empty map.
await page.locator('.ex-block').first().locator('summary').click();
await page.locator('.ex-block').first().locator('.ex-btn[data-act="revise"]').click();
await page.locator('.ex-block').first().locator('.ex-edit').waitFor({ state: 'visible', timeout: 15000 });
await page.locator('.ex-block').first().locator('.ex-edit').fill('SELECTION PROBE: this conclusion applies only to the uploaded package.');
await page.locator('.ex-block').first().locator('.ex-select').selectOption('SAT');
await page.locator('.ex-block').first().locator('.ex-btn[data-act="save"]').click();
await page.waitForFunction(() => document.querySelectorAll('.ex-block.revised').length === 1, null, { timeout: 30000 });

// SELECTING a bundled sample is the third way the corpus changes, and the one
// nothing covered: upload and Clear Upload were both pinned here, while the
// rail — where a visitor actually switches packages — was not. It is also the
// path that shipped broken once, so it is worth a check of its own.
await page.click('.ssp-option[data-id="cloudvault"]');
await page.waitForTimeout(400);
const afterSelect = await page.evaluate(() => ({
  files: (typeof CUSTOM_PKG_FILES === 'undefined') ? -1 : CUSTOM_PKG_FILES.length,
  revisions: (typeof ASSESSOR_REVISIONS === 'undefined') ? -1 : ASSESSOR_REVISIONS.size,
  exportState: (typeof ENGINE_LAST_RUN === 'undefined') ? 'undefined' : String(ENGINE_LAST_RUN),
}));

// Clear upload must really clear: the raw File objects are what the corpus
// builder prefers, so leaving them made the button cosmetic. Re-upload first,
// because the selection above already emptied everything — a DIFFERENT file,
// since re-selecting the same path is not a change the input reports.
const again = path.join(tmp, 'third-package.txt');
fs.writeFileSync(again, 'AC-2 Account Management. Account reviews are recorded by the ISSO each quarter per SSP section 5.2.');
await page.setInputFiles('#ssp-upload-input', [again]);
await page.waitForTimeout(1200);
const beforeClear = await page.evaluate(() =>
  (typeof CUSTOM_PKG_FILES === 'undefined') ? -1 : CUSTOM_PKG_FILES.length);
await page.evaluate(() => clearCustomUpload());
await page.waitForTimeout(400);
const afterClear = await page.evaluate(() => ({
  files: (typeof CUSTOM_PKG_FILES === 'undefined') ? -1 : CUSTOM_PKG_FILES.length,
  revisions: (typeof ASSESSOR_REVISIONS === 'undefined') ? -1 : ASSESSOR_REVISIONS.size,
}));

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });

const checks = [
  ['no request left the page (every non-file request aborted)', blocked.length === 0, blocked.slice(0, 2).join(' | ')],
  ['every live finding carries an examine statement', blocks > 0, 'blocks=' + blocks],
  ['statements are collapsed by default', collapsed === blocks, collapsed + '/' + blocks],
  ['the statement uses the SAR examine phrasing', /^During the assessment, the assessor examined /.test(engineStatement.trim()), engineStatement.slice(0, 80)],
  ['the objective is reworded, not quoted as "Determine if"', !/Determine if/i.test(engineStatement), ''],
  ['an unsatisfied objective says "could not confirm"', /could not confirm/.test(engineStatement), engineStatement.slice(0, 80)],
  ['a revision is attributed to the assessor on screen', /engine verdict/.test(flag), flag.trim()],
  ['exactly one OSCAL finding is marked assessor-revised', revised.length === 1, 'n=' + revised.length],
  ['the revised objective reads satisfied', revised[0] && revised[0].target.status.state === 'satisfied', revised[0] && revised[0].target.status.state],
  ['the engine determination is preserved beside it', props['engine-determination'] === 'Other Than Satisfied', props['engine-determination']],
  ['the assessor determination is recorded', props['assessor-determination'] === 'Satisfied', props['assessor-determination']],
  ['the assessor statement travels as remarks', /interview record/.test((revised[0] || {}).remarks || ''), ''],
  ['no unrevised finding carries revision props', findingsOf(arAfter).filter(f => (f.props || []).some(p => p.name === 'assessor-determination')).length === 1, ''],
  ['a satisfied revision leaves the POA&M', rows(poamAfter) === rows(poamBefore) - 1, rows(poamBefore) + ' → ' + rows(poamAfter)],
  ['a satisfied revision leaves the RET', rows(retAfter) === rows(retBefore) - 1, rows(retBefore) + ' → ' + rows(retAfter)],
  ['the summary states the revision count', /Assessor revisions: 1 objective/.test(summary), (summary.match(/Assessor revisions:.*/) || [''])[0].slice(0, 70)],
  ['the OSCAL receipt still attests the ENGINE run', receiptProps(arBefore) === receiptProps(arAfter), ''],
  ['the receipt strip on screen is unchanged', receiptBefore === receiptAfter, ''],
  ['reverting restores the engine determination', rows(poamReverted) === rows(poamBefore), rows(poamBefore) + ' → ' + rows(poamReverted)],
  ['uploading other evidence voids the previous run', afterUpload.revisions === 0 && afterUpload.exportState === 'null',
    'revisions=' + afterUpload.revisions + ' exportState=' + afterUpload.exportState],
  ['a revision does not carry into another package', carriedOver === 0, 'revised rows=' + carriedOver],
  ["the other package's POA&M is its own", poamOther !== poamAfter, ''],
  ['selecting a bundled sample drops the upload, its revision and the export state',
    afterSelect.files === 0 && afterSelect.revisions === 0 && afterSelect.exportState === 'null',
    'files=' + afterSelect.files + ' revisions=' + afterSelect.revisions + ' exportState=' + afterSelect.exportState],
  ['clear upload drops the raw files and the revisions',
    beforeClear === 1 && afterClear.files === 0 && afterClear.revisions === 0,
    'files ' + beforeClear + ' \u2192 ' + afterClear.files + ', revisions=' + afterClear.revisions],
  ['no page or console errors', errors.length === 0, errors.slice(0, 2).join(' | ')],
];

let failures = 0;
for (const [name, pass, detail] of checks) {
  if (!pass) failures++;
  console.log((pass ? '  ok   ' : '  FAIL ') + name + (pass || !detail ? '' : '  → ' + detail));
}
console.log(failures ? '\n' + failures + ' check(s) FAILED' : '\nall assessor checks passed');
process.exit(failures ? 1 : 0);
