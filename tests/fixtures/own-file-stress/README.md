# own-file-stress fixture

A synthetic security package for `tests/own-file-stress.mjs`, which uploads it
through the demo's real file input, runs §01 Examine on it, and asserts that
the package was read and that nothing left the page.

**Everything in it is fictional.** "Harborline Example Systems LLC" and the
"Lanternwick Ledger" do not exist; hosts are under `example.invalid`; CVE ids
are `CVE-2099-*`. It is marked EXAMPLE in every member and is not CUI.

| File | What it is |
|---|---|
| `own-file-stress.zip` | the committed archive the harness uploads (4,881 bytes, 4 members) |
| `src/README-EXAMPLE.txt` | member: the fictional-notice text file |
| `src/Harborline-EXAMPLE-SSP-excerpt.docx.txt` | member source: one paragraph per line, wrapped into `word/document.xml` of a DOCX by `build.mjs` |
| `src/oscal/Harborline-EXAMPLE-ssp-oscal.json` | member: an OSCAL `system-security-plan` stub (two implemented requirements) |
| `src/scans/Harborline-EXAMPLE-nessus-export.csv` | member: a four-row scanner export (1 Critical / 1 High / 1 Medium / 1 Low) |
| `build.mjs` | rebuilds the ZIP from `src/`, deterministically (zero timestamps, fixed order) |

Rebuild after editing a source: `node tests/fixtures/own-file-stress/build.mjs`.
The harness rebuilds the archive itself and fails if the committed bytes differ,
so the ZIP a reader opens is the ZIP the check uploaded.

Every member carries the string `OWNFILE-CANARY-3f9c7a1e`; the harness checks
that no request URL or text body carries it (see the caveat in the harness
header about multipart bodies).
