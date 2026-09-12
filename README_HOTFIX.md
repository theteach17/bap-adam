# Project Adam KPI Main Bridge Diagnostics Hotfix v1.1.3

## เป้าหมาย
แก้เฉพาะ observability ของ `verifyKpiSatelliteMainBridge()` ใน Project Adam Main ให้แสดง PASS/FAIL ใน Execution log แทนการ return ค่าเงียบ ๆ

## วิธีติดตั้ง
1. ใน Project Adam Main เดิม แทนที่ไฟล์ `KpiSatelliteLauncher.gs` ด้วยไฟล์ในชุดนี้
2. Save
3. Run `verifyKpiSatelliteMainBridge()` ด้วยบัญชี PRECHECK_ADMIN
4. ไม่ต้องแก้ `Index.html`, Satellite project, Script Properties หรือ deploy ใหม่เพื่อการทดสอบฟังก์ชันนี้

## สิ่งที่ log จะแสดง
- Satellite URL configured
- Satellite URL format valid
- Handoff secret configured (แสดงเฉพาะ length ไม่แสดง secret)
- Ticket generation self-test
- สรุป `ok`, จำนวน failed checks และชื่อ check ที่ fail

## Safety
- ไม่เรียก Satellite ผ่าน UrlFetchApp
- ไม่แก้ operational sheets
- ไม่แก้ workflow Project Adam
- ไม่ log Handoff Secret หรือ signed ticket
