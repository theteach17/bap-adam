/** Returns an ISO-8601 timestamp formatted in the application timezone. */
function pcNowIso_() {
  return Utilities.formatDate(new Date(), PC_CONST.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Converts supported truthy values to Boolean. */
function pcBool_(value, defaultValue) {
  if (value === true || value === false) return value;
  var s = String(value == null ? '' : value).trim().toLowerCase();
  if (['true','1','yes','y','on'].indexOf(s) !== -1) return true;
  if (['false','0','no','n','off'].indexOf(s) !== -1) return false;
  return defaultValue === true;
}

/** Converts a value to an integer with bounds and fallback. */
function pcInt_(value, fallback, min, max) {
  var n = parseInt(value, 10);
  if (!isFinite(n)) n = fallback;
  if (typeof min === 'number' && n < min) n = min;
  if (typeof max === 'number' && n > max) n = max;
  return n;
}

/** Creates a UUID without exposing platform internals to the client. */
function pcUuid_() {
  return Utilities.getUuid();
}

/** Returns a compact correlation id for technical logs. */
function pcCorrelationId_() {
  return 'C-' + Utilities.getUuid().replace(/-/g, '').substring(0, 16).toUpperCase();
}

/** Parses JSON and throws a user-safe validation error if invalid. */
function pcParseJson_(value, label) {
  try {
    return typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
  } catch (e) {
    throw pcUserError_('ข้อมูล ' + (label || '') + ' ไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง', 'INVALID_JSON');
  }
}

/** Produces a controlled error whose message is safe to show to a user. */
function pcUserError_(message, code) {
  var err = new Error(String(message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'));
  err.pcCode = code || 'USER_ERROR';
  err.pcSafe = true;
  return err;
}

/** Converts any exception into a safe public message while logging technical detail. */
function pcHandlePublicError_(error, operation, context) {
  var correlationId = pcCorrelationId_();
  var technical = {
    operation: operation || '',
    message: error && error.message ? error.message : String(error),
    stack: error && error.stack ? error.stack : '',
    context: context || {},
    correlationId: correlationId
  };
  console.error(JSON.stringify(technical));
  if (error && error.pcSafe) {
    var safe = pcUserError_(error.message, error.pcCode || 'USER_ERROR');
    safe.correlationId = correlationId;
    return safe;
  }
  var publicError = pcUserError_('ระบบไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาให้แจ้งรหัส ' + correlationId, 'SYSTEM_ERROR');
  publicError.correlationId = correlationId;
  return publicError;
}

/** Executes a short critical section under Script Lock. */
function pcWithScriptLock_(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs || 30000)) {
    throw pcUserError_('ระบบกำลังประมวลผลคำขออื่น กรุณาลองใหม่อีกครั้ง', 'LOCK_BUSY');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Generates a server-owned normalized key for comparisons. */
function pcKey_(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/** Escapes HTML for email/UI strings assembled on the server. */
function pcEscapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitizes filenames while preserving Thai/Unicode text. */
function pcSafeFileName_(value) {
  return String(value || 'document')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 180) || 'document';
}

/** Returns Buddhist document year from a normalized document number. */
function pcDocumentYear_(documentNumber) {
  var m = String(documentNumber || '').match(/\/(\d{4})$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Parses a numeric form value while preserving blank values. */
function pcNumberOrBlank_(value, label, min, max) {
  if (value === '' || value == null) return '';
  var n = Number(String(value).replace(/,/g, '').trim());
  if (!isFinite(n)) throw pcUserError_((label || 'ตัวเลข') + ' ไม่ถูกต้อง', 'INVALID_NUMBER');
  if (typeof min === 'number' && n < min) throw pcUserError_((label || 'ตัวเลข') + ' ต้องไม่น้อยกว่า ' + min, 'INVALID_NUMBER');
  if (typeof max === 'number' && n > max) throw pcUserError_((label || 'ตัวเลข') + ' ต้องไม่เกิน ' + max, 'INVALID_NUMBER');
  return n;
}

/** Splits comma/newline configuration into normalized values. */
function pcList_(value) {
  if (Array.isArray(value)) return value.map(String).map(function(v){ return v.trim(); }).filter(String);
  return String(value || '').split(/[\n,;]/).map(function(v){ return v.trim(); }).filter(String);
}

/** Returns true when an ISO date is in the past. */
function pcIsoExpired_(iso) {
  if (!iso) return true;
  var t = new Date(iso).getTime();
  return !isFinite(t) || t <= Date.now();
}

/** Adds minutes to the current time and returns ISO text. */
function pcIsoAfterMinutes_(minutes) {
  return Utilities.formatDate(new Date(Date.now() + Number(minutes || 0) * 60000), PC_CONST.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Adds milliseconds to an ISO timestamp and returns ISO text. */
function pcIsoAfterMsFrom_(iso, ms) {
  var base = iso ? new Date(iso).getTime() : Date.now();
  return Utilities.formatDate(new Date(base + ms), PC_CONST.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Removes technical project identifiers from user-facing title text. */
function pcUserFacingTitle_() {
  return PC_CONST.USER_FACING_NAME;
}

/** Extracts a Google Drive file id from common file URLs for conflict-safe comparisons. */
function pcExtractDriveFileId_(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  var patterns = [/\/d\/([A-Za-z0-9_-]{10,})/i, /[?&]id=([A-Za-z0-9_-]{10,})/i];
  for (var i = 0; i < patterns.length; i++) {
    var match = text.match(patterns[i]);
    if (match) return match[1];
  }
  return '';
}

/** Compares Drive URLs by file id when possible and falls back to normalized text. */
function pcSameDriveFile_(left, right) {
  var a = pcExtractDriveFileId_(left), b = pcExtractDriveFileId_(right);
  if (a && b) return a === b;
  return String(left || '').trim() === String(right || '').trim();
}
