# Contributing

Bug reports and pull requests are welcome. This repository is generated from
the private product repository (see the README), so a merged change is
ported to the source and re-synced rather than committed here directly —
open the PR anyway; the diff is what gets ported.

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
before opening a PR; CI runs the same two commands. The identity checks
in `check.mjs` fail if a page's canonical, social card or OSCAL namespace
leaves sparkae.ai, or if a prior company name or domain comes back.

GitHub's About box (description, website, topics) is not a file in this
tree — set it in the repository settings so the listing names
https://sparkae.ai the way the pages do.

`node tests/check_published.mjs` is the exception to constraint 2 and the only
check here that touches the network: it asks whether the deployed site is still
this tree byte-for-byte, which no offline check can see. It is not a merge gate
— run it after a deploy, or with `--site` against a deploy preview.

Participation is governed by `CODE_OF_CONDUCT.md`. Report conduct concerns
to info@sparkae.ai, the same address as everything else here.

By submitting a contribution you agree it is licensed under the Apache
License 2.0 that covers this repository.
