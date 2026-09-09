/**
 * =========================================================================
 * AssistantConstants.gs — ค่าคงที่ของโมดูลผู้ช่วยตอบคำถามอัตโนมัติ
 * =========================================================================
 * โมดูลนี้เป็น READ-ONLY ทั้งหมด ไม่มีเส้นทางเขียนข้อมูลไปยัง
 * ReportNo, ReportSubmit, PC_Submissions, PC_Versions, PC_Reviews
 * เขียนได้เฉพาะชีต PC_AssistantLog ของตัวเองเท่านั้น
 * =========================================================================
 */

var AS_CONST = Object.freeze({
  VERSION: '1.0.0',

  SHEETS: Object.freeze({ LOG: 'PC_AssistantLog' }),

  LIMITS: Object.freeze({
    MAX_MESSAGE_LENGTH: 500,
    MAX_LIST_ITEMS: 5,
    MIN_INTENT_SCORE: 2
  }),

  CACHE: Object.freeze({
    WORK_PREFIX: 'AS_WORK_',
    WORK_SECONDS: 180,
    KPI_KEY: 'AS_KPI_V1',
    KPI_SECONDS: 90,
    RATE_PREFIX: 'AS_RL_',
    RATE_SECONDS: 60
  }),

  /** สถานะสังเคราะห์สำหรับเอกสารที่ไม่ได้เดินผ่าน Pre-check */
  SYNTHETIC: Object.freeze({
    NOT_STARTED: 'NOT_STARTED',
    FINALIZED: 'FINALIZED',
    MEMO_SUBMITTED: 'MEMO_SUBMITTED',
    NOT_FOUND: 'NOT_FOUND'
  }),

  INTENT: Object.freeze({
    HOWTO_START: 'HOWTO_START',
    HOWTO_REGISTER: 'HOWTO_REGISTER',
    HOWTO_SUBMIT_REPORT: 'HOWTO_SUBMIT_REPORT',
    HOWTO_NON_COMPLETED: 'HOWTO_NON_COMPLETED',
    HOWTO_REVISION: 'HOWTO_REVISION',
    HOWTO_FILE_RULES: 'HOWTO_FILE_RULES',
    HOWTO_CONTACT: 'HOWTO_CONTACT',
    DOC_STATUS: 'DOC_STATUS',
    DOC_NEXT_ACTION: 'DOC_NEXT_ACTION',
    DOC_FIX_LIST: 'DOC_FIX_LIST',
    DOC_FINAL_LINK: 'DOC_FINAL_LINK',
    DOC_HISTORY: 'DOC_HISTORY',
    MY_PENDING: 'MY_PENDING',
    MY_NEEDS_FIX: 'MY_NEEDS_FIX',
    MY_IN_REVIEW: 'MY_IN_REVIEW',
    MY_SUMMARY: 'MY_SUMMARY',
    QUEUE_SUMMARY: 'QUEUE_SUMMARY',
    NEED_DOCUMENT_NUMBER: 'NEED_DOCUMENT_NUMBER',
    UNKNOWN: 'UNKNOWN'
  }),

  /** Intent ที่ต้องมีเลขเอกสารประกอบเสมอ */
  DOC_INTENTS: Object.freeze(['DOC_STATUS','DOC_NEXT_ACTION','DOC_FIX_LIST','DOC_FINAL_LINK','DOC_HISTORY']),

  /** Intent เฉพาะเจ้าหน้าที่/ผู้ดูแล */
  OFFICER_INTENTS: Object.freeze(['QUEUE_SUMMARY'])
});

/**
 * พจนานุกรมสถานะ: แปลรหัสสถานะเป็นภาษาไทย พร้อมบอกว่า "ตอนนี้อยู่ที่ใคร"
 * และ "ต้องทำอะไรต่อ" ซึ่งเป็นสิ่งที่ผู้ใช้อยากรู้จริงมากกว่ารหัสสถานะ
 * tone: ok | wait | warn | danger | done | muted
 */
var AS_STATUS_MAP = Object.freeze({
  NOT_STARTED: {
    label: 'ยังไม่เริ่มดำเนินการ', tone: 'danger', owner: 'ท่าน',
    next: 'เปิดเมนู "ส่งเอกสาร" แล้วกรอกเลขเอกสารนี้เพื่อเริ่มทำรายการ',
    action: { label: 'ไปหน้าส่งเอกสาร', page: 'SubmitDocument', param: 'document' }
  },
  DRAFT: {
    label: 'บันทึกร่างไว้ ยังไม่ได้ส่งตรวจ', tone: 'warn', owner: 'ท่าน',
    next: 'กรอกข้อมูลให้ครบ แนบไฟล์ PDF แล้วกดส่งตรวจ',
    action: { label: 'ทำรายการต่อ', page: 'SubmitDocument', param: 'document' }
  },
  UPLOADING: {
    label: 'กำลังอัปโหลดไฟล์ ยังไม่เสร็จ', tone: 'warn', owner: 'ท่าน',
    next: 'เปิดหน้าเดิมเพื่ออัปโหลดต่อ หรือเริ่มอัปโหลดใหม่',
    action: { label: 'อัปโหลดต่อ', page: 'SubmitDocument', param: 'document' }
  },
  WAITING_REVIEW: {
    label: 'ส่งตรวจแล้ว รอเจ้าหน้าที่ตรวจ', tone: 'wait', owner: 'เจ้าหน้าที่',
    next: 'รอผลตรวจ ระบบจะแจ้งทางอีเมลเมื่อมีผล ไม่ต้องส่งซ้ำ',
    action: { label: 'ดูรายละเอียด', page: 'PrecheckDetail', param: 'submission' }
  },
  IN_REVIEW: {
    label: 'เจ้าหน้าที่กำลังตรวจอยู่', tone: 'wait', owner: 'เจ้าหน้าที่',
    next: 'รอผลตรวจ ไม่ต้องส่งซ้ำ',
    action: { label: 'ดูรายละเอียด', page: 'PrecheckDetail', param: 'submission' }
  },
  REVISION_REQUIRED: {
    label: 'ต้องแก้ไขและส่งใหม่', tone: 'danger', owner: 'ท่าน',
    next: 'ดูรายการที่ต้องแก้ไข แก้ไฟล์ให้เรียบร้อย แล้วส่งฉบับแก้ไข',
    action: { label: 'ดูรายการที่ต้องแก้', page: 'PrecheckDetail', param: 'submission' }
  },
  WAITING_REVIEW_REVISED: {
    label: 'ส่งฉบับแก้ไขแล้ว รอตรวจซ้ำ', tone: 'wait', owner: 'เจ้าหน้าที่',
    next: 'รอผลตรวจรอบใหม่',
    action: { label: 'ดูรายละเอียด', page: 'PrecheckDetail', param: 'submission' }
  },
  APPROVED_PENDING_COMMIT: {
    label: 'ผ่านการตรวจแล้ว รอระบบบันทึกฉบับสมบูรณ์', tone: 'ok', owner: 'ระบบ',
    next: 'ไม่ต้องดำเนินการใด ระบบจะบันทึกให้อัตโนมัติ',
    action: { label: 'ดูรายละเอียด', page: 'PrecheckDetail', param: 'submission' }
  },
  APPROVED_COMMITTING: {
    label: 'ระบบกำลังบันทึกฉบับสมบูรณ์', tone: 'ok', owner: 'ระบบ',
    next: 'รอสักครู่แล้วตรวจสอบอีกครั้ง',
    action: { label: 'ดูรายละเอียด', page: 'PrecheckDetail', param: 'submission' }
  },
  APPROVED_COMMITTED: {
    label: 'เสร็จสมบูรณ์', tone: 'done', owner: '',
    next: 'ดำเนินการครบถ้วนแล้ว สามารถเปิดดูไฟล์ฉบับสมบูรณ์ได้',
    action: { label: 'ดูรายละเอียด', page: 'PrecheckDetail', param: 'submission' }
  },
  APPROVED_COMMIT_FAILED: {
    label: 'ผ่านการตรวจแล้ว แต่บันทึกไฟล์ไม่สำเร็จ', tone: 'danger', owner: 'ผู้ดูแลระบบ',
    next: 'ระบบจะลองใหม่อัตโนมัติ หากเกิน 30 นาทียังไม่หาย กรุณาแจ้งผู้ดูแลระบบ',
    action: { label: 'ดูรายละเอียด', page: 'PrecheckDetail', param: 'submission' }
  },
  CANCELLED: {
    label: 'ยกเลิกรายการแล้ว', tone: 'muted', owner: '',
    next: 'หากต้องการดำเนินการใหม่ ให้เริ่มจากเมนูส่งเอกสาร',
    action: { label: 'ไปหน้าส่งเอกสาร', page: 'SubmitDocument', param: 'document' }
  },
  ARCHIVED: {
    label: 'จัดเก็บถาวรแล้ว', tone: 'muted', owner: '', next: 'ไม่ต้องดำเนินการใด', action: null
  },
  FINALIZED: {
    label: 'เสร็จสมบูรณ์', tone: 'done', owner: '',
    next: 'มีเอกสารฉบับสมบูรณ์ในระบบแล้ว', action: null
  },
  MEMO_SUBMITTED: {
    label: 'ส่งบันทึกข้อความชี้แจงแล้ว', tone: 'done', owner: '',
    next: 'ดำเนินการครบถ้วนแล้ว', action: null
  },
  NOT_FOUND: {
    label: 'ไม่พบเลขเอกสารนี้ในระบบ', tone: 'muted', owner: '',
    next: 'กรุณาตรวจสอบเลขเอกสารอีกครั้ง หรือขอเลขทะเบียนก่อนหากยังไม่เคยขึ้นทะเบียน', action: null
  }
});

/** จัดกลุ่มสถานะเพื่อสรุปงานค้างของผู้ใช้ */
var AS_STATUS_GROUP = Object.freeze({
  WITH_YOU: ['DRAFT', 'UPLOADING', 'REVISION_REQUIRED'],
  WITH_OFFICER: ['WAITING_REVIEW', 'IN_REVIEW', 'WAITING_REVIEW_REVISED'],
  IN_SYSTEM: ['APPROVED_PENDING_COMMIT', 'APPROVED_COMMITTING', 'APPROVED_COMMIT_FAILED'],
  CLOSED: ['APPROVED_COMMITTED', 'FINALIZED', 'MEMO_SUBMITTED', 'CANCELLED', 'ARCHIVED']
});

/** ปุ่มลัดตั้งต้น ครอบคลุมคำถามส่วนใหญ่โดยผู้ใช้ไม่ต้องพิมพ์เอง */
var AS_DEFAULT_CHIPS = Object.freeze([
  { label: 'เอกสารค้างส่งของฉัน', intent: 'MY_PENDING' },
  { label: 'เริ่มต้นใช้งานระบบ', intent: 'HOWTO_START' },
  { label: 'เอกสารที่ต้องแก้ไข', intent: 'MY_NEEDS_FIX' },
  { label: 'ตรวจสอบสถานะเอกสาร', intent: 'NEED_DOCUMENT_NUMBER' },
  { label: 'ส่งรายงานอย่างไร', intent: 'HOWTO_SUBMIT_REPORT' }
]);

/** ป้ายชื่อสถานะสำหรับกรณีที่ไม่รู้จักรหัส (ป้องกันการแสดงรหัสดิบให้ผู้ใช้) */
function asStatusInfo_(statusCode) {
  var code = String(statusCode || '').trim().toUpperCase();
  if (AS_STATUS_MAP[code]) return AS_STATUS_MAP[code];
  return {
    label: 'อยู่ระหว่างดำเนินการ', tone: 'muted', owner: '',
    next: 'กรุณาเปิดหน้ารายละเอียดเพื่อดูข้อมูลล่าสุด', action: null
  };
}

/** คืนกลุ่มของสถานะ ใช้จัดหมวดงานค้าง */
function asStatusGroup_(statusCode) {
  var code = String(statusCode || '').trim().toUpperCase();
  if (code === AS_CONST.SYNTHETIC.NOT_STARTED) return 'NOT_STARTED';
  if (AS_STATUS_GROUP.WITH_YOU.indexOf(code) !== -1) return 'WITH_YOU';
  if (AS_STATUS_GROUP.WITH_OFFICER.indexOf(code) !== -1) return 'WITH_OFFICER';
  if (AS_STATUS_GROUP.IN_SYSTEM.indexOf(code) !== -1) return 'IN_SYSTEM';
  if (AS_STATUS_GROUP.CLOSED.indexOf(code) !== -1) return 'CLOSED';
  return 'OTHER';
}
