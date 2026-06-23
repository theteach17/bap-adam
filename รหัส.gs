var sheetName = 'ReportNo';
var reportSubmitSheetName = 'ReportSubmit';
var reportNoActivityNameColumn = 12; // L: ชื่อกิจกรรม (เพิ่มท้ายตารางเพื่อไม่กระทบคอลัมน์ A-K เดิม)
var reportNoActivityNameHeader = 'ชื่อกิจกรรม';
var reportSubmitExtendedStartColumn = 20; // T: เพิ่มข้อมูลใหม่ท้ายตาราง ReportSubmit เพื่อไม่กระทบคอลัมน์ A-S เดิม
var reportSubmitExtendedHeaders = [
  'ชื่อกิจกรรม',
  'บรรลุผลที่คาดว่าจะได้รับ',
  'ค่า X̄ (X Bar) ความพึงพอใจ',
  'ค่า SD ความพึงพอใจ',
  'ค่า SD ผลการบริหารกิจกรรม',
  'ประเภทเอกสารสำหรับการตรวจค่าสถิติ'
];
var reportValidationTypes = {
  REPORT_ACTIVITY: 'รายงานผลการดำเนินกิจกรรม',
  NON_COMPLETED_MEMO: 'บันทึกข้อความชี้แจงไม่ดำเนินกิจกรรม',
  OTHER_DOCUMENT: 'เอกสารอื่น ๆ'
};
var reportNameAllowedPrefixes = [
  'รายงานผลการดำเนินกิจกรรม',
  'บันทึกข้อความชี้แจงไม่ดำเนินกิจกรรม',
  'เอกสาร'
];
var documentNumberAllowedPattern = /^(บง|บว|บท|บค)\s*\d+\s*\/\s*\d{4}$/;
var scriptProp = PropertiesService.getScriptProperties();

function initialSetup() {
  var activeSpreadsheet = SpreadsheetApp.openById('1hGYwUELNW7-MZpjZMYOLtCEChgFrbj06Cj0ILRJw05I');
  scriptProp.setProperty('key', activeSpreadsheet.getId());
}

// =========================================================================
// [SECURITY PATCH] Session / Auth Guard สำหรับ Web App ที่ใช้งานจริง
// จุดประสงค์:
// 1) ป้องกันการเปิด Index.html โดยตรงผ่าน ?page=Index โดยไม่ได้ login
// 2) ตรวจสิทธิ์ซ้ำในทุก server-side function ที่อ่าน/เขียนข้อมูล
// 3) ไม่เปลี่ยน UI / คำบนหน้าเว็บ / workflow เดิมของผู้ใช้
// 4) ไม่เปลี่ยน deployment executeAs/access เดิม เพื่อลดผลกระทบต่อระบบจริง
// =========================================================================
var SESSION_SHEET_NAME = 'Sessions';
var SESSION_DURATION_MINUTES = 8 * 60; // 8 ชั่วโมงต่อการเข้าสู่ระบบ 1 ครั้ง
var SESSION_TOUCH_INTERVAL_MINUTES = 5; // ลดการเขียน LastSeenAt ถี่เกินไป
var PUBLIC_PAGES = ['Login'];
var PROTECTED_PAGES = ['Index'];
var DEFAULT_WEB_TITLE = 'ศูนย์สารสนเทศกลาง KIC';
var DEFAULT_LOGO_URL = 'https://img2.pic.in.th/pic/logofd3322a65d133ac4.png';

function getSpreadsheet_() {
  var key = scriptProp.getProperty('key');
  if (!key) {
    throw new Error('System Error: ยังไม่ได้ตั้งค่า Script Properties ชื่อ key กรุณารัน initialSetup() ก่อนใช้งาน');
  }
  return SpreadsheetApp.openById(key);
}

var reportNameMinDetailLength = 8;
var reportNameDecorativeCharsRegex = /[\s.。…\-–—_:：\/\\|,，;；"'“”‘’()\[\]{}<>]+/g;

function validateReportNameDetail_(reportName) {
  var value = String(reportName || '').trim();

  if (!value) {
    return {
      valid: false,
      reason: 'EMPTY',
      message: 'กรุณาระบุชื่อเอกสาร'
    };
  }

  var matchedPrefix = '';
  for (var i = 0; i < reportNameAllowedPrefixes.length; i++) {
    var prefix = reportNameAllowedPrefixes[i];
    if (value.indexOf(prefix) === 0) {
      matchedPrefix = prefix;
      break;
    }
  }

  if (!matchedPrefix) {
    return {
      valid: false,
      reason: 'INVALID_PREFIX',
      message: 'ชื่อเอกสารต้องเริ่มต้นด้วยวลีที่ระบบกำหนดแบบตรงตัวเท่านั้น'
    };
  }

  var suffixRaw = value.substring(matchedPrefix.length);
  var meaningfulDetail = suffixRaw.replace(reportNameDecorativeCharsRegex, '').trim();

  if (meaningfulDetail.length < reportNameMinDetailLength) {
    return {
      valid: false,
      reason: 'MISSING_DETAIL',
      prefix: matchedPrefix,
      message: 'ชื่อเอกสารยังไม่สมบูรณ์ กรุณาระบุรายละเอียดต่อท้ายวลีขึ้นต้น เพื่อให้ทราบว่าเป็นรายงาน/บันทึก/เอกสารเรื่องใด'
    };
  }

  return {
    valid: true,
    reason: 'OK',
    prefix: matchedPrefix,
    detail: String(suffixRaw || '').trim()
  };
}

function isValidReportNamePrefix_(reportName) {
  return validateReportNameDetail_(reportName).valid;
}

function getReportNamePrefixErrorMessage_(validationResult) {
  var result = validationResult || { reason: 'INVALID_PREFIX' };

  if (result.reason === 'MISSING_DETAIL') {
    return 'ชื่อเอกสารยังไม่สมบูรณ์ กรุณาระบุรายละเอียดต่อท้ายวลีขึ้นต้น เช่น "รายงานผลการดำเนินกิจกรรมโครงการ..." หรือ "บันทึกข้อความชี้แจงไม่ดำเนินกิจกรรมตามแผนปฏิบัติการ..." หรือ "เอกสารแบบรายงานผล..."';
  }

  return 'ชื่อเอกสารไม่ถูกต้อง กรุณาระบุชื่อเอกสารให้เริ่มต้นด้วยวลีที่กำหนดแบบตรงตัวเท่านั้น คือ "รายงานผลการดำเนินกิจกรรม" หรือ "บันทึกข้อความชี้แจงไม่ดำเนินกิจกรรม" หรือ "เอกสาร" และต้องมีรายละเอียดต่อท้าย';
}

function normalizeDocumentNumber_(value) {
  var raw = String(value || '').trim().replace(/\s+/g, ' ');
  var match = raw.match(/^(บง|บว|บท|บค)\s*(\d+)\s*\/\s*(\d{4})$/);
  return match ? match[1] + ' ' + match[2] + '/' + match[3] : raw;
}

function isValidDocumentNumberFormat_(value) {
  return documentNumberAllowedPattern.test(String(value || '').trim());
}

function getDocumentNumberFormatErrorMessage_() {
  return 'รูปแบบหมายเลขเอกสารไม่ถูกต้อง ต้องเป็น บง 123/2568, บว 123/2568, บท 123/2568 หรือ บค 123/2568 เท่านั้น';
}

function findReportNoRecordByDocumentNumber_(documentNumber) {
  var docNo = normalizeDocumentNumber_(documentNumber);
  if (!docNo) return null;

  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var rowDocNo = normalizeDocumentNumber_(data[i][1]);
    if (rowDocNo === docNo) {
      var row = data[i];
      var activityCode = String(row[10] || '').trim().toUpperCase();
      var activityName = String(row[11] || '').trim();
      if (!activityName && activityCode) {
        activityName = getActivityNameFallback_(activityCode);
      }
      var reportName = row[2];
      var validationInfo = resolveReportValidationType_(reportName, docNo, '');
      return {
        rowNumber: i + 1,
        documentNumber: docNo,
        reportName: reportName,
        adminGroup: row[3],
        workGroup: row[4],
        responsiblePerson: row[5],
        actionPlanProject: row[8],
        email: row[9],
        activityCode: activityCode,
        activityName: activityName,
        reportValidationType: validationInfo.type,
        reportValidationTypeLabel: validationInfo.label,
        reportValidationMode: validationInfo.mode,
        requiresStatistics: validationInfo.requiresStatistics
      };
    }
  }
  return null;
}


function ensureReportNoActivityNameColumn_(sheet) {
  if (!sheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + sheetName + "'");

  var headerCell = sheet.getRange(1, reportNoActivityNameColumn);
  var currentHeader = String(headerCell.getValue() || '').trim();

  if (!currentHeader) {
    headerCell.setValue(reportNoActivityNameHeader);
    return;
  }

  if (currentHeader !== reportNoActivityNameHeader) {
    throw new Error(
      'ตรวจพบว่าคอลัมน์ L ของชีต ReportNo มีหัวคอลัมน์ "' + currentHeader +
      '" อยู่แล้ว ระบบจึงไม่บันทึกชื่อกิจกรรมเพื่อป้องกันการเขียนทับข้อมูลเดิม กรุณาตรวจสอบคอลัมน์ L และตั้งหัวคอลัมน์เป็น "' +
      reportNoActivityNameHeader + '" ก่อนใช้งาน'
    );
  }
}



function isLegacy2568Document_(documentNumber) {
  return /\/2568\s*$/.test(String(documentNumber || '').trim());
}

function resolveReportValidationType_(reportName, documentNumber, selectedType, strict) {
  var name = String(reportName || '').trim();
  var selected = String(selectedType || '').trim();

  if (name.indexOf('รายงานผลการดำเนินกิจกรรม') === 0) {
    return {
      type: 'REPORT_ACTIVITY',
      label: reportValidationTypes.REPORT_ACTIVITY,
      mode: 'AUTO_PREFIX',
      requiresStatistics: true
    };
  }

  if (name.indexOf('บันทึกข้อความชี้แจงไม่ดำเนินกิจกรรม') === 0) {
    return {
      type: 'NON_COMPLETED_MEMO',
      label: reportValidationTypes.NON_COMPLETED_MEMO,
      mode: 'AUTO_PREFIX',
      requiresStatistics: false
    };
  }

  if (name.indexOf('เอกสาร') === 0) {
    return {
      type: 'OTHER_DOCUMENT',
      label: reportValidationTypes.OTHER_DOCUMENT,
      mode: 'AUTO_PREFIX',
      requiresStatistics: false
    };
  }

  if (isLegacy2568Document_(documentNumber)) {
    if (selected) {
      if (!reportValidationTypes[selected]) {
        throw new Error('ประเภทเอกสารสำหรับการตรวจค่าสถิติไม่ถูกต้อง');
      }
      return {
        type: selected,
        label: reportValidationTypes[selected],
        mode: 'LEGACY_2568_SELECTED',
        requiresStatistics: selected === 'REPORT_ACTIVITY'
      };
    }
    if (strict) {
      throw new Error('รายการเอกสาร /2568 นี้ไม่สามารถจำแนกประเภทจากชื่อเอกสารได้ กรุณาเลือกประเภทเอกสารสำหรับการตรวจค่าสถิติก่อนส่งรายงาน');
    }
    return {
      type: '',
      label: '',
      mode: 'LEGACY_2568_UNKNOWN',
      requiresStatistics: false
    };
  }

  if (strict) {
    throw new Error('ชื่อเอกสารไม่เป็นไปตามมาตรฐานใหม่ กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบชื่อเอกสารก่อนส่งรายงาน');
  }

  return {
    type: '',
    label: '',
    mode: 'INVALID_STANDARD_NAME',
    requiresStatistics: false
  };
}

function validateDecimalTwoPlaces_(value, min, max, fieldLabel, required) {
  var text = String(value || '').trim();
  if (!text) {
    if (required) throw new Error(fieldLabel + ' จำเป็นต้องกรอก');
    return '';
  }

  if (!/^\d+\.\d{2}$/.test(text)) {
    throw new Error(fieldLabel + ' ต้องเป็นเลขทศนิยม 2 หลัก เช่น 4.50');
  }

  var numberValue = Number(text);
  if (isNaN(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(fieldLabel + ' ต้องอยู่ระหว่าง ' + min.toFixed(2) + ' ถึง ' + max.toFixed(2));
  }
  return numberValue;
}

function ensureReportSubmitExtendedColumns_(sheet) {
  if (!sheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + reportSubmitSheetName + "'");

  var existing = sheet.getRange(1, reportSubmitExtendedStartColumn, 1, reportSubmitExtendedHeaders.length).getValues()[0];
  var shouldWriteHeaders = existing.every(function(value) { return String(value || '').trim() === ''; });

  if (shouldWriteHeaders) {
    sheet.getRange(1, reportSubmitExtendedStartColumn, 1, reportSubmitExtendedHeaders.length).setValues([reportSubmitExtendedHeaders]);
    return;
  }

  for (var i = 0; i < reportSubmitExtendedHeaders.length; i++) {
    var current = String(existing[i] || '').trim();
    if (current !== reportSubmitExtendedHeaders[i]) {
      var columnLetter = String.fromCharCode('T'.charCodeAt(0) + i);
      throw new Error(
        'ตรวจพบว่าคอลัมน์ ' + columnLetter + ' ของชีต ReportSubmit มีหัวคอลัมน์ "' + current +
        '" อยู่แล้ว ระบบจึงไม่บันทึกข้อมูลใหม่เพื่อป้องกันการเขียนทับข้อมูลเดิม กรุณาตรวจสอบให้หัวคอลัมน์ T-Y ตรงกับที่ระบบกำหนด'
      );
    }
  }
}

function getActivityNameFallback_(activityCode) {
  var code = String(activityCode || '').trim().toUpperCase();
  if (!code) return '';
  var info = getActivityInfo(code);
  return info ? String(info.activityName || '').trim() : '';
}

function getCurrentUserKey_() {
  var key = Session.getTemporaryActiveUserKey();
  if (!key) {
    throw new Error('ไม่สามารถระบุตัวตนผู้ใช้งานได้ กรุณาเข้าสู่ระบบด้วยบัญชี Google ในโดเมนโรงเรียน แล้วลองใหม่อีกครั้ง');
  }
  return key;
}

function hashString_(value) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return raw.map(function(byte) {
    var v = byte < 0 ? byte + 256 : byte;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function parseBoolean_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function ensureSessionsSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SESSION_SHEET_NAME);
  if (sheet) return sheet;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบกำลังเตรียมชีต Sessions โปรดลองใหม่อีกครั้ง');
  }

  try {
    sheet = ss.getSheetByName(SESSION_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SESSION_SHEET_NAME);
      sheet.getRange(1, 1, 1, 11).setValues([[
        'SessionIdHash',
        'UserKeyHash',
        'Username',
        'DisplayName',
        'LoginAt',
        'LastSeenAt',
        'ExpiresAt',
        'Active',
        'LogoutAt',
        'LastAction',
        'LoginRedirectPending'
      ]]);
      sheet.setFrozenRows(1);
    }
    return sheet;
  } finally {
    lock.releaseLock();
  }
}

function buildSessionRecord_(row, rowNumber) {
  return {
    rowNumber: rowNumber,
    sessionIdHash: row[0],
    userKeyHash: row[1],
    username: row[2],
    displayName: row[3],
    loginAt: row[4],
    lastSeenAt: row[5],
    expiresAt: row[6],
    active: parseBoolean_(row[7]),
    logoutAt: row[8],
    lastAction: row[9],
    loginRedirectPending: parseBoolean_(row[10])
  };
}

function deactivateSessionsForUserKey_(sheet, userKeyHash, exceptRowNumber) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var now = new Date();
  values.forEach(function(row, index) {
    var rowNumber = index + 2;
    if (rowNumber === exceptRowNumber) return;
    if (row[1] === userKeyHash && parseBoolean_(row[7])) {
      sheet.getRange(rowNumber, 8).setValue(false); // Active
      sheet.getRange(rowNumber, 9).setValue(now);   // LogoutAt
      sheet.getRange(rowNumber, 10).setValue('replaced_by_new_login');
      sheet.getRange(rowNumber, 11).setValue(false);
    }
  });
}

function createSession_(username, displayName) {
  var userKey = getCurrentUserKey_();
  var userKeyHash = hashString_(userKey);
  var sessionId = Utilities.getUuid() + ':' + new Date().getTime() + ':' + userKey;
  var sessionIdHash = hashString_(sessionId);
  var now = new Date();
  var expiresAt = new Date(now.getTime() + SESSION_DURATION_MINUTES * 60 * 1000);
  var sheet = ensureSessionsSheet_();

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบกำลังประมวลผลการเข้าสู่ระบบหลายรายการ โปรดลองใหม่อีกครั้ง');
  }

  try {
    deactivateSessionsForUserKey_(sheet, userKeyHash, null);
    sheet.appendRow([
      sessionIdHash,
      userKeyHash,
      username,
      displayName,
      now,
      now,
      expiresAt,
      true,
      '',
      'login',
      true // LoginRedirectPending: ใช้รองรับ Login.html เดิมที่เรียก getWebAppUrl() หลัง login สำเร็จ
    ]);
  } finally {
    lock.releaseLock();
  }

  return sessionIdHash;
}

function getActiveSession_(options) {
  options = options || {};
  var userKey;
  try {
    userKey = getCurrentUserKey_();
  } catch (e) {
    return { valid: false, reason: e.message };
  }

  var userKeyHash = hashString_(userKey);
  var sheet = ensureSessionsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { valid: false, reason: 'no_session' };

  var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var now = new Date();
  var foundExpiredRow = null;

  for (var i = values.length - 1; i >= 0; i--) {
    var session = buildSessionRecord_(values[i], i + 2);
    if (session.userKeyHash !== userKeyHash) continue;
    if (!session.active) continue;

    var expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
    if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
      foundExpiredRow = session.rowNumber;
      break;
    }

    if (options.touch) {
      var shouldTouch = true;
      if (session.lastSeenAt) {
        var lastSeenAt = new Date(session.lastSeenAt);
        shouldTouch = (now.getTime() - lastSeenAt.getTime()) >= SESSION_TOUCH_INTERVAL_MINUTES * 60 * 1000;
      }
      if (shouldTouch) {
        sheet.getRange(session.rowNumber, 6).setValue(now); // LastSeenAt
        sheet.getRange(session.rowNumber, 10).setValue(options.action || 'activity'); // LastAction
      }
    }

    session.valid = true;
    session.sheet = sheet;
    return session;
  }

  if (foundExpiredRow) {
    sheet.getRange(foundExpiredRow, 8).setValue(false); // Active
    sheet.getRange(foundExpiredRow, 9).setValue(now);   // LogoutAt
    sheet.getRange(foundExpiredRow, 10).setValue('expired');
    sheet.getRange(foundExpiredRow, 11).setValue(false);
  }

  return { valid: false, reason: 'expired_or_not_found' };
}

function requireAuth_(action) {
  var session = getActiveSession_({ touch: true, action: action || 'server_function' });
  if (!session.valid) {
    throw new Error('Unauthorized: กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
  }
  return session;
}

function invalidateCurrentSession_(reason) {
  var session = getActiveSession_({ touch: false });
  if (!session.valid || !session.sheet || !session.rowNumber) return false;
  var now = new Date();
  session.sheet.getRange(session.rowNumber, 8).setValue(false); // Active
  session.sheet.getRange(session.rowNumber, 9).setValue(now);   // LogoutAt
  session.sheet.getRange(session.rowNumber, 10).setValue(reason || 'logout');
  session.sheet.getRange(session.rowNumber, 11).setValue(false);
  return true;
}

function consumeLoginRedirectIfNeeded_() {
  var session = getActiveSession_({ touch: true, action: 'login_redirect' });
  if (!session.valid || !session.sheet || !session.rowNumber) return false;
  if (session.loginRedirectPending) {
    session.sheet.getRange(session.rowNumber, 11).setValue(false);
    return true;
  }
  return false;
}

function renderPage_(page) {
  var settings = {};
  try {
    settings = getGlobalSettings();
  } catch (e) {
    Logger.log('getGlobalSettings failed in renderPage_: ' + e.message);
  }
  var webTitle = settings['WEB_TITLE'] || DEFAULT_WEB_TITLE;
  var logoUrl = settings['LOGO_URL'] || DEFAULT_LOGO_URL;

  return HtmlService.createHtmlOutputFromFile(page)
    .setTitle(webTitle)
    .setFaviconUrl(logoUrl)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ==========================================
// [EDITED] ฟังก์ชันแก้ไข: ทำระบบดักจับข้อผิดพลาดและดึงค่าตั้งค่า
// ==========================================

function doGet(e) {
  try {
    e = e || { parameter: {} };
    var requestedPage = (e.parameter && e.parameter.page) ? String(e.parameter.page) : 'Login';

    // Allowlist เท่านั้น: ไม่เปิดไฟล์ HTML จาก parameter โดยตรง
    if (PUBLIC_PAGES.indexOf(requestedPage) !== -1) {
      return renderPage_(requestedPage);
    }

    if (PROTECTED_PAGES.indexOf(requestedPage) !== -1) {
      var session = getActiveSession_({ touch: true, action: 'open_' + requestedPage });
      if (!session.valid) {
        return renderPage_('Login');
      }
      return renderPage_(requestedPage);
    }

    // หน้าใดที่ไม่อยู่ใน allowlist ให้กลับ Login เสมอ
    return renderPage_('Login');
  } catch (error) {
    Logger.log('doGet error: ' + error.message);
    return ContentService.createTextOutput('เกิดข้อผิดพลาดในการโหลดระบบ: ' + error.message);
  }
}



function checkLogin(username, password) {
  username = (username || '').toString().trim();
  password = (password || '').toString();

  if (!username || !password) {
    logAction(username || 'unknown', 'เข้าสู่ระบบ', 'ล้มเหลว', 'missing_username_or_password');
    return { success: false, name: '' };
  }

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName('Credential');
  if (!sheet) {
    throw new Error("System Error: ไม่พบแผ่นงานชื่อ 'Credential'");
  }

  const data = sheet.getDataRange().getValues();
  let loginSuccess = false;
  let name = '';
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === username && String(data[i][1]) === password) {
      loginSuccess = true;
      name = data[i][4] || username;
      break;
    }
  }

  if (loginSuccess) {
    createSession_(username, name);
  }

  logAction(username, 'เข้าสู่ระบบ', loginSuccess ? 'สำเร็จ' : 'ล้มเหลว', name);
  return { success: loginSuccess, name: name };
}


function logAction(username, action, result, documentNumberOrProjectName = '') {
  try {
    const ss = SpreadsheetApp.openById(scriptProp.getProperty('key'));
    const logSheet = ss.getSheetByName('Logfile');
    const date = new Date();
    const formattedDate = Utilities.formatDate(date, 'GMT+7', 'dd/MM/yyyy');
    const formattedTime = Utilities.formatDate(date, 'GMT+7', 'HH:mm:ss');
    const actionText = documentNumberOrProjectName ? `${action} - ${documentNumberOrProjectName}` : action;
    
    // ใช้วิธี appendRow เพื่อป้องกัน Race Condition ในไฟล์ Log
    // [Date, Time, Username, Action, Result]
    logSheet.appendRow([formattedDate, formattedTime, username, actionText, result]);
  } catch (e) {
    Logger.log("Error in logAction (non-critical): " + e.message);
    // ไม่ throw error ต่อ เพื่อให้การทำงานหลักของผู้ใช้ดำเนินต่อไปได้
  }
}


function getData(search, limit, page) {
  requireAuth_('getData');
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log("Error: Sheet '" + sheetName + "' not found.");
    return { headers: [], data: [], total: 0 };
  }
  search = (search || '').toString().toLowerCase();
  limit = parseInt(limit, 10) || 10;
  page = parseInt(page, 10) || 1;

  var data = sheet.getDataRange().getValues();
  var headers = data.shift();
  var filteredData = data.filter(row => row.some(cell => cell.toString().toLowerCase().includes(search)));
  var nonEmptyRows = filteredData.filter(row => row.some(cell => cell.toString().trim() !== ""));
  nonEmptyRows.reverse();
  var startIndex = (page - 1) * limit;
  var endIndex = startIndex + limit;
  var pageData = nonEmptyRows.slice(startIndex, endIndex);
  return { headers: headers, data: pageData, total: nonEmptyRows.length };
}



function getDocumentData(documentNumber) {
  requireAuth_('getDocumentData');
  var record = findReportNoRecordByDocumentNumber_(documentNumber);
  if (!record) return null;
  return {
    documentNumber: record.documentNumber,
    reportName: record.reportName, // C
    adminGroup: record.adminGroup, // D
    workGroup: record.workGroup, // E
    responsiblePerson: record.responsiblePerson, // F
    actionPlanProject: record.actionPlanProject, // I
    email: record.email, // J
    activityCode: record.activityCode, // K
    activityName: record.activityName, // L หรือ fallback จาก LinkBAP
    reportValidationType: record.reportValidationType,
    reportValidationTypeLabel: record.reportValidationTypeLabel,
    reportValidationMode: record.reportValidationMode,
    requiresStatistics: record.requiresStatistics
  };
}

function saveData(reportName, adminGroup, workGroup, responsiblePerson, actionPlanProject, email, activityCode, activityName, loggedUser) {
  var session = requireAuth_('saveData');

  // Backward compatibility: หากหน้าเว็บเก่าเรียก saveData ด้วย 8 arguments
  // ค่าตัวที่ 8 จะเป็น loggedUser เดิม ไม่ใช่ activityName
  if (arguments.length === 8) {
    loggedUser = activityName;
    activityName = '';
  }

  reportName = String(reportName || '').trim();
  adminGroup = String(adminGroup || '').trim();
  workGroup = String(workGroup || '').trim();
  responsiblePerson = String(responsiblePerson || '').trim();
  actionPlanProject = String(actionPlanProject || '').trim();
  email = String(email || '').trim();
  activityCode = String(activityCode || '').trim().toUpperCase();
  activityName = String(activityName || '').trim();

  if (!reportName || !adminGroup || !workGroup || !responsiblePerson || !actionPlanProject || !email) {
    throw new Error('กรุณากรอกข้อมูลให้ครบทุกช่อง');
  }

  var reportNameValidation = validateReportNameDetail_(reportName);
  if (!reportNameValidation.valid) {
    throw new Error(getReportNamePrefixErrorMessage_(reportNameValidation));
  }

  if (activityCode) {
    var activityInfo = getActivityInfo(activityCode);
    if (!activityInfo) {
      throw new Error('ไม่พบรหัสกิจกรรมนี้ในฐานข้อมูล LinkBAP กรุณาตรวจสอบรหัสกิจกรรมให้ถูกต้อง หรือเว้นว่างไว้หากต้องการกรอกข้อมูลเอง');
    }
    activityName = String(activityInfo.activityName || activityName || '').trim();
    if (!activityName) {
      throw new Error('พบรหัสกิจกรรมแล้ว แต่ไม่พบข้อมูลชื่อกิจกรรมใน LinkBAP กรุณาตรวจสอบฐานข้อมูลกิจกรรม');
    }
  } else {
    if (!activityName) {
      throw new Error('กรณีไม่กรอกรหัสกิจกรรม ต้องกรอกชื่อกิจกรรม');
    }
    if (activityName.indexOf('กิจกรรม') !== 0) {
      throw new Error('กรณีไม่กรอกรหัสกิจกรรม ชื่อกิจกรรมต้องขึ้นต้นด้วยคำว่า "กิจกรรม"');
    }
  }

  var auditUser = session.displayName || session.username || responsiblePerson || loggedUser;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบกำลังประมวลผลคำขออื่น โปรดรอสักครู่แล้วลองใหม่อีกครั้ง (Server is busy)');
  }

  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + sheetName + "'");

    ensureReportNoActivityNameColumn_(sheet);

    // คงตรรกะเดิม: หาตำแหน่งแถวใหม่จากคอลัมน์ C เพื่อไม่กระทบสูตรเลขทะเบียนในชีต
    var lastRow = sheet.getRange("C:C").getValues().filter(String).length;
    var newRow = lastRow + 1;

    sheet.getRange(newRow, 3).setValue(reportName); // C
    sheet.getRange(newRow, 4).setValue(adminGroup); // D
    sheet.getRange(newRow, 5).setValue(workGroup); // E
    sheet.getRange(newRow, 6).setValue(responsiblePerson); // F
    sheet.getRange(newRow, 9).setValue(actionPlanProject); // I
    sheet.getRange(newRow, 10).setValue(email); // J
    sheet.getRange(newRow, 11).setValue(activityCode); // K
    sheet.getRange(newRow, reportNoActivityNameColumn).setValue(activityName); // L

    SpreadsheetApp.flush();
    var documentNumber = sheet.getRange(newRow, 2).getValue();

    logAction(auditUser, 'ขอเลขทะเบียนเอกสาร', 'สำเร็จ', documentNumber);
    return documentNumber;
  } catch (e) {
    Logger.log('Error in locked saveData: ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}


// =========================================================================
// [EDITED] 2. ฟังก์ชันส่งรายงานฉบับสมบูรณ์
// =========================================================================

function saveReport(documentNumber, fileId, quantitativeTarget, quantitativeResult, qualitativeTarget, qualitativeResult, expectedTarget, expectedResult, actionPlanProject, allocatedBudget, actualBudget, activityName, expectedAchievementResult, satisfactionXbar, satisfactionSD, managementSD, reportValidationType, loggedUser) {
  var session = requireAuth_('saveReport');
  var documentData = getDocumentData(documentNumber);
  if (!documentData) throw new Error('Invalid document number');

  // Backward compatibility: หน้าเว็บเก่าจะส่ง loggedUser มาเป็น argument ที่ 12
  if (arguments.length <= 12) {
    loggedUser = activityName;
    activityName = documentData.activityName || '';
    expectedAchievementResult = '';
    satisfactionXbar = '';
    satisfactionSD = '';
    managementSD = '';
    reportValidationType = '';
  }

  documentNumber = String(documentNumber || '').trim();
  quantitativeTarget = String(quantitativeTarget || '').trim();
  quantitativeResult = String(quantitativeResult || '').trim();
  qualitativeTarget = String(qualitativeTarget || '').trim();
  qualitativeResult = String(qualitativeResult || '').trim();
  expectedTarget = String(expectedTarget || '').trim();
  expectedResult = String(expectedResult || '').trim();
  actionPlanProject = String(actionPlanProject || documentData.actionPlanProject || '').trim();
  allocatedBudget = String(allocatedBudget || '').trim();
  actualBudget = String(actualBudget || '').trim();
  activityName = String(activityName || documentData.activityName || '').trim();
  expectedAchievementResult = String(expectedAchievementResult || '').trim();
  satisfactionXbar = String(satisfactionXbar || '').trim();
  satisfactionSD = String(satisfactionSD || '').trim();
  managementSD = String(managementSD || '').trim();
  reportValidationType = String(reportValidationType || '').trim();

  if (!quantitativeTarget || !quantitativeResult || !qualitativeTarget || !qualitativeResult || !expectedTarget || !actionPlanProject || !allocatedBudget || !actualBudget) {
    throw new Error('กรุณากรอกข้อมูลรายงานให้ครบถ้วน');
  }

  if (expectedAchievementResult !== 'บรรลุ' && expectedAchievementResult !== 'ไม่บรรลุ') {
    throw new Error('กรุณาเลือกผลบรรลุผลที่คาดว่าจะได้รับ');
  }

  var validationInfo = resolveReportValidationType_(documentData.reportName, documentNumber, reportValidationType, true);
  var requiresStatistics = validationInfo.requiresStatistics === true;

  var managementXbarValue = validateDecimalTwoPlaces_(expectedResult, 0.01, 5.00, 'ค่า X̄ (X Bar) ของผลการบริหารกิจกรรม', requiresStatistics);
  var satisfactionXbarValue = validateDecimalTwoPlaces_(satisfactionXbar, 0.01, 5.00, 'ค่า X̄ (X Bar) ความพึงพอใจ', requiresStatistics);
  var satisfactionSDValue = validateDecimalTwoPlaces_(satisfactionSD, 0.01, 1.00, 'ค่า SD ความพึงพอใจ', requiresStatistics);
  var managementSDValue = validateDecimalTwoPlaces_(managementSD, 0.01, 1.00, 'ค่า SD ผลการบริหารกิจกรรม', requiresStatistics);

  var auditUser = session.displayName || session.username || documentData.responsiblePerson || loggedUser;
  var fileUrl;
  try {
    fileUrl = DriveApp.getFileById(fileId).getUrl();
  } catch (e) {
    Logger.log(e);
    throw new Error('ไม่พบไฟล์ที่อัปโหลด (ID: ' + fileId + ')');
  }

  var ss = getSpreadsheet_();
  var reportSubmitSheet = ss.getSheetByName(reportSubmitSheetName);
  if (!reportSubmitSheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + reportSubmitSheetName + "'");

  ensureReportSubmitExtendedColumns_(reportSubmitSheet);

  var newRowData = new Array(25).fill(''); // A-Y
  newRowData[1] = documentNumber; // B
  newRowData[2] = documentData.reportName; // C
  newRowData[3] = documentData.adminGroup; // D
  newRowData[4] = documentData.workGroup; // E
  newRowData[5] = documentData.responsiblePerson; // F
  newRowData[6] = fileUrl; // G
  newRowData[7] = quantitativeTarget; // H
  newRowData[8] = qualitativeTarget; // I
  newRowData[9] = quantitativeResult; // J
  newRowData[10] = qualitativeResult; // K
  newRowData[11] = expectedTarget; // L
  newRowData[12] = managementXbarValue === '' ? '' : managementXbarValue; // M: คงคอลัมน์เดิม
  newRowData[14] = actionPlanProject; // O
  newRowData[15] = documentData.email; // P
  newRowData[16] = allocatedBudget; // Q
  newRowData[17] = actualBudget; // R
  newRowData[18] = (documentData.activityCode || '').toString().trim().toUpperCase(); // S
  newRowData[19] = activityName; // T
  newRowData[20] = expectedAchievementResult; // U
  newRowData[21] = satisfactionXbarValue === '' ? '' : satisfactionXbarValue; // V
  newRowData[22] = satisfactionSDValue === '' ? '' : satisfactionSDValue; // W
  newRowData[23] = managementSDValue === '' ? '' : managementSDValue; // X
  newRowData[24] = validationInfo.label || validationInfo.type; // Y

  // คงตรรกะเดิม: append รายการธุรกรรมก่อน แล้วจึง update master list ภายใต้ lock
  reportSubmitSheet.appendRow(newRowData);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Server is busy, could not update master list. Please try again.');
  }

  try {
    var reportNoSheet = ss.getSheetByName(sheetName);
    if (!reportNoSheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + sheetName + "'");
    var data = reportNoSheet.getDataRange().getValues();
    var updated = false;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][1] || '').trim() === documentNumber) {
        reportNoSheet.getRange(i + 1, 8).setValue(fileUrl); // H
        updated = true;
        break;
      }
    }
    if (!updated) throw new Error('ไม่พบหมายเลขเอกสารในชีตหลักหลังจากบันทึกรายงาน');
  } catch (e) {
    Logger.log('Error in locked saveReport (part 2): ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }

  logAction(auditUser, 'ส่งรายงาน', 'สำเร็จ', documentNumber);
}


// =========================================================================
// [EDITED] 3. ฟังก์ชันบันทึกกิจกรรมที่ไม่ได้ดำเนินการ (เพิ่มการคัดลอกรหัสกิจกรรมไปคอลัมน์ S)
// =========================================================================

function saveNonCompletedProject(projectName, adminGroup, workGroup, responsiblePerson, reason, fileId, actionPlanProject, documentNumber, loggedUser) {
  var session = requireAuth_('saveNonCompletedProject');
  var auditUser = session.displayName || session.username || responsiblePerson || loggedUser;

  documentNumber = normalizeDocumentNumber_(documentNumber);
  projectName = String(projectName || '').trim();
  reason = String(reason || '').trim();
  fileId = String(fileId || '').trim();

  if (!documentNumber) {
    throw new Error('กรุณาระบุหมายเลขเอกสาร');
  }
  if (!isValidDocumentNumberFormat_(documentNumber)) {
    throw new Error(getDocumentNumberFormatErrorMessage_());
  }
  if (!reason) {
    throw new Error('กรุณาระบุเหตุผลที่ไม่ดำเนินการโครงการ/กิจกรรม');
  }
  if (!fileId) {
    throw new Error('ไม่พบรหัสไฟล์ที่อัปโหลด กรุณาอัปโหลดไฟล์ PDF ใหม่อีกครั้ง');
  }

  var documentRecord = findReportNoRecordByDocumentNumber_(documentNumber);
  if (!documentRecord) {
    throw new Error('ไม่พบหมายเลขเอกสารนี้ในชีต ReportNo จึงไม่สามารถบันทึกลง ReportSubmit ได้');
  }

  var fileUrl;
  try {
    fileUrl = DriveApp.getFileById(fileId).getUrl();
  } catch (e) {
    Logger.log(e);
    throw new Error('ไม่พบไฟล์ที่อัปโหลด (ID: ' + fileId + ')');
  }

  // ใช้ข้อมูลจาก ReportNo เป็นแหล่งอ้างอิงหลัก เพื่อลดความเสี่ยงจากการแก้ข้อมูลในหน้าเว็บหลังค้นหาเลขเอกสาร
  projectName = projectName || documentRecord.reportName;
  adminGroup = documentRecord.adminGroup || String(adminGroup || '').trim();
  workGroup = documentRecord.workGroup || String(workGroup || '').trim();
  responsiblePerson = documentRecord.responsiblePerson || String(responsiblePerson || '').trim();
  actionPlanProject = documentRecord.actionPlanProject || String(actionPlanProject || '').trim();
  var activityCode = String(documentRecord.activityCode || '').trim().toUpperCase();

  if (!projectName || !adminGroup || !workGroup || !responsiblePerson || !actionPlanProject) {
    throw new Error('ข้อมูลเอกสารใน ReportNo ไม่ครบถ้วน กรุณาตรวจสอบรายการเลขเอกสารนี้ก่อนส่งบันทึกข้อความ');
  }

  var spreadsheet = getSpreadsheet_();
  var reportSubmitSheet = spreadsheet.getSheetByName(reportSubmitSheetName);
  if (!reportSubmitSheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + reportSubmitSheetName + "'");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบกำลังประมวลผลคำขออื่น ไม่สามารถบันทึกข้อมูลได้ โปรดลองอีกครั้ง');
  }

  try {
    // ตรวจซ้ำภายใต้ lock เพื่อให้มั่นใจว่าเลขเอกสารยังมีอยู่ก่อน append ข้อมูลจริง
    var lockedRecord = findReportNoRecordByDocumentNumber_(documentNumber);
    if (!lockedRecord) {
      throw new Error('ไม่พบหมายเลขเอกสารนี้ในชีต ReportNo ระหว่างบันทึกข้อมูล');
    }

    var rowData = new Array(19).fill('');
    rowData[1] = lockedRecord.documentNumber; // B
    rowData[2] = projectName; // C
    rowData[3] = adminGroup; // D
    rowData[4] = workGroup; // E
    rowData[5] = responsiblePerson; // F
    rowData[6] = fileUrl; // G
    rowData[13] = reason; // N
    rowData[14] = actionPlanProject; // O
    rowData[18] = activityCode; // S

    reportSubmitSheet.appendRow(rowData);

    var reportNoSheet = spreadsheet.getSheetByName(sheetName);
    if (!reportNoSheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + sheetName + "'");
    reportNoSheet.getRange(lockedRecord.rowNumber, 7).setValue(fileUrl); // G

  } catch (e) {
    Logger.log('Error in locked saveNonCompletedProject: ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }

  logAction(auditUser, 'ส่งบันทึกข้อความโครงการ/กิจกรรม ที่ไม่ได้ดำเนินการ', 'สำเร็จ', projectName);
}

function auditInvalidReportSubmitDocumentNumbers() {
  requireAuth_('auditInvalidReportSubmitDocumentNumbers');

  var ss = getSpreadsheet_();
  var reportSubmitSheet = ss.getSheetByName(reportSubmitSheetName);
  var reportNoSheet = ss.getSheetByName(sheetName);
  if (!reportSubmitSheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + reportSubmitSheetName + "'");
  if (!reportNoSheet) throw new Error("System Error: ไม่พบแผ่นงานชื่อ '" + sheetName + "'");

  var reportNoData = reportNoSheet.getDataRange().getValues();
  var validDocNumbers = {};
  for (var i = 1; i < reportNoData.length; i++) {
    var docNo = normalizeDocumentNumber_(reportNoData[i][1]);
    if (docNo) validDocNumbers[docNo] = true;
  }

  var submitData = reportSubmitSheet.getDataRange().getValues();
  var auditRows = [[
    'ReportSubmit Row',
    'หมายเลขเอกสาร',
    'สถานะ',
    'ชื่อรายการ',
    'กลุ่มบริหาร',
    'ผู้รับผิดชอบ',
    'ลิงก์ไฟล์'
  ]];

  for (var r = 1; r < submitData.length; r++) {
    var rawDocNo = String(submitData[r][1] || '').trim();
    if (!rawDocNo) continue;
    var normalizedDocNo = normalizeDocumentNumber_(rawDocNo);
    var status = '';
    if (!isValidDocumentNumberFormat_(rawDocNo)) {
      status = 'รูปแบบหมายเลขเอกสารไม่ถูกต้อง';
    } else if (!validDocNumbers[normalizedDocNo]) {
      status = 'ไม่พบหมายเลขเอกสารใน ReportNo';
    }
    if (status) {
      auditRows.push([
        r + 1,
        rawDocNo,
        status,
        submitData[r][2] || '',
        submitData[r][3] || '',
        submitData[r][5] || '',
        submitData[r][6] || ''
      ]);
    }
  }

  var auditSheetName = 'InvalidReportSubmitAudit';
  var auditSheet = ss.getSheetByName(auditSheetName) || ss.insertSheet(auditSheetName);
  auditSheet.clearContents();
  auditSheet.getRange(1, 1, auditRows.length, auditRows[0].length).setValues(auditRows);
  auditSheet.autoResizeColumns(1, auditRows[0].length);

  return {
    sheetName: auditSheetName,
    invalidCount: auditRows.length - 1
  };
}



// =========================================================================
// [HOTFIX] Helper สำหรับค้นหาหัวคอลัมน์แบบยืดหยุ่นในชีต LinkBAP
// สาเหตุ: getActivityInfo() ต้องใช้ _findIndex_() เพื่อ map หัวคอลัมน์
// หากไม่มี helper นี้ เมนูขอเลขทะเบียนเอกสารจะค้นหารหัสกิจกรรมไม่ได้
// =========================================================================

/**
 * Reads dropdown master data from the Dropdown sheet for document request forms.
 * Column mapping is intentionally kept identical to the original production system:
 * A = admin groups, B-E = work groups by admin group, F = action plan projects.
 */
function getDropdownData() {
  requireAuth_('getDropdownData');

  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName('Dropdown');
  if (!sheet) {
    throw new Error('ไม่พบชีต Dropdown กรุณาตรวจสอบฐานข้อมูลระบบ');
  }

  var data = sheet.getDataRange().getValues();
  var adminGroups = data.map(function(row) { return row[0]; }).filter(function(value) { return value; });
  var workGroups = {
    'กลุ่มบริหารวิชาการ': data.map(function(row) { return row[1]; }).filter(function(value) { return value; }),
    'กลุ่มบริหารงบประมาณ': data.map(function(row) { return row[2]; }).filter(function(value) { return value; }),
    'กลุ่มบริหารงานบุคคล': data.map(function(row) { return row[3]; }).filter(function(value) { return value; }),
    'กลุ่มบริหารทั่วไป': data.map(function(row) { return row[4]; }).filter(function(value) { return value; })
  };
  var actionPlanProjects = data.map(function(row) { return row[5]; }).filter(function(value) { return value; });

  return {
    adminGroups: adminGroups,
    workGroups: workGroups,
    actionPlanProjects: actionPlanProjects
  };
}

/**
 * Counts registered documents by administration group for the dashboard marquee.
 */
function getReportCounts() {
  requireAuth_('getReportCounts');

  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('ไม่พบชีต ' + sheetName + ' กรุณาตรวจสอบฐานข้อมูลระบบ');
  }

  var data = sheet.getDataRange().getValues();
  data.shift();

  var totalDocuments = 0;
  var academicGroupCount = 0;
  var generalGroupCount = 0;
  var personnelGroupCount = 0;
  var budgetGroupCount = 0;

  data.forEach(function(row) {
    if (row[1]) {
      totalDocuments++;
      switch (row[3]) {
        case 'กลุ่มบริหารวิชาการ':
          academicGroupCount++;
          break;
        case 'กลุ่มบริหารทั่วไป':
          generalGroupCount++;
          break;
        case 'กลุ่มบริหารงานบุคคล':
          personnelGroupCount++;
          break;
        case 'กลุ่มบริหารงบประมาณ':
          budgetGroupCount++;
          break;
      }
    }
  });

  return {
    totalDocuments: totalDocuments,
    academicGroupCount: academicGroupCount,
    generalGroupCount: generalGroupCount,
    personnelGroupCount: personnelGroupCount,
    budgetGroupCount: budgetGroupCount
  };
}

function _normalizeHeader_(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）\[\]{}<>"'“”‘’._\-–—:：\/\\|]/g, '')
    .trim();
}

function _findIndex_(headers, candidates) {
  headers = headers || [];
  candidates = candidates || [];

  var normalizedHeaders = headers.map(function(header) {
    return _normalizeHeader_(header);
  });

  for (var i = 0; i < candidates.length; i++) {
    var target = _normalizeHeader_(candidates[i]);
    var exactIndex = normalizedHeaders.indexOf(target);
    if (exactIndex !== -1) return exactIndex;
  }

  return -1;
}

function getActivityInfo(activityCode) {
  requireAuth_('getActivityInfo');

  if (!activityCode) return null;
  var code = activityCode.toString().trim().toUpperCase();
  var ss = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  var sheet = ss.getSheetByName('LinkBAP');
  if (!sheet) return null;
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return null;
  var headers = values[0];

  var idxCode  = _findIndex_(headers, ['รหัสกิจกรรม','activity code','activitycode','code']);
  var idxProj  = _findIndex_(headers, ['โครงการตามแผนปฏิบัติการ','โครงการตามแผน','โครงการ','action plan project','actionplanproject','project']);
  var idxAdmin = _findIndex_(headers, ['กลุ่มบริหาร','admin group','admingroup']);
  var idxWork  = _findIndex_(headers, ['กลุ่มงาน/งาน','กลุ่มงาน','งาน','work group','workgroup']);
  var idxActivityName = _findIndex_(headers, ['ชื่อกิจกรรม','กิจกรรม','activity name','activityname']);
  var idxResponsible = _findIndex_(headers, ['ผู้รับผิดชอบ','responsible person','responsibleperson','owner']);
  var idxEmail = _findIndex_(headers, ['email ผู้รับผิดชอบ','email','อีเมล','อีเมล์']);

  // Fallback ตามโครงสร้าง LinkBAP ปัจจุบัน:
  // A รหัสกิจกรรม, B โครงการ, C กลุ่มบริหาร, D กลุ่มงาน/งาน, E ชื่อกิจกรรม, F ผู้รับผิดชอบ, G Email ผู้รับผิดชอบ
  if (idxProj  < 0) idxProj  = 1;
  if (idxAdmin < 0) idxAdmin = 2;
  if (idxWork  < 0) idxWork  = 3;
  if (idxActivityName < 0) idxActivityName = 4;
  if (idxResponsible < 0) idxResponsible = 5;
  if (idxEmail < 0) idxEmail = 6;
  if (idxCode === -1) return null;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[idxCode]) continue;
    if (row[idxCode].toString().trim().toUpperCase() === code) {
      return {
        adminGroup:        idxAdmin >= 0 ? String(row[idxAdmin] || '').trim() : '',
        workGroup:         idxWork >= 0 ? String(row[idxWork] || '').trim() : '',
        actionPlanProject: idxProj >= 0 ? String(row[idxProj] || '').trim() : '',
        activityName:      idxActivityName >= 0 ? String(row[idxActivityName] || '').trim() : '',
        email:             idxEmail >= 0 ? String(row[idxEmail] || '').trim() : '',
        responsiblePerson: idxResponsible >= 0 ? String(row[idxResponsible] || '').trim() : ''
      };
    }
  }
  return null;
}

// ==========================================
// [EDITED] ฟังก์ชันแก้ไข: ถอด Hardcoded Folder ID ออก
// ==========================================
function getUploadUrl(metadata) {
  requireAuth_('getUploadUrl');

  try {
    metadata = metadata || {};
    var folderId;
    var fileName;
    var settings = getGlobalSettings();

    if (metadata.uploadPurpose === 'NON_COMPLETED') {
      var nonCompletedDocNo = normalizeDocumentNumber_(metadata.documentNumber);
      if (!nonCompletedDocNo || !isValidDocumentNumberFormat_(nonCompletedDocNo)) {
        throw new Error(getDocumentNumberFormatErrorMessage_());
      }

      var nonCompletedRecord = findReportNoRecordByDocumentNumber_(nonCompletedDocNo);
      if (!nonCompletedRecord) {
        throw new Error('ไม่พบหมายเลขเอกสารนี้ในชีต ReportNo จึงไม่สามารถอัปโหลดบันทึกข้อความได้');
      }

      switch (nonCompletedRecord.adminGroup) {
        case 'กลุ่มบริหารวิชาการ':   folderId = settings['FOLDER_ACADEMIC']; break;
        case 'กลุ่มบริหารงบประมาณ':  folderId = settings['FOLDER_BUDGET']; break;
        case 'กลุ่มบริหารทั่วไป':    folderId = settings['FOLDER_GENERAL']; break;
        case 'กลุ่มบริหารงานบุคคล':  folderId = settings['FOLDER_PERSONNEL']; break;
        default: throw new Error('Invalid admin group');
      }
      fileName = `ไม่ได้ดำเนินการ-${nonCompletedDocNo}-${(nonCompletedRecord.reportName || '').toString().substring(0, 50)}.pdf`;

    } else if (metadata.documentNumber) {
      const documentData = getDocumentData(metadata.documentNumber);
      if (!documentData) throw new Error('Invalid document number');
      var normalizedDocumentNumber = documentData.documentNumber || String(metadata.documentNumber || '').trim();
      
      switch (documentData.adminGroup) {
        case 'กลุ่มบริหารวิชาการ':   folderId = settings['FOLDER_ACADEMIC']; break;
        case 'กลุ่มบริหารงบประมาณ':  folderId = settings['FOLDER_BUDGET']; break;
        case 'กลุ่มบริหารทั่วไป':    folderId = settings['FOLDER_GENERAL']; break;
        case 'กลุ่มบริหารงานบุคคล':  folderId = settings['FOLDER_PERSONNEL']; break;
        default: throw new Error('Invalid admin group');
      }
      fileName = `${normalizedDocumentNumber}-${(documentData.reportName || '').toString().substring(0, 50)}.pdf`;

    } 
    else if (metadata.projectName) {
      switch (metadata.adminGroup) {
        case 'กลุ่มบริหารวิชาการ':   folderId = settings['FOLDER_ACADEMIC']; break;
        case 'กลุ่มบริหารงบประมาณ':  folderId = settings['FOLDER_BUDGET']; break;
        case 'กลุ่มบริหารทั่วไป':    folderId = settings['FOLDER_GENERAL']; break;
        case 'กลุ่มบริหารงานบุคคล':  folderId = settings['FOLDER_PERSONNEL']; break;
        default: throw new Error('Invalid admin group');
      }
      var truncatedProjectName = metadata.projectName.length > 50 ? metadata.projectName.substring(0, 47) + "..." : metadata.projectName;
      fileName = `ไม่ได้ดำเนินการ-${truncatedProjectName}.pdf`;

    } else {
      throw new Error("Invalid metadata for upload");
    }

    if (!folderId) {
      throw new Error("ไม่พบ Folder ID ใน Settings Sheet สำหรับกลุ่มบริหารนี้");
    }

    const accessToken = ScriptApp.getOAuthToken();
    const driveMetadata = {
      name: fileName,
      mimeType: metadata.mimeType || 'application/pdf',
      parents: [folderId]
    };

    const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
    const options = {
      method: "POST",
      headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
      payload: JSON.stringify(driveMetadata),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const uploadUrl = response.getHeaders()["Location"]; 

    if (!uploadUrl) {
      Logger.log("Error getting upload URL: " + response.getContentText());
      throw new Error("ไม่สามารถเริ่มต้นการอัปโหลดได้ (Server Error)");
    }
    
    return uploadUrl; 

  } catch (e) {
    Logger.log(e);
    throw new Error("Server error: " + e.message);
  }
}


function uploadChunk(uploadUrl, chunkBase64, startByte, chunkEndByte, totalSize) {
  requireAuth_('uploadChunk');

  try {
    const accessToken = ScriptApp.getOAuthToken();
    const chunkBlob = Utilities.base64Decode(chunkBase64);

    const options = {
      method: "PUT",
      payload: chunkBlob,
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Range": `bytes ${startByte}-${chunkEndByte}/${totalSize}`
      },
      muteHttpExceptions: true 
    };

    const response = UrlFetchApp.fetch(uploadUrl, options);
    
    return {
      statusCode: response.getResponseCode(),
      headers: response.getHeaders(),
      content: response.getContentText() 
    };

  } catch (e) {
    Logger.log(e);
    throw new Error("Chunk upload failed: " + e.message);
  }
}

// ==========================================
// [NEW] เพิ่มฟังก์ชันใหม่: สำหรับดึงค่าจาก Settings Sheet
// ==========================================
function getGlobalSettings() {
  var scriptProp = PropertiesService.getScriptProperties();
  var key = scriptProp.getProperty('key');
  var ss = key ? SpreadsheetApp.openById(key) : SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName("Settings Sheet");
  if (!sheet) {
    throw new Error("System Error: ไม่พบแผ่นงานชื่อ 'Settings Sheet'");
  }

  var data = sheet.getDataRange().getValues();
  var settings = {};
  for (var i = 1; i < data.length; i++) {
    var varName = data[i][0];
    var varValue = data[i][1];
    if (varName && varName.toString().trim() !== "") {
      settings[varName.toString().trim()] = varValue;
    }
  }
  return settings;
}

// ==========================================
// [NEW] เพิ่มฟังก์ชันใหม่: สำหรับดึง URL ของ Web App ปัจจุบันอัตโนมัติ
// ==========================================

function getWebAppUrl() {
  // Compatibility mode:
  // - Login.html เดิมเรียก getWebAppUrl() หลัง checkLogin() สำเร็จ เพื่อ redirect ไป Index
  //   กรณีนั้น session จะมี LoginRedirectPending = TRUE จึงไม่ logout
  // - Index.html เดิมเรียก getWebAppUrl() ตอนกดออกจากระบบ
  //   กรณีนั้น LoginRedirectPending = FALSE จึง invalidate session ก่อนส่งกลับหน้า Login
  try {
    var consumedLoginRedirect = consumeLoginRedirectIfNeeded_();
    if (!consumedLoginRedirect) {
      invalidateCurrentSession_('logout');
    }
  } catch (e) {
    Logger.log('getWebAppUrl session handling skipped: ' + e.message);
  }
  return ScriptApp.getService().getUrl();
}
