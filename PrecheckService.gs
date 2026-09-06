/** Creates or updates a REPORT_ACTIVITY draft; master metadata is always re-read server-side. */
function saveSubmissionDraft(payload) {
  try {
    var principal = getCurrentPrincipal_();
    payload = payload || {};
    var document = pcMasterDocument_(payload.documentNumber, true);
    if (!document) throw pcUserError_('ไม่พบหมายเลขเอกสารนี้', 'DOCUMENT_NOT_FOUND');
    if (document.documentType !== PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY) throw pcUserError_('เอกสารประเภทนี้ไม่ใช้ระบบ Pre-check', 'WRONG_WORKFLOW');
    if (!isPrecheckAvailable_(document)) throw pcUserError_('ระบบ Pre-check ยังไม่เปิดใช้งานสำหรับเอกสารนี้', 'PRECHECK_DISABLED');
    if (document.finalLink) throw pcUserError_('เอกสารนี้ได้รับการบันทึกเป็นเอกสารฉบับสมบูรณ์แล้ว', 'ALREADY_FINAL');

    var result = pcWithScriptLock_(function() {
      var submission = pcSubmissionByDocumentNumber_(document.documentNumber);
      if (!submission) {
        var template = pcResolveTemplateForDocument_(document);
        var caseNo = pcNextCaseNoLocked_(document.documentYear);
        submission = pcAppendObject_(PC_CONST.SHEETS.SUBMISSIONS, {
          SubmissionId: pcUuid_(), CaseNo: caseNo, DocumentNumber: document.documentNumber, DocumentYear: document.documentYear,
          DocumentType: PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY, DocumentNameSnapshot: document.documentName, AdminGroupSnapshot: document.adminGroup,
          WorkGroupSnapshot: document.workGroup, ResponsiblePersonSnapshot: document.responsiblePerson, OwnerEmail: document.ownerEmail,
          ActivityCodeSnapshot: document.activityCode, ActivityNameSnapshot: document.activityName, ProjectSnapshot: document.project,
          SubmittedByUsername: principal.username, SubmittedByName: principal.displayName, SubmittedByEmail: principal.email,
          CurrentVersion: 0, TemplateId: template.TemplateId, Status: PC_CONST.STATUS.DRAFT, CreatedAt: pcNowIso_(), LastSubmittedAt:'', UpdatedAt: pcNowIso_(),
          ApprovedAt:'', ApprovedByEmail:'', CommitStatus:PC_CONST.COMMIT_STATUS.NONE, CommitId:'', CommitStep:PC_CONST.COMMIT_STEP.NONE,
          CommitAttemptCount:0, CommitLastAttemptAt:'', NextCommitAttemptAt:'', CommittedAt:'', CentralReportSubmitRow:'', FinalFileId:'', FinalFileUrl:'', LastErrorCode:'', LastErrorMessage:'', ClosedAt:''
        });
      } else if (!pcCanEditSubmission_(submission, principal)) {
        throw pcUserError_('คุณไม่มีสิทธิ์แก้ไขรายการนี้', 'FORBIDDEN');
      } else if ([PC_CONST.STATUS.APPROVED_COMMITTED, PC_CONST.STATUS.APPROVED_COMMITTING, PC_CONST.STATUS.APPROVED_PENDING_COMMIT].indexOf(String(submission.Status)) !== -1) {
        throw pcUserError_('เอกสารนี้อยู่ระหว่างหรือเสร็จสิ้นการบันทึกฉบับสมบูรณ์แล้ว', 'NOT_EDITABLE');
      } else if ([PC_CONST.STATUS.WAITING_REVIEW, PC_CONST.STATUS.WAITING_REVIEW_REVISED, PC_CONST.STATUS.IN_REVIEW].indexOf(String(submission.Status)) !== -1) {
        throw pcUserError_('เอกสารกำลังอยู่ระหว่างการตรวจ ยังไม่สามารถแก้ไขร่างได้', 'NOT_EDITABLE');
      }
      var version = pcEnsureDraftVersion_(submission, document, principal);
      version = pcPatchDraftFields_(version, payload, document, principal);
      var resumeStatus = String(version.VersionStatus) === PC_CONST.VERSION_STATUS.UPLOADING ? PC_CONST.STATUS.UPLOADING : (Number(submission.CurrentVersion || 0) > 0 ? PC_CONST.STATUS.REVISION_REQUIRED : PC_CONST.STATUS.DRAFT);
      pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS, submission._rowNumber, { UpdatedAt: pcNowIso_(), Status: resumeStatus });
      return { submission: pcSubmissionById_(submission.SubmissionId), version: version };
    });
    pcAudit_('SAVE_DRAFT', result.submission, principal, { versionId: result.version.VersionId, versionNo: result.version.VersionNo });
    return { success:true, submissionId:result.submission.SubmissionId, versionId:result.version.VersionId, versionNo:Number(result.version.VersionNo), status:result.submission.Status, savedAt:pcNowIso_(), hasUploadedFile:!!result.version.FileId, uploadedFileName:result.version.OriginalFileName||result.version.StoredFileName||'', draftData:{changeNote:result.version.ChangeNote||'',quantitativeTarget:result.version.QuantitativeTarget||'',quantitativeResult:result.version.QuantitativeResult||'',qualitativeTarget:result.version.QualitativeTarget||'',qualitativeResult:result.version.QualitativeResult||'',expectedTarget:result.version.ExpectedTarget||'',expectedAchievementResult:result.version.ExpectedAchievementResult||'',managementXbar:result.version.ManagementXbar,managementSD:result.version.ManagementSD,satisfactionXbar:result.version.SatisfactionXbar,satisfactionSD:result.version.SatisfactionSD,allocatedBudget:result.version.AllocatedBudget,actualBudget:result.version.ActualBudget,prIndicator:result.version.PRIndicator||''} };
  } catch (error) {
    throw pcHandlePublicError_(error, 'saveSubmissionDraft', {});
  }
}

/** Issues a human-readable case number under the caller's Script Lock. */
function pcNextCaseNoLocked_(documentYear) {
  var rows = pcListObjects_(PC_CONST.SHEETS.SUBMISSIONS);
  var max = 0;
  var prefix = 'PC-' + String(documentYear) + '-';
  rows.forEach(function(row) {
    var c = String(row.CaseNo || '');
    if (c.indexOf(prefix) === 0) max = Math.max(max, parseInt(c.substring(prefix.length), 10) || 0);
  });
  return prefix + String(max + 1).padStart(6, '0');
}

/** Promotes a fully uploaded version atomically to CurrentVersion and queues review notification. */
function submitPrecheck(submissionId, versionId) {
  try {
    var principal = getCurrentPrincipal_();
    var result = pcWithScriptLock_(function() {
      var submission = pcSubmissionById_(submissionId);
      var version = pcVersionById_(versionId);
      if (!submission || !version || String(version.SubmissionId) !== String(submissionId)) throw pcUserError_('ไม่พบฉบับเอกสารที่ต้องการส่ง', 'VERSION_NOT_FOUND');
      if (!pcCanEditSubmission_(submission, principal)) throw pcUserError_('คุณไม่มีสิทธิ์ส่งรายการนี้', 'FORBIDDEN');
      var document = pcMasterDocument_(submission.DocumentNumber, true);
      if (!document || document.documentType !== PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY) throw pcUserError_('ข้อมูลทะเบียนเอกสารไม่ถูกต้อง', 'MASTER_INVALID');
      if (document.finalLink) throw pcUserError_('เอกสารนี้ได้รับการบันทึกเป็นเอกสารฉบับสมบูรณ์แล้ว', 'ALREADY_FINAL');
      if ([PC_CONST.VERSION_STATUS.DRAFT, PC_CONST.VERSION_STATUS.UPLOADED].indexOf(String(version.VersionStatus)) === -1) {
        if (String(version.VersionStatus) === PC_CONST.VERSION_STATUS.SUBMITTED && Number(submission.CurrentVersion) === Number(version.VersionNo)) return { submission:submission, version:version, idempotent:true };
        throw pcUserError_('สถานะฉบับเอกสารไม่อนุญาตให้ส่งตรวจ', 'INVALID_VERSION_STATE');
      }
      pcValidateVersionForSubmit_(version, document);
      var priorCurrent = Number(submission.CurrentVersion || 0);
      var nextStatus = priorCurrent > 0 ? PC_CONST.STATUS.WAITING_REVIEW_REVISED : PC_CONST.STATUS.WAITING_REVIEW;
      version = pcPatchObject_(PC_CONST.SHEETS.VERSIONS, version._rowNumber, { VersionStatus: PC_CONST.VERSION_STATUS.SUBMITTED });
      submission = pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS, submission._rowNumber, {
        CurrentVersion: Number(version.VersionNo), Status: nextStatus, LastSubmittedAt: pcNowIso_(), UpdatedAt: pcNowIso_(), LastErrorCode:'', LastErrorMessage:''
      });
      return { submission:submission, version:version, idempotent:false };
    });
    var eventType = Number(result.version.VersionNo) > 1 ? 'REVISION_SUBMITTED' : 'SUBMISSION_RECEIVED';
    // Queue is idempotent; retrying submit also repairs a prior notification-queue failure.
    pcQueueSubmissionNotificationSafe_(eventType, result.submission, result.version, {});
    if (!result.idempotent) {
      pcAudit_('SUBMIT', result.submission, principal, { versionId:result.version.VersionId, versionNo:result.version.VersionNo });
      pcLegacySummaryLog_(principal, Number(result.version.VersionNo) > 1 ? 'ส่งรายงาน Pre-check ฉบับแก้ไข' : 'ส่งรายงาน Pre-check', result.submission.DocumentNumber);
      pcInvalidateDashboardCache_();
    }
    return { success:true, status:result.submission.Status, submissionId:result.submission.SubmissionId, versionNo:Number(result.version.VersionNo) };
  } catch (error) {
    throw pcHandlePublicError_(error, 'submitPrecheck', { submissionId:submissionId, versionId:versionId });
  }
}

/** Returns only cases the current user can see. */
function getMyDocuments(filters) {
  try {
    var principal = getCurrentPrincipal_();
    filters = filters || {};
    var rows = pcListObjects_(PC_CONST.SHEETS.SUBMISSIONS).filter(function(row){ return pcCanEditSubmission_(row, principal); });
    if (filters.status) rows = rows.filter(function(row){ return String(row.Status) === String(filters.status); });
    if (filters.year) rows = rows.filter(function(row){ return Number(row.DocumentYear) === Number(filters.year); });
    rows.sort(function(a,b){ return String(b.UpdatedAt || '').localeCompare(String(a.UpdatedAt || '')); });
    return rows.map(function(row){
      return { submissionId:row.SubmissionId, caseNo:row.CaseNo, documentNumber:row.DocumentNumber, documentName:row.DocumentNameSnapshot, status:row.Status, currentVersion:Number(row.CurrentVersion || 0), updatedAt:row.UpdatedAt, lastSubmittedAt:row.LastSubmittedAt };
    });
  } catch (error) {
    throw pcHandlePublicError_(error, 'getMyDocuments', {});
  }
}

/** Returns submission detail and review results; FIX-only is the default result view. */
function getMyDocumentDetail(submissionId, includeAllResults) {
  try {
    var principal = getCurrentPrincipal_();
    var submission = pcSubmissionById_(submissionId);
    if (!submission || !pcCanViewSubmission_(submission, principal)) throw pcUserError_('ไม่พบรายการหรือคุณไม่มีสิทธิ์ดูรายการนี้', 'FORBIDDEN');
    var versions = pcVersionsForSubmission_(submissionId);
    var reviews = pcFilterObjects_(PC_CONST.SHEETS.REVIEWS, function(r){ return String(r.SubmissionId) === String(submissionId) && String(r.ReviewStatus) === PC_CONST.REVIEW_STATUS.COMPLETED; });
    var responses = [];
    reviews.forEach(function(review){
      pcFilterObjects_(PC_CONST.SHEETS.REVIEW_RESPONSES, function(r){ return String(r.ReviewId) === String(review.ReviewId); }).forEach(function(r){ responses.push(r); });
    });
    if (!includeAllResults) responses = responses.filter(function(r){ return String(r.Result) === PC_CONST.REVIEW_RESULT.FIX; });
    var itemMap = {}; pcTemplateItems_(submission.TemplateId).forEach(function(item){ itemMap[String(item.ItemId)] = item; });
    var quickMap = {}; pcListObjects_(PC_CONST.SHEETS.QUICK_COMMENTS).forEach(function(q){ quickMap[String(q.QuickCommentId)] = String(q.FullText || q.Label || ''); });
    responses = responses.map(function(r){ var copy={}; Object.keys(r).forEach(function(k){copy[k]=r[k];}); copy.ItemLabel=(itemMap[String(r.ItemId)]&&itemMap[String(r.ItemId)].ItemLabel)||r.ItemId;copy.QuickCommentTexts=String(r.QuickCommentIds||'').split(',').map(function(id){return quickMap[id]||'';}).filter(String);return copy; });
    responses.sort(function(a,b){ return (Number(a.PageNumber || 999999) - Number(b.PageNumber || 999999)) || String(a.ItemId).localeCompare(String(b.ItemId)); });
    return { submission:submission, versions:versions, reviews:reviews, responses:responses, canEdit:pcCanEditSubmission_(submission, principal) };
  } catch (error) {
    throw pcHandlePublicError_(error, 'getMyDocumentDetail', { submissionId:submissionId });
  }
}
