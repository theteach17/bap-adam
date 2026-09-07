/** Requirement-compliant document number normalizer shared by every module. */
function normalizeDocumentNumberForPrecheck_(value) {
  var thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
  var raw = String(value == null ? '' : value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/／/g, '/');
  raw = raw.replace(/[๐-๙]/g, function(ch){ return String(thaiDigits.indexOf(ch)); });
  raw = raw.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim();
  raw = raw.replace(/[\s.,;:!?]+$/g, '').trim();
  var match = raw.match(/^(บง|บว|บท|บค)\s*(\d+)\/(\d{4})$/);
  return match ? match[1] + ' ' + match[2] + '/' + match[3] : raw;
}

/** Normalizes document names only for type detection without changing meaning. */
function normalizeDocumentNameForType_(value) {
  return String(value == null ? '' : value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolves document type solely from trusted master data. */
function resolveDocumentType_(documentName) {
  var name = normalizeDocumentNameForType_(documentName);
  if (name.indexOf('บันทึกข้อความ') === 0) return PC_CONST.DOCUMENT_TYPES.NON_COMPLETED_MEMO;
  if (name.indexOf('รายงานผลการดำเนินกิจกรรม') === 0) return PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY;
  if (name.indexOf('เอกสาร') === 0) return PC_CONST.DOCUMENT_TYPES.OTHER_DOCUMENT;
  return PC_CONST.DOCUMENT_TYPES.UNKNOWN;
}

/** Returns a master document snapshot by document number, with a five-minute per-record cache. */
function pcMasterDocument_(documentNumber, bypassCache) {
  var docNo = normalizeDocumentNumberForPrecheck_(documentNumber);
  if (!docNo || !isValidDocumentNumberFormat_(docNo)) return null;
  var cache = CacheService.getScriptCache();
  var cacheKey = 'PC_DOC_' + hashString_(docNo).substring(0, 32);
  if (!bypassCache) {
    var cached = cache.get(cacheKey);
    if (cached) return pcParseJson_(cached, 'document cache');
  }
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(12, sheet.getLastColumn())).getValues();
  var found = null;
  for (var i = 0; i < values.length; i++) {
    if (normalizeDocumentNumberForPrecheck_(values[i][1]) !== docNo) continue;
    var activityCode = String(values[i][10] || '').trim().toUpperCase();
    var activityName = String(values[i][11] || '').trim();
    if (!activityName && activityCode) activityName = getActivityNameFallback_(activityCode);
    var validation = resolveReportValidationType_(values[i][2], docNo, '', false);
    found = {
      rowNumber: i + 2,
      documentNumber: docNo,
      documentYear: pcDocumentYear_(docNo),
      documentName: String(values[i][2] || '').trim(),
      documentType: resolveDocumentType_(values[i][2]),
      adminGroup: String(values[i][3] || '').trim(),
      workGroup: String(values[i][4] || '').trim(),
      responsiblePerson: String(values[i][5] || '').trim(),
      nonCompletedMemoLink: String(values[i][6] || '').trim(),
      finalLink: String(values[i][7] || '').trim(),
      project: String(values[i][8] || '').trim(),
      ownerEmail: String(values[i][9] || '').trim(),
      activityCode: activityCode,
      activityName: activityName,
      reportValidationType: validation.type,
      reportValidationTypeLabel: validation.label,
      requiresStatistics: validation.requiresStatistics === true
    };
    break;
  }
  if (found) cache.put(cacheKey, JSON.stringify(found), PC_CONST.DEFAULTS.LOOKUP_CACHE_SECONDS);
  return found;
}

/** Invalidates one master record cache key after a master change. */
function pcInvalidateMasterDocumentCache_(documentNumber) {
  var docNo = normalizeDocumentNumberForPrecheck_(documentNumber);
  if (docNo) CacheService.getScriptCache().remove('PC_DOC_' + hashString_(docNo).substring(0, 32));
}

/** Returns the existing final ReportSubmit row if any, using document number only as a final-state guard. */
function pcFindExistingFinalReportRow_(documentNumber) {
  var sheet = getSpreadsheet_().getSheetByName(reportSubmitSheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  var target = normalizeDocumentNumberForPrecheck_(documentNumber);
  for (var i = 0; i < values.length; i++) if (normalizeDocumentNumberForPrecheck_(values[i][0]) === target) return i + 2;
  return 0;
}

/** Public unified lookup: trusts only the document number and server-side master data. */
function lookupDocument(documentNumber) {
  try {
    var principal = getCurrentPrincipal_();
    var document = pcMasterDocument_(documentNumber, false);
    if (!document) return { success: false, document: null, workflow: 'BLOCKED', status: 'NOT_FOUND', allowedAction: 'NONE', message: 'ไม่พบหมายเลขเอกสารนี้ในศูนย์สารสนเทศกลาง' };

    // Self-healing cache: an UNKNOWN cached classification is a blocking state.
    // Re-read the master once without cache so a direct ReportNo correction becomes
    // usable immediately instead of forcing the user to wait for the five-minute TTL.
    if (document.documentType === PC_CONST.DOCUMENT_TYPES.UNKNOWN) {
      var cachedUnknown = document;
      var freshDocument = pcMasterDocument_(document.documentNumber, true);
      if (freshDocument) {
        document = freshDocument;
        if (document.documentType !== PC_CONST.DOCUMENT_TYPES.UNKNOWN) {
          pcAudit_('LOOKUP_CACHE_SELF_HEALED', {}, principal, {
            documentNumber: document.documentNumber,
            previousDocumentName: cachedUnknown.documentName,
            currentDocumentName: document.documentName,
            currentDocumentType: document.documentType
          });
        }
      }
    }

    if (document.documentType === PC_CONST.DOCUMENT_TYPES.UNKNOWN) {
      pcAudit_('LOOKUP_BLOCKED_UNKNOWN', {}, principal, { documentNumber: document.documentNumber });
      return { success: true, document: document, workflow: 'BLOCKED', status: 'UNKNOWN_DOCUMENT_TYPE', allowedAction: 'NONE', message: 'ชื่อเอกสารไม่อยู่ในรูปแบบที่ระบบรองรับ กรุณาติดต่อผู้ดูแลระบบ' };
    }
    var existingSubmission = null;
    try { if (getPrecheckConfig_().dbId) existingSubmission = pcSubmissionByDocumentNumber_(document.documentNumber); } catch (ignored) {}
    var finalConfirmed = !!document.finalLink || !!pcFindExistingFinalReportRow_(document.documentNumber) || (existingSubmission && String(existingSubmission.Status) === PC_CONST.STATUS.APPROVED_COMMITTED);
    if (finalConfirmed) {
      return { success: true, document: document, workflow: 'FINAL', status: 'FINALIZED', allowedAction: 'VIEW', submissionId: existingSubmission ? existingSubmission.SubmissionId : '' };
    }
    var workflow = 'LEGACY';
    var allowedAction = 'CONTINUE_LEGACY';
    if (document.documentType === PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY && shouldEnforcePrecheck_(document, principal)) {
      workflow = 'PRECHECK';
      allowedAction = existingSubmission ? 'RESUME_PRECHECK' : 'START_PRECHECK';
    } else if (document.documentType === PC_CONST.DOCUMENT_TYPES.NON_COMPLETED_MEMO) {
      workflow = 'NON_COMPLETED_MEMO';
    } else if (document.documentType === PC_CONST.DOCUMENT_TYPES.OTHER_DOCUMENT) {
      workflow = 'OTHER_DOCUMENT';
    }
    pcAudit_('LOOKUP', existingSubmission || {}, principal, { documentNumber: document.documentNumber, workflow: workflow });
    return { success: true, document: document, workflow: workflow, status: existingSubmission ? existingSubmission.Status : 'READY', allowedAction: allowedAction, submissionId: existingSubmission ? existingSubmission.SubmissionId : '', precheckAvailable:isPrecheckAvailable_(document), precheckRequired:workflow==='PRECHECK' };
  } catch (error) {
    throw pcHandlePublicError_(error, 'lookupDocument', { documentNumber: String(documentNumber || '') });
  }
}

/** Returns the existing final folder id for a trusted admin group. */
function pcFinalFolderIdForAdminGroup_(adminGroup) {
  var settings = getGlobalSettings_();
  var map = {
    'กลุ่มบริหารวิชาการ': 'FOLDER_ACADEMIC',
    'กลุ่มบริหารงบประมาณ': 'FOLDER_BUDGET',
    'กลุ่มบริหารทั่วไป': 'FOLDER_GENERAL',
    'กลุ่มบริหารงานบุคคล': 'FOLDER_PERSONNEL'
  };
  var key = map[String(adminGroup || '').trim()];
  var folderId = key ? String(settings[key] || '').trim() : '';
  if (!folderId) throw pcUserError_('ไม่พบปลายทางจัดเก็บไฟล์ของกลุ่มบริหารนี้ กรุณาแจ้งผู้ดูแลระบบ', 'FINAL_FOLDER_MISSING');
  return folderId;
}

/** Reads ReportSubmit once to detect an idempotent legacy final row or a conflicting row for the same document number. */
function pcLegacyReportSubmitState_(documentNumber, fileUrl) {
  var sheet = getSpreadsheet_().getSheetByName(reportSubmitSheetName);
  if (!sheet || sheet.getLastRow() < 2) return { sameRow:0, conflictRows:[] };
  var values = sheet.getRange(2, 2, sheet.getLastRow() - 1, 6).getValues(); // B:G
  var target = normalizeDocumentNumberForPrecheck_(documentNumber), conflicts=[], same=0;
  for (var i = 0; i < values.length; i++) {
    if (normalizeDocumentNumberForPrecheck_(values[i][0]) !== target) continue;
    var url = String(values[i][5] || '').trim();
    if (url && pcSameDriveFile_(url, fileUrl)) same = i + 2;
    else conflicts.push(i + 2);
  }
  return { sameRow:same, conflictRows:conflicts };
}
