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
//  15. homepage workflow links deep-link to the demo tab they name
//  16. the findings CSV attributes each determination to the engine or to the
//      assessor who revised it
//  17. the README's accuracy figures are the ones the benchmark recorded
//  18. the preview status sits beside every button that starts a run, and the
//      one section that runs is on the page rather than behind a disclosure
//  24. the 2026-09-15 interrogation fix set: every refutation is matched,
//      gates read the control's own evidence, presence is absolute, ODPs are
//      typed or recorded as unverified, homoglyphs fold in both cases, the
//      currency and SLA checks read dates consistently, the ruleset digest
//      covers every matcher, ZIP members are CRC-checked and the end-of-
//      directory record has to end the file, the receipt verifies against its
//      own digest, OSCAL risks follow the effective determination, CSV cells
//      are neutralised behind leading blanks, and the walkthrough idle copy
//      does not say the engine ran
//
// Usage:  node tests/check.mjs [site-root] [--write-golden]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
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
// The no-outbound-calls claim is only enforceable while these hold on every
// rule, not most of them: a page that can be framed or can load a plugin has
// an outbound path the connect-src directive never sees.
check(cspRules.every(([, v]) => /frame-ancestors 'none'/.test(v) && /object-src 'none'/.test(v)),
  "_headers: every policy carries frame-ancestors 'none' and object-src 'none'");
// Netlify combines every rule whose path matches, and a browser enforces two
// policies as their intersection — so a CSP on a wildcard path can only tighten
// a page's own, silently. The file's own header explains this; the check is
// what keeps it true.
const cspOnWildcard = cspRules.filter(([p]) => p.includes('*')).map(([p]) => p);
check(!cspOnWildcard.length, '_headers: no wildcard path declares a CSP' + (cspOnWildcard.length ? ' — ' + cspOnWildcard.join(', ') : ''));
// /demo is the outreach short link. Forced (the trailing `!`), so it is always
// the standalone demo even if a page named demo.html were ever published again,
// which is why its _headers rule can be the strict policy.
check(/^\/demo\s+\/demo-standalone\.html\s+301!\s*$/m.test(read('_redirects')),
  '_redirects: /demo is a forced 301 to demo-standalone.html');
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
const hostile = { ...a.state, findings: [{ ...a.findings[0], evidence_description: '=HYPERLINK("http://evil.example","x")', assessor_notes: '+cmd', weakness_name: '-1', evidence_references: ['@SUM(1)'],
  // Behind a blank a spreadsheet strips before it reads the cell: a space, a
  // newline, a byte-order mark. The wire regex below could not see these —
  // `"` followed by a space is not `"` followed by `=` — so the check parses
  // the cells and asks what the first character a spreadsheet would read is.
  recommendation: ' =HYPERLINK("http://evil.example","y")', proposed_remediation: '\n=cmd', risk_statement: '\uFEFF=1+1', mitigating_factors: '\t=x' }] };
const csv = EX.buildFindingsCSV(hostile) + '\n' + EX.buildTCW(hostile) + '\n' + EX.buildPOAM(hostile) + '\n' + EX.buildRET({ ...hostile, findings: [{ ...hostile.findings[0], status: 'Other Than Satisfied' }] });
check(!/(^|,)"[=+\-@]/m.test(csv), 'no CSV cell begins with = + - @');
const csvCells = (text) => {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\n') { out.push(cur); cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  out.push(cur);
  return out;
};
const armed = csvCells(csv).filter(c => /^[=+\-@]/.test(c.replace(/^[\s\uFEFF\u00A0]+/, '')));
check(!armed.length, 'no CSV cell begins with a formula character once leading blanks are stripped' + (armed.length ? ' — ' + JSON.stringify(armed.slice(0, 3)) : ''));
check(['\' =HYPERLINK', '\'\n=cmd', '\'\uFEFF=1+1', '\'\t=x', '\'  +1', '\'\r\n@x'].every((want, i) =>
  EX.csvSafe([' =HYPERLINK', '\n=cmd', '\uFEFF=1+1', '\t=x', '  +1', '\r\n@x'][i]) === want) && EX.csvSafe('plain text') === 'plain text' && EX.csvSafe('') === '',
  'csvSafe neutralises a formula behind a space, a newline, a BOM or a tab, and leaves plain text alone');

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
check(/server product/.test(home) && /pip install/.test(home) && /does not work/.test(home),
  'homepage says pip install is the server product and does not work from this tree');

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

// Being in the sitemap is a claim that the page is part of the site. A page
// no visitor can walk to is not, whatever the sitemap says: demo-20x.html sat
// at priority 0.6 with its only inbound link deleted by a homepage redesign,
// and status.html was reachable only from that orphan. Crawl the link graph
// from the homepage the way a visitor would and require it to cover every
// page that claims to be indexable. 404.html is excluded here for the same
// reason it is excluded from the sitemap — nothing should link to it.
const linksOf = (f) => [...read(f).matchAll(/<a[^>]+href=["']([^"']+)["']/gi)]
  .map(m => m[1].split('#')[0].split('?')[0].replace(/^\/+/, ''))
  .map(h => h === '' ? 'index.html' : h)
  .filter(h => indexable.includes(h));
const reached = new Set(['index.html']);
for (const f of reached) linksOf(f).forEach(h => reached.add(h));
const orphans = indexable.filter(f => !reached.has(f));
check(orphans.length === 0,
  'every indexable page is reachable by link from the homepage' +
  (orphans.length ? ` — unreachable: ${orphans.join(', ')}` : ''));

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

// An archive cut before its central directory — a download that stopped early —
// is refused with a reason that says so. It is not read by walking the local
// headers: the central directory is the inventory this reader counts names from
// before it reads a byte, and a header walk on a truncated archive is exactly
// the count-of-what-happened-to-succeed that lets one of two same-named members
// pass as unique. The private repository's engine copy had that walk; this one
// refuses on purpose, and the refusal is what a visitor sees.
const wholeZip = buildZip([{ name: 'first.txt', text: 'first member' }, { name: 'second.txt', text: 'second member' }]);
const cdAt = (() => { const v = new DataView(wholeZip.buffer); for (let i = wholeZip.length - 4; i >= 0; i--) if (v.getUint32(i, true) === 0x02014b50) return i; return -1; })();
const truncatedZip = await E.parseZipReport(asFile(wholeZip.slice(0, cdAt), 'truncated.zip'));
check(cdAt > 0 && truncatedZip.parsed.length === 0 && truncatedZip.chunks.length === 0 &&
  truncatedZip.skipped.some(s => /truncated/.test(s.reason)),
  'an archive cut before its central directory is refused as truncated, not read by a header walk — ' +
  JSON.stringify((truncatedZip.skipped[0] || {}).reason || truncatedZip.parsed));

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
// §01 is the one section that runs, so it is presented on its own above the
// walkthrough grid rather than as one tile of nine (see section 18). What has
// to hold is the same either way: nine links, each opening the tab it names.
const homeCards = [...home.matchAll(/<a class="(?:it|hx-live)" href="([^"]+)"[\s\S]*?<span class="n">([^<]+)<\/span>[\s\S]*?<span class="t">([^<]+)</g)]
  .map(m => ({ href: m[1], n: m[2], t: m[3] }));
check(homeCards.length === WANT_WORKFLOWS.length,
  'homepage links to all nine workflows (found ' + homeCards.length + ')');
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


// ── 16. the CSV says who determined what ────────────────────────────────────
// The OSCAL exporter has carried engine-determination / assessor-determination /
// determination-source since the assessor layer landed. CSV collapsed all three
// into one cell, so a revised Satisfied was indistinguishable from an engine
// Satisfied, and the assessor's own words were lost. A determination nobody can
// attribute is not much of a record.
console.log('16. determination attribution in CSV');

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


// ── 17. the README's accuracy figures are the benchmark's ───────────────────
// The benchmark runs from its own entry point (tests/benchmark.mjs, run by CI
// with --strict). What is checked here is the other half: that the numbers the
// README prints are the numbers on record, so a figure cannot go stale in the
// one file a reader is most likely to quote from.
console.log('17. accuracy figures');
const benchSpec = JSON.parse(fs.readFileSync(path.join(here, 'benchmark', 'cases.json'), 'utf8'));
const bench = JSON.parse(fs.readFileSync(path.join(here, 'benchmark', 'results.json'), 'utf8'));
const readmeSrc = read('README.md');
const bo = bench.summary.overall;

check(bo.cases === benchSpec.cases.length,
  'the recorded results cover every case in cases.json (' + bo.cases + ')');

const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : word === 'false pass' ? 'es' : 's');
const headline = 'engine ' + bench.summary.engine_version + ' · ' + bo.cases + ' cases · ' +
  bo.correct + ' correct · ' + plural(bo.false_pass, 'false pass') + ' · ' +
  plural(bo.false_fail, 'false fail');
check(readmeSrc.includes(headline), 'README states the recorded score: ' + headline);

const split = Object.entries(bench.summary.by_source)
  .map(([src, v]) => src + ' ' + v.cases + ' cases · ' + v.correct + ' correct').join(' · ');
check(readmeSrc.includes(split), 'README states the per-source split: ' + split);

// A benchmark whose cases were all written by the engine's author measures
// agreement with its author. The README says so; this keeps the split real.
check((bench.summary.by_source['external-review'] || {}).cases > 0,
  'at least one case comes from outside this repository');


// ── 18. the preview status is where a run starts ────────────────────────
// A visitor decides what to trust before they click, not after. Any page that
// offers a button into the engine has to say what the engine is: a build that
// really runs, whose determinations an assessor checks, and whose accuracy
// rests on a published case set rather than on real authorization packages. The
// check is written against the button rather than against a list of pages, so a
// new page with a run button fails until it carries the note too.
console.log('18. preview status beside the run button');
// Attribute order is not a property of the page. The first spelling of this
// required class before href, so `<a href="demo-standalone.html" class="btn
// btn-ghost">` — which assessors.html already carries — was invisible to it,
// and a page whose only run button was spelled that way would have passed with
// no preview status at all. Lookaheads, so either order matches.
const runButton = /<a\b(?=[^>]*\bhref="demo-standalone\.html(?:#[a-z0-9-]+)?")(?=[^>]*\bclass="[^"]*\bbtn\b)[^>]*>/g;
for (const f of fs.readdirSync(root).filter(x => /\.html$/.test(x))) {
  const html = read(f);
  const buttons = [...html.matchAll(runButton)];
  const isDemo = f === 'demo-standalone.html';
  if (!buttons.length && !isDemo) continue;
  // The note carries animation classes on some pages, so match the class name
  // rather than the whole attribute.
  const noteAt = html.indexOf('class="preview-note');
  if (noteAt === -1) { fail(f + ': offers a run button with no preview status'); continue; }
  // What the note has to say, in the present tense: that the engine really runs
  // here, that an assessor checks what it determines, what the accuracy rests
  // on, and which build is being described — a homepage that also markets the
  // commercial server product leaves that last one open otherwise.
  const saysIt = /Public preview/.test(html) &&
    /<strong>This build runs the engine, not a recording\.<\/strong>/.test(html) &&
    /rather than on real authorization packages/.test(html) &&
    /automated EXAMINE preparation an assessor\s+checks/.test(html.replace(/\s+/g, ' ')) &&
    /not the commercial server product/.test(html);
  if (!saysIt) { fail(f + ': the preview status does not say what it needs to'); continue; }
  // Beside the button, not buried: the demo page carries it in its own hero,
  // and elsewhere it sits within a screenful of markup of the first run button.
  check(isDemo || Math.abs(noteAt - buttons[0].index) < 2000,
    f + ': the preview status sits with the run button');
}

// §01 is the only section that runs, and the homepage presents it that way:
// its own block above the walkthrough grid, with no live badge left inside it.
const homeHtml = read('index.html');
const liveAt = homeHtml.indexOf('class="hx-live"');
const gridAt = homeHtml.indexOf('class="hx-do"');
check(liveAt !== -1 && liveAt < gridAt,
  'the homepage puts the live engine above the walkthrough grid');
const gridHtml = homeHtml.slice(gridAt, homeHtml.indexOf('<div class="hx-head"', gridAt));
check(!/badge live/.test(gridHtml), 'nothing in the walkthrough grid claims to be the live engine');
check(/§02/.test(gridHtml) && /§09/.test(gridHtml) && !/>§01</.test(gridHtml),
  'the walkthrough grid holds §02–§09 and no longer holds §01');

// ── 19. the figures the README quotes are the fixture's ─────────────────
// This repository carries no release tags, so the README tells a reader to cite
// a state by its reproducibility tuple. That only works while the tuple printed
// there is the one the fixture holds — a digest copied into prose is exactly the
// kind of figure that goes stale the first time the engine moves.
//
// The earlier version of this section checked a tag name against the changelog.
// It was written against tags that exist only in one local clone: GitHub has
// none, and v1.1.0 was never pushed. A check cannot make a claim true.
console.log('19. the README cites this state correctly');
// Every part the README quotes, not just the ones that were easy to check: the
// catalog version and the assessment date drift as readily as a digest, and the
// fixture holds both.
const golden19 = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
// Scoped to the tuple block itself, not the whole file. Checking the README for
// these strings anywhere passes on a corrupted block: the catalog version and
// the assessment date both appear in other sections, so fault injection showed
// the first version of this check green on a README it should have rejected.
const citeSection = readmeSrc.slice(readmeSrc.indexOf('### Citing a state'));
const tuple19 = (citeSection.match(/```text\n([\s\S]*?)```/) || [])[1] || '';
const cited = {
  engine: new RegExp('engine ' + E.ENGINE_VERSION.replace(/\./g, '\\.')).test(tuple19),
  catalog_version: tuple19.includes(golden19.catalog_version),
  catalog: tuple19.includes(golden19.catalog_digest.slice(0, 12)),
  ruleset: tuple19.includes(golden19.ruleset_digest.slice(0, 12)),
  verdict: tuple19.includes(golden19.verdict_digest.slice(0, 12)),
  assessment_date: tuple19.includes(golden19.assessment_date),
};
check(Object.values(cited).every(Boolean),
  'the README quotes every part of this build\'s tuple: engine ' + E.ENGINE_VERSION +
  ' · catalog ' + golden19.catalog_version + ' / ' + golden19.catalog_digest.slice(0, 12) +
  ' · ruleset ' + golden19.ruleset_digest.slice(0, 12) + ' · ' + golden19.assessment_date +
  ' → verdict ' + golden19.verdict_digest.slice(0, 12) + ' (' + JSON.stringify(cited) + ')');

// What this can see is the README; whether the remote carries tags is not
// knowable from a file on disk, and the message says only what was read.
check(!/`v\d+\.\d+\.\d+`/.test(readmeSrc), 'the README names no release tag');

// ── 20. inline script runs by hash, and nothing else runs at all ────────────
// script-src used to carry 'unsafe-inline', which is the directive that lets an
// `onclick=` attribute run. Removing it was the last open item from the upload
// review's first finding, and it only holds while two things stay true: no page
// grows a handler attribute back, and every inline <script> is listed in its own
// page's policy by hash. A stale hash is silent on disk — the page works from a
// file:// open and is refused on the wire — so the hashes are recomputed here
// from the pages themselves rather than trusted.
console.log('20. inline script runs by hash');
// HTML comments are stripped before scanning. This is not cosmetic:
// demo-standalone.html discusses `<script src>` inside a comment, and a scan
// that does not strip comments hashes from there to the next `</script>`.
// _headers carried exactly that hash — a span no browser ever executes — until
// this check compared the two sets for equality.
const EXEC_TYPE = /^(?:text\/javascript|application\/javascript|module)$/i;
const inlineHashes = (src) => {
  const out = [];
  for (const m of src.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc\s*=/.test(m[1])) continue; // a same-origin file; 'self' covers it
    const type = (/\btype\s*=\s*["']([^"']*)["']/.exec(m[1]) || [])[1];
    // demo-standalone.html's embedded sample SSP is markup-delimited data, not
    // script. A browser never runs it, so a hash for it would widen the policy
    // to admit that exact body as code — for nothing.
    if (type && !EXEC_TYPE.test(type)) continue;
    out.push('sha256-' + crypto.createHash('sha256').update(m[2], 'utf8').digest('base64'));
  }
  return out;
};
// Script and style bodies are cut out before looking for a handler attribute:
// `el.onclick = fn` is a property assignment, which the policy has no quarrel
// with, and the site now sets its behaviour that way (a delegated listener on
// `data-action`). What must not come back is the attribute form.
const HANDLER = /<[a-z][^>]*?\son[a-z]+\s*=/gi;
for (const f of published.filter(f => f.endsWith('.html'))) {
  const src = read(f);
  const markup = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
  const handlers = markup.match(HANDLER) || [];
  check(!handlers.length, f + ': no inline event-handler attribute' +
    (handlers.length ? ` — ${handlers.length}, first ${JSON.stringify(handlers[0].trim().slice(-40))}` : ''));

  // Every control that acts has to be reachable without a mouse. Removing the
  // handlers made this worse before it made it better: an `onclick=` on a div
  // was already mouse-only, but rewriting it as `data-action` moved the
  // behaviour somewhere a reader is less likely to notice the div. So the tag
  // is checked, not the handler — a button, or an anchor with somewhere to go.
  // The whole source is scanned rather than the markup alone, because half of
  // these controls are written by the page into template literals.
  const FOCUSABLE = /^(?:button|select|textarea|input)$/i;
  const unreachable = [];
  for (const m of src.matchAll(/<([a-z]+)((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-(?:action|tab)=(?:"[^"]*"|'[^']*')(?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const [tag, attrs] = [m[1], m[2]];
    if (FOCUSABLE.test(tag)) continue;
    if (/^a$/i.test(tag) && /\shref=/.test(attrs)) continue;
    if (/\stabindex=/.test(attrs)) continue;
    unreachable.push(m[0].slice(0, 80));
  }
  check(!unreachable.length, f + ': every data-action / data-tab control is keyboard-reachable' +
    (unreachable.length ? ` — ${unreachable.length}, first ${JSON.stringify(unreachable[0])}` : ''));

  // Both route forms, because Netlify keys header rules on the requested path
  // and a page is reachable at `/foo` as well as `/foo.html`. A hash listed on
  // one and missing from the other is a page that runs from one URL and not the
  // other, which is worse than failing outright.
  const want = inlineHashes(src);
  for (const route of ['/' + f, f === 'index.html' ? '/' : '/' + f.replace(/\.html$/, '')]) {
    const policy = (cspRules.find(([pth]) => pth === route) || [])[1] || '';
    const scriptSrc = (/script-src ([^;]*)/.exec(policy) || [])[1] || '';
    check(!!policy && !/'unsafe-inline'/.test(scriptSrc),
      route + ": script-src carries no 'unsafe-inline'");
    const listed = scriptSrc.match(/sha256-[A-Za-z0-9+/=]+/g) || [];
    // Equality, not containment. A missing hash breaks the page; a surplus one
    // is an allowlist entry for code that is not in the file, which is the
    // quieter of the two faults and the reason this is a set comparison.
    const same = listed.length === want.length && want.every((h) => listed.includes(h));
    check(same, `${route}: script-src lists exactly this page's ${want.length} inline script hash(es)` +
      (same ? '' : ` — page has ${JSON.stringify(want)}, policy has ${JSON.stringify(listed)}`));
  }
}

// ── 21. the OSCAL document's references resolve ─────────────────────────────
// Ported from the private repository's test_website_demo_exports, which drove
// the exporter over a synthesised finding per objective. This drives it over
// the sample run instead — the same 981 findings the golden fixture pins — so
// the document under test is the one a visitor downloads. The official schema
// (tests/check_oscal_schema.py) already rejects an invented assembly or a
// bracketed target-id; what it cannot see is a reference. A risk-uuid that
// satisfies the uuid pattern and resolves to nothing is valid JSON and a
// useless record, and that is what this section reads.
console.log('21. OSCAL references resolve');
const result21 = arRoot.results[0];
const uuidsOf = (list) => new Set((list || []).map(x => x.uuid));
const declaredRisks = uuidsOf(result21.risks);
const declaredObs = uuidsOf(result21.observations);
const declaredComponents = uuidsOf((result21['local-definitions'] || {}).components);
const findings21 = result21.findings || [];

const riskRefs = findings21.flatMap(f => (f['related-risks'] || []).map(r => r['risk-uuid']));
const danglingRisks = riskRefs.filter(u => !declaredRisks.has(u));
check(riskRefs.length > 0 && !danglingRisks.length,
  `every related-risks pointer resolves to a declared risk (${riskRefs.length} pointers, ${declaredRisks.size} risks)` +
  (danglingRisks.length ? ' — dangling: ' + danglingRisks.slice(0, 3).join(', ') : ''));

const obsRefs = findings21.flatMap(f => (f['related-observations'] || []).map(o => o['observation-uuid']));
const danglingObs = obsRefs.filter(u => !declaredObs.has(u));
check(obsRefs.length > 0 && !danglingObs.length,
  `every related-observations pointer resolves to a declared observation (${obsRefs.length} pointers, ${declaredObs.size} observations)`);

// subject-uuid is a reference too. The schema only asks that it be a uuid; a
// fresh one satisfies it and tells a consumer nothing about what was assessed.
const subjects = (result21.observations || []).flatMap(o => o.subjects || []);
const danglingSubjects = subjects.filter(s => !declaredComponents.has(s['subject-uuid']));
check(declaredComponents.size > 0 && subjects.length > 0 && !danglingSubjects.length && subjects.every(s => s.type === 'component'),
  `every observation subject is a declared component (${subjects.length} subjects, ${declaredComponents.size} component)`);

// reviewed-controls says what was in scope. OSCAL control ids are lower-case
// and dotted; the catalog's "AC-2(1)" form is not a valid one.
const included = (((result21['reviewed-controls'] || {})['control-selections'] || [])[0] || {})['include-controls'] || [];
check(included.length === a.summary.controls && included.every(c => /^[a-z][a-z0-9.-]*$/.test(c['control-id'])),
  `reviewed-controls names the ${a.summary.controls} controls assessed, as lower-case OSCAL ids`);

// OSCAL has no "not reviewed" objective state, so Not Reviewed has to collapse
// to not-satisfied. What must not happen is for it to READ as a tested failure:
// the real determination travels as a prop, and no risk is raised for an
// objective nobody tested. Conversely, every not-satisfied finding that IS a
// tested failure carries the risk that justifies it.
const detProp = (f) => ((f.props || []).find(p => p.name === 'determination') || {}).value;
const nrFindings = findings21.filter(f => detProp(f) === 'Not Reviewed');
check(nrFindings.length === a.summary.not_reviewed && nrFindings.every(f => f.target.status.state === 'not-satisfied' && !f['related-risks']),
  `Not Reviewed (${nrFindings.length}) is recorded as a prop over not-satisfied, and raises no risk`);
const otsFindings = findings21.filter(f => f.target.status.state === 'not-satisfied' && detProp(f) !== 'Not Reviewed');
check(otsFindings.length === a.summary.other_than_satisfied && otsFindings.every(f => (f['related-risks'] || []).length > 0),
  `every Other Than Satisfied finding (${otsFindings.length}) points at the risk it raises`);

// import-ap is required by the schema and used to be href="#": a pointer to
// nothing that the schema could not see through. It has to resolve to a
// back-matter resource that says what the plan of this run was.
const apHref = (arRoot['import-ap'] || {}).href || '';
const apResource = ((arRoot['back-matter'] || {}).resources || []).find(r => '#' + r.uuid === apHref);
check(apHref !== '#' && apHref.startsWith('#') && !!apResource && /EXAMINE/.test(apResource.description || '') &&
  (apResource.props || []).some(p => p.name === 'interview-and-test' && p.value === 'not-performed'),
  'import-ap points at a declared back-matter resource describing this run\'s plan, not at "#"' + (apHref === '#' ? '' : ' (' + apHref.slice(0, 12) + '…)'));

// The four CSV downloads, parsed as records rather than lines: an evidence cell
// may carry a newline, and a line-split reads that as a ragged row when it is
// not one. The parse is RFC 4180 — quoted fields may hold commas, doubled
// quotes and newlines.
const csvRecords = (text) => {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); out.push(row); }
  return out.filter(r => r.length > 1 || r[0] !== '');
};
for (const [name, build] of [['findings', EX.buildFindingsCSV], ['RET', EX.buildRET], ['POA&M', EX.buildPOAM], ['TCW', EX.buildTCW]]) {
  const recs = csvRecords(build(a.state, {}));
  const width = recs[0].length;
  const ragged = recs.filter(r => r.length !== width).length;
  check(recs.length > 1 && !ragged, `${name} CSV: ${recs.length - 1} records, every one ${width} cells wide` + (ragged ? ` — ${ragged} ragged` : ''));
}

// The summary is a work aid. It must not imply assessor adoption or an
// authorization status — the independence guardrail, in the one export a
// reader is most likely to paste into an email.
const summaryText = EX.buildSummary(a.state, {}).replace(/\s+/g, ' ').toLowerCase();
check(!/ready for fedramp submission|submission-grade|submission-ready/.test(summaryText) && !/\bauthoritative\b/.test(summaryText),
  'the summary claims no submission readiness and calls nothing authoritative');
check(/not been reviewed, scoped, or adopted/.test(summaryText) && /confers no authorization status/.test(summaryText),
  'the summary states the independence limit in its own words');

// The page has to use the shared exporter, not regrow its own. The keys named
// here are the two the old inline emitter invented and the root the pre-1.1.2
// document used; the page names them in prose, so object-literal keys are what
// is matched.
check(/<script src="demo-exports\.js"><\/script>/.test(page) && page.includes('DEMO_EXPORTS.buildAssessmentResults'),
  'demo-standalone.html builds its OSCAL through demo-exports.js');
const regrown = ["'related-controls':", "'associated-risks':", "'security-assessment-results':"].filter(k => page.includes(k));
check(!regrown.length, 'the page has not regrown an inline OSCAL emitter' + (regrown.length ? ' — ' + regrown.join(' ') : ''));
const declaredVersions = [...page.matchAll(/'oscal-version':\s*'([^']+)'/g)].map(m => m[1]);
check(declaredVersions.every(v => v === '1.1.2'), 'every oscal-version the page itself declares is 1.1.2' + (declaredVersions.length ? ` (${declaredVersions.length})` : ''));


// ── 22. the site is findable, shareable, and does not dead-end ──────────────
// Ported from the private repository's test_imp988_site_discoverability. Three
// things nobody reading the pages would notice and everyone promoting them
// would: a link with no image renders as a bare row in every feed, an
// unmatched path fell through to the host's stock error page with no way back,
// and crawlers had nothing to index from. Section 11 holds the sitemap and the
// robots file; this holds the card and the error page — and holds the card's
// figures to the same rule as the pages, since a social card is the most
// widely seen surface and the easiest one to let overstate the catalog.
console.log('22. findable, shareable, no dead ends');
const CARD = 'static/og-card.png';
const CARD_SRC = 'static/og-card.src.html';
const allPages = published.filter(f => f.endsWith('.html'));

for (const f of allPages) {
  const html = read(f);
  const meta = (attr, name) => (new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`).exec(html) || [])[1];
  const image = meta('property', 'og:image'), twImage = meta('name', 'twitter:image');
  const okImage = image === ORIGIN + '/' + CARD && twImage === ORIGIN + '/' + CARD && meta('name', 'twitter:card') === 'summary_large_image';
  // A screen-reader user following a shared link should get the claim the card
  // makes, not "image". At sixty characters or fewer it is a label, not a
  // description, so the check wants more than that.
  const alt = meta('property', 'og:image:alt') || '', twAlt = meta('name', 'twitter:image:alt') || '';
  const okAlt = alt.length > 60 && twAlt.length > 60;
  const okSize = meta('property', 'og:image:width') === '1200' && meta('property', 'og:image:height') === '630';
  check(okImage && okAlt && okSize, `${f}: declares the social card, its 1200×630 size, and alt text` +
    (okImage ? '' : ' — image/card meta') + (okAlt ? '' : ' — alt text thin or missing') + (okSize ? '' : ' — size meta'));
}

// Scrapers reject an image that is not the size the meta tags declare, and the
// tags above all say 1200×630. Read the PNG header rather than trust the name.
const png = fs.readFileSync(path.join(root, CARD));
const pngOk = png.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const pngW = png.readUInt32BE(16), pngH = png.readUInt32BE(20);
check(pngOk && pngW === 1200 && pngH === 630, `${CARD} is a real ${pngW}×${pngH} PNG`);

// A binary nobody can rebuild is a binary that goes stale. The source lives
// beside it, reaches nothing off-origin at render time, and is not a page.
const cardSrc = read(CARD_SRC);
check(!allPages.includes('og-card.src.html'), 'the card source is not a published page');
const cardFonts = [...cardSrc.matchAll(/url\('([^']*)'\)/g)].map(m => m[1]);
check(cardFonts.length > 0 && cardFonts.every(u => u.startsWith('fonts/') && fs.existsSync(path.join(root, 'static', u))),
  'the card source uses only this repository\'s own fonts, and each one exists' +
  (cardFonts.every(u => u.startsWith('fonts/')) ? '' : ' — ' + cardFonts.filter(u => !u.startsWith('fonts/')).join(', ')));
check(!/file:\/\/\//.test(cardSrc) && !/https?:\/\//.test(cardSrc.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')),
  'the card source fetches nothing at render time and names no machine path');

// The credibility rule the site was rewritten around: a number shown to a
// buyer is labelled and matches the catalog. Read the figures out of the card
// source, require each on the homepage against the same noun, and require
// both to be the catalog's own High-baseline counts.
const cardFigures = [...cardSrc.matchAll(/<b>([\d,]+)<\/b>\s*([a-z ]+?)<\/span>/g)].map(m => [m[1], m[2]]);
const high = counts('High');
const fmt = (n) => n.toLocaleString('en-US');
const cardControls = cardFigures.find(([, noun]) => noun === 'controls'), cardObjectives = cardFigures.find(([, noun]) => noun === 'objectives');
check(cardControls && cardControls[0] === fmt(high.controls) && cardObjectives && cardObjectives[0] === fmt(high.objectives),
  `the card states the catalog's High baseline: ${fmt(high.controls)} controls · ${fmt(high.objectives)} objectives` +
  (cardFigures.length ? ` (card says ${cardFigures.map(x => x.join(' ')).join(', ')})` : ' — no figures found in the card source'));
check(home.includes(`<div class="num">${fmt(high.controls)}</div><div class="label">Controls · FedRAMP High`) &&
  home.includes(`<div class="num">${fmt(high.objectives)}</div><div class="label">"Determine if" objectives`),
  'the homepage states the same two figures against the same nouns');
check(/FedRAMP High baseline/.test(cardSrc), 'the card names the baseline its counts belong to');
const cardLower = cardSrc.toLowerCase();
const cardOverclaims = ['3pao', 'accredited', 'certif', 'ai-', ' ai ', 'authorization to operate', 'ato'].filter(w => cardLower.includes(w));
check(!cardOverclaims.length && /interview and test stay with the assessor/.test(cardLower),
  'the card claims nothing the pages do not, and carries the scope limit' + (cardOverclaims.length ? ' — ' + cardOverclaims.join(', ') : ''));

// The error page. Netlify renders 404.html AT the unmatched request URL rather
// than redirecting to it, so a path-relative reference resolves against that
// path: measured on the old page served at /old/docs/page, href="index.html"
// went to /old/docs/index.html — another 404 — and the stylesheet beside it,
// so the page that exists to route a lost visitor home rendered unstyled with
// nothing on it that worked. Every URL it carries is root-relative. A <base>
// element would be the other fix and is blocked by the page's own base-uri
// 'none', which is not the thing to loosen for a layout convenience.
const notFound = read('404.html');
const nfMarkup = notFound.replace(/<!--[\s\S]*?-->/g, '');
const nfNav = [...nfMarkup.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)].map(m => m[1]).join(' ');
check(nfNav && ['index.html', 'assessors.html', 'demo-standalone.html', 'integrations.html'].every(t => nfNav.includes(`href="/${t}"`)),
  '404.html carries the site navigation, root-relative');
check(nfMarkup.split('</nav>').slice(1).join('').includes('href="/demo-standalone.html"'),
  '404.html routes back to the demo from its body, not only its nav');
check(/<meta name="robots" content="[^"]*noindex[^"]*">/.test(notFound),
  '404.html is noindex — it answers on every unmatched path and would otherwise compete with real pages');
const nfRelative = [...nfMarkup.matchAll(/(?:href|src)="(?!\/|https?:|data:|mailto:|#)([^"]*)"/g)].map(m => m[1]);
check(!nfRelative.length, '404.html uses no path-relative URL' + (nfRelative.length ? ' — ' + nfRelative.slice(0, 3).join(', ') : ''));
check(!/<link[^>]*rel="(?:stylesheet|preload|modulepreload|prefetch|manifest)"[^>]*href="https?:/.test(nfMarkup) && !/<base[\s/>]/.test(nfMarkup),
  '404.html loads with no absolute loader and no <base> element');
check(notFound.includes('<link rel="stylesheet" href="/ae-editorial.css">'),
  '404.html reaches the stylesheet from the site root');
const nfRule = (cspRules.find(([p]) => p === '/404.html') || [])[1] || '';
check(/base-uri 'none'/.test(nfRule), "the /404.html policy keeps base-uri 'none'");
check(notFound.includes(`<link rel="canonical" href="${ORIGIN}/404.html">`) && notFound.includes(`<meta property="og:url" content="${ORIGIN}/404.html">`),
  '404.html still declares an absolute canonical and og:url — root-relative navigation must not sweep up the metadata');

// Crawlability beyond what section 11 holds: the robots file points at the
// sitemap, and the sitemap lists the home page once, as the bare origin.
const robots = read('robots.txt');
check(/^User-agent: \*$/m.test(robots) && robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`),
  'robots.txt addresses every crawler and points at the sitemap');
check(sitemapLocs.includes(ORIGIN + '/') && !sitemapLocs.includes(ORIGIN + '/index.html') && new Set(sitemapLocs).size === sitemapLocs.length,
  'sitemap.xml lists the homepage once, as the bare origin, and no <loc> twice');


// ── 23. what the pages claim ────────────────────────────────────────────────
// Ported from the private repository's test_website_content_claims and
// test_imp985_website_credibility — the regressions a copy edit reintroduces
// quietly and nobody notices until a prospect does. Not a style guide: every
// assertion here is a factual, legal or accessibility claim. Where those suites
// asserted on build tokens, sync scripts and an allowlist this repository does
// not have, the assertion is dropped; where they asserted on copy the public
// site has since changed on purpose (the sample no longer runs on page load —
// section 18 is written against the run button), the current behaviour is what
// is pinned.
console.log('23. what the pages claim');
const pageText = Object.fromEntries(allPages.map(f => [f, read(f)]));
const allText = Object.values(pageText).join('\n');

// A wrong count is the cheapest possible credibility loss, and the one most
// likely to survive a rewrite: only a near miss next to an objective word is
// flagged, since the bare number could be anything else on the page.
for (const baseline of ['Low', 'Moderate', 'High']) {
  const { objectives } = counts(baseline);
  const nearMisses = [objectives - 1, objectives + 1].filter(n =>
    new RegExp('\\b' + fmt(n).replace(',', '[,]?') + '\\b[^.<]{0,30}(DIF|objective|"Determine if")', 'i').test(allText));
  check(!nearMisses.length, `no page quotes a near miss of the ${baseline} objective count (${objectives})` + (nearMisses.length ? ' — found ' + nearMisses.join(', ') : ''));
}
// Numbers are labelled with what they count. 410 / 1,429 is the High baseline
// and used to sit unlabelled above a footer saying 447 / 1,513; the two forms
// below are the ones that contradicted each other.
const full = counts(null);
check(new RegExp(`${fmt(high.objectives)}</div><div class="label">[^<]*High baseline \\(${high.controls} controls\\)`).test(home.replace(/\s+/g, ' ')),
  'the homepage labels the High-baseline objective count as High, with its control count');
check(home.replace(/\s+/g, ' ').includes(`${high.controls}</div><div class="label">Controls · FedRAMP High profile`) && !/410<\/div><div class="label">[^<]*NIST[^<]*High/.test(home),
  '410 is labelled the FedRAMP High profile, not NIST High (which is 426)');
// "full catalog" is the word that came out: 447 is what this build carries, and
// it is the FedRAMP High baseline plus the PT and PM controls, not the whole of
// 800-53A Rev 5 — AC-16, AC-23, AC-24, AC-25, IA-13 and SC-16 are not in it.
// The figures are unchanged; the claim around them is.
const footerLine = `catalog ${full.controls} controls · ${fmt(full.objectives)} objectives · FedRAMP High baseline ${high.controls} / ${fmt(high.objectives)}`;
const footerPages = allPages.filter(f => /catalog \d+ controls/.test(pageText[f]));
check(footerPages.length >= 6 && footerPages.every(f => pageText[f].includes(footerLine)),
  `${footerPages.length} footers state the catalog figures, each labelled and matching the catalog`);
check(!allPages.some(f => /full catalog/.test(pageText[f])),
  'no page calls what this build carries the full 800-53A Rev 5 catalog');
const absentFromCatalog = ['AC-16', 'AC-23', 'AC-24', 'AC-25', 'IA-13', 'SC-16'];
check(absentFromCatalog.every(id => !CATALOG[id]),
  'the controls the README names as absent are absent — ' + absentFromCatalog.join(', '));
check(Object.keys(CATALOG).every(id => (CATALOG[id].b || []).includes('High') || (CATALOG[id].b || []).length === 0),
  'every control carried is either in the FedRAMP High baseline or in no baseline at all, which is what the README says it is');
check(!/447 Controls · 1,513 DIFs/.test(allText) && !/v0\.7\.0-rc1/.test(allText),
  'no unlabelled catalog count and no release-candidate tag survives as a badge');
// The server product's plain-NIST install is a deployment profile, not a job
// parameter — the API field is assessment_framework.
check(!/framework=nist/.test(allText) && /FRAMEWORK=nist/.test(allText),
  'NIST mode is described as the install profile (FRAMEWORK=nist), not a job parameter');

// The demo says what it runs.
const low = counts('Low');
check(page.includes(`id="cv-meta">FedRAMP Low · ${low.controls} controls · ${low.objectives} objectives`) &&
  page.includes('<option value="Low" selected>FedRAMP Low</option>') &&
  page.includes(`controls: ${low.controls},`) && !page.includes('controls: 421,') &&
  page.includes('CloudVault Federal — FedRAMP Low Baseline'),
  `the sample card, the profile selector and the bundled SSP all say FedRAMP Low · ${low.controls} / ${low.objectives}`);
check(!page.includes('totalBytes > 50 * 1024 * 1024') &&
  page.includes('const controls = profileCounts(engineBaseline()).controls;') && page.includes("const baseline = 'FedRAMP ' + engineBaseline();"),
  'an upload is labelled with the profile the rail declares, not a guess from its byte size');
check(page.includes('id="stat-mode">EXAMINE · automated</span>') && !page.includes("railMode: 'EXAMINE · INTERVIEW · TEST'") && !page.includes('The 3PAO engine walks'),
  '§01 is EXAMINE only — Interview and Test stay with the assessor');
check(page.includes('OSCAL 1.1.2 output · FedRAMP constraints (min 1.0.4)') && page.includes("railMode: 'PKG · OSCAL 1.1.2'") &&
  !page.includes('assembling OSCAL 1.0.4') && !page.includes('OSCAL 1.0.4 SAR') && read('demo-exports.js').includes("'oscal-version': '1.1.2'"),
  'the validator names the OSCAL version the exports declare (1.1.2; 1.0.4 only as the FedRAMP minimum)');
check(page.includes('const names = (window.SparkAEEngine && SparkAEEngine.GATE_NAMES) ||') &&
  page.includes("['Presence', 'Concepts', 'Strength', 'ODP', 'Contradiction', 'Temporal', 'Determination']"),
  'the gate pills read the engine\'s own GATE_NAMES, with gate 7 as Determination');
check(!page.includes('§04 · Live Demo'), 'the demo header carries no stray section number');
// The live path narrates the corpus the engine indexed; the seventeen appendices
// and the policy-family sweep belong to the scripted walkthrough.
const liveStart = page.indexOf('async function runInitialLive(sample)');
const liveBody = liveStart >= 0 ? page.slice(liveStart, page.indexOf('\n}\n', liveStart)) : '';
check(liveStart >= 0 && page.includes('return runInitialLive(sample);') && !liveBody.includes('17/17 appendices') && !liveBody.includes('SSP_APPENDICES'),
  'the live run narrates nothing it never saw');
check(!page.includes('setTimeout(showOnboarding, 200)') && page.includes('data-action="onboarding-show">How this works'),
  'the tour is opt-in: a control opens it, nothing opens it on load');
check(page.includes('id="assessment-date"') && page.includes('for="assessment-date"') &&
  page.includes('const asOfDay = engineAssessmentDate();') && page.includes("const asOf = new Date(asOfDay + 'T00:00:00Z');") &&
  !page.includes('corpusAssessmentDate') && !read('demo-engine.js').includes('corpusAssessmentDate'),
  'an upload takes its assessment date from the visible field — never the clock, never the package\'s own newest date');
check(page.includes('assessment_date: run.assessmentDate,') && (page.match(/window\.__lastRunWasReal = false;/g) || []).length >= 2,
  'exports carry the displayed live run\'s own date, and switching workflow or sample drops the live flag');
// A 2018 scan assessed as of 2026 is stale; deriving the date from the corpus
// would let it pass its own cadence gate.
const ownScan = advAssess(ADV.replace('2026-05-28', '2018-01-01'), '2026-06-01');
check(ownScan.status !== 'Satisfied' && ownScan.temporal_status === 'stale',
  'a stale package cannot pass by being assessed as of its own scan date');
const nrRun = advAssess('Nothing relevant here at all.', SAMPLE_DATE);
check(nrRun.status === 'Not Reviewed' && nrRun.gates.map(g => g.gate).join(',') === '1,7',
  'Not Reviewed still records the status gate: gates 1 and 7');
// Identifiers are content-derived RFC 4122 v5, one per finding and observation;
// the count exceeding the finding count is what shows they are not one seed
// reused.
const v5 = new Set(a.arText.match(/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g) || []);
check(v5.size > a.findings.length, `the OSCAL document carries ${v5.size} distinct v5 identifiers for ${a.findings.length} findings`);

// Independence. Phrases that assert a status SparkAE does not hold, or a
// readiness the product's own trackers say generated bundles do not have.
// Five phrases caught the 2026-09 review's worst copy and none of the rest of
// it: a page could tell an assessor to skip what passed, call 447 the complete
// Rev 5 catalog, promise OSCAL POA&M this build writes as CSV, or advertise a
// 3PAO UI this origin does not ship, and the suite stayed green. Each entry
// below is a phrase that was on a published page and is not true of this build.
// A claim the server product can back belongs on a page that says so.
const BANNED = [
  // what the reference build cannot back
  'ready for FedRAMP submission', 'submission-ready', 'submission-grade',
  'Authoritative downloads', 'CUI-safe',
  // advice that acts on a lexical Satisfied as though it were an assessed one
  'Skip the controls that clearly pass',
  'every Satisfied must clear',
  // capability this origin does not ship
  'same 7-gate engine as the 3PAO UI',
  'OSCAL 1.1.2 assessment-results and POA&M',
  // catalog scope
  'full catalog', 'Complete NIST SP 800-53A Rev 5 catalog',
  // gap-type names that exist only in marketing
  'odp_frequency_mismatch', 'insufficient_scope', 'stale_documentation', 'scan_gap',
  // FedRAMP vocabulary this build does not have the standing to use
  'certified 3PAO',
  // a parameter comparison gate 4 does not perform
  '90-day vs FedRAMP 60-day requirement',
];
const bannedHits = allPages.flatMap(f => BANNED.filter(b => pageText[f].toLowerCase().includes(b.toLowerCase())).map(b => `${f}: ${b}`));
check(!bannedHits.length, 'no page makes a claim the product cannot back' + (bannedHits.length ? ' — ' + bannedHits.join('; ') : ''));
const homeFlat = home.replace(/\s+/g, ' ');
check(homeFlat.includes('not</strong> a FedRAMP Recognized independent assessment service') && homeFlat.includes('does not replace one') && homeFlat.includes('does not make the authorization decision'),
  'the homepage states what SparkAE is not — the load-bearing sentence of the position');
const assessorsFlat = pageText['assessors.html'].replace(/\s+/g, ' ');
check(assessorsFlat.includes('You keep scope, testing, conclusions, overrides, and the final deliverables.') && assessorsFlat.includes('It is not a FedRAMP Recognized independent assessment service'),
  'the assessor page keeps scope with the assessor');
const walkthroughFlat = pageText['demo-20x.html'].replace(/\s+/g, ' ');
check(walkthroughFlat.includes('SparkAE does not adjudicate') && walkthroughFlat.includes('it does not resolve the disagreement'),
  'the 20x walkthrough does not let SparkAE adjudicate');
const rfcPages = allPages.filter(f => pageText[f].includes('RFC-0024'));
check(rfcPages.length > 0 && rfcPages.every(f => pageText[f].replace(/\s+/g, ' ').includes('was <strong>closed</strong>')),
  'RFC-0024 is cited as closed, not as settled policy');
check(homeFlat.includes('reference engine published at the Source link is Apache-2.0') && homeFlat.includes('SparkAE server product is commercial software'),
  'the homepage states the license boundary');
const heroSection = (home.split('<section class="hx-hero">')[1] || '').split('</section>')[0];
check(heroSection.length > 0 && !heroSection.includes('curl ') && heroSection.includes('Sample package · no signup · nothing uploaded'),
  'the hero leads with the finding and the sample, not a curl');

// The integrations page's delivery subheader was once sentence fragments that
// said "file export or REST" against the page's own batch-export card. It is a
// sentence naming both delivery models.
const delivery = (pageText['integrations.html'].split('Delivery Models')[1] || '');
const deliverySub = ((/class="section-sub">([\s\S]*?)<\/div>/.exec(delivery) || [])[1] || '').replace(/\s+/g, ' ').trim();
check(deliverySub.length > 0 && /The same engine/.test(deliverySub) && /REST API/.test(deliverySub) && /batch export/i.test(deliverySub) &&
  /\.$/.test(deliverySub) && !pageText['integrations.html'].includes('file export or REST'),
  'the integrations delivery subheader is a sentence naming the REST API and batch export');

// The status page claims no state it was not given: it once shipped five green
// badges and a clean incident history while telling visitors both came from a
// snapshot that had never been published.
const status = pageText['status.html'];
check(!status.includes('No incidents reported in the last 90 days —') && !status.includes('>Operational<') &&
  (status.match(/class="badge unknown"/g) || []).length >= 5 &&
  status.includes('id="incident-list"') && status.includes('id="maintenance-list"') && status.includes('data.incidents') && status.includes('data.maintenance'),
  'status.html renders every state from the snapshot and starts every badge unknown');
check(status.includes('function esc(') && status.includes('esc(i.title') && status.includes('esc(m.title'),
  'status.html escapes the operator-authored snapshot fields it renders');
const seed = JSON.parse(read('status-data.json'));
check(seed.published_at === null && seed.components && !Object.keys(seed.components).length,
  'the committed status snapshot declares no state');

// Every contact link on the site resolves to one address, so the published site
// can never point at a mailbox that does not exist. Every page links to this
// repository, and does so from the footer rather than the primary navigation.
const mailtos = [...new Set(allText.match(/mailto:[^"'?]+/g) || [])];
check(mailtos.length === 1, 'one contact address across the site' + (mailtos.length === 1 ? ` (${mailtos[0]})` : ' — ' + mailtos.join(', ')));
const noSource = allPages.filter(f => !pageText[f].includes('href="https://github.com/Sprk-0/sparkae-engine"'));
check(!noSource.length, 'every page links to this repository' + (noSource.length ? ' — missing on ' + noSource.join(', ') : ''));
const sourceInNav = allPages.filter(f => [...pageText[f].matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)].some(m => m[1].includes('github.com/Sprk-0/sparkae-engine')));
check(!sourceInNav.length, 'the Source link is a footer link, not primary navigation' + (sourceInNav.length ? ' — in nav on ' + sourceInNav.join(', ') : ''));
check(!/https?:\/\/[a-z0-9.-]*sparkae\.com|@sparkae\.com/i.test(allText),
  'no page names the .com domain, which belongs to an unrelated business');

// Every page reaches every section from a <nav> element. Section 11 crawls the
// link graph for reachability; this is the narrower claim that the navigation
// itself is complete, which is what the demo page and the status page once
// lacked — a wordmark that linked nowhere and no site links at all.
for (const f of allPages) {
  const nav = [...pageText[f].matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)].map(m => m[1]).join(' ');
  const targets = ['index.html', 'assessors.html', 'demo-standalone.html', 'integrations.html', 'index.html#cta'];
  const missing = targets.filter(t => !nav.includes(`href="${t}"`) && !nav.includes(`href="/${t}"`));
  check(nav.length > 0 && !missing.length, `${f}: the navigation reaches every section` + (missing.length ? ' — lacks ' + missing.join(', ') : ''));
}
// The shared stylesheet once hid nav .links below 900px, so a DOM-only check
// passed while a phone visitor could reach nothing.
const css = read('ae-editorial.css');
const mobile = (css.split('@media (max-width:900px){')[1] || '').split('\n}\n')[0];
check(!css.includes('nav .links{display:none}') && mobile.includes('nav .links{display:flex') && mobile.includes('overflow-x:auto'),
  'the navigation is presented on phones, not hidden');

// A redesign that drops a section id silently breaks every other page that
// deep-links to it. Every page.html#fragment link on any page names an id the
// target defines — or, for the demo, a workflow hash it honours (section 15
// holds that the nine cards open the tab they name). And no page defines an
// id twice, which makes fragment navigation ambiguous.
const idsOf = {};
for (const f of allPages) {
  const found = [...pageText[f].replace(/<!--[\s\S]*?-->/g, '').matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map(m => m[1]);
  const dupes = [...new Set(found.filter(i => found.indexOf(i) !== found.lastIndexOf(i)))];
  check(!dupes.length, `${f}: no id is defined twice` + (dupes.length ? ' — ' + dupes.slice(0, 5).join(', ') : ''));
  idsOf[f] = new Set(found);
}
const demoRoutes = new Set([...page.matchAll(/data-uc="([a-z]+)"/g)].map(m => m[1]));
const badFragments = allPages.flatMap(f => [...pageText[f].matchAll(/href="\/?([a-z0-9-]+\.html)#([A-Za-z0-9_-]+)"/g)]
  .filter(m => !idsOf[m[1]] || !(idsOf[m[1]].has(m[2]) || (m[1] === 'demo-standalone.html' && demoRoutes.has(m[2]))))
  .map(m => `${f} → ${m[1]}#${m[2]}`));
check(!badFragments.length, 'every cross-page fragment link resolves to an id or a demo route' + (badFragments.length ? ' — ' + badFragments.slice(0, 4).join('; ') : ''));

// No draft note ships. These are the markers found on the production site in
// the 2026-09-04 reviews: HOLD notes, "proposed copy", pricing caveats.
const DRAFT = ['HOLD ·', 'HOLD —', '— HOLD', 'HOLD /', 'Proposed copy', 'not a customer claim', 'not for outreach', 'Do not use them in outreach', 'not a rate card', 'not a published list price'];
const draftHits = allPages.flatMap(f => DRAFT.filter(m => pageText[f].toLowerCase().includes(m.toLowerCase())).map(m => `${f}: ${m}`));
check(!draftHits.length, 'no published page ships a draft note' + (draftHits.length ? ' — ' + draftHits.join('; ') : ''));
// Register ids, tracker rows, PR numbers and review-bot names are internal
// process, not content. Scanned over every published text file, not only the
// pages: a stylesheet comment ships too.
const INTERNAL = /\b(?:IMP|OUT|DD|UA|W2|W3)-\d+\b|\bPR #\d+|\bADR-?0\d{2,}\b|\bCodex\b|\bCopilot\b/g;
const internalHits = [...published, 'robots.txt', 'sitemap.xml', '_headers', '_redirects', 'netlify.toml', 'status-data.json']
  .flatMap(f => [...new Set(read(f).match(INTERNAL) || [])].map(h => `${f}: ${h}`));
check(!internalHits.length, 'no published file carries an internal reference' + (internalHits.length ? ' — ' + internalHits.slice(0, 5).join('; ') : ''));
// The product is the title; the maker is the footer line.
for (const f of allPages) {
  const title = ((/<title>([\s\S]*?)<\/title>/.exec(pageText[f]) || [])[1] || '').trim();
  check(title.includes('SparkAE') && !title.includes('ONE Solution Cyber') && !title.includes('(Spark Assessment Engine)'),
    `${f}: one product name in the title bar (${title})`);
}

// Accessibility floors. A screen reader gets nothing from a styled div above an
// input; six download buttons whose visible text is an extension need names.
// Script bodies are scanned too, because the demo writes its controls into
// template literals.
const unlabelled = allPages.flatMap(f => [...pageText[f].matchAll(/<(input|select|textarea)\b[^>]*>/g)]
  .map(m => m[0]).filter(tag => !/type="hidden"/.test(tag))
  .filter(tag => {
    const id = (/id="([^"]+)"/.exec(tag) || [])[1];
    return !(/aria-label(?:ledby)?=/.test(tag) || (id && pageText[f].includes(`for="${id}"`)));
  }).map(tag => `${f}: ${tag.slice(0, 60)}`));
check(!unlabelled.length, 'every form control has a programmatic label' + (unlabelled.length ? ' — ' + unlabelled.slice(0, 3).join('; ') : ''));
check((page.match(/aria-label="Download /g) || []).length >= 6, 'the download buttons carry accessible names');
// The homepage's structured contact form, and the policy that lets it submit.
check(/<form class="hx-form" name="[a-z-]+" method="POST" data-netlify="true"/.test(home) &&
  ['pr-name', 'pr-org', 'pr-email', 'pr-role'].every(id => home.includes(`id="${id}"`) && home.includes(`for="${id}"`)) &&
  !headers.includes("form-action 'none'") && (headers.match(/form-action 'self'/g) || []).length >= 2,
  'the homepage form is structured and labelled, and the CSP allows it to submit');

// ── 24. the interrogation fix set ───────────────────────────────────────────
// Fifty-six defects from the 2026-09-15 review of engine 1.3.0, each with the
// test the reviewers asked for. Fixtures put the "neighbour" in a SEPARATE
// file: two paragraphs in one file land in one chunk and are one control's own
// evidence, which is not the case these tests are about.
console.log('24. the interrogation fix set');
const difOf = (cid, oid) => (CATALOG[cid].d || []).find(d => d.i === oid);
const AC2G = difOf('AC-2', 'AC-2_g');
const CV_TEXT = 'AC-2 Account Management. Account use is monitored continuously by the ISSO per SSP section 5.2. Most recent scan: 2026-05-28. Reference: CloudVault-SSP.pdf.';
const passes = (res, n) => (gate(res, n) || {}).pass;
// §14's `sub` folds with ||, so a false sub-check followed by another check
// reads as null. This one reads the check itself.
const subOf = (res, n, id) => { const c = ((gate(res, n) || {}).checks || []).find(x => x.id === id); return c ? c.pass : null; };

// 57 (1–3): a later refutation about THIS control, after an earlier one about another
const twoCtl = verdictFor([['ssp.txt',
  'AC-1 Access Control Policy. The access control policy is not implemented.\n\n' +
  'AC-2 Account Management. Account use is monitored continuously by the ISSO per SSP section 5.2. Most recent scan: 2026-05-28. Account monitoring alerting is not implemented for service accounts.']], 'AC-2', AC2G);
check(twoCtl.status === 'Other Than Satisfied' && subOf(twoCtl, 5, '5a') === false && /not implemented/.test(twoCtl.finding),
  'a second "not implemented", about this control, is caught after a first one about another — ' + twoCtl.status + ' / ' + twoCtl.finding);
check(E.detectRefutations('x is not implemented. y is not implemented. z is partially implemented.').length === 3,
  'every occurrence of a refuting pattern is collected, not the first');
const twoIdx = E.buildRefutationIndex(new E.BM25Retriever(E.chunkText(
  'AC-1 Access Control Policy. The access control policy is not implemented.\n\nAC-2 Account Management. Account monitoring is not implemented.', 'ssp.txt')));
check((twoIdx['AC-1'] || []).length === 1 && (twoIdx['AC-2'] || []).length === 1,
  'the corpus refutation index attributes each refutation to the heading that precedes it — ' + JSON.stringify(twoIdx));
// and a refutation under one heading does not refute the control of the heading before it
const underCm1 = verdictFor([['ssp.txt',
  '3.3 AU-3: Content of Audit Records\n\nAudit records contain date/time, event type, user identity and outcome per SSP section 3.3, version 3.2, dated 2026-01-15.\n\n4.1 CM-1: Configuration Management Policy\n\nNot yet fully implemented. The policy is being drafted.']],
  'AU-3', difOf('AU-3', 'AU-3_a'));
check(subOf(underCm1, 5, '5a') === true,
  'a refutation under the CM-1 heading is not charged to AU-3, whose heading is 250 characters earlier — 5a ' + subOf(underCm1, 5, '5a'));

// 58 (8): a neighbour's references do not make this control's evidence Strong
const weakOwn = verdictFor([
  ['ac2.txt', 'AC-2 Account Management. Account use is monitored continuously by the ISSO.'],
  ['ia2.txt', 'IA-2 Identification and Authentication. Multi-factor authentication is enforced per SSP section 6.1, version 2.4, dated 2026-01-15, and "the authentication policy governs all privileged access to the system".'],
], 'AC-2', AC2G);
check(weakOwn.status !== 'Satisfied' && subOf(weakOwn, 3, '3a') === false && weakOwn.evidence_strength === 'weak',
  'gate 3a reads the control\'s own evidence: a neighbour\'s section/version/date cannot make it Strong — ' + weakOwn.evidence_strength);

// 59 (9): a neighbour's ISSO does not resolve this control's role parameter
const AC1A2 = difOf('AC-1', 'AC-1_a.[02]');
const roleNeighbour = verdictFor([
  ['ac1.txt', 'AC-1 Access Control Policy and Procedures. The access control policy is disseminated per SSP section 2.1, version 3.2, dated 2026-01-15.'],
  ['ir1.txt', 'IR-1 Incident Response Policy. The incident response policy is disseminated to the ISSO and the security team per SSP section 9.1.'],
], 'AC-1', AC1A2);
check(roleNeighbour.status !== 'Satisfied' && passes(roleNeighbour, 4) === false && (gate(roleNeighbour, 4).missing || []).some(m => /personnel or roles/.test(m)),
  'gate 4 reads the control\'s own evidence: a neighbour\'s ISSO does not resolve a role parameter this control never named — ' + JSON.stringify(gate(roleNeighbour, 4).missing));
const roleOwn = verdictFor([['ac1.txt', 'AC-1 Access Control Policy and Procedures. The access control policy is disseminated to all system administrators and users per SSP section 2.1, version 3.2, dated 2026-01-15.']], 'AC-1', AC1A2);
check(passes(roleOwn, 4) === true && (gate(roleOwn, 4).resolved || []).some(m => /personnel or roles/.test(m)),
  'a role stated about the objective in the control\'s own evidence resolves it — ' + JSON.stringify(gate(roleOwn, 4).resolved));

// 60 (10): an untyped placeholder is recorded as unverified, and the README does not call it resolved
const untyped = verdictFor([['ac2.txt', 'AC-2 Account Management. Accounts are created following the account management procedures in SSP section 5.1, version 2.4, dated 2026-01-15.']], 'AC-2', difOf('AC-2', 'AC-2_f.[01]'));
check((gate(untyped, 4).unverified || []).some(u => /prerequisites, and criteria/.test(u)) && (untyped.odp_unverified || []).length === 1 && !(gate(untyped, 4).resolved || []).length,
  'an untyped [organization-defined …] placeholder is recorded as unverified, never as resolved — ' + JSON.stringify(gate(untyped, 4)));
const gateRow4 = (readmeSrc.match(/^\| 4 \| ODP \|(.*)$/m) || [])[1] || '';
check(/unverified/.test(gateRow4) && !/parameters resolved/.test(gateRow4),
  'the README gate table says untyped placeholders are unverified, not resolved — ' + gateRow4.trim());

// 61 (11): a [Selection …] is a parameter
const SEL = difOf('AC-1', 'AC-1_a.(1)a.[01]');
const selOdps = E.extractOdps(SEL.t);
check(selOdps.length === 1 && selOdps[0].kind === 'selection' && selOdps[0].options.length === 3,
  'a [Selection (one or more): …] parameter is extracted with its options — ' + JSON.stringify(selOdps));
const selUnsaid = verdictFor([['ac1.txt', 'AC-1 Access Control Policy. The access control policy addresses purpose per SSP section 2.1, version 3.2, dated 2026-01-15.']], 'AC-1', SEL);
const selSaid = verdictFor([['ac1.txt', 'AC-1 Access Control Policy. The organization-level access control policy addresses purpose per SSP section 2.1, version 3.2, dated 2026-01-15.']], 'AC-1', SEL);
check((gate(selUnsaid, 4).unverified || []).length === 1 && (gate(selSaid, 4).resolved || []).length === 1 && !(gate(selSaid, 4).unverified || []).length,
  'a selection is unverified until one of its options is stated about the objective — ' + JSON.stringify([gate(selUnsaid, 4).unverified, gate(selSaid, 4).resolved]));

// 62 (4–6): furniture is not evidence
const furniture = [['ac2.txt', 'AC-2 Account Management. The system mentions accounts sometimes. Reference: SSP section 5.2, version 2.4, dated 2026-05-01.']];
const furnG = verdictFor(furniture, 'AC-2', AC2G);
const furnJ = verdictFor(furniture, 'AC-2', difOf('AC-2', 'AC-2_j'));
check(furnG.status !== 'Satisfied' && furnJ.status !== 'Satisfied' && subOf(furnG, 2, '2a') === false && subOf(furnG, 2, '2b') === false,
  '"mentions accounts sometimes" satisfies neither AC-2_g nor AC-2_j — ' + furnG.status + ' / ' + furnJ.status);
check(verdictFor([['ac2.txt', CV_TEXT]], 'AC-2', AC2G).status === 'Satisfied',
  'and the account-monitoring sentence that IS about the objective still satisfies AC-2_g');
const covOne = E.checkCoverage(['use of accounts is monitored'], 'The system mentions accounts sometimes.');
const covTwo = E.checkCoverage(['use of accounts is monitored'], 'Account use is monitored by the ISSO.');
check(covOne.ratio === 0 && covTwo.ratio === 1,
  'a concept with two distinguishing terms needs two of them, not one — ' + covOne.ratio + ' / ' + covTwo.ratio);
check(!E.mentionsSubject('The system mentions accounts sometimes.', ['account'], E.objectiveAnchorStems(AC2G.t)) &&
  E.mentionsSubject('Account use is monitored.', ['account'], E.objectiveAnchorStems(AC2G.t)),
  'a one-term subject has to be named beside a word of the objective, not as furniture');
const loneHit = new E.BM25Retriever(E.chunkText('AC-2 Account Management. The system mentions accounts sometimes.', 'x.txt')).query(AC2G.t + ' Account Management Access Control', 8, 'AC-2');
check(loneHit.length === 1 && loneHit[0].score < 1 && loneHit[0].score === Math.round(loneHit[0].score * 10000) / 10000,
  'a lone chunk is not min-maxed to 1.0: its score is the share of the objective\'s terms it names — ' + (loneHit[0] || {}).score);

// 63 (7): a tagged chunk that shares no term with the objective is not boosted over one that answers it
const seeAc2 = [];
for (let i = 0; i < 8; i++) seeAc2.push(['ref' + i + '.txt', 'See AC-2.']);
seeAc2.push(['ssp.txt', 'Account use is monitored continuously by the ISSO and reviewed per SSP section 5.2. Most recent scan: 2026-05-28.']);
const seeChunks = seeAc2.flatMap(([n, t]) => E.chunkText(t, n));
const seeHits = new E.BM25Retriever(seeChunks).query(AC2G.t + ' Account Management Access Control', 8, 'AC-2');
check(seeHits.some(h => h.filename === 'ssp.txt') && !seeHits.some(h => /^ref\d/.test(h.filename)),
  'eight tagged "See AC-2" chunks do not push the untagged answering paragraph out of the top K — ' + JSON.stringify(seeHits.map(h => h.filename)));
check(verdictFor(seeAc2, 'AC-2', AC2G).status === 'Satisfied', 'and that paragraph carries the objective to Satisfied');

// 64 (13–14): an upper-case homoglyph draft marker
const upperHomo = verdictFor([['ac2.txt', CV_TEXT + ' Note: Рlaceholder text remains in this section.']], 'AC-2', AC2G);
check(E.foldHomoglyphs('Рlaceholder') === 'Placeholder' && subOf(upperHomo, 5, '5c') === false && upperHomo.status === 'Other Than Satisfied',
  '"Рlaceholder" with a Cyrillic capital Er folds to "Placeholder" and fails gate 5c — ' + E.foldHomoglyphs('Рlaceholder') + ' / 5c ' + subOf(upperHomo, 5, '5c'));

// 65 (16): a stale review is not laundered by a later untyped date
const staleReview = verdictFor([['ac2.txt', CV_TEXT + ' Last reviewed: 2023-01-10.']], 'AC-2', AC2G);
const freshReview = verdictFor([['ac2.txt', CV_TEXT + ' Last reviewed: 2026-03-01.']], 'AC-2', AC2G);
check(subOf(staleReview, 6, '6a') === false && staleReview.temporal_status === 'stale' && /review_date: 2023-01-10/.test(staleReview.gap_description),
  'a review dated 2023 fails currency although a scan two sentences on is dated 2026 — ' + staleReview.gap_description);
check(subOf(freshReview, 6, '6a') === true && freshReview.temporal_status === 'current',
  'and a fresh review passes it');
const dated = E.extractDates('Last reviewed: 2023-01-10. Most recent scan: 2026-05-28.');
check(dated.length === 2 && dated.find(d => d.dateStr === '2023-01-10').ctxType === 'review_date' && dated.find(d => d.dateStr === '2026-05-28').ctxType === 'unknown',
  'a date\'s type is read from its own sentence, not from the forty characters around it — ' + JSON.stringify(dated.map(d => d.dateStr + ':' + d.ctxType)));

// 17: undated evidence is undated, not current. 1.4.0 stopped calling it
// current and flagged it while still PASSING gate 6a; since 1.6.0 it fails,
// because currency meant "no evidence it is stale" rather than "evidence it is
// current" and gate 6 exists to establish the latter.
const undatedRun = verdictFor([['ac2.txt', 'AC-2 Account Management. Account use is monitored continuously by the ISSO per SSP section 5.2, version 2.4.']], 'AC-2', AC2G);
const undatedG6 = undatedRun.gates.find(g => g.gate === 6);
check(undatedRun.temporal_status === 'undated' && undatedG6.checks[0].undated === true &&
      undatedG6.checks[0].pass === false && undatedG6.pass === false &&
      undatedRun.status === 'Other Than Satisfied' && /no date/.test(undatedRun.gap_description),
  'evidence with no date fails currency rather than passing it — ' + undatedRun.temporal_status + ' / ' + undatedRun.status + ' / ' + undatedRun.gap_description);

// 66 (18): the SLA check reads every date format
const slaMonth = E.checkOpenFindingSla('The high vulnerability CVE-2024-0001 remains open since January 1, 2024.', asOfDate);
const slaIso = E.checkOpenFindingSla('The high vulnerability CVE-2024-0001 remains open since 2024-01-01.', asOfDate);
check(!!slaMonth && slaMonth === slaIso, 'an open finding dated "January 1, 2024" gets the SLA verdict its ISO twin gets — ' + slaMonth);

// 15: the stemmer keeps one lexeme together
check(E.stemWord('access') === E.stemWord('accessing') && E.stemWord('process') === E.stemWord('processes') &&
  E.stemWord('creation') === E.stemWord('created') && E.stemsAgree(E.stemWord('implementation'), E.stemWord('implemented')),
  'access/accessing, process/processes, creation/created and implementation/implemented each stem as one word');

// anchors are content words: a stop word is dropped as a WORD, before stemming
const anchors = E.objectiveAnchorStems('Determine if accounts are reviewed during other periods, only when [organization-defined frequency] applies under review');
check(anchors.has('account') && anchors.has('review') && anchors.has('period') &&
  !anchors.has('oth') && !anchors.has('dur') && !anchors.has('onli') && !anchors.has('und') && !anchors.has('when'),
  'objective anchor stems carry no stemmed stop word (other→oth, during→dur, only→onli, under→und) and no stop word (when) — ' + [...anchors].join(','));

// 19: the ruleset digest covers the matchers
const rp = E.RULESET.patterns || {};
check(Array.isArray(rp.refuting) && rp.refuting.length >= 10 && rp.draft && rp.draft.source && Array.isArray(rp.negation_pairs) &&
  Array.isArray(rp.homoglyphs) && Array.isArray(rp.stem_suffixes) && rp.odp && rp.odp.frequency && Array.isArray(rp.strength) && Array.isArray(rp.dates),
  'RULESET publishes the refuting, draft, negation, homoglyph, stem, ODP, strength and date matchers');
const digestNow = EX.sha1Hex(EX.stableJson(E.RULESET));
const digestEdited = EX.sha1Hex(EX.stableJson({ ...E.RULESET, patterns: { ...rp, draft: { source: rp.draft.source + '|xyzzy', flags: rp.draft.flags } } }));
check(digestNow === a.summary.ruleset_digest && digestNow !== digestEdited,
  'a pattern-only edit moves the ruleset digest');

// 67 (22, 31): the receipt verifies against its own digest, file lists and all
const rcChunks = E.chunkText(CV_TEXT, 'ssp.txt');
const rc = EX.buildReceipt({ engineVersion: E.ENGINE_VERSION, catalogVersion, catalog: CATALOG, ruleset: E.RULESET, chunks: rcChunks,
  findings: [verdictFor([['ssp.txt', CV_TEXT]], 'AC-2', AC2G)], assessmentDate: SAMPLE_DATE, baseline: 'Low',
  systemName: 'Uploaded package', filesParsed: ['ssp.txt'], filesRefused: ['scan.pdf — .pdf text extraction is not available'] });
const rcBack = JSON.parse(JSON.stringify(rc));
check(rcBack.system_name === 'Uploaded package' && rcBack.files_parsed[0] === 'ssp.txt' && rcBack.files_refused.length === 1 &&
  EX.receiptDigestOf(rcBack) === rcBack.receipt_digest,
  'a downloaded receipt carrying system_name and the file lists re-hashes to its own receipt_digest');
check(page.includes('systemName: corpus.bundled') && page.includes('filesParsed: corpus.parsed.slice()') && !/receipt\.(?:system_name|files_parsed|files_refused)\s*=/.test(page),
  'the page hands those fields to buildReceipt rather than writing them after the digest');

// 68/69 (23–24): OSCAL risks follow the effective determination
const otsWithRefs = a.findings.find(f => f.status === 'Other Than Satisfied' && (f.evidence_references || []).length);
const satOne = a.findings.find(f => f.status === 'Satisfied');
const revs = {}; revs[otsWithRefs.objective_id] = { status: 'Satisfied', statement: 'Confirmed by the assessor per §5.2.' };
revs[satOne.objective_id] = { status: 'Other Than Satisfied', statement: 'The assessor could not confirm this against the interview record.' };
const arRev = EX.buildAssessmentResults(a.state, { revisions: revs });
const resRev = arRev['assessment-results'].results[0];
const riskIds = new Set((resRev.risks || []).map(r => r.uuid));
const findRev = (id) => (resRev.findings || []).find(f => f['target-id'] === undefined && f.title === 'Assessment of ' + id);
const fUp = findRev(otsWithRefs.objective_id), fDown = findRev(satOne.objective_id);
check(fUp && fUp.target.status.state === 'satisfied' && !fUp['related-risks'] && (fUp['related-observations'] || []).length > 0,
  'OTS→SAT: the satisfied target carries no open risk and its observations are emitted');
const downRisk = fDown && (fDown['related-risks'] || [])[0] && (resRev.risks || []).find(r => r.uuid === fDown['related-risks'][0]['risk-uuid']);
check(fDown && fDown.target.status.state === 'not-satisfied' && !!downRisk && downRisk.status === 'open' && riskIds.has(downRisk.uuid) &&
  downRisk.characterizations[0].origin.actors[0].type === 'party' &&
  (downRisk.props || []).some(p => p.name === 'determination-source' && p.value === 'assessor-revision') && /interview record/.test(downRisk.statement),
  'SAT→OTS: a risk exists, is open, is declared, and names the assessor as its origin');
const revNotSat = (resRev.findings || []).filter(f => f.target.status.state === 'not-satisfied' && !(f.props || []).some(p => p.name === 'determination' && p.value === 'Not Reviewed'));
check(revNotSat.every(f => (f['related-risks'] || []).length === 1 && riskIds.has(f['related-risks'][0]['risk-uuid'])) &&
  (resRev.findings || []).filter(f => f.target.status.state === 'satisfied').every(f => !f['related-risks']),
  'after revisions every not-satisfied finding points at a declared risk and no satisfied finding points at one');
check(JSON.stringify(arRev['assessment-results'].metadata.props) === JSON.stringify(a.ar['assessment-results'].metadata.props),
  'and the receipt in metadata still attests the engine run');

// 30: the summary counts its own columns
const findingsWidth = csvRecords(EX.buildFindingsCSV(a.state, {}))[0].length;
check(EX.buildSummary(a.state, {}).includes(findingsWidth + '-column assessment export'),
  'the summary states the findings CSV width it actually has (' + findingsWidth + ')');

// 71 (32–33): housekeeping members are refused by the engine, and the inventory is the engine's read
const macosx = await E.parsePackage([asFile(buildZip([
  { name: '__MACOSX/._ssp.txt', bytes: new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0, 65, 67, 45, 50, 32, 110, 111, 116, 32, 105, 109, 112, 108, 101, 109, 101, 110, 116, 101, 100]) },
  { name: '.DS_Store', bytes: new Uint8Array(64) },
  { name: 'ssp.txt', text: CV_TEXT },
]), 'mac.zip')]);
check(macosx.parsed.length === 1 && macosx.parsed[0] === 'ssp.txt' && macosx.chunks.every(c => c.filename === 'ssp.txt') &&
  macosx.skipped.length === 2 && macosx.skipped.every(x => /housekeeping/.test(x.reason)) &&
  macosx.members.length === 3 && macosx.members.filter(m => m.refusedReason).length === 2,
  '__MACOSX and .DS_Store members are refused by name and never reach the corpus; the member listing and the refusals agree — ' + JSON.stringify(refusals(macosx)));
check(page.includes('const report = await window.SparkAEEngine.parsePackage(files);') && !page.includes('window.SparkAEEngine.unzip(') &&
  page.includes('CUSTOM_PKG_REPORT = { files, report: pkg.report };') && page.includes('? CUSTOM_PKG_REPORT.report'),
  'the page reads a package once, through parsePackage, and the run reuses that read');

// 72 (20): a comment carrying a fake end-of-directory signature
const commented = (members, comment) => {
  const z = buildZip(members);
  const out = new Uint8Array(z.length + comment.length);
  out.set(z, 0); out.set(comment, z.length);
  new DataView(out.buffer).setUint16(z.length - 2, comment.length, true);
  return out;
};
const fakeInComment = new Uint8Array(40);
fakeInComment.set([0x50, 0x4b, 0x05, 0x06], 10);            // PK\x05\x06 with zeroes after: "0 members at offset 0"
const commentZip = await E.parseZipReport(asFile(commented([{ name: 'a.txt', text: 'first member' }, { name: 'b.txt', text: 'second member' }], fakeInComment), 'comment.zip'));
check(commentZip.parsed.length === 2 && commentZip.skipped.length === 0,
  'an archive whose comment contains a fake end-of-directory signature still parses its members — ' + JSON.stringify(commentZip.parsed) + ' ' + JSON.stringify(refusals(commentZip)));
const selfConsistentFake = new Uint8Array(22);
selfConsistentFake.set([0x50, 0x4b, 0x05, 0x06], 0);        // a second, self-consistent record at the very end
const twoEocd = await E.parseZipReport(asFile(commented([{ name: 'a.txt', text: 'first member' }], selfConsistentFake), 'two-eocd.zip'));
check(twoEocd.parsed.length === 0 && refusals(twoEocd).some(r => /ambiguous/.test(r)),
  'two self-consistent end-of-directory records are refused as ambiguous, not resolved by position — ' + JSON.stringify(refusals(twoEocd)));

// 73 (21): a member whose bytes do not match its CRC-32
const badCrc = await E.parseZipReport(asFile(buildZip([{ name: 'ssp.txt', text: CV_TEXT }],
  { patch: (cv) => cv.setUint32(16, cv.getUint32(16, true) ^ 0xFFFFFFFF, true) }), 'bad-crc.zip'));
check(badCrc.parsed.length === 0 && badCrc.chunks.length === 0 && refusals(badCrc).some(r => /CRC-32/.test(r)),
  'a member that fails its CRC-32 is refused by name, not read — ' + JSON.stringify(refusals(badCrc)));
check(E.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, 'the engine\'s CRC-32 is IEEE 802.3 (check value cbf43926)');

// 76 (42): §02–§09 idle copy says walkthrough, and does not say the engine ran
const useCasesSrc = page.slice(page.indexOf('const USE_CASES = {'), page.indexOf('const SEVERITY_ORDER'));
const idleCopies = [...useCasesSrc.matchAll(/\n  ([a-z]+): \{[\s\S]*?idleCopy: '((?:[^'\\]|\\.)*)'/g)].map(m => [m[1], m[2]]);
const badIdle = idleCopies.filter(([k, c]) => k !== 'initial' && (!/walkthrough/i.test(c) || /\b(?:engine|validator|agent) (?:will|executes?|ingests?|runs?)\b/i.test(c)));
check(/^  initial: \{\n(?:.*\n)*?    idleCopy: 'Select the sample SSP or upload a package/m.test(useCasesSrc),
  '§01 idle copy is the live-engine copy — the one tab that runs still says so');
check(idleCopies.length === 9 && !badIdle.length,
  'every §02–§09 idle copy calls itself a walkthrough and none says the engine will ingest or execute' + (badIdle.length ? ' — ' + badIdle.map(b => b[0]).join(', ') : ''));
check(!/ready for submission to the authorizing agency/.test(page) && !/The 3PAO examined the customer-uploaded/.test(page) && !/50 \+ \(seed % 100\)/.test(page) && !/200 \+ seed % 800/.test(page),
  'the ConMon walkthrough no longer ends at a submission, and the custom sample fabricates no findings or figures');
check(!/function parsePdfText|function parsePoamXlsx|typeof XLSX|window\.pdfjsLib\.getDocument/.test(page),
  'the page carries no PDF or XLSX reader that could only ever return null');
const customBlock = page.slice(page.indexOf("  SAMPLES['custom'] = {"), page.indexOf('function scanHasContent'));
check(/annual: null,/.test(customBlock) && /scr: null,/.test(customBlock) && /ksi: null,/.test(customBlock) && !/themes: \{ AFR/.test(customBlock) &&
  /if \(!sample\.annual\) return stopWalkthroughWithoutRecord/.test(page) && /if \(!sample\.scr\) return stopWalkthroughWithoutRecord/.test(page) && /if \(!sample\.ksi\) return stopWalkthroughWithoutRecord/.test(page),
  'an upload carries no annual, SCR or KSI record — no placeholder cohorts or KSI themes — and each of those runners stops rather than reads one');
// 46–56: every name a walkthrough logs is escaped
const rawLogNames = [...page.matchAll(/log\([^\n]*\$\{(?:sample\.name|f|SAMPLES\[k\]\.name)\}/g)].concat([...page.matchAll(/log\([^\n]*' \+ sample\.name \+ '/g)]);
check(!rawLogNames.length, 'no log() call interpolates a sample or file name unescaped' + (rawLogNames.length ? ' — ' + rawLogNames[0][0].slice(0, 80) : ''));
// 34–36: one painter, escaping at the sink
check(!page.includes('_paintFindingsCascade') && (page.match(/^function paintFindings\(/gm) || []).length === 1 && !/^paintFindings = function/m.test(page) &&
  page.includes("'<td>' + engEsc(f.text) + (f.metaHtml || '') + renderCites(f.cites)"),
  'one painter builds every row through buildFindingRow, and the row escapes the finding text at the sink');


// ── 25. normalise before you match ──────────────────────────────────────────
// Four ways a document could read as compliant while saying otherwise. None of
// them is exercised by the bundled sample — it names no enhancement, carries no
// invisible character and no entity, and is not stuffed — so these cases are
// what holds the fixes. The verdict digest does not move across them.
console.log('25. normalise before you match');

// ITEM 1: an enhancement id is a control of its own, not a mention of its base.
check(JSON.stringify(E.extractControlIds('AC-2(1) is implemented')) === '["AC-2(1)"]',
  'an enhancement id followed by a space is the enhancement, not the base control — ' + JSON.stringify(E.extractControlIds('AC-2(1) is implemented')));
check(JSON.stringify(E.extractControlIds('AC-2(1), AC-17(3).')) === '["AC-2(1)","AC-17(3)"]',
  'enhancement ids are read before a comma and before a full stop — ' + JSON.stringify(E.extractControlIds('AC-2(1), AC-17(3).')));
check(JSON.stringify(E.extractControlIds('see AC-2(1)')) === '["AC-2(1)"]',
  'an enhancement id at the end of the text is read');
check(JSON.stringify(E.extractControlIds('AC-25 applies')) === '["AC-25"]' &&
      JSON.stringify(E.extractControlIds('AC-2abc')) === '[]',
  'the close still refuses AC-2 inside AC-25 and inside AC-2abc');
const enhDif = (CATALOG['AC-2(1)'] || {}).d ? CATALOG['AC-2(1)'].d[0] : null;
const enhOts = enhDif ? verdictFor([['ssp.txt',
  'AC-2(1) Automated System Account Management. Automated account management is not implemented for this system.']],
  'AC-2(1)', enhDif) : null;
check(!!enhDif && enhOts.status === 'Other Than Satisfied' && sub(enhOts, 5, '5a') === false,
  '"AC-2(1) … is not implemented" refuses AC-2(1) on its own evidence — ' + (enhOts ? enhOts.status : 'no dif'));
const enhIdx = E.buildRefutationIndex(new E.BM25Retriever(E.chunkText(
  'AC-2 Account Management. Accounts are reviewed quarterly.\n\nAC-2(1) Automated Account Management. Automation is not implemented.', 'ssp.txt')));
check(!(enhIdx['AC-2'] || []).length && (enhIdx['AC-2(1)'] || []).length === 1,
  'a refutation under an enhancement heading is charged to the enhancement, not to its base control — ' + JSON.stringify(enhIdx));

// ITEM 4: invisible characters render as nothing and must not hide a refutation.
for (const [name, text] of [['zero-width space', 'not​implemented'], ['zero-width non-joiner', 'not‌implemented'],
                            ['word joiner', 'not⁠implemented'], ['byte-order mark', 'not﻿implemented'],
                            ['soft hyphen', 'the control is not imple­mented']])
  check(E.detectRefutations(E.foldHomoglyphs(text)).length > 0,
    'a refutation split by a ' + name + ' still refutes');
check(E.foldHomoglyphs('place​holder') === 'placeholder' && E.foldHomoglyphs('not implemented') === 'not implemented',
  'the fold deletes invisible characters and leaves honest text byte-identical');
check(!E.detectRefutations(E.foldHomoglyphs('The policy is implemented, reviewed annually and disseminated to all personnel.')).length,
  'the welded-word tolerance raises no refutation on ordinary prose');
const zwsp = verdictFor([['ssp.txt',
  'AC-1 Access Control Policy. The access control policy is not​implemented. See SSP section 2, version 3, dated 2026-01-15.']],
  'AC-1', difOf('AC-1', 'AC-1_a.[01]'));
check(zwsp.status === 'Other Than Satisfied' && sub(zwsp, 5, '5a') === false,
  'an AC-1 body refuted through a zero-width space is Other Than Satisfied — ' + zwsp.status);

// ITEM 5: a character written as a reference is that character.
check(E.decodeEntities('not&#x200B;implemented') === 'not​implemented' &&
      E.decodeEntities('not&nbsp;implemented') === 'not implemented' &&
      E.decodeEntities('not&#32;implemented') === 'not implemented',
  'numeric and nbsp references decode to the characters they name');
check(E.decodeEntities('&amp;lt;') === '&lt;', 'a reference is decoded once and the result is not re-scanned');
check(E.decodeEntities('a &foo; b') === 'a &foo; b' && E.decodeEntities('&#xD800;') === '&#xD800;',
  'an unknown reference and a lone surrogate are left as written');
check(E.decodeEntities('&lt;a&gt; &amp; &quot;x&quot; &apos;y&apos;') === '<a> & "x" \'y\'',
  'the five XML names still decode');
for (const [name, body] of [['&#x200B;', 'not&#x200B;implemented'], ['&nbsp;', 'not&nbsp;implemented'], ['&#32;', 'not&#32;implemented']])
  check(E.detectRefutations(E.foldHomoglyphs(E.decodeEntities(body))).length > 0,
    'a refutation written as ' + name + ' still refutes once decoded');

// Every matcher the ruleset publishes runs in linear time on a run of spaces.
// Two carried a whitespace quantifier on each side of an optional group, so a
// run could be split between them every possible way: quadratic, 306ms on
// twenty thousand spaces before the fix and tens of seconds on a realistic
// document, in a parser that reads whatever a visitor drops on the page.
const evilRun = 'enforcement' + ' '.repeat(20000) + 'x';
const evilScan = 'scan' + ' '.repeat(20000) + 'x';
const slowest = (() => {
  const seen = [];
  const walk = (o) => { for (const k in o) { const v = o[k];
    if (v && typeof v === 'object') { if (typeof v.source === 'string') seen.push([k, v]); else walk(v); } } };
  walk(E.RULESET);
  let worst = ['(none)', 0];
  for (const [name, spec] of seen) {
    let re; try { re = new RegExp(spec.source, spec.flags.replace('g', '')); } catch (e) { continue; }
    for (const evil of [evilRun, evilScan]) {
      const t = Date.now(); re.test(evil); const ms = Date.now() - t;
      if (ms > worst[1]) worst = [name, ms];
    }
  }
  return worst;
})();
check(slowest[1] < 100, 'every matcher in RULESET runs in linear time on a 20k-space run — slowest: ' + slowest[0] + ' ' + slowest[1] + 'ms');
check(E.detectRefutations('logging is absent').length === 1 && E.detectRefutations('enforcement absent').length === 1 &&
      E.detectRefutations('monitoring was absent').length === 1,
  'the absent matcher still reads the auxiliary it carries, and reads it missing');

// ITEM 8: stuffing is repetition as a share of the passage, not a raw count.
const KW = 'access control policy account management audit review logging';
check(E.evidenceLooksStuffed(Array(12).fill(KW).join(' ')), 'an unpunctuated keyword run reads as stuffed');
check(E.evidenceLooksStuffed(Array(12).fill(KW).join('. ')), 'the same keyword run reads as stuffed with a full stop after each');
check(E.evidenceLooksStuffed(Array(12).fill(KW).join('; ')), 'and with a semicolon after each');
// The regression this parameter exists for, on real data rather than a guess:
// most of what reaches evidenceLooksStuffed is the retrieval union, and an SSP
// opens each section with its own name. Counting duplicate 5-grams without
// weighing them against the length of the passage read the bundled sample's
// own union as stuffed and cost nineteen determinations.
const unionRetriever = new E.BM25Retriever(E.chunkText(sample, 'CloudVault-Federal-SSP.txt'));
const ir2 = difOf('IR-2', 'IR-2a.01') || (CATALOG['IR-2'].d || []).filter(d => d.b.includes('Low'))[0];
const unionText = E.foldHomoglyphs(unionRetriever.query(ir2.t, 8, 'IR-2').map(h => h.text).join('\n\n'));
check(unionText.split(/\s+/).length > 200 && !E.evidenceLooksStuffed(unionText),
  "the bundled sample's own retrieval union, whose sections share a house-style opening, is not stuffed — " +
  unionText.split(/\s+/).length + ' words');


// ── 26. the exports say what the engine decided ─────────────────────────────
// A determination the engine qualified, or a column it cannot fill, has to
// reach the artifact a reader acts on. None of this changes a determination:
// the sample's 153 / 808 / 20 are the same objectives as before.
console.log('26. the exports say what the engine decided');

const flaggedFindings = a.findings.filter(f => f.review_required);
const csv26 = csvRecords(EX.buildFindingsCSV(a.state, {}));
const head26 = csv26[0];
const colOf = (name) => head26.indexOf(name);
check(flaggedFindings.length > 0 && a.findings.every(f => !f.review_required || f.status === 'Satisfied'),
  'the engine flags only Satisfied determinations for review — ' + flaggedFindings.length + ' of them');
check(colOf('Review Required') > -1 && colOf('Review Reason') > -1,
  'the findings CSV carries Review Required and Review Reason');
check(csv26.slice(1).filter(r => r[colOf('Review Required')] === 'Yes').length === flaggedFindings.length,
  'every flagged determination is marked Yes in the findings CSV');
check(csv26.slice(1).every(r => r[colOf('Review Required')] !== 'Yes' || r[colOf('Review Reason')]),
  'a flagged row states the reason the floor was not met');
const tcw26 = csvRecords(EX.buildTCW(a.state, {}));
check(tcw26[0].indexOf('Review Required') > -1 &&
      tcw26.slice(1).filter(r => r[tcw26[0].indexOf('Review Required')] === 'Yes').length === flaggedFindings.length,
  'the TCW carries the flag too');
const arProps = JSON.stringify(a.ar);
check((arProps.match(/"review-required"/g) || []).length === flaggedFindings.length,
  'OSCAL carries a review-required prop on each flagged finding');
check(EX.buildSummary(a.state, {}).includes('of which flagged for review: ' + flaggedFindings.length),
  'the summary states how many of its Satisfied are flagged');
// The receipt attests the flag, so an export that drops it no longer verifies.
const flagStripped = EX.buildReceipt({
  engineVersion: E.ENGINE_VERSION, catalogVersion, catalog: CATALOG, ruleset: E.RULESET,
  chunks: E.chunkText(sample, 'CloudVault-Federal-SSP.txt'),
  findings: a.findings.map(f => ({ ...f, review_required: false })),
  assessmentDate: SAMPLE_DATE, baseline: 'Low',
});
check(flagStripped.verdict_digest !== a.state.receipt.verdict_digest,
  'the verdict digest covers the review flag: a run with the flags stripped does not hash the same');

// 23: Not Reviewed is a gap in the package, not an open weakness
const poam26 = csvRecords(EX.buildPOAM(a.state, {})).slice(1);
const ret26 = csvRecords(EX.buildRET(a.state, {})).slice(1);
const ots26 = a.findings.filter(f => f.status === 'Other Than Satisfied').length;
const nr26 = a.findings.filter(f => f.status === 'Not Reviewed').length;
check(nr26 > 0 && poam26.length === ots26 && poam26.length === ret26.length,
  'the POA&M carries the Other Than Satisfied and not the ' + nr26 + ' Not Reviewed, and agrees with the RET');

// 29: the detection date says which detection it is
check(poam26[0].some(c => c.includes('Original Detection Date is the date of this assessment')) &&
      ret26[0].some(c => c.includes('cannot establish an earlier detection')),
  'the RET and POA&M say that their detection date is this assessment, not an earlier one');

// 27: no invented FedRAMP origination
check(!EX.buildTCW(a.state, {}).includes('Service Provider Corporate') &&
      EX.buildTCW(a.state, {}).includes('not determined by this build'),
  'the TCW states that control origination is not determined rather than stamping a FedRAMP value');

// 28: a column this build does not fill says so, and only where it would mean something
const otsRow26 = csv26.slice(1).find(r => r[2] === 'Other Than Satisfied');
const satRow26 = csv26.slice(1).find(r => r[2] === 'Satisfied');
check(otsRow26.filter(c => c === 'not produced by this build').length === 4,
  'the four FedRAMP columns this build does not produce say so on a row that carries a weakness');
check(!satRow26.some(c => c === 'not produced by this build'),
  'and stay blank on a Satisfied row, which has no threat or residual risk to state');

// 25: a cut evidence body says it was cut
const cut = a.findings.find(f => (f.evidence_description || '').includes('truncated for this artifact'));
check(!!cut && /\d+ characters of evidence were assessed/.test(cut.evidence_description),
  'an evidence body the artifact truncates says so and names the length the gates read');
check(E.evidenceDescription('short') === 'short', 'a body under the limit is untouched');


// ── 27. the product calls ───────────────────────────────────────────────────
// Three decisions the 1.3.0 review left open, taken deliberately rather than
// patched quietly. None of them moves a determination on the bundled sample.
console.log('27. the product calls');

// ITEM 6: the catalog's FedRAMP value is carried, and NOT compared.
const withValue = a.findings.filter(f => f.odp_expected);
check(withValue.length > 0, 'the catalog value reaches the determination — ' + withValue.length + ' of ' + a.findings.length + ' objectives carry one');
const ac1c11 = a.findings.find(f => f.objective_id === 'AC-1_c.1-1');
check(!!ac1c11 && ac1c11.odp_expected === 'at least every 3 years',
  "the value is FedRAMP's text with the objective prefix stripped — " + (ac1c11 && JSON.stringify(ac1c11.odp_expected)));
check(a.findings.every(f => !f.odp_expected || !/^[A-Z]{2}-\d/.test(f.odp_expected)),
  'no carried value still has its "AC-1 (c) (1):" prefix');
// The comparison is deliberately not made: a value of the right kind resolves
// the parameter whether or not it is the required one. Asserting this keeps a
// later change from claiming the comparison without doing it.
const threeYear = 'Determine if the current access control policy is reviewed and updated [organization-defined frequency];';
const tooRare = E.validateOdps(threeYear, 'The access control policy is reviewed and updated every 10 years.', 'AC-1 (c) (1): at least every 3 years');
check(tooRare.satisfied === true && tooRare.expected === 'at least every 3 years',
  'gate 4 resolves a parameter of the right kind without judging the value, and carries the required value beside it');
const csv27 = csvRecords(EX.buildFindingsCSV(a.state, {}));
const valueCol = csv27[0].indexOf('FedRAMP Parameter Value');
check(valueCol > -1 && csv27.slice(1).filter(r => r[valueCol]).length === withValue.length,
  'every carried value reaches the findings CSV');
check((JSON.stringify(a.ar).match(/"fedramp-parameter-value"/g) || []).length === withValue.length,
  'and the OSCAL findings, as a FedRAMP-namespaced prop');

// ITEM 9: undated fails currency. It costs nothing here, which is the argument.
const undatedCount = a.findings.filter(f => f.temporal_status === 'undated').length;
check(undatedCount > 0 && a.findings.every(f => f.temporal_status !== 'undated' || f.status === 'Other Than Satisfied'),
  'no objective is Satisfied on evidence carrying no date — ' + undatedCount + ' are undated and every one is Other Than Satisfied');
check(a.findings.every(f => f.temporal_status !== 'undated' || (f.gates.find(g => g.gate === 6) || {}).pass === false),
  'undated fails gate 6 rather than passing it');

// ITEM 11: an unverified parameter is a floor, not a refusal.
const unver = a.findings.filter(f => (f.odp_unverified || []).length);
const unverSat = unver.filter(f => f.status === 'Satisfied');
check(unverSat.length > 0 && unverSat.every(f => f.review_required),
  'every Satisfied carrying a parameter this build could not verify is flagged for review — ' + unverSat.length + ' of them');
check(unverSat.every(f => /not verified by this build/.test(f.review_reason)),
  'and the reason names the unverified parameter');
check(unver.some(f => f.status === 'Satisfied'),
  'an unverified parameter does not by itself refuse the objective — the gates decide the verdict, the floors decide whether a human must look');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
