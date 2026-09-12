# Root cause v1.2.2 — Dashboard-ready relay

Observed production behavior:
- Main stages 1–4 succeed.
- Secure Handoff is accepted and PC_Access authorization succeeds.
- Main times out at stage 5 with SATELLITE_DASHBOARD_TIMEOUT.

Root cause:
`KpiSatellite.html` v1.2.1 correctly relays READY/AUTH_OK through the Apps Script nested-frame ancestor chain, but `KpiAdminWidget.html` still used `window.parent.postMessage(...)` for STAGE, DASHBOARD_READY and REQUEST_CLOSE. In Apps Script HtmlService, `window.parent` is the Google wrapper frame, not Project Adam Main. Therefore stage 5 could finish inside Satellite while Main never received DASHBOARD_READY. Dashboard RPC/render failures were also invisible to Main for the same reason.

Fix:
- Expose the already-bounded Satellite ancestor relay as `window.kpiSatelliteRelay_`.
- Route dashboard STAGE, DASHBOARD_READY and REQUEST_CLOSE through that relay.
- Add a bounded fallback relay for mixed deployments.
- Wrap `renderAll()` so render errors are reported immediately as DASHBOARD_RENDER_ERROR.
- Report RPC/data failures immediately as DASHBOARD_DATA_ERROR.

No change to:
- KPI formulas or source data.
- Script Properties / handoff secret.
- PC_Access authorization.
- Main Project Adam workflow.
- Trigger cadence.
- Production database schema.
