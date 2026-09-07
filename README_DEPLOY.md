# Index Navigation Loading Regression Fix v1

## ปัญหาที่แก้
หน้า Index กดเมนูที่นำทางไปหน้าอื่นแล้วระบบทำงานเงียบ ไม่มีการแจ้ง "กำลังเปิดหน้า"

## Root cause
`goPage()` ใน Index ปัจจุบันเรียก `getAppNavigationUrl()` โดยไม่มี `showLoading()`
ทั้งที่ implementation ที่ผ่านการทดสอบก่อนหน้านี้มี:
- `pageNavigationInFlight`
- `showLoading('กำลังเปิดหน้า กรุณารอสักครู่...')`
- failure handler ที่คืน lock และปิด loading

## การแก้
คืนเฉพาะ implementation ของ `goPage()` ที่ผ่านการทดสอบแล้ว

## ขอบเขตที่ยืนยันว่าไม่ได้เปลี่ยน
- CSS byte-for-byte เหมือนเดิม
- Layout Index ล่าสุดเหมือนเดิม
- ADMIN-only menu logic เหมือนเดิม
- loadNavigationContext เหมือนเดิม
- Router / Unified Submit เหมือนเดิม
- Pre-check Submission / Review / Commit / Notifications เหมือนเดิม
- Database / Settings / Triggers ไม่เกี่ยวข้องและไม่ได้แก้
- Modal workflows ไม่ถูกแก้

## ผลที่คาด
เมนูบน Index ที่ใช้ `goPage()` ได้แก่:
- ส่งเอกสาร
- รายการเอกสารของฉัน
- ตรวจรายงาน Pre-check
- จัดการแบบตรวจ (ADMIN)

จะแสดง SweetAlert "กำลังเปิดหน้า กรุณารอสักครู่..." ทันทีหลังคลิก และป้องกันการกดซ้ำระหว่างรอ URL

## ติดตั้ง
วางทับเฉพาะ `Index.html` แล้ว Deploy New version
