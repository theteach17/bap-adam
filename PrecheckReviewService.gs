/** Opens/resumes a review under a logical lease; a second officer receives read-only data. */
function openReview(submissionId) {
  try {
    var principal = requireOfficer_('openReview');
    var payload = pcWithScriptLock_(function(){
      var submission = pcSubmissionById_(submissionId);
      if (!submission) throw pcUserError_('ไม่พบรายการที่ต้องการตรวจ', 'SUBMISSION_NOT_FOUND');
      if ([PC_CONST.STATUS.WAITING_REVIEW,PC_CONST.STATUS.WAITING_REVIEW_REVISED,PC_CONST.STATUS.IN_REVIEW].indexOf(String(submission.Status)) === -1) throw pcUserError_('สถานะเอกสารไม่อนุญาตให้เปิดตรวจ', 'INVALID_REVIEW_STATE');
      var version = pcCurrentVersion_(submission);
      if (!version || String(version.VersionStatus) !== PC_CONST.VERSION_STATUS.SUBMITTED) throw pcUserError_('ไม่พบ Current Version ที่พร้อมตรวจ', 'CURRENT_VERSION_INVALID');
      var reviews = pcFilterObjects_(PC_CONST.SHEETS.REVIEWS, function(r){ return String(r.SubmissionId)===String(submissionId) && String(r.VersionId)===String(version.VersionId) && String(r.ReviewStatus)===PC_CONST.REVIEW_STATUS.IN_PROGRESS; });
      var review = reviews[0] || null;
      var lockedBy = review ? String(review.LockedBy || '') : '';
      var lockExpired = !review || pcIsoExpired_(review.LockUntil);
      var me = pcKey_(principal.email);
      var readOnly = !!(review && lockedBy && pcKey_(lockedBy) !== me && !lockExpired);
      if (!review) {
        var items = pcTemplateItems_(submission.TemplateId);
        var responses = {};
        items.forEach(function(item){ responses[item.ItemId] = { result:PC_CONST.REVIEW_RESULT.UNREVIEWED, issueSeverity:String(item.DefaultSeverity||'MINOR'), comment:'', pageNumber:'', quickCommentIds:[] }; });
        review = pcAppendObject_(PC_CONST.SHEETS.REVIEWS, {
          ReviewId:pcUuid_(), SubmissionId:submissionId, VersionId:version.VersionId, TemplateId:submission.TemplateId,
          ReviewerEmail:principal.email, ReviewerName:principal.displayName, ReviewStatus:PC_CONST.REVIEW_STATUS.IN_PROGRESS, Decision:'', GeneralComment:'', ResponsesJSON:JSON.stringify(responses),
          StartedAt:pcNowIso_(), LastSavedAt:pcNowIso_(), CompletedAt:'', LockedBy:principal.email, LockUntil:pcIsoAfterMinutes_(getPrecheckConfig_().reviewLockMinutes),
          TotalItems:items.length, PassedItems:0, FixItems:0, NoteItems:0, NAItems:0, UnreviewedItems:items.length
        });
        submission = pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS, submission._rowNumber, { Status:PC_CONST.STATUS.IN_REVIEW, UpdatedAt:pcNowIso_() });
        readOnly = false;
      } else if (!readOnly) {
        review = pcPatchObject_(PC_CONST.SHEETS.REVIEWS, review._rowNumber, { ReviewerEmail:principal.email, ReviewerName:principal.displayName, LockedBy:principal.email, LockUntil:pcIsoAfterMinutes_(getPrecheckConfig_().reviewLockMinutes), LastSavedAt:pcNowIso_() });
        if (String(submission.Status) !== PC_CONST.STATUS.IN_REVIEW) submission = pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS, submission._rowNumber, { Status:PC_CONST.STATUS.IN_REVIEW, UpdatedAt:pcNowIso_() });
      }
      return { submission:submission, version:version, review:review, readOnly:readOnly };
    });
    var items = pcTemplateItems_(payload.submission.TemplateId);
    var quick = pcListObjects_(PC_CONST.SHEETS.QUICK_COMMENTS).filter(function(q){ return pcBool_(q.Active,true); }).sort(function(a,b){ return Number(a.SortOrder||0)-Number(b.SortOrder||0); });
    var history = pcReviewHistory_(payload.submission.SubmissionId);
    var previousReviewContext = pcPreviousReviewContext_(payload.submission.SubmissionId, payload.version.VersionNo);
    pcAudit_('REVIEW_STARTED', {SubmissionId:payload.submission.SubmissionId,VersionId:payload.version.VersionId,ReviewId:payload.review.ReviewId}, principal, { readOnly:payload.readOnly });
    pcInvalidateDashboardCache_();
    return { submission:payload.submission, version:payload.version, review:payload.review, items:items, quickComments:quick, history:history, previousFixItemIds:previousReviewContext.fixItemIds, previousFixDetails:previousReviewContext.fixDetails, previousReview:previousReviewContext.reviewSummary, readOnly:payload.readOnly, canAdminTakeover:payload.readOnly&&principal.roles.indexOf(PC_CONST.ROLES.ADMIN)!==-1, lockedBy:payload.readOnly?payload.review.LockedBy:'', pdfUrl:payload.version.FileUrl };
  } catch (error) { throw pcHandlePublicError_(error, 'openReview', {submissionId:submissionId}); }
}

/** Admin-only explicit takeover of an active review lease; every override is audited. */
function takeoverReview(reviewId) {
  try {
    var principal=requirePrecheckAdmin_('takeoverReview');
    var result=pcWithScriptLock_(function(){
      var review=pcFindObject_(PC_CONST.SHEETS.REVIEWS,'ReviewId',reviewId,false);
      if(!review||String(review.ReviewStatus)!==PC_CONST.REVIEW_STATUS.IN_PROGRESS)throw pcUserError_('Review นี้ไม่อยู่ในสถานะที่รับช่วงตรวจได้','REVIEW_NOT_EDITABLE');
      var submission=pcSubmissionById_(review.SubmissionId),version=pcVersionById_(review.VersionId);
      if(!submission||!version||String(submission.Status)!==PC_CONST.STATUS.IN_REVIEW||Number(version.VersionNo)!==Number(submission.CurrentVersion))throw pcUserError_('สถานะรายการเปลี่ยนไป กรุณาโหลดใหม่','REVIEW_STATE_CHANGED');
      var previous=String(review.LockedBy||'');
      review=pcPatchObject_(PC_CONST.SHEETS.REVIEWS,review._rowNumber,{ReviewerEmail:principal.email,ReviewerName:principal.displayName,LockedBy:principal.email,LockUntil:pcIsoAfterMinutes_(getPrecheckConfig_().reviewLockMinutes),LastSavedAt:pcNowIso_()});
      return{review:review,submission:submission,version:version,previous:previous};
    });
    pcAudit_('ADMIN_OVERRIDE',{SubmissionId:result.submission.SubmissionId,VersionId:result.version.VersionId,ReviewId:result.review.ReviewId},principal,{type:'REVIEW_TAKEOVER',previousLockedBy:result.previous,newLockedBy:principal.email});
    return{success:true,reviewId:result.review.ReviewId,lockUntil:result.review.LockUntil};
  }catch(error){throw pcHandlePublicError_(error,'takeoverReview',{reviewId:reviewId});}
}

/** Validates and saves one JSON review draft while renewing the logical lease. */
function saveReviewDraft(reviewId, responsesJSON, generalComment) {
  try {
    var principal = requireOfficer_('saveReviewDraft');
    var result = pcWithScriptLock_(function(){
      var review = pcFindObject_(PC_CONST.SHEETS.REVIEWS,'ReviewId',reviewId,false);
      if (!review || String(review.ReviewStatus)!==PC_CONST.REVIEW_STATUS.IN_PROGRESS) throw pcUserError_('Review นี้ไม่อยู่ในสถานะที่บันทึกได้', 'REVIEW_NOT_EDITABLE');
      if (pcKey_(review.LockedBy)!==pcKey_(principal.email) || pcIsoExpired_(review.LockUntil)) throw pcUserError_('สิทธิ์การตรวจหมดอายุหรือถูกเปลี่ยนผู้ตรวจ กรุณาเปิดรายการใหม่', 'REVIEW_LEASE_LOST');
      var responses=pcValidateReviewResponsesForTemplate_(responsesJSON,review.TemplateId);
      var submission=pcSubmissionById_(review.SubmissionId);
      if (!submission || String(submission.Status)!==PC_CONST.STATUS.IN_REVIEW) throw pcUserError_('สถานะรายการเปลี่ยนไป กรุณาโหลดใหม่', 'REVIEW_STATE_CHANGED');
      var version=pcVersionById_(review.VersionId);
      if (!version || Number(version.VersionNo)!==Number(submission.CurrentVersion)) throw pcUserError_('ฉบับที่กำลังตรวจไม่ใช่ Current Version', 'STALE_VERSION');
      var counts=pcReviewCounts_(responses);
      review=pcPatchObject_(PC_CONST.SHEETS.REVIEWS,review._rowNumber,{ ResponsesJSON:JSON.stringify(responses), GeneralComment:String(generalComment||review.GeneralComment||'').trim(), LastSavedAt:pcNowIso_(), LockedBy:principal.email, LockUntil:pcIsoAfterMinutes_(getPrecheckConfig_().reviewLockMinutes), TotalItems:counts.total, PassedItems:counts.pass, FixItems:counts.fix, NoteItems:counts.note, NAItems:counts.na, UnreviewedItems:counts.unreviewed });
      return review;
    });
    pcAudit_('REVIEW_AUTOSAVED',{ReviewId:reviewId,SubmissionId:result.SubmissionId,VersionId:result.VersionId},principal,{counts:{pass:result.PassedItems,fix:result.FixItems,note:result.NoteItems,na:result.NAItems,unreviewed:result.UnreviewedItems}});
    return {success:true,lastSavedAt:result.LastSavedAt,lockUntil:result.LockUntil};
  } catch(error){ throw pcHandlePublicError_(error,'saveReviewDraft',{reviewId:reviewId}); }
}

/** Validates review JSON against allowed result values and normalized field shapes. */
function pcValidateReviewResponsesShape_(value) {
  var obj=pcParseJson_(value,'ผลการตรวจ');
  if (!obj || Array.isArray(obj) || typeof obj!=='object') throw pcUserError_('รูปแบบผลการตรวจไม่ถูกต้อง','INVALID_REVIEW_JSON');
  var allowed=[PC_CONST.REVIEW_RESULT.PASS,PC_CONST.REVIEW_RESULT.FIX,PC_CONST.REVIEW_RESULT.NOTE,PC_CONST.REVIEW_RESULT.NA,PC_CONST.REVIEW_RESULT.UNREVIEWED];
  Object.keys(obj).forEach(function(itemId){
    var r=obj[itemId]||{};
    r.result=String(r.result||PC_CONST.REVIEW_RESULT.UNREVIEWED).toUpperCase();
    if(allowed.indexOf(r.result)===-1) throw pcUserError_('พบค่าผลการตรวจที่ไม่ถูกต้อง','INVALID_REVIEW_RESULT');
    r.issueSeverity=['MINOR','CRITICAL'].indexOf(String(r.issueSeverity||'MINOR'))!==-1?String(r.issueSeverity||'MINOR'):'MINOR';
    r.comment=String(r.comment||'').trim();
    r.pageNumber=r.pageNumber===''||r.pageNumber==null?'':pcInt_(r.pageNumber,0,1,99999);
    r.quickCommentIds=Array.isArray(r.quickCommentIds)?r.quickCommentIds.map(String):[];
    obj[itemId]=r;
  });
  return obj;
}


/** Reconciles client responses against the frozen template and validates Quick Comment ownership/group. */
function pcValidateReviewResponsesForTemplate_(value, templateId) {
  var raw = pcValidateReviewResponsesShape_(value);
  var items = pcTemplateItems_(templateId), itemMap = {}, normalized = {};
  items.forEach(function(item){ itemMap[String(item.ItemId)] = item; });
  Object.keys(raw).forEach(function(itemId){
    if (!itemMap[String(itemId)]) throw pcUserError_('พบรายการตรวจที่ไม่อยู่ในแบบตรวจของเอกสารนี้', 'REVIEW_ITEM_MISMATCH');
  });
  var quickMap = {};
  pcListObjects_(PC_CONST.SHEETS.QUICK_COMMENTS).forEach(function(q){ if (pcBool_(q.Active,true)) quickMap[String(q.QuickCommentId)] = q; });
  items.forEach(function(item){
    var itemId = String(item.ItemId), r = raw[itemId] || {result:PC_CONST.REVIEW_RESULT.UNREVIEWED,issueSeverity:String(item.DefaultSeverity||'MINOR'),comment:'',pageNumber:'',quickCommentIds:[]};
    (r.quickCommentIds || []).forEach(function(id){
      var q = quickMap[String(id)];
      if (!q) throw pcUserError_('พบ Quick Comment ที่ไม่ถูกต้องหรือถูกปิดใช้งาน', 'QUICK_COMMENT_INVALID');
      if (item.QuickCommentGroup && String(q.GroupId) !== String(item.QuickCommentGroup)) throw pcUserError_('Quick Comment ไม่ตรงกับกลุ่มของรายการตรวจ', 'QUICK_COMMENT_GROUP_MISMATCH');
    });
    normalized[itemId] = r;
  });
  return normalized;
}

/** Counts result values in a review response object. */
function pcReviewCounts_(responses){
  var c={total:0,pass:0,fix:0,note:0,na:0,unreviewed:0};
  Object.keys(responses||{}).forEach(function(k){ c.total++; var r=String(responses[k].result||PC_CONST.REVIEW_RESULT.UNREVIEWED); if(r===PC_CONST.REVIEW_RESULT.PASS)c.pass++; else if(r===PC_CONST.REVIEW_RESULT.FIX)c.fix++; else if(r===PC_CONST.REVIEW_RESULT.NOTE)c.note++; else if(r===PC_CONST.REVIEW_RESULT.NA)c.na++; else c.unreviewed++; });
  return c;
}

/** Completes a review; the server derives the decision and materializes responses in one batch. */
function completeReview(reviewId, decision) {
  try {
    var principal=requireOfficer_('completeReview');
    var result=pcWithScriptLock_(function(){
      var review=pcFindObject_(PC_CONST.SHEETS.REVIEWS,'ReviewId',reviewId,false);
      if(!review) throw pcUserError_('ไม่พบ Review','REVIEW_NOT_FOUND');
      if(String(review.ReviewStatus)===PC_CONST.REVIEW_STATUS.COMPLETED){ return {review:review,submission:pcSubmissionById_(review.SubmissionId),version:pcVersionById_(review.VersionId),idempotent:true}; }
      if(pcKey_(review.LockedBy)!==pcKey_(principal.email)||pcIsoExpired_(review.LockUntil)) throw pcUserError_('สิทธิ์การตรวจหมดอายุ กรุณาเปิดรายการใหม่','REVIEW_LEASE_LOST');
      var submission=pcSubmissionById_(review.SubmissionId), version=pcVersionById_(review.VersionId);
      if(!submission||!version||Number(version.VersionNo)!==Number(submission.CurrentVersion)) throw pcUserError_('ไม่สามารถสรุปผลจากฉบับเก่าได้','STALE_VERSION');
      if(String(submission.Status)!==PC_CONST.STATUS.IN_REVIEW) throw pcUserError_('สถานะรายการไม่อนุญาตให้สรุปผล','INVALID_REVIEW_STATE');
      var items=pcTemplateItems_(review.TemplateId), responses=pcValidateReviewResponsesForTemplate_(review.ResponsesJSON,review.TemplateId);
      items.forEach(function(item){
        var r=responses[item.ItemId]||{result:PC_CONST.REVIEW_RESULT.UNREVIEWED,comment:'',quickCommentIds:[]};
        if(pcBool_(item.Required,false)&&r.result===PC_CONST.REVIEW_RESULT.UNREVIEWED) throw pcUserError_('ยังมีรายการบังคับที่ยังไม่ได้ตรวจ','REQUIRED_UNREVIEWED');
        if(r.result===PC_CONST.REVIEW_RESULT.NA&&!pcBool_(item.AllowNA,false)) throw pcUserError_('พบรายการที่ไม่อนุญาตให้เลือก N/A','NA_NOT_ALLOWED');
        if(r.result===PC_CONST.REVIEW_RESULT.FIX&&!r.comment&&(!r.quickCommentIds||!r.quickCommentIds.length)) throw pcUserError_('รายการ FIX ต้องมีความคิดเห็นหรือ Quick Comment','FIX_COMMENT_REQUIRED');
      });
      var counts=pcReviewCounts_(responses), derivedDecision=counts.fix>0?'REVISION_REQUIRED':'APPROVED';
      pcMaterializeReviewResponses_(review,submission,version,responses,principal);
      review=pcPatchObject_(PC_CONST.SHEETS.REVIEWS,review._rowNumber,{ReviewStatus:PC_CONST.REVIEW_STATUS.COMPLETED,Decision:derivedDecision,CompletedAt:pcNowIso_(),LastSavedAt:pcNowIso_(),LockedBy:'',LockUntil:'',TotalItems:counts.total,PassedItems:counts.pass,FixItems:counts.fix,NoteItems:counts.note,NAItems:counts.na,UnreviewedItems:counts.unreviewed});
      if(derivedDecision==='REVISION_REQUIRED'){
        version=pcPatchObject_(PC_CONST.SHEETS.VERSIONS,version._rowNumber,{VersionStatus:PC_CONST.VERSION_STATUS.REVISION_REQUIRED});
        submission=pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,submission._rowNumber,{Status:PC_CONST.STATUS.REVISION_REQUIRED,UpdatedAt:pcNowIso_()});
      }else{
        version=pcPatchObject_(PC_CONST.SHEETS.VERSIONS,version._rowNumber,{VersionStatus:PC_CONST.VERSION_STATUS.APPROVED});
        var commitId=String(submission.CommitId||'')||('PC:'+submission.SubmissionId+':'+version.VersionId+':FINAL');
        submission=pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,submission._rowNumber,{Status:PC_CONST.STATUS.APPROVED_PENDING_COMMIT,ApprovedAt:pcNowIso_(),ApprovedByEmail:principal.email,CommitStatus:PC_CONST.COMMIT_STATUS.PENDING,CommitId:commitId,CommitStep:submission.CommitStep||PC_CONST.COMMIT_STEP.NONE,UpdatedAt:pcNowIso_()});
      }
      return {review:review,submission:submission,version:version,idempotent:false,decision:derivedDecision,responses:responses};
    });
    var effectiveDecision=result.decision||result.review.Decision;
    if(effectiveDecision==='REVISION_REQUIRED'){
      var notificationResponses=result.responses||pcParseJsonObject_(result.review.ResponsesJSON,'REVIEW_JSON_INVALID');
      // Queue is idempotent; retrying completion also repairs a prior queue-write failure.
      pcQueueSubmissionNotificationSafe_('REVISION_REQUIRED',result.submission,result.version,{review:result.review,responses:notificationResponses});
    }
    if(!result.idempotent){
      if(result.decision==='REVISION_REQUIRED'){
        pcLegacySummaryLog_(principal,'ส่งกลับแก้ไข',result.submission.DocumentNumber);
        pcAudit_('REVISION_REQUIRED',{SubmissionId:result.submission.SubmissionId,VersionId:result.version.VersionId,ReviewId:result.review.ReviewId,PreviousStatus:PC_CONST.STATUS.IN_REVIEW,NewStatus:PC_CONST.STATUS.REVISION_REQUIRED},principal,{fixCount:result.review.FixItems});
      }else{
        pcAudit_('APPROVAL',{SubmissionId:result.submission.SubmissionId,VersionId:result.version.VersionId,ReviewId:result.review.ReviewId,PreviousStatus:PC_CONST.STATUS.IN_REVIEW,NewStatus:PC_CONST.STATUS.APPROVED_PENDING_COMMIT},principal,{commitId:result.submission.CommitId});
      }
      pcInvalidateDashboardCache_();
    }
    var commitResult=null;
    if((result.decision||result.review.Decision)==='APPROVED'&&getPrecheckConfig_().autoCommitEnabled) commitResult=commitApprovedSubmission_(result.submission.SubmissionId);
    return {success:true,decision:result.decision||result.review.Decision,status:pcSubmissionById_(result.submission.SubmissionId).Status,commit:commitResult};
  }catch(error){ throw pcHandlePublicError_(error,'completeReview',{reviewId:reviewId}); }
}

/** Materializes completed review responses exactly once per ReviewId/ItemId. */
function pcMaterializeReviewResponses_(review,submission,version,responses,principal){
  var existing=pcFilterObjects_(PC_CONST.SHEETS.REVIEW_RESPONSES,function(r){return String(r.ReviewId)===String(review.ReviewId);});
  var existingItems={}; existing.forEach(function(r){existingItems[String(r.ItemId)]=true;});
  var now=pcNowIso_(), rows=[];
  Object.keys(responses).forEach(function(itemId){ if(existingItems[itemId])return; var r=responses[itemId]; rows.push({ResponseId:pcUuid_(),SubmissionId:submission.SubmissionId,VersionId:version.VersionId,ReviewId:review.ReviewId,ItemId:itemId,Result:r.result,IssueSeverity:r.issueSeverity||'MINOR',Comment:r.comment||'',PageNumber:r.pageNumber||'',QuickCommentIds:(r.quickCommentIds||[]).join(','),CreatedAt:now,UpdatedAt:now,UpdatedBy:principal.email||principal.username}); });
  pcAppendObjects_(PC_CONST.SHEETS.REVIEW_RESPONSES,rows);
}

/** Officer-only correction of a strictly whitelisted structured version field. */
function correctStructuredData(submissionId,versionId,fieldName,newValue,reason){
  try{
    var principal=requireOfficer_('correctStructuredData');
    var whitelist={AllocatedBudget:'money',ActualBudget:'money',ManagementXbar:'xbar',ManagementSD:'sd',SatisfactionXbar:'xbar',SatisfactionSD:'sd',ExpectedAchievementResult:'enum'};
    fieldName=String(fieldName||''); reason=String(reason||'').trim();
    if(!whitelist[fieldName]) throw pcUserError_('Field นี้ไม่อนุญาตให้เจ้าหน้าที่แก้ไข','FIELD_NOT_WHITELISTED');
    if(!reason) throw pcUserError_('กรุณาระบุเหตุผลการแก้ไข','CORRECTION_REASON_REQUIRED');
    var normalized=newValue;
    if(whitelist[fieldName]==='money') normalized=pcValidatePrecheckMoney_(newValue,fieldName,true);
    if(whitelist[fieldName]==='xbar') normalized=validateDecimalTwoPlaces_(newValue,0.01,5.00,fieldName,true);
    if(whitelist[fieldName]==='sd') normalized=pcValidatePrecheckSd_(newValue,fieldName,true);
    if(whitelist[fieldName]==='enum'&&['บรรลุ','ไม่บรรลุ'].indexOf(String(newValue))===-1) throw pcUserError_('ค่าผลลัพธ์ไม่ถูกต้อง','INVALID_RESULT_ENUM');
    var auditData=pcWithScriptLock_(function(){
      var submission=pcSubmissionById_(submissionId),version=pcVersionById_(versionId);
      if(!submission||!version||String(version.SubmissionId)!==String(submissionId)||Number(version.VersionNo)!==Number(submission.CurrentVersion)) throw pcUserError_('ไม่สามารถแก้ข้อมูลของฉบับเก่าได้','STALE_VERSION');
      if(String(submission.Status)!==PC_CONST.STATUS.IN_REVIEW) throw pcUserError_('สถานะนี้ไม่อนุญาตให้แก้ข้อมูลสรุป','CORRECTION_STATE_INVALID');
      var oldValue=version[fieldName]; var patch={DataCorrectedByOfficer:true,DataCorrectedAt:pcNowIso_(),DataCorrectedByEmail:principal.email}; patch[fieldName]=normalized;
      pcPatchObject_(PC_CONST.SHEETS.VERSIONS,version._rowNumber,patch);
      return {submission:submission,oldValue:oldValue};
    });
    pcAudit_('OFFICER_DATA_CORRECTION',{SubmissionId:submissionId,VersionId:versionId},principal,{FieldName:fieldName,OldValue:auditData.oldValue,NewValue:normalized,Reason:reason,OfficerEmail:principal.email,Timestamp:pcNowIso_()});
    return {success:true,fieldName:fieldName,value:normalized};
  }catch(error){throw pcHandlePublicError_(error,'correctStructuredData',{submissionId:submissionId,versionId:versionId,fieldName:fieldName});}
}

/** Returns previous completed review summaries for history display. */
function pcReviewHistory_(submissionId){
  return pcFilterObjects_(PC_CONST.SHEETS.REVIEWS,function(r){return String(r.SubmissionId)===String(submissionId)&&String(r.ReviewStatus)===PC_CONST.REVIEW_STATUS.COMPLETED;})
    .sort(function(a,b){return String(a.CompletedAt||'').localeCompare(String(b.CompletedAt||''));});
}

/** Returns FIX details from the immediately previous completed review for revised-version comparison. */
function pcPreviousReviewContext_(submissionId,currentVersionNo){
  var empty={fixItemIds:[],fixDetails:{},reviewSummary:null};
  if(Number(currentVersionNo)<=1)return empty;

  var versions=pcVersionsForSubmission_(submissionId),previous=null;
  versions.forEach(function(v){
    if(Number(v.VersionNo)===Number(currentVersionNo)-1)previous=v;
  });
  if(!previous)return empty;

  var reviews=pcFilterObjects_(PC_CONST.SHEETS.REVIEWS,function(r){
    return String(r.VersionId)===String(previous.VersionId)&&String(r.ReviewStatus)===PC_CONST.REVIEW_STATUS.COMPLETED;
  }).sort(function(a,b){
    return String(a.CompletedAt||'').localeCompare(String(b.CompletedAt||''));
  });
  if(!reviews.length)return empty;

  var priorReview=reviews[reviews.length-1];
  var fixDetails={};
  var fixItemIds=[];
  pcFilterObjects_(PC_CONST.SHEETS.REVIEW_RESPONSES,function(r){
    return String(r.ReviewId)===String(priorReview.ReviewId)&&String(r.Result)===PC_CONST.REVIEW_RESULT.FIX;
  }).forEach(function(r){
    var itemId=String(r.ItemId||'');
    if(!itemId)return;
    fixItemIds.push(itemId);
    fixDetails[itemId]={
      result:'FIX',
      issueSeverity:String(r.IssueSeverity||'MINOR'),
      comment:String(r.Comment||''),
      pageNumber:r.PageNumber==null?'':String(r.PageNumber),
      quickCommentIds:String(r.QuickCommentIds||'').split(',').map(function(x){return String(x||'').trim();}).filter(Boolean)
    };
  });

  fixItemIds.sort(function(a,b){
    var ap=Number((fixDetails[a]||{}).pageNumber||999999),bp=Number((fixDetails[b]||{}).pageNumber||999999);
    if(ap!==bp)return ap-bp;
    return a.localeCompare(b);
  });

  return {
    fixItemIds:fixItemIds,
    fixDetails:fixDetails,
    reviewSummary:{
      versionNo:Number(previous.VersionNo||0),
      reviewerEmail:String(priorReview.ReviewerEmail||''),
      reviewerName:String(priorReview.ReviewerName||''),
      completedAt:String(priorReview.CompletedAt||''),
      generalComment:String(priorReview.GeneralComment||''),
      decision:String(priorReview.Decision||'')
    }
  };
}

/** Returns checklist item ids that were FIX in the immediately previous submitted version. */
function pcPreviousFixItemIds_(submissionId,currentVersionNo){
  if(Number(currentVersionNo)<=1)return[];
  var versions=pcVersionsForSubmission_(submissionId),previous=null;
  versions.forEach(function(v){if(Number(v.VersionNo)===Number(currentVersionNo)-1)previous=v;});
  if(!previous)return[];
  var reviews=pcFilterObjects_(PC_CONST.SHEETS.REVIEWS,function(r){return String(r.VersionId)===String(previous.VersionId)&&String(r.ReviewStatus)===PC_CONST.REVIEW_STATUS.COMPLETED;});
  if(!reviews.length)return[];
  return pcFilterObjects_(PC_CONST.SHEETS.REVIEW_RESPONSES,function(r){return String(r.ReviewId)===String(reviews[reviews.length-1].ReviewId)&&String(r.Result)===PC_CONST.REVIEW_RESULT.FIX;}).map(function(r){return String(r.ItemId);});
}
