/**
 * Project Adam Officer Notification Worker
 * Production configuration. Non-secret operational identifiers only.
 */
var PA_NOTIFY = Object.freeze({
  VERSION: '1.0.0',
  TIMEZONE: 'Asia/Bangkok',
  REQUIRED_RUNNER_EMAIL: 'budgetservice@g.klaeng.ac.th',
  DB_ID: '16FtFuJUVhdLj8eidgVtjsKThNrlS5ge5NznSU6EVMn0',
  APP_BASE_URL: 'https://script.google.com/a/g.klaeng.ac.th/macros/s/AKfycbztW4w2SKcdJazoi7cLxkqZQwKbft6lryp087vcjPIVyMayyjSOhi6svY-jirvKySFV/exec',
  APP_NAME: 'Project Adam • ศูนย์สารสนเทศกลาง',
  SENDER_NAME: 'Project Adam • งานสารสนเทศโรงเรียน',

  SHEETS: Object.freeze({
    SOURCE: 'PC_Notifications',
    ACCESS: 'PC_Access',
    SUBMISSIONS: 'PC_Submissions',
    VERSIONS: 'PC_Versions',
    ALERTS: 'PC_OfficerAlerts'
  }),

  SOURCE_EVENTS: Object.freeze({
    SUBMISSION_RECEIVED: true,
    REVISION_SUBMITTED: true
  }),
  RECIPIENT_ROLES: Object.freeze({
    PRECHECK_OFFICER: true,
    PRECHECK_ADMIN: true
  }),
  DOCUMENT_TYPE: 'REPORT_ACTIVITY',

  ALERT_STATUS: Object.freeze({
    PENDING: 'PENDING',
    SENDING: 'SENDING',
    SENT: 'SENT',
    RETRY: 'RETRY',
    FAILED: 'FAILED'
  }),

  PROP_CURSOR: 'PA_NOTIFY_LAST_SOURCE_ROW',
  PROP_INSTALLED_AT: 'PA_NOTIFY_INSTALLED_AT',
  PROP_LAST_RUN_AT: 'PA_NOTIFY_LAST_RUN_AT',
  PROP_LAST_SUCCESS_AT: 'PA_NOTIFY_LAST_SUCCESS_AT',

  MAX_SEND_PER_RUN: 40,
  MAX_ATTEMPTS: 6,
  RETRY_MINUTES: Object.freeze([1, 5, 15, 30, 60]),
  STALE_SENDING_MINUTES: 15,
  LOCK_WAIT_MS: 5000,
  TRIGGER_EVERY_MINUTES: 1,
  QUOTA_RESERVE: 5
});

var PA_SOURCE_HEADERS = Object.freeze([
  'NotificationId','SubmissionId','VersionId','EventType','Recipient','CC','Subject','BodyPayload',
  'Status','AttemptCount','CreatedAt','LastAttemptAt','NextAttemptAt','SentAt','ErrorCode','ErrorMessage'
]);

var PA_ACCESS_HEADERS = Object.freeze(['Email','Role','DisplayName','Active','CreatedAt','UpdatedAt']);

var PA_ALERT_HEADERS = Object.freeze([
  'AlertId','DeliveryKey','SourceNotificationId','SubmissionId','VersionId','EventType',
  'RecipientEmail','RecipientName','RecipientRole','Status','AttemptCount','CreatedAt',
  'LastAttemptAt','NextAttemptAt','SentAt','DocumentNumber','CaseNo','DocumentName',
  'AdminGroup','WorkGroup','ResponsiblePerson','SubmittedByName','SubmittedByEmail','VersionNo',
  'SubmissionStatus','SourceCreatedAt','Subject','ErrorCode','ErrorMessage','CorrelationId'
]);
