# SOURCE_DIFF.md

# Source Change Impact Analysis

## Original files

| Original file | Changed? | Reason | Risk / mitigation |
|---|---:|---|---|
| `#U0e23#U0e2b#U0e31#U0e2a.gs` | Yes | Central normalizer delegation, page guards/navigation, secure upload compatibility, server enforcement guard, FileId binding/idempotency hardening | **Medium** — original public functions preserved; static contract verifies all original function names remain |
| `Index.html` | Yes | Unified menu/navigation, role-aware officer links, progress/resume and secure upload compatibility; server-authoritative user profile | **Medium** — legacy forms/functions remain; Shadow mode preserves legacy report behavior |
| `Login.html` | Minimal | User-facing system naming only | **Low** — login/session contract unchanged |
| `appsscript.json` | Yes | Add scopes required by MailApp and installable trigger management | **Low/expected** — reauthorization required; existing deployment mode preserved |
| `README.md` | Replaced | Production installation/runbook | **None runtime** |

## New backend modules

| File | Change class | Why |
|---|---|---|
| `Router.gs` | ADD | Role-aware navigation และ same-app URL allowlist |
| `AccessControlService.gs` | ADD | Principal, role, officer/admin authorization, owner/submitter permission |
| `ConfigService.gs` | ADD | Feature flags, validated config, Settings Sheet sync |
| `DocumentRepository.gs` | ADD | Master lookup, normalization, document type resolver, final-folder resolution |
| `PrecheckRepository.gs` | ADD | Workflow DB repository/batch sheet access |
| `PrecheckVersionService.gs` | ADD | Version allocation, draft/version persistence, immutability rules |
| `UploadService.gs` | ADD | Secure opaque resumable chunk upload สำหรับทุก workflow |
| `DriveService.gs` | ADD | Drive helpers, final move/rename, file validation |
| `PrecheckService.gs` | ADD | Submission draft, submit/resubmit, My Documents/detail |
| `PrecheckTemplateService.gs` | ADD | Dynamic template/items/quick comments/access admin, publish/clone/retire |
| `PrecheckReviewService.gs` | ADD | Review lease, autosave JSON, validation, materialization, correction audit |
| `PrecheckDashboardService.gs` | ADD | Officer dashboard/filter/pagination/cache/SLA |
| `PrecheckCommitService.gs` | ADD | Write-ahead CommitId, checkpoints, idempotent final commit/reconcile |
| `PrecheckNotificationService.gs` | ADD | Notification queue, email builder, retry/backoff |
| `AuditService.gs` | ADD | Append-only audit + correlation id + legacy summary log |
| `BackupService.gs` | ADD | Daily workflow DB backup + retention |
| `RecoveryService.gs` | ADD | Stale upload/lock/commit/email/orphan reconciliation |
| `HealthCheckService.gs` | ADD | Installation/health verification + trigger install/remove |
| `MigrationService.gs` | ADD | Isolated DB/folder setup, baseline template, dry-run provenance migration |
| `SetupFacade.gs` | ADD | Editor-safe public setup/config/migration/bootstrap/backup wrappers |
| `Utils.gs` | ADD | Shared validation, error handling, locks, date/escape helpers |

## New frontend modules

| File | Change class | Why |
|---|---|---|
| `SubmitDocument.html` | ADD | Unified document lookup/confirmation/pre-check draft/upload/submit |
| `MyDocuments.html` | ADD | รายการเอกสารของผู้ใช้ |
| `PrecheckDetail.html` | ADD | ผลตรวจ/FIX-first/revision detail |
| `PrecheckOfficer.html` | ADD | Officer dashboard |
| `PrecheckReview.html` | ADD | PDF/review split-tab UI, shortcuts, autosave, correction |
| `PrecheckAdmin.html` | ADD | Template/quick comments/access management |
| `PrecheckSubmit.html` | ADD | Compatibility entry page redirecting to unified submission |
| `AccessDenied.html` | ADD | Access denied surface |
| `SharedStyles.html` | ADD | Shared responsive/accessibility styles |
| `SharedScripts.html` | ADD | Safe client helpers, escaping, navigation |

## MUST CHANGE / MAY CHANGE / MUST NOT CHANGE

### MUST CHANGE

- document number normalization path — required to normalize Thai digits/NBSP/full-width slash consistently
- secure upload compatibility wrapper — required to stop trusting Google session URL/FileId from Browser
- `saveReport()` guard — required so enforced REPORT_ACTIVITY cannot bypass Pre-check
- page/router authorization — required for officer/admin surfaces
- manifest scopes — required by mail/trigger features

### MAY CHANGE

- Index navigation/menu rendering for role-aware UX
- shared validation/error handling wrappers
- caching/invalidation around new lookup/dashboard

### MUST NOT CHANGE — preserved by design

- Registration business flow and public `saveData()` contract
- Existing Login/Session data model and principal source for normal users
- Existing NON_COMPLETED_MEMO business behavior
- Existing OTHER_DOCUMENT business behavior
- Existing master sheet names/mapping
- Existing final folder mappings
- Existing search/dashboard public endpoints outside the new module

## Public Contract Regression Result

Original GAS function names detected: **45**  
Missing in final package: **0**  
Duplicate final GAS function names: **0**
