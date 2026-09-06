# DELIVERY_REPORT.md

# Delivery Report

## Summary

พัฒนา Document Workflow Layer สำหรับ “รายงานผลการดำเนินกิจกรรม” ให้เชื่อมจากเลขทะเบียน → draft/version → secure chunk upload → officer review → revision → approval → idempotent final commit → email โดยยึด EXTEND, NOT REWRITE

## Existing Architecture Findings

จาก Production source และฐานจริงพบว่า:

- `ReportNo` เป็น Master และใช้ B:L สำหรับ metadata หลัก
- `ReportSubmit` เป็น final store และใช้ B:Z ตาม business mapping เดิม
- Login/Session มี data model เดิมใน `Credential`/`Sessions`
- Production มี legacy chunk/resumable architecture อยู่แล้ว แต่เดิม client-facing upload contract มี trust boundary ที่ต้อง harden
- final folders ถูก map จาก `Settings Sheet` ตาม Admin Group
- การเพิ่ม feature ใหม่สามารถทำผ่าน module ใหม่โดยไม่ย้ายฐานหลักออกจาก Google Sheets

## Files Changed

- Core Production `.gs` — compatibility/security guards + secure upload wrapper + enforced report guard
- `Index.html` — unified/role-aware navigation and secure upload integration
- `Login.html` — system naming
- `appsscript.json` — required mail/trigger scopes
- `README.md` — replaced with installation/runbook

ดูรายละเอียดใน `SOURCE_DIFF.md`

## Files Added

Modules ครบด้าน Config/Auth/Repository/Upload/Drive/Submission/Version/Review/Template/Dashboard/Commit/Notification/Audit/Backup/Recovery/Health/Migration/Setup และ frontend pages ครบตาม architecture; รายการไฟล์เต็มอยู่ใน README

## Database Changes

### Workflow DB

แยกใหม่ ไม่เก็บ Draft/Review ใน Production `ReportSubmit`:

- PC_Submissions
- PC_Versions
- PC_Reviews
- PC_ReviewResponses
- PC_Templates
- PC_TemplateItems
- PC_QuickComments
- PC_Access
- PC_Notifications
- PC_Audit

### Production

ไม่มีการเปลี่ยน B:Z; migration เพิ่มเฉพาะ AA:AF หลัง verify + backup:

- PrecheckSubmissionId
- PrecheckVersion
- CommitId
- ApprovedBy
- ApprovedAt
- SubmissionSource

## Security Decisions

- Browser ไม่เป็น authoritative source สำหรับ role/email/document type/status/version/FileId/folder/commit/approval
- Google OAuth token และ resumable session URI อยู่ server-side
- Browser ถือ opaque UploadSessionId เท่านั้น
- FileId ผูกจาก Drive response/server session
- Sensitive endpoints ตรวจ role/server state เอง
- Deep-link authorization ไม่พึ่ง menu visibility
- Review responses validate against frozen Template and Quick Comment group
- HTML ใหม่ escape untrusted content; identity displayมาจาก server
- Setup mutations require Technical Owner identity

## Performance Decisions

- 2 MB chunks
- batch Sheet I/O ใน repository/new workflows
- no long ScriptLock around network/PDF reading
- dashboard cache 90s; master cache short-lived
- autosave submitter ~5s; review ~2.5s; single in-flight + pending merge
- trigger workers process bounded batches

## Tests Performed

- Final automated local gate: 66 PASS / 0 FAIL
- JavaScript syntax for all `.gs` and inline HTML scripts
- appsscript.json validation
- duplicate/public-contract/reference/include scans
- confidential/user-facing static scans
- browser OAuth/session leak scan
- pure normalization/resolver/review-count execution with actual source functions
- design/static concurrency and partial-failure path review
- live Production spreadsheet metadata/header reads performed read-only

## Review Loops Completed

1. **Analyze** — mapped source functions, auth/session/upload/sheets/folders and live headers
2. **Plan** — isolated modules + compatibility layer; no full rewrite
3. **Implement** — complete codebase and pages
4. **Static** — fixed reference/routing/syntax and identity issues
5. **Business rules** — fixed Shadow/Pilot behavior, revision state, template lifecycle, fail-closed upload config
6. **Security** — fixed client trust, checklist injection, FileId/session exposure, deep-link/XSS concerns
7. **Concurrency** — locked notification dedupe, review lease, version/status/commit critical sections
8. **Failure paths** — resume lost response/browser interruption, idempotent finalize, commit actual-state retry, independent email failure
9. **Regression** — original 45 GAS functions preserved; legacy routes preserved under flags
10. **Final re-read** — reran full local gate after final changes; all checks pass

## Remaining Known Limitations

### Platform/runtime validation still required

Google Apps Script runtime, Drive permissions, Mail quotas and real concurrent users cannot be faithfully executed from the local packaging environment. Therefore Full Enforcement must not be enabled until `TEST_PLAN.md` Google-hosted integration + UAT/Pilot gates pass.

### Mail ambiguity

A network/response failure after MailApp actually accepted a message can be ambiguous. Mail is isolated from core commit so this cannot corrupt final data; queue state/retry minimizes risk but cannot provide exactly-once email semantics without an external idempotent mail provider.

### Legacy uploaded-file orphan

Legacy workflows upload directly to their existing final destination as required for backward compatibility. If a user uploads and abandons before the legacy save call, automated cleanup does not blind-delete that file. This intentionally favors data preservation; administrators may audit old unbound legacy files separately.

### No claim of zero bugs

No Critical/High issue is known from the completed source review, but runtime UAT/Pilot remains a release gate.

## Delivery Readiness

- Full source: complete
- Manifest: complete
- Setup functions: complete/idempotent
- Migration dry-run/apply: complete/safe-fail
- Docs: complete
- Static gate: pass
- ZIP/package cleanliness: recorded in package manifest/final packaging check
- Production Full Enforcement: requires Shadow/Pilot/UAT sign-off per migration plan
