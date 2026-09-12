# File Manifest — Project Adam KPI Satellite v1.1.0

## Satellite Apps Script
- `KpiAdminWidget.html` — 38,553 bytes
- `KpiAggregation.gs` — 6,610 bytes
- `KpiApi.gs` — 15,450 bytes
- `KpiAssignments.gs` — 7,322 bytes
- `KpiBusinessTime.gs` — 5,539 bytes
- `KpiConstants.gs` — 7,119 bytes
- `KpiDiagnostics.gs` — 3,478 bytes
- `KpiEvents.gs` — 4,778 bytes
- `KpiJobService.gs` — 5,824 bytes
- `KpiMetrics.gs` — 17,853 bytes
- `KpiRepository.gs` — 8,667 bytes
- `KpiSatellite.html` — 4,253 bytes
- `KpiSetup.gs` — 3,945 bytes
- `KpiWeb.gs` — 451 bytes
- `SatelliteCompat.gs` — 4,276 bytes
- `SatelliteConfig.gs` — 1,211 bytes
- `SatelliteSecurity.gs` — 8,285 bytes
- `appsscript.json` — 302 bytes

## Main Project patch
- `Index.html` — 120,875 bytes
- `KpiSatelliteLauncher.gs` — 2,047 bytes
- `KpiSatelliteLauncherWidget.html` — 6,700 bytes
- `main_patch/migration_restore/PrecheckConstants.gs` — optional Release2-FInal restore copy

## Documentation
- `docs/ACCEPTANCE_TEST.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT_STATUS.md`
- `docs/INSTALLATION.md`
- `docs/LIVE_DB_STATUS.md`
- `docs/MIGRATION_FROM_V2.2.1.md`
- `docs/RISK_REVIEW.md`
- `docs/SOURCE_DIFF.md`
- `docs/TEST_REPORT.md`

## Tests
- `tests/LAST_TEST_OUTPUT.txt`
- `tests/run_all.sh`
- `tests/static_test.py`
- `tests/test_kpi_logic.js`
- `tests/test_kpi_metrics.js`
- `tests/test_security.js`

Main Production patch intentionally consists of only 2 new source files + 4 additive lines in `Index.html`. Satellite is a separate standalone project.
