/**
 * =========================================================================
 * AssistantDataService.gs — ชั้นอ่านข้อมูล (READ-ONLY อย่างเคร่งครัด)
 * =========================================================================
 * กติกาของไฟล์นี้:
 *   1) ห้ามมีคำสั่งเขียนใด ๆ ไปยังชีตของระบบเดิม
 *      (ไม่มี setValue, setValues, appendRow, insertSheet, deleteRow)
 *   2) อ่านผ่านฟังก์ชัน repository เดิมเสมอ ไม่เขียนตรรกะสถานะขึ้นใหม่
 *      เพื่อให้เมื่อ workflow เดิมเปลี่ยน ผู้ช่วยเปลี่ยนตามโดยอัตโนมัติ
 *   3) แคชเพื่อประสิทธิภาพเท่านั้น ไม่ใช้แคชเป็นแหล่งความจริง
 * =========================================================================
 */

/** ตัดคำนำหน้าชื่อออกเพื่อเทียบชื่อผู้รับผิดชอบแบบตรงตัว */
function asNormalizePersonName_(value) {
  var text = String(value == null ? '' : value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  var titles = ['ว่าที่ร้อยตรีหญิง','ว่าที่ร้อยตรี','ว่าที่ ร.ต.','นางสาว','นาง','นาย','ดร.','ผศ.','รศ.','ศ.','ครู'];
  for (var i = 0; i < titles.length; i++) {
    if (text.indexOf(titles[i]) === 0) { text = text.substring(titles[i].length).trim(); break; }
  }
  return text.replace(/\s+/g, '').toLowerCase();
}

/**
 * ตรวจว่าตัวตนของผู้ใช้ถูกแยกเป็นสองส่วนหรือไม่
 * pcBuildCurrentPrincipal_ ใช้ email = activeEmail || credentialEmail
 * ถ้าผู้ใช้ล็อกอินเบราว์เซอร์ด้วยบัญชี Google หนึ่ง แต่เข้าระบบด้วย username ของอีกคน
 * จะได้ email ของคนแรกแต่ displayName ของคนหลัง ซึ่งอันตรายต่อการจับคู่ด้วยชื่อ
 */
function asIdentityIsSplit_(principal) {
  try {
    var activeEmail = pcKey_(Session.getActiveUser().getEmail());
    if (!activeEmail) return false;
    var credentialEmail = pcKey_(pcCredentialEmailForUsername_(principal && principal.username));
    if (!credentialEmail) return false;
    return activeEmail !== credentialEmail;
  } catch (ignored) { return false; }
}

/** อ่านทะเบียนเอกสารทั้งใบแบบจำกัดคอลัมน์ (A:L) หนึ่งครั้งต่อ execution */
function asMasterRows_() {
  return pcMemo_('as:masterRows', function() {
    var sheet = getSpreadsheet_().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var lastCol = Math.min(12, sheet.getLastColumn());
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  });
}

/** อ่านเลขเอกสารที่มีแถวใน ReportSubmit แล้ว (workflow เดิม) หนึ่งครั้งต่อ execution */
function asLegacyFinalSet_() {
  return pcMemo_('as:legacyFinal', function() {
    var set = {};
    var sheet = getSpreadsheet_().getSheetByName(reportSubmitSheetName);
    if (!sheet || sheet.getLastRow() < 2) return set;
    var values = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      var key = normalizeDocumentNumberForPrecheck_(values[i][0]);
      if (key) set[key] = true;
    }
    return set;
  });
}

/** สร้างดัชนี PC_Submissions ตามเลขเอกสาร หนึ่งครั้งต่อ execution */
function asSubmissionIndex_() {
  return pcMemo_('as:submissionIndex', function() {
    var index = {};
    try {
      if (!getPrecheckConfig_().dbId) return index;
      var rows = pcListObjects_(PC_CONST.SHEETS.SUBMISSIONS);
      rows.forEach(function(row) {
        var key = normalizeDocumentNumberForPrecheck_(row.DocumentNumber);
        if (key) index[key] = row;
      });
    } catch (ignored) { return index; }
    return index;
  });
}

/**
 * คืนสถานะของเอกสารหนึ่งฉบับ โดยรวมทั้ง workflow Pre-check และ workflow เดิม
 * @return {{found:boolean, master:Object, submission:Object, statusCode:string, canViewDetail:boolean}}
 */
function asDocumentState_(principal, documentNumber) {
  var docNo = normalizeDocumentNumberForPrecheck_(documentNumber);
  if (!docNo || !isValidDocumentNumberFormat_(docNo)) {
    return { found: false, master: null, submission: null, statusCode: AS_CONST.SYNTHETIC.NOT_FOUND, canViewDetail: false };
  }

  var master = pcMasterDocument_(docNo, false);
  if (!master) {
    return { found: false, master: null, submission: null, statusCode: AS_CONST.SYNTHETIC.NOT_FOUND, canViewDetail: false };
  }

  var submission = asSubmissionIndex_()[docNo] || null;
  var statusCode;

  if (submission && String(submission.Status || '')) {
    statusCode = String(submission.Status);
  } else if (master.finalLink || asLegacyFinalSet_()[docNo]) {
    statusCode = AS_CONST.SYNTHETIC.FINALIZED;
  } else if (master.documentType === PC_CONST.DOCUMENT_TYPES.NON_COMPLETED_MEMO && master.nonCompletedMemoLink) {
    statusCode = AS_CONST.SYNTHETIC.MEMO_SUBMITTED;
  } else if (master.documentType === PC_CONST.DOCUMENT_TYPES.UNKNOWN) {
    // lookupDocument() ปฏิเสธเอกสารที่ชื่อไม่อยู่ในรูปแบบที่รองรับ
    // ถ้าตอบว่า "ยังไม่เริ่มดำเนินการ" แล้วพาไปหน้าส่งเอกสาร ผู้ใช้จะเจอทางตัน
    statusCode = AS_CONST.SYNTHETIC.NAME_NOT_SUPPORTED;
  } else {
    statusCode = AS_CONST.SYNTHETIC.NOT_STARTED;
  }

  // สถานะเสร็จสมบูรณ์จากทะเบียน ต้องชนะสถานะกลางคันของ Pre-check เสมอ
  if (master.finalLink && asStatusGroup_(statusCode) !== 'CLOSED') {
    statusCode = AS_CONST.SYNTHETIC.FINALIZED;
  }

  var canViewDetail = submission ? pcCanViewSubmission_(submission, principal) : false;
  return { found: true, master: master, submission: submission, statusCode: statusCode, canViewDetail: canViewDetail };
}

/** ตรวจว่าผู้ถามมีสิทธิ์เห็นสถานะของเอกสารฉบับนี้หรือไม่ ตามค่า PC_ASSIST_STATUS_SCOPE */
function asCanSeeStatus_(principal, state, cfg) {
  if (!state || !state.found) return true; // ไม่พบเอกสาร ตอบเหมือนกันทุกคน
  if (asIsOfficer_(principal)) return true;
  var scope = String((cfg || {}).assistStatusScope || 'ORG').toUpperCase();
  if (scope !== 'OWN') return true; // ORG = พฤติกรรมเดิมของ lookupDocument()
  var email = pcKey_(principal && principal.email);
  if (email && email === pcKey_(state.master.ownerEmail)) return true;
  if (state.submission && pcCanViewSubmission_(state.submission, principal)) return true;
  return false;
}

/**
 * คืนรายการงานของผู้ใช้จากทะเบียนเอกสาร
 * นี่คือจุดเดียวที่ตอบคำถาม "เอกสารในความรับผิดชอบของฉันที่ยังค้างส่ง"
 * เพราะ getMyDocuments() เดิมเห็นเฉพาะเอกสารที่มีแถวใน PC_Submissions แล้ว
 * จึงมองไม่เห็นเอกสารที่ยังไม่เคยเริ่มทำ ซึ่งเป็นกรณีที่ค้างจริงที่สุด
 */
function asMyWorkload_(principal, cfg, bypassCache, includeAllYears) {
  var email = pcKey_(principal && principal.email);
  var cacheKey = AS_CONST.CACHE.WORK_PREFIX + (includeAllYears ? 'ALL_' : '') +
                 hashString_(email || String(principal && principal.username || '')).substring(0, 24);
  var cache = CacheService.getScriptCache();

  if (!bypassCache) {
    var cached = cache.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch (ignored) {}
    }
  }

  var allowNameMatch = pcBool_((cfg || {}).assistNameMatch, true);
  // ถ้าอีเมลบัญชี Google ไม่ตรงกับอีเมลใน Credential ของ username ที่ล็อกอินอยู่
  // แปลว่าตัวตนถูกแยกเป็นสองส่วน (email เป็นของคนหนึ่ง ชื่อเป็นของอีกคนหนึ่ง)
  // การจับคู่ด้วยชื่อในสถานการณ์นี้จะดึงเอกสารของเจ้าของชื่อมาแสดง จึงต้องปิดทันที
  if (allowNameMatch && asIdentityIsSplit_(principal)) allowNameMatch = false;
  var fromYear = includeAllYears === true ? 0 : pcInt_((cfg || {}).assistWorkloadFromYear, 0, 0, 3000);
  var myName = asNormalizePersonName_(principal && principal.displayName);
  var rows = asMasterRows_();
  var submissions = asSubmissionIndex_();
  var legacyFinal = asLegacyFinalSet_();

  var result = {
    generatedAt: pcNowIso_(),
    total: 0, closed: 0, matchedByName: 0, filteredByYear: 0, filteredBlocked: 0,
    fromYear: fromYear,
    notStarted: [], withYou: [], withOfficer: [], inSystem: [], blocked: [],
    truncated: false
  };

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var docNo = normalizeDocumentNumberForPrecheck_(row[1]);
    if (!docNo) continue;

    var ownerEmail = pcKey_(row[9]);
    var matchSource = '';
    if (email && ownerEmail && ownerEmail === email) matchSource = 'EMAIL';
    else if (allowNameMatch && myName && asNormalizePersonName_(row[5]) === myName) matchSource = 'NAME';
    if (!matchSource) continue;

    result.total++;
    if (matchSource === 'NAME') result.matchedByName++;

    var documentName = String(row[2] || '').trim();
    var documentType = resolveDocumentType_(documentName);
    var finalLink = String(row[7] || '').trim();
    var memoLink = String(row[6] || '').trim();
    var submission = submissions[docNo] || null;

    var statusCode;
    if (finalLink || legacyFinal[docNo]) statusCode = AS_CONST.SYNTHETIC.FINALIZED;
    else if (submission && String(submission.Status || '')) statusCode = String(submission.Status);
    else if (documentType === PC_CONST.DOCUMENT_TYPES.NON_COMPLETED_MEMO && memoLink) statusCode = AS_CONST.SYNTHETIC.MEMO_SUBMITTED;
    else if (documentType === PC_CONST.DOCUMENT_TYPES.UNKNOWN) statusCode = AS_CONST.SYNTHETIC.NAME_NOT_SUPPORTED;
    else statusCode = AS_CONST.SYNTHETIC.NOT_STARTED;

    var group = asStatusGroup_(statusCode);
    if (group === 'CLOSED') { result.closed++; continue; }

    // กรองปีหลังรู้สถานะแล้ว เพื่อให้ตัวเลขที่แจ้งผู้ใช้หมายถึง "งานค้างเก่าที่ถูกข้าม"
    // ไม่ใช่เอกสารเก่าทั้งหมดซึ่งส่วนใหญ่เสร็จไปแล้ว และสถิติรวมยังนับครบทุกปีเหมือนเดิม
    var docYear = pcDocumentYear_(docNo);
    if (fromYear && docYear && docYear < fromYear) {
      result.filteredByYear++;
      if (group === 'BLOCKED') result.filteredBlocked++;
      continue;
    }

    var item = {
      documentNumber: docNo,
      documentName: documentName.substring(0, 120),
      adminGroup: String(row[3] || '').trim(),
      statusCode: statusCode,
      statusLabel: asStatusInfo_(statusCode).label,
      submissionId: submission ? String(submission.SubmissionId || '') : '',
      matchSource: matchSource
    };

    if (group === 'NOT_STARTED') result.notStarted.push(item);
    else if (group === 'BLOCKED') result.blocked.push(item);
    else if (group === 'WITH_YOU') result.withYou.push(item);
    else if (group === 'WITH_OFFICER') result.withOfficer.push(item);
    else result.inSystem.push(item);
  }

  // เก็บจำนวนจริงก่อนตัดรายการ เพื่อไม่ให้ผู้ใช้เห็นตัวเลขที่ต่ำกว่าความจริง
  // การบอกว่า "ค้าง 30 ฉบับ" ทั้งที่มี 400 ฉบับ คือความผิดพลาดที่ทำลายความน่าเชื่อถือ
  var cap = 30; // CacheService จำกัด 100KB ต่อคีย์ จึงจำกัดขนาดที่เก็บไว้ให้ปลอดภัย
  var groups = ['notStarted','withYou','blocked','withOfficer','inSystem'];
  result.counts = {};
  groups.forEach(function(key) { result.counts[key] = result[key].length; });

  groups.forEach(function(key) {
    // ทะเบียนมีเอกสารย้อนหลังหลายปี จึงเรียงปีใหม่สุดขึ้นก่อนเสมอ
    // ไม่เช่นนั้นผู้ใช้จะเห็นเอกสารเก่าค้างจากปีก่อน ๆ ขึ้นก่อนงานปีปัจจุบัน
    result[key].sort(function(a, b) {
      var ya = pcDocumentYear_(a.documentNumber), yb = pcDocumentYear_(b.documentNumber);
      if (ya !== yb) return yb - ya;
      return String(b.documentNumber).localeCompare(String(a.documentNumber));
    });
    if (result[key].length > cap) { result[key] = result[key].slice(0, cap); result.truncated = true; }
  });

  result.openCount = groups.reduce(function(sum, key) { return sum + result.counts[key]; }, 0);
  result.actionableCount = result.counts.notStarted + result.counts.withYou;

  try { cache.put(cacheKey, JSON.stringify(result), AS_CONST.CACHE.WORK_SECONDS); } catch (ignored) {}
  return result;
}

/** คืนรายการที่ต้องแก้ไขของเอกสารหนึ่งฉบับ เฉพาะผู้มีสิทธิ์ดูเท่านั้น */
function asFixItems_(submission) {
  if (!submission) return [];
  var submissionId = String(submission.SubmissionId || '');
  if (!submissionId) return [];

  var reviews = pcFilterObjects_(PC_CONST.SHEETS.REVIEWS, function(r) {
    return String(r.SubmissionId) === submissionId && String(r.ReviewStatus) === PC_CONST.REVIEW_STATUS.COMPLETED;
  }).sort(function(a, b) { return String(b.CompletedAt || '').localeCompare(String(a.CompletedAt || '')); });
  if (!reviews.length) return [];

  var latest = reviews[0];
  var itemLabels = {};
  try {
    pcListObjects_(PC_CONST.SHEETS.TEMPLATE_ITEMS).forEach(function(item) {
      itemLabels[String(item.ItemId)] = String(item.ItemLabel || '');
    });
  } catch (ignored) {}

  return pcFilterObjects_(PC_CONST.SHEETS.REVIEW_RESPONSES, function(resp) {
    return String(resp.ReviewId) === String(latest.ReviewId) && String(resp.Result) === PC_CONST.REVIEW_RESULT.FIX;
  }).map(function(resp) {
    return {
      title: itemLabels[String(resp.ItemId)] || 'รายการตรวจ',
      detail: String(resp.Comment || ''),
      page: String(resp.PageNumber || '')
    };
  });
}

/** คืนตัวเลขภาพรวมคิวตรวจสำหรับเจ้าหน้าที่ */
function asOfficerKpi_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(AS_CONST.CACHE.KPI_KEY);
  if (cached) { try { return JSON.parse(cached); } catch (ignored) {} }

  var kpi = { waiting: 0, inReview: 0, revisedWaiting: 0, revisionRequired: 0, committed: 0, total: 0 };
  try {
    pcListObjects_(PC_CONST.SHEETS.SUBMISSIONS).forEach(function(row) {
      var status = String(row.Status || '');
      kpi.total++;
      if (status === PC_CONST.STATUS.WAITING_REVIEW) kpi.waiting++;
      else if (status === PC_CONST.STATUS.IN_REVIEW) kpi.inReview++;
      else if (status === PC_CONST.STATUS.WAITING_REVIEW_REVISED) kpi.revisedWaiting++;
      else if (status === PC_CONST.STATUS.REVISION_REQUIRED) kpi.revisionRequired++;
      else if (status === PC_CONST.STATUS.APPROVED_COMMITTED) kpi.committed++;
    });
  } catch (ignored) {}

  try { cache.put(AS_CONST.CACHE.KPI_KEY, JSON.stringify(kpi), AS_CONST.CACHE.KPI_SECONDS); } catch (ignored) {}
  return kpi;
}

/**
 * ล้างแคชรายการงานของผู้ใช้คนหนึ่ง ใช้เมื่อผู้ใช้กดรีเฟรช
 * ต้องล้างทั้งมุมมองที่กรองปีและมุมมองทุกปี เพราะเก็บคนละคีย์กัน
 */
function asDropWorkloadCache_(principal) {
  var hash = hashString_(pcKey_(principal && principal.email) || String(principal && principal.username || '')).substring(0, 24);
  var cache = CacheService.getScriptCache();
  [AS_CONST.CACHE.WORK_PREFIX + hash, AS_CONST.CACHE.WORK_PREFIX + 'ALL_' + hash].forEach(function(key) {
    try { cache.remove(key); } catch (ignored) {}
  });
}
