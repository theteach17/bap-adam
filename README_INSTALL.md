# Install v1.2.1 — Nested HTMLService iframe transport fix

## Why this release exists
Production evidence showed that the Satellite page itself loaded correctly, but Main never received `READY`. This is a nested HTMLService iframe messaging issue, not a database or Google-auth failure.

## Satellite (budgetservice)
Replace:
- `KpiWeb.gs`
- `KpiSatellite.html`
- `KpiConstants.gs`
- `SatelliteConfig.gs`
- `SatelliteSecurity.gs` (message/metadata only; security behavior remains fail-closed)

Save, then run `runKpiHealthCheck()` once. Expected: `ok=true failed=0`.
Do **not** rerun setup.
Edit the existing Web App deployment -> New version. Keep:
- Execute as: Me (`budgetservice@g.klaeng.ac.th`)
- Who has access: Everyone / the current no-sign-in transport option already in use
- same deployment URL

Direct `/exec` open should now show: Transport ready / open from Project Adam, and should not wait for handoff.

## Project Adam Main
Replace:
- `KpiSatelliteLauncher.gs`
- `KpiSatelliteLauncherWidget.html`

Save and run `verifyKpiSatelliteMainBridge()`. Expected `ok=true failed=0`.
Then edit the existing Project Adam deployment -> New version.

## Acceptance
Open Project Adam as PRECHECK_ADMIN and click KPI. Expected steps 1-5 all green. No new secret, no Script Property changes, and no database migration are required.
