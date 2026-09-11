# Deployment Status — 11 September 2026

สถานะการเตรียม Production สำหรับ Project Adam Officer Notification Worker v1.0.0

## ดำเนินการแล้ว

- ตรวจฐานข้อมูล Production `Central Information Pre-check DB` และ schema ที่ worker ต้องใช้
- ตรวจรายชื่อผู้รับจาก `PC_Access` แบบ dynamic โดยไม่ hard-code รายชื่อใน source code
- ตรวจ event source จริงจาก `PC_Notifications`: `SUBMISSION_RECEIVED` และ `REVISION_SUBMITTED`
- สร้างชีต `PC_OfficerAlerts` ในฐาน Production แล้ว พร้อม header 30 คอลัมน์, freeze แถวหัวตาราง และรูปแบบสำหรับ audit queue
- สร้าง source package, manifest, README, diagnostics, retry/dedup logic และ local smoke tests
- ตรวจ syntax ของไฟล์ `.gs` และผ่าน automated smoke-test 12 กลุ่ม

## ขั้นตอนที่ต้องทำภายใต้บัญชี budgetservice@g.klaeng.ac.th

สภาพแวดล้อมที่สร้างชุดนี้ไม่มีสิทธิ์สร้าง/authorize Google Apps Script project ในนามบัญชี Workspace ดังกล่าวโดยตรง ดังนั้นขั้นตอนบัญชีต่อไปนี้ต้องทำใน Apps Script Editor ของบัญชี `budgetservice@g.klaeng.ac.th`:

1. สร้าง Standalone Apps Script project และวางไฟล์จาก ZIP
2. ใช้ `appsscript.json` ที่ให้มา
3. Run `setupOfficerNotificationWorker()` และอนุมัติ OAuth
4. Run `runOfficerNotificationHealthCheck()` ให้ `ok: true`
5. Run `sendOfficerNotificationTestEmail()` แล้วตรวจ mailbox
6. ทำ controlled Production test ด้วยรายงานใหม่ 1 รายการและฉบับแก้ไข 1 รายการ

ห้ามสร้าง trigger จากบัญชีอื่น เพราะ worker มี fail-closed runner check และต้องทำงานเป็น `budgetservice@g.klaeng.ac.th` เท่านั้น
