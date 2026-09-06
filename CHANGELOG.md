# CHANGELOG.md

# Changelog — 2026-09-06

## Added

- Unified Document Submission by Document Number
- Central normalization/type resolver
- Isolated Pre-check Workflow DB with 10 logical tables
- Draft autosave and revision/version control
- Secure opaque `UploadSessionId` resumable chunk upload
- Upload progress/retry/resume/refresh recovery
- Officer/Admin server-side roles via `PC_Access`
- Officer dashboard, filters, pagination and short cache
- Dynamic checklist templates, items, quick comments, clone/publish/retire
- Review logical lease + ScriptLock critical sections
- Review JSON autosave + response materialization on completion
- Keyboard review shortcuts and responsive PDF/checklist UI
- Structured-data correction whitelist + audit
- FIX-first revision UX
- Write-ahead Final Commit with `CommitId`/`CommitStep`
- ReportSubmit provenance AA:AF safe migration
- Notification queue/retry/backoff
- Append-only audit with CorrelationId
- Daily workflow DB backup/retention
- Stale upload/review/commit/mail/orphan reconciliation
- Feature flags / shadow / pilot / rollback
- Health check and setup facades

## Changed

- Existing document-number normalization delegates to hardened central normalizer
- Existing upload public compatibility functions no longer expose/trust Google resumable URL or arbitrary FileId
- Existing `saveReport()` re-resolves trusted master state and blocks REPORT_ACTIVITY only when server Feature Flag says enforcement applies
- Existing navigation adds unified submit / My Documents / Officer/Admin entries
- User identity display is loaded from server context instead of URL parameter
- Manifest adds `script.send_mail` and `script.scriptapp` scopes required by implemented services

## Preserved

- Registration workflow
- Login/session architecture
- NON_COMPLETED_MEMO workflow
- OTHER_DOCUMENT workflow
- Legacy report workflow in Shadow/non-enforced scope
- Existing production sheet names and B:Z final mapping
- Existing final folder mapping
- Original public GAS functions
- Existing deployment executeAs/access configuration

## Migration

- New Workflow spreadsheet/folders created separately
- `ReportSubmit!AA:AF` added only after exact header/data conflict checks and a Production spreadsheet backup
- No historical duplicate cleanup is run automatically

## Compatibility

- Existing client public function names preserved
- Existing report/memo pages can continue using compatibility upload wrappers
- Feature flags can return REPORT_ACTIVITY to legacy flow without deleting Pre-check data
