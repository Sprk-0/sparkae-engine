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
import zlib from 'node:zlib';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));
const golden = JSON.parse(fs.readFileSync(path.join(here, 'golden', 'sample-ssp.expected.json'), 'utf8'));

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE || require.resolve('playwright');
// `require.resolve` yields Playwright's CommonJS entry, and a dynamic import of
// a CommonJS module exposes its exports under `default`; the ESM entry
// (index.mjs) exposes them by name. Accept either.
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

const dismissOnboarding = () => page.evaluate(() => { const o = document.getElementById('onb-overlay'); if (o) o.remove(); });

// paintFindings lands rows in staggered batches (up to ENGINE_ROW_CAP at a
// time, with the remainder behind a control), so the table is still painting
// when #results.show appears. Until it stops, the document keeps growing under
// Playwright's feet: it scrolls #run-btn into view, the next batch re-lays out,
// the button leaves the viewport, and the click retries until it times out.
// That is what an "element is outside of the viewport" timeout on a SECOND run
// means. Wait for the row count to stop moving before touching the page again.
//
// This deliberately does not swallow its own timeout. A table that never
// settles is a hang worth failing on, and catching it here would restore the
// flakiness the wait exists to remove.
const settleFindings = () => page.waitForFunction(() => {
  const n = document.querySelectorAll('.findings-table .verdict-tag').length;
  const settled = n > 0 && window.__bSettle === n;
  window.__bSettle = n;
  return settled;
}, null, { timeout: 120000, polling: 300 });

await page.goto('file://' + path.join(root, 'demo-standalone.html'));
const date = await page.inputValue('#assessment-date');
const mode = await page.textContent('#stat-mode');

// An assessment is a claim about a specific package as of a specific day. This
// page used to start one half a second after load, so a visitor arriving from
// anywhere met a finished assessment of a package they had not chosen. Give it
// well past that old half-second and confirm the engine is still idle.
await page.waitForTimeout(1500);
const idle = await page.evaluate(() => ({
  status: (document.getElementById('console-status') || {}).textContent || '',
  resultsShown: !!document.querySelector('#results.show'),
  runState: ((document.getElementById('run-state') || {}).style || {}).display || '',
  logLines: (document.getElementById('log') || { children: [] }).children.length,
  btn: (document.getElementById('run-btn') || {}).textContent || '',
}));

await dismissOnboarding();
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 180000 });
await settleFindings();
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
await settleFindings();
const log2 = await page.textContent('#log');
const refused = await page.textContent('.live-refused').catch(() => '');

// ── one ingestion ───────────────────────────────────────────────────────────
// A package is a ZIP, and a ZIP is what the panel used to choke on: it expanded
// with JSZip, which this page never loads, so an ordinary archive produced
// "JSZip library failed to load — cannot unpack .zip packages" while the engine
// read the very same file and assessed it. These drive the real page, because
// that contradiction lived entirely between two ingestion paths and neither
// path was wrong on its own.
//
// The fixtures are built here rather than committed so they cannot drift, and
// the DOCX is deflated exactly as Word writes one.
const CRC_T = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
const crc32b = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipOf(members) {
  const local = [], central = [];
  let offset = 0;
  for (const m of members) {
    const name = Buffer.from(m.name, 'utf8');
    // A ZIP's CRC-32 covers a member's UNCOMPRESSED bytes, so those are what
    // this takes and it compresses them itself. Handing it a ready-made
    // deflate stream and recording a CRC of that produces an archive no
    // conforming reader accepts — a fixture that passes here and nowhere else.
    const source = m.bytes || Buffer.from(m.text, 'utf8');
    const deflate = !!m.deflate;
    const data = deflate ? zlib.deflateRawSync(source, { level: 9 }) : source;
    const method = deflate ? 8 : 0;
    const uncomp = source.length;
    const crc = crc32b(source);
    const lh = Buffer.alloc(30 + name.length);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(uncomp, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28); name.copy(lh, 30);
    local.push(lh, data);
    const ch = Buffer.alloc(46 + name.length);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(uncomp, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42); name.copy(ch, 46);
    central.push(ch);
    offset += lh.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(members.length, 8); eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, cd, eocd]);
}

const SSP_BODY = 'AC-2 Account Management. Account use is monitored continuously by the ISSO per SSP section 5.2. Most recent scan: 2026-05-28. Reference: CloudVault-SSP.';
const DOCX_XML = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>' + SSP_BODY + '</w:t></w:r></w:p></w:body></w:document>';
const docxBytes = zipOf([
  { name: '[Content_Types].xml', text: '<Types/>' },
  { name: 'word/document.xml', text: DOCX_XML, deflate: true },
]);
// The ordinary shape of a real submission: the SSP is a Word file, in a ZIP.
fs.writeFileSync(path.join(tmp, 'package.zip'), zipOf([
  { name: 'README.txt', text: 'This package contains the system security plan.' },
  { name: 'CloudVault-SSP.docx', bytes: docxBytes },
]));
await page.setInputFiles('#ssp-upload-input', [path.join(tmp, 'package.zip')]);
await page.waitForTimeout(1200);
const zipPanel = await page.evaluate(() => ({
  name: (document.querySelector('#ssp-upload-btn .ssp-name') || {}).textContent || '',
  meta: (document.querySelector('#ssp-upload-btn .ssp-meta') || {}).textContent || '',
  status: (document.getElementById('ssp-upload-status') || {}).textContent || '',
  files: Array.from(document.querySelectorAll('.upload-file')).map(e => e.textContent),
  bound: typeof CUSTOM_PKG_FILES === 'undefined' ? -1 : CUSTOM_PKG_FILES.length,
}));
await dismissOnboarding();
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 180000 });
await settleFindings();
const zipLog = await page.textContent('#log');
const zipRefused = await page.textContent('.live-refused').catch(() => '');

// A .zip that is not a ZIP: the panel must fail AND leave nothing runnable.
fs.writeFileSync(path.join(tmp, 'broken.zip'), 'this is not a zip at all');
await page.setInputFiles('#ssp-upload-input', [path.join(tmp, 'broken.zip')]);
await page.waitForTimeout(900);
const brokenPanel = await page.evaluate(() => ({
  name: (document.querySelector('#ssp-upload-btn .ssp-name') || {}).textContent || '',
  status: (document.getElementById('ssp-upload-status') || {}).textContent || '',
  bound: typeof CUSTOM_PKG_FILES === 'undefined' ? -1 : CUSTOM_PKG_FILES.length,
}));

// A file name is text the visitor did not write. The upload inventory renders
// it, and rendered it by string concatenation into innerHTML until a package
// named like an <img> with an error handler ran that handler on the live site.
// Escaped, the name must still be shown — a hostile name is worth seeing — but
// as text, never as markup.
const XSS_NAME = '<img src=x onerror="document.documentElement.setAttribute(\'data-upload-audit\',\'1\')">.txt';
fs.writeFileSync(path.join(tmp, XSS_NAME), 'AC-2 Account Management. Accounts are reviewed quarterly.');
await page.setInputFiles('#ssp-upload-input', [path.join(tmp, XSS_NAME)]);
await page.waitForTimeout(1200);
const xss = await page.evaluate(() => ({
  fired: document.documentElement.getAttribute('data-upload-audit'),
  injected: document.querySelectorAll('#ssp-upload-status img, .upload-file img').length,
  shownAsText: Array.from(document.querySelectorAll('.upload-file'))
    .some(el => el.textContent.includes('onerror')),
}));

// ── §09 Data Sources ────────────────────────────────────────────────────
// The connector matrix used to badge two connectors ● LIVE and print coverage
// percentages, artifact counts and last-sync timestamps for connections that do
// not exist — and the run emitted 3PAO-style observations citing them, with a
// recommendation to "continue current sync cadence". None of it was real, and
// it contradicted this page's own statement that no connector runs here.
await page.reload();
await dismissOnboarding();
await page.click('.uc-tab[data-uc="src"]');
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 120000 });
await settleFindings();
// paintFindings lands rows in staggered batches, so a fixed delay reads a
// half-painted table and can undercount the very rows this is looking for —
// a check that passes because it looked too early is worse than no check.
// Wait for the row count to stop moving instead of for a clock.
await page.waitForFunction(() => {
  const n = document.querySelectorAll('.findings-table .verdict-tag').length;
  const settled = n > 0 && window.__srcSettleCount === n;
  window.__srcSettleCount = n;
  return settled;
}, null, { timeout: 60000, polling: 300 });
const srcPanel = await page.evaluate(() => ({
  note: (document.querySelector('.connector-note') || {}).textContent || '',
  // innerText is what a person reads; innerHTML would include inline script source.
  text: document.body.innerText,
  satRows: Array.from(document.querySelectorAll('.findings-table .verdict-tag'))
    .filter(e => /SAT/.test(e.textContent)).length,
  totalRows: document.querySelectorAll('.findings-table .verdict-tag').length,
}));
const SRC_TEXT = ['● LIVE', '% coverage', 'last sync', 'sync cadence', 'artifacts indexed']
  .map(needle => ({ needle, present: srcPanel.text.includes(needle) }));

// ── every walkthrough says it is one ───────────────────────────────────────
// Seven tabs are covered here. §09 (src) is the eighth walkthrough and has its
// own status and dedicated checks above, so it is deliberately not in this list.
// Each of these completed with a status a visitor could screenshot as a result:
// "ConMon package ready for JAB", "AAR ready for Authorizing Official". The only
// disclosure was an 8px badge in the tab nav. §08 also asserted "4 systems"
// against a SAMPLES map holding two, contradicting the matrix beside it and its
// own "2 ready" in the same line.
const WALKTHROUGH_TABS = ['conmon', 'annual', 'scr', 'qa', 'ksi', 'pkg', 'portfolio'];
const walkResults = [];
for (const uc of WALKTHROUGH_TABS) {
  await page.goto('file://' + path.join(root, 'demo-standalone.html'));
  await dismissOnboarding();
  const found = await page.evaluate(u => {
    const t = document.querySelector(`.uc-tab[data-uc="${u}"]`);
    if (!t) return false; t.click(); return true;
  }, uc);
  if (!found) { walkResults.push({ uc, missing: true }); continue; }
  await page.click('#run-btn');
  await page.waitForFunction(
    () => /COMPLETE|WALKTHROUGH/.test(document.getElementById('console-status').textContent),
    null, { timeout: 180000 });
  walkResults.push(Object.assign({ uc }, await page.evaluate(() => ({
    status: document.getElementById('console-status').textContent.trim(),
    log: document.getElementById('log').textContent,
  }))));
}
const undisclosed = walkResults.filter(r => r.missing ||
  !/(authored, not computed from evidence|seeded from your package)/.test(r.log || '') ||
  !/walkthrough/i.test(r.status || ''));
// §08's own numbers have to agree with each other.
// The disclosure has to be true of the run that is happening. With a package
// uploaded, these tabs seed their figures from a hash of the visitor's file
// names — so "authored sample data" would be the wrong sentence in the one case
// where a visitor is most likely to read the numbers as their own.
await page.goto('file://' + path.join(root, 'demo-standalone.html'));
await dismissOnboarding();
await page.setInputFiles('#ssp-upload-input', [path.join(tmp, 'ssp.txt')]);
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelector('.uc-tab[data-uc="conmon"]').click());
await page.click('#run-btn');
await page.waitForFunction(
  () => /COMPLETE|WALKTHROUGH/.test(document.getElementById('console-status').textContent),
  null, { timeout: 180000 });
const uploadedNotice = await page.evaluate(() => document.getElementById('log').textContent);

const pf = walkResults.find(r => r.uc === 'portfolio') || {};
const pfM = /(\d+) systems? · (\d+) ready · (\d+) minor · (\d+) material/.exec(pf.status || '');
const pfConsistent = !!pfM && (+pfM[1] === +pfM[2] + +pfM[3] + +pfM[4]);

// ── a refused member name is text ──────────────────────────────────────────
// The success path has escaped file names since the first XSS fix. The ERROR
// path did not: err.message went into innerHTML, and that message names the
// member that could not be read. So a package whose members are all refused
// executed its own filename — and the message carrying it was the one added to
// report that nothing was readable. Two members of one name are refused as
// ambiguous, which is the cheapest way to reach that path.
const XSS_MEMBER = '<img src=x onerror="document.documentElement.setAttribute(\'data-refused-audit\',\'1\')">.bin';
fs.writeFileSync(path.join(tmp, 'hostile-refused.zip'), zipOf([
  { name: XSS_MEMBER, text: 'a' }, { name: XSS_MEMBER, text: 'b' },
]));
await page.goto('file://' + path.join(root, 'demo-standalone.html'));
await dismissOnboarding();
await page.setInputFiles('#ssp-upload-input', [path.join(tmp, 'hostile-refused.zip')]);
await page.waitForTimeout(1200);
const refusedXss = await page.evaluate(() => ({
  fired: document.documentElement.getAttribute('data-refused-audit'),
  injected: document.querySelectorAll('#ssp-upload-status img, .upload-file img').length,
  shownAsText: /img src=x onerror/.test((document.getElementById('ssp-upload-status') || {}).textContent || ''),
  bound: typeof CUSTOM_PKG_FILES === 'undefined' ? -1 : CUSTOM_PKG_FILES.length,
}));

// ── selecting a sample means assessing that sample ─────────────────────────
// The uploaded package stayed bound when a bundled sample was selected, and
// engineCorpus prefers it, so choosing CloudVault re-assessed the upload under
// CloudVault's pinned date: the visitor's evidence, dated to a document they
// did not choose.
await page.goto('file://' + path.join(root, 'demo-standalone.html'));
await dismissOnboarding();
await page.setInputFiles('#ssp-upload-input', [path.join(tmp, 'ssp.txt')]);
await page.waitForTimeout(900);
const boundAfterUpload = await page.evaluate(() => (typeof CUSTOM_PKG_FILES === 'undefined' ? -1 : CUSTOM_PKG_FILES.length));
await page.evaluate(() => document.querySelector('.ssp-option[data-id="cloudvault"]').click());
await page.waitForTimeout(400);
const afterSelect = await page.evaluate(() => ({
  bound: typeof CUSTOM_PKG_FILES === 'undefined' ? -1 : CUSTOM_PKG_FILES.length,
  date: document.getElementById('assessment-date').value,
  panelHidden: ((document.getElementById('ssp-upload-status') || {}).style || {}).display === 'none',
}));
await page.click('#run-btn');
await page.waitForSelector('#results.show', { timeout: 180000 });
await settleFindings();
const selectedRunLog = await page.textContent('#log');

// ── the artifact inventory is an inventory ─────────────────────────────────
// classifyFile matches on file NAMES. The panel rendered those matches as
// determinations — "OTS finding · CA-5" against POA&M, "critical · NR finding ·
// PL-2" against SSP — so a package missing a file called poam.xlsx was told an
// objective had been adjudicated. Nothing there adjudicates anything.
await page.goto('file://' + path.join(root, 'demo-standalone.html'));
await dismissOnboarding();
await page.setInputFiles('#ssp-upload-input', [path.join(tmp, 'ssp.txt')]);
await page.waitForTimeout(1000);
const inventory = await page.evaluate(() => {
  const t = (document.getElementById('ssp-upload-status') || {}).textContent || '';
  return {
    claimsFinding: /(OTS|NR)\s+finding/i.test(t),
    saysNotFound: /not found/.test(t),
    saysWouldInform: /would inform/.test(t),
    disclaims: /not an assessment/i.test(t) && /file names, not contents/i.test(t),
  };
});

// The rail is position:sticky at top:80. A sticky element taller than the space
// it sticks in strands its own contents: at 781px in a 720px viewport it pinned
// at 80 and its last 141px — which is where the Run button sits — could not be
// scrolled to by anything, including scrollIntoView. A visitor on a laptop could
// not press Run again after a run. Assert the primary control is reachable once
// the page is at its tallest.
const railReach = await page.evaluate(() => {
  const b = document.getElementById('run-btn');
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  const rail = document.querySelector('.rail');
  const rr = rail ? rail.getBoundingClientRect() : null;
  return {
    inView: r.top >= 0 && r.bottom <= innerHeight,
    btnTop: Math.round(r.top), vh: innerHeight,
    railH: rr ? Math.round(rr.height) : null,
    railTop: rr ? Math.round(rr.top) : null,
  };
});

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
  ['a file name cannot execute: no handler ran', xss.fired === null, 'data-upload-audit=' + xss.fired],
  ['a file name cannot execute: no element was injected', xss.injected === 0, 'img count=' + xss.injected],
  ['a hostile file name is still shown, as text', xss.shownAsText, ''],
  ['the artifact inventory claims no determination',
    !inventory.claimsFinding, 'panel still says "OTS/NR finding"'],
  ['a missing artifact is reported as missing, with the control it would inform',
    inventory.saysNotFound && inventory.saysWouldInform, JSON.stringify(inventory)],
  ['the inventory says it is matched on names and is not an assessment',
    inventory.disclaims, JSON.stringify(inventory)],
  ['a REFUSED member name cannot execute: no handler ran',
    refusedXss.fired === null, 'data-refused-audit=' + refusedXss.fired],
  ['a REFUSED member name cannot execute: no element was injected',
    refusedXss.injected === 0, 'img count=' + refusedXss.injected],
  ['a refused member name is still shown, as text', refusedXss.shownAsText, ''],
  ['an upload nothing could be read from binds nothing', refusedXss.bound === 0, String(refusedXss.bound)],
  ['selecting a bundled sample releases the uploaded package',
    boundAfterUpload === 1 && afterSelect.bound === 0,
    'bound after upload ' + boundAfterUpload + ', after selecting ' + afterSelect.bound],
  ['selecting CloudVault restores its pinned date and clears the upload panel',
    afterSelect.date === golden.assessment_date && afterSelect.panelHidden,
    'date ' + afterSelect.date + ', panel hidden ' + afterSelect.panelHidden],
  ['a run after selecting CloudVault reads CloudVault, not the upload',
    /CloudVault-Federal-SSP\.txt/.test(selectedRunLog) && !/Uploaded package/.test(selectedRunLog), ''],
  ['the Run button can be scrolled to after a run — the sticky rail does not strand it',
    railReach.inView,
    'button top ' + railReach.btnTop + ' in viewport ' + railReach.vh +
    '; rail ' + railReach.railH + 'px at top ' + railReach.railTop],
  ['the seven §02\u2013§08 walkthroughs each say so in the run, not only in the tab badge',
    walkResults.length === WALKTHROUGH_TABS.length && undisclosed.length === 0,
    'undisclosed: ' + JSON.stringify(undisclosed.map(r => r.uc + (r.missing ? ' (tab missing)' : ': ' + r.status)))],
  ['a walkthrough run on an uploaded package does not call it sample data',
    /seeded from your package/.test(uploadedNotice) &&
    !/authored sample data/.test(uploadedNotice),
    uploadedNotice.slice(0, 200).replace(/\s+/g, ' ')],
  ['\u00a708 reports the systems it actually rolled up',
    pfConsistent, pf.status || '(no status)'],
  ['§09 shows no telemetry for connectors that do not exist',
    !SRC_TEXT.some(n => n.present),
    SRC_TEXT.filter(n => n.present).map(n => n.needle).join(', ')],
  ['§09 says on the panel itself that none of these connectors run',
    /None of these connectors run/i.test(srcPanel.note), srcPanel.note.slice(0, 80)],
  ['§09 gives no connector a Satisfied determination',
    srcPanel.totalRows > 0 && srcPanel.satRows === 0,
    'SAT rows=' + srcPanel.satRows + ' of ' + srcPanel.totalRows + ' painted'],
  ['the page does not assess anything until the visitor asks',
    !idle.resultsShown && idle.logLines === 0 && idle.runState !== 'block',
    'results=' + idle.resultsShown + ' log=' + idle.logLines + ' runState=' + idle.runState],
  ['the console waits at READY rather than reporting a run nobody started',
    /READY|Awaiting input/i.test(idle.status) && !/Run again/.test(idle.btn),
    idle.status + ' | btn=' + idle.btn.trim()],
  ['an ordinary ZIP does not report an upload failure',
    !/Upload failed|failed to load/i.test(zipPanel.name + ' ' + zipPanel.meta + ' ' + zipPanel.status),
    zipPanel.name + ' | ' + zipPanel.meta],
  ['the panel lists the ZIP\'s members, not the ZIP as one opaque artifact',
    zipPanel.files.some(t => /README\.txt/.test(t)) && zipPanel.files.some(t => /CloudVault-SSP\.docx/.test(t)),
    JSON.stringify(zipPanel.files)],
  ['a successful upload binds the package to the engine', zipPanel.bound === 1, String(zipPanel.bound)],
  ['a DOCX inside the package is read, not refused',
    !/CloudVault-SSP\.docx/.test(zipRefused) && /CloudVault-SSP\.docx/.test(zipLog),
    'refused=' + zipRefused.slice(0, 120)],
  ['the nested SSP reached the corpus the run assessed',
    /2 file\(s\)/.test(zipLog) || /CloudVault-SSP\.docx/.test(zipLog), ''],
  ['a .zip that is not a ZIP is reported as a failure',
    /Upload failed|could not be read|not a ZIP/i.test(brokenPanel.name + ' ' + brokenPanel.status),
    brokenPanel.name + ' | ' + brokenPanel.status.slice(0, 120)],
  ['a failed upload leaves nothing runnable bound to the engine',
    brokenPanel.bound === 0, String(brokenPanel.bound)],
];
let failures = 0;
for (const [msg, pass, detail] of checks) {
  if (!pass) failures++;
  console.log((pass ? '  ok   ' : '  FAIL ') + msg + (pass || !detail ? '' : ' — ' + detail));
}
console.log(failures ? `\n${failures} browser check(s) FAILED` : '\nall browser checks passed');
process.exit(failures ? 1 : 0);
