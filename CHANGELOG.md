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

## 2026-09-11 (accuracy benchmark)

Engine 1.2.0 · verdict digest `355a46a6abb3` unchanged — nothing here changes a
determination. It measures them.

- **A labelled case set, scored and published.** `tests/benchmark/cases.json`
  pairs an objective with a fixed set of documents and records the determination
  a competent assessor would reach from those documents alone, with the
  reasoning written down so it can be argued with. `node tests/benchmark.mjs .`
  scores it and writes `tests/benchmark/results.json`; CI runs it with
  `--strict` on every push and fails the build on a wrong determination that has
  no recorded reason. Engine 1.2.0 is right on 11 of 12 cases, with 0 false
  passes and 1 false fail.
- **The reviewer's false pass is now a case that fails against the build that
  produced it.** `at1-account-monitoring-evidence` returns Satisfied under
  engine 1.1.0 and Other Than Satisfied under 1.2.0, so the benchmark
  demonstrably reproduces a real defect rather than only recording the fix.
- **The two populations are scored separately and never merged.** Three cases
  are the outside reviewer's reproductions, written before and without reference
  to the fixes that address them. The other nine were written here and test what
  their author already believed, which is weaker evidence; a single headline
  number would hide that.
- **The one current error is in the file rather than excluded from it.**
  `ac2d2-retrieval-gap` fails: AC-2_d.(2) is answered by a paragraph the
  retriever does not surface, one of the eight retrieval gaps the tightened
  gate 2 exposed. `--strict` tolerates it because the reason is on record, so a
  documented gap does not hold the build red while a new regression still does.
- **What a score there does not mean** is stated where a reader will meet it:
  a new *Accuracy* section in the README, and `tests/benchmark/README.md`. It is
  a measurement against cases someone chose, not field accuracy on real
  authorization packages, and it supports no claim of assessment readiness.
  `check.mjs` §16 verifies that the README's figures are the recorded ones, so
  the numbers in the file most likely to be quoted cannot go stale.

## 2026-09-11 (attribution and inventory)

Engine 1.2.0 · verdict digest `355a46a6abb3` unchanged

Two of the reviewer's repository recommendations.

- **The artifact inventory no longer claims determinations.** `classifyFile`
  matches on file *names*, and the upload panel rendered those matches as
  findings: "OTS finding · CA-5" beside POA&M, "critical · NR finding · PL-2"
  beside SSP. A package missing a file called `poam.xlsx` was told an objective
  had been adjudicated. Nothing in that list adjudicates anything — the engine
  reads document contents when a run starts, and a package can lack a file named
  like a POA&M and still satisfy CA-5 from an SSP section. Missing artifacts are
  now reported as missing, with the control each would ordinarily inform, under a
  heading that says the match is on names rather than contents and that this is
  not an assessment. The same wording went through §01's walkthrough narration,
  where an absent artifact was narrated as a finding the engine had emitted.
- **CSV says who determined what.** The OSCAL exporter has carried
  `engine-determination`, `assessor-determination` and `determination-source`
  since the assessor layer landed; CSV collapsed all of it into one cell, so a
  revised Satisfied was indistinguishable from an engine Satisfied and the
  assessor's statement was lost entirely. The findings CSV gains four columns —
  Engine Determination, Assessor Determination, Determination Source, Assessor
  Statement — beside the effective Determination a consumer acts on. The engine
  column is the engine's and a revision cannot rewrite it, which is the same rule
  the reproducibility receipt follows.

Seven checks added, all failing against the previous build.

## 2026-09-11 (upload re-review)

Engine 1.2.0 · verdict digest `355a46a6abb3` unchanged

The reviewer rechecked the build and found two more, both reproduced here
before being changed.

- **A refused member name could execute.** The upload panel has escaped file
  names on the success path since the first XSS fix. The error path did not:
  `err.message` went into `innerHTML`, and that message names the member that
  could not be read. A package whose members are all refused therefore executed
  its own filename — and the message carrying it was the one added the day
  before to report that nothing in the upload was readable. Fixing one defect
  opened another.
- **Selecting a bundled sample assessed the previous upload.** The uploaded
  package stayed bound when a sample was selected, and `engineCorpus` prefers it
  over the selection, so choosing CloudVault re-assessed the visitor's evidence
  under CloudVault's pinned date. `discardPreviousRun` ran on upload, on clear
  and at run start — not on selection, which is the path this missed. Selecting
  a sample now releases the package, resets the upload panel and discards the
  previous run.

Seven browser checks added; six fail against the previous build, reporting the
reviewer's findings verbatim (`data-refused-audit=1`, `img count=2`, upload
still bound after selecting CloudVault).

## 2026-09-11 (subject matter · engine 1.2.0)

**Engine 1.2.0** · verdict digest `3dd76f5f3083` → `355a46a6abb3`
· ruleset digest `7609e9bfacb7` → `ceb3e3d50fa6`
· bundled sample **383 → 284 Satisfied**

Finding 2 of the 2026-09-11 upload review, the one this build had acknowledged
and not fixed. Determinations move, which is the point: the previous ones were
wrong.

**Gate 2 reads subject matter, not compliance vocabulary.** The reviewer showed
that two documents about account monitoring and multi-factor authentication
returned Satisfied for `AT-1_a.[01]` — "an awareness and training policy is
developed and documented". The objective split into three concepts, and two of
them were carried by words that appear in every SSP ever written:

    "awareness"                     uncovered
    "training policy is developed"  covered by "the account management
                                     policy is developed"
    "documented"                    covered by "and documented"
                                     → 67%, over the 40% floor

A concept is now covered only by a term that is not generic compliance
vocabulary, and a concept made entirely of such vocabulary — "documented" — is
set aside rather than counted. The list of generic terms is published in the
ruleset and hashed into the ruleset digest, so a determination can be audited
against the rule rather than taken on trust.

**Gate 2b: evidence that never names a control's subject cannot satisfy it.**
The subject comes from the control's family and title — AT-1 is "Awareness and
Training", so evidence that mentions neither fails, whatever else it says.

**Terms match as stems of whole words.** `clause.includes(kw)` matched "train"
inside "constrained"; a plain word boundary would refuse "account creation" for
an objective about accounts being created. Both are errors. And organization-
defined parameters are no longer extracted as concepts: no SSP says
"organization-defined", and counting `[organization-defined policy, procedures,
prerequisites, and criteria]` as four concepts made objectives uncoverable.

**What moved, and why.** 106 objectives lost Satisfied. 98 are correct — the
subject is absent from the sample SSP entirely, and the awareness-and-training
family accounts for most of them, because that document contains no awareness or
training content at all. 8 are false negatives: the document covers the subject
but the retriever did not surface the passage. That is a retrieval weakness the
old rule hid by passing on generic words regardless of which passage it read.
7 objectives gained Satisfied, from stemming that the old reader could not do —
including `AC-2_g`, where "monitored" never matched "monitoring".

The homepage hero showed `AC-2_g` as Other Than Satisfied. It is Satisfied now,
so the hero is a different finding: `AT-1_a.[01]`, where the engine retrieves a
strong, well-formed Access Control Policy for an awareness-and-training
objective and refuses it. The conformance suite checks the hero against the run,
which is how the stale one was caught.

**Also: the Run button could not be reached after a run.** `.rail` is
`position:sticky; top:80px` and grows to 781px; in a 720px viewport it pins at
80 and its last 141px — where the Run button sits — could not be scrolled to by
anything, `scrollIntoView` included. A visitor on a laptop could not press Run
again. Present on main before this change, and unrelated to it: the browser
suite had been clicking before the page reached that state. The rail is bounded
to the visible space and scrolls internally.

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

## 2026-09-11 (later still)

Engine 1.1.0 · verdict digest `3dd76f5f3083` unchanged

A sweep of the other eight use-case tabs, after §09 turned out to be presenting
an integration estate that does not exist. §09 was not unique in kind, though
what the others overstate is smaller.

- **Every guided walkthrough says so in the run.** Eight of the nine tabs are
  walkthroughs over authored sample data, and each carried a `walkthrough` badge
  in the tab nav — 8px of muted text — then completed with a status a visitor
  could screenshot as a result: "ConMon package ready for JAB", "AAR ready for
  Authorizing Official", "SCR package ready for AO disposition". §01's
  walkthrough did log that its figures are illustrative, but only on the path
  where the engine script fails to load, so in ordinary use no tab said it. Each
  run now opens by saying it is a walkthrough over fixed sample data and ends on
  a status that repeats it.
- **§08 Portfolio reports the systems it actually rolled up.** It asserted
  "4 systems" while `SAMPLES` holds two, so its own completion line read
  "4 systems · 2 ready · 0 minor · 0 material" — a total that disagreed with its
  parts and with the matrix rendered directly beneath it. The count is computed
  now.

Two browser checks added, both failing against the previous build; the first
names every offending status line.

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
