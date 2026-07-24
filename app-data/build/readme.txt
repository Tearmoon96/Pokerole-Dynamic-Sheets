MAINTENANCE ONLY — not needed to use the apps.

This folder holds the source dataset (v2.0/, v3.0/, Homebrew/) and the Python
scripts that compile it into the ../*-db.js bundles the apps load, plus DDL.md
(data reference) and scratch/ (assorted helper scripts).

The build scripts (scripts/build_*.py) were written for the OLD flat layout:
they compute REPO_ROOT as the parent of scripts/ and expect v3.0/, Homebrew/,
images/ and the output *-db.js beside it. After this reorg those paths differ
(images live in ../images, the bundles belong in ../). If you ever regenerate
the bundles, adjust REPO_ROOT / the image + output paths in the scripts first.
