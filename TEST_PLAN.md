# TEST_PLAN.md

# Test Plan — ศูนย์สารสนเทศกลาง Pre-check

## 1. Test Levels

- **Unit / pure-function:** normalization, resolver, result counting, validation helpers
- **Static integration:** client/server reference, HTML include, manifest/scope, public contract
- **Google-hosted integration:** Sheets, Drive resumable upload, MailApp, Session, Active User, triggers
- **Regression:** Registration, Login/Session, Memo, Other Document, legacy report when not enforced, search/dashboard
- **Security:** authorization, client trust, FileId/session ownership, XSS, deep link, role/email spoof
- **Concurrency:** double click, two reviewers, double approve, trigger/user collision, retry races
- **Failure recovery:** upload/review/commit/mail partial failures
- **UAT:** Desktop, mobile, large PDF, revision, officer/admin

## 2. Pre-delivery Automated Static Gate

Latest result: **66 PASS / 0 FAIL**

ตรวจ:

- syntax `.gs`
- inline JavaScript syntax
- manifest JSON
- duplicate GAS functions
- all original GAS functions preserved
- client calls resolve to server endpoints
- browser does not call private `_` endpoints
- HTML includes/pages exist
- forbidden development markers absent
- internal codename absent from HTML
- OAuth token / Google session URI absent from Browser
- required scopes present
- 2 MB default
- opaque UploadSessionId
- server-only OAuth
- CommitId/checkpoints
- ResponsesJSON
- Script Lock + logical lock
- feature flags
- provenance migration
- pure normalization/resolver/review-count tests

## 3. Test Cases

### Document Routing

| ID | Scenario | Expected |
|---|---|---|
| T-DOC-01 | Input Thai digits/full-width slash | Normalize to canonical document number |
| T-DOC-02 | Master name starts REPORT_ACTIVITY prefix | Server resolves REPORT_ACTIVITY |
| T-DOC-03 | Master name starts memo prefix | Existing memo workflow |
| T-DOC-04 | Master name starts `เอกสาร` | Existing other workflow |
| T-DOC-05 | Unknown prefix | Block submission |
| T-DOC-06 | Client sends fake document type | Server ignores/re-resolves Master |

### Data / Version

| ID | Scenario | Expected |
|---|---|---|
| T-DATA-01 | Save draft | No ReportSubmit row / no ReportNo!H write |
| T-DATA-02 | Same document save draft twice | Same Submission case |
| T-VER-01 | V1 submitted then revision | New V2 row, V1 unchanged |
| T-VER-02 | Create V2 draft | CurrentVersion remains V1 until V2 submit |
| T-VER-03 | Re-review V2 | Previous FIX items highlighted/filterable |

### Upload

| ID | Scenario | Expected |
|---|---|---|
| T-UP-01 | 1-chunk PDF | Upload + finalize success |
| T-UP-02 | Multi-chunk PDF | 2 MB chunks, 0–100% progress |
| T-UP-03 | Oversize PDF | Client precheck + server reject before session |
| T-UP-04 | Invalid extension/MIME | Reject |
| T-UP-05 | Lost chunk response | Query actual expected offset, no full restart |
| T-UP-06 | Browser refresh mid-upload | begin returns resumable session/nextByte for same file/version |
| T-UP-07 | Browser closes after binary complete | Resume/finalize without re-upload |
| T-UP-08 | Another user reuses UploadSessionId | Reject ownership |
| T-UP-09 | Arbitrary FileId | Cannot bind; FileId originates from server session only |
| T-UP-10 | Legacy memo/other | Same hardened chunk service with legacy destination |

### Review

| ID | Scenario | Expected |
|---|---|---|
| T-REV-01 | User opens review deep link | Forbidden |
| T-REV-02 | Officer A locks; Officer B opens | B read-only; Admin takeover explicit |
| T-REV-03 | Autosave repeated edits | One in-flight request, one ResponsesJSON row update |
| T-REV-04 | Fake ItemId / wrong quick comment group | Server reject |
| T-REV-05 | Required UNREVIEWED | Finalize reject |
| T-REV-06 | FIX without comment | Finalize reject |
| T-REV-07 | FIX >= 1 | REVISION_REQUIRED |
| T-REV-08 | NOTE only + required complete | Approval allowed |
| T-REV-09 | Old version approval | Reject |
| T-REV-10 | Officer correction whitelist | Allowed + audit old/new/reason |
| T-REV-11 | Officer correction after approval | Reject |

### Commit

| ID | Scenario | Expected |
|---|---|---|
| T-COM-01 | Normal approval | CommitId persisted before move, same FileId moved, row/master updated |
| T-COM-02 | Double approve | Completed review idempotent; no duplicate commit |
| T-COM-03 | Trigger + user retry | short claim lock; one committing owner |
| T-COM-04 | Move success then exception | retry detects actual FileId/folder and continues |
| T-COM-05 | ReportSubmit written then exception | CommitId found; no append duplicate |
| T-COM-06 | Master update response lost | same file URL considered success |
| T-COM-07 | Master has different final link | Abort + FAILED + alert; no overwrite |
| T-COM-08 | Existing legacy ReportSubmit row for same doc | Preflight conflict before move |
| T-COM-09 | Retry threshold exceeded | stops auto retry + operational alert |

### Notification

| ID | Scenario | Expected |
|---|---|---|
| T-NOT-01 | Revision required | Email queue includes FIX/page/comment/deep link |
| T-NOT-02 | Final success | Enqueue only after APPROVED_COMMITTED |
| T-NOT-03 | Mail quota/transient error | RETRY + NextAttemptAt |
| T-NOT-04 | Queue call retried | event/submission/version dedup under Script Lock |
| T-NOT-05 | Mail fails | Approval/commit state unchanged |

### Security

| ID | Scenario | Expected |
|---|---|---|
| T-SEC-01 | Client spoofs role/email/status/fileId/folderId | ignored or rejected server-side |
| T-SEC-02 | Deep link unauthorized | Server authorization blocks page/API data |
| T-SEC-03 | Browser source scan | no OAuth token/resumable Google URL |
| T-SEC-04 | HTML untrusted values | escaped/textContent rendering |
| T-SEC-05 | Officer allowlist | `PC_Access` active role required |
| T-SEC-06 | Technical setup mutation | Active User must equal Effective User |

### Reliability / Recovery

| ID | Scenario | Expected |
|---|---|---|
| T-REL-01 | Stale upload | query Drive state; recover/reset without blind delete |
| T-REL-02 | Expired review lock | clear lease only; content remains |
| T-REL-03 | Staging file unmapped and old | move to Orphan |
| T-REL-04 | Failed/pending commit | reconcile idempotently |
| T-REL-05 | Daily backup | copy workflow DB + retention |
| T-REL-06 | Feature flag rollback | legacy behavior restored without deleting data |

### Regression

| ID | Scenario | Expected |
|---|---|---|
| T-REG-01 | Request document number | existing function contract preserved |
| T-REG-02 | Login/session/logout | existing functions preserved; protected page guard |
| T-REG-03 | NON_COMPLETED_MEMO | existing business flow + secure chunk binding |
| T-REG-04 | OTHER_DOCUMENT | existing business flow + secure chunk binding |
| T-REG-05 | REPORT_ACTIVITY while Shadow | legacy report flow still allowed |
| T-REG-06 | Existing search/dashboard | existing endpoint names preserved |

## 4. Permission Matrix

| Endpoint class | USER | OFFICER | ADMIN | Unauthenticated |
|---|---:|---:|---:|---:|
| Lookup / own draft / own detail | Allow | Allow as user identity | Allow as user identity | Deny |
| Officer dashboard | Deny | Allow | Allow | Deny |
| Open/save/complete review | Deny | Allow with lease/pilot rule | Allow, takeover where explicit | Deny |
| Structured correction | Deny | Allow only IN_REVIEW + whitelist | Allow only IN_REVIEW + whitelist | Deny |
| Template/access admin | Deny | Deny | Allow | Deny |
| Commit private worker | no browser API | no browser API | no browser API | no browser API |
| Technical setup facade | Technical Owner only | Technical Owner only | Technical Owner only | Deny |

## 5. UAT Script

UAT ต้องทำใน Shadow/Pilot deployment ก่อน Full Enforcement:

1. ผู้รับผิดชอบเปิด Mobile → กรอกเลข → metadata read-only → draft autosave
2. Upload PDF มากกว่า 2 MB → progress → interrupt → resume
3. Officer Desktop เปิด PDF + checklist → keyboard shortcuts → autosave
4. ส่ง FIX หลายหน้า → ผู้ใช้เห็น FIX-first เรียงหน้า
5. Upload V2 → review highlight previous FIX
6. Approve → verify same Drive FileId, ReportSubmit provenance, ReportNo!H, email
7. ผู้ส่งแทน owner → owner/submitter email policy
8. Admin template clone/edit/publish/retire
9. Two officers open same case
10. Disable enforcement → verify legacy workflow returns

## 6. Exit Criteria

ก่อน Full Rollout:

- Static gate = 0 failures
- Health Check = 0 failures
- UAT critical scenarios pass
- No duplicate final row/file from retry tests
- Permission Matrix pass
- No Critical/High security issue open
- Pilot metrics reviewed by Technical Owner/Manager
