# Project Adam — Officer Notification Worker v1.0.0

โมดูล Google Apps Script แบบ Standalone สำหรับส่งอีเมล HTML แจ้งเจ้าหน้าที่ Pre-check ทันทีเมื่อมี `REPORT_ACTIVITY` ใหม่หรือฉบับแก้ไขเข้าสู่คิวตรวจ โดยตั้งใจให้รันด้วยบัญชี `budgetservice@g.klaeng.ac.th` และไม่แก้ critical path ของ Project Adam เดิม

## สถาปัตยกรรม

- Source event: `Central Information Pre-check DB` → `PC_Notifications`
- Event ที่ใช้: `SUBMISSION_RECEIVED`, `REVISION_SUBMITTED`
- ตรวจซ้ำว่า `PC_Submissions.DocumentType = REPORT_ACTIVITY`
- ผู้รับ: ทุกแถวใน `PC_Access` ที่ `Active = TRUE` และ Role เป็น `PRECHECK_OFFICER` หรือ `PRECHECK_ADMIN`
- Durable queue / audit: ชีต `PC_OfficerAlerts` (setup สร้างให้อัตโนมัติ)
- Sender/trigger owner: `budgetservice@g.klaeng.ac.th`
- Trigger: time-driven ทุก 1 นาที
- ปุ่มในอีเมล: หน้า `PrecheckOfficer` ของ Production Project Adam

## ไฟล์

1. `NotificationConfig.gs` — ค่า Production และ schema
2. `NotificationCore.gs` — business rules / pure helpers
3. `NotificationRepository.gs` — อ่าน/เขียนฐานข้อมูล
4. `EmailTemplate.gs` — HTML + plain text email
5. `NotificationService.gs` — ingest queue, send, retry, stale recovery
6. `Setup.gs` — ติดตั้ง/เปิด/ปิด trigger
7. `Diagnostics.gs` — health check และ test email
8. `appsscript.json` — manifest และ OAuth scopes

## ขั้นตอนติดตั้ง (ทำด้วยบัญชี budgetservice@g.klaeng.ac.th)

1. เข้า `script.google.com` และสร้าง **Standalone Apps Script project** ใหม่ เช่น `Project Adam - Officer Notification Worker`.
2. ตรวจว่า account ที่ใช้อยู่คือ `budgetservice@g.klaeng.ac.th`.
3. สร้างไฟล์ `.gs` ตามชื่อใน ZIP แล้วคัดลอกเนื้อหาแต่ละไฟล์เข้า project. เปิด Project Settings → Show `appsscript.json` แล้วแทนที่ manifest ด้วยไฟล์ที่ให้มา.
4. Save ทุกไฟล์.
5. จาก Editor เลือกฟังก์ชัน `setupOfficerNotificationWorker` แล้ว Run หนึ่งครั้ง.
6. ยืนยัน OAuth permissions. ฟังก์ชัน setup จะ:
   - ตรวจว่ารันด้วยบัญชีที่กำหนด
   - ตรวจสิทธิ์เข้าถึง DB และ schema สำคัญ
   - ตรวจ schema `PC_OfficerAlerts`; หากยังไม่มีจะสร้างให้อัตโนมัติ (ฐาน Production ปัจจุบันเตรียมชีตนี้ไว้แล้ว)
   - ครั้งแรกเท่านั้น: ตั้ง cursor ที่ **ปลาย `PC_Notifications` ณ เวลาติดตั้ง** เพื่อไม่ยิงอีเมลย้อนหลัง
   - หากรัน setup ซ้ำ จะ **คง cursor เดิม** เพื่อไม่ข้าม event ที่เกิดระหว่างหยุดระบบ
   - ลบ trigger เก่าของ handler นี้ (ถ้ามี) และสร้าง trigger ใหม่ทุก 1 นาที
   - รัน health check ปิดท้าย
7. Run `runOfficerNotificationHealthCheck` ผลต้องได้ `ok: true`, `failedCount: 0` และ trigger = 1.
8. Run `sendOfficerNotificationTestEmail` หนึ่งครั้ง ตรวจว่า test mail มาถึง `budgetservice@g.klaeng.ac.th` และปุ่มเปิดหน้า Pre-check ได้.
9. ทดสอบ Production ด้วยรายงานทดสอบ 1 รายการ: หลังเกิด `SUBMISSION_RECEIVED` ระบบควรสร้าง jobs ตามจำนวนเจ้าหน้าที่ Active และส่งแต่ละคน 1 ฉบับภายในรอบ trigger ถัดไป.

> **ไม่ต้อง Deploy เป็น Web App** สำหรับ worker นี้ เพราะไม่มีหน้าเว็บและไม่รับ request จากภายนอก ใช้ installable time-driven trigger เท่านั้น

## OAuth scopes ที่ต้องใช้

- `https://www.googleapis.com/auth/spreadsheets` — อ่าน `PC_*` และเขียน `PC_OfficerAlerts`
- `https://www.googleapis.com/auth/script.send_mail` — ส่งอีเมลด้วย MailApp
- `https://www.googleapis.com/auth/script.scriptapp` — สร้าง/ลบ installable trigger
- `https://www.googleapis.com/auth/userinfo.email` — ตรวจบัญชี effective user เพื่อป้องกันติดตั้งผิดบัญชี

## Trigger

- Handler: `processOfficerNotifications`
- Type: Time-driven
- Frequency: Every minute
- Owner ที่ต้องเป็น: `budgetservice@g.klaeng.ac.th`

หากต้องหยุดทันทีโดยไม่ทำข้อมูลสูญหาย ให้รัน `disableOfficerNotificationWorker()`; queue จะคงอยู่ทั้งหมด. เมื่อต้องการเปิดอีกครั้งให้รัน `enableOfficerNotificationWorker()`.

## กลไกป้องกันอีเมลซ้ำ / ตกหล่น

- `DeliveryKey = SourceNotificationId|RecipientEmail` ทำหน้าที่เป็น idempotency key.
- Source cursor จะเลื่อนไปหลังจากเขียน durable jobs สำเร็จแล้วเท่านั้น.
- หาก execution หยุดหลังเขียน jobs แต่ก่อนเลื่อน cursor รอบถัดไปจะ replay source event ได้ แต่จะไม่สร้าง job ซ้ำเพราะ DeliveryKey.
- `LockService` ป้องกัน trigger ซ้อนกัน.
- ส่งแยก 1 recipient ต่อ 1 job ทำให้ตรวจย้อนหลังและ retry รายคนได้.
- ตัวอีเมลใช้คำขึ้นต้นแบบกลาง “เจ้าหน้าที่งานสารสนเทศ” ไม่พึ่ง DisplayName ในการทักทาย เพื่อลดผลกระทบหากชื่อใน `PC_Access` ยังไม่ตรงกับเจ้าของอีเมล; DisplayName ยังถูกเก็บใน audit job ตามฐานข้อมูล.
- งาน `SENDING` ที่ค้างเกิน 15 นาทีจะถูกถือเป็นงาน due และ recover ในรอบส่งถัดไปอัตโนมัติ โดยไม่ต้องสแกน full payload ของ queue ทุกนาที. ในเหตุขัดข้องที่หายากมาก เช่น process ถูก terminate หลัง Google รับคำสั่งส่งเมลแต่ก่อนเขียน `SENT` อาจมีอีเมลซ้ำได้ 1 ฉบับ ซึ่งเป็นข้อจำกัดของการทำ exactly-once delivery โดยไม่มี transaction ร่วมกับระบบอีเมล.

## Retry policy

สูงสุด 6 attempts (ครั้งแรก + retry สูงสุด 5 ครั้ง) โดยเว้นประมาณ 1, 5, 15, 30 และ 60 นาที. เมื่อครบจำนวนครั้งจะเป็น `FAILED`. ตรวจสาเหตุได้จาก `ErrorCode` และ `ErrorMessage` ใน `PC_OfficerAlerts`.

ระบบตรวจ `MailApp.getRemainingDailyQuota()` ก่อนส่งและสำรอง quota 5 recipients. หาก quota ต่ำกว่าค่าที่กำหนด jobs จะค้างอยู่ใน queue เพื่อส่งรอบต่อไป โดยไม่กระทบสถานะ Submission.

## Health / Operations

ใช้ `runOfficerNotificationHealthCheck()` เพื่อตรวจ:
- runner account
- DB access
- schema `PC_Notifications`, `PC_Access`, queue
- active recipients
- trigger count
- mail quota
- cursor lag
- queue counts (`PENDING/SENDING/SENT/RETRY/FAILED`)

## Test Matrix ก่อนเปิดใช้งานจริง

1. `SUBMISSION_RECEIVED` ของ `REPORT_ACTIVITY` → เจ้าหน้าที่ Active ทุกคนได้คนละ 1 ฉบับ.
2. `REVISION_SUBMITTED` → subject/badge เป็นฉบับแก้ไขรอตรวจซ้ำ.
3. `Active = FALSE` → ไม่สร้าง job ให้คนนั้น.
4. เพิ่ม officer ใหม่ใน `PC_Access` → event ถัดไปใช้รายชื่อใหม่โดยไม่ redeploy.
5. Role อื่น → ไม่ได้รับอีเมล.
6. Event อื่น (`REVISION_REQUIRED`, `FINAL_SUCCESS`) → ไม่สร้าง officer alert.
7. DocumentType อื่น → ไม่แจ้ง.
8. replay source row → DeliveryKey ป้องกัน job ซ้ำ.
9. mail send error → job เข้า `RETRY`; Submission เดิมไม่ถูกแก้.
10. trigger ซ้อน → LockService ป้องกัน concurrent worker.
11. worker ปิดชั่วคราว → เมื่อเปิดใหม่ source events ที่เกิดระหว่างหยุดยังถูก ingest ตาม cursor.
12. quota ต่ำ → หยุด dispatch โดย queue ยังอยู่.

## Production identifiers ที่ฝังไว้ในชุดนี้

- Pre-check DB ID: `16FtFuJUVhdLj8eidgVtjsKThNrlS5ge5NznSU6EVMn0`
- Project Adam Production URL: `https://script.google.com/a/g.klaeng.ac.th/macros/s/AKfycbztW4w2SKcdJazoi7cLxkqZQwKbft6lryp087vcjPIVyMayyjSOhi6svY-jirvKySFV/exec`
- Required runner: `budgetservice@g.klaeng.ac.th`

ค่าข้างต้นไม่ใช่ secret/token และถูกตั้งตาม Production ที่ตรวจจากฐานข้อมูลล่าสุด. หากในอนาคตเปลี่ยน deployment URL หรือย้าย DB ให้แก้ `NotificationConfig.gs` แล้ว Save; trigger เดิมใช้ code version ล่าสุดของ standalone project โดยไม่ต้อง deploy web app.

## ข้อจำกัดสำคัญของ Google Apps Script

- Execution time ของ Apps Script สำหรับบัญชี Google Workspace ปัจจุบันมีเพดาน 6 นาทีต่อ execution; งานนี้จึงจำกัดส่งไม่เกิน 40 jobs ต่อรอบและทำงานแบบ queue.
- โควต้า Apps Script ปัจจุบันสำหรับ Google Workspace ระบุผู้รับอีเมล 1,500 ราย/วันโดยทั่วไป และสูงสุด 2,000 ราย/วันสำหรับผู้รับภายในโดเมน; trigger runtime รวม 6 ชั่วโมง/วัน. Google ระบุว่า quota อาจเปลี่ยนได้ จึงไม่ hard-code quota เหล่านี้ใน logic และตรวจ `MailApp.getRemainingDailyQuota()` ทุกครั้งก่อนส่ง.
- Email/trigger/Spreadsheet services มี quotas ที่ Google สามารถเปลี่ยนได้. Worker จึงอ่าน remaining mail quota ก่อน dispatch.
- Trigger อาจเริ่มช้ากว่าเวลาที่กำหนดเล็กน้อย จึงเป็น **near-real-time (~รอบละ 1 นาที)** ไม่ใช่ real-time แบบ webhook.
- Trigger ทำงานภายใต้สิทธิ์ของผู้สร้าง trigger. จึงต้องสร้างด้วย `budgetservice@g.klaeng.ac.th` เท่านั้น.
- การเพิ่ม OAuth scope ในภายหลังต้อง authorize ใหม่ด้วยบัญชี trigger owner ก่อน trigger จะทำงานต่อได้.

## Rollback

1. รัน `disableOfficerNotificationWorker()` เพื่อหยุดอีเมลทันที.
2. ไม่ต้องแก้ Project Adam และไม่ต้องลบ source event ใด ๆ.
3. `PC_OfficerAlerts` เก็บไว้เพื่อ audit ได้.
4. หากต้องการยกเลิกถาวร ค่อยลบ standalone Apps Script project หลังตรวจ queue แล้ว.

## Known safety decision

โมดูลนี้ **ไม่แก้ `PC_Notifications.Status`**, ไม่แก้ `PC_Submissions`, ไม่แก้ `PC_Versions`, ไม่แตะ upload function และไม่ส่ง PDF attachment. เจ้าหน้าที่เข้าสู่ Project Adam ผ่านปุ่มในอีเมลและตรวจตาม permission เดิมของระบบ.
