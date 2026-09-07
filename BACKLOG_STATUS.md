# Pre-check Production Hardening Backlog — 7 Sep 2569

## Verified PASS
- Unified routing / Pilot routing
- Upload + resumable upload
- Production checklist 11 items
- PDF viewer
- Review lock / read-only second reviewer
- Previous FIX details on revised versions
- Revision Required workflow
- Version detail (structured data per V1/V2)
- Manual final commit end-to-end
- Final file rename/move / ReportNo H / ReportSubmit provenance
- Final notification queue
- Public final-file visibility policy (intentional school policy)
- Loading indicator on slow server calls/navigation
- PR Indicator hidden from user form
- Visible version banner

## Fixed in this v2 package
1. Navigation lock after successful submit/review
   - root cause: async top navigation could be ignored while __pcNavBusy remained true forever.
   - central nav now has a fail-safe 3.5-second unlock.
   - uses an explicit target=_top anchor navigation.
   - failure no longer leaves all navigation buttons permanently locked.

2. Submit success fallback
   - automatic redirect is still attempted.
   - if the browser blocks it, a visible success panel provides:
     - View this submission
     - My documents
     - Home
   - no refresh is required to regain navigation.

3. Review completion fallback
   - automatic return to Officer queue is still attempted.
   - success panel provides Return to queue / Home if browser blocks automatic navigation.
   - no refresh is required to regain navigation.

4. Bottom checklist progress
   - keeps the existing top progress tags.
   - duplicates live 'ตรวจแล้ว X/Y / FIX / NOTE / Vn' summary immediately above Save / Complete Review.

5. Self-healing master cache
   - normal document cache remains 5 minutes for performance.
   - if a cached record is UNKNOWN (blocking), lookup performs one fresh ReportNo read automatically.
   - direct corrections to the document name no longer require waiting five minutes before retrying.

## Gate still in progress
- Auto Commit Trigger Gate using บง 035/2569
  - V1 intentionally resulted in REVISION_REQUIRED, which is correct.
  - Continue with V2 after applying this patch.
  - PASS criteria:
    WAITING_REVIEW_REVISED -> APPROVED_PENDING_COMMIT -> trigger -> APPROVED_COMMITTED
    -> final file -> ReportSubmit -> ReportNo H -> notification
  - Do not use manual commit for this gate.

## Keep until gate passes
- PC_AUTO_COMMIT_ENABLED = true (pilot only)
- PC_ENFORCE_REPORT_ACTIVITY = false
- PC_PILOT_ADMIN_GROUPS = กลุ่มบริหารงบประมาณ

## Full rollout
Only after Auto Commit Trigger Gate passes:
- final health check
- set PC_ENFORCE_REPORT_ACTIVITY = true
- run configurePrecheckSystem()
- verify installation
- monitor first production submissions
