# bap-adam Security Patch — doGet / Session Guard

## สิ่งที่แก้ไข

แพ็กเกจนี้แก้เฉพาะไฟล์ `รหัส.gs` และแนบ `appsscript.json` เดิมไว้สำหรับตรวจสอบ/วางทับได้ โดยไม่เปลี่ยน `Index.html` และ `Login.html` เพื่อหลีกเลี่ยงผลกระทบต่อ UI, ข้อความ, layout และ workflow เดิมของระบบที่ใช้งานจริง

การแก้ไขหลัก:

1. เพิ่ม allowlist ให้ `doGet(e)` เปิดได้เฉพาะ `Login` และ `Index`
2. หน้า `Index` จะเปิดได้เฉพาะเมื่อผู้ใช้ login แล้วและมี session ที่ยังไม่หมดอายุ
3. เพิ่มชีต `Sessions` อัตโนมัติ เพื่อจัดเก็บ session แบบ server-side
4. ตรวจสิทธิ์ซ้ำในทุก server-side function ที่อ่าน/เขียนข้อมูล ได้แก่ `getData`, `getDocumentData`, `saveData`, `saveReport`, `saveNonCompletedProject`, `getDropdownData`, `getReportCounts`, `getActivityInfo`, `getUploadUrl`, `uploadChunk`
5. แก้ logout ให้ invalidate session โดยใช้ compatibility กับ `Index.html` เดิมที่เรียก `getWebAppUrl()` ตอนออกจากระบบ
6. ไม่เปลี่ยน deployment เดิม (`executeAs: USER_DEPLOYING`, `access: DOMAIN`) เพื่อลดความเสี่ยงเรื่องสิทธิ์ Spreadsheet/Drive ของผู้ใช้งานจริง

## วิธีติดตั้ง

1. สำรอง Apps Script project ปัจจุบัน
2. สำรอง Google Spreadsheet ฐานข้อมูลของระบบ
3. เปิด Apps Script Editor
4. เปิดไฟล์ backend เดิมชื่อ `รหัส.gs`
5. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดจากไฟล์ `รหัส.gs` ในแพ็กเกจนี้แทน
6. ตรวจสอบ `appsscript.json` ว่ายังตรงกับไฟล์ในแพ็กเกจนี้
7. กด Save
8. รัน `initialSetup()` หนึ่งครั้ง หาก Script Properties ยังไม่มีค่า `key`
9. Deploy เป็น version ใหม่ก่อนทดสอบจริง
10. ทดสอบผ่าน deployment test URL ก่อนนำขึ้น production

## ชีตที่ระบบจะสร้างเพิ่ม

ระบบจะสร้างชีต `Sessions` ให้อัตโนมัติเมื่อมีการ login ครั้งแรก โดยมีคอลัมน์:

- SessionIdHash
- UserKeyHash
- Username
- DisplayName
- LoginAt
- LastSeenAt
- ExpiresAt
- Active
- LogoutAt
- LastAction
- LoginRedirectPending

แนะนำให้ซ่อนชีต `Sessions` และตั้ง Protect sheet หลังจากระบบสร้างชีตแล้ว

## พฤติกรรมหลังแก้

- ผู้ใช้เปิดหน้า Login ได้ตามปกติ
- เมื่อ login สำเร็จ ระบบสร้าง session ฝั่ง server แล้ว redirect ไปหน้า Index ตามโค้ดหน้า Login เดิม
- หากมีคนเปิด `?page=Index` โดยไม่ได้ login ระบบจะกลับไปหน้า Login
- หาก session หมดอายุ ระบบจะให้กลับไป login ใหม่
- เมื่อกดออกจากระบบ ระบบจะปิด session ปัจจุบัน

## OAuth scopes

ใช้ scopes เดิมของระบบ:

- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/script.external_request`
- `https://www.googleapis.com/auth/drive`

ไม่มีการเพิ่ม scope ใหม่ เพื่อหลีกเลี่ยงการกระทบผู้ใช้จริง

## ข้อจำกัดของ Google Apps Script ที่เกี่ยวข้อง

- Apps Script มี execution limit ต่อครั้งประมาณ 6 นาที
- การอ่าน/เขียน Google Sheets จำนวนมากอาจช้าหากมี concurrent users สูง
- Drive resumable upload ยังขึ้นกับ quota ของ UrlFetchApp และ Drive API
- `Session.getTemporaryActiveUserKey()` เป็น key ชั่วคราวของ active user ที่ไม่เปิดเผยตัวตน และหมุนเวียนตามรอบของ Google

## แผนทดสอบขั้นต่ำก่อนใช้งานจริง

1. เปิด URL หลัก ต้องเห็น Login
2. เปิด `?page=Index` โดยยังไม่ login ต้องถูกส่งกลับ Login
3. login ด้วยบัญชีถูกต้อง ต้องเข้า Index ได้
4. refresh หน้า Index ต้องยังเข้าได้จนกว่า session หมดอายุ
5. ทดสอบโหลดตาราง dashboard
6. ทดสอบขอเลขทะเบียน 1 รายการ
7. ทดสอบส่งรายงานพร้อม PDF 1 รายการ
8. ทดสอบแจ้งกิจกรรมที่ไม่ได้ดำเนินการพร้อม PDF 1 รายการ
9. กดออกจากระบบ แล้วเปิด `?page=Index` อีกครั้ง ต้องกลับ Login
10. ตรวจชีต `Logfile`, `ReportNo`, `ReportSubmit`, `Sessions`

## หมายเหตุด้านความปลอดภัย

แพตช์นี้แก้ช่องโหว่การเปิด Index โดยตรงและป้องกันการเรียก server function หลังบ้านโดยไม่มี session แต่ยังคงใช้ username/password จากชีต `Credential` ตามระบบเดิม เพื่อหลีกเลี่ยงการเปลี่ยน authentication ใหญ่ในระบบ production

ระยะถัดไปที่แนะนำ:

1. เปลี่ยน password plaintext เป็น password hash
2. เพิ่ม role-based authorization แยกสิทธิ์ผู้ใช้งาน
3. เพิ่ม duplicate protection ในการส่งรายงานซ้ำ
4. พิจารณาใช้ Google Workspace identity เต็มรูปแบบในรอบพัฒนาถัดไป
