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
// Rows paint in batches; wait for the statements rather than for a clock.
await page.waitForFunction(() => document.querySelectorAll('.ex-block').length > 0, null, { timeout: 60000 });

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

const blocks = await page.locator('.ex-block').count();
const collapsed = await page.locator('.ex-block:not([open])').count();

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

await browser.close();

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
  ['no page or console errors', errors.length === 0, errors.slice(0, 2).join(' | ')],
];

let failures = 0;
for (const [name, pass, detail] of checks) {
  if (!pass) failures++;
  console.log((pass ? '  ok   ' : '  FAIL ') + name + (pass || !detail ? '' : '  → ' + detail));
}
console.log(failures ? '\n' + failures + ' check(s) FAILED' : '\nall assessor checks passed');
process.exit(failures ? 1 : 0);
