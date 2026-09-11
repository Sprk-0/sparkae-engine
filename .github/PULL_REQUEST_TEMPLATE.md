## What changed

## Why it belongs on sparkae.ai

This repository *is* the public site. A merged change is served at
https://sparkae.ai, so copy, counts, canonical URLs, and the Apache-2.0 /
commercial boundary have to stay true of the reference build.

## Checks

- [ ] `node tests/check.mjs .`
- [ ] `python tests/check_oscal_schema.py` (needs `jsonschema` and `regex`)
- [ ] `node tests/browser.mjs .`, `node tests/assessor.mjs .`,
      `node tests/selections.mjs .` and `node tests/pages.mjs .` (needs Playwright)
- [ ] No leftover third-party origin or prior-company identity
- [ ] If a threshold, pattern, or scoring formula moved: `ENGINE_VERSION`
      bumped and the golden fixture regenerated in the same change
