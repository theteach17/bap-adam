/** Data access layer for the notification worker. */
var PA_REPO_MEMO_ = { db: null, sheets: {}, headerMaps: {} };

/** Opens and memoizes the Central Information Pre-check database for the current execution. */
function paDb_() {
  if (!PA_REPO_MEMO_.db) PA_REPO_MEMO_.db = SpreadsheetApp.openById(PA_NOTIFY.DB_ID);
  return PA_REPO_MEMO_.db;
}

/** Returns a required sheet by name and fails fast when the sheet is missing. */
function paSheetRequired_(name) {
  if (PA_REPO_MEMO_.sheets[name]) return PA_REPO_MEMO_.sheets[name];
  var sheet = paDb_().getSheetByName(name);
  if (!sheet) throw new Error('Required sheet is missing: ' + name);
  PA_REPO_MEMO_.sheets[name] = sheet;
  return sheet;
}

/** Builds and memoizes a zero-based header-name map for a sheet. */
function paHeaderMap_(sheet) {
  var cacheKey = String(sheet.getSheetId());
  if (PA_REPO_MEMO_.headerMaps[cacheKey]) return PA_REPO_MEMO_.headerMaps[cacheKey];
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return {};
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var map = {};
  headers.forEach(function(header, index) {
    var key = String(header || '').trim();
    if (key) map[key] = index;
  });
  PA_REPO_MEMO_.headerMaps[cacheKey] = map;
  return map;
}

/** Validates that every required column exists before the worker reads or writes data. */
function paAssertHeaders_(sheet, requiredHeaders) {
  var actual = paHeaderMap_(sheet);
  var missing = requiredHeaders.filter(function(header) { return actual[header] == null; });
  if (missing.length) throw new Error('Schema mismatch in ' + sheet.getName() + ': missing ' + missing.join(', '));
  return actual;
}

/** Creates PC_OfficerAlerts when absent and validates its schema when already present. */
function paEnsureAlertSheet_() {
  var ss = paDb_();
  var sheet = ss.getSheetByName(PA_NOTIFY.SHEETS.ALERTS);
  if (!sheet) {
    sheet = ss.insertSheet(PA_NOTIFY.SHEETS.ALERTS);
    PA_REPO_MEMO_.sheets[PA_NOTIFY.SHEETS.ALERTS] = sheet;
    sheet.getRange(1, 1, 1, PA_ALERT_HEADERS.length).setValues([PA_ALERT_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, PA_ALERT_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1f4e78')
      .setFontColor('#ffffff');
    sheet.autoResizeColumns(1, PA_ALERT_HEADERS.length);
    PA_REPO_MEMO_.headerMaps[String(sheet.getSheetId())] = null;
  }
  paAssertHeaders_(sheet, PA_ALERT_HEADERS);
  return sheet;
}

/** Loads, filters, normalizes, and deduplicates active officer/admin recipients from PC_Access. */
function paLoadActiveRecipients_() {
  var sheet = paSheetRequired_(PA_NOTIFY.SHEETS.ACCESS);
  var map = paAssertHeaders_(sheet, PA_ACCESS_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var seen = {};
  var recipients = [];
  values.forEach(function(row) {
    var email = paNormalizeEmail_(row[map.Email]);
    var role = String(row[map.Role] || '').trim();
    var active = paBool_(row[map.Active]);
    if (!email || !active || !PA_NOTIFY.RECIPIENT_ROLES[role] || seen[email]) return;
    seen[email] = true;
    recipients.push({
      email: email,
      role: role,
      displayName: String(row[map.DisplayName] || email).trim() || email
    });
  });
  return recipients;
}

/** Reads only PC_Notifications rows after the durable source cursor and maps them to event objects. */
function paReadNewSourceEvents_(cursorRow) {
  var sheet = paSheetRequired_(PA_NOTIFY.SHEETS.SOURCE);
  var map = paAssertHeaders_(sheet, PA_SOURCE_HEADERS);
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, Number(cursorRow || 1) + 1);
  if (lastRow < startRow) return { events: [], sourceLastRow: lastRow };
  var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, sheet.getLastColumn()).getValues();
  var events = [];
  values.forEach(function(row, offset) {
    var type = String(row[map.EventType] || '').trim();
    if (!PA_NOTIFY.SOURCE_EVENTS[type]) return;
    events.push({
      sourceRow: startRow + offset,
      notificationId: String(row[map.NotificationId] || '').trim(),
      submissionId: String(row[map.SubmissionId] || '').trim(),
      versionId: String(row[map.VersionId] || '').trim(),
      eventType: type,
      sourceCreatedAt: row[map.CreatedAt] || null,
      bodyPayload: String(row[map.BodyPayload] || '')
    });
  });
  return { events: events, sourceLastRow: lastRow };
}

/** Finds one PC_Submissions record by SubmissionId. */
function paFindSubmission_(submissionId) {
  return paFindRowById_(PA_NOTIFY.SHEETS.SUBMISSIONS, 'SubmissionId', submissionId);
}

/** Finds one PC_Versions record by VersionId. */
function paFindVersion_(versionId) {
  return paFindRowById_(PA_NOTIFY.SHEETS.VERSIONS, 'VersionId', versionId);
}

/** Finds one row by exact ID using TextFinder and maps its values by header. */
function paFindRowById_(sheetName, idHeader, idValue) {
  if (!idValue) return null;
  var sheet = paSheetRequired_(sheetName);
  var map = paHeaderMap_(sheet);
  if (map[idHeader] == null) throw new Error(sheetName + ' missing key column ' + idHeader);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var keyRange = sheet.getRange(2, map[idHeader] + 1, lastRow - 1, 1);
  var found = keyRange.createTextFinder(String(idValue)).matchEntireCell(true).findNext();
  if (!found) return null;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var values = sheet.getRange(found.getRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
  var record = {};
  headers.forEach(function(header, index) {
    var key = String(header || '').trim();
    if (key) record[key] = values[index];
  });
  record.__row = found.getRow();
  return record;
}

/** Loads existing delivery keys so replayed source events cannot create duplicate jobs. */
function paExistingDeliveryKeys_() {
  var sheet = paEnsureAlertSheet_();
  var map = paHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var values = sheet.getRange(2, map.DeliveryKey + 1, lastRow - 1, 1).getDisplayValues();
  values.forEach(function(row) {
    var key = String(row[0] || '').trim();
    if (key) keys[key] = true;
  });
  return keys;
}

/** Appends new alert jobs to the durable queue in one batch write. */
function paAppendAlertJobs_(jobs) {
  if (!jobs.length) return 0;
  var sheet = paEnsureAlertSheet_();
  var map = paHeaderMap_(sheet);
  var width = sheet.getLastColumn();
  var rows = jobs.map(function(job) {
    var row = new Array(width).fill('');
    PA_ALERT_HEADERS.forEach(function(header) {
      row[map[header]] = job[header] == null ? '' : job[header];
    });
    return row;
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
  SpreadsheetApp.flush();
  return rows.length;
}

/** Selects pending, retry, or stale-sending jobs that are eligible for dispatch now. */
function paLoadDueJobs_(now) {
  var sheet = paEnsureAlertSheet_();
  var map = paHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Read only scheduling/status columns for the whole queue. Full rows are fetched only for due jobs.
  var scheduleCols = [map.Status, map.AttemptCount, map.CreatedAt, map.LastAttemptAt, map.NextAttemptAt];
  var minCol = Math.min.apply(null, scheduleCols);
  var maxCol = Math.max.apply(null, scheduleCols);
  var scheduleValues = sheet.getRange(2, minCol + 1, lastRow - 1, maxCol - minCol + 1).getValues();
  /** Reads one scheduling/status cell from the compact queue scan by header name. */
  function cell(row, header) { return row[map[header] - minCol]; }

  var candidates = [];
  scheduleValues.forEach(function(row, index) {
    var status = String(cell(row, 'Status') || '').trim();
    var attemptCount = Number(cell(row, 'AttemptCount') || 0);
    var lastAttemptAt = paToDate_(cell(row, 'LastAttemptAt'));
    var nextAttemptAt = paToDate_(cell(row, 'NextAttemptAt'));
    var createdAt = cell(row, 'CreatedAt');

    var staleSending = status === PA_NOTIFY.ALERT_STATUS.SENDING && lastAttemptAt &&
      now.getTime() - lastAttemptAt.getTime() >= PA_NOTIFY.STALE_SENDING_MINUTES * 60000;
    var retryable = status === PA_NOTIFY.ALERT_STATUS.PENDING || status === PA_NOTIFY.ALERT_STATUS.RETRY || staleSending;
    var due = retryable && (!nextAttemptAt || nextAttemptAt.getTime() <= now.getTime()) &&
      attemptCount < PA_NOTIFY.MAX_ATTEMPTS;
    if (!due) return;
    candidates.push({ rowNumber: index + 2, createdAt: createdAt, staleSending: staleSending });
  });

  candidates.sort(function(a, b) { return paDateMs_(a.createdAt) - paDateMs_(b.createdAt); });
  candidates = candidates.slice(0, PA_NOTIFY.MAX_SEND_PER_RUN);

  var width = sheet.getLastColumn();
  return candidates.map(function(candidate) {
    var row = sheet.getRange(candidate.rowNumber, 1, 1, width).getValues()[0];
    var job = { __row: candidate.rowNumber, __staleSending: candidate.staleSending };
    PA_ALERT_HEADERS.forEach(function(header) { job[header] = row[map[header]]; });
    return job;
  });
}

/** Updates selected fields on one durable queue row. */
function paPatchAlertJob_(rowNumber, patch) {
  var sheet = paEnsureAlertSheet_();
  var map = paHeaderMap_(sheet);
  Object.keys(patch).forEach(function(key) {
    if (map[key] == null) throw new Error('Unknown alert column: ' + key);
    sheet.getRange(rowNumber, map[key] + 1).setValue(patch[key] == null ? '' : patch[key]);
  });
}
