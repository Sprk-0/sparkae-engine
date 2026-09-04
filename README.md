# SparkAE — public site and in-browser reference engine

This repository is the public face of SparkAE, the deterministic FedRAMP Rev5 /
NIST SP 800-53A assessment engine from ONE Solution Cyber. It is served as-is
by Netlify at **https://sparkae-public.netlify.app**.

Start at the homepage: what SparkAE is, who it is for, how the 7-gate engine
reaches a verdict, and what leaves your network (nothing, by default). Then run
the demo.

| Page | What it is |
|------|------------|
| `index.html` | What SparkAE is: an independent second reader for FedRAMP Rev5, not a GRC platform. |
| `assessors.html` | For independent assessment services (3PAOs): Examine preparation without losing the judgment. |
| `integrations.html` | What the engine connects to, and what it deliberately does not. |
| `demo-standalone.html` | **The live demo.** The full engine, in the browser, against a sample package. No server, no upload, no network. |
| `demo-20x.html` | FedRAMP 20x persistent-validation walkthrough. |
| `status.html`, `privacy.html`, `terms.html` | Service status and legal. |

## The engine

The demo is not a narrative. `demo-engine.js` is the deterministic 7-gate
assessor — BM25 retrieval over the uploaded corpus, concept extraction and
coverage, evidence-strength scoring, ODP resolution, refutation and
contradiction detection, temporal coherence, confidence and defensibility
scoring — and `demo-exports.js` builds the artifacts: OSCAL Assessment Results
JSON (validated against the NIST OSCAL 1.1.2 schema), findings / RET / POA&M /
TCW CSV, and a SAR summary. `demo-standalone-catalog.js` carries the NIST SP
800-53A Rev 5 determination statements with FedRAMP baseline tagging.

The engine reads no clock and uses no randomness: the same package produces
the same verdicts on any machine, on any day. Treat a divergence as a bug.

## What is *not* here

The SparkAE server product — multi-tenant API, Postgres row-level security,
audit chain, integrations, the 3PAO console — is proprietary and lives in a
private repository. This repository is the reference build: the same
adjudication rules, packaged so anyone can inspect exactly how a verdict is
reached and reproduce it offline.

## How this repository is maintained

Every file here except this README, `LICENSE`, `SECURITY.md`,
`CONTRIBUTING.md` and `netlify.toml` is **generated**: the private repository
builds the site and copies the output here. Edit the source there and re-sync;
a change made directly to a page in this repository will be overwritten by the
next sync. Bug reports and pull requests against the engine are welcome — see
`CONTRIBUTING.md` — and will be ported to the source.

Hosting: `netlify.toml` publishes the repository root with no build step,
`_headers` sets a per-page Content-Security-Policy and the usual security
headers, and `_redirects` provides the `/demo` short link.

## Licence

Code in this repository is licensed under the Apache License, Version 2.0 — see
`LICENSE`. NIST SP 800-53 / 800-53A catalog text is a work of the United States
Government and is not subject to copyright in the United States. The IBM Plex
and Fraunces typefaces in `static/fonts/` are distributed under the SIL Open
Font License 1.1.
