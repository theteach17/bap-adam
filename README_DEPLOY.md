# Navigation Toast Cleanup v3.1

Replace only:
- SharedScripts.html

Purpose:
- Remove the misleading fallback toast that says to click again even when navigation already succeeded.
- Keep automatic navigation-lock release after 0.9 second.
- Keep real navigation errors visible through showError().
- No schema, workflow, commit, trigger, or configuration changes.

After deployment:
1. Deploy as a new Web App version.
2. Run verifyPrecheckInstallation().
3. Smoke-test Home / My Documents / Officer Queue once.
