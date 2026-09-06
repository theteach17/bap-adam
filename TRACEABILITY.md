# TRACEABILITY.md

# Acceptance Traceability Matrix

**Legend:** `PASS — implemented/static-verified` หมายถึง implementation และ local/static contract ผ่าน; Google-hosted integration/UAT ให้รันตาม `TEST_PLAN.md` ก่อน Full Enforcement

| Requirement | Implementation | Test | Result |
|---|---|---|---|
| AC-DOC-01 | DocumentRepository.gs; SubmitDocument.html | T-DOC-01 | PASS — implemented/static-verified |
| AC-DOC-02 | DocumentRepository.gs; SubmitDocument.html | T-DOC-02 | PASS — implemented/static-verified |
| AC-DOC-03 | #U0e23…gs; UploadService.gs | T-DOC-03 / T-REG-03 | PASS — implemented/static-verified |
| AC-DOC-04 | ConfigService.gs; PrecheckService.gs; SubmitDocument.html | T-DOC-02 | PASS — implemented/static-verified |
| AC-DOC-05 | #U0e23…gs; UploadService.gs | T-DOC-04 / T-REG-04 | PASS — implemented/static-verified |
| AC-DOC-06 | DocumentRepository.gs | T-DOC-05 | PASS — implemented/static-verified |
| AC-DATA-01 | PrecheckService.gs; PrecheckRepository.gs | T-DATA-01 | PASS — implemented/static-verified |
| AC-DATA-02 | PrecheckService.gs | T-DATA-01 | PASS — implemented/static-verified |
| AC-DATA-03 | PrecheckService.gs + ScriptLock | T-DATA-02 | PASS — implemented/static-verified |
| AC-DATA-04 | PrecheckVersionService.gs | T-VER-01 | PASS — implemented/static-verified |
| AC-DATA-05 | PrecheckVersionService.gs; UploadService.gs | T-VER-01 | PASS — implemented/static-verified |
| AC-DATA-06 | PC_Versions schema; PrecheckVersionService.gs | T-VER-01 | PASS — implemented/static-verified |
| AC-UP-01 | UploadService.gs; legacy compatibility wrappers | T-UP-01 / T-UP-10 | PASS — implemented/static-verified |
| AC-UP-02 | PrecheckConstants.gs | T-UP-02 | PASS — implemented/static-verified |
| AC-UP-03 | UploadService.gs server-only token | T-SEC-03 | PASS — implemented/static-verified |
| AC-UP-04 | UploadService.gs; browser scan | T-SEC-03 | PASS — implemented/static-verified |
| AC-UP-05 | UploadService.gs | T-UP-05 | PASS — implemented/static-verified |
| AC-UP-06 | UploadService.gs finalize/binding | T-UP-09 | PASS — implemented/static-verified |
| AC-UP-07 | queryUploadProgress(); active session resume | T-UP-05 / T-UP-06 | PASS — implemented/static-verified |
| AC-UP-08 | ConfigService.gs; SubmitDocument.html; UploadService.gs | T-UP-03 | PASS — implemented/static-verified |
| AC-REV-01 | AccessControlService.gs; PrecheckReviewService.gs | T-REV-01 | PASS — implemented/static-verified |
| AC-REV-02 | LockedBy/LockUntil + ScriptLock | T-REV-02 | PASS — implemented/static-verified |
| AC-REV-03 | PrecheckReviewService.gs | T-REV-03 | PASS — implemented/static-verified |
| AC-REV-04 | ResponsesJSON single-row autosave | T-REV-03 | PASS — implemented/static-verified |
| AC-REV-05 | pcMaterializeReviewResponses_ | T-REV-05 | PASS — implemented/static-verified |
| AC-REV-06 | completeReview server validation | T-REV-05 | PASS — implemented/static-verified |
| AC-REV-07 | pcReviewCounts_/derived decision | T-REV-07 | PASS — implemented/static-verified |
| AC-REV-08 | derived decision NOTE non-blocking | T-REV-08 | PASS — implemented/static-verified |
| AC-REV-09 | CurrentVersion validation | T-REV-09 | PASS — implemented/static-verified |
| AC-VER-01 | PrecheckVersionService.gs | T-VER-01 | PASS — implemented/static-verified |
| AC-VER-02 | PrecheckService.gs one Submission/document | T-DATA-02 | PASS — implemented/static-verified |
| AC-VER-03 | PrecheckVersionService.gs submit promotion | T-VER-02 | PASS — implemented/static-verified |
| AC-VER-04 | PrecheckDetail.html; PrecheckReview.html | T-VER-03 | PASS — implemented/static-verified |
| AC-COR-01 | PrecheckReviewService.gs correction whitelist | T-REV-10 | PASS — implemented/static-verified |
| AC-COR-02 | AuditService.gs + correction metadata | T-REV-10 | PASS — implemented/static-verified |
| AC-COR-03 | PrecheckNotificationService.gs | T-NOT-01 | PASS — implemented/static-verified |
| AC-COR-04 | Correction whitelist excludes master fields | T-SEC-01 | PASS — implemented/static-verified |
| AC-COM-01 | DriveService.gs; PrecheckCommitService.gs | T-COM-01 | PASS — implemented/static-verified |
| AC-COM-02 | DriveService.gs final folder mapping | T-COM-01 | PASS — implemented/static-verified |
| AC-COM-03 | pcEnsureReportSubmitWritten_ mapping | T-COM-01 | PASS — implemented/static-verified |
| AC-COM-04 | pcEnsureMasterFinalLink_ | T-COM-01 | PASS — implemented/static-verified |
| AC-COM-05 | actual-state file verification | T-COM-04 | PASS — implemented/static-verified |
| AC-COM-06 | CommitId duplicate lookup under lock | T-COM-05 | PASS — implemented/static-verified |
| AC-COM-07 | write-ahead claim | T-COM-01 | PASS — implemented/static-verified |
| AC-COM-08 | CommitStep checkpoints | T-COM-01 | PASS — implemented/static-verified |
| AC-COM-09 | preflight/actual-state checks | T-COM-04 / T-COM-05 | PASS — implemented/static-verified |
| AC-COM-10 | master final link conflict guard | T-COM-07 | PASS — implemented/static-verified |
| AC-NOT-01 | PrecheckNotificationService.gs revision builder | T-NOT-01 | PASS — implemented/static-verified |
| AC-NOT-02 | FINAL_SUCCESS after commit DONE | T-NOT-02 | PASS — implemented/static-verified |
| AC-NOT-03 | Safe queue + independent worker | T-NOT-05 | PASS — implemented/static-verified |
| AC-NOT-04 | retry/backoff NextAttemptAt | T-NOT-03 | PASS — implemented/static-verified |
| AC-SEC-01 | DocumentRepository.gs server resolver | T-DOC-06 | PASS — implemented/static-verified |
| AC-SEC-02 | UploadService.gs server binding | T-UP-09 | PASS — implemented/static-verified |
| AC-SEC-03 | AccessControlService.gs server principal | T-SEC-01 | PASS — implemented/static-verified |
| AC-SEC-04 | Router.gs + per-endpoint authorization | T-SEC-02 | PASS — implemented/static-verified |
| AC-SEC-05 | Permission checks across sensitive endpoints | T-SEC-05 | PASS — implemented/static-verified |
| AC-CONF-01 | All HTML surfaces; PC_CONST.USER_FACING_NAME | Static codename scan | PASS — implemented/static-verified |
| AC-CONF-02 | PrecheckNotificationService.gs | Static codename scan | PASS — implemented/static-verified |
| AC-CONF-03 | Utils.gs public error handler | Static codename scan | PASS — implemented/static-verified |
| AC-CONF-04 | PC_* generic schemas | Static schema review | PASS — implemented/static-verified |
| AC-CONF-05 | PC_CONST.USER_FACING_NAME | Static surface scan | PASS — implemented/static-verified |
| AC-REL-01 | RecoveryService.gs cleanupStaleUploads_ | T-REL-01 | PASS — implemented/static-verified |
| AC-REL-02 | cleanupExpiredReviewLocks_ | T-REL-02 | PASS — implemented/static-verified |
| AC-REL-03 | reconcileOrphanFiles_ | T-REL-03 | PASS — implemented/static-verified |
| AC-REL-04 | reconcilePendingCommits_ | T-REL-04 | PASS — implemented/static-verified |
| AC-REL-05 | BackupService.gs | T-REL-05 | PASS — implemented/static-verified |
| AC-REL-06 | ConfigService.gs feature flags | T-REL-06 | PASS — implemented/static-verified |

Total Acceptance Criteria mapped: **67**

## Business Rule Coverage

| Rule | Coverage |
|---|---|
| BR-001–004 | Master lookup + central normalizer/resolver + unified submit |
| BR-005–007 | Feature-flagged 3-way workflow routing |
| BR-008 | Shared secure chunk upload for all workflows |
| BR-009–010 | Workflow DB separation + immutable versions |
| BR-011–012 | Server-derived review decision |
| BR-013–016 | Current approved version + automatic final commit + no duplicate input/upload |
| BR-017 | Server-side authorization |
| BR-018–019 | Notification as independent side effect |
| BR-020 | Master final-link conflict guard |
| BR-021 | Feature-flag rollback |
| BR-022 | User-facing surface/codename static scan |
