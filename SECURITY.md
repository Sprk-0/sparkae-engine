# Security policy

This repository holds a browser-only reference build. It makes no network
requests and stores nothing outside the page, so the main classes of concern
are: a crafted document that produces a wrong verdict, a document that breaks
the export builders, or CSV/OSCAL output that would be unsafe to open elsewhere
(formula injection, malformed JSON).

Report those, or anything else, privately through GitHub's **Security →
Report a vulnerability** form on this repository. Please do not open a public
issue for a security report. We acknowledge within two business days.
