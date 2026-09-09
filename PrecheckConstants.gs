/** Central constants for the Pre-check module. */
var PC_CONST = Object.freeze({
  SHEETS: Object.freeze({
    SUBMISSIONS: 'PC_Submissions',
    VERSIONS: 'PC_Versions',
    REVIEWS: 'PC_Reviews',
    REVIEW_RESPONSES: 'PC_ReviewResponses',
    TEMPLATES: 'PC_Templates',
    TEMPLATE_ITEMS: 'PC_TemplateItems',
    QUICK_COMMENTS: 'PC_QuickComments',
    ACCESS: 'PC_Access',
    NOTIFICATIONS: 'PC_Notifications',
    AUDIT: 'PC_Audit'
  }),
  ROLES: Object.freeze({ USER: 'USER', OFFICER: 'PRECHECK_OFFICER', ADMIN: 'PRECHECK_ADMIN' }),
  DOCUMENT_TYPES: Object.freeze({
    NON_COMPLETED_MEMO: 'NON_COMPLETED_MEMO',
    REPORT_ACTIVITY: 'REPORT_ACTIVITY',
    OTHER_DOCUMENT: 'OTHER_DOCUMENT',
    UNKNOWN: 'UNKNOWN'
  }),
  STATUS: Object.freeze({
    DRAFT: 'DRAFT',
    UPLOADING: 'UPLOADING',
    WAITING_REVIEW: 'WAITING_REVIEW',
    IN_REVIEW: 'IN_REVIEW',
    REVISION_REQUIRED: 'REVISION_REQUIRED',
    WAITING_REVIEW_REVISED: 'WAITING_REVIEW_REVISED',
    APPROVED_PENDING_COMMIT: 'APPROVED_PENDING_COMMIT',
    APPROVED_COMMITTING: 'APPROVED_COMMITTING',
    APPROVED_COMMITTED: 'APPROVED_COMMITTED',
    APPROVED_COMMIT_FAILED: 'APPROVED_COMMIT_FAILED',
    CANCELLED: 'CANCELLED',
    ARCHIVED: 'ARCHIVED'
  }),
  VERSION_STATUS: Object.freeze({ DRAFT: 'DRAFT', UPLOADING: 'UPLOADING', UPLOADED: 'UPLOADED', SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED', REVISION_REQUIRED: 'REVISION_REQUIRED' }),
  REVIEW_RESULT: Object.freeze({ PASS: 'PASS', FIX: 'FIX', NOTE: 'NOTE', NA: 'NA', UNREVIEWED: 'UNREVIEWED' }),
  REVIEW_STATUS: Object.freeze({ IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED' }),
  TEMPLATE_STATUS: Object.freeze({ DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', RETIRED: 'RETIRED' }),
  COMMIT_STATUS: Object.freeze({ NONE: 'NONE', PENDING: 'PENDING', COMMITTING: 'COMMITTING', COMMITTED: 'COMMITTED', FAILED: 'FAILED' }),
  COMMIT_STEP: Object.freeze({ NONE: 'NONE', FILE_MOVED: 'FILE_MOVED', SUBMIT_WRITTEN: 'SUBMIT_WRITTEN', MASTER_UPDATED: 'MASTER_UPDATED', DONE: 'DONE' }),
  NOTIFICATION_STATUS: Object.freeze({ PENDING: 'PENDING', SENDING: 'SENDING', SENT: 'SENT', RETRY: 'RETRY', FAILED: 'FAILED' }),
  UPLOAD_PURPOSE: Object.freeze({
    PRECHECK_REPORT: 'PRECHECK_REPORT',
    LEGACY_REPORT: 'LEGACY_REPORT',
    NON_COMPLETED: 'NON_COMPLETED',
    OTHER_DOCUMENT: 'OTHER_DOCUMENT'
  }),
  DEFAULTS: Object.freeze({
    CHUNK_SIZE_BYTES: 2097152,
    REVIEW_LOCK_MINUTES: 15,
    DASHBOARD_PAGE_SIZE: 25,
    DASHBOARD_CACHE_SECONDS: 90,
    LOOKUP_CACHE_SECONDS: 300,
    UPLOAD_EXPIRE_MINUTES: 30,
    COMMIT_MAX_AUTO_RETRY: 5,
    COMMIT_ALERT_AFTER_MINUTES: 30,
    BACKUP_RETENTION_DAYS: 30,
    SLA_WORKING_DAYS: 5,
    SLA_WARNING_DAY: 4
  }),
  PROP_PREFIX: Object.freeze({ UPLOAD: 'PC_UPLOAD_', UPLOAD_DONE: 'PC_UPLOAD_DONE_', FILE_BIND: 'PC_FILE_BIND_' }),
  REPORTSUBMIT_PROVENANCE: Object.freeze([
    'PrecheckSubmissionId',
    'PrecheckVersion',
    'CommitId',
    'ApprovedBy',
    'ApprovedAt',
    'SubmissionSource'
  ]),
  USER_FACING_NAME: 'ศูนย์สารสนเทศกลาง',
  TIMEZONE: 'Asia/Bangkok'
});

var PC_HEADERS = Object.freeze({
  PC_Submissions: [
    'SubmissionId','CaseNo','DocumentNumber','DocumentYear','DocumentType','DocumentNameSnapshot','AdminGroupSnapshot','WorkGroupSnapshot','ResponsiblePersonSnapshot','OwnerEmail','ActivityCodeSnapshot','ActivityNameSnapshot','ProjectSnapshot','SubmittedByUsername','SubmittedByName','SubmittedByEmail','CurrentVersion','TemplateId','Status','CreatedAt','LastSubmittedAt','UpdatedAt','ApprovedAt','ApprovedByEmail','CommitStatus','CommitId','CommitStep','CommitAttemptCount','CommitLastAttemptAt','NextCommitAttemptAt','CommittedAt','CentralReportSubmitRow','FinalFileId','FinalFileUrl','LastErrorCode','LastErrorMessage','ClosedAt'
  ],
  PC_Versions: [
    'VersionId','SubmissionId','VersionNo','VersionStatus','FileId','FileUrl','OriginalFileName','StoredFileName','FileSizeBytes','MimeType','UploadedAt','UploadedByUsername','UploadedByEmail','ChangeNote','QuantitativeTarget','QuantitativeResult','QualitativeTarget','QualitativeResult','ExpectedTarget','ExpectedAchievementResult','ManagementXbar','ManagementSD','SatisfactionXbar','SatisfactionSD','AllocatedBudget','ActualBudget','ActivityNameSnapshot','ProjectSnapshot','ReportValidationType','PRIndicator','DataCorrectedByOfficer','DataCorrectedAt','DataCorrectedByEmail'
  ],
  PC_Reviews: [
    'ReviewId','SubmissionId','VersionId','TemplateId','ReviewerEmail','ReviewerName','ReviewStatus','Decision','GeneralComment','ResponsesJSON','StartedAt','LastSavedAt','CompletedAt','LockedBy','LockUntil','TotalItems','PassedItems','FixItems','NoteItems','NAItems','UnreviewedItems'
  ],
  PC_ReviewResponses: ['ResponseId','SubmissionId','VersionId','ReviewId','ItemId','Result','IssueSeverity','Comment','PageNumber','QuickCommentIds','CreatedAt','UpdatedAt','UpdatedBy'],
  PC_Templates: ['TemplateId','TemplateName','TemplateVersion','DocumentType','AcademicYearFrom','AcademicYearTo','Status','CreatedAt','CreatedBy','PublishedAt'],
  PC_TemplateItems: ['ItemId','TemplateId','SectionOrder','SectionTitle','SubsectionOrder','SubsectionTitle','ItemOrder','ItemLabel','HelpText','Required','AllowNA','DefaultSeverity','QuickCommentGroup','Active'],
  PC_QuickComments: ['QuickCommentId','GroupId','Label','FullText','Active','SortOrder'],
  PC_Access: ['Email','Role','DisplayName','Active','CreatedAt','UpdatedAt'],
  PC_Notifications: ['NotificationId','SubmissionId','VersionId','EventType','Recipient','CC','Subject','BodyPayload','Status','AttemptCount','CreatedAt','LastAttemptAt','NextAttemptAt','SentAt','ErrorCode','ErrorMessage'],
  PC_Audit: ['AuditId','Timestamp','ActorUsername','ActorName','ActorEmail','ActorRole','Action','SubmissionId','VersionId','ReviewId','PreviousStatus','NewStatus','MetadataJSON','CorrelationId'],
  /* [ASSISTANT PATCH] ต้องอยู่ท้ายสุดเสมอ เพราะ pcInitializeWorkflowSheets_ มีเงื่อนไข
     พิเศษที่ index===0 (จะ rename Sheet1 เป็นชีตแรก) การแทรกไว้ตำแหน่งอื่นจะเปลี่ยน
     ลำดับของชีตเดิม การเพิ่ม key ท้ายสุดทำให้ setupPrecheckSystem() สร้างชีตนี้ให้
     อัตโนมัติ และ runPrecheckHealthCheck() ตรวจ schema ให้เองโดยไม่ต้องแก้โค้ดเพิ่ม */
  PC_AssistantLog: ['LogId','Timestamp','Username','RawMessage','Intent','Confidence','Matched','EntitiesJSON','TookMs','Helpful']
});
