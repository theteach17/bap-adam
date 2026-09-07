# Final Navigation UX v3

Replace together:
- SharedScripts.html
- SubmitDocument.html
- PrecheckReview.html

No schema migration. No setup rerun.

Why:
Google Apps Script HTML Service uses an IFRAME sandbox. Top-level navigation is restricted to user activation, so automatic redirects after asynchronous server operations are not reliable by platform design.

Changes:
- Stop automatic redirect after successful submit/review completion.
- No navigation lock is left active after successful business actions.
- Success actions are immediately clickable.
- Review completion actions are duplicated in a sticky bottom success panel.
- Existing top success panel remains.
- Navigation fallback lock releases after 0.9 second instead of 3.5 seconds.

After deployment:
1. Run verifyPrecheckInstallation().
2. No new end-to-end document is required.
3. Smoke-test one success/action button and one header navigation button.
