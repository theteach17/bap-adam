/**
 * =========================================================================
 * AssistantNlu.gs — ตัวจำแนกเจตนาและสกัดข้อมูลจากข้อความภาษาไทย
 * =========================================================================
 * แนวทาง: ใช้การค้นคำย่อย (substring) แทนการตัดคำ
 *   ภาษาไทยเขียนติดกันไม่มีช่องว่าง แต่คำสำคัญยังคงเป็นสตริงย่อยที่ต่อเนื่อง
 *   เช่น "ค้างส่ง" ปรากฏอยู่ใน "มีเอกสารค้างส่งอะไรบ้าง" จึงจับได้โดยไม่ต้อง
 *   พึ่ง tokenizer ซึ่งไม่มีให้ใช้ใน Apps Script
 *
 * ชั้นนี้ถูกออกแบบเป็น strategy ที่สลับได้ หากอนาคตต้องการใช้ตัวจำแนกอื่น
 * ให้เปลี่ยนเฉพาะ asClassify_() โดยคงรูปแบบผลลัพธ์เดิมไว้
 * =========================================================================
 */

/** ตารางคำสำคัญของแต่ละเจตนา */
var AS_KEYWORDS = Object.freeze({
  HOWTO_START: ['เริ่มต้น','เริ่มใช้','เริ่มยังไง','เริ่มอย่างไร','ใช้งานระบบ','ใช้ระบบ','มือใหม่','ครั้งแรก','ทำอะไรก่อน','ขั้นตอนแรก','เริ่มจากไหน','แนะนำการใช้'],
  HOWTO_REGISTER: ['ขอเลข','เลขทะเบียน','ขึ้นทะเบียน','ออกเลข','ขอหมายเลข','จองเลข','ทะเบียนเอกสาร'],
  HOWTO_SUBMIT_REPORT: ['ส่งรายงาน','วิธีส่ง','ส่งเอกสาร','ส่งเอกสารยังไง','ส่งเอกสารอย่างไร','ส่งกิจกรรม','ส่งผลการดำเนิน','รายงานผลยังไง','อัปโหลดยังไง'],
  HOWTO_NON_COMPLETED: ['ไม่ได้ทำกิจกรรม','ไม่ได้ดำเนิน','ไม่ดำเนินกิจกรรม','ยกเลิกกิจกรรม','กิจกรรมยกเลิก','บันทึกข้อความชี้แจง','ชี้แจงไม่ดำเนิน','ไม่ได้จัดกิจกรรม','ไม่ได้จัด'],
  HOWTO_REVISION: ['ตีกลับ','ส่งใหม่','ฉบับแก้ไข','ส่งซ้ำ','ถูกส่งกลับ','แก้แล้วส่ง','โดนแก้'],
  HOWTO_FILE_RULES: ['ขนาดไฟล์','ไฟล์ใหญ่','กี่ MB','กี่เมกะ','เมกะไบต์','ชนิดไฟล์','ไฟล์อะไร','ไฟล์แบบไหน','นามสกุลไฟล์','ไฟล์ pdf','จำกัดขนาด'],
  HOWTO_CONTACT: ['ติดต่อ','โทร','สอบถามใคร','ถามใคร','ผู้ดูแลระบบ','แจ้งปัญหา','ขอความช่วยเหลือ'],

  DOC_STATUS: ['สถานะ','ขั้นตอนไหน','ขั้นตอนใด','ถึงไหน','อยู่ไหน','คืบหน้า','เช็คสถานะ','ตรวจสอบสถานะ','ดำเนินการถึง','ไปถึงไหน'],
  DOC_NEXT_ACTION: ['ทำอะไรต่อ','ทำยังไงต่อ','ขั้นตอนต่อไป','ต้องทำอะไร','ต่อไปต้อง','ทำอะไรได้บ้าง'],
  DOC_FIX_LIST: ['ต้องแก้','แก้อะไร','รายการแก้','ข้อที่ต้องแก้','ผลการตรวจ','ความเห็นเจ้าหน้าที่','แก้ตรงไหน','ติดอะไร'],
  DOC_FINAL_LINK: ['ฉบับสมบูรณ์','ไฟล์ฉบับสมบูรณ์','ไฟล์สมบูรณ์','ดาวน์โหลด','ลิงก์ไฟล์','ไฟล์อยู่ไหน','ขอไฟล์'],
  DOC_HISTORY: ['กี่รอบ','กี่ครั้ง','ประวัติ','เวอร์ชัน','version','ส่งไปกี่'],

  MY_PENDING: ['ค้างส่ง','ยังไม่ได้ส่ง','งานค้าง','ยังไม่เสร็จ','ตกค้าง','เหลืออะไร','ค้างอยู่','ยังไม่ส่ง','ค้างกี่','ยังขาด'],
  MY_NEEDS_FIX: ['ที่ต้องแก้','ต้องแก้ไขบ้าง','โดนตีกลับบ้าง','ต้องแก้กี่'],
  MY_IN_REVIEW: ['รอตรวจ','กำลังตรวจ','ส่งไปแล้ว','รอผล'],
  MY_SUMMARY: ['สรุปงาน','ภาพรวมของฉัน','งานของฉัน','เอกสารของฉัน','สรุปเอกสาร','มีกี่เรื่อง'],

  QUEUE_SUMMARY: ['คิวตรวจ','คิวรอตรวจ','ภาพรวมคิว','คิวมีกี่','งานตรวจทั้งหมด','สรุปคิว']
});

/** คำที่บ่งชี้ว่าผู้ถามหมายถึงงานของตัวเอง */
var AS_PERSONAL_MARKERS = Object.freeze(['ของฉัน','ของผม','ของดิฉัน','ของหนู','ตัวเอง','ที่ฉัน','ที่ผม','ผมมี','ฉันมี','หนูมี','ของเรา']);

/** ปรับข้อความให้อยู่ในรูปมาตรฐานก่อนวิเคราะห์ */
function asNormalizeText_(value) {
  var thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
  var text = String(value == null ? '' : value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/／/g, '/');
  text = text.replace(/[๐-๙]/g, function(ch) { return String(thaiDigits.indexOf(ch)); });
  return text.replace(/\s+/g, ' ').trim();
}

/** สกัดเลขเอกสารจากข้อความอิสระ คืนรูปแบบมาตรฐานของระบบ */
function asExtractDocumentNumber_(normalizedText) {
  var text = String(normalizedText || '');
  var match = text.match(/(บง|บว|บท|บค)\s*(\d{1,6})\s*\/\s*(\d{4})/);
  if (!match) return '';
  return normalizeDocumentNumberForPrecheck_(match[1] + ' ' + match[2] + '/' + match[3]);
}

/**
 * ให้คะแนนเจตนาแต่ละตัวจากคำสำคัญที่พบ
 * น้ำหนักแปรตามความยาวคำ (ยิ่งยาวยิ่งเฉพาะเจาะจง) เพื่อให้วลีที่ตรงกว่าชนะ
 * เช่น "ไฟล์ฉบับสมบูรณ์อยู่ไหน" ต้องชนะคำกว้างอย่าง "อยู่ไหน"
 */
function asScoreIntents_(normalizedText) {
  var haystack = String(normalizedText || '').toLowerCase();
  var scores = {};
  Object.keys(AS_KEYWORDS).forEach(function(intent) {
    var total = 0;
    AS_KEYWORDS[intent].forEach(function(keyword) {
      var word = String(keyword).toLowerCase();
      if (haystack.indexOf(word) !== -1) {
        total += Math.min(4, Math.max(1, Math.floor(word.length / 3)));
      }
    });
    if (total > 0) scores[intent] = total;
  });
  return scores;
}

/** ตรวจว่าข้อความอ้างถึงงานของผู้ถามเองหรือไม่ */
function asHasPersonalMarker_(normalizedText) {
  var text = String(normalizedText || '');
  for (var i = 0; i < AS_PERSONAL_MARKERS.length; i++) {
    if (text.indexOf(AS_PERSONAL_MARKERS[i]) !== -1) return true;
  }
  return false;
}

/**
 * จำแนกเจตนาจากข้อความ
 * @return {{intent:string, confidence:number, documentNumber:string, alternatives:Array}}
 */
function asClassify_(rawText, context, principal) {
  var text = asNormalizeText_(rawText);
  var documentNumber = asExtractDocumentNumber_(text);
  var scores = asScoreIntents_(text);
  var personal = asHasPersonalMarker_(text);
  var isOfficer = asIsOfficer_(principal);

  // เอกสารที่อ้างถึงก่อนหน้า ใช้เติมช่องว่างเท่านั้น ไม่ใช้ตัดสินสิทธิ์
  if (!documentNumber && context && context.lastDocumentNumber) {
    var carried = normalizeDocumentNumberForPrecheck_(context.lastDocumentNumber);
    if (isValidDocumentNumberFormat_(carried)) documentNumber = carried;
  }

  // ปรับน้ำหนักตามบริบท
  Object.keys(scores).forEach(function(intent) {
    if (personal && intent.indexOf('MY_') === 0) scores[intent] += 3;
    if (documentNumber && AS_CONST.DOC_INTENTS.indexOf(intent) !== -1) scores[intent] += 3;
    if (!isOfficer && AS_CONST.OFFICER_INTENTS.indexOf(intent) !== -1) delete scores[intent];
    // ถ้าถามถึงเอกสารเฉพาะฉบับ ให้ลดน้ำหนักเจตนาที่เป็นรายการรวมและคำถามเชิงวิธีใช้
    // เพราะการเอ่ยเลขเอกสารคือสัญญาณชัดว่าผู้ใช้ถามถึงฉบับนั้นโดยเฉพาะ
    if (documentNumber && intent.indexOf('MY_') === 0 && !personal) scores[intent] = Math.max(0, scores[intent] - 2);
    if (documentNumber && intent.indexOf('HOWTO_') === 0) scores[intent] = Math.max(0, scores[intent] - 2);
  });

  var ranked = Object.keys(scores)
    .filter(function(k) { return scores[k] > 0; })
    .sort(function(a, b) { return scores[b] - scores[a]; });

  // ไม่มีคำสำคัญเลย แต่พิมพ์เลขเอกสารมา ให้ถือว่าถามสถานะ
  if (!ranked.length) {
    if (documentNumber) return { intent: AS_CONST.INTENT.DOC_STATUS, confidence: 0.72, documentNumber: documentNumber, alternatives: [] };
    return { intent: AS_CONST.INTENT.UNKNOWN, confidence: 0, documentNumber: '', alternatives: [] };
  }

  var best = ranked[0];
  var bestScore = scores[best];

  // คำสั้นแต่ชัดเจน เช่น "สถานะเอกสาร" ได้คะแนนไม่ถึงเกณฑ์ แต่ไม่มีเจตนาอื่นแข่งเลย
  // จึงถือว่าไม่กำกวมและรับได้ ถ้ามีเจตนาอื่นแข่งด้วยจึงค่อยบังคับใช้เกณฑ์คะแนน
  var unambiguous = ranked.length === 1;
  if (bestScore < AS_CONST.LIMITS.MIN_INTENT_SCORE && !unambiguous) {
    if (documentNumber) return { intent: AS_CONST.INTENT.DOC_STATUS, confidence: 0.6, documentNumber: documentNumber, alternatives: [] };
    return { intent: AS_CONST.INTENT.UNKNOWN, confidence: 0, documentNumber: '', alternatives: [] };
  }

  // เจตนาที่ต้องมีเลขเอกสารแต่ผู้ใช้ยังไม่ได้ระบุ
  if (AS_CONST.DOC_INTENTS.indexOf(best) !== -1 && !documentNumber) {
    return { intent: AS_CONST.INTENT.NEED_DOCUMENT_NUMBER, confidence: 0.8, documentNumber: '', alternatives: [best] };
  }

  var second = ranked.length > 1 ? scores[ranked[1]] : 0;
  var confidence = Math.min(0.99, 0.55 + (bestScore - second) * 0.1);
  return {
    intent: best,
    confidence: Math.round(confidence * 100) / 100,
    documentNumber: documentNumber,
    alternatives: ranked.slice(1, 3)
  };
}

/** ตรวจบทบาทเจ้าหน้าที่/ผู้ดูแลจาก principal */
function asIsOfficer_(principal) {
  if (!principal || !principal.roles) return false;
  return principal.roles.indexOf(PC_CONST.ROLES.OFFICER) !== -1 ||
         principal.roles.indexOf(PC_CONST.ROLES.ADMIN) !== -1;
}
