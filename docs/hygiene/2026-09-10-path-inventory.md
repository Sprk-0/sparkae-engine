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

**Line-evidence is §11.** Folder-skim is not complete. Every
REWRITE / DELETE / ARCHIVE / risky KEEP claim is pinned to an exact
`path:line` quote. Paths with no risky public-claim string are listed
in §11.1 rather than assumed clean.

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
| Line quotes taken from | that tip (site/engine/tests) plus this branch (this file only) |
| Documented GRC pin | `0b4be3c` at public `57354d8` |
| Lag | Public tip is 4 commits after that sync (review + honesty). Commercial GRC HEAD independently unconfirmed. **tip ≠ commercial GRC tip.** |
| ARR / customers / certs claimed | None. |
| Merge | Not requested. Do not merge. |
| Line-evidence | §11. Folder-skim is not complete; every REWRITE/DELETE/ARCHIVE/risky KEEP is pinned to `path:line`. |

---

## 11. Line-evidence

1-based lines. Quotes are the exact risky (or load-bearing KEEP) substring on that line. Disposition is the inventory verb for that string, not a change in this PR.

**Public tip ≠ commercial GRC tip.** These quotes are from public `6f2f45e`, not from an independently confirmed GRC HEAD.

### 11.1 Paths with no risky public-claim string

Stated explicitly. Not a folder skim: each path was opened or grepped for paid-pilot CTAs, Path-3/install-ready language, FedRAMP/ATO/3PAO product implication, tip≡commercial, and synthetic unlabeled as live.

| Path | Verdict |
|---|---|
| `LICENSE` | No risky string. Apache-2.0 legal text only. |
| `CONTRIBUTING.md` | No risky string. Determinism / no-network / “say only what was computed.” |
| `SECURITY.md` | No risky string. Browser-only threat model and email reporting. |
| `.gitignore` | No risky string. `tests/out/` and `node_modules/` only. |
| `ae-editorial.css` | No risky string. Tokens and layout. No CTA or install copy. |
| `robots.txt` | No risky string. `Allow: /` and `Disallow: /404.html`. |
| `demo-standalone-catalog.js` | No product-claim string. NIST SP 800-53A catalog object only (USG text). |
| `tests/browser.mjs` | No risky string. Playwright driver; aborts non-file requests. |
| `tests/check_oscal_schema.py` | No product-claim string. `pip install jsonschema` / `regex` are schema-check deps, not a SparkAE wheel. |
| `tests/golden/sample-ssp.expected.json` | No risky string. Digests and counts for the synthetic fixture. |
| `tests/schema/oscal_assessment-results_schema.json` | No product-claim string. Vendored NIST schema. |
| `static/fonts/Fraunces-VariableFont.woff2` | No text line. Binary font. |
| `static/fonts/Fraunces-Italic-VariableFont.woff2` | No text line. Binary font. |
| `static/fonts/IBMPlexSans-VariableFont.woff2` | No text line. Binary font. |
| `static/fonts/IBMPlexMono-Regular.woff2` | No text line. Binary font. |
| `static/fonts/IBMPlexMono-Medium.woff2` | No text line. Binary font. |
| `static/fonts/IBMPlexMono-SemiBold.woff2` | No text line. Binary font. |
| `static/fonts/OFL-Fraunces.txt` | No risky string. SIL OFL 1.1. |
| `static/fonts/OFL-IBM-Plex.txt` | No risky string. SIL OFL 1.1. |
| `static/og-card.png` | No extractable text line (binary PNG). The speed claim lives in HTML `og:image:alt` — see those `path:line` rows. |
| `.github/workflows/ci.yml` | No Path-3 product-claim string. Line 39 `pip install jsonschema regex` is the OSCAL schema job, not `pip install .` of SparkAE. |
| `demo-engine.js` | No public-claim CTA or install-ready string. Line 400 has `\bATO\b` only as a **document-name regex token** in retrieval, not a product or authorization claim. |

### 11.2 Line table

| path:line | quote | disposition | why |
|---|---|---|---|
| `index.html:194` | `Request Pilot` | **DELETE** | Paid-pilot nav CTA. ARR $0. |
| `index.html:201` | `runs inside your boundary` | **REWRITE** | True of the in-tab demo; reads as a server install boundary. |
| `index.html:202` | `Minutes, not weeks.` | **REWRITE** | Speed claim. Not a measured customer result. |
| `index.html:203` | `Runs entirely inside your environment. No black box. No evidence leaves your network.` | **REWRITE** | Same install-ready reading as 201. |
| `index.html:206` | `Start a 30-day pilot` | **DELETE** | Paid-pilot CTA. |
| `index.html:24` | `Minutes, not weeks. 410 controls, 1,429 objectives, FedRAMP High baseline, 7 deterministic gates.` | **REWRITE** | Shared og:image:alt speed claim (twitter alt repeats at 27). |
| `index.html:251` | `One finding from the sample run · CloudVault · FedRAMP Low · 2026-06-01 · synthetic data` | **KEEP** (honesty) | Synthetic/sample label. CI-locked. Do not strip. |
| `index.html:296` | `Minutes, not weeks.` | **REWRITE** | Repeat speed claim. |
| `index.html:301` | `` `FRAMEWORK=nist` and the PM family are server-product install flags, not this repository. `` | **DELETE** the `FRAMEWORK=` token; **KEEP** “not this repository” | Wheel-shaped flag on the public face. |
| `index.html:313` | `Why a CUI program can use it at all.` | **REWRITE** | Suitability/accreditation claim this tree cannot confer. |
| `index.html:318` | `The default install makes no outbound calls` | **DELETE** | “Default install” is Path-3-shaped. No install in this tree. |
| `index.html:318` | `CUI never transits a vendor cloud because there is none in the path.` | **REWRITE** | Same CUI implication. |
| `index.html:331` | `We do not publish customer results yet.` | **KEEP** (honesty) | ARR $0. Do not invent a number. |
| `index.html:331` | `These are the measures a 30-day pilot is scored against` | **DELETE** | Pilot-program claim on a $0 face. |
| `index.html:361` | `` The commercial server product also installs as plain NIST 800-53 (`FRAMEWORK=nist` `` | **DELETE** | Install-ready flag. |
| `index.html:361` | `FedRAMP 20x support is in development and is not sold.` | **KEEP** (honesty) | Do not let 20x read as shipped. |
| `index.html:380` | `` This Apache-2.0 repository has no Python package — `pip install .` from this checkout will not work. `` | **KEEP** (honesty) / **REWRITE** later | Load-bearing install boundary. A later strip of `pip install` copy must rewrite `tests/check.mjs:270` first. |
| `index.html:386` | `LLM_PROVIDER=none` | **DELETE** | Server-product config. Not this repo. |
| `index.html:388` | `server: pip install .` | **DELETE** | Path-3 wheel. No package here. |
| `index.html:393` | `LLM_PROVIDER=ollama` | **DELETE** | Same. |
| `index.html:395` | `server: pip install '.[local]'` | **DELETE** | Same. |
| `index.html:400` | `LLM_PROVIDER=anthropic` | **DELETE** | Same. |
| `index.html:402` | `server: pip install '.[cloud]'` | **DELETE** | Same. |
| `index.html:405` | `This repository is the browser demo, not that install.` | **KEEP** (honesty) | Install boundary. |
| `index.html:405` | `There is no Docker image and no `/v1` API here.` | **KEEP** (honesty) | Install boundary. |
| `index.html:415` | `SSP → SAR.` | **REWRITE** | §01 is EXAMINE preparation, not a SAR. |
| `index.html:449` | `gap engine (25 types)` | **DELETE** | Server-product count. This engine does not ship 25 types. |
| `index.html:450` | `SAR and SAP (JSON + DOCX), RET, CRM, CIS, TCW in the FedRAMP profile — 14+ formats.` | **DELETE** | This build ships six builders. |
| `index.html:452` | `Eight assessment roles from system admin to authorizing official, multi-tenant org isolation, permission-gated API.` | **DELETE** | Not in this tree. |
| `index.html:453` | `Hash-chained append-only log (AU-2 / AU-3, integrity per AU-9); syslog RFC 5424 and ArcSight CEF exports.` | **DELETE** | Not in this tree. |
| `index.html:454` | `The same engine behind the assessor UI and the GRC API` | **DELETE** | Implies a commercial UI/API behind this site. |
| `index.html:455` | `Production-hardened Docker: non-root, read-only filesystem, cap_drop ALL, health checks, graceful drain.` | **DELETE** | No Dockerfile here. |
| `index.html:467` | `There is no localhost:8000 here.` | **KEEP** (honesty) | Boundary on the sketch. |
| `index.html:468` | `curl -s http://localhost:8000/v1/documents` | **DELETE** | Path-3 API sketch. Still ships in page source. |
| `index.html:470` | `curl http://localhost:8000/v1/assessments` | **DELETE** | Same. |
| `index.html:488` | `<span id="pricing"></span>` | **DELETE** | Pricing anchor. No price, still a commercial hook. |
| `index.html:491` | `Start a 30-day paid pilot.` | **DELETE** | Paid-pilot CTA. ARR $0. |
| `index.html:492` | `Priced to the assessment, not per seat. A founder call within 48 hours of your request.` | **DELETE** | Commercial offer. No ARR to back a 48-hour SLA. |
| `index.html:493` | `name="pilot-request"` | **ARCHIVE** | Netlify paid-pilot form. |
| `index.html:510` | `Request a pilot →` | **DELETE** | Paid-pilot CTA. |
| `index.html:525` | `it is **not** a FedRAMP Recognized independent assessment service (historically, a 3PAO), it does not replace one, and it does not make the authorization decision or issue the official Security Assessment Report or an Authorization to Operate.` | **KEEP** (honesty) | Not-a-3PAO / not-ATO. Move with the page if `#cta` is deleted. |
| `assessors.html:7` | `the same engine as the GRC API. Not the assessor of record.` | **ARCHIVE** page; **KEEP** “Not the assessor of record” if stubbed | GRC API implies Path-3; not-assessor-of-record is honesty. |
| `assessors.html:123` | `Request Pilot` | **DELETE** | Paid-pilot nav. |
| `assessors.html:129` | `For FedRAMP Recognized Independent Assessment Services — historically 3PAOs` | **REWRITE** / **ARCHIVE** | Audience label. Fine as history; loud next to a partner SKU. |
| `assessors.html:134` | `Schedule a partner call` | **DELETE** | Overclaim CTA. |
| `assessors.html:164` | `It is not a FedRAMP Recognized independent assessment service, it does not replace one` | **KEEP** (honesty) | Not-a-3PAO. |
| `assessors.html:197` | `XLSX export with Results, Summary, POA&M sheets — one click` | **DELETE** | Browser build refuses XLSX. |
| `assessors.html:210` | `We do not publish customer results yet, and no savings figure appears here until a pilot produces one.` | **KEEP** (honesty) | ARR $0. |
| `assessors.html:252` | `3PAO Workflow` | **DELETE** | Stale product label vs not-a-3PAO. |
| `assessors.html:275` | `14+ formats in the server product (the public reference build ships six)` | **DELETE** “14+” / **KEEP** “ships six” | Wheel-shaped export list. |
| `assessors.html:284` | `25 FedRAMP-aligned gap types in the server product` | **DELETE** | Not this tree. |
| `assessors.html:286` | `14+ export formats` | **DELETE** | Same. |
| `assessors.html:301` | `SparkAE is not the assessor of record.` | **KEEP** (honesty) | Not-a-3PAO. |
| `assessors.html:305` | `` (`LLM_PROVIDER=none`) `` | **DELETE** | Server-product config. |
| `assessors.html:305` | `typically in a Docker container with a read-only filesystem, cap_drop ALL, non-root.` | **DELETE** | No Docker in this tree. |
| `assessors.html:305` | `That install is not this public repository.` | **KEEP** (honesty) | Install boundary. |
| `assessors.html:341` | `3PAO Partner Program` | **ARCHIVE** | Commercial SKU. ARR $0. |
| `assessors.html:345` | `3PAO Partner` | **ARCHIVE** | Same. |
| `assessors.html:346` | `Priced per firm, not per assessor · founder call within 48 hours` | **DELETE** | Commercial offer. |
| `assessors.html:348` | `Unlimited assessments` | **DELETE** | SKU claim this tree cannot deliver. |
| `assessors.html:350` | `White-label reports` | **DELETE** | Same. |
| `assessors.html:351` | `14+ export formats (OSCAL, SAR, SAP, RET, POA&M, CRM, CIS)` | **DELETE** | Same. |
| `assessors.html:352` | `Named support engineer` | **DELETE** | Same. |
| `assessors.html:354` | `On-prem deployment` | **DELETE** | Path-3 install. |
| `assessors.html:357` | `Annual contract with quarterly business reviews.` | **DELETE** | Commercial offer. |
| `assessors.html:358` | `Schedule a partner call` | **DELETE** | CTA. |
| `assessors.html:368` | `See it before you commit` | **REWRITE** or **DELETE** | Commit-to-buy frame. |
| `assessors.html:379` | `Run a real assessment on a real SSP. Today.` | **REWRITE** | “Real SSP” vs the synthetic sample this face actually runs. |
| `assessors.html:382` | `Request a partner pilot →` | **DELETE** | CTA. |
| `assessors.html:388` | `It is not a FedRAMP Recognized independent assessment service (historically, a 3PAO)` | **KEEP** (honesty) | Not-a-3PAO. |
| `integrations.html:15` | `Same 7-gate engine as the 3PAO UI.` | **DELETE** / **ARCHIVE** page | Implies a 3PAO product UI exists behind this site. |
| `integrations.html:105` | `Request Pilot` | **DELETE** | Paid-pilot nav. |
| `integrations.html:112` | `SparkAE is Tenable for SSPs.` | **ARCHIVE** | Category claim; page is a connector catalog this tree does not run. |
| `integrations.html:113` | `Package → SparkAE → ServiceNow, RegScale, Archer, Jira.` | **ARCHIVE** | Live-connector implication. |
| `integrations.html:115` | `View the API →` | **DELETE** | CTA to a `/v1` sketch. |
| `integrations.html:140` | `SparkAE is Tenable for SSPs.` | **ARCHIVE** | Repeat. |
| `integrations.html:190` | `Your GRC tool can call SparkAE's REST API (same 7-gate engine as the 3PAO UI).` | **DELETE** | Path-3 API + 3PAO UI. |
| `integrations.html:211` | `OEM / white-label` | **ARCHIVE** | SKU talk. Line 212 already says it is not a shipping SKU. |
| `integrations.html:324` | `curl -X POST http://localhost:8000/v1/documents` | **DELETE** | Path-3 wheel. |
| `integrations.html:342` | `curl -X POST http://localhost:8000/v1/assessments` | **DELETE** | Same. |
| `integrations.html:383` | `# 14+ export formats — all from /v1/assessments/{job_id}/export?format=` | **DELETE** | Same. |
| `integrations.html:391` | `# FedRAMP SAR DOCX` | **DELETE** | Not in this build. |
| `integrations.html:477` | `Already have a GRC stack? Perfect. We plug right in.` | **DELETE** | Certified-connector implication despite “not a certified two-way sync” elsewhere. |
| `integrations.html:480` | `Request a pilot on your stack →` | **DELETE** | Paid-pilot CTA. |
| `integrations.html:7` | `Not a certified two-way Drata/Vanta sync.` | **KEEP** (honesty) if page stays | Honesty footnote. Prefer ARCHIVE of the whole page. |
| `demo-20x.html:121` | `Request Pilot` | **DELETE** | Paid-pilot nav. |
| `demo-20x.html:127` | `Lane 2 · 20x Persistent Validation Assurance · Walkthrough` | **KEEP** (honesty) / **ARCHIVE** page | Walkthrough label is honest; keeping the page implies a 20x product path the rest of the site says is not sold. |
| `demo-20x.html:129` | `This walkthrough follows one real KSI through all six steps` | **REWRITE** or **ARCHIVE** | “real KSI” — synthetic unlabeled as live. |
| `demo-20x.html:24` | `Minutes, not weeks.` | **REWRITE** | Shared og alt. |
| `status.html:6` | `published from each deployment's live health checks.` | **ARCHIVE** | Describes a Path-3 deployment. This origin has no `/health/ready`. |
| `status.html:68` | `Request Pilot` | **DELETE** | Paid-pilot nav. |
| `status.html:84` | `/health/ready` | **ARCHIVE** | Server endpoint that is not in this tree. |
| `status.html:93` | `live /health/ready and /metrics checks` | **ARCHIVE** | Same. |
| `status.html:104` | `/v1/* endpoints, authentication, exports` | **ARCHIVE** | Path-3 component. |
| `status.html:112` | `Web UI at /static/` | **ARCHIVE** | Server dashboard. Not this static site. |
| `status.html:120` | `S3 / DB-backed uploads` | **ARCHIVE** | Same. |
| `status.html:144` | `Older history at the SparkAE trust portal.` | **ARCHIVE** | Portal is not in this tree. Not invented here. |
| `status.html:162` | `Customer-impacting incidents are notified per the published` | **ARCHIVE** | Customer SLA copy. ARR $0. No customers published. |
| `status-data.json:5` | `/health/ready and /metrics endpoints` | **ARCHIVE** | Points at a private runbook not in this tree. |
| `status-data.json:28` | `"published_at": null` | **KEEP** (honesty) if file stays | Honest empty snapshot. Prefer ARCHIVE with the page. |
| `demo-standalone.html:22` | `Minutes, not weeks.` | **REWRITE** | Shared og alt. |
| `demo-standalone.html:2317` | `The other eight tabs are guided walkthroughs of the rest of a FedRAMP lifecycle; they are labelled as such and do not run the engine.` | **KEEP** (honesty) | Live vs walkthrough. |
| `demo-standalone.html:2330` | `not a live connector` | **KEEP** (honesty) | Connector theater is labelled. |
| `demo-standalone.html:2330` | `two-way GRC sync are server-product or future work, not this page.` | **KEEP** (honesty) | Same. |
| `demo-standalone.html:2332` | `ATO letters` | **ARCHIVE** tour step | Authorization-product roster on first-run tour. |
| `demo-standalone.html:2361` | `ATO · conditional ATO · defer` | **ARCHIVE** | Walkthrough reads as authorization product. |
| `demo-standalone.html:2390` | `Request Pilot` | **DELETE** | Paid-pilot CTA. |
| `demo-standalone.html:2429` | `SSP → SAR · 7-gate adjudication` | **REWRITE** | §01 is not a SAR. Live badge on the same line is **KEEP**. |
| `demo-standalone.html:2663` | `Nothing here is a FedRAMP PMO endorsement, and no output substitutes for a formal 3PAO assessment.` | **KEEP** (honesty) | Not-a-3PAO / not official. |
| `demo-standalone.html:2672` | `Now run it on yours.` | **REWRITE** | Fine if it means drop-a-file in this tab; not a server install. |
| `demo-standalone.html:2691` | `Conformant with` | **REWRITE** | Next lines name SAR/POA&M/ConMon templates. §01 is EXAMINE prep, not a SAR. |
| `demo-standalone.html:2692` | `FedRAMP SAR Template Rev5` | **REWRITE** | Same. |
| `demo-standalone.html:2705` | `CloudVault Federal — FedRAMP Low Baseline` | **KEEP** (honesty) | Synthetic sample body (`#sample-ssp-data`). |
| `demo-standalone.html:3082` | `The 3PAO examined the role-based access control configuration` | **ARCHIVE** | Walkthrough voice as a 3PAO. **139** lines in this file contain `The 3PAO` (same class; not re-quoted). |
| `demo-standalone.html:7243` | `two-way · controls + evidence + assessments` | **ARCHIVE** | Connector theater (`GRC_CONNECTORS`). |
| `demo-standalone.html:9008` | `This was CloudVault Federal, a synthetic sample.` | **KEEP** (honesty) | Synthetic label after §01. |
| `demo-standalone.html:9008` | `start a 30-day pilot on the local engine →` | **DELETE** | Paid-pilot CTA after the live run. |
| `demo-standalone.html:9009` | `Start a 30-day pilot on the local engine →` | **DELETE** | Same. |
| `404.html:71` | `Request Pilot` | **DELETE** | Paid-pilot nav. |
| `404.html:86` | `Request a pilot` / `Start a 30-day pilot with defined success criteria` | **DELETE** | Paid-pilot CTA. |
| `404.html:40` | `Minutes, not weeks.` | **REWRITE** | Shared og alt. |
| `privacy.html:52` | `Request Pilot` | **DELETE** | Paid-pilot nav. |
| `privacy.html:57` | `Last updated: 26 June 2026` | **REWRITE** | Stale vs `terms.html:57` `4 September 2026`. |
| `privacy.html:70` | `LLM_PROVIDER=none` | **DELETE** | Server-product config. |
| `privacy.html:73` | `processed entirely within the container you run.` | **DELETE** | Path-3 container. No container here. |
| `privacy.html:81` | `“Start a Pilot” or “Contact Sales,”` | **REWRITE** | Names CTAs that should die. |
| `privacy.html:100` | `your database within your infrastructure` | **DELETE** | Server-product data plane. |
| `privacy.html:101` | `under multi-tenant isolation` | **DELETE** | Not this tree. |
| `privacy.html:23` | `Minutes, not weeks.` | **REWRITE** | Shared og alt. |
| `terms.html:52` | `Request Pilot` | **DELETE** | Only DELETE zone on an otherwise KEEP page. |
| `terms.html:7` | `not a 3PAO, and not a source of an Authorization to Operate.` | **KEEP** (honesty) | Not-a-3PAO / not-ATO. |
| `terms.html:75` | `not a Third Party Assessment Organization (3PAO)` | **KEEP** (honesty) | Same. |
| `terms.html:76` | `Authorization to Operate (ATO)` | **KEEP** (honesty) | Same. |
| `terms.html:103` | `synthetic, fictional data` | **KEEP** (honesty) | Sample label. |
| `terms.html:23` | `Minutes, not weeks.` | **REWRITE** | Shared og alt (only risky string besides nav CTA). |
| `README.md:22` | `This repository is **not** the SparkAE server product.` | **KEEP** (honesty) | Install boundary. |
| `README.md:23` | `no pyproject.toml, no Docker image, no /v1 API.` | **KEEP** (honesty) | Same. |
| `README.md:24` | `pip install . from this checkout will not yield` | **KEEP** (honesty) | Names the wheel to deny it. Do not weaken. |
| `README.md:29` | `FRAMEWORK=, localhost:8000/v1, and Docker snippets on index.html` | **KEEP** (honesty) | Points at the DELETE zones on the homepage. |
| `README.md:101` | `The bundled sample (CloudVault-Federal-SSP.txt` | **KEEP** (honesty) | Synthetic fixture. |
| `README.md:16` | `Multi-tenant API (/v1/documents, /v1/assessments), Postgres row-level security, hash-chained audit log` | **KEEP** | Commercial column of the what-is-not table. Not a claim that those ship here. |
| `NOTICE:16` | `The SparkAE server product is separate commercial software and is not covered by this licence.` | **KEEP** (honesty) | Licence boundary. |
| `tests/check.mjs:270` | `check(/server product/.test(home) && /pip install/.test(home) && /will not work/.test(home),` | **KEEP** / follow-on **REWRITE** | Freezes wheel-shaped literals on `index.html`. Rewrite the assertion before deleting those strings. |
| `demo-exports.js:629` | `running entirely in your browser against a sample SSP.` | **KEEP** (honesty) | Synthetic + in-browser. |
| `demo-exports.js:631` | `scoped, or adopted by a FedRAMP Recognized independent assessment` | **KEEP** (honesty) | Not-a-3PAO in the export text. |
| `_redirects:22` | `/3pao.html    /assessors.html    301` | **KEEP** redirect; **ARCHIVE** the name | Stale product path. Do not revive `3pao.html`. |
| `_redirects:10` | `/demo` would resolve to demo.html | **KEEP** (comment) | Unpublished API demo. Do not republish. |
| `_headers:26` | `API-connected demo (demo.html), which needed a wildcard connect-src` | **KEEP** (comment) | Says it is gone. |
| `netlify.toml:3` | `/3pao.html -> /assessors.html` | **KEEP** (comment) | Documents the move. Do not revive. |
| `sitemap.xml:15` | `https://sparkae.ai/integrations.html` | **REWRITE** | Drop when that page is archived. |
| `sitemap.xml:16` | `https://sparkae.ai/demo-20x.html` | **REWRITE** | Same. |
| `sitemap.xml:17` | `https://sparkae.ai/status.html` | **REWRITE** | Same. |
| `docs/reviews/2026-09-09-sparkae-engine-public-rebaseline.md:5` | `This is **not** a review of the commercial Path-3 / server product.` | **KEEP** | Internal name appears only here and must not be copied onto the public face. |
| `docs/reviews/2026-09-09-sparkae-engine-public-rebaseline.md:24` | `Is this the commercial Path-3 product? \| **No.**` | **KEEP** | Same. Do not treat as a live GRC HEAD check. |
| `docs/hygiene/2026-09-10-path-inventory.md:10` | `ARR observed: **$0**.` | **KEEP** | This inventory. Not a customer claim. |
