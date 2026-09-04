# Contributing

Bug reports and pull requests are welcome, with two constraints:

1. **Determinism is non-negotiable.** No `Date.now()`, no `Math.random()`, no
   dependence on object-key ordering in the engine or the exporters.
2. **No network.** The demo must keep working from a file:// URL with the
   network cable unplugged. Do not add CDN scripts, fonts, or fetches.

By submitting a contribution you agree it is licensed under the Apache License
2.0 that covers this repository.
