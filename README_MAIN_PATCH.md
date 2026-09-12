# Project Adam Main Patch — KPI Satellite v1.1.0

เพิ่มใน Main เท่านั้น:
- `KpiSatelliteLauncher.gs`
- `KpiSatelliteLauncherWidget.html`

`Index.html` เป็น patch จาก Release2-FInal และเพิ่มเพียง 4 บรรทัด. ถ้า Production Index มีการแก้หลัง Release2-FInal ให้ merge ตาม `docs/SOURCE_DIFF.md` แทนการทับ.

Main Project **ไม่ต้อง** ติดตั้ง Kpi*.gs backend และไม่ต้องเพิ่ม OAuth scope สำหรับ KPI. Backend/trigger/DB workload อยู่ใน Satellite ของ `budgetservice@g.klaeng.ac.th`.

อ่าน `docs/INSTALLATION.md` ก่อน Deploy.
