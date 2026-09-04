# SparkAE — in-browser reference engine

The deterministic FedRAMP Rev5 / NIST SP 800-53A assessment engine that powers
the SparkAE live demo, published as a standalone, dependency-free browser build.

**Open the demo:** `demo/demo-standalone.html` — no server, no build step, no
network. Everything runs inside the page. `demo/demo-20x.html` is the FedRAMP 20x
persistent-validation walkthrough.

**Host it:** the repository deploys to Netlify as-is (`netlify.toml` publishes the
root with no build step); `_redirects` sends `/` to the demo and `/20x` to the
walkthrough, and `_headers` applies a same-origin Content-Security-Policy.

## What is here

| Path | What it is |
|------|------------|
| `demo/demo-engine.js` | The 7-gate assessor: BM25 retrieval over the uploaded corpus, concept extraction and coverage, evidence-strength scoring, ODP resolution, refutation and contradiction detection, temporal coherence, confidence and defensibility scoring. Deterministic — same inputs, same verdicts. |
| `demo/demo-standalone-catalog.js` | NIST SP 800-53A Rev 5 determination statements (DIFs) with FedRAMP baseline tagging. Generated from the NIST OSCAL catalog; NIST content is US-government public domain. |
| `demo/demo-exports.js` | Artifact builders: OSCAL Assessment Results JSON (validated against the NIST OSCAL 1.1.2 schema), findings / RET / POA&M / TCW CSV, SAR summary. DOM-free by design so it can be unit-tested. |
| `demo/demo-standalone.html` | The demo UI. Loads the three files above and nothing else. |
| `demo/demo-20x.html` | FedRAMP 20x KSI walkthrough (static). |
| `demo/ae-editorial.css`, `static/fonts/` | The editorial design system and its self-hosted typefaces. |

## What is *not* here

The SparkAE server product — multi-tenant API, Postgres row-level security,
audit chain, integrations, the 3PAO console — is proprietary and lives in a
private repository. This repository is the in-browser reference build: the same
adjudication rules, packaged so that anyone can inspect exactly how a verdict
is reached and reproduce it offline.

## Determinism

The engine reads no clock and uses no randomness. Assessment dates are taken
from the uploaded documents, so a package assessed today and the same package
assessed next year produce identical output. Treat any divergence as a bug and
report it.

## Licence

Code in this repository is licensed under the Apache License, Version 2.0 — see
`LICENSE`. NIST SP 800-53 / 800-53A catalog text is a work of the United States
Government and is not subject to copyright in the United States. The IBM Plex
and Fraunces typefaces in `static/fonts/` are distributed under the SIL Open
Font License 1.1.

SparkAE is a product of ONE Solution Cyber.
