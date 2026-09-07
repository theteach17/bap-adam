# ADMIN-only menu — Layout Restored v2

แก้เฉพาะ Index.html

## สิ่งที่เปลี่ยน
- ปุ่มเดิม `ส่งรายงานฉบับสมบูรณ์ (Workflow เดิม)` ซ่อนโดย default และแสดงเฉพาะ PRECHECK_ADMIN
- ปุ่มเดิม `แจ้งกิจกรรมที่ไม่ได้ดำเนินการ` ซ่อนโดย default และแสดงเฉพาะ PRECHECK_ADMIN
- ใช้ id บนปุ่มเดิมโดยตรง
- ไม่มี div wrapper ใหม่
- fail-closed หากโหลด role ไม่สำเร็จ

## สิ่งที่ไม่ได้เปลี่ยน
- CSS ทั้ง `<style>` เหมือนเดิม byte-for-byte
- sidebar/sidebar-menu/main-content/content-wrapper เหมือนเดิม
- Router / Unified Submit
- showReportForm / showNonCompletedProjectForm
- Pre-check submission/review/commit
- Database / Config / Trigger / Notification
- ตารางและ footer

## สิทธิ์
USER: ไม่เห็น 2 ปุ่ม
PRECHECK_OFFICER: ไม่เห็น 2 ปุ่ม
PRECHECK_ADMIN: เห็น 2 ปุ่ม

หมายเหตุ: label version คงค่าปัจจุบันของผู้ใช้เป็น v.2.1.0
