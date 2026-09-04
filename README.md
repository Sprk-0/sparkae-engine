# SparkAE — public reference build

**A browser-executable reference implementation of SparkAE's deterministic
EXAMINE adjudication model, plus the public site.** Open
`demo-standalone.html`. No build, no server, no network.

SparkAE is the FedRAMP Rev5 / NIST SP 800-53A assessment engine from
ONE Solution Cyber. This repository is served as-is by Netlify at
**https://sparkae.ai** and is generated from the private
product repository (see *How this repository is maintained*).

## What is here, and what is not

| Ships in this repository (Apache-2.0) | Ships only in the SparkAE server product (commercial) |
|---|---|
| `demo-engine.js` — the deterministic 7-gate assessor: BM25 retrieval, concept coverage, evidence strength, ODP resolution, refutation / contradiction / draft detection, temporal coherence, determination | Multi-tenant API (`/v1/documents`, `/v1/assessments`), Postgres row-level security, hash-chained audit log |
| `demo-standalone-catalog.js` — NIST SP 800-53A Rev 5 determination statements with FedRAMP baseline tags | PDF and XLSX text extraction; Nessus / ZAP scan ingestion into POA&M |
| `demo-exports.js` — six builders: OSCAL 1.1.2 Assessment Results (JSON), findings CSV, RET CSV, POA&M CSV, TCW CSV, executive summary (text) — plus the reproducibility receipt | SAR / SAP DOCX, SRTM / CIS / CRM XLSX, OSCAL POA&M and the other server-side export formats |
| `demo-standalone.html` — the live demo (§01 runs the engine above; §02–§09 are labelled walkthroughs), `demo-20x.html`, the site pages, self-hosted fonts, per-page CSP | Optional LLM modes, integrations, the assessor console, ten analytical services |
| `tests/` — the conformance suite that CI runs on every push | The product test suite (~9,400 tests) and Postgres/RLS suites |

The **Source** link on the site points here so that anyone can inspect exactly
how a verdict is reached and reproduce it offline. It does not demonstrate
the server product; nothing in this tree runs `pip install` or Docker.

## Run it

```text
open demo-standalone.html      # from disk (file://) or any static host
```

Choose the sample SSP or upload a package (`.zip`, `.docx`, `.txt`, `.md`,
`.csv`, `.json`, `.xml`, `.nessus` — PDF and XLSX are refused with a reason,
never guessed), pick the FedRAMP profile and the assessment date, and run.
The console reports only what was computed: files parsed and refused,
objectives adjudicated, gate tallies, verdicts, and the receipt below. It is
**automated EXAMINE preparation**; INTERVIEW and TEST are not performed and
remain with the assessor.

## The engine

Every determination statement passes through seven recorded gates, in order:

| # | Gate | Sub-checks |
|---|------|-----------|
| 1 | Presence | evidence above the BM25 relevance threshold |
| 2 | Concepts | concept coverage of the objective text ≥ 40% |
| 3 | Strength | 3a traceable references · 3b no keyword stuffing |
| 4 | ODP | organization-defined parameters resolved |
| 5 | Contradiction | 5a no refutation · 5b no self-contradiction · 5c no draft / placeholder markers |
| 6 | Temporal | 6a currency · 6b scan cadence · 6c no future-dated claims · 6d open-finding SLA |
| 7 | Determination | Satisfied only if gates 1–6 all passed |

A result's `gates` array holds one record per gate reached and nothing else,
so a Satisfied verdict always carries exactly seven passing records. Every
result reports `assessment_method: EXAMINE`, the `assessment_date` it was
given, an evidence-support score (`confidence`), a defensibility score
(an internal finding-trace rubric — not a measure of assessor acceptance),
and `review_required` when a Satisfied verdict rests on thin support
(confidence or concept coverage below 60%).

Retrieval is lexical BM25 (k1 1.5, b 0.75) — there are no embeddings and no
vector store in this build. Contradiction and draft detection are
pattern-based indicators. Thresholds are constants in `demo-engine.js` and
are hashed into the ruleset digest.

## Determinism, precisely

The engine reads no clock and uses no randomness: `assessDif` *requires* an
assessment date and throws without one, and the exporters derive every UUID
(RFC 4122 v5) and timestamp from the run rather than from `crypto` or the
wall clock. `CONTRIBUTING.md` forbids `Date.now()`, argument-less
`new Date()` and `Math.random()`, and `tests/check.mjs` fails if either
script contains them.

Two runs agree when this **reproducibility tuple** agrees:

```text
engine version · catalog digest · ruleset digest · evidence digest · assessment date
```

Every run emits a receipt naming all five and the resulting **verdict
digest**; every OSCAL document carries the same receipt in `metadata.props`.
Build the same run twice and the files are byte-identical — check with
`sha256sum`. What is *not* promised: two different assessment dates give
different temporal verdicts (that is the point of the date), and the
walkthrough animations' timing is decorative.

The bundled sample (`CloudVault-Federal-SSP.txt`, FedRAMP Low profile,
assessed as of 2026-06-01) is the golden fixture: `tests/golden/sample-ssp.expected.json`
pins its counts and digests, and CI fails on any drift.

## Catalog

| Scope | Controls | Determination statements |
|---|---:|---:|
| Complete NIST SP 800-53A Rev 5 catalog | 447 | 1,513 |
| FedRAMP High profile | 410 | 1,429 |
| FedRAMP Moderate profile | 323 | 1,307 |
| FedRAMP Low profile | 156 | 981 |

Generated 2026-07-21 from the product catalog. The catalog digest in every
receipt is the SHA-1 of the catalog object's canonical JSON, so a regenerated
catalog is visible in every artifact it produced.

OSCAL: the exporter emits **NIST OSCAL 1.1.2** and CI validates the output
against the official NIST 1.1.2 assessment-results schema vendored in
`tests/schema/`. The package-validator walkthrough (§07) applies FedRAMP
constraint checks that accept OSCAL 1.0.4 or later.

## Verify it yourself

```bash
node tests/check.mjs .                 # node ≥ 18, no dependencies
pip install jsonschema regex && python tests/check_oscal_schema.py
```

There is also a browser-level check — `node tests/browser.mjs .` after
`npm i playwright && npx playwright install chromium` — which drives the demo
in headless Chromium with every non-file request aborted and compares what
the page shows and downloads with the golden fixture (CI's `browser` job).

`check.mjs` checks: every script parses; the catalog counts above; no
published file loads or calls a third-party origin and every page's CSP is
`connect-src 'self'`; no clock or randomness in the engine or exporters; the
gate model; determinism (same input twice → same verdict digest and
byte-identical OSCAL; a missing date throws; a different date changes the
temporal verdicts); the golden fixture; CSV formula-injection safety; and the
OSCAL document's shape and receipt. The GitHub Actions workflow in
`.github/workflows/ci.yml` runs both on every push.

## How this repository is maintained

**Every file here is generated**, this README included: the private product
repository builds the site, runs its own suite, and syncs the result here.
A change made directly to a file in this repository will be overwritten by
the next sync — so open an issue or a pull request and it will be ported to
the source and re-synced. Contributions are welcome under the constraints
in `CONTRIBUTING.md`.

Hosting: `netlify.toml` publishes the repository root with no build step,
`_headers` sets a per-page Content-Security-Policy and the usual security
headers, and `_redirects` provides the forced `/demo` short link.

## Licence

Code in this repository is licensed under the Apache License, Version 2.0 —
see `LICENSE` and `NOTICE`. The SparkAE server product is separate commercial
software (licensed, not sold; FAR 12.212 / DFARS 227.7202 terms for federal
buyers) and is not covered by that licence. SparkAE and the SparkAE marks are
reserved. NIST SP 800-53 / 800-53A catalog text is a work of the United
States Government and is not subject to copyright in the United States. The
IBM Plex and Fraunces typefaces in `static/fonts/` are distributed under the
SIL Open Font License 1.1 — the licence texts travel with the files there.
