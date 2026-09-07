# Backlog status — Final UX v3

## PASS / Closed
- Production checklist 11 items
- V1 -> Revision Required -> V2 revised workflow
- Previous FIX comparison
- Bottom 'ตรวจแล้ว 11/11' counter
- Duplicate submission prevention
- Auto Commit Trigger Gate for บง 035/2569
- Commit status APPROVED_COMMITTED / COMMITTED / DONE
- CommitAttemptCount = 1
- ReportSubmit row 644 written with PrecheckVersion=2 and provenance
- ReportNo final link updated
- Final file retained same FileId and renamed to registered document number + registered document name
- FINAL_SUCCESS notification delivered by queue worker
- Self-healing UNKNOWN master cache patch installed

## Final UX decision
Automatic top-level redirect after async actions is not a reliable acceptance criterion in Apps Script HTML Service because the IFRAME sandbox permits top navigation only with user activation.

Resolution:
- explicit user-action navigation is the production behavior
- success panels are prominent and immediately clickable
- review completion provides the same navigation actions at both top and bottom
- no refresh is required
- no stale navigation lock should remain

## Remaining rollout gate
After deploying v3 and a short smoke test:
- set PC_ENFORCE_REPORT_ACTIVITY = TRUE
- run configurePrecheckSystem()
- run verifyPrecheckInstallation()
- monitor the first real production submissions
