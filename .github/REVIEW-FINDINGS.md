# SparkAE public reference build — interrogate findings

Inventory of defects found against `main` at engine **1.3.0**, catalog `2026-07-21` / `91ad1b17138f`, golden verdict digest `04b1f79d6f44` (CloudVault sample, FedRAMP Low, assessed as of 2026-06-01).

**Re-baselined 2026-09-15 against engine 1.4.1** (`6558408`); **PR 1 landed as engine 1.5.0**, **PR 2 as 1.5.1**, **PR 3 as the 2026-09-16 copy pass** and **PR 4 as 1.6.0**; ruleset `fc6ad10cbb39`, verdict digest `20cd7ee2ae8e`.

This file is a working review list, not a site page. It lives under `.github/` so it is not part of the published tree `check_published.mjs` compares to sparkae.ai. The GitHub repository is already public.

---

## Read this before picking up an item

This inventory was written against **1.3.0**. Four releases have landed since,
and between them they closed most of it:

- **1.4.0** (`0aafdb4`, "the interrogation fix set") took the original review's
  fifty-six defects and twenty-one tests — every item here whose alias is in the
  `#1`–`#77` range — and moved the verdict digest `04b1f79d6f44` → `614ab4597d07`,
  Satisfied 219 → 153.
- **1.4.1** (`6558408`, "anchor stems are content words") dropped stop words as
  words before stemming, in the objective anchors and in `contentStems`.
- **1.5.0** ("normalise before you match") closed items 1, 4, 5 and 8 — the
  enhancement-id boundary, invisible characters, entity references and the
  stuffing gate — with no determination moved.
- **1.5.1** ("the exports say what the engine decided") closed items 22, 23, 25,
  27, 28 and 29. No determination moved; the verdict digest did, because the
  verdict line carries the review flag now.
- **1.6.0** ("the product calls") closed items 6, 11 and 12 and moved 9 forward:
  the catalog's FedRAMP values are consulted and carried but deliberately not
  compared, undated evidence fails currency, and an unverified parameter is a
  review floor rather than a refusal. No determination moved.
- **2026-09-16** ("the pages say what the build does") closed the copy: items
  18, 19, 20, 21, 52, 53, 54, 58, 59, 62, 63, 64, 65, 66, 67 and 68, with 61
  part-done. No part of the tuple moves. `BANNED` in `check.mjs` now carries
  every phrase that pass removed, so none of them can come back unnoticed.

What remains is mostly the later passes (`#78`–`#166`), which 1.4.0 did not cover.
**Every item below now carries a status**, so nobody starts work that is already
done:

| Status | Meaning | Count |
|---|---|---|
| **OPEN** | reproduced on the current tree | 16 |
| **PARTIAL** | the specific defect is closed, the exposure behind it is not | 3 |
| **CLOSED** | fixed in 1.4.0 – 1.6.0, the 2026-09-16 copy pass or §28, verified on this tree | 51 |
| **UNVERIFIED** | not re-checked in the re-baseline; treat the 1.3.0 text as a lead, not a fact | 7 |

Statuses come from running the engine on this tree, not from reading the
changelog — see item 43, which no entry ever claimed and which would otherwise
have been assumed closed alongside its neighbours.

**How to read the rest.** Items are grouped by what to do first, not by the order they were found. Original review IDs (`#1` … `#166`) are in parentheses so earlier notes still map. Later IDs that only restated an earlier item are aliases, not extra bugs. Numbering is unchanged from the 1.3.0 edition: **do not renumber**, the aliases at the foot of the file depend on it.

**The product calls named in the 1.3.0 edition have been made** (1.6.0, items 6,
11 and 12; see the PR 4 note below for what each one cost). Gate 2 quorum is the
one still open, in item 7. Anything else that would move the golden digest is
still a call to make deliberately rather than a patch to slip in.

---

## P0 — Act on now

Visitor-facing false **Satisfied**, XSS on `file://`, fabricated 3PAO determinations, a receipt that does not hash to itself, or public copy that tells an assessor to skip what "passed."

### False Satisfied

1. **Enhancement IDs never match (`\b` after `)`).** (`#78–82`) — **CLOSED (1.5.0)**
   The close is a negative lookahead refusing a trailing word character and a
   trailing `(`, so an enhancement can never backtrack into its base.
   `controlIdPositions` carried a second copy of the same pattern and now reads
   the one pattern, so a refutation under an enhancement heading is charged to
   the enhancement. `check.mjs` §25 holds it.

2. **Gate 5a sees only the first "not implemented."** (`#1–3`) — **CLOSED (1.4.0)**
   `execAll` collects every occurrence and attributes each to the closest control id before it.

3. **Gates 3a and 4 still score the neighbor's prose.** (`#8–9`) — **CLOSED (1.4.0)**
   `demo-engine.js:1679,1693` now read `ownEvidence || evidenceText`.

4. **Invisible format characters beat Gate 5.** (`#114`) — **CLOSED (1.5.0)**
   `foldHomoglyphs` deletes `\p{Cf}` — zero-width space, non-joiner, joiner,
   word joiner, BOM and soft hyphen. Because deleting them can weld two words
   ("not<ZWSP>implemented" → "notimplemented"), every matcher over the fold is
   built with `\s*` between words by `weldTolerant`.

5. **DOCX/XML entities are not decoded.** (`#84`, `#142`) — **CLOSED (1.5.0)**
   `decodeEntities` reads decimal and hexadecimal references plus the five XML
   names and `nbsp`, in one pass that is never re-scanned. Loose `.xml` and
   `.nessus` uploads are decoded the same way; `.txt`, `.md`, `.csv` and `.json`
   are left as typed.

6. **Catalog ODP values are dead.** (`#115`) — **CLOSED (1.6.0)** *(consulted, deliberately not compared)*
   The 236 values are read. Each travels as `odp_expected` on the determination,
   a findings-CSV column and a `fedramp-parameter-value` OSCAL prop — 159 on the
   bundled run, the Not Reviewed included, since the requirement belongs to the
   objective rather than to the run.

   Gate 4 does **not** compare the stated value to it, and that is the decision.
   Comparing needs a stated duration bound to the parameter it answers, and an
   anchored clause routinely carries one belonging to a different parameter: the
   sample's AC-2 section says accounts are reviewed quarterly while AC-2_h.(1)
   requires they be *disabled* within twenty-four hours. A clause-scoped
   comparison over the sample found three mismatches, all of that shape — three
   false refusals, no true ones. `check.mjs` §27 pins that "every 10 years"
   still resolves a three-year parameter, so a later change cannot claim the
   comparison without making it.

7. **AC-1 Gate 2b collapses to stem `acces`.** (`#157`) — **PARTIAL**
   The named false pass is gone. On 1.4.1 AC-1's subject is `["access"]` (the
   stemmer no longer truncates), and the one-term anchor path added in 1.4.0
   requires a second objective stem beside it in the same clause, so
   `mentionsSubject(PE-2-only text, ["access"], AC-1 stems)` → **false**.
   What remains: **24** controls still have a single subject term and PM-1 has
   none (see item 53), so the structure the finding describes is intact and rests
   entirely on the anchor rule.

8. **Stuffing aborts on short sentences.** (`#116`) — **CLOSED (1.5.0)**
   The run-length condition is gone; repetition is measured as a share of the
   passage (`STUFFING_MIN_DUPES`, `STUFFING_DUPE_SHARE`, both in `RULESET`).
   A raw count alone read the bundled sample's own retrieval union as stuffed —
   sections legitimately share a house-style opening — and cost nineteen
   determinations, so the ratio is the parameter, and `check.mjs` §25 pins that
   union as not stuffed.

9. **Gate 6d only sees ISO dates.** (`#18`, `#117`) — **PARTIAL**
   The ISO-only defect closed in 1.4.0. Undated evidence now fails gate 6a
   (1.6.0): 92 objectives on the sample are undated and every one was already
   Other Than Satisfied, so no determination moved. Still open: `CLOSURE_RE` is
   dead code — `demo-engine.js` `continue`s unless `OPEN_STATUS_RE` matches, so
   the `&& !OPEN_STATUS_RE.test(sent)` beside it can never be true.

10. **One-term subjects + one distinguishing stem + lone BM25 hit.** (`#4–6`) — **CLOSED (1.4.0)**
    Gate 1 is absolute (share of the objective's distinct stems, not min-maxed BM25); a concept needs two terms; a one-word subject needs an anchor beside it.

11. **Untyped ODPs and `[Selection …]` pass.** (`#10–12`) — **CLOSED (1.6.0)** *(as a floor, not a refusal)*
    Typed values must sit in an affirmative clause sharing a word with the
    objective, `[Selection …]` is extracted, and an untyped placeholder is
    recorded `odp_unverified`. As of 1.6.0 it also flags the objective for
    review, named in the reason, so it travels on every artifact. The call was
    taken deliberately: failing closed would move Satisfied 153 → 117, and the
    rule this build follows is that the gates decide the verdict and the floors
    decide whether a human must look. `index.html`'s "resolved ODPs" copy was
    corrected in the 2026-09-16 copy pass.

12. **Gate 6a passes with no dates; newest date launders a stale review.** (`#16–17`) — **CLOSED (1.6.0)**
    The laundering half closed in 1.4.0. As of 1.6.0 undated fails gate 6a
    outright rather than passing with a flag: currency now means evidence that
    it is current, not the absence of evidence that it is stale.

13. **Uppercase homoglyphs miss the fold.** (`#13–14`) — **CLOSED (1.4.0)**
    `HOMOGLYPHS` carries both cases and folds per character.

### Fabricated determinations and XSS

14. **Uploads get invented 3PAO verdicts on §02–§09.** (`#37–41`, `#75`) — **CLOSED (1.4.0)**
    `synthesizeCustomSample` is gone; §03–§05 stop on an upload and say so.

15. **Walkthrough `log()` interpolates upload names into `innerHTML`.** (`#46–56`, `#77`) — **CLOSED (1.4.0)**
    Every name a walkthrough writes into the log is escaped.

16. **Cascade painter and `renderCites` are unescaped sinks.** (`#36`, `#90`, `#128`) — **CLOSED (1.4.0)**
    One painter, `buildFindingRow`, escapes every field at the sink.

17. **The downloaded receipt does not hash to its own digest.** (`#22`, `#31`, `#67`) — **CLOSED (1.4.0)**
    `receiptDigestOf` (`demo-exports.js:174`) is the verifier; the fields are inputs to the digest.

### Public copy that is operationally dangerous

18. **`assessors.html`: "Skip the controls that clearly pass."** (`#146`) — **CLOSED (2026-09-16)**
    Replaced with what a Satisfied here is: a lexical result an assessor checks,
    sixty of which carry a review flag. The phrase is in `BANNED`.

19. **Homepage and assessors claim native OSCAL 1.1.2 assessment-results and POA&M, schema-validated on every build.** (`#145`) — **CLOSED (2026-09-16)**
    The homepage says assessment-results is the OSCAL this build validates and
    that its POA&M is CSV, OSCAL POA&M being a server-product export.

20. **Integrations og/twitter: "Same 7-gate engine as the 3PAO UI."** (`#148`) — **CLOSED (2026-09-16)**
    Off both social cards and the body; the "10 Analytical Services · Optional
    LLM" line is attributed to the server product. In `BANNED`.

21. **`examineStatement` says the assessor "confirmed."** (`#104`, `#152`) — **CLOSED (2026-09-16)**
    The engine speaks as the engine in every branch, a flagged Satisfied says a
    floor was not met, and `tests/assessor.mjs` — which locked the old phrasing —
    holds the new one. See also item 68, the Not Reviewed branch of the same
    function.

---

## P1 — Fix next

Export integrity, parser fail-open, and ID/retrieval bugs that widen the P0 paths.

### Exports

22. **`review_required` never leaves the tab.** (`#119`) — **CLOSED (1.5.1)**
    Two columns on the findings CSV and the TCW, a `review-required` prop with
    its reason on the OSCAL finding, a line in the summary, and — the part that
    closes the hole rather than papering it — the flag is in the receipt's
    verdict line, so an export that drops it no longer verifies. It follows the
    engine's determination, not the effective one: a revised objective has
    already had the human the flag was asking for. The `assessors.html` claim
    that every Satisfied clears the floors (`#153`) is still wrong and belongs
    to PR 3.

23. **POA&M includes Not Reviewed rows.** (`#94`) — **CLOSED (1.5.1)**
    Filters on `=== 'Other Than Satisfied'`. Not Reviewed is a gap in the
    package, not an open weakness; the POA&M and the RET agree now.

24. **OSCAL risks key off engine status; target state keys off effective status.** (`#23–24`, `#68–69`) — **CLOSED (1.4.0)**
    Observations and risks follow the effective determination throughout.

25. **Evidence bodies sliced at 500 characters, no ellipsis.** (`#120`) — **CLOSED (1.5.1)**
    `evidenceDescription()` keeps the cut — an OSCAL file with every body in
    full is megabytes of duplicated corpus — and marks it, naming the number of
    characters the gates read.

26. **`csvSafe` only inspects `s[0]`.** (`#26–29`, `#70`, `#125`) — **CLOSED (1.4.0)**
    `csvSafe` strips leading blanks (including BOM) before testing for a formula lead.

27. **TCW stamps every row `Control Origination: Service Provider Corporate`.** (`#95`) — **CLOSED (1.5.1)**
    Reads `not determined by this build`. Origination is stated by the system
    owner; this build neither reads nor derives it.

28. **Findings CSV empty FedRAMP-shaped columns.** (`#96`) — **CLOSED (1.5.1)**
    Applicable Threats and the three post-remediation columns say
    `not produced by this build`, on rows that carry a weakness. On a Satisfied
    row they stay blank: there is no threat and no residual risk to state, and
    blank is the honest answer there.

29. **RET/POA&M "Original Detection Date" is the assessment date.** (`#97`) — **CLOSED (1.5.1)**
    The date stays — it is when this assessment detected the weakness, and the
    engine reads a package rather than a history — and the comment on every RET
    and POA&M row says so, so an assessment-day date no longer stands unremarked
    for an older finding.

30. **Walkthrough POA&M emits dangling `related-observations`.** (`#98`) — **UNVERIFIED**
    The live OSCAL path was fixed in 1.4.0; `buildOSCALPOAM` still exists at `demo-standalone.html:6627` and was not part of that change. The dangling reference itself was not re-checked.

31. **Executive summary says "25-column" findings CSV.** (`#30`, `#121`) — **CLOSED (1.4.0)**
    The summary prints `FINDINGS_HEADERS.length`.

32. **`import-ap.href` is `'#'`.** (`#25`) — **CLOSED (1.4.0)**
    Points at a declared back-matter resource (`'#' + apUuid`).

### Parser / retrieval

33. **Control-ID boost of BM25 raw 0.** (`#7`, `#63`, `#158`) — **CLOSED (1.4.0)**
    `demo-engine.js:133` boosts only when `raw > 0`.

34. **`extractControlIds` stops at 50 IDs per chunk.** (`#89`, `#166`) — **OPEN**
    `demo-engine.js:155`, `ids.size < 50`. A control-list appendix can drop the ID that would have tagged the chunk.

35. **ZIP `findEOCD` accepts the first `PK\x05\x06` in the last 64KiB.** (`#20`, `#72`) — **CLOSED (1.4.0)**
    The record has to end the file; two self-consistent records are refused as ambiguous.

36. **Member CRC-32 is unread.** (`#21`, `#73`) — **CLOSED (1.4.0)**
    Every member's bytes are checked against the directory CRC and refused by name on mismatch.

37. **DOCX headers, footers, footnotes, comments unread.** (`#85`, `#118`) — **OPEN**
    Only `word/document.xml` is read — no reference to `header1.xml` or `footnotes.xml` anywhere. A refutation in a header never reaches Gate 5.

38. **Tracked-change / vanish text is concatenated.** (`#83`, `#143`) — **OPEN**
    No handling of `w:del` anywhere in the engine. Tags are stripped, so `<w:del>not implemented</w:del><w:ins>is implemented</w:ins>` still refutes — fail-closed, but the wrong document.

39. **`expandFiles` vs `parseZipReport` disagree.** (`#32–33`, `#71`) — **CLOSED (1.4.0)**
    Housekeeping members are refused in the engine, so inventory and corpus agree, and the package is read once.

40. **ZIP names always UTF-8; encrypted members not named as encrypted; EOCD disk fields unread.** (`#87–88`, `#109–110`) — **OPEN**
    No CP437 or encryption handling in `demo-engine.js`. Flag 11 / GP bit 0 inflate as a generic failure; spanned archives are treated as single-disk.

41. **ZIP64 sentinels refused (good); nested `.zip` members refused as unsupported type.** (`#86`) — **OPEN**
    `zip` is absent from the member extension list at `demo-engine.js:564`, so an inner archive falls to the unsupported branch. Not silent — but a package whose SSP is `ssp.zip` is never read.

42. **Loose `.txt/.md/.json/.csv/.xml/.nessus` have no size cap.** (`#124`) — **OPEN**
    ZIP is bounded by `ZIP_MAX_BYTES` (64 MB); `demo-engine.js:228` calls `await file.text()` with no cap. `SECURITY.md` says large packages are "limited by the browser, not by this code" — false for ZIP, true for loose text.

43. **`runDemo` has no `try/finally`.** (`#123`, `#126`) — **OPEN**
    `demo-standalone.html:8782` sets `running = true` and clears it on the normal path only. A throw leaves it stuck and hash aliases and tab clicks silently no-op. Not part of the 1.4.0 set.

44. **Two findings painters; filter to ≤40 rows drops assessor UI.** (`#34–35`, `#74`, `#127`) — **CLOSED (1.4.0)**
    One painter builds every row through `buildFindingRow`.

45. **Homoglyph fold runs after BM25.** (`#106`, `#144`) — **OPEN**
    `demo-engine.js:1627` folds the retrieved text, after retrieval. All-Cyrillic chunks still tokenize to nothing → Not Reviewed (fail-closed miss, not Satisfied); mixed ASCII plus folded Cyrillic still reaches Gate 5.

46. **`.nessus` / `.xml` / `.json` tokenized as raw markup.** (`#107`) — **OPEN**
    Read as text at `demo-engine.js:227` with no markup handling. Scanner XML full of `not` / `failed` can trip Gate 5; JSON keys can look like control IDs. No real `.nessus` fixture.

47. **Multi-control `ownEvidence` still runs unscoped 5b.** (`#108`) — **UNVERIFIED**
    Not re-checked against the 1.4.0 refutation attribution, which may have changed the behaviour this describes.

48. **`stemWord` splits the same lexeme.** (`#15`) — **CLOSED (1.4.0)**
    `access`, `accessing` and `accessed` all stem to `access`; the `ss` guard in
    the suffix table is what fixed it. `implementation` and `implemented` still
    stem apart (`implementat` / `implement`) and are reconciled one level up by
    `stemsAgree()`, which reads a stem that extends another as the same word when
    both are at least `STEM_AGREE_MIN_CHARS`. That is the documented design
    (`demo-engine.js:718`), not a gap: `stemsAgree('implementat','implement')` is
    true. Note that `stemsAgree` takes **stems, not words** — calling it with raw
    words returns false and looks like a defect.

49. **`parsePdfText` / `parsePoamXlsx` still call missing globals.** (`#44–45`) — **CLOSED (1.4.0)**
    Both readers are gone; only copy explaining their absence remains.

50. **TextDecoder on ZIP text is non-fatal.** (`#164`) — **OPEN**
    `demo-engine.js:471` and `:528` construct `new TextDecoder()` without `{fatal:true}`. Invalid UTF-8 becomes U+FFFD and is still assessed.

51. **No Subresource Integrity on `demo-engine.js`, `demo-exports.js`, catalog, CSS.** (`#163`) — **OPEN**
    Zero `integrity=` attributes in `index.html` or `demo-standalone.html`. Those four are cached `max-age=3600`, so a deploy can mix new HTML with an hour-old adjudicator. Inline scripts are hashed; the engine is not.

---

## P2 — Claims and copy

Marketing, legal, onboarding, and walkthrough banners that the pages say and the code does not do. `tests/check.mjs` `BANNED` is five phrases and will not catch this list (`#162`).

52. **README "Complete NIST SP 800-53A Rev 5 catalog | 447 | 1,513."** (`#130`) — **CLOSED (2026-09-16)**
    447 is stated as what this build carries: 215 base + 232 enhancements, which
    is exactly the FedRAMP High baseline (410) plus the 37 baseline-less PT and
    PM controls. `check.mjs` asserts both that partition and the absence of
    AC-16, AC-23, AC-24, AC-25, IA-13 and SC-16. Seven footers stop saying "full
    catalog", which is now in `BANNED`.

53. **37 controls have `b: []` (all PT and PM, including PM-1).** (`#131`) — **CLOSED (2026-09-16)** *(as a claim)*
    The README states that they carry no baseline, that no profile selects them,
    and that they are in the count and in no assessment. They are still in the
    catalog: removing them would move the catalog digest, which is a product
    call, not a copy fix.

54. **LI-SaaS is in the catalog and nowhere else.** (`#132`) — **CLOSED (2026-09-16)** *(as a claim)*
    The README states the tagging (156 controls, 789 objectives) and that no
    profile stands behind it, so it decides nothing in this build. Removing the
    tags would move the catalog digest — a product call, not a copy fix.

55. **Onboarding: 21 OSCAL constraints vs 24 in `OSCAL_CONSTRAINTS`; 211 fedramp.gov refs vs 209 literals.** (`#133–134`) — **UNVERIFIED**
    The counts were not re-derived in the re-baseline.

56. **§07 validator vs live exporter.** (`#99–103`) — **UNVERIFIED**
    C-004 / F-101 / C-003 behaviour and the "NIST + FedRAMP CONFORMANT" banner were not re-checked.

57. **§02–§09 idle copy says the engine will ingest / execute.** (`#42`, `#76`) — **CLOSED (1.4.0)**
    Idle copy says it is a walkthrough; the ConMon walkthrough ends at the package shape, not "ready for submission."

58. **Walkthrough CloudVault `initial.sat: 287` vs the live engine's Satisfied count.** (`#136`) — **CLOSED (2026-09-16)**
    The permanently-null `_realRun` and the two branches it guarded are gone, so
    §02–§09 no longer carry a path that looks like a live run. The authored
    figures say they are authored and name the live engine's 153.

59. **Rail `cv-meta` always appends `· v2.4` (SSP version) after live profile counts.** (`#135`) — **CLOSED (2026-09-16)**
    Reads `sample SSP v2.4`, in the markup and in the profile-change handler, so
    it is attached to the thing it versions.

60. **Privacy / index: "deployment boundary," `LLM_PROVIDER=none`, "container you run."** (`#137`) — **UNVERIFIED**
    Not re-checked, including the `SECURITY.md` / `localStorage` contradiction (`#138`).

61. **`terms.html`: "certified 3PAO"; first paragraph is not EXAMINE-only; demos described as synthetic only.** (`#149`) — **PARTIAL**
    "certified 3PAO" reads "FedRAMP Recognized assessment service" and is in
    `BANNED`. The EXAMINE-only framing of the opening paragraph and the
    synthetic-demos description are legal copy and were not rewritten here.

62. **Index: "Tenable for the package itself."** (`#150`) — **CLOSED (2026-09-16)**
    Replaced with what it does: reads the package rather than the running
    system, retrieves, applies seven gates, exports what it decided and why.

63. **`assessors.html` ODP copy: "90-day vs FedRAMP 60-day requirement."** (`#147`) — **CLOSED (2026-09-16)**
    The page says what gate 4 does — a parameter of the right kind, in a clause
    about the objective — and says outright that it does not compare the stated
    value to the catalog's. The phrase is in `BANNED`. The underlying gap is
    item 6 and still open.

64. **Gap taxonomy names do not exist in code.** (`#159–161`, `#166` class) — **CLOSED (2026-09-16)**
    The assessors page names the six the code emits. The "13 pattern types …
    with severity levels" line reads as the six negation pairs the reference
    build actually has, carrying no severity, with the typed-and-severity
    version attributed to the server product. The four invented type names are
    in `BANNED`.

65. **README / CHANGELOG / `results.json`: "16 cases · 15 correct · 0 false passes."** (`#151`) — **CLOSED (2026-09-16)**
    The README already separated the two populations; it now also states that
    the cases run `chunkText` over embedded strings rather than `parsePackage`,
    so no ZIP, DOCX, entity or archive path is exercised by any of the sixteen
    (item 71), and names gate 4's uncased parameter comparison (item 6).

66. **SHA-1 is the reproducibility seal.** (`#122`) — **CLOSED (2026-09-16)** *(as a claim)*
    The download toast calls it a reproducibility identifier rather than leaving
    a bare `sha1` for a reader to interpret. The digests are still SHA-1:
    changing them moves every digest in the tuple and is a product call.

67. **`demo-20x.html` is in `sitemap.xml` (priority 0.6).** (`#156`) — **CLOSED (2026-09-16)**
    The page now says on itself what the assessors page says — SparkAE does not
    support FedRAMP 20x — and that nothing on it is produced by the engine this
    origin publishes. It stays in the sitemap: it is legitimate linked content,
    and dropping it from the sitemap would hide rather than correct it.
    `fails_closed: false` is not a defect — the walkthrough is showing a
    validation method that fails open being caught, which is its point.

68. **NR statement: "found no documentation establishing that …"** (`#105`) — **CLOSED (2026-09-16)**
    The Not Reviewed branch says retrieval surfaced no passage above the
    evidence threshold, and says outright that this is not a finding that the
    package lacks the documentation.

    *Correction: the 2026-09-15 re-baseline marked this CLOSED on a grep of
    `demo-engine.js` alone. The sentence was in `demo-standalone.html`, in
    `examineStatement`, beside item 21. It was OPEN until this change.*

69. **`RULESET` omits the matchers that decide verdicts.** (`#19`) — **CLOSED (1.4.0)**
    Refuting patterns, draft markers, negation pairs, the homoglyph map, stem suffixes, ODP value shapes, strength signals and date patterns are all hashed now.

---

## P3 — Twins, verification, process

Same fact, two implementations; suite locks the quirk; or the check is on the wrong path.

70. **Upload assessment date is UTC `toISOString().slice(0,10)`.** (`#91`, `#111`, `#92`) — **OPEN**
    Still on the page. It reads as the next calendar day for much of the US in the evening, and `check.mjs` §4 only scans `demo-engine.js` and `demo-exports.js`, so the page clock is invisible to it. Whether `browser.mjs` still locks the UTC value was not re-checked.

71. **Golden and benchmark use `chunkText` on embedded text, not `parsePackage`.** (`#112–113`) — **CLOSED (2026-09-16)** *(golden; the benchmark stays text-only by decision)*
    `check.mjs` §28 assesses the bundled sample a second time, delivered as a ZIP
    holding a DOCX, and requires the same verdict digest as the embedded run —
    equality, so there is no second fixture to regenerate. The package is
    adversarial by design, because a clean ZIP-of-DOCX was measured and catches
    only paragraph handling: it carries a control id written `AC&#45;1`, a
    `__MACOSX` member holding a refutation, and a member whose stored CRC does
    not describe its bytes holding the same refutation. All four readers were
    mutated to confirm the fixture fails when it should. `check.mjs` runs on
    every push and pull request, so a ZIP or DOCX defect now fails a push.

    The benchmark still runs `chunkText`. Those sixteen cases are an accuracy
    record with a published score, and widening what they measure to include
    delivery would blur the figure for a weaker net than §28; the README says so
    where the figure is quoted. The items this now covers — **37, 38, 40, 41,
    42, 45, 46, 50** — remain open as defects, but they can no longer break
    silently.

72. **`ci.yml` header: everything the README claims is checked on every PR.** (`#154`) — **OPEN**
    `check_published.mjs` runs on the Monday cron (`17 6 * * 1`) or `workflow_dispatch`. A broken deploy can sit until Monday.

73. **`pages.mjs` loads `/404.html` (has CSP), not an unmatched path.** (`#155`, `#141`) — **UNVERIFIED**
    `404.html` no longer appears in `tests/pages.mjs`, so this may already be addressed. The underlying hole — unmatched Netlify routes get `/*` and no CSP, and `/3pao` without `.html` is not redirected (`#140`) — was not re-checked.

74. **`status-data.json` `published_at: null`; `check.mjs` requires it stay null.** (`#139`) — **OPEN**
    `status-data.json:28` and the assertion at `tests/check.mjs:1574`. Public `/status` cannot ship a real snapshot without changing the test.

75. **`.github/ISSUE_TEMPLATE/config.yml` `blank_issues_enabled: true`.** (`#165`) — **OPEN**
    Security is a mailto contact link, not a gate. A visitor can still open a public issue with a crafted-document recipe.

76. **Clipboard copies `[kind] meta` only.** (`#129`) — **UNVERIFIED**

77. **Private vulnerability reporting is off.** (`CONTRIBUTING.md` / `SECURITY.md`) — **OPEN**
    The email path works; the GitHub form is hypothetical.

---

## Tests that should land with the fixes (`#57–77`)

**All twenty-one landed in 1.4.0** — `check.mjs` §24, `assessor.mjs` and `browser.mjs` hold them. The table below is kept for traceability; nothing in it is outstanding.

| Test | Holds |
|---|---|
| 57 | Two-control chunk: later "AC-2 … not implemented" must not Satisfied (`#1–3`) |
| 58 | Own-control weak + neighbor section/version/date → 3a still fails (`#8`) |
| 59 | Own-control no role keyword + neighbor ISSO → role ODP still fails (`#9`) |
| 60 | Untyped ODP + non-empty irrelevant evidence → Gate 4 does not pass *or* copy does not say "resolved" (`#10`) |
| 61 | `[Selection …]` included in 60 (`#11`) |
| 62 | One-term subject, furniture-only evidence → must not Satisfied (`#4–6`) |
| 63 | Eight tagged zero-score chunks + one untagged answering paragraph stays in `topK` (`#7`) |
| 64 | Uppercase homoglyph draft marker (`#13–14`) |
| 65 | Stale `review_date` + later untyped date → 6a if you close (`#16`) |
| 66 | Open-finding SLA month-name vs ISO → same verdict (`#18`) |
| 67 | Receipt round-trip after `system_name` / file lists (`#22`, `#31`) |
| 68 | OSCAL after OTS→SAT: no open `related-risks` on a satisfied target (`#23`) |
| 69 | OSCAL after SAT→OTS: a risk exists (`#24`) |
| 70 | CSV `' =HYPERLINK'`, `'\n=cmd'`, `'﻿=1+1'` prefixed (`#26–29`) |
| 71 | ZIP `__MACOSX/._ssp.txt`: inventory and corpus agree (`#32–33`) |
| 72 | ZIP comment contains fake EOCD (`#20`) |
| 73 | Flipped CRC refused, not parsed (`#21`) |
| 74 | Filter to ≤40 rows: examine / revise still present (`#34–35`) |
| 75 | Upload + §02: no 3PAO SAT, no invented counts (`#37–41`) |
| 76 | `idleCopy` for §02–§09 does not say the engine ran (`#42`) |
| 77 | `log()` filename with `<img onerror=…>` not HTML (`#46–56`) |

### Tests still to write

What PR 1 and PR 2 needed is in `check.mjs` §25 and §26. These do not exist;
each holds an item that is still **OPEN**:


---

## Suggested PR cut

Re-cut against 1.4.1. **PR 0 is this file.**

**PR 1 — engine, false Satisfied** — **LANDED as engine 1.5.0**
Items **1, 4, 5, 8**, one theme: normalise before you match. The control-id
close is a lookahead, `\p{Cf}` is deleted before matching (with `\s*` word
separators so a deletion cannot weld two words past a matcher), references are
decoded, and stuffing is a share of the passage rather than a count. The
verdict digest did **not** move — the bundled sample exercises none of the four
— so `check.mjs` §25 is what holds them.

**PR 2 — exports say what the engine decided** — **LANDED as engine 1.5.1**
Items **22, 23, 25, 27, 28, 29**. The review flag reaches every artifact and the
receipt's verdict line; the POA&M carries open weaknesses rather than untested
objectives; origination, the detection date and the unfilled FedRAMP columns say
what they are instead of implying a value. No determination moved — the verdict
digest moved because the verdict line carries the flag, which is the change.

**PR 3 — claims match code** — **LANDED 2026-09-16**
Items **18, 19, 20, 21, 52, 53, 54, 58, 59, 62, 63, 64, 65, 66, 67, 68**, and
**61** in part. The engine stopped writing in the assessor's voice, the catalog
claim became what the catalog is, and `BANNED` went from five phrases to every
phrase this pass removed. No part of the tuple moves.

**PR 4 — product calls** — **LANDED as engine 1.6.0**
Items **6, 11, 12** closed and **9** advanced, each decided rather than patched:
the catalog values are consulted and carried but not compared (a comparison
produced three false refusals and no true ones on the sample), undated evidence
fails currency (free on this sample, strict on others), and an unverified
parameter flags for review rather than refusing (failing closed would have cost
36 Satisfied). No determination moved; the verdict digest did, because gate 6's
record and the review flag are in the verdict line.

**Deferred** — real, but none produces a false Satisfied: items **34, 37, 38,
40, 41, 42, 43, 45, 46, 50, 51** (parser hardening, `runDemo`, SRI) and items
**70, 72–77** (verification and process). Item **71** was pulled forward and is
done, so the parser items above can now fail a push rather than breaking
silently — which is the order to fix them in.

---

## Found while fixing, not in the original review

Not numbered: the canonical sequence is 1–77 and renumbering would break the
alias table below.

**PR1-a. Two matchers backtrack quadratically on a run of spaces.** — **CLOSED (1.5.0)**
The `absent` refutation and `SCAN_CONTEXT_RE` each carried a whitespace
quantifier on both sides of an optional group, so a space run could be split
between them every possible way — 306ms on twenty thousand spaces under 1.4.1,
tens of seconds on a real document, in a parser that reads visitor uploads.
Pre-existing, not introduced by the `\s*` rewrite, which made it marginally
worse (428ms on the same input). Each optional group carries its own trailing
separator now. `check.mjs` §25 walks every regex in `RULESET` and fails any that
exceeds 100ms on that input, so the shape cannot come back unnoticed.

---

## Numbering notes

Canonical sequence is **1–77** (56 product items + 21 proposed tests), then gaps **78–93**, then **94–113**, then later passes **114–166**. An early merged 1–32 list used different numbers for the same defects and was replaced by 1–77; do not mix those numbers with this file.

Aliases (same defect, later ID): `#117`=`#18`, `#118`=`#85`, `#121`=`#30`, `#125`=`#26–28`, `#127`=`#35`, `#128`=`#90`, `#142`=`#84`, `#143`=`#83`, `#144`=`#106`, `#152`=`#104`, `#158`=`#7`, `#166`=`#89`, `#91`=`#111`, `#88`=`#110`.
