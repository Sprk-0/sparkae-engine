# SparkAE public reference build — interrogate findings

Inventory of defects found against `main` at engine **1.3.0**, catalog **2026-07-21** / `91ad1b17138f`, golden verdict digest `04b1f79d6f44` (CloudVault sample, FedRAMP Low, assessed as of 2026-06-01).

This file is a working review list, not a site page. It lives under `.github/` so it is not part of the published tree `check_published.mjs` compares to sparkae.ai. The GitHub repository is already public.

**How to read it.** Items are grouped by what to do first, not by the order they were found. Original review IDs (`#1` … `#166`) are in parentheses so earlier notes still map. Later IDs that only restated an earlier item are aliases, not extra bugs. The current suite does not hold an item unless the note says it does (a few tests **lock** the wrong behaviour).

**Do not start with** Gate 4 fail-closed, Gate 2 quorum, or 6a-with-no-dates unless you make an explicit product call: those move the golden digest.

Suggested first PR: P0 engine/XSS/receipt/synthesis **plus** `#78–82` (otherwise enhancement objectives keep using the BM25-union path). Bump `ENGINE_VERSION` if verdicts change; regenerate golden + `tests/benchmark/results.json` and say why the digest moved.

---

## P0 — Act on now

Visitor-facing false **Satisfied**, XSS on `file://`, fabricated 3PAO determinations, a receipt that does not hash to itself, or public copy that tells an assessor to skip what “passed.”

### False Satisfied

1. **Enhancement IDs never match (`\b` after `)`).** (`#78–82`)
   `CTRL_ID_RE` / scoped refutation / corpus index. `"AC-2(1) is implemented"` → `['AC-2']`; `\bAC-2\(1\)\b` positions are empty. **232 / 447** catalog keys are enhancement-shaped, so `ownEvidence` is always empty and gates 2/3b/5/6 fall through to the BM25 union. Own-control scoping from 1.2.0 does not apply to half the catalog. Required test: `"AC-2(1) is not implemented"` must OTS `AC-2(1)`.

2. **Gate 5a sees only the first “not implemented.”** (`#1–3`)
   `detectRefutations`, `detectRefutationsScoped`, and `buildRefutationIndex` call `execPattern` once per regex. A later sentence next to this control is ignored. Fix: `matchAll` and attribute each hit. Still useless for `AC-2(1)` until `#78` is fixed.

3. **Gates 3a and 4 still score the neighbor’s prose.** (`#8–9`)
   `scoreEvidence` and `validateOdps` take `evidenceText` (BM25 union). Coverage, stuffing, refutation, and dates already use `ownEvidence || evidenceText`. A neighbor’s “SSP section / version / dated / ISSO” can Satisfied this control. For enhancements this is the default path, not an edge.

4. **Invisible format characters beat Gate 5.** (`#114`)
   `foldHomoglyphs` does not strip Cf / soft hyphen. Same AC-1 body that is OTS with `not implemented` becomes **Satisfied** with `not\u200Bimplemented`, `\u200C`, `\u2060`, `imple\u00ADmented`, and `place\u200Bholder`. Cyrillic lowercase `рlaceholder` still fails closed. Homoglyph tests are letters only.

5. **DOCX/XML entities are not decoded.** (`#84`, `#142`)
   `docxText` decodes only `&lt; &gt; &amp; &quot; &apos;`. Crafted `not&#x200B;implemented`, `not&nbsp;implemented`, and `not&#32;implemented` all **Satisfy** AC-1. Same hole on `.xml` uploads. A real U+00A0 nbsp still fails closed.

6. **Catalog ODP values are dead.** (`#115`)
   236 DIFs carry `o` (e.g. AC-1_c.1-1: “at least every 3 years”). Engine never reads `dif.o`. Gate 4 is keyword classes only. Evidence saying “annually” **Satisfies** that objective.

7. **AC-1 Gate 2b collapses to stem `acces`.** (`#157`)
   Title is generic (“Policy and Procedures”); family “Access Control” is ambient, so the code keeps the raw term. A **PE-2-only** document — visitors sign in at the lobby, with section/version/page/date — **Satisfies AC-1_a.[01]**. Inverse of the 1.3.0 ambient fix. AT-1 / AU-1 / IA-1 stay Not Reviewed on the same text. 23 controls have a 0–1-term subject.

8. **Stuffing aborts on short sentences.** (`#116`)
   `evidenceLooksStuffed` returns false if the longest run between `[.!?;:]` is under 40 tokens, before 5-gram dupes. Punctuated keyword runs **Satisfy**. Suite cases are long unpunctuated runs.

9. **Gate 6d only sees ISO dates.** (`#18`, `#117`)
   `extractDates` accepts “May 1, 2025”; `DATE_TOKEN_RE` is `YYYY-MM-DD` only. Prose SLA dates **Satisfy**; the same sentence with `2025-05-01` is OTS. `CLOSURE_RE` is dead (`OPEN_STATUS_RE` already required).

10. **One-term subjects + one distinguishing stem + lone BM25 hit.** (`#4–6`)
    `checkCoverage` treats one stem as the whole concept; Gate 2b can be a single word (`AC-2` → `account`); a single chunk is min-maxed to score 1.0 so Presence always clears. Furniture-only prose can Satisfied. Related: `#157`.

11. **Untyped ODPs and `[Selection …]` pass.** (`#10–12`)
    Non-empty non-stuffed evidence clears untyped ODPs. `[Selection (one or more): …]` is never extracted. Typed checks are “keyword anywhere in the union.” Product call if you fail-closed (moves golden). Homepage still lists “resolved ODPs” as a Satisfied condition (`#93`).

12. **Gate 6a passes with no dates; newest date launders a stale review.** (`#16–17`)
    No dates → `{isCurrent:true}`. Stale `review_date` concerns are discarded when `dates[0]` is fresh. Product call (PR 3), not a silent patch.

13. **Uppercase homoglyphs miss the fold.** (`#13–14`)
    Map is lowercase-only and never case-folds first. `Рlaceholder` (U+0420) does not become `placeholder`. Lowercase mix is already tested.

### Fabricated determinations and XSS

14. **Uploads get invented 3PAO verdicts on §02–§09.** (`#37–41`, `#75`)
    `synthesizeCustomSample` emits “The 3PAO examined … and confirmed” plus `50 + seed % 100` assets, fallback Critical/High counts, connector/scan-type totals. Stop synthesizing. Walkthroughs stay on authored samples; an upload runs §01 or is refused on those tabs.

15. **Walkthrough `log()` interpolates upload names into `innerHTML`.** (`#46–56`, `#77`)
    Sink at `demo-standalone.html` ~5037. ConMon/annual/SCR/KSI/initial/OSCAL/connectors interpolate `sample.name` and inventory filenames. §01 uses `engEsc`. `_headers` CSP does not apply on `file://`.

16. **Cascade painter and `renderCites` are unescaped sinks.** (`#36`, `#90`, `#128`)
    `f.text` / recommendations / cite `title`/`section`/`date` into HTML. Engine rows are pre-escaped; walkthrough and custom-upload rows are not. Escape at the sink.

17. **The downloaded receipt does not hash to its own digest.** (`#22`, `#31`, `#67`)
    `runEngine` writes `system_name`, `files_parsed`, `files_refused` *after* `receipt_digest`. Rehashing the JSON does not recover the digest. Hash after those fields, or keep extra keys off the digested object.

### Public copy that is operationally dangerous

18. **`assessors.html`: “Skip the controls that clearly pass.”** (`#146`)
    Combined with 48 thin Satisfied on the sample (`review_required`), enhancement-ID miss, ZWSP, catalog `o`, and AC-1/`acces`, this is advice a recognized assessment service could follow off a public page.

19. **Homepage and assessors claim native OSCAL 1.1.2 assessment-results and POA&M, schema-validated on every build.** (`#145`)
    This repo emits OSCAL AR JSON and **POA&M CSV**. README puts OSCAL POA&M in the commercial column. CI vendors only `oscal_assessment-results_schema.json`.

20. **Integrations og/twitter: “Same 7-gate engine as the 3PAO UI.”** (`#148`)
    Body also shows “10 Analytical Services · Optional LLM.” This origin does not ship that UI. Social cards are what LinkedIn/Slack show.

21. **`examineStatement` says the assessor “confirmed.”** (`#104`, `#152`)
    Engine Satisfied, including `review_required`, is exported in that voice. `tests/assessor.mjs` **locks the phrasing.** CONTRIBUTING forbids narrating work the engine did not perform.

---

## P1 — Fix next

Export integrity, parser fail-open, and ID/retrieval bugs that widen the P0 paths.

### Exports

22. **`review_required` never leaves the tab.** (`#119`)
    Golden Low: 219 Satisfied, **48** flagged. UI and `tests/browser.mjs` count it. `demo-exports.js` has zero matches: OSCAL, Findings CSV, RET, POA&M, TCW, summary, and receipt verdict lines omit it. Downstream sees clean Satisfied. `assessors.html` still says floors every Satisfied must clear (`#153`).

23. **POA&M includes Not Reviewed rows.** (`#94`)
    `buildPOAM` keeps `effectiveStatus !== 'Satisfied'`. NR is “no evidence above threshold,” not an open weakness. RET correctly keeps OTS only. A live Low run dumps hundreds of NR rows as if they were findings.

24. **OSCAL risks key off engine status; target state keys off effective (assessor) status.** (`#23–24`, `#68–69`)
    OTS→SAT: satisfied target with `related-risks` still `open`. SAT→OTS: not-satisfied finding, no risk. CONTRIBUTING says every OTS finding points at the risk it raises.

25. **Evidence bodies sliced at 500 characters, no ellipsis.** (`#120`)
    Gates see the full string; CSV/OSCAL/TCW `evidence_description` does not. A refutation or date past offset 500 is missing from the artifact.

26. **`csvSafe` only inspects `s[0]`.** (`#26–29`, `#70`, `#125`)
    Leading space, newline, BOM (`U+FEFF`), or fullwidth `＝` then `=` is unchanged. `check.mjs` §8 is `/(^|,)"[=+\-@]/m` and cannot see padded cells.

27. **TCW stamps every row `Control Origination: Service Provider Corporate`.** (`#95`)
    Not computed. Invented FedRAMP origination value.

28. **Findings CSV empty FedRAMP-shaped columns.** (`#96`)
    Applicable Threats, Likelihood/Impact/Risk After are always `''`. Empty reads as “none,” not “not produced.”

29. **RET/POA&M “Original Detection Date” is the assessment date.** (`#97`)
    A 2018 scan assessed as of 2026-06-01 is dated 2026-06-01 on the RET.

30. **Walkthrough POA&M emits dangling `related-observations`.** (`#98`)
    Live OSCAL path was fixed; walkthrough `buildOSCALPOAM` was not.

31. **Executive summary says “25-column” findings CSV.** (`#30`, `#121`)
    `FINDINGS_HEADERS` has **29** columns.

32. **`import-ap.href` is `'#'`.** (`#25`)
    Schema-legal placeholder, not an assessment plan.

### Parser / retrieval

33. **Control-ID boost of BM25 raw 0.** (`#7`, `#63`, `#158`)
    Tagged “See AC-1” / body `AC-1` outranks untagged paragraphs that answer the objective (`score: 1`). Gate 1 then runs on that token.

34. **`extractControlIds` stops at 50 IDs per chunk.** (`#89`, `#166`)
    A control-list appendix can drop the ID that would have tagged the chunk.

35. **ZIP `findEOCD` accepts the first `PK\x05\x06` in the last 64KiB.** (`#20`, `#72`)
    Never checks `eocd + 22 + commentLen === archive.length`. A comment containing that signature can yield 0 members that are neither parsed nor refused by name.

36. **Member CRC-32 is unread.** (`#21`, `#73`)
    Corrupted stored bytes become evidence. `check.mjs` §13 only verifies fixtures it built.

37. **DOCX headers, footers, footnotes, comments unread.** (`#85`, `#118`)
    Only `word/document.xml`. A refutation in a header never reaches Gate 5.

38. **Tracked-change / vanish text is concatenated.** (`#83`, `#143`)
    Tags stripped, so `<w:del>not implemented</w:del><w:ins>is implemented</w:ins>` still refutes (fail-closed OTS in reproduction). A CSP who deleted a gap still carries it. Not a Satisfied hole; still the wrong document.

39. **`expandFiles` vs `parseZipReport` disagree.** (`#32–33`, `#71`)
    Panel drops `__MACOSX` / `.DS_Store` / `Thumbs.db`; engine does not. Package unzipped twice. Junk can become BM25 evidence the inventory never listed.

40. **ZIP names always UTF-8; encrypted members not named as encrypted; EOCD disk fields unread.** (`#87–88`, `#109–110`)
    CP437 ignored. Flag 11 / GP bit 0 inflate as generic failure. Spanned archives treated as single-disk.

41. **ZIP64 sentinels refused (good); nested `.zip` members refused as unsupported type.** (`#86`)
    Not silent. A package whose SSP is `ssp.zip` never reads the inner archive.

42. **Loose `.txt/.md/.json/.csv/.xml/.nessus` have no size cap.** (`#124`)
    ZIP is 64 MB / 512 members. Walkthrough scan/OSCAL parsers cap at 4–8 MB; live `file.text()` does not. `SECURITY.md` says large packages are “limited by the browser, not by this code” — false for ZIP, true for loose text.

43. **`runDemo` has no `try/finally`.** (`#123`, `#126`)
    A throw leaves `running` stuck; hash aliases and tab clicks silently no-op.

44. **Two findings painters; filter to ≤40 rows drops assessor UI.** (`#34–35`, `#74`, `#127`)
    Live Low NR is 1 row: cascade path has no examine statement / revise. One painter: always `buildFindingRow`.

45. **Homoglyph fold runs after BM25.** (`#106`, `#144`)
    All-Cyrillic chunks tokenize to nothing → **Not Reviewed** (fail-closed miss), not Satisfied. Mixed ASCII + folded lowercase Cyrillic still reaches Gate 5.

46. **`.nessus` / `.xml` / `.json` tokenized as raw markup.** (`#107`)
    Scanner XML full of `not` / `failed` can trip Gate 5; JSON keys can look like control IDs. No real `.nessus` fixture.

47. **Multi-control `ownEvidence` still runs unscoped 5b.** (`#108`)
    Any negation and any positive in the joined blob fail both controls.

48. **`stemWord` splits the same lexeme.** (`#15`)
    `access`→`acces`, `accessing`→`access`. Gate 2 false-fails on inflections.

49. **`parsePdfText` / `parsePoamXlsx` still call missing globals.** (`#44–45`)
    `pdfjsLib` / `XLSX` never loaded. Always `null`. Delete.

50. **TextDecoder on ZIP text is non-fatal.** (`#164`)
    Invalid UTF-8 becomes U+FFFD and is still assessed.

51. **No Subresource Integrity on `demo-engine.js`, `demo-exports.js`, catalog, CSS.** (`#163`)
    Those four are cached `max-age=3600`. A deploy can mix new HTML with an hour-old adjudicator. Inline scripts are hashed; the engine is not.

---

## P2 — Claims and copy

Marketing, legal, onboarding, and walkthrough banners that the pages say and the code does not do. `tests/check.mjs` `BANNED` is five phrases and will not catch this list (`#162`).

52. **README “Complete NIST SP 800-53A Rev 5 catalog | 447 | 1,513.”** (`#130`)
    215 base + 232 enhancements. Missing e.g. AC-16, AC-23, AC-24, AC-25, IA-13, SC-16. `check.mjs` locks 447 as correct. Footers say “full catalog 447” with no enhancement split.

53. **37 controls have `b: []` (all PT and PM, including PM-1).** (`#131`)
    Inflate “447 complete”; never run. PM-1 is also the only control whose Gate 2b subject is empty (`mentionsSubject` returns true).

54. **LI-SaaS is in the catalog and nowhere else.** (`#132`)
    156 controls / 789 objectives vs Low 156 / 981. 77 LI-tagged controls have zero LI DIFs. Profile select is Low|Moderate|High only.

55. **Onboarding: 21 OSCAL constraints vs 24 in `OSCAL_CONSTRAINTS`; 211 fedramp.gov refs vs 209 literals.** (`#133–134`)
    QA 11 matches `QA_RULES`.

56. **§07 validator vs live exporter.** (`#99–103`)
    C-004 requires UUID v4; site mints v5. F-101 passes on planted `a2la-cert: #####`. C-003 pass text claims FedRAMP ≥1.0.4 and only tests presence. Pass copy is 3PAO-voice on a document the walkthrough just built. Banner “NIST + FedRAMP CONFORMANT” is not `check_oscal_schema.py`.

57. **§02–§09 idle copy says the engine will ingest / execute.** (`#42`, `#76`)
    Those tabs do not run `demo-engine.js`. ConMon completion log: “ready for submission to the authorizing agency” (`#43`) — not in `BANNED`.

58. **Walkthrough CloudVault `initial.sat: 287` vs golden live engine 219 Satisfied.** (`#136`)
    Dead `_realRun` branch still looks like a live run could drive §02–§09.

59. **Rail `cv-meta` always appends `· v2.4` (SSP version) after live profile counts.** (`#135`)
    Engine is 1.3.0; catalog is `2026-07-21`. Changing Low→High keeps `v2.4`.

60. **Privacy / index: “deployment boundary,” `LLM_PROVIDER=none`, “container you run.”** (`#137`)
    This origin is a static tab. `SECURITY.md` “stores nothing outside the page” vs onboarding `localStorage` (`#138`).

61. **`terms.html`: “certified 3PAO”; first paragraph is not EXAMINE-only; demos described as synthetic only.** (`#149`)
    `/demo` accepts a visitor’s real SSP in-tab. FedRAMP says Recognized, not certified.

62. **Index: “Tenable for the package itself.”** (`#150`)

63. **`assessors.html` ODP copy: “90-day vs FedRAMP 60-day requirement.”** (`#147`)
    Gate 4 never reads catalog `o`.

64. **Gap taxonomy names do not exist in code.** (`#159–161`, `#166` class)
    Marketed six: `odp_frequency_mismatch`, `insufficient_scope`, `stale_documentation`, `scan_gap`… Actual: `missing_implementation`, `incomplete_policy`, `missing_evidence`, `contradictory_evidence`, `temporal_gap`, `other_gap`. Stuffing → `missing_evidence`. “13 pattern types … across DIFs … severity levels” is six `NEGATION_PAIRS` in one string, no severity. “Exact API enum values FedRAMP expects” — this build emits `Satisfied` / `Other Than Satisfied` / `Not Reviewed`.

65. **README / CHANGELOG / `results.json`: “16 cases · 15 correct · 0 false passes.”** (`#151`)
    True of that file. False as a site-level accuracy claim: ZWSP, entities, stuffing, prose SLA, catalog `o`, and AC-1/`acces` are uncased. `--strict` stays green.

66. **SHA-1 is the reproducibility seal.** (`#122`)
    Comment: “never as security material.” Receipt/catalog/ruleset/evidence/verdict digests are SHA-1; toast prints `sha1`. `demo-20x.html` shows illustrative `sha256:`.

67. **`demo-20x.html` is in `sitemap.xml` (priority 0.6).** (`#156`)
    Assessors page: “SparkAE does not support FedRAMP 20x.” Walkthrough still shows `fails_closed: false`.

68. **NR statement: “found no documentation establishing that …”** (`#105`)
    Gate 1 missed the BM25 threshold, not “the package lacked documents.” A refused PDF plus an unrelated TXT can produce this sentence.

69. **`RULESET` omits the matchers that decide verdicts.** (`#19`)
    Thresholds are hashed; `REFUTING_PATTERNS`, `DRAFT_RE`, `NEGATION_PAIRS`, `HOMOGLYPHS`, ODP keyword lists, `STRENGTH_PATTERNS` are not. A pattern-only edit does not move `ruleset_digest`.

---

## P3 — Twins, verification, process

Same fact, two implementations; suite locks the quirk; or the check is on the wrong path.

70. **Upload assessment date is UTC `toISOString().slice(0,10)`.** (`#91`, `#111`, `#92`)
    Next calendar day for much of the US in the evening. `tests/browser.mjs` **locks** that UTC value. `check.mjs` §4 only scans `demo-engine.js` and `demo-exports.js`, so the page clock is invisible.

71. **Golden and benchmark use `chunkText` on embedded text, not `parsePackage`.** (`#112–113`)
    ZIP/DOCX-only bugs cannot move the golden digest or turn `--strict` red.

72. **`ci.yml` header: everything the README claims is checked on every PR.** (`#154`)
    `check_published.mjs` (served-as-is, CSP on the wire, `/3pao.html` redirect) runs only Monday cron / `workflow_dispatch`. A broken deploy can sit until Monday.

73. **`pages.mjs` loads `/404.html` (has CSP), not an unmatched path.** (`#155`, `#141`)
    Unmatched Netlify routes get `/*` and **no CSP**. Documented in `_headers`; still a published hole. `/3pao` without `.html` is not redirected (`#140`); check only hits `/3pao.html`.

74. **`status-data.json` `published_at: null`; `check.mjs` requires it stay null.** (`#139`)
    Public `/status` cannot ship a real snapshot without changing the test.

75. **`.github/ISSUE_TEMPLATE/config.yml` `blank_issues_enabled: true`.** (`#165`)
    Security is a mailto contact link, not a gate. A visitor can still open a public issue with a crafted-document recipe.

76. **Clipboard copies `[kind] meta` only.** (`#129`)
    No objective, no statement.

77. **Private vulnerability reporting is off.** (`CONTRIBUTING.md` / `SECURITY.md`)
    Email path works; the GitHub form is hypothetical.

---

## Tests that should land with the fixes (`#57–77`)

These are not extra product bugs. They are the cases that would make the twins, claims, and parsers fail a push the way the AT-1 false pass already does. **None of them exist today.**

| Test | Holds |
|---|---|
| 57 | Two-control chunk: later “AC-2 … not implemented” must not Satisfied (`#1–3`) |
| 58 | Own-control weak + neighbor section/version/date → 3a still fails (`#8`) |
| 59 | Own-control no role keyword + neighbor ISSO → role ODP still fails (`#9`) |
| 60 | Untyped ODP + non-empty irrelevant evidence → Gate 4 does not pass *or* copy does not say “resolved” (`#10`) |
| 61 | `[Selection …]` included in 60 (`#11`) |
| 62 | One-term subject, furniture-only evidence → must not Satisfied (`#4–6`) |
| 63 | Eight tagged zero-score chunks + one untagged answering paragraph stays in `topK` (`#7`) |
| 64 | Uppercase homoglyph draft marker (`#13–14`) |
| 65 | Stale `review_date` + later untyped date → 6a if you close (`#16`) |
| 66 | Open-finding SLA month-name vs ISO → same verdict (`#18`) |
| 67 | Receipt round-trip after `system_name` / file lists (`#22`, `#31`) |
| 68 | OSCAL after OTS→SAT: no open `related-risks` on a satisfied target (`#23`) |
| 69 | OSCAL after SAT→OTS: a risk exists (`#24`) |
| 70 | CSV `' =HYPERLINK'`, `'\n=cmd'`, `'\uFEFF=1+1'` prefixed (`#26–29`) |
| 71 | ZIP `__MACOSX/._ssp.txt`: inventory and corpus agree (`#32–33`) |
| 72 | ZIP comment contains fake EOCD (`#20`) |
| 73 | Flipped CRC refused, not parsed (`#21`) |
| 74 | Filter to ≤40 rows: examine / revise still present (`#34–35`) |
| 75 | Upload + §02: no 3PAO SAT, no invented counts (`#37–41`) |
| 76 | `idleCopy` for §02–§09 does not say the engine ran (`#42`) |
| 77 | `log()` filename with `<img onerror=…>` not HTML (`#46–56`) |

**Add to that list (from later passes, no original 57–77 number):** `"AC-2(1) is not implemented"` OTS on `AC-2(1)`; ZWSP / entity refutation; PE-2-only text must not Satisfied AC-1; catalog `o` consulted or Gate 4 copy changed; `review_required` present in OSCAL/CSV/receipt; POA&M excludes NR.

---

## Suggested PR cut

**PR 1 — already wrong for a visitor (moves golden if 1–2/78 change verdicts)**
- `matchAll` every refutation pattern (engine + index).
- Score gates 3a and 4 on `ownEvidence || evidenceText`.
- Fix enhancement ID boundaries (`#78–82`).
- Strip Cf / soft hyphen; decode XML entities in `docxText` / XML parse.
- Hash the receipt after `system_name` / files lists, or stop attaching those keys to the digested object.
- Delete synthesized 3PAO/ConMon numbers; §02–§09 stay on authored samples.
- `engEsc` (or `textContent`) on every walkthrough `log()` payload and at the painter/cite sink.
- Stop saying OSCAL POA&M / “skip controls that pass” / “3PAO UI” on this origin.
- Put `review_required` on exports.

**PR 2 — twins CI cannot see today**
- One ZIP read / one skip list; CRC and EOCD comment check; one findings painter.
- Uppercase homoglyph fold + case-fold; `csvSafe` after BOM/whitespace; stop boosting BM25 score 0.
- OSCAL risks from effective status; POA&M excludes NR; 25→29 column string.

**PR 3 — product calls, not silent patches**
- Fail untyped ODPs and `[Selection …]`, or stop calling Gate 4 “resolved.”
- Fail 6a with no dates / stale typed dates, or stop calling it currency.
- Consult catalog `o`, or stop implying FedRAMP parameter values are checked.
- Put pattern sources in `RULESET`. Rewrite §02–§09 idle copy. Expand `BANNED`.

---

## Numbering notes

Canonical sequence is **1–77** (56 product items + 21 proposed tests), then gaps **78–93**, then **94–113**, then later passes **114–166**. An early merged 1–32 list used different numbers for the same defects and was replaced by 1–77; do not mix those numbers with this file.

Aliases (same defect, later ID): `#117`=`#18`, `#118`=`#85`, `#121`=`#30`, `#125`=`#26–28`, `#127`=`#35`, `#128`=`#90`, `#142`=`#84`, `#143`=`#83`, `#144`=`#106`, `#152`=`#104`, `#158`=`#7`, `#166`=`#89`, `#91`=`#111`, `#88`=`#110`.
