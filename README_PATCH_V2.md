# Pre-check Manual Commit Safety Patch v2

Replace only these 2 files in the project:
- RecoveryService.gs
- SetupFacade.gs

Changes:
- precheckReconcileTrigger_() will NOT invoke final commit when PC_AUTO_COMMIT_ENABLED=false.
- Other reconciliation work (uploads, review locks, notifications, orphan files) continues normally.
- Adds editor-only commitSinglePendingApprovedSubmission() for a controlled Pilot final commit.
- Manual commit does not turn on PC_AUTO_COMMIT_ENABLED.
- Manual commit fails closed unless exactly one eligible APPROVED_PENDING_COMMIT / APPROVED_COMMIT_FAILED submission exists.

Deployment sequence:
1. Run removePrecheckTriggers() once before updating, to eliminate the window where the old hourly trigger could commit the pending Pilot item.
2. Replace both files, Pull into Apps Script, deploy a New version.
3. Run installPrecheckTriggers() once.
4. Run verifyPrecheckInstallation(); PC_AUTO_COMMIT_ENABLED should remain false.
5. When intentionally ready for the Pilot final write, run commitSinglePendingApprovedSubmission() once.
