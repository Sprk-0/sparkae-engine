# Security policy

This repository holds a browser-only reference build and a static site. It
makes no network requests beyond loading its own same-origin files, and it
stores nothing outside the page. The classes of concern are therefore:

- a crafted document that produces a wrong verdict (evasion of a gate —
  homoglyphs, keyword stuffing, hidden refutations, future-dated claims);
- a document that breaks the parsers or the export builders, or that makes
  a parse failure look like evidence;
- CSV or OSCAL output that would be unsafe to open elsewhere (formula
  injection, malformed JSON);
- any published file that reaches a third-party origin, or a header rule
  that weakens the Content-Security-Policy.

Known limits of this build (not vulnerabilities, but worth knowing before
you rely on a verdict): retrieval is lexical, contradiction and draft
detection are pattern-based, the evidence-support score is not calibrated
against independently labelled assessments, and the defensibility score is an
internal rubric. Uploads are processed in memory in your browser; very large
packages are limited by the browser, not by this code.

## Dependencies

The runtime has none: `demo-engine.js`, `demo-exports.js` and the pages load
no third-party script, stylesheet or font from another origin, and the
conformance suite (`tests/check.mjs`) fails if one appears. The only
dependencies are development-time and pinned in `.github/workflows/ci.yml`:
Playwright (headless Chromium for `tests/browser.mjs`), and `jsonschema` +
`regex` for the OSCAL schema check. There is nothing else to inventory.

## Reporting

Report anything in those classes — or anything else — privately by email to
the contact address on the site (the same address is in every page footer).
Where GitHub's **Security → Report a vulnerability** form is enabled on this
repository you may use it instead; the email path always works. Please do not
open a public issue for a security report. We acknowledge within two business
days.
