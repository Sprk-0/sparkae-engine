# Contributing

Bug reports and pull requests are welcome, and they land where you send
them: this repository *is* the public site, so a merged change is what
https://sparkae.ai serves. The commercial server product is a separate
private codebase and is not changed from here.

Three constraints, all enforced by `node tests/check.mjs`:

1. **Determinism is non-negotiable.** No `Date.now()`, no argument-less
   `new Date()`, no `Math.random()`, no dependence on object-key ordering in
   the engine or the exporters. The engine takes its assessment date as an
   argument; the exporters derive identifiers and timestamps from the run's
   receipt. Change a threshold, pattern or scoring formula and bump
   `ENGINE_VERSION` in `demo-engine.js` — it is part of the reproducibility
   tuple — and regenerate the golden fixture
   (`node tests/check.mjs . --write-golden`) in the same change, saying in
   the PR why the verdict digest moved.
2. **No network.** The demo must keep working from a `file://` URL with the
   network cable unplugged. Do not add CDN scripts, fonts, workers or fetches;
   `_headers` holds every page to `connect-src 'self'`.
3. **Say only what was computed.** The §01 console and the exports report
   files parsed and refused, objectives adjudicated, gate tallies, verdicts
   and the receipt. Do not add narration that describes activity the engine
   did not perform, and keep INTERVIEW and TEST with the assessor.
4. **The public identity is sparkae.ai.** Canonical URLs, Open Graph tags,
   the social card, contact address and the OSCAL extension namespace all
   name that origin. Do not reintroduce a prior company name or a prior
   domain.

Run `node tests/check.mjs .` and `python tests/check_oscal_schema.py`
before opening a PR; CI runs the same two commands, plus
`tests/browser.mjs` and `tests/assessor.mjs` in a browser.

A fourth constraint lives in `tests/assessor.mjs`: **an assessor revision
must never move the reproducibility receipt.** The verdict digest attests
what the engine derived from the evidence, so a revision changes the
artifacts — OSCAL state, POA&M, RET, summary counts — and leaves the receipt
alone. Both determinations stay in the document. The identity checks
in `check.mjs` fail if a page's canonical, social card or OSCAL namespace
leaves sparkae.ai, or if a prior company name or domain comes back.

## Repository settings that are not files

GitHub's About box and two security settings live in repository settings, not
in this tree, so nothing here can set or check them. They have been lost once
already — the improvement register records the About box as set on 2026-09-09
and it was empty again on 2026-09-11. The intended values, so restoring them
is copy-paste rather than recall:

```text
Description  Every determination, traced to evidence. An in-browser FedRAMP
             assessment engine — open one file, no build, no server, no network.
Website      https://sparkae.ai
Topics       fedramp · oscal · nist-800-53a · compliance · security-assessment
             · grc · deterministic · static-site
```

Also in settings, and currently unset:

- **Private vulnerability reporting** is off. `SECURITY.md` names email as the
  path that always works and the form only "where enabled", so the two agree
  today — but the form is the better front door, and turning it on makes that
  sentence describe a live option rather than a hypothetical one.
- **Wiki and Projects** are enabled and empty. Either is fine; both being on
  with nothing in them is two dead tabs on the repository's front page.

`node tests/check_published.mjs` is the exception to constraint 2 and the only
check here that touches the network: it asks whether the deployed site is still
this tree byte-for-byte, which no offline check can see. It is not a merge gate
— run it after a deploy, or with `--site` against a deploy preview.

Participation is governed by `CODE_OF_CONDUCT.md`. Report conduct concerns
to info@sparkae.ai, the same address as everything else here.

By submitting a contribution you agree it is licensed under the Apache
License 2.0 that covers this repository.
