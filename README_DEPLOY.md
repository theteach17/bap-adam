# Navigation + Cache Hardening v2

Replace these four files together:
- SharedScripts.html
- SubmitDocument.html
- PrecheckReview.html
- DocumentRepository.gs

Then:
1. Push to branch commit-gs-v2.
2. Pull into Apps Script.
3. Deploy the same Web App as a New version.
4. Run verifyPrecheckInstallation().
5. Continue the existing บง 035/2569 revision test as V2.

No schema migration is required.
Do not run setup/migration again.
Do not use manual commit for the บง 035/2569 Auto Commit Trigger Gate.
