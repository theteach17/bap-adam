# Install v1.2.2 hotfix

This is a Satellite-only patch. Project Adam Main v1.2.1 is wire-compatible and does not need to be changed or redeployed.

Replace in the KPI Satellite Apps Script project:
- KpiAdminWidget.html
- KpiSatellite.html
- KpiConstants.gs
- SatelliteConfig.gs
- SatelliteSecurity.gs

Then:
1. Save all files.
2. Run `runKpiHealthCheck()`; require `ok=true failed=0`.
3. Edit the existing Satellite Web App deployment -> New version -> Deploy. Keep Execute as Me (budgetservice) and the same access mode/URL.
4. Open the Satellite `/exec` directly. It should still show “Transport พร้อมใช้งาน — กรุณาเปิด Dashboard จากเมนู Project Adam”.
5. Open Project Adam and launch KPI again. Stages 1–5 should all turn green and the gate should disappear.

Do not rerun setup. Do not change the handoff secret solely for this patch.
