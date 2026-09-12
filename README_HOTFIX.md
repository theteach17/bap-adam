# Project Adam KPI Satellite v1.1.2 — Clock Storage Hotfix

สาเหตุ: Google Sheets สามารถ auto-convert `08:00` / `16:30` ใน `PC_KPIConfig.Value` เป็น native TIME ทำให้ v1.1.1 Health Check อ่านชนิดข้อมูลไม่ตรงและรายงาน `invalid working hours` ทั้งที่ค่าที่แสดงถูกต้อง

## ติดตั้งจาก v1.1.1
1. Replace 7 files ใน KPI Satellite ด้วยไฟล์ใน ZIP นี้
2. Save
3. Run `repairKpiClockStorage()` หนึ่งครั้ง
4. Run `runKpiHealthCheck()` — ต้องได้ `ok=true failed=0`
5. Run `runKpiProductionSmokeTest()` — ต้องได้ `ok=true` และ `businessTimeSelfTest=90`
6. หากยังไม่ได้ Deploy Web App ก่อนหน้า ให้ Deploy หลังผ่านทั้งสองการตรวจ

ไม่ต้องแก้ Project Adam Main Patch และไม่ต้องรัน `setupKpiSatellite()` ซ้ำเพื่อ hotfix นี้

Hotfix นี้ไม่เขียน `PC_Submissions`, `PC_Versions`, `PC_Reviews`, `PC_Audit` หรือ workflow หลัก
