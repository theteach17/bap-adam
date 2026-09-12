/** Minimal compatibility layer for the standalone KPI Satellite. */
var PC_CONST = Object.freeze({
  ROLES: Object.freeze({ USER:'USER', OFFICER:'PRECHECK_OFFICER', ADMIN:'PRECHECK_ADMIN' }),
  STATUS: Object.freeze({ DRAFT:'DRAFT', UPLOADING:'UPLOADING', WAITING_REVIEW:'WAITING_REVIEW', IN_REVIEW:'IN_REVIEW', REVISION_REQUIRED:'REVISION_REQUIRED', WAITING_REVIEW_REVISED:'WAITING_REVIEW_REVISED', APPROVED_PENDING_COMMIT:'APPROVED_PENDING_COMMIT', APPROVED_COMMITTING:'APPROVED_COMMITTING', APPROVED_COMMITTED:'APPROVED_COMMITTED', APPROVED_COMMIT_FAILED:'APPROVED_COMMIT_FAILED', CANCELLED:'CANCELLED', ARCHIVED:'ARCHIVED' }),
  REVIEW_STATUS: Object.freeze({ IN_PROGRESS:'IN_PROGRESS', COMPLETED:'COMPLETED' }),
  TIMEZONE: 'Asia/Bangkok'
});

var PC_HEADERS = Object.freeze({
  PC_Submissions: ['SubmissionId','CaseNo','DocumentNumber','DocumentYear','DocumentType','DocumentNameSnapshot','AdminGroupSnapshot','WorkGroupSnapshot','ResponsiblePersonSnapshot','OwnerEmail','ActivityCodeSnapshot','ActivityNameSnapshot','ProjectSnapshot','SubmittedByUsername','SubmittedByName','SubmittedByEmail','CurrentVersion','TemplateId','Status','CreatedAt','LastSubmittedAt','UpdatedAt','ApprovedAt','ApprovedByEmail','CommitStatus','CommitId','CommitStep','CommitAttemptCount','CommitLastAttemptAt','NextCommitAttemptAt','CommittedAt','CentralReportSubmitRow','FinalFileId','FinalFileUrl','LastErrorCode','LastErrorMessage','ClosedAt'],
  PC_Versions: ['VersionId','SubmissionId','VersionNo','VersionStatus','FileId','FileUrl','OriginalFileName','StoredFileName','FileSizeBytes','MimeType','UploadedAt','UploadedByUsername','UploadedByEmail','ChangeNote','QuantitativeTarget','QuantitativeResult','QualitativeTarget','QualitativeResult','ExpectedTarget','ExpectedAchievementResult','ManagementXbar','ManagementSD','SatisfactionXbar','SatisfactionSD','AllocatedBudget','ActualBudget','ActivityNameSnapshot','ProjectSnapshot','ReportValidationType','PRIndicator','DataCorrectedByOfficer','DataCorrectedAt','DataCorrectedByEmail'],
  PC_Reviews: ['ReviewId','SubmissionId','VersionId','TemplateId','ReviewerEmail','ReviewerName','ReviewStatus','Decision','GeneralComment','ResponsesJSON','StartedAt','LastSavedAt','CompletedAt','LockedBy','LockUntil','TotalItems','PassedItems','FixItems','NoteItems','NAItems','UnreviewedItems'],
  PC_Access: ['Email','Role','DisplayName','Active','CreatedAt','UpdatedAt'],
  PC_Audit: ['AuditId','Timestamp','ActorUsername','ActorName','ActorEmail','ActorRole','Action','SubmissionId','VersionId','ReviewId','PreviousStatus','NewStatus','MetadataJSON','CorrelationId']
});

var KPI_REQUEST_CONTEXT_ = null;

function requirePrecheckDbConfig_(){ return {dbId:kpiSatelliteDbId_()}; }
function pcUserError_(message, code){ var e=new Error(String(message||'เกิดข้อผิดพลาด')); e.code=String(code||'KPI_ERROR'); return e; }
function getCurrentPrincipal_(){ if(!KPI_REQUEST_CONTEXT_) throw new Error('KPI_SESSION_REQUIRED'); return KPI_REQUEST_CONTEXT_; }
function requirePrecheckAdmin_(){ var p=getCurrentPrincipal_(); if((p.roles||[]).indexOf(PC_CONST.ROLES.ADMIN)<0) throw pcUserError_('ไม่มีสิทธิ์เข้าถึงข้อมูล KPI','KPI_FORBIDDEN'); return p; }
function requireOfficer_(){ var p=getCurrentPrincipal_(); if((p.roles||[]).indexOf(PC_CONST.ROLES.OFFICER)<0 && (p.roles||[]).indexOf(PC_CONST.ROLES.ADMIN)<0) throw pcUserError_('ไม่มีสิทธิ์เจ้าหน้าที่','KPI_FORBIDDEN'); return p; }

/** KPI-side audit only. Never mutates PC_Audit. */
function pcAudit_(action, refs, principal, metadata){
  principal=principal||getCurrentPrincipal_(); refs=refs||{}; metadata=metadata||{};
  try {
    return kpiAppendEventOnce_({
      EventKey:'SAT-AUDIT:'+String(action||'ACTION')+':'+Utilities.getUuid(), Timestamp:kpiNowIso_(),
      OfficerEmail:kpiEmail_(principal.email), OfficerName:String(principal.displayName||''), EventType:String(action||'KPI_ACTION'),
      SubmissionId:String(refs.submissionId||''), VersionId:String(refs.versionId||''), ReviewId:String(refs.reviewId||''),
      SessionId:String(principal.sessionId||''), Source:'SATELLITE', MetadataJSON:JSON.stringify(metadata||{})
    });
  } catch(ignored) { return false; }
}
