# Path inventory — SparkAE public face (2026-09-10)

Inventory-first. Draft ≠ merge. This document classifies every tracked
path on the public Apache-2.0 face (`Sprk-0/sparkae-engine`) at the tip
of the default branch. It does not delete, rewrite, or sync anything.

**Claim wall.** This is the public honesty surface only. The SHA below
is the public tip. It is **not** the commercial GRC tip. Do not cite
this inventory as evidence of customers, certifications, pilots closed,
stars, or revenue. ARR observed: **$0**. No customer, 3PAO, or ATO is
named or invented here.

Internal name **Path-3** does not appear in any published site file.
It appears only in the 2026-09-09 review. Do not add it to the public
face. “Path-3 wheel” in this inventory means any copy that implies a
`pip install` / Docker / `/v1` server package exists *in this tree*
or is one clone away.

---

## 1. Tip pin

Verified 2026-09-10 against `origin/main` after `git fetch origin main`.
Local and remote were already identical; fetch did not move the tip.

| Item | Value |
|---|---|
| Public default branch | `main` |
| Public tip SHA | `6f2f45eff17bf1a448264db154b5f9e36b618199` (`6f2f45e`) |
| Subject | `Merge pull request #2 from Sprk-0/cursor/public-honesty-fixes-c897` |
| Engine in this tree | `ENGINE_VERSION = 1.1.0` (`demo-engine.js`) |
| Golden fixture | CloudVault · FedRAMP Low · 2026-06-01 · 156 / 981 · 383 Satisfied / 597 Other Than Satisfied / 1 Not Reviewed · verdict digest `3dd76f5f30831b0c4248a1be0ef3d1902559822f` |
| Catalog stamp | Generated 2026-07-21 · digest `91ad1b17138f7e0707fe19e65d9b8c3c77833401` |
| Conformance on this checkout | `node tests/check.mjs .` — all checks passed (2026-09-10) |
| Tracked paths | 41 |

GitHub About on this date (live API): empty description, empty homepage
URL, no topics, 0 stars, 0 forks, 0 open issues, created 2026-09-04.
`Sprk-0` public profile still says company “Spark Z3R0” /
`oneills@sparkzero.energy`. Published copyright in `NOTICE` is
**ONE Solution Cyber**. That identity split is unchanged.

---

## 2. Lag versus the documented GRC commercial pin

| Pin | SHA | What it is |
|---|---|---|
| Last documented GRC sync into this repo | GRC `0b4be3c` → public `57354d843a63105442cd07c70085a7eb1d9525b2` | Commit subject and body: “Sync site from GRC main 0b4be3c” via `website/sync-public.sh` (IMP-988). Date 2026-09-09T17:17:30Z. |
| Public tip today | `6f2f45e` | Four commits *after* that sync. |
| Commercial GRC HEAD | **Unknown** | `gh repo view Sprk-0/GRC` → repository not found for this identity. Do not treat `0b4be3c` as a live GRC HEAD check. |

Public commits after the last GRC sync (not a GRC product move):

1. `963c8bf` — add `docs/reviews/2026-09-09-sparkae-engine-public-rebaseline.md`
2. `2c77a43` — merge PR #1
3. `019cebb` — public honesty fixes (hero = real sample-run finding; install-boundary labels; tour de-overclaim; CI hero lock)
4. `6f2f45e` — merge PR #2

**Lag, stated without invention:**

- Public tip **≠** last documented GRC pin. The public tree carries a
  review doc and honesty patches that the 0b4be3c sync did not contain.
- Whether private GRC has moved past `0b4be3c` is **not observable**
  from this identity. The 2026-09-09 review already recorded that.
- README says every file here is generated and a direct edit is
  overwritten on the next sync. This inventory is therefore a
  **port-to-source** brief, not a durable public-only patch.

Earlier documented GRC syncs (public commit messages only):
`4237602` (public `40013bd`), `6d53059` (`da022d9`), `ed58b2d`
(`d5fce0c`), and a non-GRC-named “private repository” pin `8721971`
(`7d81cb7`). `origin/tagprobe` is still at `40013bd`.

---

## 3. Method and verbs

Every tracked path is classified. Prefer **ARCHIVE** or **DELETE**.
REWRITE only when the path has to stay for the public reference build
to remain honest and runnable.

| Verb | Meaning in this inventory |
|---|---|
| **KEEP** | Required for the Apache reference (engine, catalog, exporters, conformance, licence, honesty contract). Do not remove. |
| **ARCHIVE** | Take off the public face (unpublish / stop syncing). Keep the bytes in private history or `docs/archive/` if a later writer needs them. Preferred for commercial-product pages. |
| **DELETE** | Remove the copy or path. Use for overclaim CTAs, stale names, and Path-3-wheel implication. Prefer over leaving the sentence with a footnote. |
| **REWRITE** | File stays; named zones must change. Honesty labels listed under that path are **KEEP** even while the rest is stripped. |

Intra-file zones are listed under the path when the whole-file verb is
not enough. A KEEP file can still have DELETE zones (comments that
point at unpublished generators, leftover product names).

---

## 4. Honesty labels that MUST KEEP

These strings (or an equally plain replacement) stay if the hosting
file stays. Do not “clean up” the public face by deleting them.

| Label | Where it is load-bearing today | Why |
|---|---|---|
| Synthetic / sample | `index.html` hero caption (“sample run · CloudVault · … · synthetic data”); `demo-standalone.html` `#sample-ssp-data` + “sample SSP”; `terms.html` “synthetic, fictional data”; README golden-fixture paragraph | The only package this engine is pinned against is fictional. |
| Not a 3PAO / not the assessor of record / not an ATO or official SAR | `index.html` `#cta` fine print; `assessors.html` independence note + CTA fine print; `terms.html` “What SparkAE is — and is not”; demo tour step 1; README EXAMINE-only paragraph | Public honesty. INTERVIEW and TEST stay with the assessor. |
| Install boundary | README “What is here, and what is not”; `index.html` `#modes` + `#engineering` boundary; `NOTICE` “server product … is not covered”; `tests/check.mjs` check 10 last assertion | This tree has no `pyproject.toml`, no wheel, no Docker, no `/v1`. |
| Live vs walkthrough | `demo-standalone.html` badges + tour; README §02–§09 sentence; homepage `#workflows` badges | Only §01 runs `demo-engine.js`. |
| 20x is in development and is not sold | Homepage profiles card; assessors market-reality + CTA; README does not claim 20x ships | Do not let a walkthrough read as a sold lane. |
| No customer results yet | Homepage `#criteria`; assessors `#roi` | ARR $0. Do not invent a savings figure. |
| PDF / XLSX refused, not guessed | README Run-it; homepage Upload rail | Browser build does not extract those formats. |
| Hero = this engine’s sample-run finding | `index.html` `#sample-run-finding` (`AC-2_g` / Other Than Satisfied / 0.35 / 2026-06-01); `tests/check.mjs` §10 | PR #2 fixed the previous false card. CI fails if it drifts. |

CI currently also requires the homepage to contain the literals
`server product`, `pip install`, and `will not work`
(`tests/check.mjs` lines 270–271). That lock **preserves** the install
boundary, but it also **freezes the wheel-shaped strings on the
homepage**. A later strip of `pip install` copy must rewrite that
assertion to a wheel-free boundary check (for example: no
`pyproject.toml`, and the page still says this checkout is not the
server install). Do not delete the check.

---

## 5. What to take off the public face (DELETE / ARCHIVE)

### 5.1 Path-3 wheel implication — DELETE the copy, ARCHIVE the pages

Nothing in this tree is a Python package. These still read as if a
wheel or container is one command away:

| Copy | Path | Verb |
|---|---|---|
| `pip install .` / `pip install '.[local]'` / `pip install '.[cloud]'` | `index.html` `#modes` | **DELETE** the install lines. Keep a one-line boundary: this checkout has no package. |
| `LLM_PROVIDER=none\|ollama\|anthropic` as deploy modes | `index.html` `#modes`; `assessors.html` CUI card; `privacy.html` short version | **DELETE** from the public face. Server-product configuration, not this repo. |
| `FRAMEWORK=nist` / `FRAMEWORK=` | `index.html` profiles + Select rail | **DELETE**. Already footnoted as “not a flag in this repository”; the flag itself should go. |
| `localhost:8000/v1/documents` and `/v1/assessments` curl | `index.html` terminal; `integrations.html` `#api` | **DELETE**. Illustration of a server that is not here. |
| “14+ export formats”, SAR/SAP DOCX, OSCAL POA&M, CRM, CIS, XLSX | `index.html` spec; `assessors.html` workflow + partner box; `integrations.html` export tab | **DELETE** from this face. This build ships six builders (`demo-exports.js`). |
| Production-hardened Docker / cap_drop ALL / non-root | `index.html` Deployment spec; `assessors.html` CUI card | **DELETE**. No Dockerfile here. |
| Eight roles, RLS, hash-chained audit, syslog/CEF | `index.html` `#engineering` spec | **DELETE**. Not in this tree. |
| Ten analytical services / 25 gap types | `index.html` Analysis spec; `assessors.html` panel | **DELETE** or reduce to what `demo-engine.js` actually computes. |
| Status components API / Dashboard / S3 / workers / SSO and `/health/ready` | `status.html`, `status-data.json` | **ARCHIVE** both files. They describe a Path-3 deployment. `published_at` is already `null`. |
| “Same engine as the 3PAO UI” / “GRC API” | `integrations.html`, `assessors.html` | **DELETE**. Implies the commercial UI exists behind this site. |

### 5.2 Overclaim CTAs — DELETE

ARR $0. A paid-pilot form on a $0 public face is a claim.

| CTA | Path | Verb |
|---|---|---|
| Nav “Request Pilot” | `index.html`, `assessors.html`, `integrations.html`, `demo-standalone.html`, `status.html`, `privacy.html`, `terms.html`, `404.html` | **DELETE** |
| “Start a 30-day paid pilot” / “Start a 30-day pilot” / “Request a pilot →” | `index.html` hero + `#cta`; `404.html` list | **DELETE** |
| Netlify `pilot-request` form + `#pricing` anchor | `index.html` `#cta` | **ARCHIVE** the form (or DELETE). Email in the footer is enough. |
| “Schedule a partner call” / “Request a partner pilot” | `assessors.html` | **DELETE** |
| “3PAO Partner Program” box: unlimited assessments, white-label, named support, on-prem, “priced per firm”, “founder call within 48 hours” | `assessors.html` | **ARCHIVE** the section (with the page) |
| “View the API →” / “Already have a GRC stack? Perfect. We plug right in.” | `integrations.html` | **DELETE** (with the page) |
| “See it before you commit” | `assessors.html` mini-CTA | **REWRITE** to “Run the browser demo” or DELETE with the page |
| Privacy still names “Start a Pilot” / “Contact Sales” | `privacy.html` | **REWRITE** to match whatever remains (email only) |

Keep a single contact: `info@sparkae.ai`. That is already in every
footer. It is not a customer claim.

### 5.3 Stale naming — ARCHIVE identity, KEEP only the redirect

| Name | Path | Verb |
|---|---|---|
| `/3pao.html` as a published identity | `_redirects` (301 → `assessors.html`); netlify.toml comment | **KEEP** the 301 so old links do not 404. **ARCHIVE** the name as a product path. Do not revive `3pao.html`. |
| `demo.html` (API-connected demo, unpublished) | `_headers`, `_redirects` comments | **KEEP** the comments that say it is gone. Do not republish. |
| Section label “3PAO Workflow” / “3PAO Partner” | `assessors.html` | **DELETE** the labels if the page is rewritten; they fight the “historically 3PAOs / not a 3PAO” honesty line. |
| `og-card.src.html` / `website/README.md` / `build.sh` / `docs/operations/incident-response.md` | comments in every page head, `_headers`, `sitemap.xml`, `status-data.json` | Private-generator leftovers. **KEEP** as comments only if they stay accurate; they are **not** in this tree. Do not invent those files here. |
| GitHub About empty | repo setting, not a file | Out of band. Suggested text is already in the 2026-09-09 review. Not done. |

---

## 6. File-by-file classification

Sizes are bytes on tip `6f2f45e`. Paths are repository-relative.

### 6.1 Contract and licence — KEEP

| Path | Bytes | Verb | Why |
|---|---|---|---|
| `README.md` | 9043 | **KEEP** | Strongest honesty document. Install boundary, EXAMINE-only, synthetic golden fixture, generated-from-private, Apache vs commercial. Do not weaken. |
| `LICENSE` | 10120 | **KEEP** | Apache-2.0. GitHub `licenseInfo.key` = `apache-2.0`. Appendix still absent (housekeeping, not unlicensed). |
| `NOTICE` | 1380 | **KEEP** | Copyright 2026 ONE Solution Cyber. Marks reserved. Server product called out as not covered. NIST + OSCAL + OFL attributed. |
| `CONTRIBUTING.md` | 1699 | **KEEP** | Determinism, no network, “say only what was computed.” |
| `SECURITY.md` | 2018 | **KEEP** | Browser-only threat model. Email reporting path. Private vulnerability reporting is still disabled on the repo (2026-09-09 review); email remains the path that works. |
| `.gitignore` | 96 | **KEEP** | `tests/out/`, `node_modules/`. |

### 6.2 Reference engine — KEEP

| Path | Bytes | Verb | Why |
|---|---|---|---|
| `demo-engine.js` | 57898 | **KEEP** | The deterministic 7-gate EXAMINE assessor. BM25, no embeddings, no clock, no network. This is the product of the public face. |
| `demo-exports.js` | 30502 | **KEEP** | Six builders: OSCAL 1.1.2 AR, findings/RET/POA&M/TCW CSV, summary, receipt. Header already says it mirrors a *private* exporter — do not add “14+ formats” here. |
| `demo-standalone-catalog.js` | 398883 | **KEEP** | NIST SP 800-53A Rev 5 determination statements. USG work; attributed in `NOTICE`. |
| `demo-standalone.html` | 501321 | **REWRITE** (file stays) | §01 + `#sample-ssp-data` + live/walkthrough badges + tour honesty from PR #2 are **KEEP**. See §7.1 for DELETE/ARCHIVE zones. |

### 6.3 Conformance — KEEP

| Path | Bytes | Verb | Why |
|---|---|---|---|
| `.github/workflows/ci.yml` | 1688 | **KEEP** | `conformance` + `browser`. Node 20 deprecation annotation remains (P2 from 2026-09-09); not a fail today. |
| `tests/check.mjs` | 16947 | **KEEP** / follow-on **REWRITE** of the pip-install literal lock if `#modes` is stripped. Hero-lock and determinism checks stay. |
| `tests/browser.mjs` | 7679 | **KEEP** | Headless Chromium, all non-file requests aborted. |
| `tests/check_oscal_schema.py` | 2638 | **KEEP** | Official NIST 1.1.2 schema. |
| `tests/golden/sample-ssp.expected.json` | 813 | **KEEP** | Pins the synthetic sample. |
| `tests/schema/oscal_assessment-results_schema.json` | 133015 | **KEEP** | Vendored NIST schema. USG work. |

### 6.4 Hosting and CSP — KEEP the mechanism, REWRITE the allowlist when pages archive

| Path | Bytes | Verb | Why |
|---|---|---|---|
| `netlify.toml` | 307 | **KEEP** | Static publish, no build. Comment names the `/3pao.html` move — leave the fact, do not revive the page. |
| `_headers` | 11163 | **KEEP** | Per-page CSP, `connect-src 'self'`. If `status.html` / `integrations.html` / `demo-20x.html` / `assessors.html` are archived, **REWRITE** the matching rules out so an unpublished path is not promised a policy. Comments about unpublished `demo.html` stay. |
| `_redirects` | 1275 | **KEEP** `/demo` → `demo-standalone.html` (301!). **KEEP** `/3pao.html` → `assessors.html` only while `assessors.html` exists; if that page is archived, retarget to `index.html` or the demo. |
| `robots.txt` | 466 | **KEEP** | Disallow `/404.html` only. |
| `sitemap.xml` | 1192 | **REWRITE** when pages archive. Today lists eight indexable URLs including `integrations.html`, `demo-20x.html`, `status.html`. |
| `ae-editorial.css` | 22098 | **KEEP** | Shared tokens. No third-party loader. |

### 6.5 Marketing pages — prefer ARCHIVE

| Path | Bytes | Verb | Why |
|---|---|---|---|
| `index.html` | 49088 | **REWRITE** | Homepage has to exist. Honesty labels in §4 are **KEEP**. Commercial install cards, `/v1` sketch, Docker spec, paid-pilot CTA: **DELETE** (§5). “Minutes, not weeks” and “CUI program can use it” remain overclaim tone — strip or qualify. |
| `assessors.html` | 34531 | **ARCHIVE** | Buyer page for a 3PAO partner program that this tree cannot deliver (XLSX, 14+ formats, Docker, white-label, named support, on-prem). Honesty lines (not assessor of record; no customer results; 20x not sold; install is not this repo) are **KEEP** if a stub replaces it. Preferred: unpublish and point nav at the demo + `terms.html`. |
| `integrations.html` | 36584 | **ARCHIVE** | Entire page is a commercial GRC-connector catalog plus a `/v1` API sketch. “Not a certified two-way sync” is honest *and* still advertises Drata/Vanta/ServiceNow as if a product wheel is behind the copy. Prefer unpublish over more footnotes. |
| `demo-20x.html` | 28514 | **ARCHIVE** | Labelled walkthrough of a lane the rest of the site says is in development and is not sold. Sitemap priority 0.6. Does not run `demo-engine.js`. Keeping it on the public face implies a 20x product path. |
| `status.html` | 12983 | **ARCHIVE** | Status UI for API / dashboard / S3 / workers / SSO and `/health/ready`. No snapshot (`published_at: null`). Still talks as if a Path-3 deployment is the subject. |
| `status-data.json` | 1642 | **ARCHIVE** | Seed for that page. Comments point at a private `docs/operations/incident-response.md` that is not in this tree. |
| `404.html` | 6958 | **REWRITE** | Required error page (root-relative links are load-bearing). **DELETE** “Request Pilot” nav and “Request a pilot” list row. **REWRITE** Integrations row if that page is archived. |
| `privacy.html` | 7891 | **REWRITE** | Site-collection paragraph (static, no trackers) is **KEEP**. Short version (`LLM_PROVIDER=none`, “container you run”, “your database … multi-tenant isolation”) describes the server product. **DELETE** those sentences or move them behind “commercial server product, not this repository.” Update CTA names. Last-updated 26 June 2026 is stale relative to the 4 September terms date — fix on rewrite. |
| `terms.html` | 9116 | **KEEP** | Load-bearing not-a-3PAO + synthetic-sample + Apache-vs-commercial. **DELETE** only the nav “Request Pilot” CTA. |

### 6.6 Static assets

| Path | Bytes | Verb | Why |
|---|---|---|---|
| `static/og-card.png` | 57813 | **REWRITE** (asset) | Real 1200×630 card. Alt text on every page: “Minutes, not weeks. 410 controls, 1,429 objectives…”. Figures match the High-profile catalog counts (KEEP). The speed claim is marketing. Regenerator (`og-card.src.html`) is not in this tree. |
| `static/fonts/Fraunces-VariableFont.woff2` | 67304 | **KEEP** | Self-hosted. Required for `connect-src 'self'` / no CDN. |
| `static/fonts/Fraunces-Italic-VariableFont.woff2` | 81520 | **KEEP** | Same. |
| `static/fonts/IBMPlexSans-VariableFont.woff2` | 45712 | **KEEP** | Same. |
| `static/fonts/IBMPlexMono-Regular.woff2` | 14708 | **KEEP** | Same. |
| `static/fonts/IBMPlexMono-Medium.woff2` | 14888 | **KEEP** | Same. |
| `static/fonts/IBMPlexMono-SemiBold.woff2` | 15620 | **KEEP** | Same. |
| `static/fonts/OFL-Fraunces.txt` | 4391 | **KEEP** | SIL OFL 1.1 travels with the font. |
| `static/fonts/OFL-IBM-Plex.txt` | 4363 | **KEEP** | Same. |

### 6.7 Prior review — KEEP

| Path | Bytes | Verb | Why |
|---|---|---|---|
| `docs/reviews/2026-09-09-sparkae-engine-public-rebaseline.md` | 15935 | **KEEP** | Dated honesty review of tip `57354d8`. Names Path-3 only as “this tree is not that.” Do not treat its GRC pin as current HEAD. P1-1 (false hero) was fixed in PR #2; P1-2 (marketing install copy) and P1-3 (tour) are partially fixed and still the main ARCHIVE drivers above. |

### 6.8 This inventory

| Path | Verb | Why |
|---|---|---|
| `docs/hygiene/2026-09-10-path-inventory.md` | **KEEP** | This file. Hygiene record. Not a product claim. |

---

## 7. Intra-file zones (REWRITE files)

### 7.1 `demo-standalone.html`

| Zone | Verb | Note |
|---|---|---|
| `#sample-ssp-data` CloudVault SSP | **KEEP** | Synthetic sample. Golden fixture. |
| §01 live engine + live badge | **KEEP** | Only path that calls `demo-engine.js`. |
| Live / walkthrough badges; tour steps 1 and 3 honesty | **KEEP** | PR #2. |
| Tour step 2 connector roster (Drive, GitHub, Tenable, Drata, PDF/OCR…) | **ARCHIVE** | Labelled walkthrough, still the loud first-run picture of a connector wheel. |
| Tour step 4 AO briefing / “ATO · conditional ATO · defer” | **ARCHIVE** | Walkthrough. Reads as authorization product. |
| §02–§09 guided walkthroughs (annual, SCR, ConMon, KSI, QA, validator, portfolio, connectors) | **ARCHIVE** | README already says they are not executed by the engine. Prefer a §01-only demo on this face. |
| `GRC_CONNECTORS` / two-way import theater | **ARCHIVE** | Same as `integrations.html`. |
| Masthead “Request Pilot” | **DELETE** | Overclaim CTA. |
| Post-demo CTA “Now run it on yours” | **REWRITE** | Fine if it means “drop a file in this tab.” Not fine if it means a server install. |
| Colophon “Conformant with FedRAMP SAR Template Rev5” | **REWRITE** | §01 exports are EXAMINE preparation, not a SAR. The tour already says that; the footer fights it. |
| `https://sparkae.dev/ns/oscal` | **gone** | 2026-09-09 P2-5. Not present on this tip. |

### 7.2 `index.html`

| Zone | Verb | Note |
|---|---|---|
| `#sample-run-finding` + synthetic caption | **KEEP** | CI-locked to the golden run. |
| `#cta` not-a-3PAO / 20x-not-sold / Apache-vs-commercial fine print | **KEEP** | Move next to the hero if the CTA block is deleted. |
| `#criteria` “We do not publish customer results yet” | **KEEP** | ARR $0. |
| Upload / Select rails that refuse PDF/XLSX and deny `FRAMEWORK=` | **KEEP** the refusal. **DELETE** the `FRAMEWORK=` token. |
| `#modes` three-card `pip install` grid | **DELETE** | Path-3 wheel. |
| `#engineering` spec + `/v1` terminal | **DELETE** | Path-3 wheel. The collapsed `<details>` still ships in the page source. |
| Hero “Minutes, not weeks” / “Runs entirely inside your environment” | **REWRITE** | True of the *browser demo* (in-tab). Easy to read as a server install. |
| “Why a CUI program can use it at all” | **REWRITE** | Assessors page already says suitability depends on how *you* accredit it. |
| Nav + hero + `#cta` paid-pilot form | **DELETE** | Overclaim CTA. |

### 7.3 `privacy.html` / `404.html` / `terms.html`

Covered in the tables above. Shared **DELETE**: nav “Request Pilot”.
Shared **KEEP**: `terms.html` synthetic + not-a-3PAO + licence split.

---

## 8. Counts

| Whole-file verb | Paths |
|---|---|
| KEEP | 30 (licence, engine, catalog, exporters, tests, CI, hosting mechanism, fonts + OFL, README/NOTICE/SECURITY/CONTRIBUTING, terms, 2026-09-09 review, this inventory, `.gitignore`) |
| REWRITE (file stays) | 5 (`index.html`, `demo-standalone.html`, `privacy.html`, `404.html`, `sitemap.xml`) plus follow-on allowlist edits to `_headers` / `_redirects` / `tests/check.mjs` |
| ARCHIVE | 5 (`assessors.html`, `integrations.html`, `demo-20x.html`, `status.html`, `status-data.json`) |
| DELETE as a whole file | 0 — prefer ARCHIVE for published pages so history remains |

CTA / wheel / stale-name **DELETE** zones: 20+ (see §5). None of those
zones are executed in this PR.

Recommended public face after a later execution PR (not this one):

```text
README.md · LICENSE · NOTICE · demo-engine.js · demo-exports.js
demo-standalone-catalog.js · demo-standalone.html (§01 only)
index.html (honesty + demo door, no wheel, no paid-pilot form)
terms.html · privacy.html · 404.html
tests/ · .github/workflows/ci.yml · _headers · _redirects · netlify.toml
ae-editorial.css · static/fonts/ · static/og-card.png
docs/reviews/ · docs/hygiene/
```

That is a static Netlify site plus an in-browser EXAMINE reference.
It is not a Path-3 install.

---

## 9. What this inventory does not do

- Does not merge. Draft PR only.
- Does not edit site copy, CTAs, or tests.
- Does not invent a GRC HEAD, a 3PAO customer, a certification, or ARR.
- Does not re-check live https://sparkae.ai headers (2026-09-09 review
  did; this pass is the git tip).
- Does not treat `origin/cursor/*` or `origin/tagprobe` as public state.

Port target, when someone executes §5–§7: the private generator
(`website/sync-public.sh` in Sprk-0/GRC), not a one-off edit here.
The next sync will overwrite a public-only patch.

---

## 10. Success record

| Check | Result |
|---|---|
| Inventory path | `docs/hygiene/2026-09-10-path-inventory.md` |
| Public tip SHA classified | `6f2f45eff17bf1a448264db154b5f9e36b618199` |
| Documented GRC pin | `0b4be3c` at public `57354d8` |
| Lag | Public tip is 4 commits after that sync (review + honesty). Commercial GRC HEAD independently unconfirmed. **tip ≠ commercial GRC tip.** |
| ARR / customers / certs claimed | None. |
| Merge | Not requested. Do not merge. |
