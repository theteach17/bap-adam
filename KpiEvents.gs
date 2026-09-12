/** Append-only analytics telemetry and reconciliation. KPI failures never roll back operational workflow. */

/** Appends a KPI event only when EventKey does not already exist. */
function kpiAppendEventOnce_(event) {
  var key=String(event.EventKey||'');
  if(!key)throw new Error('KPI_EVENT_KEY_REQUIRED');
  // Client telemetry may arrive concurrently from multiple tabs. Serialize the
  // read-check-append sequence so the EventKey remains truly idempotent.
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))throw new Error('KPI_EVENT_LOCK_TIMEOUT');
  try {
    var headers=KPI_HEADERS.PC_KPIEvents, keys=kpiReadColumn_(KPI_CONST.SHEETS.EVENTS,2).map(String);
    if(keys.indexOf(key)!==-1)return false;
    event.EventId=event.EventId||kpiUuid_();event.CreatedAt=event.CreatedAt||kpiNowIso_();
    kpiAppendObjects_(KPI_CONST.SHEETS.EVENTS,headers,[event]);return true;
  } finally { lock.releaseLock(); }
}

/** Public telemetry endpoint for future UI instrumentation; accepts only a strict allowlist. */
function recordKpiClientEvent(eventType, context) {
  var allowed=[KPI_CONST.EVENT.QUEUE_OPEN,KPI_CONST.EVENT.REVIEW_OPEN];
  eventType=String(eventType||'');
  if(allowed.indexOf(eventType)===-1)throw new Error('KPI_EVENT_NOT_ALLOWED');
  var principal=requireOfficer_('recordKpiClientEvent')||getCurrentPrincipal_();context=context||{};
  var now=kpiNowIso_(),nonce=String(context.nonce||kpiUuid_());
  return kpiAppendEventOnce_({EventKey:'CLIENT:'+eventType+':'+kpiEmail_(principal.email)+':'+nonce,Timestamp:now,OfficerEmail:kpiEmail_(principal.email),OfficerName:String(principal.displayName||''),EventType:eventType,SubmissionId:String(context.submissionId||''),VersionId:String(context.versionId||''),ReviewId:String(context.reviewId||''),SessionId:String(context.sessionId||''),Source:'WEB',MetadataJSON:JSON.stringify({page:String(context.page||''),nonce:nonce})});
}

/** Rebuilds deterministic lifecycle events from source tables, repairing telemetry gaps idempotently. */
function runKpiReconcileCore_() {
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))return{ok:false,skipped:'LOCKED'};
  try{
    var cfg=kpiGetConfig_();if(!cfg.enabled)return{ok:true,disabled:true};
    kpiJobStage_('LOADING_SOURCE','กำลังอ่าน Versions และ Reviews');
    var model=kpiLoadModel_({includeAudit:false}),existingKeys=kpiReadColumn_(KPI_CONST.SHEETS.EVENTS,2),keys={};existingKeys.forEach(function(k){keys[String(k||'')]=true;});
    var pending=[];kpiJobStage_('BUILDING_EVENTS','กำลังสร้าง lifecycle events');
    model.versions.forEach(function(v){if(!v.UploadedAt)return;var key='VERSION_UPLOADED:'+v.VersionId;if(keys[key])return;pending.push({EventId:kpiUuid_(),EventKey:key,Timestamp:v.UploadedAt,OfficerEmail:'',OfficerName:'',EventType:KPI_CONST.EVENT.VERSION_UPLOADED,SubmissionId:String(v.SubmissionId||''),VersionId:String(v.VersionId||''),ReviewId:'',SessionId:'',Source:'RECONCILE',MetadataJSON:JSON.stringify({versionNo:Number(v.VersionNo||0)}),CreatedAt:kpiNowIso_()});keys[key]=true;});
    model.reviews.forEach(function(r){
      if(r.StartedAt){var startKey='REVIEW_STARTED:'+r.ReviewId;if(!keys[startKey]){pending.push({EventId:kpiUuid_(),EventKey:startKey,Timestamp:r.StartedAt,OfficerEmail:kpiEmail_(r.ReviewerEmail),OfficerName:String(r.ReviewerName||''),EventType:KPI_CONST.EVENT.REVIEW_STARTED,SubmissionId:String(r.SubmissionId||''),VersionId:String(r.VersionId||''),ReviewId:String(r.ReviewId||''),SessionId:'',Source:'RECONCILE',MetadataJSON:'{}',CreatedAt:kpiNowIso_()});keys[startKey]=true;}}
      if(r.CompletedAt){var doneKey='REVIEW_COMPLETED:'+r.ReviewId;if(!keys[doneKey]){pending.push({EventId:kpiUuid_(),EventKey:doneKey,Timestamp:r.CompletedAt,OfficerEmail:kpiEmail_(r.ReviewerEmail),OfficerName:String(r.ReviewerName||''),EventType:KPI_CONST.EVENT.REVIEW_COMPLETED,SubmissionId:String(r.SubmissionId||''),VersionId:String(r.VersionId||''),ReviewId:String(r.ReviewId||''),SessionId:'',Source:'RECONCILE',MetadataJSON:JSON.stringify({decision:String(r.Decision||'')}),CreatedAt:kpiNowIso_()});keys[doneKey]=true;}}
    });
    kpiJobStage_('WRITING_EVENTS','กำลังบันทึก events',pending.length);
    var added=kpiAppendObjects_(KPI_CONST.SHEETS.EVENTS,KPI_HEADERS.PC_KPIEvents,pending);
    kpiJobStage_('RECONCILING_ASSIGNMENTS','กำลังตรวจ Assignment safety layer',added);
    var assignments=kpiReconcileAssignments_(model,cfg);
    return{ok:true,eventsAdded:added,assignments:assignments};
  }finally{lock.releaseLock();}
}

/** Manual editor-only wrapper for reconciliation. */
function runKpiReconcileNow(){kpiRequireAdminEditor_();return kpiRunTrackedJob_('RECONCILE','MANUAL_EDITOR',runKpiReconcileCore_);}
