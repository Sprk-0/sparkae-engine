#!/usr/bin/env node
// SparkAE public reference build — conformance suite.
//
// Runs with node ≥ 18 and nothing else. Every claim the README makes about
// this repository is checked here, against the files in this repository:
//
//   1. the three engine scripts and both demo pages parse
//   2. the catalog counts are what the pages say (complete + each profile)
//   3. nothing published loads or calls a third-party origin, and the
//      Content-Security-Policy holds every page to connect-src 'self'
//   4. the engine and the exporters contain no clock read and no randomness
//   5. the gate model is canonical: ≤ 7 records per objective, gate 7 always
//      recorded, a Satisfied verdict carries exactly seven passing gates
//   6. determinism: the sample package at the pinned date gives the same
//      verdict digest and byte-identical OSCAL on two runs; the engine
//      refuses to run without an assessment date
//   7. the golden fixture: counts and digests for the bundled sample match
//      tests/golden/sample-ssp.expected.json (--write-golden regenerates it)
//   8. CSV cells that start with a formula character are neutralised
//   9. the OSCAL AR has the right root, declares 1.1.2, and carries the
//      reproducibility receipt; it is written to tests/out/ for the schema
//      check (tests/check_oscal_schema.py)
//  10. the homepage hero labelled as the sample run is a finding this engine
//      emits for that run, shown in the OSCAL shape the exporters write
//  11. every page names one address in its canonical, its og:url and
//      sitemap.xml, and Netlify's Pretty URLs post-processing is pinned off
//  12. adversarial evidence and date arithmetic
//  13. archive integrity: no member of an uploaded ZIP is lost, overwritten
//      or silently resolved when two carry the same name
//  14. gate 2 covers subject matter, not generic compliance vocabulary
//  15. homepage workflow cards deep-link to the demo tab they name
//
// Usage:  node tests/check.mjs [site-root] [--write-golden]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const writeGolden = args.includes('--write-golden');
const root = path.resolve(args.find(a => !a.startsWith('--')) || path.join(here, '..'));
const goldenPath = path.join(here, 'golden', 'sample-ssp.expected.json');
const outDir = path.join(here, 'out');

const SAMPLE_DATE = '2026-06-01';
const EXPECTED_COUNTS = {
  complete: { controls: 447, objectives: 1513 },
  Low: { controls: 156, objectives: 981 },
  Moderate: { controls: 323, objectives: 1307 },
  High: { controls: 410, objectives: 1429 },
};

let failures = 0;
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => { failures++; console.log('  FAIL ' + msg); };
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// ── 1. everything parses ────────────────────────────────────────────────────
console.log('1. syntax');
// TextDecoder/TextEncoder and DecompressionStream are host globals, not
// ECMAScript intrinsics, so a bare vm context does not have them. The ZIP
// and DOCX readers need them (section 13).
const ctx = { module: { exports: {} }, console, TextDecoder, TextEncoder, DecompressionStream };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['demo-standalone-catalog.js', 'demo-engine.js', 'demo-exports.js']) {
  try { vm.runInContext(read(f), ctx, { filename: f }); ok(f + ' parses and loads'); }
  catch (e) { fail(f + ': ' + e.message); }
}
for (const f of ['demo-standalone.html', 'demo-20x.html', 'index.html', 'assessors.html', 'integrations.html', 'status.html']) {
  const html = read(f);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let bad = 0;
  inline.forEach((src, i) => { try { new vm.Script(src, { filename: f + '#' + i }); } catch (e) { bad++; fail(f + ' inline script ' + i + ': ' + e.message); } });
  if (!bad) ok(f + ': ' + inline.length + ' inline script(s) parse');
}
const CATALOG = ctx.CATALOG, E = ctx.SparkAEEngine, EX = ctx.DEMO_EXPORTS;
if (!CATALOG || !E || !EX) { console.log('cannot continue without the engine'); process.exit(1); }

// ── 2. catalog counts ───────────────────────────────────────────────────────
console.log('2. catalog counts');
const counts = (b) => {
  let controls = 0, objectives = 0;
  for (const c of Object.values(CATALOG)) {
    if (b && !c.b.includes(b)) continue;
    controls++;
    objectives += b ? c.d.filter(d => d.b.includes(b)).length : c.d.length;
  }
  return { controls, objectives };
};
for (const [k, want] of Object.entries(EXPECTED_COUNTS)) {
  const got = counts(k === 'complete' ? null : k);
  check(got.controls === want.controls && got.objectives === want.objectives,
    `${k}: ${got.controls} controls / ${got.objectives} determination statements`);
}

// ── 3. no third-party origins, CSP holds ────────────────────────────────────
console.log('3. no network');
const published = fs.readdirSync(root).filter(f => /\.(html|js|css)$/.test(f));
// Anything that would LOAD or CALL a remote origin. <link rel="canonical"> and
// <a href> are addresses, not loads, and are allowed.
const LOADER = /(?:<script[^>]+src=|<link[^>]*rel=["'](?:stylesheet|preload|modulepreload|prefetch|icon|manifest)["'][^>]*href=|url\(|fetch\(|new\s+Worker\(|importScripts\(|XMLHttpRequest|sendBeacon\(|workerSrc\s*=)\s*['"]?\s*(https?:)?\/\//i;
for (const f of published) {
  // Comments may name a CDN to explain why one is NOT used; markup and code may
  // not. HTML comments, block comments and whole-line `//` comments are dropped;
  // a `//` later in a line is left alone because it may be the `https://` of a
  // real loader inside a string, which is exactly what must be caught.
  const text = read(f)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const hits = [];
  for (const line of text.split('\n')) if (LOADER.test(line)) hits.push(line.trim().slice(0, 100));
  check(!hits.length && !/cdnjs|jsdelivr|unpkg|fonts\.googleapis|fonts\.gstatic/i.test(text), f + ': no third-party loader' + (hits.length ? ' — ' + hits[0] : ''));
}
const headers = read('_headers');
check(!/connect-src\s+\*/.test(headers), "_headers: no rule carries connect-src *");
const cspRules = [...headers.matchAll(/^(\/\S*)\n\s+Content-Security-Policy:\s*(.+)$/gm)].map(m => [m[1], m[2]]);
check(cspRules.length > 0 && cspRules.every(([, v]) => /connect-src 'self'/.test(v) && /default-src 'self'/.test(v)), `_headers: ${cspRules.length} per-page policies, all default-src 'self' + connect-src 'self'`);
for (const f of published.filter(f => f.endsWith('.html'))) {
  const stem = '/' + f.replace(/\.html$/, '');
  check(cspRules.some(([p]) => p === '/' + f) && cspRules.some(([p]) => p === stem || (f === 'index.html' && p === '/')), f + ': CSP rule for both /' + f + ' and ' + stem);
}

// ── 4. no clock, no randomness in the engine or exporters ───────────────────
console.log('4. no clock, no randomness');
for (const f of ['demo-engine.js', 'demo-exports.js']) {
  const src = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!/Math\.random|Date\.now\s*\(|new\s+Date\s*\(\s*\)/.test(src), f + ': no Math.random / Date.now() / new Date()');
}

// ── 5–7. the sample run: gate model, determinism, golden ────────────────────
console.log('5–7. sample run');
const page = read('demo-standalone.html');
const sample = (page.match(/<script type="text\/plain" id="sample-ssp-data">([\s\S]*?)<\/script>/) || [])[1];
check(!!sample, 'sample SSP is embedded in demo-standalone.html');
const catalogVersion = (page.match(/const CATALOG_VERSION = '([^']+)'/) || [])[1] || '';

function run(baseline, asOfDay) {
  const chunks = E.chunkText(sample, 'CloudVault-Federal-SSP.txt');
  const retriever = new E.BM25Retriever(chunks);
  const idx = E.buildRefutationIndex(retriever);
  const asOf = new Date(asOfDay + 'T00:00:00Z');
  const findings = [];
  const reached = [0, 0, 0, 0, 0, 0, 0], passed = [0, 0, 0, 0, 0, 0, 0];
  for (const [cid, c] of Object.entries(CATALOG)) {
    if (!c.b.includes(baseline)) continue;
    for (const d of c.d) {
      if (!d.b.includes(baseline)) continue;
      const r = E.assessDif(d, retriever, cid, c.T, c.F, idx, asOf);
      findings.push(r);
      r.gates.forEach(g => { reached[g.gate - 1]++; if (g.pass) passed[g.gate - 1]++; });
    }
  }
  const receipt = EX.buildReceipt({ engineVersion: E.ENGINE_VERSION, catalogVersion, catalog: CATALOG, ruleset: E.RULESET, chunks, findings, assessmentDate: asOfDay, baseline });
  const state = { findings, baseline, assessment_date: asOfDay, receipt };
  const ar = EX.buildAssessmentResults(state, { systemName: 'CloudVault Storage Platform (sample)' });
  const arText = JSON.stringify(ar, null, 2);
  const by = s => findings.filter(f => f.status === s).length;
  return {
    findings, ar, arText, state,
    summary: {
      baseline, assessment_date: asOfDay, files: 1, chunks: chunks.length,
      controls: new Set(findings.map(f => f.control_id)).size, objectives: findings.length,
      satisfied: by('Satisfied'), other_than_satisfied: by('Other Than Satisfied'), not_reviewed: by('Not Reviewed'),
      review_required: findings.filter(f => f.review_required).length,
      gate_reached: reached, gate_passed: passed,
      engine_version: receipt.engine_version, catalog_version: receipt.catalog_version,
      catalog_digest: receipt.catalog_digest, ruleset_digest: receipt.ruleset_digest,
      evidence_digest: receipt.evidence_digest, verdict_digest: receipt.verdict_digest,
      oscal_ar_sha1: EX.sha1Hex(arText), oscal_ar_bytes: arText.length,
    },
  };
}

const a = run('Low', SAMPLE_DATE);
const b = run('Low', SAMPLE_DATE);

// 5. gate model
const gateOk = a.findings.every(f => {
  const ids = f.gates.map(g => g.gate);
  const ascending = ids.every((g, i) => Number.isInteger(g) && g >= 1 && g <= 7 && (i === 0 || g > ids[i - 1]));
  const hasSeven = ids[ids.length - 1] === 7;
  const satisfiedSeven = f.status !== 'Satisfied' || (ids.length === 7 && f.gates.every(g => g.pass));
  return ascending && hasSeven && satisfiedSeven && f.gates.length <= 7;
});
check(gateOk, 'gate model: ≤7 ascending records, gate 7 always recorded, Satisfied ⇒ seven passes');
check(a.findings.every(f => f.assessment_method === 'EXAMINE'), 'every determination is EXAMINE');
check(a.findings.every(f => f.assessment_date === SAMPLE_DATE), 'every determination reports the assessment date it was given');

// 6. determinism
check(a.summary.verdict_digest === b.summary.verdict_digest, 'same input twice → same verdict digest ' + a.summary.verdict_digest.slice(0, 12));
check(a.arText === b.arText, 'same input twice → byte-identical OSCAL AR (' + a.arText.length + ' bytes)');
let threw = false;
try { E.assessDif(Object.values(CATALOG)[0].d[0], new E.BM25Retriever(E.chunkText('x', 'x.txt')), 'AC-1', 't', 'f', {}); } catch (e) { threw = /assessmentDate/.test(e.message); }
check(threw, 'assessDif without an assessment date throws');
const later = run('Low', '2027-06-01');
check(later.summary.verdict_digest !== a.summary.verdict_digest, 'a different assessment date changes the verdict digest (temporal gates are live)');

// 7. golden
fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
if (writeGolden) {
  fs.writeFileSync(goldenPath, JSON.stringify(a.summary, null, 2) + '\n');
  ok('golden written: ' + path.relative(root, goldenPath));
} else if (fs.existsSync(goldenPath)) {
  const want = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const diffs = Object.keys(want).filter(k => JSON.stringify(want[k]) !== JSON.stringify(a.summary[k]));
  check(!diffs.length, 'golden fixture matches' + (diffs.length ? ' — differs in: ' + diffs.join(', ') : ` (${a.summary.satisfied} SAT / ${a.summary.other_than_satisfied} OTS / ${a.summary.not_reviewed} NR of ${a.summary.objectives})`));
} else {
  fail('golden fixture missing: ' + goldenPath + ' (run with --write-golden)');
}

// ── 8. CSV formula injection ────────────────────────────────────────────────
console.log('8. CSV safety');
const hostile = { ...a.state, findings: [{ ...a.findings[0], evidence_description: '=HYPERLINK("http://evil.example","x")', assessor_notes: '+cmd', weakness_name: '-1', evidence_references: ['@SUM(1)'] }] };
const csv = EX.buildFindingsCSV(hostile) + '\n' + EX.buildTCW(hostile) + '\n' + EX.buildPOAM(hostile) + '\n' + EX.buildRET({ ...hostile, findings: [{ ...hostile.findings[0], status: 'Other Than Satisfied' }] });
check(!/(^|,)"[=+\-@]/m.test(csv), 'no CSV cell begins with = + - @');

// ── 9. OSCAL shape + hand-off to the schema check ───────────────────────────
console.log('9. OSCAL');
const arRoot = a.ar['assessment-results'];
check(!!arRoot, "root key is 'assessment-results'");
check(arRoot && arRoot.metadata['oscal-version'] === '1.1.2', "metadata.oscal-version is '1.1.2'");
const props = (arRoot && arRoot.metadata.props) || [];
const propNames = props.map(p => p.name);
check(['engine-version', 'catalog-digest', 'ruleset-digest', 'evidence-digest', 'assessment-date', 'verdict-digest', 'assessment-method', 'interview-and-test'].every(n => propNames.includes(n)), 'metadata.props carry the reproducibility receipt');
check(props.some(p => p.name === 'interview-and-test' && p.value === 'not-performed'), 'the document states INTERVIEW and TEST were not performed');
check(['engine-version', 'catalog-digest', 'ruleset-digest', 'evidence-digest', 'assessment-date', 'verdict-digest', 'assessment-method', 'interview-and-test'].every(n => props.some(p => p.name === n && p.ns === 'https://sparkae.ai/ns/oscal')), 'receipt props use the sparkae.ai OSCAL namespace');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sample-ar.json'), a.arText);
ok('wrote tests/out/sample-ar.json for check_oscal_schema.py');

// ── 10. homepage hero is a real sample-run finding, shown as real OSCAL ─────
// The hero is labelled "from the sample run". That is a claim about this
// engine, not decoration: the objective, verdict and confidence on the card
// have to be the ones assessDif returns for CloudVault / Low / 2026-06-01.
// The expandable record is labelled OSCAL assessment-results, so it has to
// use the shape demo-exports.js emits and the vendored schema accepts.
console.log('10. homepage hero matches the sample run');
const home = read('index.html');
const hero = (home.match(/id="sample-run-finding"([\s\S]*?)<div class="hx-cap">/) || [])[1] || '';
check(!!hero, 'homepage has #sample-run-finding');
const heroId = ((hero.match(/class="id">([^<·]+)/) || [])[1] || '').trim();
const heroStatus = ((hero.match(/class="tag">([^<]+)/) || [])[1] || '').trim();
const heroConf = parseFloat(((hero.match(/<strong>Confidence<\/strong>\s*([0-9.]+)/) || [])[1] || ''));
const actual = a.findings.find(f => f.objective_id === heroId);
check(!!actual, 'hero objective ' + heroId + ' exists in the sample run');
if (actual) {
  check(actual.status === heroStatus, 'hero status is the sample-run status (' + actual.status + ')');
  check(Number.isFinite(heroConf) && Math.abs(actual.confidence - heroConf) < 0.005,
    'hero confidence is the sample-run confidence (' + actual.confidence + ')');
}
check(/sample run/.test(home) && /2026-06-01/.test(home),
  'hero caption still names the sample run and the pinned assessment date');

const schema = JSON.parse(fs.readFileSync(path.join(here, 'schema', 'oscal_assessment-results_schema.json'), 'utf8'));
const statusStates = (function findEnum(node) {
  if (Array.isArray(node)) return node.map(findEnum).find(Boolean);
  if (node && typeof node === 'object') {
    if (Array.isArray(node.enum) && node.enum.includes('satisfied')) return node.enum;
    return Object.values(node).map(findEnum).find(Boolean);
  }
  return undefined;
})(schema);
check(Array.isArray(statusStates) && statusStates.length,
  'vendored NIST schema declares the finding-status enum: ' + (statusStates || []).join(' | '));

const plainHome = home.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
const states = [...plainHome.matchAll(/"state"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
const badStates = states.filter(s => !statusStates.includes(s));
check(states.length > 0 && !badStates.length,
  'homepage OSCAL "state" value(s) are in the schema enum' + (badStates.length ? ' — not a token: ' + [...new Set(badStates)].join(', ') : ''));
check(!/\bother-than-satisfied\b/.test(plainHome),
  'homepage does not present "other-than-satisfied" as an OSCAL value');
check(/"target"\s*:\s*\{/.test(plainHome) && !/"target"\s*:\s*"/.test(plainHome),
  'homepage OSCAL target is the object form with target-id, not a bare string');
check(/related-risks/.test(plainHome) && /risk-uuid/.test(plainHome),
  'Other Than Satisfied hero shows related-risks as a risk-uuid pointer');
check(/server product/.test(home) && /pip install/.test(home) && /will not work/.test(home),
  'homepage says pip install is the server product and will not work from this tree');

// ── 11. one address per page, and the pin that keeps it ─────────────────────
// README.md and netlify.toml both state that this suite fails if the Pretty
// URLs pin is dropped, and the CI workflow header states that every page keeps
// a single address across canonical, og:url and sitemap.xml. Neither check
// existed: `pretty_urls` appeared nowhere here, and neither did `canonical`.
// The guard against the exact regression that motivated the served-as-is work
// was described in three files and written in none, which is the one kind of
// defect this repository cannot afford. Both are checks now.
console.log('11. one address per page');

const toml = read('netlify.toml');
check(/\[build\.processing\.html\]/.test(toml) && /^\s*pretty_urls\s*=\s*false\s*$/m.test(toml),
  'netlify.toml: Pretty URLs pinned off — the rewrite that served every page at an address its own canonical disclaims');

// 404.html is noindex and Disallow-ed in robots.txt and is deliberately absent
// from the sitemap; every other published page must name one address, and the
// same one, in all three places a reader or a crawler would look.
const ORIGIN = 'https://sparkae.ai';
const sitemapLocs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const indexable = published.filter(f => f.endsWith('.html') && f !== '404.html');
for (const f of indexable) {
  const text = read(f);
  const want = f === 'index.html' ? ORIGIN + '/' : ORIGIN + '/' + f;
  const canonical = (/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(text) || [])[1];
  const ogUrl = (/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i.exec(text) || [])[1];
  const agree = canonical === want && ogUrl === want && sitemapLocs.includes(want);
  check(agree, `${f}: canonical, og:url and sitemap.xml all say ${want}` + (agree ? '' :
    ` — canonical ${canonical || 'missing'} · og:url ${ogUrl || 'missing'} · sitemap ${sitemapLocs.includes(want) ? 'ok' : 'missing'}`));
}
check(sitemapLocs.length === indexable.length,
  `sitemap.xml lists exactly the ${indexable.length} indexable page(s) (found ${sitemapLocs.length})`);
check(!sitemapLocs.some(l => /\/404\.html$/.test(l)), 'sitemap.xml does not list the error page');
check(/Disallow:\s*\/404\.html/.test(read('robots.txt')), 'robots.txt disallows the error page');

// ── 12. adversarial evidence, and the date arithmetic under it ──────────────
// Ported from the private product repository, where these were the only tests
// of these behaviours anywhere: an attacker-shaped document and the calendar
// edges the temporal gates stand on. Everything above asserts what the engine
// does with evidence written in good faith; this asserts what it does with
// evidence written to get a pass.
console.log('12. adversarial evidence and date arithmetic');

// A chunk tagged with the control under test, carrying a traceable reference
// and a dated scan, so the earlier gates clear and the gate under test is what
// decides the verdict.
const ADV = 'AC-2 Account Management. The organization manages information system accounts, ' +
  'including establishing, activating, modifying, reviewing, disabling, and removing ' +
  'accounts. Account review is performed quarterly by the ISSO per SSP section 5.2. ' +
  'Reference: CloudVault-SSP.pdf section 5.2. Most recent scan: 2026-05-28.\n\n' +
  'AC-2 continued. Automated mechanisms support account management. Notification of ' +
  'account changes is sent to the ISSO. See procedure PROC-AC-002 revision 4.';
const ADV_PLAIN = ADV + '\n\nAC-2 note: placeholder text remains in this section.';
// The same word with Cyrillic r a c e o and d — visually identical to the line
// above, and the reason foldHomoglyphs exists. Gate 5 folds before matching;
// the gates that read the control's own evidence first must fold too, or a
// marker spelled this way walks past a check the plain spelling fails.
const ADV_HOMOGLYPH = ADV + '\n\nAC-2 note: рlасеhоlԁеr text remains in this section.';

const ADV_DIF = {
  i: 'AC-02(a)',
  t: 'The organization defines and documents the types of information system accounts to be managed.',
  b: ['Low'],
};
const advAssess = (text, day) => {
  const retriever = new E.BM25Retriever(E.chunkText(text, 'ssp.txt'));
  const idx = E.buildRefutationIndex(retriever);
  return E.assessDif(ADV_DIF, retriever, 'AC-2', 'Account Management', 'AC', idx,
    new Date(day + 'T00:00:00Z'));
};
// Gate 5's draft-marker finding is nested as sub-check 5c.
const sub5c = (res) => {
  const g5 = (res.gates || []).find(g => g.gate === 5) || {};
  const c = (g5.checks || []).find(x => String(x.id || x.name || '').includes('5c'));
  return c ? c.pass : undefined;
};

const advPlain = advAssess(ADV_PLAIN, SAMPLE_DATE);
check(sub5c(advPlain) === false && advPlain.status === 'Other Than Satisfied',
  'a plain draft marker fails gate 5c — the control case the homoglyph test needs');

const advHomo = advAssess(ADV_HOMOGLYPH, SAMPLE_DATE);
check(sub5c(advHomo) === false && advHomo.status === 'Other Than Satisfied',
  'the same marker in Cyrillic homoglyphs still fails gate 5c — it cannot be spelled past the gate');

const advClean = advAssess(ADV, SAMPLE_DATE);
check(sub5c(advClean) === true,
  'folding invents no draft marker in evidence that has none');

// If the date were ignored these would agree, which is exactly how a clock-
// reading verdict path hides: the scan above is dated 2026-05-28, either side
// of the 30-day ConMon cadence.
const advFresh = advAssess(ADV, '2026-06-01');
const advStale = advAssess(ADV, '2026-12-01');
check(advFresh.temporal_status === 'current' && advStale.temporal_status === 'stale' &&
  advFresh.assessment_date === '2026-06-01' && advStale.assessment_date === '2026-12-01',
  'the assessment date reaches the temporal gates rather than being recorded and ignored');

// Dates parsed out of evidence anchor at UTC midnight, so a run does not change
// meaning with the machine's timezone.
const advDates = E.extractDates('Most recent scan: 2026-05-28.');
check(advDates.length === 1 && advDates[0].dateStr === '2026-05-28' &&
  new Date(advDates[0].dateObj).toISOString() === '2026-05-28T00:00:00.000Z',
  'an evidence date is parsed to UTC midnight, not to the local day');

// A date that does not exist must be refused rather than rolled forward into a
// neighbouring day, which would silently move a finding's temporal verdict.
check(E.extractDates('Reviewed 2024-02-29.').length === 1 &&
  E.extractDates('Reviewed 2025-02-29.').length === 0 &&
  E.extractDates('Reviewed 2026-13-01.').length === 0 &&
  E.extractDates('Reviewed 2026-04-31.').length === 0,
  'impossible calendar dates are rejected, and a real leap day is kept');

// The refutation index is what gate 5a reads; a refutation written in sentence
// case is still a refutation.
const refRetriever = new E.BM25Retriever(E.chunkText(
  'AC-2 Account Management. Account review is documented.\n\n' +
  'AC-2 finding: Not implemented. The quarterly review has not been performed.', 'ssp.txt'));
const refIdx = E.buildRefutationIndex(refRetriever);
check(!!refIdx['AC-2'] && refIdx['AC-2'].some(h => /not/i.test(h) && /implemented/i.test(h)),
  'the refutation index matches a capitalised refutation, not only a lowercase one');


// ── 13. archive integrity ───────────────────────────────────────────────────
// An uploaded package is a ZIP, and the reader decides what evidence the
// engine ever sees. Two real archives broke the previous reader: one using
// data descriptors (sizes written after the data, zeroes in the local header)
// lost every member, and one carrying two members named review-ssp.txt kept
// only the last — turning an Other Than Satisfied into a Satisfied with no
// refusal shown. Both are pinned here, with the archives built byte by byte
// rather than fetched, so the fixtures cannot drift.
console.log('13. archive integrity');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

// A member is built from its UNCOMPRESSED bytes — `text` or `bytes` — because
// that is what a ZIP's CRC-32 covers. Handing the builder an already-compressed
// stream and recording a CRC of *that* produces an archive no conforming reader
// accepts, which is how a fixture quietly becomes the strawman it was written
// not to be. `deflate: true` compresses here, so the CRC stays honest. `raw`
// is the deliberate exception: a stream that is meant to be malformed, with its
// `method`, `uncompSize` and `crc` stated outright.
// `streaming` writes the sizes in a trailing data descriptor and leaves the
// local header zeroed, which is what a ZIP written to a pipe looks like.
// `declare` overstates the member count in the EOCD; `patch` gets the finished
// central-directory record to corrupt.
function buildZip(members, opts = {}) {
  const enc = new TextEncoder();
  const local = [];
  const central = [];
  let offset = 0;
  for (const m of members) {
    const name = enc.encode(m.name);
    const source = m.bytes || enc.encode(m.text || '');
    let data, method, uncompSize, crc;
    if (m.raw) {
      data = m.raw; method = m.method === undefined ? 8 : m.method;
      uncompSize = m.uncompSize === undefined ? m.raw.length : m.uncompSize;
      crc = m.crc === undefined ? 0 : m.crc;
    } else if (m.deflate) {
      data = new Uint8Array(zlib.deflateRawSync(Buffer.from(source), { level: 9 }));
      method = 8; uncompSize = source.length; crc = crc32(source);
    } else {
      data = source; method = 0; uncompSize = source.length; crc = crc32(source);
    }
    const flags = opts.streaming ? 0x08 : 0;
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); lv.setUint16(6, flags, true); lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x0021, true);
    lv.setUint32(14, opts.streaming ? 0 : crc, true);
    lv.setUint32(18, opts.streaming ? 0 : data.length, true);
    lv.setUint32(22, opts.streaming ? 0 : uncompSize, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    lh.set(name, 30);
    local.push(lh, data);
    let size = lh.length + data.length;
    if (opts.streaming) {
      const dd = new Uint8Array(16);
      const dv = new DataView(dd.buffer);
      dv.setUint32(0, 0x08074b50, true);
      dv.setUint32(4, crc, true);
      dv.setUint32(8, data.length, true);
      dv.setUint32(12, uncompSize, true);
      local.push(dd);
      size += dd.length;
    }
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true); cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x0021, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, uncompSize, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true); cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    if (opts.patch) opts.patch(cv, members.indexOf(m));
    central.push(ch);
    offset += size;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, opts.declare ?? members.length, true);
  ev.setUint16(10, opts.declare ?? members.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  const parts = [...local, ...central, eocd];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

const asFile = (bytes, name) => ({
  name,
  size: bytes.length,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});
const refusals = (rep) => (rep.skipped || []).map(s => s.name + ': ' + s.reason);

// Two accounts of AC-2_g that cannot both be true. Dated relative to
// SAMPLE_DATE so the temporal gates read it as current.
const IMPLEMENTED = 'AC-2 Account Management. Account use is monitored continuously by the ISSO per SSP section 5.2. Most recent scan: 2026-05-28. Reference: CloudVault-SSP.pdf.';
const NOT_IMPLEMENTED = 'AC-2 Account Management. Account monitoring is not implemented. The quarterly review has not been performed and no automated mechanism exists.';

// These fixtures are only worth what their validity is worth: a test that an
// archive parses is worthless if the archive is one no other reader accepts.
// So the builder is checked first, against the ZIP spec's own invariant — the
// CRC-32 in the central directory is over a member's UNCOMPRESSED bytes.
// Recording a CRC of the compressed stream instead is exactly the mistake that
// makes a fixture pass here and fail everywhere else, and it is the mistake
// these fixtures carried until this check existed.
function verifyZipCRCs(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = (() => { for (let i = bytes.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50) return i; return -1; })();
  if (eocd < 0) return 'no EOCD';
  let cd = view.getUint32(eocd + 16, true);
  const bad = [];
  for (let i = 0, n = view.getUint16(eocd + 10, true); i < n; i++) {
    const method = view.getUint16(cd + 10, true);
    const crc = view.getUint32(cd + 16, true);
    const compSize = view.getUint32(cd + 20, true);
    const nameLen = view.getUint16(cd + 28, true);
    const name = new TextDecoder().decode(bytes.slice(cd + 46, cd + 46 + nameLen));
    const localAt = view.getUint32(cd + 42, true);
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const raw = bytes.slice(dataAt, dataAt + compSize);
    const plain = method === 8 ? new Uint8Array(zlib.inflateRawSync(Buffer.from(raw))) : raw;
    if (crc32(plain) !== crc) bad.push(name + ' (method ' + method + ')');
    cd += 46 + nameLen + view.getUint16(cd + 30, true) + view.getUint16(cd + 32, true);
  }
  return bad.length ? 'CRC mismatch: ' + bad.join(', ') : '';
}
const storedFixture = buildZip([{ name: 'a.txt', text: 'stored member' }]);
const deflatedFixture = buildZip([{ name: 'b.txt', text: 'deflated member '.repeat(64), deflate: true }]);
const storedBad = verifyZipCRCs(storedFixture);
const deflatedBad = verifyZipCRCs(deflatedFixture);
check(storedBad === '' && deflatedBad === '',
  'the fixtures this section builds are valid ZIPs: every CRC-32 is over the uncompressed bytes — ' +
  (storedBad || deflatedBad || 'stored and deflated both verify'));

// Data descriptors: the local headers say the members are zero bytes long.
// Reading those zeroes refused the first member as a truncated stream and then
// advanced by zero bytes, so the second member was never seen or reported.
const streamingZip = await E.parseZipReport(asFile(buildZip(
  [{ name: 'policy.txt', text: IMPLEMENTED }, { name: 'review-ssp.txt', text: NOT_IMPLEMENTED }],
  { streaming: true }), 'streaming.zip'));
check(streamingZip.parsed.length === 2 &&
  streamingZip.parsed[0] === 'policy.txt' && streamingZip.parsed[1] === 'review-ssp.txt' &&
  streamingZip.skipped.length === 0 && streamingZip.chunks.length === 2,
  'a streaming ZIP (sizes in data descriptors) yields both members, not zero — ' +
  JSON.stringify(streamingZip.parsed));

// The ordinary case: a deflated member round-trips through the reader.
const deflatedText = IMPLEMENTED + '\n\n' + NOT_IMPLEMENTED;
const deflatedZip = await E.parseZipReport(asFile(buildZip([
  { name: 'review-ssp.txt', text: deflatedText, deflate: true },
]), 'deflated.zip'));
check(deflatedZip.parsed.length === 1 && deflatedZip.skipped.length === 0 &&
  deflatedZip.chunks.length > 0 && /monitored continuously/.test(deflatedZip.chunks[0].text),
  'a deflated member inflates to its text — ' + JSON.stringify(refusals(deflatedZip)));

// Two members of the same name are two documents claiming to be one. Keeping
// the last silently is what let the archive below report Satisfied.
const dupZip = await E.parseZipReport(asFile(buildZip([
  { name: 'review-ssp.txt', text: NOT_IMPLEMENTED },
  { name: 'review-ssp.txt', text: IMPLEMENTED },
]), 'duplicate.zip'));
check(dupZip.parsed.length === 0 && dupZip.chunks.length === 0 &&
  dupZip.skipped.length === 2 && dupZip.skipped.every(s => /ambiguous/.test(s.reason)),
  'an archive carrying two members named the same reads neither and names both — ' +
  JSON.stringify(refusals(dupZip)));

// The point of refusing: the member that would have been dropped is the one
// that contradicts the other, and dropping it moves the verdict.
// The dif is the catalog's own AC-2_g, not a hand-written stand-in, so the
// verdict this asserts is the one a run of this build would actually produce.
const dupDif = (CATALOG['AC-2'].d || []).find(d => d.i === 'AC-2_g');
const dupVerdict = (chunks) => {
  const r = new E.BM25Retriever(chunks);
  return E.assessDif(dupDif, r, 'AC-2', CATALOG['AC-2'].T, CATALOG['AC-2'].F,
    E.buildRefutationIndex(r), new Date(SAMPLE_DATE + 'T00:00:00Z')).status;
};
// Each member alone gives a different verdict — that is what makes silently
// keeping one of them a result-integrity failure rather than a parsing nit.
check(!!dupDif &&
  dupVerdict(E.chunkText(NOT_IMPLEMENTED, 'review-ssp.txt')) === 'Other Than Satisfied' &&
  dupVerdict(E.chunkText(IMPLEMENTED, 'review-ssp.txt')) === 'Satisfied' &&
  dupVerdict(dupZip.chunks) === 'Not Reviewed',
  'the two members disagree on AC-2_g, so the archive is read as neither rather than as the later one');

// The name census is taken from the central directory, before anything is
// read, and this is why: here the first of two same-named members is a corrupt
// deflate stream. A census of successfully read members would count one, call
// it unique, and parse it — which is the behaviour the section exists to stop,
// arrived at by a different route. The expansion budget would make it worse
// still: whether a duplicate survived would depend on its predecessors' size.
const halfCorrupt = await E.parseZipReport(asFile(buildZip([
  { name: 'review-ssp.txt', raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), uncompSize: 142 },
  { name: 'review-ssp.txt', text: IMPLEMENTED },
]), 'half-corrupt.zip'));
check(halfCorrupt.parsed.length === 0 && halfCorrupt.chunks.length === 0 &&
  halfCorrupt.skipped.length === 2 && halfCorrupt.skipped.every(s => /ambiguous/.test(s.reason)),
  'a duplicate name is refused even when its twin would not have inflated — ' +
  JSON.stringify(refusals(halfCorrupt)));

// The refusal happens in unzip(), against the central directory, so every
// caller gets it — parseZipReport and parseDocx alike. The old reader could
// not even express this: an object keyed by name has one slot per name, so the
// second member overwrote the first before any caller could object.
const dupFailures = [];
const dupMembers = await E.unzip((await asFile(buildZip([
  { name: 'a.txt', text: 'one' }, { name: 'a.txt', text: 'two' },
]), 'x.zip').arrayBuffer()), dupFailures);
check(Array.isArray(dupMembers) && dupMembers.length === 0 &&
  dupFailures.length === 2 && dupFailures.every(f => f.name === 'a.txt' && /ambiguous/.test(f.reason)),
  'unzip() itself returns neither same-named member and names both as refused');

// A unique name is unaffected by a duplicate elsewhere in the same archive.
const mixedFailures = [];
const mixedMembers = await E.unzip((await asFile(buildZip([
  { name: 'a.txt', text: 'one' }, { name: 'a.txt', text: 'two' }, { name: 'b.txt', text: 'three' },
]), 'mixed.zip').arrayBuffer()), mixedFailures);
check(mixedMembers.length === 1 && mixedMembers[0].name === 'b.txt' &&
  mixedMembers[0].text === 'three' && mixedFailures.length === 2,
  'a duplicate name refuses its own members only, not the rest of the archive');

// The array change above is invisible to a ZIP of text files but breaks DOCX,
// which looks its one member up by name.
const docxBody = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>' +
  IMPLEMENTED + '</w:t></w:r></w:p></w:body></w:document>';
let docxChunks = [];
let docxErr = '';
try {
  docxChunks = await E.parseFile(asFile(buildZip([
    { name: '[Content_Types].xml', text: '<Types/>' },
    { name: 'word/document.xml', text: docxBody },
  ]), 'ssp.docx'));
} catch (e) { docxErr = e.message || String(e); }
check(docxChunks.length === 1 && /Account Management/.test(docxChunks[0].text),
  'a DOCX still parses: its word/document.xml is found in the member array' + (docxErr ? ' — ' + docxErr : ''));

// A DOCX whose body is present but unreadable is not a DOCX with no body:
// saying so sends the assessor looking for the wrong problem.
let brokenDocx = '';
try {
  await E.parseFile(asFile(buildZip([{
    name: 'word/document.xml',
    raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), uncompSize: 500,
  }]), 'broken.docx'));
} catch (e) { brokenDocx = e.message || String(e); }
check(/could not be read/.test(brokenDocx) && !/has no word\/document\.xml/.test(brokenDocx),
  'a DOCX whose word/document.xml will not inflate says so, rather than that it has none — ' +
  JSON.stringify(brokenDocx));

let dupDocx = null;
try {
  await E.parseFile(asFile(buildZip([
    { name: 'word/document.xml', text: docxBody.replace('is implemented', 'is not implemented') },
    { name: 'word/document.xml', text: docxBody },
  ]), 'two-bodies.docx'));
} catch (e) { dupDocx = e.message || String(e); }
check(dupDocx && /ambiguous/.test(dupDocx),
  'a DOCX carrying two word/document.xml is refused, not resolved to the last one');

// A DOCX inside a package is the ordinary shape of a real submission: the SSP
// is a Word file and the package is a ZIP. Refusing it meant the one document
// the assessment most depends on was the one left out, and a run reached
// Complete having read the README and not the SSP.
const nestedDocx = buildZip([
  { name: '[Content_Types].xml', text: '<Types/>' },
  { name: 'word/document.xml', text: docxBody, deflate: true },
]);
const packageZip = await E.parseZipReport(asFile(buildZip([
  { name: 'README.txt', text: 'This package contains the system security plan.' },
  { name: 'CloudVault-SSP.docx', bytes: nestedDocx },
]), 'office-package.zip'));
check(packageZip.parsed.length === 2 && packageZip.parsed.indexOf('CloudVault-SSP.docx') !== -1 &&
  packageZip.skipped.length === 0 &&
  packageZip.chunks.some(c => c.filename === 'CloudVault-SSP.docx' && /monitored continuously/.test(c.text)),
  'a DOCX inside a package is read, and its text reaches the corpus under its own name — ' +
  JSON.stringify(packageZip.parsed) + ' refused ' + JSON.stringify(refusals(packageZip)));

// The nested reader shares the enclosing archive's allowance, so a package of
// many DOCX members cannot expand past the limit one member at a time.
const nestedBomb = buildZip([
  { name: 'word/document.xml', bytes: new Uint8Array(70 * 1024 * 1024), deflate: true },
]);
const nestedBombZip = await E.parseZipReport(asFile(buildZip([
  { name: 'big.docx', bytes: nestedBomb },
]), 'nested-bomb.zip'));
check(nestedBombZip.parsed.length === 0 && refusals(nestedBombZip).some(r => /MB limit/.test(r)),
  'a nested DOCX expands against the package\'s allowance, not its own — ' +
  JSON.stringify(refusals(nestedBombZip)));

// Resource limits: an archive may not be trusted about its own size.
const manyZip = await E.parseZipReport(asFile(buildZip(
  [{ name: 'a.txt', text: 'x' }], { declare: 4096 }), 'many.zip'));
check(manyZip.parsed.length === 0 && refusals(manyZip).some(r => /limit/.test(r)),
  'an archive declaring more members than the limit is refused up front');

// 0xFFFFFFFF is the ZIP64 sentinel; the real value lives in an extra field this
// reader does not parse, so reading the sentinel would slice nonsense.
const z64 = await E.parseZipReport(asFile(buildZip(
  [{ name: 'a.txt', text: 'x' }], { patch: (cv) => cv.setUint32(20, 0xFFFFFFFF, true) }), 'z64.zip'));
check(z64.parsed.length === 0 && refusals(z64).some(r => /ZIP64/.test(r)),
  'a ZIP64 member is refused by name rather than read from the sentinel');

// A member whose declared size runs past the end of the file is a truncated
// upload; it must be named, not quietly shortened.
const short = await E.parseZipReport(asFile(buildZip(
  [{ name: 'a.txt', text: 'x' }], { patch: (cv) => cv.setUint32(20, 0x00100000, true) }), 'short.zip'));
check(short.parsed.length === 0 && refusals(short).some(r => /past the end/.test(r)),
  'a member extending past the end of the file is refused by name');

// A deflated member declares its expanded size, and nothing stops it lying.
// This one is 70 MB of zeroes in about 70 KB on disk; the reader must stop
// spending memory at its own limit rather than at the archive's word.
const BOMB_BYTES = 70 * 1024 * 1024;
const bombZip = await E.parseZipReport(asFile(buildZip([
  { name: 'bomb.txt', bytes: new Uint8Array(BOMB_BYTES), deflate: true },
]), 'bomb.zip'));
check(bombZip.parsed.length === 0 && refusals(bombZip).some(r => /MB limit/.test(r)),
  'a member that expands past the archive-wide limit is refused by name — ' +
  JSON.stringify(refusals(bombZip)));

// Without a central directory there is no inventory, so there is nothing to be
// complete about: say so rather than report an archive with no evidence in it.
let notZip = null;
try { notZip = await E.parseZipReport(asFile(new TextEncoder().encode('this is not a zip at all'), 'nope.zip')); }
catch (e) { notZip = { parsed: [], skipped: [{ name: '(threw)', reason: e.message || String(e) }] }; }
check(notZip.parsed.length === 0 && refusals(notZip).some(r => /central directory/.test(r)),
  'a file with no central directory is refused as not-a-ZIP, not read as empty — ' +
  JSON.stringify(refusals(notZip)));



// ── 14. subject matter, not compliance vocabulary ───────────────────────────
// Finding 2 of the 2026-09-11 upload review. Two documents about account
// monitoring and multi-factor authentication returned Satisfied for AT-1_a.[01]
// — "an awareness and training policy is developed and documented" — because
// gate 2 accepted an objective's generic words on their own. "policy",
// "developed" and "documented" were all present; "awareness" and "training"
// were not needed.
console.log('14. subject matter');

const AT_OBJ = 'AT-1_a.[01]';
const atDif = (CATALOG['AT-1'].d || []).find(d => d.i === AT_OBJ);
const asOfDate = new Date(SAMPLE_DATE + 'T00:00:00Z');
const verdictFor = (docs, cid, dif) => {
  const chunks = docs.flatMap(([n, t]) => E.chunkText(t, n));
  const r = new E.BM25Retriever(chunks);
  return E.assessDif(dif, r, cid, CATALOG[cid].T, CATALOG[cid].F, E.buildRefutationIndex(r), asOfDate);
};
const gate = (res, n) => (res.gates || []).find(g => g.gate === n) || {};
const sub = (res, n, id) => ((gate(res, n).checks) || []).reduce((a, c) => a || (c.id === id ? c.pass : null), null);

// The reviewer's own case, as reported.
const OFF_SUBJECT = [
  ['review-ssp.txt', 'AC-2 Account Management. Account use is monitored continuously by the ISSO per SSP section 5.2. The account management policy is developed and documented and reviewed annually. Most recent scan: 2026-05-28.'],
  ['policy.txt', 'IA-2 Identification and Authentication. Multi-factor authentication is enforced for all privileged users per the documented identification and authentication policy, version 2.4, dated 2026-01-15.'],
];
const atOff = verdictFor(OFF_SUBJECT, 'AT-1', atDif);
check(!!atDif && atOff.status === 'Other Than Satisfied' && sub(atOff, 2, '2b') === false,
  'evidence about account monitoring does not satisfy an awareness-and-training objective — ' +
  atOff.status + ' / gate 2b ' + sub(atOff, 2, '2b'));

// The other half of the claim: a real awareness-and-training policy still passes.
// A rule that refuses everything is not an improvement.
const ON_SUBJECT = [['at-policy.txt',
  'AT-1 Awareness and Training Policy and Procedures. The organization-level security awareness and training policy is developed and documented in SSP section 12.1, version 2.4, dated 2026-01-15, and is disseminated to all personnel and roles with system access. The awareness and training procedures are reviewed annually.']];
const atOn = verdictFor(ON_SUBJECT, 'AT-1', atDif);
check(atOn.status === 'Satisfied' && sub(atOn, 2, '2a') === true && sub(atOn, 2, '2b') === true,
  'a real awareness-and-training policy still satisfies that objective — ' + atOn.status);

// And the mismatch is symmetric: an AT policy does not satisfy an AC objective.
const acDif = (CATALOG['AC-2'].d || []).find(d => d.i === 'AC-2_g');
const acOff = verdictFor(ON_SUBJECT, 'AC-2', acDif);
const acOn = verdictFor([['ac.txt',
  'AC-2 Account Management. Account use is monitored continuously by the ISSO per SSP section 5.2. Most recent scan: 2026-05-28. Reference: CloudVault-SSP.pdf.']], 'AC-2', acDif);
check(acOff.status !== 'Satisfied' && acOn.status === 'Satisfied',
  'the subject test runs both ways: AT evidence fails AC-2_g, AC evidence passes it — ' +
  acOff.status + ' / ' + acOn.status);

// The mechanism, stated directly: generic compliance words cannot carry a
// concept, and a concept made only of them is not counted at all.
const covGeneric = E.checkCoverage(['training policy is developed', 'documented'],
  'The account management policy is developed and documented and reviewed annually.');
check(covGeneric.ratio === 0 && covGeneric.uncovered.indexOf('training policy is developed') !== -1 &&
  covGeneric.generic.indexOf('documented') !== -1,
  'policy/developed/documented cover nothing; a wholly generic concept is set aside — ' +
  JSON.stringify(covGeneric));

// Stems match across inflection, so "accounts are created" reads "account
// creation". Refusing that would trade one error for another.
const covStem = E.checkCoverage(E.extractConcepts('Determine if accounts are created in accordance with [organization-defined policy];'),
  'Account creation requires documented approval from the system owner.');
check(covStem.ratio > 0, 'an objective about accounts being created is covered by "account creation" — ' + JSON.stringify(covStem));

// Organization-defined parameters are placeholders, not subject matter: no SSP
// says "organization-defined", and counting them made objectives uncoverable.
check(E.extractConcepts('Determine if accounts are created in accordance with [organization-defined policy, procedures, prerequisites, and criteria];')
  .every(c => !/organization-defined|prerequisites|criteria/.test(c)),
  'ODP placeholders are not extracted as concepts — ' +
  JSON.stringify(E.extractConcepts('Determine if accounts are created in accordance with [organization-defined policy, procedures, prerequisites, and criteria];')));

// The rule is published, so a determination can be audited against it rather
// than taken on trust — and the ruleset digest moves when the list moves.
check(Array.isArray(E.RULESET.generic_terms) && E.RULESET.generic_terms.length > 20 &&
  E.RULESET.generic_terms.indexOf('policy') !== -1 && E.RULESET.subject_required === true,
  'the generic-term list and the subject requirement are published in the ruleset');

// ── 15. live-demo user paths ────────────────────────────────────────────────
// The homepage says "Try each one in the browser." Each card has to name a
// distinct hash the demo honours, §01 cannot call its output a SAR, MeshGate
// is the Moderate catalog, and the walkthroughs cannot hard-code a portfolio
// of four SSPs when two are on the page.
console.log('15. live-demo user paths');
const WANT_WORKFLOWS = [
  ['§01', 'Initial assessment', 'initial'],
  ['§02', 'Annual reassessment', 'annual'],
  ['§03', 'Significant change', 'scr'],
  ['§04', 'Monthly ConMon', 'conmon'],
  ['§05', 'KSI validation', 'ksi'],
  ['§06', 'QA audit', 'qa'],
  ['§07', 'Package validator', 'pkg'],
  ['§08', 'Portfolio', 'portfolio'],
  ['§09', 'Data sources', 'src'],
];
const homeCards = [...home.matchAll(/<a class="it" href="([^"]+)"[\s\S]*?<span class="n">([^<]+)<\/span><span class="t">([^<]+)<\/span>/g)]
  .map(m => ({ href: m[1], n: m[2], t: m[3] }));
check(homeCards.length === WANT_WORKFLOWS.length,
  'homepage has nine workflow cards (found ' + homeCards.length + ')');
check(new Set(homeCards.map(c => c.href)).size === homeCards.length,
  'each homepage workflow card has a distinct href');
for (const [n, t, uc] of WANT_WORKFLOWS) {
  const card = homeCards.find(c => c.n === n);
  check(!!card && card.t === t && card.href === 'demo-standalone.html#' + uc,
    'homepage ' + n + ' ' + t + ' → #' + uc + (card ? ' (got ' + card.href + ')' : ' missing'));
}
check(!/SSP → SAR/.test(home) && !/SSP → SAR/.test(page),
  '§01 does not call the live-engine output a SAR');
check(/FedRAMP Moderate · 323 controls/.test(page) && !/325 controls/.test(page) && !/\bcontrols: 325\b/.test(page),
  'MeshGate is the Moderate catalog (323), not 325');
check(/\{ label: 'Year 1 \(FY24\)', controls: 52,/.test(page),
  'CloudVault annual cohorts are a third of the Low baseline (52+52+52)');
check(!/4 SSPs/.test(page) && !/all 4 SSPs/.test(page),
  'QA and portfolio do not hard-code four SSPs');
check(/ucFromHash|UC_HASH_ALIASES/.test(page),
  'the demo honours a hash so a homepage card can open the tab it names');
check(!/id="annual-placeholder"/.test(page),
  'the leftover §03-labelled Annual Reassessment preview is gone');
check(!/<a href="#"[^>]*class="export-btn"/.test(page) && !/class="export-btn"><span class="check">✓/.test(page),
  'walkthrough export chips are not href="#" download pretenders');


// ── 15. the CSV says who determined what ────────────────────────────────────
// The OSCAL exporter has carried engine-determination / assessor-determination /
// determination-source since the assessor layer landed. CSV collapsed all three
// into one cell, so a revised Satisfied was indistinguishable from an engine
// Satisfied, and the assessor's own words were lost. A determination nobody can
// attribute is not much of a record.
console.log('15. determination attribution in CSV');

const csvParse = (line) => {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
};
const attrFindings = [
  { control_id: 'AC-2', objective_id: 'AC-2_g', status: 'Other Than Satisfied' },
  { control_id: 'AT-1', objective_id: 'AT-1_a.[01]', status: 'Other Than Satisfied' },
];
const ASSESSOR_TEXT = 'during the assessment the assessor examined the SSP, and confirmed per section 5.2 that account use is monitored';
const attrRevs = new Map([['AC-2_g', { status: 'Satisfied', statement: ASSESSOR_TEXT }]]);
const attrCsv = EX.buildFindingsCSV(
  { findings: attrFindings, baseline: 'Low', assessment_date: SAMPLE_DATE }, { revisions: attrRevs });
const attrLines = attrCsv.split('\n');
const attrHead = csvParse(attrLines[0]);
const attrRows = attrLines.slice(1).map(csvParse);
const col = (row, name) => row[attrHead.indexOf(name)];

check(attrRows.every(r => r.length === attrHead.length),
  'every findings row has exactly as many cells as the header (' + attrHead.length + ')');

const revised = attrRows.find(r => col(r, 'Objective ID') === 'AC-2_g');
check(revised && col(revised, 'Determination') === 'Satisfied' &&
  col(revised, 'Engine Determination') === 'Other Than Satisfied' &&
  col(revised, 'Assessor Determination') === 'Satisfied' &&
  col(revised, 'Determination Source') === 'assessor' &&
  col(revised, 'Assessor Statement') === ASSESSOR_TEXT,
  'a revised finding keeps the engine verdict, the assessor verdict, the source and the statement');

const untouched = attrRows.find(r => col(r, 'Objective ID') === 'AT-1_a.[01]');
check(untouched && col(untouched, 'Determination') === 'Other Than Satisfied' &&
  col(untouched, 'Engine Determination') === 'Other Than Satisfied' &&
  col(untouched, 'Assessor Determination') === '' &&
  col(untouched, 'Determination Source') === 'engine',
  'an unrevised finding is attributed to the engine and carries no assessor verdict');

// The receipt attests the engine run. An assessor may override a determination;
// they may not rewrite what the engine derived from the evidence.
check(col(revised, 'Engine Determination') === attrFindings[0].status,
  'the engine column is the engine\'s, unchanged by the revision over it');


console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
