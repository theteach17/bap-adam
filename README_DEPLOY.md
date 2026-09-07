# ADMIN-only Legacy Sidebar Menu Patch v1

## เป้าหมาย
ซ่อนเมนู Sidebar 2 รายการจาก USER และ PRECHECK_OFFICER:
1. ส่งรายงานฉบับสมบูรณ์ (Workflow เดิม)
2. แจ้งกิจกรรมที่ไม่ได้ดำเนินการ

แสดงเฉพาะเมื่อ Server `getNavigationContext()` คืน role `PRECHECK_ADMIN`.

## ขอบเขต
แก้เพียง `Index.html`

ไม่ได้แก้ Router, Unified Submit, saveReport, saveNonCompletedProject, Pre-check Review, Commit, Notification, Schema, Settings หรือ Trigger

## เหตุผลที่ไม่ปิด Server Workflow
สอง Workflow เดิมยังจำเป็นสำหรับผู้ใช้ทั่วไปเมื่อเข้าผ่านเมนู “ส่งเอกสาร” แล้ว Router ระบุว่าเป็น NON_COMPLETED_MEMO หรือ OTHER_DOCUMENT
ดังนั้น requirement นี้เป็นเรื่อง “ซ่อน shortcut จาก Sidebar” ไม่ใช่ปิด Business Workflow

## Fail-closed
Container ของสองเมนูถูก `display:none` ตั้งแต่ HTML
- ก่อน role โหลด: ไม่เห็น
- โหลด role ล้มเหลว: ไม่เห็น
- USER: ไม่เห็น
- PRECHECK_OFFICER: ไม่เห็น
- PRECHECK_ADMIN: เห็น

ไม่มี email hard-code และไม่เพิ่ม client-side role source ใหม่

## Deploy
วางทับ `Index.html` เพียงไฟล์เดียว -> Deploy New version

## Smoke test
- USER: ไม่เห็น 2 เมนู
- PRECHECK_OFFICER: ไม่เห็น 2 เมนู แต่ยังเห็น “ตรวจรายงาน Pre-check”
- PRECHECK_ADMIN: เห็น 2 เมนูและ “จัดการแบบตรวจ”
- USER ใช้ “ส่งเอกสาร” กับ NON_COMPLETED_MEMO/OTHER_DOCUMENT: Existing Workflow ยังเปิดได้ตามปกติ
