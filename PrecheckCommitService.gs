/** Private idempotent final commit. Browser cannot invoke functions whose names end with underscore. */
function commitApprovedSubmission_(submissionId) {
  var principal={username:'SYSTEM',displayName:'SYSTEM',email:'',roles:[PC_CONST.ROLES.ADMIN]};
  try{
    var claimed=pcWithScriptLock_(function(){
      var submission=pcSubmissionById_(submissionId);
      if(!submission)throw new Error('Submission not found: '+submissionId);
      if(String(submission.Status)===PC_CONST.STATUS.APPROVED_COMMITTED&&String(submission.CommitStatus)===PC_CONST.COMMIT_STATUS.COMMITTED)return{submission:submission,version:pcCurrentVersion_(submission),alreadyDone:true,inProgress:false};
      if([PC_CONST.STATUS.APPROVED_PENDING_COMMIT,PC_CONST.STATUS.APPROVED_COMMIT_FAILED,PC_CONST.STATUS.APPROVED_COMMITTING].indexOf(String(submission.Status))===-1)throw new Error('Submission is not commit-eligible: '+submission.Status);
      var version=pcCurrentVersion_(submission);
      if(!version||String(version.VersionStatus)!==PC_CONST.VERSION_STATUS.APPROVED)throw new Error('Current approved version missing');
      if(String(submission.Status)===PC_CONST.STATUS.APPROVED_COMMITTING){
        var cfg=getPrecheckConfig_(),lastAttempt=new Date(submission.CommitLastAttemptAt||0).getTime();
        if(lastAttempt&&Date.now()-lastAttempt<cfg.commitAlertAfterMinutes*60000)return{submission:submission,version:version,alreadyDone:false,inProgress:true};
      }
      var commitId=String(submission.CommitId||'')||('PC:'+submission.SubmissionId+':'+version.VersionId+':FINAL');
      submission=pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,submission._rowNumber,{CommitId:commitId,CommitStatus:PC_CONST.COMMIT_STATUS.COMMITTING,Status:PC_CONST.STATUS.APPROVED_COMMITTING,CommitAttemptCount:Number(submission.CommitAttemptCount||0)+1,CommitLastAttemptAt:pcNowIso_(),NextCommitAttemptAt:'',LastErrorCode:'',LastErrorMessage:'',UpdatedAt:pcNowIso_()});
      return{submission:submission,version:version,alreadyDone:false,inProgress:false};
    });
    if(claimed.alreadyDone){
      try{pcQueueSubmissionNotificationSafe_('FINAL_SUCCESS',claimed.submission,claimed.version||pcCurrentVersion_(claimed.submission),{});}catch(notificationError){console.error('Final notification reconciliation failed: '+notificationError.message);}
      return{success:true,status:PC_CONST.STATUS.APPROVED_COMMITTED,idempotent:true};
    }
    if(claimed.inProgress)return{success:true,status:PC_CONST.STATUS.APPROVED_COMMITTING,idempotent:true,inProgress:true};
    var submission=claimed.submission,version=claimed.version,document=pcMasterDocument_(submission.DocumentNumber,true);
    if(!document||document.documentType!==PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY)throw new Error('Master document no longer resolves as REPORT_ACTIVITY');
    if(Number(version.VersionNo)!==Number(submission.CurrentVersion))throw new Error('Approved version is no longer current');
    if(document.finalLink&&!pcSameDriveFile_(document.finalLink,version.FileUrl)){
      var preflightConflict=pcUserError_('พบลิงก์เอกสารฉบับสมบูรณ์เดิมที่ไม่ตรงกัน ระบบหยุดบันทึกและแจ้งเจ้าหน้าที่แล้ว','MASTER_LINK_CONFLICT');preflightConflict.pcCommitConflict=true;throw preflightConflict;
    }
    // Preflight Production schema and detect a concurrent/legacy final row before any Drive move.
    var reportSubmitSheet=getSpreadsheet_().getSheetByName(reportSubmitSheetName);
    pcRequireReportSubmitProvenanceSchema_(reportSubmitSheet);
    var existingCommitRow=pcFindReportSubmitByCommitId_(submission.CommitId);
    var existingDocumentRow=pcFindExistingFinalReportRow_(document.documentNumber);
    if(existingDocumentRow&&!existingCommitRow){
      var rowConflict=pcUserError_('พบข้อมูลฉบับสมบูรณ์ของหมายเลขเอกสารนี้อยู่แล้ว ระบบหยุดบันทึกเพื่อป้องกันข้อมูลซ้ำ','FINAL_ROW_CONFLICT');rowConflict.pcCommitConflict=true;throw rowConflict;
    }
    pcAudit_('COMMIT_CLAIM',{SubmissionId:submission.SubmissionId,VersionId:version.VersionId},principal,{commitId:submission.CommitId,attempt:submission.CommitAttemptCount});

    // Actual state is checked before every side effect; CommitStep is only a checkpoint.
    var move=pcEnsureFileMoved_(submission,version,document);
    submission=pcCheckpointCommit_(submission.SubmissionId,PC_CONST.COMMIT_STEP.FILE_MOVED,{FinalFileId:move.fileId,FinalFileUrl:move.fileUrl});
    pcAudit_('COMMIT_FILE_MOVED',{SubmissionId:submission.SubmissionId,VersionId:version.VersionId},principal,{fileId:move.fileId});

    var submitRow=pcEnsureReportSubmitWritten_(submission,version,document,move.fileUrl);
    submission=pcCheckpointCommit_(submission.SubmissionId,PC_CONST.COMMIT_STEP.SUBMIT_WRITTEN,{CentralReportSubmitRow:submitRow});
    pcAudit_('COMMIT_SUBMIT_WRITTEN',{SubmissionId:submission.SubmissionId,VersionId:version.VersionId},principal,{row:submitRow,commitId:submission.CommitId});

    pcEnsureMasterFinalLink_(submission,document,move.fileUrl);
    submission=pcCheckpointCommit_(submission.SubmissionId,PC_CONST.COMMIT_STEP.MASTER_UPDATED,{});
    pcAudit_('COMMIT_MASTER_UPDATED',{SubmissionId:submission.SubmissionId,VersionId:version.VersionId},principal,{finalUrl:move.fileUrl});

    submission=pcWithScriptLock_(function(){
      var fresh=pcSubmissionById_(submission.SubmissionId);
      return pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,fresh._rowNumber,{CommitStep:PC_CONST.COMMIT_STEP.DONE,CommitStatus:PC_CONST.COMMIT_STATUS.COMMITTED,Status:PC_CONST.STATUS.APPROVED_COMMITTED,CommittedAt:pcNowIso_(),ClosedAt:pcNowIso_(),UpdatedAt:pcNowIso_(),LastErrorCode:'',LastErrorMessage:'',NextCommitAttemptAt:''});
    });
    pcInvalidateMasterDocumentCache_(submission.DocumentNumber);pcInvalidateDashboardCache_();
    pcAudit_('COMMIT_DONE',{SubmissionId:submission.SubmissionId,VersionId:version.VersionId,NewStatus:PC_CONST.STATUS.APPROVED_COMMITTED},principal,{commitId:submission.CommitId});
    pcLegacySummaryLog_(principal,'ผ่าน Pre-check',submission.DocumentNumber);
    pcQueueSubmissionNotificationSafe_('FINAL_SUCCESS',submission,version,{});
    return{success:true,status:submission.Status,commitId:submission.CommitId,idempotent:false};
  }catch(error){
    pcRecordCommitFailure_(submissionId,error);
    throw error;
  }
}

/** Idempotently confirms the approved FileId is already in, or moves it to, the trusted final folder. */
function pcEnsureFileMoved_(submission,version,document){
  if(!version.FileId)throw new Error('Approved version has no FileId');
  return pcMoveApprovedFile_(version,submission,document);
}

/** Validates production provenance columns and returns the existing row for a CommitId when present. */
function pcFindReportSubmitByCommitId_(commitId){
  var sheet=getSpreadsheet_().getSheetByName(reportSubmitSheetName);if(!sheet)throw new Error('ReportSubmit sheet missing');
  pcRequireReportSubmitProvenanceSchema_(sheet);
  if(sheet.getLastRow()<2)return 0;
  var values=sheet.getRange(2,29,sheet.getLastRow()-1,1).getValues(); // AC
  for(var i=0;i<values.length;i++)if(String(values[i][0]||'')===String(commitId))return i+2;
  return 0;
}

/** Appends the final ReportSubmit row only when the CommitId is absent. */
function pcEnsureReportSubmitWritten_(submission,version,document,finalUrl){
  var existing=pcFindReportSubmitByCommitId_(submission.CommitId);if(existing)return existing;
  var sheet=getSpreadsheet_().getSheetByName(reportSubmitSheetName);pcRequireReportSubmitProvenanceSchema_(sheet);
  // Recheck under a short script lock to protect concurrent retries.
  return pcWithScriptLock_(function(){
    var duplicate=pcFindReportSubmitByCommitId_(submission.CommitId);if(duplicate)return duplicate;
    var row=new Array(32).fill(''); // A:AF
    row[1]=document.documentNumber;row[2]=document.documentName;row[3]=document.adminGroup;row[4]=document.workGroup;row[5]=document.responsiblePerson;row[6]=finalUrl;
    row[7]=version.QuantitativeTarget;row[8]=version.QualitativeTarget;row[9]=version.QuantitativeResult;row[10]=version.QualitativeResult;row[11]=version.ExpectedTarget;row[12]=version.ManagementXbar;row[13]='';row[14]=document.project;row[15]=document.ownerEmail;row[16]=version.AllocatedBudget;row[17]=version.ActualBudget;row[18]=document.activityCode;row[19]=version.ActivityNameSnapshot||document.activityName;row[20]=version.ExpectedAchievementResult;row[21]=version.SatisfactionXbar;row[22]=version.SatisfactionSD;row[23]=version.ManagementSD;row[24]=version.ReportValidationType;row[25]=version.PRIndicator;
    row[26]=submission.SubmissionId;row[27]=Number(version.VersionNo);row[28]=submission.CommitId;row[29]=submission.ApprovedByEmail;row[30]=submission.ApprovedAt;row[31]='PRECHECK';
    var next=Math.max(2,sheet.getLastRow()+1);sheet.getRange(next,1,1,row.length).setValues([row]);SpreadsheetApp.flush();
    return next;
  });
}

/** Updates ReportNo!H only if blank or already identical; a different URL is a hard conflict. */
function pcEnsureMasterFinalLink_(submission,document,finalUrl){
  return pcWithScriptLock_(function(){
    var fresh=pcMasterDocument_(document.documentNumber,true);if(!fresh)throw new Error('Master document disappeared during commit');
    var current=String(fresh.finalLink||'').trim();
    if(current&&!pcSameDriveFile_(current,finalUrl)){
      var conflict=pcUserError_('พบลิงก์เอกสารฉบับสมบูรณ์เดิมที่ไม่ตรงกัน ระบบหยุดบันทึกและแจ้งเจ้าหน้าที่แล้ว','MASTER_LINK_CONFLICT');conflict.pcCommitConflict=true;throw conflict;
    }
    if(!current){var sheet=getSpreadsheet_().getSheetByName(sheetName);sheet.getRange(fresh.rowNumber,8).setValue(finalUrl);SpreadsheetApp.flush();}
    pcInvalidateMasterDocumentCache_(document.documentNumber);return true;
  });
}

/** Persists a short commit checkpoint under lock. */
function pcCheckpointCommit_(submissionId,step,extraPatch){
  return pcWithScriptLock_(function(){var fresh=pcSubmissionById_(submissionId);if(!fresh)throw new Error('Submission missing during checkpoint');var patch=extraPatch||{};patch.CommitStep=step;patch.UpdatedAt=pcNowIso_();return pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,fresh._rowNumber,patch);});
}

/** Records retry state and operational alert without undoing approval. */
function pcRecordCommitFailure_(submissionId,error){
  try{
    var failed=pcWithScriptLock_(function(){var s=pcSubmissionById_(submissionId);if(!s||String(s.Status)===PC_CONST.STATUS.APPROVED_COMMITTED)return s;var attempts=Number(s.CommitAttemptCount||0),delay=Math.min(360,Math.pow(2,Math.min(attempts,7))*5);return pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,s._rowNumber,{CommitStatus:PC_CONST.COMMIT_STATUS.FAILED,Status:PC_CONST.STATUS.APPROVED_COMMIT_FAILED,LastErrorCode:(error&&error.pcCode)||'COMMIT_FAILED',LastErrorMessage:String(error&&error.message||error).substring(0,500),NextCommitAttemptAt:pcIsoAfterMinutes_(delay),UpdatedAt:pcNowIso_()});});
    if(failed){pcAudit_('COMMIT_FAILURE',{SubmissionId:submissionId,NewStatus:PC_CONST.STATUS.APPROVED_COMMIT_FAILED},{username:'SYSTEM',displayName:'SYSTEM',email:'',roles:[]},{error:String(error&&error.message||error),attempts:failed.CommitAttemptCount});var cfg=getPrecheckConfig_();if(Number(failed.CommitAttemptCount||0)===1||Number(failed.CommitAttemptCount||0)>=cfg.commitMaxAutoRetry||error.pcCommitConflict)pcQueueOperationalAlertSafe_('Final Commit ต้องตรวจสอบ','เอกสาร '+failed.DocumentNumber+' บันทึกฉบับสมบูรณ์ไม่สำเร็จ: '+String(error&&error.message||error),{submissionId:submissionId});}
    pcInvalidateDashboardCache_();
  }catch(secondary){console.error('Unable to record commit failure: '+secondary.message);}
}

/** Confirms AA:AF exactly match the approved provenance schema before any commit write. */
function pcRequireReportSubmitProvenanceSchema_(sheet){
  if(sheet.getMaxColumns()<32)throw new Error('ReportSubmit provenance columns are not installed');
  var headers=sheet.getRange(1,27,1,6).getValues()[0].map(function(v){return String(v||'').trim();});
  for(var i=0;i<PC_CONST.REPORTSUBMIT_PROVENANCE.length;i++)if(headers[i]!==PC_CONST.REPORTSUBMIT_PROVENANCE[i])throw new Error('ReportSubmit provenance schema mismatch at column '+(27+i));
  return true;
}

/** Private reconciliation worker for pending/failed/stale commits. */
function reconcilePendingCommits_(){
  var cfg=getPrecheckConfig_();if(!cfg.enabled||!cfg.reconcileEnabled||!cfg.dbId)return{attempted:0};
  var now=Date.now(),rows=pcListObjects_(PC_CONST.SHEETS.SUBMISSIONS).filter(function(s){
    var st=String(s.Status),due=!s.NextCommitAttemptAt||new Date(s.NextCommitAttemptAt).getTime()<=now;
    if(st===PC_CONST.STATUS.APPROVED_PENDING_COMMIT)return true;
    if(st===PC_CONST.STATUS.APPROVED_COMMIT_FAILED)return due&&Number(s.CommitAttemptCount||0)<cfg.commitMaxAutoRetry;
    if(st===PC_CONST.STATUS.APPROVED_COMMITTING){var last=new Date(s.CommitLastAttemptAt||0).getTime();return !last||now-last>cfg.commitAlertAfterMinutes*60000;}
    return false;
  }).slice(0,10),attempted=0;
  rows.forEach(function(s){try{commitApprovedSubmission_(s.SubmissionId);attempted++;}catch(e){console.error('Commit reconcile failed '+s.SubmissionId+': '+e.message);}});
  return{attempted:attempted};
}
