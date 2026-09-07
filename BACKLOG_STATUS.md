# Pre-check Production UX & Notification Hardening — Backlog Status

Date: 2026-09-07

## Closed in this package

1. Silent loading when opening Pre-check from the main system
   - Index.html now shows a blocking loading dialog while resolving navigation URL.
   - Repeated navigation clicks are ignored until the first request finishes.

2. Silent loading inside Pre-check pages
   - SharedScripts.html now shows a delayed global activity indicator for server calls taking longer than 250 ms.
   - Covers navigation, document lookup, draft save, queue loading, review opening, upload finalization, submission, etc.

3. Draft save success was difficult to notice
   - SubmitDocument.html now uses visible saved/saving/dirty/error states.
   - Manual Save also shows a green success toast.

4. Review autosave/manual save feedback was difficult to notice
   - PrecheckReview.html now uses visible saved/saving/dirty/error states.
   - Manual Save shows a green success toast.

5. Successful submission left the form looking reusable
   - On successful submit, form controls are disabled, status becomes “ส่งตรวจเรียบร้อย”, a success notification is shown, then the page redirects to document detail.

6. Review completion success was unclear
   - A clear success panel and toast are shown.
   - Review controls are disabled after completion.
   - The system automatically returns to the officer queue.

7. Version number was not visible in the edit form
   - The form now clearly shows V1 or “ฉบับแก้ไข V2/V3…” and which prior version it continues from.

8. PR Indicator should not be displayed to users
   - The field is removed from SubmitDocument.html.
   - PrecheckVersionService.gs now ignores any browser-supplied `prIndicator`; browser is no longer authoritative for the field.
   - Database/schema is unchanged and existing internal values can still be carried forward.

9. Structured data of older versions could not be viewed in UI
   - PrecheckDetail.html adds “ดูข้อมูล Vx” for each version.
   - Shows structured report values, budget/statistics, change note, upload time and uploaded file name read-only.

10. Previous FIX context in revised reviews
    - Already delivered earlier and preserved in this package.
    - V2+ displays prior FIX page/severity/comment and supports prior-only filtering.

11. Production checklist
    - Already delivered earlier and preserved: 11 production items, published default template, old template retired.

12. Final-file public access
    - No code change. School explicitly confirmed public read access is intentional for transparency/governance.

13. Final-success notification
    - Confirmed PASS: the queued FINAL_SUCCESS email for `บง 011/2569 V2` was delivered by the existing notification worker.
    - SetupFacade.gs additionally adds `sendPendingPrecheckNotificationsNow()` for future Manual Pilot/support cases.
    - `commitSinglePendingApprovedSubmission()` now attempts notification dispatch after a successful future manual commit.
    - Mail failures do not roll back the business commit; queue retry semantics remain intact.

## Safety already installed and retained

- PC_AUTO_COMMIT_ENABLED=false is enforced in precheckReconcileTrigger_() before automatic commit reconciliation.
- Automatic commit remains disabled until explicitly enabled later.
- Existing ReportNo / ReportSubmit schemas are unchanged by this UX package.

## Before enabling enforcement

Required smoke test after deploy:
- verifyPrecheckInstallation(): failedCount must be 0.
- Main-system → Pre-check navigation must show loading feedback.
- Open an editable draft and confirm version banner + no PR Indicator.
- Open document detail and confirm “ดูข้อมูล Vx”.
- Confirm normal navigation/save/version UI behavior; no notification re-dispatch is required for the completed Pilot item.

Only after these checks pass should PC_ENFORCE_REPORT_ACTIVITY be enabled.
