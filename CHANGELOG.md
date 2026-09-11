# Changelog

Notable changes to the public reference build.

Entries are dated rather than tagged: there are no releases to number here,
and `ENGINE_VERSION` in `demo-engine.js` moves only when the engine does. Because every artifact this build produces carries a reproducibility
receipt, an entry records whichever of these moved:

```text
engine version · catalog digest · ruleset digest · evidence digest · assessment date
```

and, downstream of them, the **verdict digest** for the bundled sample
(`CloudVault-Federal-SSP.txt`, FedRAMP Low, assessed as of 2026-06-01) pinned
in `tests/golden/sample-ssp.expected.json`.

A verdict digest that does not move across a change is the claim worth
reading: it means the determinations are the same ones, byte for byte.

## 2026-09-11 (§09 Data Sources)

Engine 1.1.0 · verdict digest `3dd76f5f3083` unchanged

The connector walkthrough claimed a running integration estate that does not
exist. The demo now says what the Integrations page says.

- Two connectors were badged **● LIVE** with a "View live OAuth URL" action,
  while the page's own onboarding text said none of these connectors run in
  this browser build. Both statements cannot be true. Every card now reads
  ◇ WALKTHROUGH, and the OAuth modal behind that action — 38 lines pointing at
  a placeholder client id and a GitHub App install URL — is gone.
- Coverage percentages, artifact counts and **last-sync timestamps** are gone
  from the cards, the log, the summary and the finding citations. A sync that
  never ran has no last-sync time, and a connection nobody made has no coverage.
- The run emitted assessor-style observations citing a
  "SPARKAE <connector> connector configuration · 47 artifacts · 92% coverage ·
  last sync 2026-04-28", and recommended continuing a sync cadence that does not
  exist. Those observations now describe the mapping and say plainly that no
  system was contacted.
- **Five connectors were receiving Satisfied determinations**, decided by a
  coverage figure attached to a connection that was never made. A connector that
  does not exist cannot be examined, so every one is Not Reviewed.
- The disclosure moved out of the opt-in onboarding tour and onto the panel
  itself, where a visitor who never opens the tour will read it, with a link to
  the Integrations page for what exists today.

Three browser checks added; all three fail against the previous build.

## 2026-09-11 (later)

- **Nothing runs until the visitor asks.** The demo started the CloudVault
  assessment by itself half a second after load, so a visitor arriving from the
  Integrations page — or anywhere else — met a running assessment of a package
  they had not chosen, over a date they had not set. An assessment is a claim
  about a specific package as of a specific day, and starting one unbidden makes
  that claim on the visitor's behalf. The console now sits at READY and waits.

Engine 1.1.0 · verdict digest `3dd76f5f3083` unchanged

Findings 5 and 7 of the outside upload review, both reproduced against the
deployed files before anything was changed.

- **One ingestion, not two.** The upload panel expanded archives with JSZip,
  which this page has never loaded. So an ordinary package produced a fatal
  "JSZip library failed to load — cannot unpack .zip packages" while a second
  change listener handed the same file to the engine, which has its own reader,
  and assessed it successfully. The panel now expands with the engine's reader:
  the members it lists and the members a run assesses are the same members, and
  a refusal is a refusal on both sides. The panel's verdict on an upload is the
  engine's verdict — a package nothing could be read from is reported as a
  failure rather than as N unreadable files.
- **A failed upload leaves nothing runnable.** The second listener bound the
  raw files whether or not the ingestion succeeded, so a package the panel had
  just called a failure sat there, selected, and Run Again assessed it. There is
  one listener now, and it binds the package only after the read succeeds.
- **A Word SSP inside a package is read.** A DOCX is a ZIP, and the archive
  reader decoded every member to text, which destroys one. A package whose SSP
  was a .docx therefore reached Complete having read the README and not the SSP
  — the one document the assessment most depends on was the one excluded. The
  reader keeps the bytes for member types that need them, and the same DOCX
  reader now serves a Word file selected directly and one nested in a package.
  A nested archive spends the enclosing package's expansion allowance, so a
  package of many DOCX members cannot expand past the limit one member at a
  time.
- Roughly 150 lines of unreachable ingestion code removed with them, including
  a `processUploads` that nothing had called and a PDF reader for a library the
  page does not load.

Seven browser checks and two engine checks added. Five of the browser checks
and both engine checks fail against the previous build; the fault injection
reproduces the reviewer's two findings verbatim, including the literal
"JSZip library failed to load" label.

## 2026-09-11

Engine 1.1.0 · verdict digest `3dd76f5f3083` unchanged

An outside reviewer uploaded adversarial packages to the published demo and
wrote up what happened. Every item below is one of their findings, reproduced
here against the deployed files before it was changed.

- **No member of an uploaded archive is lost, overwritten, or silently
  resolved.** The ZIP reader walked local file headers and kept members in an
  object keyed by name. A streaming archive — sizes written after the data,
  zeroes in the local header — lost every member: the first was refused as a
  truncated stream and the scan then advanced by zero bytes. An archive with
  two members named `review-ssp.txt` kept only the last; the earlier one said
  account monitoring was not implemented, and dropping it turned AC-2_g from
  Other Than Satisfied into Satisfied with no refusal shown. The reader now
  takes its inventory from the central directory and returns members as a list,
  so a duplicate name survives to be refused by name rather than resolved to
  one of its members. ZIP64, truncated members, and archives that expand past
  64 MB or declare more than 512 members are refused by name as well.
- **A file name cannot execute in the assessment page.** The inventory renderer
  concatenated the uploaded file name into `innerHTML`, so a name containing an
  element with an error handler ran that handler on the site. Names, tags, and
  cited controls are escaped now; the hostile name is still displayed, as text.
- **A run no longer leaks into the next.** Clear Upload reset the panel but left
  the raw files in place, so a cleared package kept being assessed under the
  next sample's date, and assessor revisions keyed only by objective carried
  into a different package. Uploading, clearing, and starting a run each discard
  the previous run's files, revisions, and displayed results.
- **The ungrounded-Satisfied claim is withdrawn.** Five places on the site said
  a Satisfied determination cannot rest on evidence that does not address the
  objective. The reviewer showed one that does — `AT-1_a.[01]` returned
  Satisfied from two documents that establish no awareness and training policy.
  The claim is off the site; the coverage rule that produced it is still open.

## 2026-09-10

Engine 1.1.0 · verdict digest `3dd76f5f3083` unchanged

- Public calls-to-action soft-gated away from paid Day-0 pilots: the pilot
  request forms and partner-program pricing became fit-call contact. No
  published customer results, and no pricing or terms, appear on the public
  face.
- Internal review and hygiene notes removed from the published tree. They were
  served on the site alongside the pages and are working notes for the source
  repository.
- Apache License appendix attached, and a code of conduct and issue templates
  added.

## 2026-09-09

Engine 1.1.0 · verdict digest `3dd76f5f3083` unchanged · OSCAL bytes moved

- **Served as-is, enforced.** Netlify's Pretty URLs post-processing rewrites
  published HTML, so all seven pages differed from the files here and the
  internal link graph pointed at addresses the pages' own `canonical` tags
  disclaim. `netlify.toml` pins the setting off, `tests/check.mjs` fails if the
  pin is dropped, and `tests/check_published.mjs` reads the wire to confirm the
  deployed site is this tree byte for byte.
- Homepage hero now shows an OSCAL record the exporter actually emits, in the
  shape it actually writes, and CI locks it to the sample run.
- Exported OSCAL assessment-results changed size (2,558,681 → 2,558,519 bytes)
  without changing a single determination — the verdict digest held. The golden
  fixture pins both, so the two can move independently and visibly.

## 2026-09-07

Engine 1.0.0 → **1.1.0** · verdict digest `fab631a2ef69` → `3dd76f5f3083`

- Date handling, the refutation index, and Gate 2 scope changed. Determinations
  on the bundled sample moved accordingly, which is what the digest change
  records.

## 2026-09-04

Engine 1.0.0 · verdict digest `fab631a2ef69` · initial public release

- In-browser reference engine (`demo-engine.js`), the NIST SP 800-53A Rev 5
  determination-statement catalog (`demo-standalone-catalog.js`, generated
  2026-07-21, digest `91ad1b17138f`), six export builders
  (`demo-exports.js`), the live demo and walkthroughs, the site pages,
  self-hosted fonts, per-page CSP, and the conformance suite CI runs on every
  push. Apache-2.0.
