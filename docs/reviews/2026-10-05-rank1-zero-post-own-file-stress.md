# Rank-1 zero-POST proof — own-file path (assist, not certification)

| | |
|---|---|
| Date | 2026-10-05 (ET) |
| Repository | `Sprk-0/sparkae-engine` |
| Tip worked on | `fbc779e3f9b0f8d0c8e1482daee86a1e97a71fed` (= `origin/main` at time of work; commit "Security batch A … (engine 1.6.7) (#54)") |
| Engine version | `ENGINE_VERSION = '1.6.7'` (`demo-engine.js:963`; `demo-standalone.html` reads it as `E.ENGINE_VERSION`) |
| Scope | the own-file path of `demo-standalone.html` (§01 Examine on a visitor-uploaded package) |
| Status | **assist-level proof packet. Not a certification, not an audit, not an attestation.** |

## What this packet says

**The own-file path POSTs zero file bytes; the contact form on `index.html` is unrelated.**

Narrowly: when a visitor selects a package through `demo-standalone.html`'s
upload input and runs §01 Examine on it, the page issues no request other than
its own `file://` loads — no POST, no request body, no `fetch`, `XMLHttpRequest`,
`sendBeacon`, `WebSocket` or `EventSource` call — while the package is read,
inventoried and assessed. The homepage's fit-call form is a Netlify form on a
different page and is not part of this path; it is accounted for separately in
`tests/check_published.mjs`.

Nothing here is a statement about customers, traction or revenue. ARR: $0.

## How it was measured

Headless Chromium (Playwright `chromium-headless-shell` 153.0.8010.12, Node
v22.14.0), the page loaded from `file://`, every non-`file://` request aborted
and counted by a Playwright route, and in the new harness additionally:
every request logged by method/URL/body from the `request` event, and the
page's egress primitives wrapped before its first script ran.

```
npm install --no-save playwright && npx playwright install --with-deps chromium
node tests/browser.mjs .          # existing harness
node tests/own-file-stress.mjs .  # added in this packet
```

### `node tests/browser.mjs .` — existing harness, run at tip

Result: **all browser checks passed** (60 of 60, exit 0). The lines this
packet depends on:

| check | result |
|---|---|
| no page or console errors | ok |
| no request left the page (every non-file request aborted) — `blocked.length === 0` | ok |
| rail: EXAMINE · automated | ok |
| upload defaults the date field to today (local date) | ok |
| upload: PDF refusal logged / shown in the results | ok / ok |
| an ordinary ZIP does not report an upload failure | ok |
| the panel lists the ZIP's members, not the ZIP as one opaque artifact | ok |
| a successful upload binds the package to the engine | ok |
| a DOCX inside the package is read, not refused | ok |
| the nested SSP reached the corpus the run assessed | ok |
| a .zip that is not a ZIP is reported as a failure | ok |
| a failed upload leaves nothing runnable bound to the engine | ok |
| a file one byte over the 64 MB cap is refused … | ok |
| the oversize upload leaves nothing runnable bound to the engine | ok |
| (remaining 46 checks: golden digest, OSCAL byte-identity, XSS-in-filename, walkthrough disclosure, §09, hashes, rail reach) | all ok |

### `node tests/own-file-stress.mjs .` — added in this packet

Uploads `tests/fixtures/own-file-stress/own-file-stress.zip` (4,881 bytes; a
DOCX SSP excerpt, an OSCAL `system-security-plan` JSON, a 4-row scanner CSV, a
notice TXT — every name fictional, marked EXAMPLE, not CUI), runs §01, then
asserts the package was read and nothing left.

Result: **all own-file stress checks passed** (25 of 25, exit 0).

| # | check | result |
|---|---|---|
| 1 | the committed fixture ZIP is the one its sources build (4881 bytes) | ok |
| 2 | the fixture stays small (under 16 KB) | ok |
| 3 | no page or console errors | ok |
| 4 | rail: EXAMINE · automated | ok |
| 5 | no request left the page (every non-file request aborted): `blocked.length === 0` | ok |
| 6 | every request the page made was a `file://` load (10 seen) | ok |
| 7 | no request used a method other than GET/HEAD: zero POSTs | ok |
| 8 | no request carried a body | ok |
| 9 | no request URL or body carried the fixture canary | ok |
| 10 | the upload itself issued no request (0 during the read) | ok |
| 11 | the page never called fetch, XMLHttpRequest, sendBeacon, WebSocket or EventSource | ok |
| 12 | the upload is not reported as a failure | ok |
| 13 | the upload binds one package to the engine | ok |
| 14 | the inventory lists the DOCX, the OSCAL JSON and the CSV by name | ok |
| 15 | none of the three is marked "not read" | ok |
| 16 | the inventory counts 4 files received | ok |
| 17 | the OSCAL JSON is detected as a system-security-plan | ok |
| 18 | the scanner CSV is parsed: 4 rows, C:1 H:1 M:1 L:1 | ok |
| 19 | the artifact inventory marks SSP and Vulnerability scans present | ok |
| 20 | the engine's own read parsed all three members and refused none | ok |
| 21 | §01 reaches Complete on the uploaded package | ok |
| 22 | the run logs the package as received and parsed: 4 file(s), evidence chunks > 0 | ok |
| 23 | the run names the DOCX member it read | ok |
| 24 | the run refused nothing | ok |
| 25 | the run painted findings and a receipt | ok |

Summary line as printed:
`requests observed: 10 (file:// 10, other 0, POST/other-method 0, with body 0); blocked.length=0; egress={"fetch":0,"xhr":0,"beacon":0,"websocket":0,"eventsource":0}`

### Fault injection (does the harness go red?)

A scratch copy of the tree had one line added to the upload handler — a
multipart `fetch(..., { method: 'POST', body: FormData(file) })` to an
off-origin URL. Against that copy the stress harness failed 7 checks (#3, #5,
#6, #7, #8, #10, #11; exit 1). The canary check (#9) alone stayed green,
because Playwright's `postData()` does not expose multipart file parts; it is
recorded in the harness header as a supplement to the method/body/route
checks, not a substitute. The scratch copy was not committed.

## Live vs tip (optional check, performed)

`curl` of the two published demo files at 2026-10-05 14:27 EDT, sha256 against
the blobs at tip `fbc779e3`:

| file | tip sha256 | live sha256 | bytes | |
|---|---|---|---|---|
| `demo-standalone.html` | `52d994a2…2dddee0` | `52d994a2…2dddee0` | 520,299 | **MATCH** |
| `demo-engine.js` | `b80ca75e…0d4b41` | `b80ca75e…0d4b41` | 132,721 | **MATCH** |

Full digests: `52d994a275085fb90d37551182880966e1af426f7455d8b5c6e336b2b2dddee0`,
`b80ca75e69d5504d089c5b35932fa30607e2081aca643cc39ccaf4665d0d4b41`. So the
live demo on this date was the engine 1.6.7 build the harnesses ran against.
No live HAR was captured; this is a byte compare of two files, not a capture
of a live session.

## What this does not say

- It is not a certification, accreditation, 3PAO finding, or legal attestation
  of anything. It is an engineering check that two harnesses pass at one SHA.
- It measures the standalone demo loaded from `file://` in headless Chromium.
  It does not measure the served page's CSP (that is `check_published.mjs`
  §4), a visitor's browser extensions, or any server-side product.
- It covers §01 Examine on an upload. The walkthrough tabs on an upload are
  covered by `browser.mjs` under the same route; they are not re-measured here.
- It says nothing about customers, users, revenue or adoption.

## Files in this packet

- `docs/reviews/2026-10-05-rank1-zero-post-own-file-stress.md` — this note
- `tests/own-file-stress.mjs` — the harness
- `tests/fixtures/own-file-stress/` — `own-file-stress.zip`, its sources under `src/`, `build.mjs`, `README.md`
- `_redirects` — two forced splat rules keeping this note and the fixture tree off the published site (below)
- `tests/check.mjs` §22 and `tests/check_published.mjs` — hold those rules offline and on the wire

## Publication

`netlify.toml` publishes the repository root, so without a rule this note and
the fixture would be served at their paths. On the CoS and CTO call of
2026-10-05 they are not: `_redirects` now carries, in the same forced form the
`static/og-card.src.html` rule uses,

```
/docs/reviews/*                      /404.html    404!
/tests/fixtures/own-file-stress/*    /404.html    404!
```

The splats cover every file under both directories, including anything added
later. `tests/check.mjs` §22 walks both directories and requires each file's
first-matching rule to be a forced 404; `tests/check_published.mjs` excludes
both from the byte comparison and requires the host to answer 404 for each
file. GitHub is where this note and the fixture are read; the published site
makes no claim from either.
