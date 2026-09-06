# ศูนย์สารสนเทศกลาง — Pre-check Production Source Package

**Package date:** 2026-09-06  
**Platform:** Google Apps Script Web Application  
**Primary storage:** Google Sheets + Google Drive  
**Timezone:** Asia/Bangkok  
**Delivery type:** Full replacement-ready source package, designed as **EXTEND, NOT REWRITE**

## 1. เป้าหมายของ Package

Package นี้เพิ่ม Workflow สำหรับตรวจ `REPORT_ACTIVITY` ก่อนบันทึกฉบับสมบูรณ์ โดยยังคง Workflow เดิมสำหรับ `NON_COMPLETED_MEMO` และ `OTHER_DOCUMENT` และคง public server functions ของ Production เดิมไว้ทั้งหมดที่ตรวจพบจาก source package ต้นฉบับ

ผู้ใช้ทั่วไปเห็นชื่อระบบเป็น **“ศูนย์สารสนเทศกลาง”** เท่านั้น ส่วนโครงสร้างภายในแยก Workflow DB ออกจาก `ReportNo`/`ReportSubmit` Production

## 2. Installation — ลำดับที่ต้องทำ

### ขั้นที่ 0 — Backup ก่อนแตะ Production

1. Export/ดาวน์โหลด Source Code Production ปัจจุบันเก็บเป็น ZIP แยกต่างหาก
2. ทำ Copy ของ Google Sheets Production ทั้งไฟล์ และตรวจว่าสามารถเปิด Copy ได้
3. บันทึก URL/Deployment ID ของ Web App ปัจจุบัน
4. บันทึก Script Properties เดิมไว้ โดยเฉพาะ `key`
5. ห้ามลบหรือแก้ข้อมูล `ReportNo` / `ReportSubmit` ก่อน Migration

### ขั้นที่ 1 — วาง Source Code

นำไฟล์ `.gs`, `.html` และ `appsscript.json` จาก package นี้ไปแทน/เพิ่มใน Apps Script project เดิมทั้งชุด ไม่ต้องประกอบ patch แยกส่วน

> ไฟล์ Core Production เดิมถูกเก็บชื่อจาก source package ต้นฉบับเพื่อรักษาความเข้ากันได้; ชื่อไฟล์ `.gs` ไม่ใช่ public API — function names ต่างหากที่เป็น contract

### ขั้นที่ 2 — ตรวจ Production spreadsheet key

ถ้าอัปเดต **project เดิม** ปกติ Script Property `key` จะยังอยู่ ไม่ต้องรัน `initialSetup()` ซ้ำ

ถ้าเป็น project ใหม่หรือ `key` หาย ให้รัน `initialSetup()` จาก Apps Script Editor หนึ่งครั้ง จากนั้นตรวจว่า `getSpreadsheet_()` เปิดฐาน Production ได้

### ขั้นที่ 3 — Authorize scopes

รัน `setupPrecheckSystem()` ครั้งแรกเพื่อให้ Google ขอสิทธิ์ที่เพิ่มขึ้นตาม manifest หลังตรวจรายละเอียด OAuth consent แล้วจึงอนุญาต

`setupPrecheckSystem()` เป็น idempotent และทำเฉพาะ:

- สร้าง Workflow spreadsheet แยกถ้ายังไม่มี
- สร้าง Staging / Archive / Orphan / Backup folders ถ้ายังไม่มี
- สร้าง/validate `PC_*` sheets ใน Workflow DB
- Seed baseline published checklist เมื่อฐานใหม่ยังไม่มี template
- ตั้ง Feature Flags เริ่มต้นเป็น **ปิด** (`PC_ENABLED=false`, `PC_AUTO_COMMIT_ENABLED=false`, `PC_ENFORCE_REPORT_ACTIVITY=false`)

ฟังก์ชันนี้ไม่ลบ Production sheet/file และไม่เพิ่ม provenance columns ใน `ReportSubmit`

### ขั้นที่ 4 — Bootstrap Admin คนแรก

รัน:

```javascript
bootstrapPrecheckAdmin()
```

ฟังก์ชันตรวจว่า Active Workspace user เป็น Technical Owner (Active User = Effective User) แล้วเพิ่ม/อัปเดตบัญชีนั้นเป็น `PRECHECK_ADMIN` แบบ idempotent

### ขั้นที่ 5 — ตั้งค่าที่จำเป็น

`PC_MAX_FILE_MB` เป็น Mandatory Configuration และต้องมากกว่า 0 ก่อน Upload จะเปิดทำงาน  
`PC_OFFICER_GROUP_EMAIL` ต้องเป็น Google Workspace group/account ที่ได้รับ Viewer permission ใน Staging folder

วิธีตั้งค่าที่สะดวกสำหรับ Apps Script Editor:

1. เปิดชีต **Settings Sheet** ของฐาน Production
2. เพิ่ม key/value ที่ต้องการในคอลัมน์ A:B โดยใช้ชื่อ `PC_*` ตามตาราง Configuration ด้านล่าง
3. รัน `configurePrecheckSystem()` โดย **ไม่ต้องใส่ argument**
4. ระบบจะอ่านเฉพาะ key ใน whitelist, validate และ sync เข้า Script Properties; ฟังก์ชันจะไม่แก้หรือเพิ่มแถวใน Settings Sheet เอง

สำหรับ Execution API หรือการเรียกจากโค้ดที่ควบคุมโดย Technical Owner สามารถเรียก `configurePrecheckSystem(configObject)` ได้โดยตรง

### ขั้นที่ 6 — Dry Run Production migration

รัน:

```javascript
migratePrecheckSchema({dryRun:true})
```

หรือรัน `migratePrecheckSchema()` จาก Editor ซึ่ง default เป็น dry-run

ต้องยืนยันว่า:

- Header `ReportSubmit!B:Z` ตรง schema Production ที่ระบบตรวจไว้
- `AA:AF` ไม่มี Header/Data เดิม
- `conflicts` เป็นค่าว่าง

ถ้ามี conflict **หยุด** และห้ามแก้ Header/ข้อมูลเดิมอัตโนมัติ

### ขั้นที่ 7 — Apply provenance migration

หลังตรวจ Dry Run แล้ว รัน:

```javascript
applyPrecheckSchemaMigration()
```

ฟังก์ชันจะสร้าง Copy ของ Production spreadsheet ก่อนเขียน แล้วเพิ่ม/ตั้งเฉพาะท้ายตาราง `ReportSubmit!AA:AF`:

| Column | Header |
|---|---|
| AA | PrecheckSubmissionId |
| AB | PrecheckVersion |
| AC | CommitId |
| AD | ApprovedBy |
| AE | ApprovedAt |
| AF | SubmissionSource |

ไม่ Insert คอลัมน์กลางตารางและไม่ overwrite หากพบข้อมูลชน

### ขั้นที่ 8 — Install triggers

รัน:

```javascript
installPrecheckTriggers()
```

ติดตั้งแบบ idempotent:

- `precheckReconcileTrigger_` — ทุก 1 ชั่วโมง
- `createPrecheckDailyBackup_` — ทุกวันประมาณ 02:00 ตาม timezone project

ถ้าต้อง rollback trigger เฉพาะ module นี้ ใช้ `removePrecheckTriggers()`

### ขั้นที่ 9 — ทดสอบ Backup และ Health Check

รันตามลำดับ:

```javascript
runPrecheckBackupNow()
verifyPrecheckInstallation()
runPrecheckHealthCheck()
```

Health Check ต้องผ่าน Workflow DB, folders, mandatory upload config, officer access, default template, triggers, recent backup และ ReportSubmit provenance schema

### ขั้นที่ 10 — Shadow Mode

ตั้ง Feature Flags:

- `PC_ENABLED = TRUE`
- `PC_AUTO_COMMIT_ENABLED = FALSE`
- `PC_ENFORCE_REPORT_ACTIVITY = FALSE`
- `PC_ENFORCE_FROM_YEAR = 2569`

ใน Shadow mode ระบบเดิมของ Report Activity ยังทำงานตามเดิม; Pre-check พร้อมสำหรับ technical verification โดยไม่บังคับผู้ใช้ทั้งหมด

### ขั้นที่ 11 — Pilot

คง `PC_ENFORCE_REPORT_ACTIVITY = FALSE` และกำหนดอย่างน้อยหนึ่งรายการใน:

- `PC_PILOT_ADMIN_GROUPS`
- `PC_PILOT_OFFICERS`

จากนั้นจึงเปิด `PC_AUTO_COMMIT_ENABLED = TRUE` เมื่อ test data, permission, commit และ mail ผ่านใน pilot scope

### ขั้นที่ 12 — Full Rollout

หลัง UAT/Pilot ผ่านและ Technical Owner อนุมัติ:

- `PC_ENABLED = TRUE`
- `PC_AUTO_COMMIT_ENABLED = TRUE`
- `PC_ENFORCE_REPORT_ACTIVITY = TRUE`
- `PC_ENFORCE_FROM_YEAR = 2569`

จากนั้นสร้าง Apps Script deployment version ใหม่และ **แก้ deployment เดิมให้ชี้ version ใหม่** เพื่อรักษา Web App URL เดิม

## 3. Configuration

| Key | Required | Default/Rule | Purpose |
|---|---:|---|---|
| PC_ENABLED | rollout | FALSE | เปิด module |
| PC_AUTO_COMMIT_ENABLED | rollout | FALSE | อนุญาต automatic final commit |
| PC_ENFORCE_REPORT_ACTIVITY | rollout | FALSE | บังคับ REPORT_ACTIVITY เข้า Pre-check |
| PC_ENFORCE_FROM_YEAR | yes | 2569 | ปีทะเบียน พ.ศ. เริ่มบังคับ |
| PC_DB_ID | auto | created by setup | Workflow DB |
| PC_STAGING_FOLDER_ID | auto | created by setup | PDF staging |
| PC_ARCHIVE_FOLDER_ID | auto | created by setup | archive area |
| PC_ORPHAN_FOLDER_ID | auto | created by setup | orphan quarantine |
| PC_BACKUP_FOLDER_ID | auto | created by setup | backup destination |
| PC_OFFICER_GROUP_EMAIL | **yes** | none | Viewer principal สำหรับ Staging |
| PC_MAX_FILE_MB | **yes** | none | Maximum PDF size; upload fail-closed until configured |
| PC_CHUNK_SIZE_BYTES | yes | 2097152 | 2 MB chunk |
| PC_REVIEW_LOCK_MINUTES | yes | 15 | logical review lease |
| PC_DEFAULT_TEMPLATE_ID | auto | seeded by setup | frozen template selection |
| PC_RECONCILE_ENABLED | yes | TRUE | hourly recovery |
| PC_COMMIT_MAX_AUTO_RETRY | yes | 5 | commit retry ceiling |
| PC_COMMIT_ALERT_AFTER_MINUTES | yes | 30 | stale commit threshold |
| PC_DASHBOARD_PAGE_SIZE | yes | 25 | dashboard page size |
| PC_BACKUP_RETENTION_DAYS | yes | 30 | backup retention |
| PC_UPLOAD_EXPIRE_MINUTES | yes | 30 | upload inactivity expiry |
| PC_PILOT_ADMIN_GROUPS | optional | empty | pilot document scope |
| PC_PILOT_OFFICERS | optional | empty | pilot reviewer scope |
| PC_SLA_ENABLED | optional | FALSE | SLA UI/logic |
| PC_SLA_WORKING_DAYS | optional | 5 | SLA days |
| PC_SLA_WARNING_DAY | optional | 4 | warning threshold |

## 4. Google Sheets

### Production DB — preserved

- `ReportNo` remains Master Registration
- `ReportSubmit` remains Final data store
- `Credential`, `Sessions`, `Settings Sheet`, `Logfile`, `Dropdown`, `LinkBAP` และส่วนเดิมยังคงใช้

Production mapping ที่ตรวจจากฐานจริงก่อนพัฒนา:

- `ReportNo`: B Document Number, C Document Name, D Admin Group, E Work Group, F Responsible, G Memo Link, H Final Link, I Project, J Owner Email, K Activity Code, L Activity Name
- `ReportSubmit`: B:Z Existing final schema; provenance เพิ่มท้าย AA:AF เท่านั้น

### Workflow DB — isolated

สร้างอย่างน้อย:

- `PC_Submissions`
- `PC_Versions`
- `PC_Reviews`
- `PC_ReviewResponses`
- `PC_Templates`
- `PC_TemplateItems`
- `PC_QuickComments`
- `PC_Access`
- `PC_Notifications`
- `PC_Audit`

Header ถูก validate แบบ exact match; setup จะไม่ overwrite schema ที่ conflict

## 5. Google Drive

`REPORT_ACTIVITY` ทุก version upload เข้า Staging ก่อน และ Final Commit ใช้ FileId เดิมย้ายเข้า existing final folder ตามกลุ่มบริหาร

`NON_COMPLETED_MEMO` / `OTHER_DOCUMENT` ยังคงปลายทางเดิม แต่ใช้ shared hardened chunk upload

Staging folder ต้องมี Viewer permission สำหรับเจ้าหน้าที่ผ่าน `PC_OFFICER_GROUP_EMAIL` หรือ permission policy ที่องค์กรกำหนด

## 6. OAuth Scopes

`appsscript.json` ใช้ scopes ต่อไปนี้:

| Scope | เหตุผล |
|---|---|
| `https://www.googleapis.com/auth/spreadsheets` | อ่าน/เขียน Production และ Workflow Sheets |
| `https://www.googleapis.com/auth/script.external_request` | Google Drive resumable upload ผ่าน UrlFetchApp |
| `https://www.googleapis.com/auth/drive` | สร้าง/ย้าย/สำรอง/ตรวจไฟล์และโฟลเดอร์ |
| `https://www.googleapis.com/auth/script.send_mail` | ส่ง Notification ด้วย MailApp |
| `https://www.googleapis.com/auth/script.scriptapp` | สร้าง/ลบ installable triggers |

Advanced Sheets API v4 เดิมยังคง enable ตาม manifest Production

## 7. Deployment

รักษา deployment architecture เดิม:

- Execute as: `USER_DEPLOYING`
- Access: `DOMAIN`

หลัง source update ให้สร้าง Version ใหม่ แล้วแก้ Existing Deployment ให้ใช้ Version ใหม่นั้นเพื่อรักษา URL เดิม

ห้ามเปลี่ยนเป็น Execute-as-user ใน release นี้โดยไม่มีการศึกษาสิทธิ์/ownership แยก

## 8. Trigger Setup

`installPrecheckTriggers()` ลบ/สร้างใหม่เฉพาะ trigger handlers ของ module นี้ จึงไม่แตะ trigger อื่นของระบบเดิม

Recovery trigger จัดการ:

- stale upload โดย query actual Drive state ก่อนเปลี่ยนสถานะ
- expired review locks
- pending/failed/stale commits
- mail queue retries
- orphan staging files โดย move ไป Orphan area ไม่ blind delete

## 9. Verification ก่อนเปิดจริง

ขั้นต่ำให้ตรวจ:

1. `verifyPrecheckInstallation().success`
2. `runPrecheckHealthCheck().success`
3. Small PDF + multi-chunk PDF
4. Interrupt/resume upload
5. V1 FIX → V2 resubmit
6. Concurrent officer read-only/lock behavior
7. NOTE only approval
8. FIX blocks approval
9. Final commit normal + retry
10. ReportNo final-link conflict
11. Mail retry
12. NON_COMPLETED_MEMO regression
13. OTHER_DOCUMENT regression
14. Registration/Login/Search regression
15. Desktop + Mobile UAT

รายละเอียดทั้งหมดอยู่ใน `TEST_PLAN.md`

## 10. Rollback

Rollback ที่เร็วที่สุดโดยไม่ลบ Pre-check data:

1. ตั้ง `PC_ENFORCE_REPORT_ACTIVITY = FALSE`
2. ตั้ง `PC_AUTO_COMMIT_ENABLED = FALSE`
3. หากต้องหยุด module UI เพิ่ม ให้ตั้ง `PC_ENABLED = FALSE`
4. Redeploy version เดิมของ Apps Script หากจำเป็น
5. **ห้ามลบ Workflow DB, versions, audit หรือ provenance rows เพื่อ rollback**

ดูขั้นตอนเต็มใน `MIGRATION.md`

## 11. Known Google Apps Script Limitations

- Apps Script มี **execution time limit 6 นาทีต่อ execution** สำหรับ execution ปกติ; การออกแบบนี้จึงไม่ถือ Script Lock ระหว่าง Drive/network operation ยาว และ worker จำกัด batch
- Services มี daily/user quotas; Mail quota หรือ UrlFetch quota อาจทำให้ notification/operation retry ภายหลัง
- `CacheService` เป็น best-effort และไม่ใช้เป็น source of truth สำหรับ critical state
- `LockService` เหมาะกับ critical section สั้น ๆ; logical review lock จึงเก็บใน DB แยก
- `google.script.run` เป็น asynchronous และ client จำกัด **10 concurrent calls**; UI จึงใช้ debounce + single in-flight request + pending merge
- Drive permission เป็นคนละชั้นกับ application role; Officer ที่มี role แต่ไม่มี Viewer permission อาจเปิด PDF ไม่ได้
- Cold start อาจทำให้ request แรกช้ากว่า warm request; UI แสดง loading/skeleton/progress แทน silent operation
- MailApp ส่งแล้วแต่ response หายเป็น inherently ambiguous side effect; worker ใช้ claim/state และไม่ rollback core transaction

## 12. Files

| File | Responsibility |
|---|---|
| `#U0e23#U0e2b#U0e31#U0e2a.gs` | Core Production เดิม + compatibility/security wrappers; คง public contract เดิม |
| `Router.gs` | Role-aware navigation และ same-app URL allowlist |
| `AccessControlService.gs` | Principal, role, officer/admin authorization, owner/submitter permission |
| `ConfigService.gs` | Feature flags, validated config, Settings Sheet sync |
| `DocumentRepository.gs` | Master lookup, normalization, document type resolver, final-folder resolution |
| `PrecheckRepository.gs` | Workflow DB repository/batch sheet access |
| `PrecheckVersionService.gs` | Version allocation, draft/version persistence, immutability rules |
| `UploadService.gs` | Secure opaque resumable chunk upload สำหรับทุก workflow |
| `DriveService.gs` | Drive helpers, final move/rename, file validation |
| `PrecheckService.gs` | Submission draft, submit/resubmit, My Documents/detail |
| `PrecheckTemplateService.gs` | Dynamic template/items/quick comments/access admin, publish/clone/retire |
| `PrecheckReviewService.gs` | Review lease, autosave JSON, validation, materialization, correction audit |
| `PrecheckDashboardService.gs` | Officer dashboard/filter/pagination/cache/SLA |
| `PrecheckCommitService.gs` | Write-ahead CommitId, checkpoints, idempotent final commit/reconcile |
| `PrecheckNotificationService.gs` | Notification queue, email builder, retry/backoff |
| `AuditService.gs` | Append-only audit + correlation id + legacy summary log |
| `BackupService.gs` | Daily workflow DB backup + retention |
| `RecoveryService.gs` | Stale upload/lock/commit/email/orphan reconciliation |
| `HealthCheckService.gs` | Installation/health verification + trigger install/remove |
| `MigrationService.gs` | Isolated DB/folder setup, baseline template, dry-run provenance migration |
| `SetupFacade.gs` | Editor-safe public setup/config/migration/bootstrap/backup wrappers |
| `Utils.gs` | Shared validation, error handling, locks, date/escape helpers |
| `Index.html` | Production UI เดิม + unified navigation/secure legacy upload compatibility |
| `Login.html` | Login UI เดิม โดย user-facing title เป็นศูนย์สารสนเทศกลาง |
| `SubmitDocument.html` | Unified document lookup/confirmation/pre-check draft/upload/submit |
| `MyDocuments.html` | รายการเอกสารของผู้ใช้ |
| `PrecheckDetail.html` | ผลตรวจ/FIX-first/revision detail |
| `PrecheckOfficer.html` | Officer dashboard |
| `PrecheckReview.html` | PDF/review split-tab UI, shortcuts, autosave, correction |
| `PrecheckAdmin.html` | Template/quick comments/access management |
| `PrecheckSubmit.html` | Compatibility entry page redirecting to unified submission |
| `AccessDenied.html` | Access denied surface |
| `SharedStyles.html` | Shared responsive/accessibility styles |
| `SharedScripts.html` | Safe client helpers, escaping, navigation |
| `appsscript.json` | V8 manifest, minimal scopes required by current code |


เอกสารส่งมอบเพิ่มเติม:

- `MIGRATION.md`
- `TEST_PLAN.md`
- `TRACEABILITY.md`
- `SOURCE_DIFF.md`
- `CHANGELOG.md`
- `DELIVERY_REPORT.md`
- `VERIFICATION_RESULTS.md`
- `PACKAGE_VALIDATION.md`
- `PACKAGE_MANIFEST.sha256`

## 13. Pre-delivery Verification

Final local verification gate ตรวจ 66 checks และผลล่าสุด **66 PASS / 0 FAIL** ครอบคลุม syntax, manifest, duplicate function, original function preservation, client/server references, private endpoint exposure, includes, user-facing codename leakage, browser OAuth/session leakage, required scopes, chunk architecture, locks, commit checkpoints, provenance migration และ pure business-function checks

การตรวจ local นี้ไม่แทน Google-hosted integration/UAT; package จึงบังคับ Shadow → Pilot → Full rollout ใน `MIGRATION.md`
