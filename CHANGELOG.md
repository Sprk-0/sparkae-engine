# Changelog

Notable changes to the public reference build.

Entries are dated rather than numbered, and this repository carries no release
tags: a state is cited by its reproducibility tuple, which identifies what the
tree decided rather than only which tree it was. `ENGINE_VERSION` in
`demo-engine.js` moves only when the engine does. Because every artifact this
build produces carries a reproducibility receipt, an entry records whichever of
these moved:

```text
engine version · catalog digest · ruleset digest · evidence digest · assessment date
```

and, downstream of them, the **verdict digest** for the bundled sample
(`CloudVault-Federal-SSP.txt`, FedRAMP Low, assessed as of 2026-06-01) pinned
in `tests/golden/sample-ssp.expected.json`.

A verdict digest that does not move across a change is the claim worth
reading: it means the determinations are the same ones, byte for byte.

## 2026-09-25 (the state this build is in)

Engine 1.6.5 · catalog `2026-07-21` / `91ad1b17138f` · ruleset `5cfc9030ed18` ·
verdict digest `20cd7ee2ae8e`

The tuple above is how to cite this build — the same tree as the entries below,
identified by what it decided rather than by a label, so it can be reproduced,
disputed and returned to.

What the tuple carries: the full suite passed on this tree (`check.mjs`, the
accuracy benchmark under `--strict`, the OSCAL 1.1.2 schema validation, and the
browser suites); and those five parts produced that verdict digest on the
bundled sample, so anyone can rerun it and compare.

What it does not carry: any claim that the determinations are accurate enough to
rely on. The accuracy evidence is sixteen cases someone chose — 15 correct, 0
false passes, 1 documented false fail — which is a published, re-runnable record
and not a measurement of field accuracy. Read a determination here as work an
assessor checks, because the evidence behind these determinations is a case set
its own authors mostly wrote.

## 2026-09-25 (an archive in the package is part of the package · engine 1.6.5)

Engine 1.6.4 → 1.6.5; ruleset `cf0a059449c6` → `5cfc9030ed18`, only because the
ruleset carries the engine version. The verdict digest does not move —
`20cd7ee2ae8e`, 153 / 808 / 20 — and the benchmark stays 15 of 16 with 0 false
passes. This closes item 41.

A `.zip` inside the package was refused as an unsupported member type. The
review list had it as "not silent", and the refusal was listed — but what the
inner archive said never reached a gate. An SSP delivered as `ssp.zip` was
assessed without its SSP, and a package whose `reviews.zip` held "AC-2 is not
implemented" beside a satisfying SSP came out **Satisfied**.

An inner archive is now read like the package. Its members join the corpus
under the path that reaches them (`ssp.zip!/SSP.docx`, the separator the page
already uses), inner refusals are named by that path, and a member that is not
a ZIP at all is refused by its own name. Three bounds hold across the nesting,
not per archive: the 64 MB expansion allowance, the 512-member allowance (a
package of 512 small archives of 512 members each is not 512 members), and a
depth of three levels — the package, an archive in it, an archive in that —
past which an archive is refused by its path rather than opened.

`check.mjs` holds the nested SSP, the nested refutation, the depth bound, a
nested zip bomb, the member allowance across two inner archives, and a broken
inner archive; each fails against the 1.6.4 reader.

## 2026-09-25 (what the archive says about itself · engine 1.6.4)

Engine 1.6.3 → 1.6.4; ruleset `75a0d2777e30` → `cf0a059449c6`, only because the
ruleset carries the engine version. The verdict digest does not move —
`20cd7ee2ae8e`, 153 / 808 / 20 — and the benchmark stays 15 of 16 with 0 false
passes. This closes item 40. Unlike 34, 37 and 38, none of this reached a
verdict: it is the reader naming what it read, and refusing what it cannot, in
the archive's own terms.

- **Member names.** A name is UTF-8 when general-purpose bit 11 says so and
  code page 437 when it does not — the ZIP default, and what Windows' built-in
  archiver writes. Every name used to be decoded as UTF-8, so `Système.txt`
  from such an archive was listed, refused and cited as `Syst�me.txt`. Writers
  that emit UTF-8 without the bit are common, so a name that is valid UTF-8 is
  read as UTF-8; only one that is not falls back to CP437. The table was checked
  against Python's `cp437` codec, all 128 entries.
- **Encrypted members** (bit 0, or WinZip AES, method 99) are refused as
  encrypted, by name. AES failed as "unsupported compression method 99"; a
  traditionally encrypted member reached the inflater and was refused, if at
  all, as corrupt — the wrong problem to send an assessor after.
- **Split archives.** The end-of-directory record's disk fields were never read,
  so one part of a spanned archive was read as though it were whole. A record
  that is not disk 0 / directory on disk 0 / every member here is refused as
  split, and a member whose directory entry starts on another disk is refused by
  name.

`check.mjs` holds each: a CP437 name, a flagged UTF-8 name and an unflagged one;
a bit-0 member and a method-99 member beside a readable one; a record on disk
1, one with fewer members here than in total, and a member on disk 1. Each fails
against the 1.6.3 reader.

## 2026-09-25 (the document it says now · engine 1.6.3)

Engine 1.6.2 → 1.6.3; ruleset `19ad796a9ce7` → `75a0d2777e30`, only because the
ruleset carries the engine version. The verdict digest does not move —
`20cd7ee2ae8e`, 153 / 808 / 20 — and the benchmark stays 15 of 16 with 0 false
passes. This closes item 38.

A tracked-changes DOCX carries two documents: what it says now, and what it
used to say. The reader stripped the markup and read both as one, so the AC-2_g
paragraph came out **Satisfied** when the author had deleted it, when it had
been moved away, and when it was formatted hidden. The review list had filed
this as fail-closed ("a deleted *not* still refutes"); the claims that were
struck out were the other half of it, and they failed open.

- **Tracked deletions and moved-away text** (`<w:del>`, `<w:delText>`,
  `<w:moveFrom>`) are not read, in the body, the notes or the headers. A deleted
  "not" no longer refutes — the document now says the opposite.
- **Hidden text** (`<w:vanish/>`) is read for refutations only. It is the
  author's own words, unseen, so it may refute a control but never satisfy one:
  a hidden "not implemented" still refuses AC-2, and hidden stuffing no longer
  satisfies it. The document as displayed is chunked as evidence; when hidden
  text exists, the document with it is chunked again and marked `refute_only`.
  The retriever tokenizes those chunks as empty — they add nothing to the
  collection statistics and no query returns them — and the refutation index
  reads them like any other. A corpus without hidden text ranks exactly as
  before.

The §01 console counts refute-only chunks apart from the evidence chunks, and
the BM25 line counts only what the index was built over. `check.mjs` §25 holds
every case above and three guards: a hidden refutation still refutes, a
`<w:vanish w:val="0"/>` override reads as visible, and a self-closing deletion
mark cannot swallow the visible text up to a later deletion.

## 2026-09-25 (the words outside the body · engine 1.6.2)

Engine 1.6.1 → 1.6.2; ruleset `64928573b3c0` → `19ad796a9ce7`, again only
because the ruleset carries the engine version. The verdict digest does not
move — `20cd7ee2ae8e`, 153 / 808 / 20 — and the benchmark stays 15 of 16 with
0 false passes. This closes item 37.

The DOCX reader read `word/document.xml` and nothing else. Word keeps words in
other parts too, and a refutation in any of them never reached a gate: the
AC-2_g paragraph delivered as a DOCX with "Account monitoring is not
implemented" in a footnote, in a comment, or in a page header came out
**Satisfied** all three ways. Each part is read now:

- footnotes, endnotes and comments are set inline where the body cites them,
  as `[footnote: …]`, `[endnote: …]` and `[comment: …]`, so a refutation in one
  belongs to the section that cites it rather than to whichever control the
  document ends on; one the body never cites is read after the body;
- headers and footers belong to no section, so they are read first, where a
  reader meets them, and once each however many sections repeat them.

Reading comments is deliberate. A reviewer's "is this actually implemented?"
now reaches the gates too, which fails closed: it is text the submitted file
carries, and the assessor sees it quoted in the evidence.

A part that is present but will not inflate refuses the DOCX by name, as an
unreadable body already did; skipping it would read as a document that said
nothing there. `check.mjs` §25 holds all of it — the three refutations, the
header read once, the refused part — and each fails against the 1.6.1 reader.

## 2026-09-25 (every id a chunk names · engine 1.6.1)

Engine 1.6.0 → 1.6.1; ruleset `fc6ad10cbb39` → `64928573b3c0`, which moves
because the ruleset carries the engine version and for no other reason. The
verdict digest does not move: `20cd7ee2ae8e`, 153 / 808 / 20 of 981. The
benchmark does not move either: 15 of 16, 0 false passes. This closes item 34.

`extractControlIds` stopped after 50 distinct ids and dropped the rest from the
chunk's tags. The tags are not decoration. They decide which chunks are a
control's own evidence, and which control a refutation belongs to — so in a
control-status table naming sixty controls, "SI-6 is not implemented" sat in a
chunk tagged with the first fifty, and the refutation index recorded nothing
for SI-6. A cap that drops the refutation fails open, and it produced a false
Satisfied: a paragraph that satisfies AC-2_g, beside a status table naming
fifty-five other controls and then "AC-2 is not implemented", came out
**Satisfied**. It now comes out Other Than Satisfied. The cap is gone: every id
a chunk names is a tag, and the pass stays linear in the chunk's length.

The review list had deferred this item as one that could not produce a false
Satisfied. It could; the list now says so.

The bundled sample never names fifty ids in one chunk, which is why no
determination moved and why the digest cannot hold this. `check.mjs` does: a
sixty-id list must come back with all sixty, and the AC-2 case above must be
refused. Both fail against the 1.6.0 engine.

## 2026-09-16 (the golden run, delivered as a package)

No part of the tuple moves. Engine 1.6.0, ruleset `fc6ad10cbb39`, verdict digest
`20cd7ee2ae8e`; the engine, the exporters, the golden fixture and the benchmark
are untouched. This is `check.mjs` §28, and it closes item 71.

Every determination the golden fixture pins was produced by `chunkText` over a
string embedded in the test file. Nothing that decides whether a push is
accepted ever called `parsePackage`, so the archive reader, the DOCX reader, the
CRC check and the housekeeping skip list were invisible to it: any of them could
break without moving the golden digest.

The bundled sample is now assessed a second time, delivered the way a real
submission arrives — a ZIP holding a DOCX — and has to produce the same verdict
digest as the embedded text. It does, and the equality is the assertion, so
there is no second fixture to regenerate.

The package is deliberately adversarial, because a clean one is not enough: a
ZIP of a well-formed DOCX catches a defect in paragraph handling and nothing
else, which was measured rather than assumed. It carries

- a control id written as `AC&#45;1`, so a defect in the entity decoder drops
  the id and the section stops being AC-1's own evidence;
- a `__MACOSX/._…` member holding "the access control policy is not
  implemented", so a defect in the skip list reads it and refuses AC-1;
- a `scan-notes.txt` whose stored CRC does not describe its bytes, holding the
  same refutation, so a defect in the CRC check reads it.

Each of the four readers was mutated in turn to confirm the fixture fails when
it should: merging paragraphs, dropping entity decoding, disabling the skip list
and disabling the CRC check each move the digest and fail the suite.

The benchmark still runs `chunkText`, deliberately. Those sixteen cases are an
accuracy record with a published score, and widening what they measure to
include delivery would blur what the figure means for a weaker net than this
one. The README says so where the figure is quoted.

## 2026-09-16 (the product calls · engine 1.6.0)

Engine 1.5.1 → **1.6.0** · ruleset `dbacaaed27dc` → `fc6ad10cbb39` · verdict
digest `5ded83f4010c` → **`20cd7ee2ae8e`** · golden regenerated.

**No determination moves.** 153 Satisfied, 808 Other Than Satisfied, 20 Not
Reviewed — the same objectives, with the same statuses. What moves is gate 6's
record on 92 objectives that were already Other Than Satisfied, and the review
flag on 21 more Satisfied, so the verdict line changes and the digest with it.

Three decisions the 1.3.0 review left open. It called them product calls and
said not to make them quietly, so they are made here, with what each one costs.

- **Gate 4 consults the catalog's FedRAMP value, and does not compare it.** 236
  of the catalog's 1,513 objectives carry FedRAMP's own value in `o` — AC-1's
  policy review is "at least every 3 years" — and nothing read it. It is read
  now, and it travels: on the determination as `odp_expected`, in a findings-CSV
  column, and as a `fedramp-parameter-value` prop on the OSCAL finding, on all
  159 of the bundled run's objectives that have one, including the Not Reviewed
  ones, because the requirement is a property of the objective rather than of
  the run.

  It is not compared, and that is the decision rather than an omission.
  Comparing needs the stated duration bound to the parameter it answers, and an
  anchored clause routinely carries a duration belonging to a different
  parameter: the sample's AC-2 section says accounts are reviewed quarterly, and
  AC-2_h.(1) requires that accounts be *disabled* within twenty-four hours.
  Measured over the bundled sample, a clause-scoped comparison found three
  mismatches and all three were of exactly that shape — three false refusals and
  no true ones. A gate that is wrong every time it fires is worse than one that
  does not fire, so the requirement goes to the assessor who can bind it, and
  `check.mjs` §27 asserts that "every 10 years" still resolves a three-year
  parameter, so a later change cannot claim the comparison without making it.

- **Undated evidence fails currency.** 1.4.0 stopped calling it current and
  flagged it, but gate 6a still *passed*, so currency meant "no evidence it is
  stale" rather than "evidence it is current" — and gate 6 exists to establish
  the latter. It fails now. On this sample that costs nothing: 92 objectives are
  undated and every one of them was already Other Than Satisfied, so no
  determination moves. That is the argument for taking the strict reading —
  it is free here and refuses the claim on the packages where it would not be.

- **An unverified parameter is a floor, not a refusal.** An untyped
  organization-defined parameter — one with no frequency, period, role or
  threshold to match — is recorded `odp_unverified` and gate 4 still passes.
  Failing it closed would have taken Satisfied from 153 to 117. It stays a
  floor: the gates decide the verdict, the floors decide whether a human must
  look before it is used, which is the rule the rest of this build follows. What
  changes is that it is now one of the floors — 36 of the 153 carry one, 21 of
  them were not otherwise flagged, and since 1.5.1 the flag and its reason
  travel on every artifact. The undated review reason retires into gate 6a,
  where it is now a refusal rather than a note.

That closes the last of the P0 engine items. `.github/REVIEW-FINDINGS.md` has
what remains: parser hardening, the verification twins, and process.

## 2026-09-16 (the pages say what the build does)

No part of the tuple moves. Engine 1.5.1, catalog `2026-07-21` / `91ad1b17138f`,
ruleset `dbacaaed27dc`, verdict digest `5ded83f4010c` — the engine, the
exporters and the golden fixture are untouched. This is the copy, and one
sentence the engine was writing that was copy in disguise.

- **The engine stops writing in the assessor's voice.** Every examine statement
  opened "During the assessment, the assessor examined …", and a Satisfied one
  closed "and confirmed" — an account of an assessor reading documents and
  reaching a conclusion, composed by an engine that had done neither, and
  emitted for the sixty Satisfied a floor had just flagged as needing exactly
  that assessor. CONTRIBUTING line 24 forbids narration of activity the engine
  did not perform. The engine speaks as the engine now; the assessor's sentence
  still travels beside it, in the assessor's voice, whenever Revise records one.
  `tests/assessor.mjs` held the old phrasing in place and now holds the new.
- **A Not Reviewed says what happened.** "Found no documentation establishing
  that …" is a claim about the package. What happened is that retrieval
  surfaced no passage above the evidence threshold — a refused PDF beside an
  unrelated `.txt` is enough to produce it — and that is what it says.
- **447 is what this build carries, not the size of Rev 5.** It is 215 base
  controls and 232 enhancements, and it is exactly the FedRAMP High baseline
  (410) plus the 37 PT and PM controls that sit in no baseline: every control
  here is in one of those two groups, which `check.mjs` now asserts. AC-16,
  AC-23, AC-24, AC-25, IA-13 and SC-16 are absent, which it also asserts. Seven
  footers stop saying "full catalog". The 37 baseline-less controls and the
  dead `LI-SaaS` tagging (156 controls, 789 objectives, no profile behind it)
  are stated in the README rather than left inside the count.
- **Claims trimmed to this origin.** No OSCAL POA&M (this build writes POA&M
  CSV; the OSCAL one is a server-product export). No "same 7-gate engine as the
  3PAO UI" on the integrations social cards, which is what LinkedIn and Slack
  render. No "Tenable for the package itself". No "certified 3PAO" in the terms
  — FedRAMP recognises, it does not certify. The gap-type names on the
  assessors page are the six the code actually emits.
- **Gate 4 copy matches gate 4.** The assessors page advertised a mismatch this
  build cannot detect — "90-day vs FedRAMP 60-day requirement" — when gate 4
  checks that a parameter of the right kind is stated and never compares it to
  the value the catalog carries. The page says what the gate does; the gap
  itself is item 6 and still open.
- **Advice that acts on a lexical Satisfied.** "Skip the controls that clearly
  pass" is gone, and so is the claim, on three social cards and in the body,
  that the floors are something every Satisfied clears — sixty do not, and since
  1.5.1 each says so on the artifact.
- **The walkthrough stops looking like a run.** `runInitialWalkthrough` carried
  a permanently-null `_realRun` guarding branches that read live gate tallies
  and a live corpus label: dead code that made §02–§09 look like tabs a live run
  could drive. Gone. Its authored figures say they are authored, and say that
  the live engine returns 153 Satisfied on the same package. The rail's `v2.4`
  is labelled as the sample SSP's version rather than trailing two live profile
  counts unattached to anything. The download toast calls its SHA-1 a
  reproducibility identifier rather than leaving the reader to assume otherwise.
  The 20x walkthrough now says on its own page what the assessors page says:
  SparkAE does not support FedRAMP 20x.
- **`BANNED` is not five phrases.** It was five, and the whole of the above
  passed it. It now holds every phrase this change removed, so each one fails a
  push if it comes back; the suite proves the guard fires rather than passing
  vacuously.

## 2026-09-15 (the exports say what the engine decided · engine 1.5.1)

Engine 1.5.0 → **1.5.1** · ruleset `d10ea7075a64` → `dbacaaed27dc` (the version is
in it) · verdict digest `614ab4597d07` → **`5ded83f4010c`** · golden regenerated.

**No determination moves.** All 981 objectives on the bundled sample come out of
this change with the status they went in with: 153 Satisfied, 808 Other Than
Satisfied, 20 Not Reviewed, 60 flagged. The verdict digest moves because the
verdict LINE moves — it carries the review flag now, which is the point of the
change, and is the one time a digest that moves does not mean a determination
did.

The engine has flagged thin Satisfied since 1.2.0: all seven gates passed, and
then a floor did not — confidence under 60%, concept coverage under 60%, or
evidence carrying no date at all. Sixty of the sample's 153 Satisfied are
flagged. None of that left the tab. OSCAL, all four CSVs, the summary and the
receipt's verdict lines each carried the determination without the qualification
the engine had put on it, so a downstream reader — the GRC tool, the reviewer,
the package — saw 153 clean Satisfied.

- **The flag travels on every artifact.** Two columns on the findings CSV
  (`Review Required`, `Review Reason`) and on the TCW, a `review-required` prop
  with its reason on the OSCAL finding, and a line in the summary beside the
  count it qualifies. It follows the engine's determination rather than the
  effective one: once an assessor revises an objective, a human has looked at
  it, which is what the flag was asking for.
- **The receipt attests it.** `review_required` is part of the verdict line, so
  a run where sixty Satisfied are flagged no longer hashes the same as one where
  none are. Without that, an export could drop the flag from every row and still
  verify against its own receipt — the hole restated. `check.mjs` §26 strips the
  flags from a copy of the run and requires the digest to differ.
- **The POA&M is open weaknesses.** It filtered on "anything but Satisfied",
  which swept in every Not Reviewed — twenty on the sample, hundreds on a live
  Low run — and put untested objectives in front of a reader as findings with a
  remediation owed. Not Reviewed means no evidence cleared the retrieval floor:
  a gap in the package, not a weakness in the system. The RET already read it
  this way; the two agree now.
- **Control origination is not invented.** Every TCW row was stamped
  `Service Provider Corporate`. Origination is a property of how the system is
  built, stated by the system owner; this build does not read it and does not
  derive it. The row says `not determined by this build`.
- **A column this build does not fill says so.** Applicable Threats and the
  three post-remediation risk columns were empty on every findings row, and
  empty reads as "none" — no threats, no residual risk — which is a claim. They
  name themselves as not produced, and only on a row that carries a weakness: on
  a Satisfied row there is no threat and no residual risk to state, and blank is
  the honest answer.
- **The detection date says which detection it is.** The RET and POA&M stamped
  the assessment date into Original Detection Date, so a 2018 finding in the
  evidence was dated 2026-06-01. The engine reads a package, not a history, and
  cannot establish an earlier detection; the date stays and the comment says
  what it is.
- **A truncated evidence body says it was truncated.** The gates read the whole
  string and the artifact got its first 500 characters with nothing to mark the
  cut, so a refutation or a date past that offset was accounted for in the
  determination and absent from the record of it. The cut stays — an OSCAL file
  carrying every evidence body in full is megabytes of duplicated corpus — and
  now names the length the gates actually read.

Still open, and next: the catalog's own parameter values are unread (gate 4
checks keyword classes, not the 236 objectives that carry a FedRAMP value), and
the pages still claim things this build does not do — including, on
`assessors.html`, that every Satisfied clears the floors, which the sixty
flagged determinations contradict. `.github/REVIEW-FINDINGS.md` has the rest.

## 2026-09-15 (normalise before you match · engine 1.5.0)

Engine 1.4.1 → **1.5.0** · ruleset `7a852bebcef0` → `d10ea7075a64` ·
verdict digest `614ab4597d07` **unchanged** · golden regenerated for the version.

Four ways a document could read as compliant on screen while saying otherwise to
the gates. They are one defect wearing four coats: text was compared before it
was normalised, so a character the reader never sees decided a determination.
None of the four is exercised by the bundled sample — it names no enhancement,
carries no invisible character and no reference, and is not stuffed — so every
determination it produces is byte-identical and the verdict digest does not
move. `check.mjs` §25 is what holds these; the sample never could.

- **An enhancement id is a control, not a mention of its base.** The control-id
  pattern closed with `\b`, and `)` is not a word character, so the boundary
  after "AC-2(1)" existed only when a word character followed it. "AC-2(1) is
  implemented", "AC-2(1)," and "AC-2(1)" ending a line all failed that
  assertion, the enhancement suffix was given back, and the match came out as
  **AC-2**. Only the nonsense case, "AC-2(1)x", produced the enhancement. 232 of
  the catalog's 447 keys are enhancements, so for half the catalog no chunk was
  ever tagged with the control it named, no control had evidence of its own, and
  the own-control scoping the 1.4.0 fix set built fell straight back to the
  retrieval union. The close is a negative lookahead now, refusing both a
  trailing word character and a trailing `(`, so backtracking can never turn an
  enhancement into its base. `controlIdPositions` carried a second copy of the
  same pattern with the same defect, which is why a refutation under an
  enhancement heading was charged to the base control; there is one pattern now.
- **Invisible characters are deleted before matching.** Zero-width space,
  zero-width non-joiner and joiner, word joiner, byte-order mark and soft hyphen
  render as nothing and survive NFKC, so "not<ZWSP>implemented" and
  "place<ZWSP>holder" read like the honest text and matched none of the patterns
  gate 5 refuses on. Unicode calls these default-ignorable and reads a string
  that carries them as the string without them, which is what the fold does now.
  Deleting them can also weld two words — "not<ZWSP>implemented" becomes
  "notimplemented" — so every matcher built over the fold separates its words
  with `\s*` rather than `\s+`. That rewrite happens at construction, so
  `RULESET` publishes the patterns that actually run.
- **A character written as a reference is that character.** The DOCX reader
  decoded five named references and nothing else, so "not&#x200B;implemented",
  "not&nbsp;implemented" and "not&#32;implemented" opened in Word reading "not
  implemented" and reached the gates as their literal source. Decimal and
  hexadecimal references now decode alongside the five XML names and `nbsp`, in
  one pass whose output is never re-scanned, so "&amp;lt;" decodes to "&lt;" and
  stops. A reference the table does not know, and a lone surrogate, are left as
  written rather than guessed at. A loose `.xml` or `.nessus` upload is decoded
  the same way; `.txt`, `.md`, `.csv` and `.json` are not, because an "&amp;" in
  those is five characters their author typed.
- **Stuffing is repetition as a share of the passage.** The duplicate-5-gram
  test ran only when the longest stretch between `[.!?;:]` was itself forty
  words or more, and punctuation is free: the same phrases with a full stop
  after each read as ordinary sentences and walked past the gate. The run-length
  condition is gone. What replaces it is not a bigger count but a ratio, and the
  reason is worth recording: most of what reaches this check is the retrieval
  union — eight chunks from eight sections, joined — and an SSP names its own
  subject in every section it opens. Counting duplicates without weighing them
  against the length of the passage read the bundled sample's own union as
  stuffed, on the strength of "policy and procedures CloudVault maintains an"
  recurring across it, and cost nineteen determinations on seven base controls
  that nothing in this change was about. Three echoes in seven hundred words is
  the shape of a document; the same three in eighty words is a keyword list.

One thing outside the review's list, found while rewriting the separators and
fixed here because the fix is two characters and the failure is a hang. Two
matchers — the `absent` refutation and the scan-context pattern — carried a
whitespace quantifier on each side of an optional group, so a run of spaces
could be split between them in every possible way. That is quadratic: 306ms on
twenty thousand spaces under 1.4.1, tens of seconds on a document, in a parser
whose whole job is to read a file a visitor drops on the page. Each optional
group now carries its own trailing separator, so the quantifiers are divided by
a literal and there is nothing to split. `check.mjs` §25 walks every regex
`RULESET` publishes and fails if any of them exceeds 100ms on such a run.

`review_required` still does not reach the exports, the catalog's own parameter
values are still unread, and the pages still claim things this build does not
do. Those are the next two cuts, and they are inventoried with everything else
in `.github/REVIEW-FINDINGS.md`.

## 2026-09-15 (anchor stems are content words · engine 1.4.1)

Engine 1.4.0 → **1.4.1** · ruleset `7b0c09a72496` → `7a852bebcef0` (the version is in it) ·
verdict digest `614ab4597d07` unchanged · golden regenerated for the version.

A review comment on the 1.4.0 pull request, from the Copilot reviewer:
`objectiveAnchorStems()` built stems and then filtered them against
`STOP_WORDS`, which holds words. A stemmed stop word is not a word in that
list — "other" stems to `oth`, "during" to `dur`, "only" to `onli`, "under"
to `und` — so those could stand as anchors for a gate 4 value clause or a
gate 2b one-term subject, and a clause that shared nothing but "other" with
the objective counted as being about it. Stop words are now dropped as words,
before stemming, in the objective anchors and in a selection option's
own-word fallback (`contentStems`). No determination on the bundled sample
moves; `check.mjs` §24 pins the anchor set.

## 2026-09-15 (the interrogation fix set · engine 1.4.0)

Engine 1.3.0 → **1.4.0** · ruleset `b39ee143bdfe` → `7b0c09a72496` · evidence digest
`6de811bac5be` → `946ce09b5bf0` (same file; the chunker moved, see below) · verdict digest
`04b1f79d6f44` → `614ab4597d07` · golden regenerated.

A review of engine 1.3.0 raised fifty-six defects across the engine, the
exporters and the demo page, and asked for twenty-one tests. All of them land
here, each split apart, none merged; `check.mjs` §24, `assessor.mjs` and
`browser.mjs` hold the tests. What moved and why, gate by gate:

- **Every refutation is matched, and attributed to its heading.** The three
  refutation readers executed each pattern once and kept the first hit, so a
  chunk saying "AC-1 … not implemented" and later "AC-2 … not implemented"
  carried one refutation, AC-1's. Every occurrence is collected now. The old
  symmetric 400-character window also charged "Not yet fully implemented" under
  the CM-1 heading to AU-3, whose heading sat 250 characters earlier; a
  refutation now belongs to the closest control id *before* it, then to the
  closest one after it within 600 characters, then to the only id named.
- **Gate 1 is absolute.** The score was BM25 min-maxed against the best hit, so
  the best hit was always 1.0 and a corpus of one chunk cleared the 0.15 floor
  with any sentence. The score is now the share of the objective's distinct
  stems a chunk names; ranking is still BM25. A tagged chunk with a raw score of
  zero was boosted to three times the best raw score and pushed real evidence
  out of the top eight; a chunk that shares no term with the objective is not
  boosted.
- **Gate 2 needs two terms of a concept, and a one-word subject beside the
  objective's words.** "the use of accounts is monitored" was covered by a
  sentence that mentioned accounts and never monitoring; AC-2's subject, once
  ambient `access` and generic `management` are set aside, is the one word
  `account`, and "mentions accounts sometimes" passed 2b. Function words
  (`within`, `when`, `each`, …) and documentation adjectives (`current`,
  `required`, `specified`) no longer count as subject matter, and the generic
  check reads inflections. The stemmer keeps `access`/`accessing` and
  `process`/`processes` together, folds `creation`/`created` and
  `authorization`/`authorized` onto one stem, and reads `implementation` and
  `implemented` as one word.
- **Gates 3a and 4 read the control's own evidence first**, as gates 2, 3b, 5
  and 6 already did. A neighbour's "SSP section 5 / version 3 / dated" made
  this control's paragraph Strong; a neighbour's "ISSO" resolved a role
  parameter this control never named.
- **Gate 4 is typed.** A frequency, time, role or threshold value has to sit in
  an affirmative clause that shares a word with the objective — "monthly"
  anywhere in the evidence resolved every frequency parameter. `[Selection …]`
  parameters are extracted and resolved when an option is stated; untyped
  placeholders used to pass whenever the evidence was non-empty and are now
  recorded as **unverified** on the result (`odp_unverified`) and in the gate
  record, and the README gate table no longer calls them resolved.
- **Gate 5c folds upper-case homoglyphs.** The map was lowercase-only, so
  "Рlaceholder" with a Cyrillic capital Er walked past the draft check.
- **Gate 6 reads dates consistently.** A review or update date decides currency
  when there is one, so a later untyped date cannot launder a stale review; a
  date's type is read from its own sentence rather than the forty characters
  around it; evidence with no date at all is recorded as `undated` and flagged
  for review rather than called current; and the open-finding SLA check reads
  every date format the other temporal checks read.
- **The ruleset digest covers every matcher.** Refuting patterns, draft
  markers, negation pairs, the homoglyph map, stem suffixes, ODP value shapes,
  strength signals and date patterns are all in `RULESET` now, so a
  pattern-only edit moves `ruleset_digest`.
- **ZIP reading.** The end-of-central-directory record has to end the file —
  a comment containing the signature bytes used to be read as the record, and
  two self-consistent records are refused as ambiguous. Every member's bytes
  are checked against the directory's CRC-32 and refused by name on mismatch.
  `__MACOSX/`, `.DS_Store` and `Thumbs.db` members are refused as housekeeping,
  in the engine, so the inventory and the corpus agree.
- **The chunker carries a heading into the chunk it names.** This is the one
  change outside the review's list, and the reason the evidence digest moves
  for an unchanged file. A section heading that landed at the end of a chunk
  tagged the *preceding* section's text with the next section's id, so the
  engine's own evidence for AC-2 in the bundled sample was the AC-1 paragraph
  and AC-2's was AC-3's. That was invisible while the gates read the whole
  retrieval union; once they read a control's own evidence, section
  attribution decides verdicts, and the misattribution would have refused
  most of the sample for the wrong reason.
- **Exports.** `system_name`, `files_parsed` and `files_refused` are inputs to
  the receipt and hashed into `receipt_digest` (`receiptDigestOf` is the
  verifier), so the downloaded `receipt.json` re-hashes to its own digest.
  OSCAL observations and risks follow the *effective* determination: an
  objective an assessor revises to Satisfied no longer points at an open risk,
  and one revised to Other Than Satisfied raises a risk whose origin names the
  assessor. `import-ap` points at a declared back-matter resource describing
  this run's plan rather than at `#`. `csvSafe` neutralises a formula behind a
  leading space, newline, tab or byte-order mark, and the summary states the
  findings CSV width it has (29 columns) rather than 25.
- **The page.** The receipt fields are passed in before the digest, not written
  after it. The package is read once, by `parsePackage`, which now returns the
  member listing the inventory renders; the run reuses that read. The custom
  rail entry adjudicates nothing and invents nothing: no "The 3PAO examined the
  customer-uploaded SSP … and confirmed" findings from file-name heuristics, no
  seeded asset, vulnerability, severity or scan-type counts; a ConMon figure the
  panel did not parse reads *not parsed*; it carries no annual, SCR or KSI
  record at all, and §03, §04 and §05 stop on an upload and say so (§03 used
  to throw on the empty cohort list, §05 walked a five-indicator KSI theme
  nobody submitted). The PDF and XLSX readers, which called
  libraries the page never loads and so always returned null, are gone. One
  painter builds every row through `buildFindingRow`, so chipping a filter to 40
  rows or fewer keeps the examine statements and Revise controls; the row
  escapes every finding field at the sink, and every name a walkthrough writes
  into the log is escaped. §02–§09 idle copy says it is a walkthrough and no
  longer says the engine will ingest or execute; the ConMon walkthrough ends at
  the package shape, not at "ready for submission".

**219 → 153 Satisfied on the bundled sample; 20 Not Reviewed; 60 flagged for
review.** Every loss is one of: a concept whose second term the section never
states (the AC-2 section does not say accounts are monitored), a section that
cites no reference of its own (AC-2 again — the header's version and review
date no longer count for it), a typed parameter whose value the section does
not state, a subject named only as furniture, or a draft marker in the union
that an objective with no own evidence falls back to. The gains are objectives
the old chunking had attributed to the wrong section (AC-1's selection
objectives, IA-1) and refutations that were charged to the wrong control (AU-3,
CA-2). The benchmark stays at 15 of 16 with the same documented case, whose
recorded reason is updated: retrieval now surfaces its paragraph and gate 3a
refuses it for citing nothing.

## 2026-09-14 (the site's claims, held here)

No part of the tuple moves. This is the test suite and the card source; the
engine, ruleset and golden fixture are untouched.

The private repository kept a copy of this site under `website/` with four
test modules over it — the demo's exports, the site's discoverability, its
content claims and its credibility reconciliations. That copy is stale on
fifteen of sixteen files and one of its assertions now pins an `onclick=` this
site removed on 2026-09-12. The public repository owns the site; the coverage
worth keeping moves here, written against the pages as they are.

- **§21 — the OSCAL document's references resolve.** The official schema
  rejects an invented assembly or a bracketed target id; it cannot see a
  reference. Every `risk-uuid`, `observation-uuid` and `subject-uuid` in the
  sample run's download now has to resolve to something declared, Not Reviewed
  has to travel as a prop over `not-satisfied` and raise no risk, every tested
  failure has to point at the risk it raises, `reviewed-controls` has to name
  the 156 controls as lower-case OSCAL ids, and the four CSVs have to be
  rectangular — parsed as RFC 4180 records, since an evidence cell may hold a
  newline and a line split reads that as a ragged row.
- **§22 — findable, shareable, no dead ends.** Every page declares the card,
  its size and alt text; the PNG header is read rather than trusted; and the
  card's source now lives beside it at `static/og-card.src.html`, moved from
  the private tree so the image stays regenerable. Its fonts are the
  repository's own and load from a checkout with nothing else. Review caught
  that the source declared only the upright Fraunces face while its headline
  sets "Minutes, not weeks." in italic — so the card had been rendering a
  synthesized oblique while the site, whose stylesheet declares the italic
  face, renders the real one. The source declares it now and the card is
  regenerated from it: the same card, with the italic the type actually has.
  Its figures are read out of the markup and
  required on the homepage against the same nouns, and both are required to be
  the catalog's High-baseline counts. `404.html` may carry no path-relative
  URL, no absolute loader and no `<base>`.
- **§23 — what the pages claim.** Fifty-odd checks: catalog counts labelled
  and correct on the homepage, the footers and the sample card; no near miss
  next to an objective word; the independence sentences on the homepage, the
  assessor page and the walkthrough; RFC-0024 cited as closed; the status page
  claiming no state its snapshot did not give it; one contact address; every
  page linking to this repository from the footer; the navigation complete on
  every page and presented on phones; no id defined twice and every
  `page.html#fragment` resolving (the nine workflow hashes are routes the demo
  honours, and are accepted as such); no draft note; no internal reference in
  any published file; every form control labelled.
- **One defect found by the port.** The revision editor's determination
  `<select>` had a `<label>` beside it with no `for`, and no `id` to point at —
  a control a screen reader announces as nothing. The first fix was an
  `aria-label`, which names the control and leaves the visible label inert;
  review pointed that out. The select now carries an id derived from the
  finding's own (`ex-verdict-AC-1_a--01-`) and the label points at it, so the
  label is the control's name and clicking it focuses the select — driven in a
  browser with two editors open, each with its own id.
- **What did not port, and why.** Assertions on `build.sh` tokens,
  `sync-public.sh`, the publish allowlist and the private `netlify.toml` are
  about machinery this repository does not have. The sample no longer runs on
  page load — §18 is written against the run button — so the auto-run
  assertion is not carried; the opt-in tour is. `test_website_csp_scope` and
  `test_imp986_public_repo_audit` were already redundant with §3, §20 and
  `check_published.mjs`, which reads the policy off the wire.
- **§3 gained the three rules the content-claims suite held every policy to**:
  `frame-ancestors 'none'` and `object-src 'none'` on every rule, no CSP on a
  wildcard path, and `/demo` as a forced 301.

## 2026-09-12 (script-src drops 'unsafe-inline')

No part of the tuple moves: this is the site's policy and the markup that runs
under it, not the engine.

The upload review's first finding asked for inline event handlers to be removed
and the deployed CSP tightened. The handlers went earlier; the directive that
made them possible did not, so the finding was only half closed — with
`script-src 'unsafe-inline'` in place, an injected `onclick=` runs exactly as a
hand-written one would, and removing ours changed nothing a browser enforces.

- **29 inline handlers, three pages, none left.** demo-standalone.html had 20:
  18 now go through a `UI_ACTIONS` table behind one delegated listener keyed on
  `data-action`, and the other 2 belong to child windows it opens — those are
  `about:blank`, which inherits the opener's policy, so an attribute there needs
  `'unsafe-inline'` exactly as one here would; same origin, so the opener binds
  them after writing the document. integrations.html had 7: five tab headers,
  now delegated on `data-tab`, and two buttons that only scrolled to an anchor,
  now anchors (`html{scroll-behavior:smooth}` was already doing the animating).
  assessors.html had the same two scroll buttons.
- **`script-src` is `'self'` plus a hash.** Four pages inline a script; each
  rule lists that script's `sha256` and nothing else. `'unsafe-inline'` remains
  in `style-src` alone, where it buys appearance and not behaviour.
- **A hash that was never a script.** demo-standalone.html discusses
  `<script src>` inside an HTML comment, and the scan that produced these
  hashes read from there to the next `</script>` — so the policy carried a hash
  for a span no browser executes. Comparing the file's hashes against the
  policy's *for equality* is what found it; containment would have passed.
- **Two checks, because neither sees the other's fault.** `check.mjs` §20
  recomputes every page's hashes, rejects a surplus or stale one, an
  `on<event>=` attribute, and an `'unsafe-inline'` that comes back. `pages.mjs`
  now serves each page under its published policy and fails on a browser CSP
  violation — which catches a stale hash on the wire, but not a handler: Chromium
  refuses an attribute handler when it is invoked, not when the page loads, so
  an `onclick=` added to privacy.html left all of pages.mjs green. That case is
  the static check's.
- **Removing a handler is not the same as keeping a control.** Review on the PR
  pointed out that some of the rewritten controls are `<div>`s, which no
  `data-action` makes keyboard-reachable — and that this change made it less
  obvious, because the behaviour moved out of the markup. Eleven of them are
  `<button>`s now: the five API tab headers, the AO-briefing strip, three
  connector schema links, and the Close control in the schema window, which was
  an `<a>` with no `href`. All three re-tagged groups render pixel-identical to
  the divs they replace (screenshot comparison, plus computed geometry against
  the previous commit), and Tab/Enter/Space were driven in a browser to confirm
  they do reach and fire. `check.mjs` §20 now fails any `data-action` or
  `data-tab` on an element that is not a button, an anchor with an `href`, or
  carrying `tabindex` — scanning the whole source, since half these controls are
  written into template literals.
- **The documented way to regenerate a hash disagreed with the check.** Also
  from the review: the one-liner in `_headers` skipped only `type="text/plain"`,
  while §20 skips any non-executable type. Following the docs for an
  `application/json` block would have produced a surplus hash the check then
  rejects. The one-liner is §20's rule now.
- **And a third, for the wire.** `check_published.mjs` compared only
  `default-src` and `connect-src`, which are the same string on every page.
  `script-src` is not any more, so it now compares each route's served
  directive against the `_headers` rule for that route, token for token, and
  fails on an `'unsafe-inline'` in the served policy. Neither offline check can
  see a stale hash the host is still serving, or one added through Netlify's UI
  with no commit behind it. Fault-injected both through a local stand-in for the
  host, since this environment's network policy blocks the deploy preview.

## 2026-09-11 (ambient subject terms · engine 1.3.0)

Engine 1.2.0 → **1.3.0** · ruleset `ceb3e3d50fa6` → `b39ee143bdfe` · verdict
digest `355a46a6abb3` → `04b1f79d6f44` · golden regenerated

An outside recheck of 1.2.0 found evidence about user accounts satisfying
`PE-2_a.[01]` — "a list of individuals with authorized access to the facility
where the system resides has been developed" — at 74% support and 100% concept
coverage. Reproduced here before anything changed, and it was not one objective:
the whole PE family passed, and PE-3 with it.

- **A word most of the catalog shares names no subject.** Gate 2b accepted
  `access` as PE-2's subject because `access` is a word in "Physical Access
  Authorizations", and account documents are full of it. A term is now *ambient*
  when it appears in the titles or family names of more than 10% of the
  catalog's 447 controls — `access` is in 71, `protect` in 82, `monitor` in 48 —
  and an ambient term cannot establish subject on its own. PE-2's subject becomes
  physical, environmental, authoriz; AC-2's becomes account.
- **One sharp term is not enough for a compound subject.** PE-8 is "Visitor
  Access Records", and "recorded in the ticketing system" matched `record`. Two
  terms are required where two exist.
- **284 → 219 Satisfied on the bundled sample, 0 gains, every loss classified.**
  For 50 of the 65, no sharp subject term appears anywhere in the 875-word
  document. The other 15 were read by hand: the SSP has no CA section, its only
  "change" is an audit-log event, its only "restrict" a network ACL. All 65 are
  refusals of objectives the document does not address.
- **Four benchmark cases, 12 → 16**, two of them the recheck's own. The first
  version of them passed against the engine they were written to catch — the
  suite's pinned date made the documents' dates future and the temporal gate
  refused them for the wrong reason — so a case can pin its own assessment date
  now. Against 1.2.0 they are three false passes; against 1.3.0, none.
- **A provenance claim of ours that was wrong.** The benchmark said
  `external-review` cases carry "an outside reviewer's own uploads". They do not:
  those files are not in this repository and the text is reconstructed from the
  review's description. What is independent is the case, not the bytes.

The frequencies come from the catalog, so they move when it does and the catalog
digest already covers them; the two parameters are published in `RULESET`.

## 2026-09-11 (what the site says it is)

Engine 1.2.0 · verdict digest `355a46a6abb3` unchanged — the site, not the
engine.

- **The preview status sits beside the button that starts a run.** The homepage,
  the assessors page, the 20x walkthrough and the demo itself now carry one
  line, in the same place a visitor decides whether to click: this build runs the engine rather than a
  recording, its determinations are automated EXAMINE preparation an assessor
  checks rather than an authorization decision, and their accuracy rests on a
  small published case set rather than on real authorization packages — with a link to the benchmark, including what it gets
  wrong. `check.mjs` §18 is written against the run button rather than a list of
  pages, so a new page offering a run fails until it says the same thing.
- **The one section that runs is on the page.** §01 Initial Assessment was
  reachable only by opening *Under the hood* — an engineering disclosure,
  collapsed by default — and finding it as one tile of nine, distinguished by a
  badge. The engine now has its own block on the visible page, and the grid
  behind the disclosure holds the eight walkthroughs, under a heading that says
  none of them run the engine. `pages.mjs` asserts both the block and the status
  are visible on load, with nothing opened: the check fails if either goes back
  behind a `details`.
- **Copy that described watching rather than running.** The homepage CTA read
  *Watch SparkAE find a hidden blocker*; the demo's own headline read *Watch
  SparkAE find the hidden blockers in a package*. Both now say what the visitor
  does. The 20x page offered to show the Rev5 lane run “on real data” when the
  bundled sample is synthetic, and says synthetic now.
- **The browser suite was dead on `main`.** Five checks landed in
  `tests/browser.mjs` without the code that computes what they assert, so the
  file threw `ReferenceError: hashMiss is not defined` before its first check —
  the whole suite, roughly a hundred checks, silently not running. The
  behaviours those checks name did ship, so the measurement is written against
  them rather than the checks removed: what each homepage hash opens, MeshGate's
  baseline and walkthrough-sample copy, what §01 says when it stops on it, and
  whether a walkthrough's export chips pretend to be downloads.
- Also: two sections of `check.mjs` were both numbered 15 after that merge, and
  the homepage deep-link checks read grid tiles rather than workflow links — so
  they failed the moment §01 moved out of the grid, while the property they
  exist to protect still held. They read links now. And §01's promoted copy said
  “SSP → SAR”, which the same merge had removed from the homepage for the right
  reason: the live engine does not write a SAR.

## 2026-09-11 (site and repository crawl)

Engine 1.2.0 · verdict digest `355a46a6abb3` unchanged — nothing here touches a
determination.

A walk across every published page and then across the repository, asking of
each claim whether the thing beside it agrees.

- **Two pages were in `sitemap.xml` and reachable from nowhere.**
  `demo-20x.html` sat at priority 0.6 with its only inbound link deleted by the
  homepage density redesign, and `status.html` was linked only from that
  orphan's footer, so it went down with it. The homepage links the 20x
  walkthrough from the paragraph that already makes the claim it illustrates,
  Status joins the footer link row everywhere, and `tests/check.mjs` now crawls
  the link graph from the homepage and fails on an indexable page no visitor
  can walk to.
- **The footers disagreed with the navigation and with each other.** Every nav
  says "Live Demo"; six footers said "Demo". `demo-20x.html`'s footer was built
  from a `.colophon-links` class that no stylesheet defines, so its seven links
  rendered with no separation at all, and `status.html` had no site footer —
  only a local row missing Live Demo and Status. One footer now, on every page.
- **A walkthrough offered downloads it cannot produce.** §02–§09 filled the
  export bar with `<a href="#">` carrying a pointer cursor and a green ✓;
  clicking one jumped to the top of the page. It is a manifest now, and says
  the walkthrough does not generate files.
- **The post-demo CTA reported a run that may not have happened.** "The engine
  just ran on a sample package" is rendered at page load, with nothing gating
  it on a run.
- **`assessors.html` claimed XLSX export** with no server-product marker, where
  `index.html`, `integrations.html`, `README.md` and the demo all carry one —
  as does the bullet directly above it.
- **Comments pointed at files this repository does not contain.**
  `sitemap.xml` cited a `build.sh` allowlist and a
  `test_imp988_site_discoverability.py`; `_redirects` cited `build.sh`; eight
  pages said to regenerate the social card from `og-card.src.html` "(see
  `website/README.md`)". All of those live in the private repository, which
  `_headers` already said correctly and the rest now do too.
- **Half the demo's scripts were cached and half were not.**
  `demo-standalone-catalog.js` and `demo-exports.js` carried a one-hour
  `Cache-Control` rule, `demo-engine.js` and `ae-editorial.css` carried none.
  The files are not content-hashed, so a mix can pair an old engine with a new
  catalog.
- **`CONTRIBUTING.md`, `SECURITY.md` and the PR template named the wrong set of
  checks** — between them they omitted `selections.mjs`, `pages.mjs` and the
  `--strict` accuracy benchmark that CI runs on every pull request.

## 2026-09-11 (accuracy benchmark)

Engine 1.2.0 · verdict digest `355a46a6abb3` unchanged — nothing here changes a
determination. It measures them.

- **A labelled case set, scored and published.** `tests/benchmark/cases.json`
  pairs an objective with a fixed set of documents and records the determination
  a competent assessor would reach from those documents alone, with the
  reasoning written down so it can be argued with. `node tests/benchmark.mjs .`
  scores it and writes `tests/benchmark/results.json`; CI runs it with
  `--strict` on every pull request and on every push to `main`, and fails the
  build on a wrong determination that has no recorded reason. Engine 1.2.0 is right on 11 of 12 cases, with 0 false
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

## 2026-09-11 (the console's own controls)

Engine 1.1.0 · verdict digest `3dd76f5f3083` unchanged

An acceptance walk of the live demo, control by control: click everything the
page offers and ask whether it does what it says. Nine of them did not. No
verdict, gate or export changed — this is the layer between the visitor and the
engine.

- **A filter changed while rows were still painting kept the rows it replaced.**
  Both painters clear the table and then append from timers, and nothing
  cancelled the timers of the paint they replaced. Choosing Satisfied and then
  Other-Than-Satisfied half a second later left 60 Satisfied rows sitting under
  the Other-Than-Satisfied heading — the table contradicting the selection above
  it. Every scheduled append now carries its paint's generation and drops itself
  when a later paint has started.
- **Filter chips that could not match a row.** The bar was a fixed
  Examine · Interview · Test / SAT · OTS · NR · PASS row whatever the run held.
  §01 is EXAMINE-only by construction and says so in three places, yet offered
  Interview and Test, both of which silently emptied the table; §06's findings
  all carry method QA, which no chip named. The chips are now built from the run
  that produced them, carry their counts, and a dimension holding one value is
  stated rather than offered as a choice.
- **The count beside them meant two things.** "120 of 383 findings shown" when
  the painter capped the rows and "1 of 981 findings shown" when it did not:
  painted-of-matched in one case, matched-of-total in the other, so filtering to
  Satisfied reported a smaller run. One sentence now, and the run total is in
  every version of it.
- **An empty table said nothing.** It is indistinguishable from a broken one.
  A selection that matches nothing now names itself and says how many rows
  clearing it would bring back.
- **§01 met the rail's second system with "nothing to assess".** MeshGate is the
  subject of the §02–§09 walkthroughs and this build ships no document set for
  it, but the rail listed it as a peer of the sample under "Choose an SSP", so a
  visitor's second click on the tab they land on ended in *nothing to assess: no
  upload and no bundled document set* — the absence of a corpus, reported as an
  outcome. The rail entry now says which sections it is for, the rail says so
  before Run is pressed, and the run stops by naming the system and the way
  forward.
- **The rail disagreed with its own catalog**: FedRAMP Moderate was 325 controls
  on one line and 323 on the line above it, one authored and one computed. 323.
- **§09 told visitors to click something that is not clickable.** "Click any
  connector card to view its schema mapping" — the cards carry no handler and no
  pointer; the mapping is behind the link inside them, which the copy now names.
- **A hidden panel labelled §02 as §03.** An "Annual Reassessment · §03 ·
  Preview · in private preview Q3 2026" block sat in the console markup, never
  displayed, for a section that is neither §03 nor in preview. Removed.

`tests/selections.mjs` added and wired into CI: seventeen checks over the tabs,
the rail and the filters. Twelve of them fail against the previous build.

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
