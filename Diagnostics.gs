/** Read-only operational health check. */
function runOfficerNotificationHealthCheck() {
  var checks = [];
  /** Runs one health-check probe and records success or failure without stopping the remaining probes. */
  function check(name, fn) {
    try {
      var detail = fn();
      checks.push({ name: name, ok: true, detail: detail == null ? 'OK' : detail });
    } catch (error) {
      checks.push({ name: name, ok: false, detail: error && error.message ? error.message : String(error) });
    }
  }

  check('Runner account', function() {
    var email = paAssertRunner_();
    return email;
  });
  check('Database access', function() { return paDb_().getName() + ' (' + PA_NOTIFY.DB_ID + ')'; });
  check('PC_Notifications schema', function() { paAssertHeaders_(paSheetRequired_(PA_NOTIFY.SHEETS.SOURCE), PA_SOURCE_HEADERS); return 'OK'; });
  check('PC_Access schema', function() { paAssertHeaders_(paSheetRequired_(PA_NOTIFY.SHEETS.ACCESS), PA_ACCESS_HEADERS); return 'OK'; });
  check('PC_Submissions available', function() { return paSheetRequired_(PA_NOTIFY.SHEETS.SUBMISSIONS).getLastRow() + ' rows'; });
  check('PC_Versions available', function() { return paSheetRequired_(PA_NOTIFY.SHEETS.VERSIONS).getLastRow() + ' rows'; });
  check('Alert queue schema', function() { return paEnsureAlertSheet_().getLastRow() + ' rows'; });
  check('Active recipients', function() {
    var recipients = paLoadActiveRecipients_();
    if (!recipients.length) throw new Error('No active recipients');
    return recipients.map(function(r) { return r.email + ' (' + r.role + ')'; });
  });
  check('Minute trigger', function() {
    var triggers = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'processOfficerNotifications'; });
    if (triggers.length !== 1) throw new Error('Expected exactly 1 trigger, found ' + triggers.length);
    return '1 trigger installed';
  });
  check('Mail quota', function() { return MailApp.getRemainingDailyQuota(); });
  check('Cursor', function() {
    var cursor = Number(PropertiesService.getScriptProperties().getProperty(PA_NOTIFY.PROP_CURSOR) || 0);
    var sourceLast = paSheetRequired_(PA_NOTIFY.SHEETS.SOURCE).getLastRow();
    if (cursor < 1) throw new Error('Cursor is not initialized');
    return { cursor: cursor, sourceLastRow: sourceLast, lagRows: Math.max(0, sourceLast - cursor) };
  });

  var failed = checks.filter(function(c) { return !c.ok; });
  var stats = paQueueStats_();
  return { ok: failed.length === 0, version: PA_NOTIFY.VERSION, failedCount: failed.length, checks: checks, queue: stats };
}

/** Counts queue rows by delivery status for operational diagnostics. */
function paQueueStats_() {
  var sheet = paEnsureAlertSheet_();
  var map = paHeaderMap_(sheet);
  var stats = { PENDING: 0, SENDING: 0, SENT: 0, RETRY: 0, FAILED: 0, total: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return stats;
  var values = sheet.getRange(2, map.Status + 1, lastRow - 1, 1).getDisplayValues();
  values.forEach(function(row) {
    var status = String(row[0] || '').trim();
    stats.total++;
    if (stats[status] != null) stats[status]++;
  });
  return stats;
}

/** Sends one synthetic test email only to the worker account. Does not touch the source cursor. */
function sendOfficerNotificationTestEmail() {
  paAssertRunner_();
  var now = new Date();
  var job = {
    AlertId: 'TEST-' + Utilities.getUuid(),
    EventType: 'SUBMISSION_RECEIVED',
    RecipientName: 'เจ้าหน้าที่ทดสอบ',
    RecipientEmail: PA_NOTIFY.REQUIRED_RUNNER_EMAIL,
    DocumentNumber: 'TEST 001/2569',
    CaseNo: 'PC-TEST-000001',
    DocumentName: 'รายงานทดสอบระบบแจ้งเตือนเจ้าหน้าที่ (ไม่มีผลต่อข้อมูลจริง)',
    AdminGroup: 'กลุ่มบริหารงบประมาณ',
    WorkGroup: 'งานแผนงานและสารสนเทศ',
    ResponsiblePerson: 'ระบบทดสอบ',
    SubmittedByName: 'ระบบทดสอบ',
    VersionNo: 1,
    SourceCreatedAt: now,
    Subject: '[TEST][Project Adam] ทดสอบอีเมลแจ้งเตือนเจ้าหน้าที่'
  };
  var content = paBuildEmail_(job);
  MailApp.sendEmail({
    to: PA_NOTIFY.REQUIRED_RUNNER_EMAIL,
    subject: job.Subject,
    body: content.text,
    htmlBody: content.html,
    name: PA_NOTIFY.SENDER_NAME
  });
  return { ok: true, sentTo: PA_NOTIFY.REQUIRED_RUNNER_EMAIL, at: now.toISOString() };
}
