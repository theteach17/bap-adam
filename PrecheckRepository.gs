/**
 * Opens the isolated Pre-check workflow database.
 * [PERF PATCH v2.1.1] เปิดสเปรดชีตเดิมซ้ำหลายสิบครั้งต่อคำขอ จึงจำ handle ไว้ 1 ครั้งต่อ execution
 */
function getPrecheckSpreadsheet_() {
  var cfg = requirePrecheckDbConfig_();
  return pcMemo_('ss:precheck:' + cfg.dbId, function() {
    return SpreadsheetApp.openById(cfg.dbId);
  });
}

/**
 * Returns a workflow sheet and validates its exact header contract.
 * [PERF PATCH v2.1.1] การตรวจ header contract ยังทำครบเหมือนเดิม แต่ทำครั้งเดียวต่อ
 * execution แทนที่จะยิงอ่านแถวหัวตารางใหม่ทุกครั้งที่เรียกใช้ชีต
 */
function pcSheet_(sheetName) {
  return pcMemo_('sheet:' + sheetName, function() {
    return pcOpenValidatedSheet_(sheetName);
  });
}

/** Opens and header-validates a workflow sheet. Behaviour identical to the original pcSheet_. */
function pcOpenValidatedSheet_(sheetName) {
  var ss = getPrecheckSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing workflow sheet: ' + sheetName);
  var expected = PC_HEADERS[sheetName];
  if (expected) {
    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0].map(function(v){ return String(v || '').trim(); });
    for (var i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) throw new Error('Workflow schema mismatch: ' + sheetName + ' column ' + (i + 1));
    }
  }
  return sheet;
}

/** Converts an array row into a header-keyed object. */
function pcRowToObject_(headers, row, rowNumber) {
  var out = { _rowNumber: rowNumber || 0 };
  for (var i = 0; i < headers.length; i++) out[headers[i]] = row[i];
  return out;
}

/**
 * Lists workflow sheet rows as objects using one batch read.
 * [PERF PATCH v2.1.1] เดิมหนึ่งคำขออ่านชีตเดิมซ้ำได้ถึง 4-5 รอบ (เช่น openReview อ่าน
 * PC_Reviews 3 รอบ, getMyDocumentDetail อ่าน PC_ReviewResponses 1 รอบต่อ 1 review)
 * จึงจำผลอ่านไว้ต่อ execution และ "ล้างทิ้งทันทีทุกครั้งที่มีการเขียน" รวมถึงล้างซ้ำ
 * เมื่อเข้า critical section ใน pcWithScriptLock_ ความสดของข้อมูลจึงเท่าเดิมทุกกรณี
 */
function pcListObjects_(sheetName) {
  return pcMemo_('rows:' + sheetName, function() {
    return pcReadObjects_(sheetName);
  });
}

/** Performs the actual batch read of a workflow sheet. */
function pcReadObjects_(sheetName) {
  var sheet = pcSheet_(sheetName);
  var headers = PC_HEADERS[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function(row, index){ return pcRowToObject_(headers, row, index + 2); });
}

/** Invalidates the cached row snapshot of one workflow sheet after any write. */
function pcInvalidateRows_(sheetName) {
  pcMemoDrop_('rows:' + sheetName);
}

/** Invalidates every cached row snapshot. Called whenever a critical section begins. */
function pcInvalidateAllRows_() {
  pcMemoDropPrefix_('rows:');
}

/** Finds the first workflow object matching a field value. */
function pcFindObject_(sheetName, fieldName, value, caseInsensitive) {
  var rows = pcListObjects_(sheetName);
  var target = caseInsensitive ? pcKey_(value) : String(value == null ? '' : value);
  for (var i = 0; i < rows.length; i++) {
    var current = caseInsensitive ? pcKey_(rows[i][fieldName]) : String(rows[i][fieldName] == null ? '' : rows[i][fieldName]);
    if (current === target) return rows[i];
  }
  return null;
}

/** Finds all workflow objects matching a predicate after a batch read. */
function pcFilterObjects_(sheetName, predicate) {
  return pcListObjects_(sheetName).filter(predicate);
}

/** Appends one object to a workflow sheet using one setValues call. */
function pcAppendObject_(sheetName, object) {
  var sheet = pcSheet_(sheetName);
  var headers = PC_HEADERS[sheetName];
  var row = headers.map(function(header){ return object[header] == null ? '' : object[header]; });
  var nextRow = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(nextRow, 1, 1, headers.length).setValues([row]);
  pcInvalidateRows_(sheetName); // [PERF PATCH v2.1.1]
  return pcRowToObject_(headers, row, nextRow);
}

/** Appends multiple objects in one batch. */
function pcAppendObjects_(sheetName, objects) {
  if (!objects || !objects.length) return [];
  var sheet = pcSheet_(sheetName);
  var headers = PC_HEADERS[sheetName];
  var values = objects.map(function(object){ return headers.map(function(header){ return object[header] == null ? '' : object[header]; }); });
  var startRow = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
  pcInvalidateRows_(sheetName); // [PERF PATCH v2.1.1]
  return values.map(function(row, idx){ return pcRowToObject_(headers, row, startRow + idx); });
}

/** Replaces a complete workflow row after applying a partial patch in memory. */
function pcPatchObject_(sheetName, rowNumber, patch) {
  var sheet = pcSheet_(sheetName);
  var headers = PC_HEADERS[sheetName];
  if (!rowNumber || rowNumber < 2) throw new Error('Invalid workflow row number');
  var row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(patch, header)) row[index] = patch[header] == null ? '' : patch[header];
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  pcInvalidateRows_(sheetName); // [PERF PATCH v2.1.1]
  return pcRowToObject_(headers, row, rowNumber);
}

/** Batch-patches many complete rows on a single sheet, grouping contiguous writes where possible. */
function pcBatchPatchObjects_(sheetName, patches) {
  if (!patches || !patches.length) return;
  var sheet = pcSheet_(sheetName);
  var headers = PC_HEADERS[sheetName];
  var byRow = {};
  patches.forEach(function(item){ byRow[item.rowNumber] = item.patch || {}; });
  var rowNumbers = Object.keys(byRow).map(Number).filter(function(n){ return n >= 2; }).sort(function(a,b){ return a-b; });
  if (!rowNumbers.length) return;
  var minRow = rowNumbers[0];
  var maxRow = rowNumbers[rowNumbers.length - 1];
  var matrix = sheet.getRange(minRow, 1, maxRow - minRow + 1, headers.length).getValues();
  rowNumbers.forEach(function(rowNumber) {
    var row = matrix[rowNumber - minRow];
    var patch = byRow[rowNumber];
    headers.forEach(function(header, index) {
      if (Object.prototype.hasOwnProperty.call(patch, header)) row[index] = patch[header] == null ? '' : patch[header];
    });
  });
  sheet.getRange(minRow, 1, matrix.length, headers.length).setValues(matrix);
  pcInvalidateRows_(sheetName); // [PERF PATCH v2.1.1]
}

/** Returns submission by its primary id. */
function pcSubmissionById_(submissionId) {
  return pcFindObject_(PC_CONST.SHEETS.SUBMISSIONS, 'SubmissionId', submissionId, false);
}

/** Returns submission by normalized document number. */
function pcSubmissionByDocumentNumber_(documentNumber) {
  var normalized = normalizeDocumentNumber_(documentNumber);
  var rows = pcListObjects_(PC_CONST.SHEETS.SUBMISSIONS);
  for (var i = 0; i < rows.length; i++) if (normalizeDocumentNumber_(rows[i].DocumentNumber) === normalized) return rows[i];
  return null;
}

/** Returns a version by id. */
function pcVersionById_(versionId) {
  return pcFindObject_(PC_CONST.SHEETS.VERSIONS, 'VersionId', versionId, false);
}

/** Returns all versions for a submission ordered by version number. */
function pcVersionsForSubmission_(submissionId) {
  return pcFilterObjects_(PC_CONST.SHEETS.VERSIONS, function(row){ return String(row.SubmissionId) === String(submissionId); })
    .sort(function(a,b){ return Number(a.VersionNo || 0) - Number(b.VersionNo || 0); });
}

/** Returns the current submitted version for a submission. */
function pcCurrentVersion_(submission) {
  if (!submission || !Number(submission.CurrentVersion || 0)) return null;
  var versions = pcVersionsForSubmission_(submission.SubmissionId);
  for (var i = 0; i < versions.length; i++) if (Number(versions[i].VersionNo) === Number(submission.CurrentVersion)) return versions[i];
  return null;
}

/** Returns the current draft version if one exists. */
function pcDraftVersion_(submissionId) {
  var versions = pcVersionsForSubmission_(submissionId);
  for (var i = versions.length - 1; i >= 0; i--) if (String(versions[i].VersionStatus) === PC_CONST.VERSION_STATUS.DRAFT || String(versions[i].VersionStatus) === PC_CONST.VERSION_STATUS.UPLOADED || String(versions[i].VersionStatus) === PC_CONST.VERSION_STATUS.UPLOADING) return versions[i];
  return null;
}
