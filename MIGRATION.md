# MIGRATION.md

# Migration & Rollout Guide

## หลักการ

Migration นี้ออกแบบให้ **Validate before Write**, เพิ่มข้อมูลท้าย schema เท่านั้น และ rollback ด้วย Feature Flags โดยไม่ต้องลบ Workflow data

## Phase 0 — Preparation

1. Backup Source Production เป็น ZIP
2. Copy Production spreadsheet และทดสอบเปิดได้
3. บันทึก current deployment/version/URL
4. ตรวจ Script Property `key`
5. ตรวจ existing folder mappings ใน `Settings Sheet`
6. ตรวจว่า `ReportNo` และ `ReportSubmit` เปิด/อ่านได้
7. วาง source package ทั้งชุดใน project เดิม
8. Save project แต่ยังไม่เปลี่ยน Feature Flags

## Phase 0.1 — Authorization

รัน `setupPrecheckSystem()` เพื่อ authorize scopes และสร้าง isolated resources โดย flags ยังปิดทั้งหมด

หลัง setup ให้รัน `bootstrapPrecheckAdmin()`

## Phase 0.2 — Configuration

เพิ่มค่าที่องค์กรกำหนดใน `Settings Sheet` A:B แล้วรัน `configurePrecheckSystem()` แบบไม่มี argument

ค่าที่ต้องมีจริงก่อน Upload:

- `PC_MAX_FILE_MB` > 0
- `PC_OFFICER_GROUP_EMAIL` เป็น Workspace principal ที่เข้าถึง Staging ได้

ตรวจค่าที่ setup สร้างอัตโนมัติ:

- `PC_DB_ID`
- `PC_STAGING_FOLDER_ID`
- `PC_ARCHIVE_FOLDER_ID`
- `PC_ORPHAN_FOLDER_ID`
- `PC_BACKUP_FOLDER_ID`
- `PC_DEFAULT_TEMPLATE_ID`

## Phase 0.3 — Dry Run Schema

รัน `migratePrecheckSchema()`

Expected:

- `dryRun: true`
- `conflicts: []`
- `willSetHeaders`: six provenance fields หรือ `alreadyInstalled: true`

ถ้า header B:Z ไม่ตรงหรือ AA:AF มีข้อมูล ระบบต้อง throw และหยุด ไม่มี write

## Phase 0.4 — Apply Schema

รัน `applyPrecheckSchemaMigration()`

Sequence:

1. Revalidate B:Z
2. Revalidate AA:AF
3. Create Production spreadsheet backup
4. Ensure max columns >= AF
5. Set AA:AF headers
6. Re-read/verify headers

ห้ามแก้ schema ด้วยมือถ้า migration report พบ conflict; ให้หยุดและวิเคราะห์ column ใหม่ก่อน

## Phase 0.5 — Triggers / Backup / Health

รัน:

1. `installPrecheckTriggers()`
2. `runPrecheckBackupNow()`
3. `verifyPrecheckInstallation()`
4. `runPrecheckHealthCheck()`

Health Check ควรมี failedCount = 0 ก่อน Pilot

## Phase 1 — Shadow

ตั้ง:

- `PC_ENABLED=TRUE`
- `PC_AUTO_COMMIT_ENABLED=FALSE`
- `PC_ENFORCE_REPORT_ACTIVITY=FALSE`
- `PC_ENFORCE_FROM_YEAR=2569`

เป้าหมาย: Verify UI, master lookup, draft/version, officer access, PDF viewer และ recovery โดยยังไม่บังคับ legacy report path ทั้งองค์กร

ใน Shadow mode `shouldEnforcePrecheck_()` คืน false เมื่อไม่มี pilot config จึงรักษาพฤติกรรมเดิม

## Phase 2 — Pilot

กำหนด `PC_PILOT_ADMIN_GROUPS` และ/หรือ `PC_PILOT_OFFICERS` แล้วทดสอบกับข้อมูลที่ได้รับอนุญาต

เปิด `PC_AUTO_COMMIT_ENABLED=TRUE` เฉพาะเมื่อ:

- provenance schema ready
- staging/final permissions ready
- email queue ready
- report mapping verified
- conflict/retry tests ผ่าน

วัด review time, revision count, upload failure, commit failure, mail retry และ abandoned drafts

## Phase 3 — Full Enforcement

หลัง UAT/Pilot ผ่าน:

- `PC_ENABLED=TRUE`
- `PC_AUTO_COMMIT_ENABLED=TRUE`
- `PC_ENFORCE_REPORT_ACTIVITY=TRUE`
- `PC_ENFORCE_FROM_YEAR=2569`

`REPORT_ACTIVITY` ตั้งแต่ปีดังกล่าวจะถูก server-side guard ไม่ให้เข้า legacy final save

## Production Provenance Columns

| Column | Header | Write source |
|---|---|---|
| AA | PrecheckSubmissionId | SubmissionId |
| AB | PrecheckVersion | VersionNo |
| AC | CommitId | write-ahead commit key |
| AD | ApprovedBy | Officer email |
| AE | ApprovedAt | approval timestamp |
| AF | SubmissionSource | PRECHECK |

## Rollback

### Soft rollback — preferred

1. `PC_ENFORCE_REPORT_ACTIVITY=FALSE`
2. `PC_AUTO_COMMIT_ENABLED=FALSE`
3. ถ้าจำเป็น `PC_ENABLED=FALSE`
4. ตรวจ `runPrecheckHealthCheck()` และ production workflows

Workflow DB, staging data, audit, provenance และ final data **ไม่ถูกลบ**

### Code rollback

ถ้าปัญหาอยู่ที่ code ไม่ใช่ workflow flag:

1. Edit deployment กลับไป version Production ก่อนหน้า
2. คง Feature Flags ปิด
3. ห้ามลบข้อมูลเพื่อ rollback
4. เก็บ Workflow DB เพื่อ forensic/recovery

### Trigger rollback

`removePrecheckTriggers()` ลบเฉพาะ `precheckReconcileTrigger_` และ `createPrecheckDailyBackup_`

## Data Integrity Rules ระหว่าง Migration

- `ReportNo` เป็น Master เสมอ
- Draft/Review ห้ามเขียน `ReportSubmit` หรือ `ReportNo!H`
- Final link conflict ห้าม overwrite
- Existing ReportSubmit row ของเลขเอกสารเดียวกันที่ไม่ใช่ current CommitId เป็น commit preflight conflict
- Approved PDF ใช้ FileId เดิม
- Commit retry ตรวจ actual state ก่อน side effect ซ้ำ
- Email failure ไม่ rollback committed document

## Recovery หลัง Partial Failure

| Failure | Recovery |
|---|---|
| Upload response lost | `queryUploadProgress()` แล้วต่อ expected offset |
| Upload complete แต่ browser ปิดก่อน finalize | active session resume/finalize;ไม่ upload ใหม่ |
| Review autosave fail | UI เก็บ pending changes และ retry; lease ยัง validate server-side |
| File move success, Sheet fail | retry พบ FileId เดิมใน Final แล้วทำ step ถัดไป |
| ReportSubmit write success, Master fail | retry พบ CommitId แล้วไม่ append ซ้ำ |
| Master link conflict | Commit FAILED + operational alert;ไม่ overwrite |
| Email fail | committed state คงเดิม; queue retry แยก |
