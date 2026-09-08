# Pre-check Field Alignment — Final v3

## ไฟล์ที่ต้องวางทับ (เฉพาะ 4 ไฟล์นี้)
1. `SubmitDocument.html`
2. `PrecheckVersionService.gs`
3. `PrecheckDetail.html`
4. `PrecheckReview.html`

ไม่ต้องวางทับ `Index.html`, `SharedScripts.html`, `SharedStyles.html` หรือไฟล์อื่นใด

## สิ่งที่แก้
- `ผลของเป้าหมายเชิงปริมาณ` เป็น Dropdown: `บรรลุเป้าหมายเชิงปริมาณ` / `ไม่บรรลุเป้าหมายเชิงปริมาณ`
- `ผลของเป้าหมายเชิงคุณภาพ` เป็น Dropdown: `บรรลุเป้าหมายเชิงคุณภาพ` / `ไม่บรรลุเป้าหมายเชิงคุณภาพ`
- Draft ยังบันทึกได้แม้ยังไม่เลือก; ก่อนส่งตรวจ Server บังคับค่า enum ที่ถูกต้อง
- Label กลับตรงกับแบบฟอร์มเดิม: `ผลที่คาดว่าจะได้รับ` และ `บรรลุผลที่คาดว่าจะได้รับ`
- เรียง `X̄/SD ความพึงพอใจ` ไว้ก่อน `X̄/SD ผลการบริหารกิจกรรม`
- ไม่เพิ่ม/ไม่แสดง `PR Indicator`; browser ไม่เป็น authoritative source ของฟิลด์นี้
- ไม่มี Data Migration

## Regression ที่รักษาไว้
- V2/V3 ยังคัดลอกข้อมูลโครงสร้างจาก CurrentVersion ก่อนหน้าเป็นค่าเริ่มต้น
- V2/V3 ยังต้องอัปโหลด PDF ฉบับใหม่
- Autosave / resumable upload / post-submit action buttons เหมือน baseline ที่ผ่าน Pilot
- Checklist 11 รายการ / prior FIX / review autosave / completion actions ไม่เปลี่ยน
- ReportSubmit mapping ไม่เปลี่ยน: H TargetQ, I TargetQL, J ResultQ, K ResultQL, M ManagementXbar, V SatisfactionXbar, W SatisfactionSD, X ManagementSD
- `PRIndicator` ใน schema/คอลัมน์ Z คงไว้เพื่อ compatibility แต่ UI ไม่รับค่าและ package นี้ไม่ย้ายข้อมูลย้อนหลัง

## วิธีติดตั้ง
1. สำรอง Apps Script project ปัจจุบัน
2. วางทับเฉพาะ 4 ไฟล์ข้างต้น
3. Save project
4. Deploy เวอร์ชันใหม่ของ Web App ตามวิธีที่ใช้อยู่ปัจจุบัน
5. รัน `verifyPrecheckInstallation()` — ต้อง `failedCount: 0`
6. Smoke test 1 รายการ: Draft -> ส่งตรวจ -> Revision (ถ้ามี) -> ตรวจ -> Commit

## Rollback
หากต้องย้อนกลับ ให้นำ 4 ไฟล์เวอร์ชันก่อน patch กลับมาวางทับ ไม่มี schema migration จึงไม่ต้อง rollback ฐานข้อมูล
