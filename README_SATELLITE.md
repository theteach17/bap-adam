# Project Adam KPI Satellite v1.1.0 — Production Package

สถาปัตยกรรมนี้ทำให้เมนูและ Dashboard KPI ปรากฏ **ภายใน Project Adam หลัก** แต่ compute/read/aggregate/cache/trigger ทั้งหมดรันใน Standalone Apps Script ของ `budgetservice@g.klaeng.ac.th`.

## หลักการสำคัญ
- Main (`bap`) ทำเพียง Admin gate + signed handoff + iframe launcher.
- ไม่มี KPI API proxy ผ่าน Main หลัง handoff.
- Satellite re-check `PC_Access` ทุก RPC และ fail-closed หาก runner ไม่ใช่ budgetservice.
- Background jobs มี `PC_KPIJobRuns` พร้อม Status/Stage/Message/Error และ `STALE` detection.
- Satellite อ่าน operational tables แต่เขียนเฉพาะ `PC_KPI*`.
- Baseline Mode เปิด, Composite Score ปิด, Assignment ปิด เพื่อไม่เปลี่ยน workflow หลัก.

## ติดตั้ง
อ่านตามลำดับ:
1. `docs/INSTALLATION.md`
2. `docs/ACCEPTANCE_TEST.md`
3. `docs/RISK_REVIEW.md`
4. หากเคยติดตั้ง v2.2.1: `docs/MIGRATION_FROM_V2.2.1.md`

## โครงสร้างไฟล์
- `satellite/` — นำไปสร้าง Standalone Apps Script ภายใต้ budgetservice
- `main_patch/` — เพิ่มเฉพาะ bridge + widget และ Index patch ใน Project Adam เดิม
- `docs/` — architecture/install/test/risk/live status
- `tests/` — local verification (Node + Python)

`PC_KPIJobRuns` และ KPI sheets ถูกเตรียมใน Live Pre-check DB แล้ว แต่ module ยังไม่ Live จนกว่าคุณจะ authorize/deploy Satellite และ update Main deployment.
