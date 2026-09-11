#!/usr/bin/env node
// SparkAE public reference build — the live demo's selections.
//
// browser.mjs asks whether the engine computes what the golden fixture pins,
// and assessor.mjs asks what an assessor's revision reaches. Neither drives the
// controls a visitor actually clicks, and that is where this page went wrong:
// selections that were offered and then did nothing, or did something other
// than their label. This walks every one of them and asks the same question of
// each — does this selection do what it says?
//
//   * each of the nine use-case tabs switches the console to its own
//     configuration: run button, idle title, rail Mode and Output
//   * a rail entry with no document set says so before Run is pressed, and §01
//     stops by naming the system rather than reporting an absent corpus
//   * the rail's own baseline figures agree with the catalog it ships
//   * every filter chip on offer matches at least one row of the run that
//     produced it, and every value in that run is on offer
//   * a filter changed while rows are still painting leaves none of the
//     previous selection's rows behind
//   * the count beside the filters keeps one meaning
//   * an empty result says which selection emptied it
//   * §09 does not tell a visitor to click something that is not clickable
//
// Needs Playwright (npm i playwright && npx playwright install chromium).
// Usage:  node tests/selections.mjs [site-root]
//   env PLAYWRIGHT_MODULE  path to the playwright package (default: resolve 'playwright')
//   env CHROMIUM           path to a Chromium binary (default: Playwright's own)
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));
const url = 'file://' + path.join(root, 'demo-standalone.html');

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE || require.resolve('playwright');
const pw = await import(pwPath);
const chromium = pw.chromium || (pw.default && pw.default.chromium);
if (!chromium) throw new Error('playwright: chromium export not found at ' + pwPath);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/*', route =>
  route.request().url().startsWith('file://') ? route.continue() : route.abort());

const checks = [];
const check = (msg, pass, detail = '') => checks.push([msg, pass, detail]);

const dismissOnboarding = () =>
  page.evaluate(() => { const o = document.getElementById('onb-overlay'); if (o) o.remove(); });

// A check whose element is missing has to fail, not throw.
const displayOf = (sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  return el ? getComputedStyle(el).display : 'missing';
}, sel);
const textOf = (sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}, sel);

// The painter lands rows in batches, so a fixed delay reads a half-painted
// table. Wait for the row count to stop moving instead.
const settle = () => page.waitForFunction(() => {
  const n = document.querySelectorAll('#findings-body tr').length;
  const done = window.__selN === n;
  window.__selN = n;
  return done;
}, null, { timeout: 90000, polling: 250 });

const runTab = async (uc) => {
  await page.goto(url);
  await dismissOnboarding();
  await page.click(`.uc-tab[data-uc="${uc}"]`);
  await page.click('#run-btn');
  await page.waitForFunction(
    () => /COMPLETE|WALKTHROUGH|STOPPED/.test(document.getElementById('console-status').textContent),
    null, { timeout: 240000 });
  await settle();
};

const table = () => page.evaluate(() => ({
  rows: Array.from(document.querySelectorAll('#findings-body tr')).map(tr => ({
    verdict: (tr.querySelector('.verdict-tag') || {}).textContent || '',
    method: (tr.querySelector('.method-tag') || {}).textContent || '',
    empty: tr.classList.contains('findings-empty'),
  })),
  count: document.getElementById('filter-count').textContent,
  groups: Array.from(document.querySelectorAll('#filter-groups > .filter-group')).map(g => ({
    label: g.querySelector('.filter-group-label').textContent,
    chips: Array.from(g.querySelectorAll('.filter-chip')).map(c => ({
      value: c.dataset.value, text: c.textContent.trim(),
    })),
    only: (g.querySelector('.filter-only') || {}).textContent || null,
  })),
  // A top-level `let` in a classic script is reachable here by name, but is
  // not a property of window.
  total: currentFindings.length,
}));

// ── 1 · Every tab switches the console to its own configuration ─────────
// One tab used to leave the previous tab's run button, and the console carried
// a hidden §03-labelled "Annual Reassessment · in private preview" panel for a
// section that is neither §03 nor in preview.
await page.goto(url);
await dismissOnboarding();
const TABS = await page.$$eval('.uc-tab', els => els.map(e => e.dataset.uc));
check('the console offers nine use cases', TABS.length === 9, TABS.join(','));
const tabMismatch = [];
for (const uc of TABS) {
  await page.click(`.uc-tab[data-uc="${uc}"]`);
  const bad = await page.evaluate(u => {
    const cfg = USE_CASES[u];
    const strip = s => s.replace(/\s*→\s*$/, '').trim();
    const wrong = [];
    if (strip(document.getElementById('run-btn').textContent) !== cfg.runBtnLabel) wrong.push('run button');
    if (document.getElementById('idle-title').textContent !== cfg.idleTitle) wrong.push('idle title');
    if (document.getElementById('stat-mode').textContent !== cfg.railMode) wrong.push('rail mode');
    if (document.getElementById('stat-output').textContent !== cfg.railOutput) wrong.push('rail output');
    if (document.querySelectorAll('.uc-tab.active').length !== 1) wrong.push('active tab count');
    if (!document.querySelector(`.uc-tab[data-uc="${u}"]`).classList.contains('active')) wrong.push('active tab');
    return wrong;
  }, uc);
  if (bad.length) tabMismatch.push(uc + ': ' + bad.join(', '));
}
check('each tab sets its own run button, idle title, rail mode and rail output',
  tabMismatch.length === 0, tabMismatch.join(' | '));

// ── 2 · A rail entry §01 cannot assess says so, before and during ───────
// The rail lists the systems the walkthroughs are written about beside the one
// sample this build ships documents for. §01 is the tab a visitor lands on, and
// picking the other one used to end in "nothing to assess: no upload and no
// bundled document set" — the absence of a corpus, reported as an outcome.
await page.goto(url);
await dismissOnboarding();
const noteAtRest = await displayOf('#rail-note');
check('§01 with the bundled sample shows no rail warning',
  noteAtRest === 'none' || noteAtRest === 'missing', noteAtRest);

await page.click('.ssp-option[data-id="meshgate"]');
const walkOnly = {
  display: await displayOf('#rail-note'),
  text: await textOf('#rail-note'),
  badge: await textOf('.ssp-option[data-id="meshgate"] .uc-badge'),
  name: await textOf('.ssp-option[data-id="meshgate"] .ssp-name'),
};
check('a rail entry §01 cannot assess is flagged before Run is pressed',
  walkOnly.display !== 'none' && walkOnly.display !== 'missing' && /no document set/i.test(walkOnly.text) &&
  walkOnly.text.includes('CloudVault Storage Platform'),
  walkOnly.display + ' | ' + walkOnly.text.slice(0, 120));
check('the rail entry itself names the sections it is for',
  /§02.{0,3}§09/.test(walkOnly.badge), walkOnly.name);

await page.click('#run-btn');
await page.waitForFunction(() => /STOPPED/.test(document.getElementById('console-status').textContent),
  null, { timeout: 30000 }).catch(() => {});
const stopped = await page.evaluate(() => ({
  status: document.getElementById('console-status').textContent.trim(),
  log: document.getElementById('log').textContent.replace(/\s+/g, ' ').trim(),
}));
check('the stop names the system rather than reporting an absent corpus',
  stopped.status.includes('MeshGate Identity Service') &&
  !/no upload and no bundled document set/.test(stopped.log),
  stopped.status);
check('the stop says what to do next',
  /CloudVault Storage Platform/.test(stopped.log) && /upload/.test(stopped.log),
  stopped.log.slice(0, 160));

await page.click('.uc-tab[data-uc="conmon"]');
const noteOnWalkthrough = await displayOf('#rail-note');
check('the warning is gone on the sections that entry is for', noteOnWalkthrough === 'none', noteOnWalkthrough);

// ── 3 · The rail's own baselines agree with the catalog it ships ────────
// The rail said FedRAMP Moderate was 325 controls on one line and 323 on the
// line above it, because one of them was authored and the other is computed.
const railBaselines = await page.evaluate(() => {
  const read = () => document.getElementById('cv-meta').textContent;
  const out = { computed: {}, authored: [] };
  for (const b of ['Low', 'Moderate', 'High']) {
    const sel = document.getElementById('engine-profile');
    sel.value = b;
    sel.dispatchEvent(new Event('change'));
    out.computed[b] = +/(\d+) controls/.exec(read())[1];
  }
  document.querySelectorAll('.ssp-option:not(.ssp-upload) .ssp-meta').forEach(el => {
    const m = /FedRAMP (Low|Moderate|High) · (\d+) controls/.exec(el.textContent);
    if (m) out.authored.push({ baseline: m[1], controls: +m[2] });
  });
  return out;
});
const railDrift = railBaselines.authored.filter(a => railBaselines.computed[a.baseline] !== a.controls);
check('every control count in the rail is the one this catalog yields',
  railDrift.length === 0,
  railDrift.map(d => d.baseline + ': rail ' + d.controls + ' vs catalog ' + railBaselines.computed[d.baseline]).join(', '));

// ── 4 · Every chip matches something, and everything is on offer ────────
// The bar was a fixed Examine · Interview · Test / SAT · OTS · NR · PASS row
// whatever the run held. §01 is EXAMINE-only by construction and says so, yet
// offered Interview and Test — both of which emptied the table without a word.
// §06's findings all carry method QA, which no chip named at all.
const chipFaults = [];
for (const uc of TABS) {
  await runTab(uc);
  const t = await table();
  if (!t.rows.length) continue;                        // a tab that paints no table
  for (const spec of [{ dim: 'verdict', label: 'Verdict' }, { dim: 'method', label: 'Method' }]) {
    const present = await page.evaluate(d => [...new Set(currentFindings.map(f => f[d]))], spec.dim);
    const group = t.groups.find(g => g.label === spec.label);
    if (!group) { chipFaults.push(`${uc}/${spec.dim}: no group`); continue; }
    if (present.length === 1) {
      if (group.chips.length) chipFaults.push(`${uc}/${spec.dim}: one value, ${group.chips.length} chips`);
      if (!group.only) chipFaults.push(`${uc}/${spec.dim}: one value, not stated`);
      continue;
    }
    const offered = group.chips.map(c => c.value).filter(v => v !== 'all');
    const missing = present.filter(v => !offered.includes(v));
    const inert = offered.filter(v => !present.includes(v));
    if (missing.length) chipFaults.push(`${uc}/${spec.dim}: not offered ${missing.join(',')}`);
    if (inert.length) chipFaults.push(`${uc}/${spec.dim}: offered but unmatchable ${inert.join(',')}`);
    // And each one does what its label says.
    for (const v of offered) {
      await page.click(`.filter-chip[data-filter="${spec.dim}"][data-value="${v}"]`);
      await settle();
      const after = await table();
      const wrong = after.rows.filter(r => !r.empty && r[spec.dim].trim() !== v);
      if (!after.rows.length) chipFaults.push(`${uc}/${spec.dim}=${v}: painted nothing`);
      if (wrong.length) chipFaults.push(`${uc}/${spec.dim}=${v}: ${wrong.length} row(s) of another value`);
    }
    await page.click(`.filter-chip[data-filter="${spec.dim}"][data-value="all"]`);
    await settle();
  }
}
check('every filter chip offered matches rows of its own value, and every value in the run is offered',
  chipFaults.length === 0, chipFaults.join(' | '));

// ── 5 · A filter changed mid-paint leaves nothing of the last one ───────
// Both painters clear the table and append from timers, and nothing cancelled
// the timers of the paint they replaced. Choosing SAT and then OTS half a
// second later left the SAT rows sitting under the OTS heading.
await page.goto(url);
await dismissOnboarding();
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 300000 });
await settle();
await page.click('.filter-chip[data-filter="verdict"][data-value="SAT"]');
await page.waitForTimeout(150);
await page.click('.filter-chip[data-filter="verdict"][data-value="OTS"]');
await settle();
const midPaint = await table();
const strays = midPaint.rows.filter(r => r.verdict.trim() !== 'OTS');
check('a filter changed while rows are still painting leaves none of the previous selection behind',
  midPaint.rows.length > 0 && strays.length === 0,
  strays.length + ' stray row(s) of ' + midPaint.rows.length + ': ' + [...new Set(strays.map(r => r.verdict))].join(','));

// ── 6 · The count beside the filters keeps one meaning ──────────────────
// It read "120 of 383 findings shown" when the painter capped the rows and
// "1 of 981 findings shown" when it did not — painted-of-matched in one case,
// matched-of-total in the other, so filtering to SAT reported a smaller run.
const counts = {};
counts.ots = midPaint.count;
await page.click('.filter-chip[data-filter="verdict"][data-value="NR"]');
await settle();
counts.nr = (await table()).count;
await page.click('.filter-chip[data-filter="verdict"][data-value="all"]');
await settle();
const all = await table();
counts.all = all.count;
const totalOf = s => { const m = /(\d[\d,]*) (?:findings? in this run|of (\d[\d,]*) match)/.exec(s); return m ? +(m[2] || m[1]).replace(/,/g, '') : -1; };
check('the count names the same run total under every filter',
  totalOf(counts.all) === all.total && totalOf(counts.ots) === all.total && totalOf(counts.nr) === all.total,
  JSON.stringify(counts) + ' vs total ' + all.total);
check('the count says how many are painted when the painter caps them',
  /^\d+ shown · /.test(counts.all) && all.rows.length < all.total,
  counts.all + ' | painted ' + all.rows.length + ' of ' + all.total);

// ── 7 · An empty result says which selection emptied it ─────────────────
// An empty table is indistinguishable from a broken one.
const empty = await page.evaluate(() => {
  filters = { method: 'INTERVIEW', verdict: 'SAT' };
  applyFilters();
  const tr = document.querySelector('#findings-body tr');
  return { html: tr ? tr.textContent.replace(/\s+/g, ' ').trim() : '(no row)', rows: document.querySelectorAll('#findings-body tr').length };
});
check('a selection that matches nothing says so, and names itself',
  empty.rows === 1 && /Method Interview/.test(empty.html) && /Verdict SAT/.test(empty.html),
  empty.html.slice(0, 140));

// ── 8 · §09 does not point at an affordance that is not there ───────────
// "Click any connector card to view its schema mapping" — the cards carry no
// handler and no pointer cursor; the mapping is behind the link inside them.
await page.goto(url);
await page.click('.uc-tab[data-uc="src"]');
const connectorCopy = await page.evaluate(() =>
  document.getElementById('idle-copy').textContent + ' ' +
  Array.from(document.querySelectorAll('.onb-note, .onb-body, .onb-conn-cat')).map(e => e.textContent).join(' '));
await runTab('src');
const connectors = await page.evaluate(copy => {
  const cards = Array.from(document.querySelectorAll('.connector-card'));
  return {
    cards: cards.length,
    clickable: cards.filter(c => c.getAttribute('onclick') || getComputedStyle(c).cursor === 'pointer').length,
    withAction: cards.filter(c => c.querySelector('.connector-action')).length,
    copy: copy + ' ' + document.body.innerText,
  };
}, connectorCopy);
check('§09 gives every connector card the link its copy points at',
  connectors.cards > 0 && connectors.withAction === connectors.cards,
  connectors.withAction + ' of ' + connectors.cards);
check('§09 does not tell a visitor to click a card that is not clickable',
  connectors.clickable === connectors.cards || !/click (any|the) connector/i.test(connectors.copy),
  connectors.clickable + ' of ' + connectors.cards + ' cards clickable');

await browser.close();

check('no page or console errors', errors.length === 0, errors.join(' | '));

let failures = 0;
for (const [msg, pass, detail] of checks) {
  if (!pass) failures++;
  console.log((pass ? '  ok   ' : '  FAIL ') + msg + (pass || !detail ? '' : ' — ' + detail));
}
console.log(failures ? `\n${failures} selection check(s) FAILED` : '\nall selection checks passed');
process.exit(failures ? 1 : 0);
