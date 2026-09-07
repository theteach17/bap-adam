# Index Layout Polish — CSS-only v1

## เป้าหมาย
ปรับเฉพาะความเรียบร้อยของหน้า Index ตามภาพจริง โดยไม่เปลี่ยน Business Logic หรือ DOM

## จุดที่ปรับ
1. `.sidebar-header`
   - กำหนดความสูง 80px ให้เสมอกับ `.top-bar`
   - ลด padding แนวตั้งเพื่อให้โลโก้/ชื่ออยู่กึ่งกลาง
   - ไม่แก้ข้อความ โลโก้ หรือโครงสร้าง HTML

2. `.page-title`
   - ให้ใช้พื้นที่ว่างอย่างถูกต้องโดยไม่ดัน layout ส่วนอื่น

3. `.page-title h4`
   - ลดขนาดเล็กน้อยเป็น 1.35rem
   - ไม่ตัดขึ้นบรรทัดใหม่บน Desktop
   - ทำให้หัวหน้าดูเป็นแนวเดียวและสมดุลกับ search/profile

4. `.content-wrapper`
   - ลดช่องว่างด้านบนจาก 30px เป็น 18px
   - คงขอบซ้าย/ขวา 30px เพื่อให้ตรงกับ padding ของ top bar

5. `.content-card`
   - เอา margin-top 10px ออก
   - ทำให้ตารางไม่ดูลอยห่างจากหัวหน้า

## การยืนยันขอบเขต
- HTML หลัง `</style>` เหมือนเดิม byte-for-byte
- JavaScript เหมือนเดิมทั้งหมด
- ADMIN-only menu logic เหมือนเดิม
- Router / Unified Submit / Pre-check / Review / Commit / Trigger / Database ไม่ถูกแก้
- ตารางและการโหลดข้อมูลไม่ถูกแก้
- Footer ไม่ถูกแก้
- v.2.1.0 คงเดิม

ให้วางทับเฉพาะ Index.html แล้ว Deploy New version
