# Accuracy benchmark

`tests/check.mjs` asks whether the engine is **reproducible**: the same inputs
give the same verdict digest. That is a different question from whether the
verdicts are **right**, and the 2026-09-11 upload review demonstrated the gap —
a build can be perfectly reproducible and still return Satisfied for an
awareness-and-training objective from two documents about account monitoring.

This benchmark asks the second question. Each case pairs one objective with a
fixed set of documents and states the determination a competent assessor would
reach from those documents alone, with the reasoning written down.

## What a score here does and does not mean

It measures the engine against **cases someone chose**. It is not a measurement
of field accuracy on real authorization packages, and no score here supports a
claim of assessment readiness. What it supports is narrower and still worth
having: a published, re-runnable record of which known situations this engine
gets right, which it gets wrong, and whether that changed between versions.

Two properties make the number mean anything at all:

**The evidence is not all ours to choose.** Every case records `source`. In a
case marked `external-review` the documents are an outside reviewer's own
uploads, submitted before the fixes existed, so they were not written against
this implementation's behaviour — the engine was changed to satisfy them, not
the reverse. Be precise about how far that independence goes:
`at1-account-monitoring-evidence` is the reviewer's reproduction end to end,
objective and expected determination included; the other two pair the reviewer's
documents with objectives those documents do address, and that pairing was made
here. Cases marked `engine-repo` are ours in both halves, documents and label,
and a passing score on those is weaker evidence: they test what their author
already believed. The scorer reports the two populations separately and never
merges them into one headline number.

**A case is a claim, not a fixture.** `rationale` states why the label is what
it is, in terms a reader can dispute. If a determination here is wrong, the case
is what you argue with. Disputed determinations are welcome: open an issue with
the documents and the determination you expected.

## The shape that matters

The dangerous error is a **false pass** — Satisfied where the evidence does not
support it — because it tells an assessor nothing is wrong. A false fail sends
someone to look at evidence that turns out to be fine, which costs time and not
much else. The scorer reports both and weights neither: they are printed as a
confusion matrix so the asymmetry stays visible rather than being averaged away.

## Running it

    node tests/benchmark.mjs .            # score and print
    node tests/benchmark.mjs . --strict   # exit 1 on undocumented wrongness
    node tests/benchmark.mjs . --json     # the whole result to stdout

Writes `tests/benchmark/results.json` — the per-case outcomes and the aggregate,
for publication alongside the reproducibility receipt. CI runs `--strict` on
every pull request and on every push to `main`, and then checks that the
committed `results.json` is what the run produced, so the published record cannot drift from the engine that made it;
regenerate it in the same commit as any change that moves a determination.

`--strict` fails on a wrong determination that carries no `known_limitation`.
A case with one still counts against the headline score — the number is what the
engine actually does — but does not hold the build red, so a gap that is on
record stays visible without masking a new regression.

The README's *Accuracy* section quotes figures from this file, and
`tests/check.mjs` §16 checks that they are the recorded ones.
