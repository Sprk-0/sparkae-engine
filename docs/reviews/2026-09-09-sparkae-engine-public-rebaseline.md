# SparkAE public engine rebaseline — 2026-09-09

Read-only review of the public Apache-2.0 browser/demo Source
(`Sprk-0/sparkae-engine`), the tree linked from https://sparkae.ai.
This is **not** a review of the commercial Path-3 / server product.

**Public-ready for demo/reference: YES.**
Safe to keep public as a static site + in-browser EXAMINE reference.
Not ready to be read as a Path-3 install, and the marketing pages this
same tree publishes still mix the two.

No traction is claimed or implied. Live GitHub metadata on this date:
0 stars, 0 forks, 0 releases, 0 issues, empty About description, empty
homepage URL, no topics. Created 2026-09-04. That is the public record.

---

## 1. Verdict

| Question | Answer |
|---|---|
| Honest enough to stay public as demo/reference? | **Yes.** README, LICENSE, NOTICE, SECURITY.md, and §01 of the demo state the boundary. Conformance CI is green on the tip. |
| Safe for public consumption? | **Yes, as a static Netlify site + browser JS.** No secrets found. Runtime has no third-party loaders. Live CSP is `connect-src 'self'`. Uploads stay in-page. |
| Is this the commercial Path-3 product? | **No.** Nothing in this tree is a server install. No `pyproject.toml`, no Docker, no `/v1` API. |
| Can a visitor confuse it with Path-3? | **Yes, if they start on the homepage or the demo tour instead of the README.** That is the remaining honesty gap. |
| Independent check of private GRC tip? | **Not possible from this identity.** `Sprk-0/GRC` returns 404. Public sync message is the only evidence. |

**P0 blockers to remaining public: none found.**
Closest honesty defect is the homepage hero card (P1): it is labelled
as a finding from the sample run and it is not.

---

## 2. Live tip and CI

Verified 2026-09-09 ~19:50–19:55 UTC.

| Item | Live value |
|---|---|
| Public default branch | `main` |
| Tip SHA | `57354d843a63105442cd07c70085a7eb1d9525b2` (`57354d8`) |
| Commit date | 2026-09-09T17:17:30Z |
| Subject | `Sync site from GRC main 0b4be3c: social card, 404 page, robots and sitemap` |
| Claimed GRC source | `Sprk-0/GRC` `0b4be3c` via `website/sync-public.sh` (IMP-988), per commit body |
| GRC tip independently confirmed? | **No.** `gh repo view Sprk-0/GRC` → repository not found for this reviewer. Do not treat `0b4be3c` as a live GRC HEAD check. |
| Engine in this tree | `ENGINE_VERSION = 1.1.0` in `demo-engine.js` |
| Golden fixture | `tests/golden/sample-ssp.expected.json` — Low / 2026-06-01 / 156 controls / 981 objectives / 383 Satisfied / 597 Other Than Satisfied / verdict digest `3dd76f5f30831b0c4248a1be0ef3d1902559822f` |
| Catalog stamp | Generated 2026-07-21; digest `91ad1b17138f7e0707fe19e65d9b8c3c77833401` |

Conformance workflow (`.github/workflows/ci.yml`, name `conformance`):

| Check | Result |
|---|---|
| Run on tip | [34382007723](https://github.com/Sprk-0/sparkae-engine/actions/runs/34382007723) |
| Conclusion | **success** (push to `main`, 2026-09-09T17:17:35Z–17:18:45Z) |
| Job `conformance` | **success** — `node tests/check.mjs .` then `python tests/check_oscal_schema.py` |
| Job `browser` | **success** — Playwright Chromium, all non-file requests aborted |
| Annotation | Node.js 20 deprecation warning on `actions/checkout@v4`, `setup-node@v4`, `setup-python@v5`. Warning, not a fail. |
| Earlier red on main | `7d81cb7` (2026-09-04) failed twice; fixed by `b6d21a6` (Playwright CJS entry). Subsequent main pushes including this tip are green. |

Local checkout of `origin/main` was already `57354d8`. `git fetch origin main`
did not move the tip. GitHub `list_commits` on `Sprk-0/sparkae-engine` returned
the same SHA first.

This review does **not** treat two unmerged `cursor/*` branches as public
state. They exist (`cursor/align-public-repo-with-sparkae-ai-573f`,
`cursor/public-repo-alignment-91fe`) and already attack some P1s below.
They are not on `main` and have no pull requests as of this check.

---

## 3. LICENSE

| File | Live state |
|---|---|
| `LICENSE` | Apache License 2.0 text, January 2004. GitHub `licenseInfo.key` = `apache-2.0`. |
| Appendix | **Absent.** File ends at “END OF TERMS AND CONDITIONS.” The optional Apache appendix / per-file copyright how-to is not attached. |
| `NOTICE` | Copyright 2026 ONE Solution Cyber. Marks reserved. Server product called out as not covered. NIST catalog + OSCAL schema + OFL fonts attributed. |
| README / terms | Apache-2.0 for this tree; commercial server product licensed, not sold; FAR 12.212 / DFARS 227.7202 named for federal buyers. |

Licence is real and machine-detected. Missing appendix is housekeeping,
not an unlicensed dump. Copyright holder published here is
**ONE Solution Cyber**. The GitHub user profile for `Sprk-0` currently
says company “Spark Z3R0” and `oneills@sparkzero.energy`. That is an
identity mismatch at the account layer, not a missing licence.

Private vulnerability reporting on the repo is **disabled**
(`GET /repos/Sprk-0/sparkae-engine/private-vulnerability-reporting` →
`{"enabled":false}`). `SECURITY.md` already says the email on the site
footer is the path that always works, and the form only if enabled.
Email in the live footer is `info@sparkae.ai`.

---

## 4. What this repository is, and is not

### What it is

The generated public site + the in-browser reference engine, served
as-is by Netlify at https://sparkae.ai.

Ships here (Apache-2.0), matching the README table:

- `demo-engine.js` — deterministic 7-gate EXAMINE assessor (BM25, no embeddings)
- `demo-standalone-catalog.js` — NIST SP 800-53A Rev 5 determination statements
- `demo-exports.js` — six builders (OSCAL 1.1.2 AR, findings/RET/POA&M/TCW CSV, summary, receipt)
- `demo-standalone.html` — §01 live engine; §02–§09 labelled walkthroughs
- `demo-20x.html` — 20x walkthrough (site copy: 20x is in development and is not sold)
- Static pages, self-hosted fonts, `_headers` CSP, `_redirects` `/demo` → standalone
- `tests/` conformance suite that public CI runs

Live site checks (2026-09-09):

- Homepage and demo return **one** CSP each, `connect-src 'self'`, plus
  `X-Frame-Options: DENY`, `nosniff`, HSTS `max-age=31536000` (no
  `includeSubDomains`, as `_headers` documents).
- Footer **Source** link is present on the live homepage and the live
  demo and points at `https://github.com/Sprk-0/sparkae-engine`.
- `/demo` is a live 301 to `/demo-standalone.html`.
- `/static/og-card.png` is a live 1200×630-class PNG (57,813 bytes).
- `robots.txt` and `sitemap.xml` match the tip (eight indexable pages;
  404 disallowed).

### What it is not

Internal name **Path-3** does not appear anywhere in this tree. Public
copy says “SparkAE server product” / “commercial software.” Relative to
that product, this repository is not:

- a `pip install` / Docker / `FRAMEWORK=` / `LLM_PROVIDER=` install
- the multi-tenant API (`/v1/documents`, `/v1/assessments`)
- PDF or XLSX text extraction (refused here with a reason)
- SAR/SAP DOCX, SRTM/CIS/CRM XLSX, OSCAL POA&M, or the other server exporters
- optional LLM modes, assessor console, ten analytical services, RLS, audit chain
- the product test suite (README cites “~9,400 tests” — **not verifiable here**)

README is explicit: “It does not demonstrate the server product; nothing
in this tree runs `pip install` or Docker.”

---

## 5. Claim risks if someone confuses this with a Path-3 install

The highest-risk reader is someone who clones this repo or lands on
https://sparkae.ai and treats the homepage as install docs.

| If they believe… | What is actually true | Where the confusion is planted |
|---|---|---|
| `pip install .` / `pip install '.[local]'` installs SparkAE from this repo | This tree has no Python package. Those lines describe the **commercial** install. | Homepage deployment-mode cards (`index.html`) |
| `FRAMEWORK=nist` / `FRAMEWORK=fedramp` is a flag they can set here | No such runtime in this repo. | Homepage “Profiles today” |
| PDF / XLSX / “14+ formats” / SAR DOCX work after clone | Browser build refuses PDF and XLSX; six export builders only. | Homepage Upload/Export; Integrations “Export as CSV, XLSX”; demo tour |
| `curl localhost:8000/v1/...` will work from this checkout | No server. The block is a commercial API sketch. | Homepage “SPARKAE ENGINE · REST API” |
| Docker / RLS / hash-chained audit / eight roles ship here | Server-product list. | Homepage “Under the hood” |
| The demo tour’s connectors (Drata, Vanta, ServiceNow, PDF/OCR…) run in this build | §09 is a **labelled walkthrough**. §01 is the only live engine. | `demo-standalone.html` onboarding steps 1–2 (shown unless skipped) |
| The hero OSCAL snippet is a real export from the sample run | It is not valid OSCAL 1.1.2, and it is not the sample-run verdict. | Homepage hero (see P1-1) |
| Status page reflects a live Path-3 deployment | `status-data.json` has `published_at: null`. Page says “No status snapshot published.” Copy still talks about `/health/ready`. | `status.html` |
| “Four rounds of adversarial security review” / “~9,400 tests” can be checked here | Public CI is the conformance suite only. Those product claims are **unverified** from this repo. | Homepage engine blurb; README commercial column |
| Outputs are official SAR / ATO material | Site footer and demo footer say they are not. Tour step 1 still says “SAR-conformant output, not a marketing approximation.” | Split message; tour is the weaker side |

A reader who starts at **README.md** or **demo §01 + the live-engine
badge** is not misled. A reader who starts at the **homepage install
cards** or the **unskipped demo tour** can be.

---

## 6. Issues

### P0 — none

No missing licence, no live-red CI on tip, no credential material, no
third-party runtime loader, no claim that this tree *is* the server
install in the README contract.

### P1

**P1-1. Homepage hero is labelled as the sample run and is not.**
`index.html` card for `AC-2_a.[02]`: Other Than Satisfied, confidence
0.68, failed Gate 2, caption “One finding from the sample run.”
The expandable “OSCAL assessment-results record” is not OSCAL 1.1.2
(`target` is a string; `status` is a prop with value
`other-than-satisfied`; `related-observations` is inline description,
not `{observation-uuid}`).

Independent replay of this tree’s engine on the embedded sample
(CloudVault SSP, FedRAMP Low, 2026-06-01), same path as
`tests/check.mjs`:

| Objective | Actual status | Actual confidence |
|---|---|---|
| `AC-2_a.[02]` | **Satisfied** | **0.72** |
| `AC-2_a.[01]` | Satisfied | 0.72 |
| `AC-2_g` | Other Than Satisfied (Gate 2 Concepts) | 0.35 |

The live site at https://sparkae.ai serves the same card. This is the
one place the published page claims “this is the sample run” and the
engine in the same commit disagrees.

**P1-2. Marketing pages in this Apache tree describe the commercial
install as if it were here.** `pip install .`, Docker, REST API,
PDF/XLSX intake, `FRAMEWORK=`, `LLM_PROVIDER=` all live on
`index.html` / `assessors.html` / `integrations.html`. README
contradicts them, but the Source link from the footer lands on GitHub
with an **empty About**, so the first honest document is a scroll away.
A clone-and-install reader hits the homepage copy first if they open
`index.html`.

**P1-3. Demo onboarding over-claims before the live/walkthrough split
is visible.** Tour step 1: “full FedRAMP authorization lifecycle,”
“The platform produces SAR-conformant output, not a marketing
approximation,” connector tiers including PDF/OCR. The page below the
tour is more careful (live vs walkthrough badges; EXAMINE only).
Default path is skip-able, but the first screen is the louder one.

**P1-4. GitHub Source landing is under-described.** Empty description,
no homepage URL, no topics. Site says “see Source in the footer.”
The footer link works. The GitHub card does not repeat the
public-vs-commercial sentence.

### P2

- **P2-1.** `LICENSE` missing Apache appendix (copyright how-to). `NOTICE` already carries Copyright 2026 ONE Solution Cyber.
- **P2-2.** GitHub private vulnerability reporting disabled. Email path is documented and live.
- **P2-3.** CI annotation: Actions Node 20 deprecation. Not a fail today; will become one when GitHub drops the shim.
- **P2-4.** Unmatched 404 responses have no CSP (`_headers` already says this). Page is static and reflects nothing from the request.
- **P2-5.** Walkthrough leftover namespace `https://sparkae.dev/ns/oscal` in `demo-standalone.html` §09, while the live site origin is `sparkae.ai`.
- **P2-6.** Account-layer identity split: published copyright “ONE Solution Cyber” vs GitHub user company “Spark Z3R0.” Not resolved here.
- **P2-7.** Product claims unverifiable from public: “four rounds of adversarial security review,” “~9,400 tests,” GRC HEAD still `0b4be3c`. Do not repeat as facts.
- **P2-8.** Repo hygiene: `tagprobe` branch at older SHA `40013bd`; two `cursor/*` alignment branches with no PRs. Not a visitor-facing defect.
- **P2-9.** No CI badge on the README. Status is checkable at the Actions URL above; a badge would make the green claim inspectable from the Source landing.

---

## 7. README honesty — already present vs still useful

The README is already the most honest document in the tree. Present
today:

- Title: “public reference build”
- What-is / what-is-not table (Apache vs commercial)
- “nothing in this tree runs `pip install` or Docker”
- EXAMINE only; INTERVIEW and TEST stay with the assessor
- PDF/XLSX refused, not guessed
- Generated-from-private-repo / PRs get overwritten on next sync
- Apache-2.0 vs commercial licence paragraph
- Determinism tuple and golden fixture

Recommended **additional** lines (not on `main` today). These belong
in the private generator, not as a one-off edit here (the next sync
would wipe a direct edit):

1. **This repository is not the SparkAE server product (internal:
   Path-3).** There is no package to install. `pip install .` from this
   checkout will not yield the API, Docker image, PDF/XLSX parsers, or
   LLM modes.
2. **The homepage in this tree is the marketing site for the commercial
   product.** The Apache-2.0 engine is `demo-engine.js` driven by
   `demo-standalone.html` §01. Treat `pip install`, `FRAMEWORK=`,
   `localhost:8000/v1`, and Docker snippets on `index.html` as product
   copy, not instructions for this repo.
3. **§02–§09 and `demo-20x.html` are guided walkthroughs.** Their
   connectors, SAR/AO briefing, and 20x path are illustrative. They are
   not executed by `demo-engine.js`.
4. **GitHub About (repo setting, not a file):**  
   `Browser/demo reference for SparkAE EXAMINE. Apache-2.0. Not the commercial server install. https://sparkae.ai`

No README change is included in this PR. This document is the review.

---

## 8. Method and limits

Checked live:

- GitHub API commits + `gh repo view` + `gh run view 34382007723`
- `git fetch origin main` (tip unchanged)
- https://sparkae.ai/ , `/demo-standalone.html`, `/demo` (301),
  `/robots.txt`, `/static/og-card.png`, unmatched 404 headers
- `LICENSE`, `NOTICE`, `README.md`, `SECURITY.md`, `CONTRIBUTING.md`,
  `ci.yml`, `_headers`, homepage/demo/terms/status
- Secret-ish string scan (no live keys; API-key strings are docs/demos)
- Local engine replay of three hero-related objective IDs (P1-1)

Not checked, and not invented:

- Private GRC contents, HEAD, or Path-3 test counts
- Whether “four rounds of adversarial review” occurred
- Netlify form backend, DNS, or account settings beyond response headers
- Browser click-through of a full §01 run (CI `browser` job did that on
  the tip; this reviewer replayed the engine in Node for P1-1 only)
- Legal correctness of ONE Solution Cyber vs Spark Z3R0 naming

Do not cite this review as evidence of users, pilots, stars, or
revenue. None were observed.
