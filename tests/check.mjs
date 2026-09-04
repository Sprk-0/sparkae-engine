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
//
// Usage:  node tests/check.mjs [site-root] [--write-golden]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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
const ctx = { module: { exports: {} }, console };
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
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sample-ar.json'), a.arText);
ok('wrote tests/out/sample-ar.json for check_oscal_schema.py');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
