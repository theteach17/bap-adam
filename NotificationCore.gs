/** Pure helpers and business rules. */
function paNormalizeEmail_(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/** Converts common spreadsheet boolean representations to a strict Boolean. */
function paBool_(value) {
  if (value === true) return true;
  var s = String(value == null ? '' : value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

/** Converts supported spreadsheet/date values to a valid Date or returns null. */
function paToDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/** Returns epoch milliseconds for a supported date value, or zero when invalid. */
function paDateMs_(value) {
  var date = paToDate_(value);
  return date ? date.getTime() : 0;
}

/** Builds the idempotency key for one source notification and recipient. */
function paDeliveryKey_(sourceNotificationId, recipientEmail) {
  return String(sourceNotificationId || '').trim() + '|' + paNormalizeEmail_(recipientEmail);
}

/** Calculates the next retry time from the configured backoff schedule. */
function paRetryAt_(now, attemptCount) {
  var index = Math.max(0, Math.min(PA_NOTIFY.RETRY_MINUTES.length - 1, Number(attemptCount || 1) - 1));
  return new Date(now.getTime() + PA_NOTIFY.RETRY_MINUTES[index] * 60000);
}

/** Converts nullable values to safe trimmed text. */
function paSafeText_(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
}

/** Escapes untrusted text before inserting it into HTML email markup. */
function paEscapeHtml_(value) {
  return paSafeText_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Builds the Production Project Adam URL that opens the Pre-check officer page. */
function paBuildOfficerUrl_() {
  return PA_NOTIFY.APP_BASE_URL + '?page=PrecheckOfficer';
}

/** Returns the Thai display label for a supported source event. */
function paEventLabel_(eventType) {
  return eventType === 'REVISION_SUBMITTED' ? 'รายงานฉบับแก้ไขรอตรวจซ้ำ' : 'มีรายงานใหม่รอตรวจ';
}

/** Builds the concise subject line for a new or revised report alert. */
function paBuildSubject_(eventType, documentNumber) {
  return '[Project Adam] ' + paEventLabel_(eventType) + ' — ' + (paSafeText_(documentNumber) || 'ไม่ระบุเลขเอกสาร');
}

/** Combines event, recipient, submission, and version data into one durable alert job. */
function paBuildJob_(event, recipient, submission, version, now) {
  var deliveryKey = paDeliveryKey_(event.notificationId, recipient.email);
  return {
    AlertId: Utilities.getUuid(),
    DeliveryKey: deliveryKey,
    SourceNotificationId: event.notificationId,
    SubmissionId: event.submissionId,
    VersionId: event.versionId,
    EventType: event.eventType,
    RecipientEmail: recipient.email,
    RecipientName: recipient.displayName,
    RecipientRole: recipient.role,
    Status: PA_NOTIFY.ALERT_STATUS.PENDING,
    AttemptCount: 0,
    CreatedAt: now,
    LastAttemptAt: '',
    NextAttemptAt: now,
    SentAt: '',
    DocumentNumber: submission.DocumentNumber || '',
    CaseNo: submission.CaseNo || '',
    DocumentName: submission.DocumentNameSnapshot || '',
    AdminGroup: submission.AdminGroupSnapshot || '',
    WorkGroup: submission.WorkGroupSnapshot || '',
    ResponsiblePerson: submission.ResponsiblePersonSnapshot || '',
    SubmittedByName: submission.SubmittedByName || '',
    SubmittedByEmail: submission.SubmittedByEmail || '',
    VersionNo: version && version.VersionNo != null ? version.VersionNo : submission.CurrentVersion || '',
    SubmissionStatus: submission.Status || '',
    SourceCreatedAt: event.sourceCreatedAt || now,
    Subject: paBuildSubject_(event.eventType, submission.DocumentNumber),
    ErrorCode: '',
    ErrorMessage: '',
    CorrelationId: Utilities.getUuid()
  };
}

/** Accepts only configured source events whose submission is REPORT_ACTIVITY. */
function paValidateEventForOfficerAlert_(event, submission) {
  if (!event || !event.notificationId || !event.submissionId || !event.versionId) return false;
  if (!PA_NOTIFY.SOURCE_EVENTS[event.eventType]) return false;
  if (!submission) return false;
  return String(submission.DocumentType || '').trim() === PA_NOTIFY.DOCUMENT_TYPE;
}
