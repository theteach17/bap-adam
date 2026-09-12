# Project Adam KPI Satellite v1.2.0 — Transport Security Hotfix

## ปัญหาที่แก้
v1.1.2 ใช้ Satellite Web App แบบต้องผ่าน Google sign-in/Domain access แล้วนำ URL ไปฝังใน iframe ของ Project Adam Main. ในบาง browser/session ชั้น authentication ของ Google ถูก redirect ภายใน iframe และไม่ส่ง `READY` กลับ Main จึงค้างที่ขั้น 3 แม้ Main bridge และ Satellite backend จะปกติ.

## แนวทาง v1.2.0
Satellite เปลี่ยนเป็น **public transport / private data**:
- Web App transport ต้องเลือก access แบบไม่ต้อง Google sign-in (`ANYONE_ANONYMOUS` / UI ที่ระบุว่า Anyone โดยไม่ต้องลงชื่อเข้าใช้)
- Execute as: Me (`budgetservice@g.klaeng.ac.th`)
- หน้า doGet ไม่มีข้อมูล KPI จนกว่า Signed Handoff จะผ่าน
- Handoff ใช้ HMAC, short-lived ticket, one-time nonce, PC_Access PRECHECK_ADMIN, short-lived session
- Direct legacy API ยังคง fail-closed เพราะไม่มี KPI request context
- Maintenance functions ตรวจ Active User ต้องเป็น budgetservice
- Time triggers ตรวจ `triggerUid` กับ trigger จริงก่อนประมวลผล
- Bootstrap มี rate limit เพื่อลด abuse

## ไฟล์ที่ต้อง Replace ใน Satellite
- SatelliteConfig.gs
- KpiConstants.gs
- SatelliteSecurity.gs
- KpiSetup.gs
- KpiJobService.gs
- KpiDiagnostics.gs
- KpiSatellite.html
- KpiWeb.gs

## ขั้นตอน
1. Replace 8 files ข้างต้น แล้ว Save.
2. Run `runKpiHealthCheck()` ต้อง `ok=true failed=0` และมี `PASS transport-security`.
3. ไม่ต้อง Run setup ซ้ำ.
4. Deploy > Manage deployments > Satellite deployment เดิม > Edit > New version.
5. Execute as: **Me (budgetservice)**.
6. Who has access: เลือกตัวเลือกที่ **ไม่ต้อง Google sign-in** (`ANYONE_ANONYMOUS`).
7. Deploy โดยใช้ deployment เดิมเพื่อให้ `/exec` URL เดิมไม่เปลี่ยน.
8. เปิด `/exec` โดยตรง: ต้องเห็นข้อความว่า Transport พร้อมใช้งานและให้เปิดผ่าน Project Adam; ต้องไม่เห็นข้อมูล KPI.

หาก Workspace policy ไม่มีตัวเลือก access แบบไม่ต้อง sign-in ให้หยุดก่อน ไม่ควรลด security อื่นหรือเปลี่ยน Execute as. ต้องใช้ fallback transport architecture แทน.
