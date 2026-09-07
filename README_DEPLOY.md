# Deploy this package in one pass

1. Upload/replace every file in this package on GitHub branch `commit-gs-v2`.
2. Pull the branch into the Apps Script project.
3. Deploy the existing Web App as **New version** (keep the same deployment URL/settings).
4. In Apps Script editor run `verifyPrecheckInstallation()` once. Expected: `failedCount = 0` and `autoCommitEnabled = false`.
5. Refresh the Web App and perform the combined smoke check described in BACKLOG_STATUS.md.

`sendPendingPrecheckNotificationsNow()` is included for future Manual Pilot/support cases only. Do **not** run it for `บง 011/2569`; its FINAL_SUCCESS email has already been delivered by the existing queue worker.

Do not enable `PC_ENFORCE_REPORT_ACTIVITY` or `PC_AUTO_COMMIT_ENABLED` yet. Enable enforcement only after the UX smoke check passes. Auto Commit is a later, separate activation decision.
