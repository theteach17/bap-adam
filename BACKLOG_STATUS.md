# BACKLOG_STATUS — 7 Sep 2569

## Closed / ผ่านการทดสอบก่อน patch นี้
- Pre-check production checklist 11 รายการ
- V1 -> REVISION_REQUIRED -> V2 revised workflow
- Previous FIX comparison
- Bottom `ตรวจแล้ว 11/11` counter
- Duplicate submission prevention
- Automatic final commit gate
- ReportSubmit provenance + ReportNo final link
- Final notification queue
- Public final-file access (นโยบายโรงเรียนโดยเจตนา)
- Navigation/loading feedback และการล้างข้อความ “กดอีกครั้ง”
- Self-healing UNKNOWN master cache
- Full rollout flags: PC_ENABLED / PC_AUTO_COMMIT_ENABLED / PC_ENFORCE_REPORT_ACTIVITY เปิดใช้งานแล้ว

## Closed in Field Alignment v3
- Dropdown ผลของเป้าหมายเชิงปริมาณ/เชิงคุณภาพกลับตรง Workflow เดิม
- Server-side enum validation
- ลำดับ Satisfaction statistics ก่อน Management statistics
- Label ผลที่คาดว่าจะได้รับตรงแบบฟอร์มเดิม
- PR Indicator ยังคงไม่ปรากฏใน UI
- Regression ที่พบใน package draft v2 (V2 ไม่ carry-forward) ถูกยกเลิกและแก้โดยสร้าง v3 จาก baseline production ที่ถูกต้อง

## งานค้างที่ต้องทำเมื่อใด/อย่างไร
ไม่มี code backlog ที่จำเป็นต้องแก้ก่อนใช้งาน patch นี้
หลัง Deploy ให้ทำ smoke test ตาม README และรัน verifyPrecheckInstallation(). หาก failedCount > 0 ให้หยุดใช้งาน release ใหม่นั้นและ rollback เฉพาะ 4 ไฟล์ทันที ก่อนตรวจสาเหตุเป็นราย check.
