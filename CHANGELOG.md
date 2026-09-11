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
