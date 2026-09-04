#!/usr/bin/env python3
"""Validate the OSCAL Assessment Results the reference build emits against the
official NIST OSCAL 1.1.2 assessment-results JSON Schema vendored in
tests/schema/.

Run ``node tests/check.mjs`` first: it writes the document this validates to
tests/out/sample-ar.json. Needs ``pip install jsonschema regex`` — ``regex``
because the NIST schemas use ``\p{L}`` / ``\p{N}`` Unicode-property patterns
that the standard library's ``re`` cannot compile.
"""

from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
SCHEMA = HERE / "schema" / "oscal_assessment-results_schema.json"
DOC = HERE / "out" / "sample-ar.json"


def main() -> int:
    try:
        import jsonschema
    except ImportError:  # pragma: no cover
        print("pip install jsonschema", file=sys.stderr)
        return 2
    if not DOC.exists():
        print(f"{DOC} missing — run `node tests/check.mjs` first", file=sys.stderr)
        return 2
    try:
        import regex
    except ImportError:  # pragma: no cover
        print(
            "pip install regex  (the NIST schemas use \\p{L} Unicode-property patterns)",
            file=sys.stderr,
        )
        return 2
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    doc = json.loads(DOC.read_text(encoding="utf-8"))
    validator_cls = jsonschema.validators.validator_for(schema)

    # The NIST schemas constrain their datatypes with ECMA-262-flavour
    # ``\p{L}`` / ``\p{N}`` patterns that the stdlib ``re`` module cannot
    # compile. Re-implement the "pattern" keyword on the ``regex`` package,
    # exactly as the product's own validator does.
    def _pattern(validator, patrn, instance, _schema):
        if validator.is_type(instance, "string") and not regex.search(patrn, instance):
            yield jsonschema.exceptions.ValidationError(f"{instance!r} does not match {patrn!r}")

    validator = jsonschema.validators.extend(validator_cls, {"pattern": _pattern})(
        schema, format_checker=jsonschema.FormatChecker()
    )
    errors = sorted(validator.iter_errors(doc), key=lambda e: [str(p) for p in e.absolute_path])
    for err in errors[:25]:
        loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
        print(f"  FAIL {loc}: {err.message[:200]}")
    if errors:
        print(f"{len(errors)} schema error(s)")
        return 1
    findings = len(doc["assessment-results"]["results"][0].get("findings", []))
    print(f"  ok   OSCAL 1.1.2 assessment-results schema: valid ({findings} findings)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
