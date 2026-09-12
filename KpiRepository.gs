/** Data access layer for KPI Module. It only writes to PC_KPI* sheets. */
var KPI_REPO_MEMO_ = { db: null, sheets: {}, config: null, holidays: null };

/** Opens and memoizes the authoritative Central Information Pre-check database. */
function kpiDb_() {
  if (!KPI_REPO_MEMO_.db) {
    kpiAssertSatelliteRunner_();
    KPI_REPO_MEMO_.db = SpreadsheetApp.openById(kpiSatelliteDbId_());
  }
  return KPI_REPO_MEMO_.db;
}

/** Returns a KPI/source sheet by exact name. */
function kpiSheet_(name) {
  name = String(name || '');
  if (!KPI_REPO_MEMO_.sheets[name]) {
    var sheet = kpiDb_().getSheetByName(name);
    if (!sheet) throw new Error('KPI_REQUIRED_SHEET_MISSING: ' + name);
    KPI_REPO_MEMO_.sheets[name] = sheet;
  }
  return KPI_REPO_MEMO_.sheets[name];
}

/** Reads rows using a fixed known header list; never scans unused columns. */
function kpiReadObjects_(sheetName, headers) {
  var sheet = kpiSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.filter(function(row) {
    return row.some(function(v) { return v !== '' && v != null; });
  }).map(function(row) {
    var out = {};
    headers.forEach(function(h, i) { out[h] = row[i]; });
    return out;
  });
}

/** Reads one bounded column below the header; useful for large idempotency logs. */
function kpiReadColumn_(sheetName, columnIndex) {
  var sheet=kpiSheet_(sheetName),lastRow=sheet.getLastRow();if(lastRow<2)return[];
  return sheet.getRange(2,Number(columnIndex),lastRow-1,1).getValues().map(function(r){return r[0];});
}

/** Returns the last stored value from one column without scanning the table. */
function kpiLastColumnValue_(sheetName,columnIndex) {
  var sheet=kpiSheet_(sheetName),lastRow=sheet.getLastRow();return lastRow<2?'':sheet.getRange(lastRow,Number(columnIndex)).getValue();
}

/** Reads source Pre-check tables from their canonical PC_HEADERS definition. */
function kpiReadSource_(sheetName) {
  var headers = PC_HEADERS[sheetName];
  if (!headers) throw new Error('KPI_UNKNOWN_SOURCE_HEADER: ' + sheetName);
  return kpiReadObjects_(sheetName, headers);
}

/** Appends one or more objects in a single setValues call. */
function kpiAppendObjects_(sheetName, headers, objects) {
  if (!objects || !objects.length) return 0;
  var sheet = kpiSheet_(sheetName);
  var rows = objects.map(function(obj) { return headers.map(function(h) { return obj[h] == null ? '' : obj[h]; }); });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  return rows.length;
}

/** Replaces table body atomically enough for deterministic small aggregate tables. */
function kpiReplaceObjects_(sheetName, headers, objects) {
  var sheet = kpiSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (!objects || !objects.length) return 0;
  var rows = objects.map(function(obj) { return headers.map(function(h) { return obj[h] == null ? '' : obj[h]; }); });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  return rows.length;
}

/** Updates one row by 1-based row number. */
function kpiUpdateRow_(sheetName, headers, rowNumber, object) {
  if (rowNumber < 2) throw new Error('KPI_INVALID_ROW');
  var row = headers.map(function(h) { return object[h] == null ? '' : object[h]; });
  kpiSheet_(sheetName).getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

/** Creates KPI sheet if missing and validates header schema without touching source sheets. */
function kpiEnsureSheet_(name, headers) {
  var db = kpiDb_();
  var sheet = db.getSheetByName(name);
  if (!sheet) {
    sheet = db.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff').setWrap(true);
  } else {
    var existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (String(existing[i] || '') !== headers[i]) throw new Error('KPI_SCHEMA_MISMATCH ' + name + ' column ' + (i + 1) + ': expected ' + headers[i] + ' got ' + existing[i]);
    }
  }
  KPI_REPO_MEMO_.sheets[name] = sheet;
  return sheet;
}

/** Normalizes a clock value from Google Sheets to canonical HH:mm.
 * Google Sheets may store a time-looking string as a TIME serial number or Date.
 * This helper accepts String / Number / Date without changing the intended clock time.
 */
function kpiNormalizeClockValue_(value, fallback) {
  fallback = fallback == null ? '' : String(fallback);
  if (value == null || value === '') return fallback;
  function fromMinutes_(minutes) {
    minutes = ((Math.round(minutes) % 1440) + 1440) % 1440;
    var h = Math.floor(minutes / 60), m = minutes % 60;
    return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
  }
  if (value instanceof Date && isFinite(value.getTime())) {
    // KPI timezone is pinned to Asia/Bangkok (UTC+07, no DST). Avoid historical
    // 1899 timezone offsets that Utilities.formatDate may apply to Sheets TIME dates.
    var shifted = new Date(value.getTime() + 7 * 60 * 60 * 1000);
    return ('0' + shifted.getUTCHours()).slice(-2) + ':' + ('0' + shifted.getUTCMinutes()).slice(-2);
  }
  if (typeof value === 'number' && isFinite(value)) {
    var fraction = ((value % 1) + 1) % 1;
    return fromMinutes_(fraction * 1440);
  }
  var text = String(value).trim();
  var match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (match) {
    var h = Number(match[1]), m = Number(match[2]);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
  }
  var numeric = Number(text);
  if (text !== '' && isFinite(numeric) && numeric >= 0 && numeric < 1) return fromMinutes_(numeric * 1440);
  return text || fallback;
}

/** Returns KPI configuration as normalized object. */
function kpiGetConfig_() {
  if (KPI_REPO_MEMO_.config) return KPI_REPO_MEMO_.config;
  var rows = kpiReadObjects_(KPI_CONST.SHEETS.CONFIG, KPI_HEADERS.PC_KPIConfig);
  var raw = {};
  rows.forEach(function(r) { var key=String(r.Key || '').trim(), value=r.Value; raw[key] = (key===KPI_CONST.CONFIG.WORKDAY_START || key===KPI_CONST.CONFIG.WORKDAY_END) ? kpiNormalizeClockValue_(value, '') : String(value == null ? '' : value).trim(); });
  function bool(key, fallback) { var v = raw[key]; return v === '' || v == null ? fallback : /^(true|1|yes|y)$/i.test(v); }
  function num(key, fallback, min, max) { var n = Number(raw[key]); if (!isFinite(n)) n = fallback; if (min != null) n = Math.max(min, n); if (max != null) n = Math.min(max, n); return n; }
  var cfg = {
    enabled: bool(KPI_CONST.CONFIG.ENABLED, true),
    baselineMode: bool(KPI_CONST.CONFIG.BASELINE_MODE, true),
    scoreEnabled: bool(KPI_CONST.CONFIG.SCORE_ENABLED, false),
    assignmentMode: KPI_CONST.ASSIGNMENT_MODE.OFF, // v1.1.2 safety lock: analytics only; no workflow assignment side effects
    workdayStart: raw[KPI_CONST.CONFIG.WORKDAY_START] || '08:00',
    workdayEnd: raw[KPI_CONST.CONFIG.WORKDAY_END] || '16:30',
    workingDays: (raw[KPI_CONST.CONFIG.WORKING_DAYS] || '1,2,3,4,5').split(',').map(Number).filter(function(n){return n>=1&&n<=7;}),
    sessionIdleMinutes: num(KPI_CONST.CONFIG.SESSION_IDLE_MINUTES, 10, 1, 120),
    responseSlaMinutes: num(KPI_CONST.CONFIG.RESPONSE_SLA_MINUTES, 240, 1, 10080),
    turnaroundSlaMinutes: num(KPI_CONST.CONFIG.TURNAROUND_SLA_MINUTES, 480, 1, 20160),
    minSampleSize: num(KPI_CONST.CONFIG.MIN_SAMPLE_SIZE, 10, 1, 1000),
    cacheSeconds: num(KPI_CONST.CONFIG.CACHE_SECONDS, 120, 10, 900),
    snapshotMinutes: num(KPI_CONST.CONFIG.SNAPSHOT_MINUTES, 30, 1, 30),
    snapshotRetentionDays: num(KPI_CONST.CONFIG.SNAPSHOT_RETENTION_DAYS, 365, 7, 3650),
    eventRetentionDays: num(KPI_CONST.CONFIG.EVENT_RETENTION_DAYS, 730, 30, 3650),
    weights: {
      responsiveness: num(KPI_CONST.CONFIG.WEIGHT_RESPONSIVENESS, 30, 0, 100),
      workload: num(KPI_CONST.CONFIG.WEIGHT_WORKLOAD, 25, 0, 100),
      processing: num(KPI_CONST.CONFIG.WEIGHT_PROCESSING, 15, 0, 100),
      quality: num(KPI_CONST.CONFIG.WEIGHT_QUALITY, 20, 0, 100),
      engagement: num(KPI_CONST.CONFIG.WEIGHT_ENGAGEMENT, 10, 0, 100)
    },
    raw: raw
  };
  KPI_REPO_MEMO_.config = cfg;
  return cfg;
}

/** Reads holiday/business-day overrides keyed by yyyy-MM-dd. */
function kpiGetHolidayMap_() {
  if (KPI_REPO_MEMO_.holidays) return KPI_REPO_MEMO_.holidays;
  var rows = kpiReadObjects_(KPI_CONST.SHEETS.HOLIDAYS, KPI_HEADERS.PC_KPIHolidays);
  var map = {};
  rows.forEach(function(r) {
    var key = kpiDateKey_(r.Date);
    if (!key) return;
    map[key] = {
      isWorkingDay: /^(true|1|yes|y)$/i.test(String(r.IsWorkingDay)),
      startTime: kpiNormalizeClockValue_(r.StartTime, ''), endTime: kpiNormalizeClockValue_(r.EndTime, ''), description: String(r.Description || '')
    };
  });
  KPI_REPO_MEMO_.holidays = map;
  return map;
}

/** Clears execution/cache state after KPI writes. */
function kpiInvalidateCaches_() {
  KPI_REPO_MEMO_.config = null;
  KPI_REPO_MEMO_.holidays = null;
  // Bump an epoch included in dashboard cache keys. This invalidates all hashed
  // dashboard variants after config/holiday writes without needing to enumerate keys.
  try { PropertiesService.getScriptProperties().setProperty('KPI_CACHE_EPOCH', String(Date.now())); } catch (ignored) {}
  try { CacheService.getScriptCache().removeAll(['PC_KPI_DASHBOARD_DEFAULT','PC_KPI_HEALTH']); } catch (ignored2) {}
}

/** Cache epoch used to invalidate all filter-specific dashboard cache keys. */
function kpiCacheEpoch_() {
  try { return PropertiesService.getScriptProperties().getProperty('KPI_CACHE_EPOCH') || '0'; } catch (ignored) { return '0'; }
}

/** Creates a fast index by a field. */
function kpiIndexBy_(rows, field) {
  var out = {};
  (rows || []).forEach(function(r) { var k = String(r[field] || ''); if (k) out[k] = r; });
  return out;
}

/** ISO timestamp in the system timezone. */
function kpiNowIso_() {
  return Utilities.formatDate(new Date(), KPI_CONST.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Stable UUID wrapper. */
function kpiUuid_() { return Utilities.getUuid(); }

/** Normalizes an email-like key. */
function kpiEmail_(v) { return String(v || '').trim().toLowerCase(); }
