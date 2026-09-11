#!/usr/bin/env node
// SparkAE public reference build — accuracy benchmark.
//
// tests/check.mjs asks whether the engine is REPRODUCIBLE. This asks whether it
// is RIGHT, which is a different question: a build can be perfectly
// reproducible and still return Satisfied for an awareness-and-training
// objective from two documents about account monitoring, as the 2026-09-11
// upload review demonstrated.
//
// Each case in tests/benchmark/cases.json pairs one objective with a fixed
// document set and states the determination a competent assessor would reach
// from those documents alone. See tests/benchmark/README.md for what a score
// here does and does not mean — in short: it measures the engine against cases
// someone chose, and no score here supports a claim of assessment readiness.
//
// In a case sourced `external-review` the documents are an outside reviewer's
// own uploads, submitted before the fixes that address them existed; one of the
// three is the reviewer's reproduction end to end, and the other two pair those
// documents with objectives they do address. Cases sourced `engine-repo` are
// ours in both halves and test what their author already believed. The two
// populations are scored separately and never merged.
//
// Usage:  node tests/benchmark.mjs [site-root] [--json]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const root = path.resolve(args.find(a => !a.startsWith('--')) || path.join(here, '..'));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'benchmark', 'cases.json'), 'utf8'));

const ctx = { module: { exports: {} }, console, TextDecoder, TextEncoder, DecompressionStream };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['demo-standalone-catalog.js', 'demo-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const E = ctx.SparkAEEngine, CATALOG = ctx.CATALOG;

const asOf = new Date(spec.assessment_date + 'T00:00:00Z');

function runCase(c) {
  const control = CATALOG[c.control];
  if (!control) return { error: 'control ' + c.control + ' is not in the catalog' };
  const dif = (control.d || []).find(d => d.i === c.objective);
  if (!dif) return { error: 'objective ' + c.objective + ' is not in ' + c.control };
  const chunks = c.documents.flatMap(d => E.chunkText(d.text, d.name));
  const retriever = new E.BM25Retriever(chunks);
  const res = E.assessDif(dif, retriever, c.control, control.T, control.F,
    E.buildRefutationIndex(retriever), asOf);
  const gate2 = (res.gates || []).find(g => g.gate === 2) || {};
  return {
    status: res.status,
    // The benchmark's question is binary: did it pass evidence that should not
    // have passed, or refuse evidence that should have. Not Reviewed and Other
    // Than Satisfied are both "not satisfied" for that purpose — they differ in
    // what an assessor does next, not in whether the engine claimed compliance.
    satisfied: res.status === 'Satisfied',
    review_required: !!res.review_required,
    confidence: res.confidence,
    gate2: (gate2.checks || []).map(x => x.id + '=' + x.pass).join(' ') || String(gate2.pass),
    failed_gates: (res.gates || []).filter(g => !g.pass).map(g => g.gate),
  };
}

const results = spec.cases.map(c => {
  const out = runCase(c);
  const expectSatisfied = c.expect === 'satisfied';
  const correct = !out.error && out.satisfied === expectSatisfied;
  return Object.assign({
    id: c.id, source: c.source, control: c.control, objective: c.objective,
    expect: c.expect, correct,
    // A case the engine is known to get wrong, with the reason written down.
    // It still counts against the score — the headline number is what the
    // engine actually does — but --strict tolerates it, so CI catches NEW
    // wrongness without a documented gap holding the build red forever.
    known_limitation: c.known_limitation || null,
    // A false pass claims compliance that the evidence does not support; a false
    // fail sends an assessor to look at evidence that turns out to be fine. Both
    // are errors and they are not the same error.
    error_kind: out.error ? 'case-error' : (correct ? null : (out.satisfied ? 'false-pass' : 'false-fail')),
  }, out);
});

function score(rows) {
  const n = rows.length;
  const correct = rows.filter(r => r.correct).length;
  return {
    cases: n, correct,
    false_pass: rows.filter(r => r.error_kind === 'false-pass').length,
    false_fail: rows.filter(r => r.error_kind === 'false-fail').length,
    case_error: rows.filter(r => r.error_kind === 'case-error').length,
    known_limitations: rows.filter(r => !r.correct && r.known_limitation).length,
    undocumented_wrong: rows.filter(r => !r.correct && !r.known_limitation && r.error_kind !== 'case-error').length,
  };
}
// The two error kinds are not interchangeable, so they are reported as a 2x2
// rather than averaged into one accuracy figure. Rows are what the label says,
// columns are what the engine returned; the off-diagonal cells are the errors.
function matrix(rows) {
  const cell = (expSat, gotSat) => rows.filter(r =>
    !r.error && (r.expect === 'satisfied') === expSat && r.satisfied === gotSat).length;
  return {
    label_satisfied: { engine_satisfied: cell(true, true), engine_not_satisfied: cell(true, false) },
    label_not_satisfied: { engine_satisfied: cell(false, true), engine_not_satisfied: cell(false, false) },
  };
}

const bySource = {};
for (const r of results) (bySource[r.source] = bySource[r.source] || []).push(r);

const summary = {
  engine_version: E.ENGINE_VERSION,
  ruleset_digest: null,
  assessment_date: spec.assessment_date,
  baseline: spec.baseline,
  overall: score(results),
  matrix: matrix(results),
  by_source: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, score(v)])),
};
try {
  const EXsrc = fs.readFileSync(path.join(root, 'demo-exports.js'), 'utf8');
  vm.runInContext(EXsrc, ctx, { filename: 'demo-exports.js' });
  // The same computation buildReceipt uses, so the digest printed here is the
  // one on the receipt — key order made stable first, not JSON.stringify's.
  const EX = ctx.DEMO_EXPORTS;
  summary.ruleset_digest = EX.sha1Hex(EX.stableJson(E.RULESET)).slice(0, 12);
} catch (e) { /* digest is a convenience here, not the point */ }

if (args.includes('--json')) {
  console.log(JSON.stringify({ summary, results }, null, 2));
} else {
  console.log('SparkAE accuracy benchmark · engine ' + summary.engine_version +
    ' · ruleset ' + (summary.ruleset_digest || '(n/a)') + ' · as of ' + spec.assessment_date + '\n');
  for (const [src, rows] of Object.entries(bySource)) {
    const s = score(rows);
    console.log(src + '  —  ' + s.correct + ' of ' + s.cases + ' correct' +
      (s.false_pass ? ', ' + s.false_pass + ' FALSE PASS' : '') +
      (s.false_fail ? ', ' + s.false_fail + ' false fail' : '') +
      (s.case_error ? ', ' + s.case_error + ' case error' : ''));
    for (const r of rows) {
      const mark = r.error ? ' ERR ' : r.correct ? '  ok '
        : r.known_limitation ? 'known' : (r.error_kind === 'false-pass' ? ' FAIL' : ' fail');
      console.log(mark + '  ' + r.id.padEnd(34) + (r.error ||
        ('expected ' + r.expect.padEnd(13) + ' got ' + String(r.status).padEnd(20) + ' gate2 ' + r.gate2)));
    }
    console.log('');
  }
  const o = summary.overall;
  console.log('all cases: ' + o.correct + '/' + o.cases +
    '   false passes: ' + o.false_pass + '   false fails: ' + o.false_fail +
    (o.known_limitations ? '   (' + o.known_limitations + ' documented)' : '') +
    (o.case_error ? '   case errors: ' + o.case_error : ''));
  const m = summary.matrix;
  const col = (v) => String(v).padStart(22);
  console.log('\n' + ' '.repeat(23) + col('engine: Satisfied') + col('engine: not Satisfied'));
  console.log('  label: satisfied'.padEnd(23) +
    col(m.label_satisfied.engine_satisfied) + col(m.label_satisfied.engine_not_satisfied));
  console.log('  label: not satisfied'.padEnd(23) +
    col(m.label_not_satisfied.engine_satisfied) + col(m.label_not_satisfied.engine_not_satisfied));
  console.log('\n  Top right is a false fail: an assessor is sent to look at evidence that');
  console.log('  turns out to be fine. Bottom left is a false pass: the engine claims');
  console.log('  compliance the evidence does not support, and nobody is sent anywhere.');

  const known = results.filter(r => !r.correct && r.known_limitation);
  if (known.length) {
    console.log('\nknown limitations — wrong on purpose-of-record, not hidden:');
    for (const r of known) console.log('  ' + r.id + '\n    ' + r.known_limitation.replace(/\s+/g, ' '));
  }
  console.log('\nThis measures the engine against cases someone chose. It is not a');
  console.log('measurement of field accuracy and supports no readiness claim.');
}

fs.writeFileSync(path.join(here, 'benchmark', 'results.json'),
  JSON.stringify({ summary, results }, null, 2) + '\n');

// A case error means the benchmark itself is broken — a control or objective id
// that does not exist — and is always a failure. Whether a wrong determination
// fails the build is a policy question; --strict makes it one.
const broken = summary.overall.case_error;
if (broken) { console.error('\n' + broken + ' case(s) could not be run'); process.exit(1); }
const undocumented = summary.overall.undocumented_wrong;
if (args.includes('--strict') && undocumented) {
  console.error('\n' + undocumented + ' wrong determination(s) with no documented reason');
  process.exit(1);
}
process.exit(0);
