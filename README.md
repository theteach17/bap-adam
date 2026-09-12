# Project Adam KPI Satellite v1.1.1 — Diagnostics Hotfix

Replace the five `.gs/.html` files in the existing KPI Satellite project with the files in this package. `appsscript.json` is included for verification; if your current manifest already matches, no change is required.

Then Save and run `runKpiHealthCheck()` once. The Execution log must now show one line per check using `[KPI HEALTH MANUAL] PASS ...` or `[KPI HEALTH MANUAL] FAIL ...`.

This hotfix does not change KPI formulas, DB schema, triggers, or Project Adam Main Patch.
