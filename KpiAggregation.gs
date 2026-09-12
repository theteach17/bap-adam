/** Pre-aggregation, queue snapshots and retention. */

/** Rebuilds PC_KPIDaily deterministically from canonical completed reviews + audit data. */
function rebuildKpiDailyAggregatesCore_() {
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))return{ok:false,skipped:'LOCKED'};
  try{
    kpiJobStage_('LOADING_SOURCE','กำลังอ่าน Reviews และ Audit');
    var cfg=kpiGetConfig_(),model=kpiLoadModel_({includeAudit:true}),allFilter={startDate:'2000-01-01',endDate:'2999-12-31',officerEmail:'',adminGroup:'',workGroup:''};
    kpiJobStage_('CALCULATING','กำลังคำนวณ Daily KPI');
    var metrics=kpiBuildReviewMetrics_(model,allFilter,cfg),engByDay={};
    model.audit.forEach(function(a){var email=kpiEmail_(a.ActorEmail),day=kpiDateKey_(a.Timestamp);if(!email||!day)return;var role=String(a.ActorRole||'');if(role!==PC_CONST.ROLES.OFFICER&&role!==PC_CONST.ROLES.ADMIN)return;if(!kpiIsProductiveAuditAction_(a))return;var key=day+'|'+email,g=engByDay[key]=engByDay[key]||{timestamps:[],queueChecks:0};g.timestamps.push(a.Timestamp);if(String(a.Action)==='LOOKUP')g.queueChecks++;});
    var groups={};metrics.forEach(function(m){var key=m.completedDate+'|'+m.reviewerEmail,g=groups[key]=groups[key]||{date:m.completedDate,email:m.reviewerEmail,name:m.reviewerName,rows:[]};g.rows.push(m);});
    Object.keys(engByDay).forEach(function(key){if(!groups[key]){var parts=key.split('|'),officer=(kpiActiveOfficers_(model).filter(function(o){return o.email===parts[1];})[0]||{});groups[key]={date:parts[0],email:parts[1],name:officer.name||parts[1],rows:[]};}});
    var out=Object.keys(groups).sort().map(function(key){var g=groups[key],rows=g.rows,res=rows.map(function(x){return x.responseMinutes;}),resElapsed=rows.map(function(x){return x.responseElapsedMinutes;}),turn=rows.map(function(x){return x.turnaroundMinutes;}),turnElapsed=rows.map(function(x){return x.turnaroundElapsedMinutes;}),el=rows.map(function(x){return x.reviewElapsedMinutes;}),unique={};rows.forEach(function(x){unique[x.submissionId]=true;});var eng=engByDay[key]||{timestamps:[],queueChecks:0},session=kpiSessionStats_(eng.timestamps,cfg.sessionIdleMinutes,null);return{DailyKey:key,Date:g.date,OfficerEmail:g.email,OfficerName:g.name,CompletedReviews:rows.length,UniqueSubmissions:Object.keys(unique).length,FirstReviews:rows.filter(function(x){return x.versionNo===1;}).length,RevisionReviews:rows.filter(function(x){return x.versionNo>1;}).length,ApprovedReviews:rows.filter(function(x){return x.decision==='APPROVED';}).length,RevisionRequiredReviews:rows.filter(function(x){return x.decision==='REVISION_REQUIRED';}).length,MedianResponseMinutes:kpiMedian_(res),P90ResponseMinutes:kpiPercentile_(res,.9),MedianResponseElapsedMinutes:kpiMedian_(resElapsed),MedianTurnaroundMinutes:kpiMedian_(turn),P90TurnaroundMinutes:kpiPercentile_(turn,.9),MedianTurnaroundElapsedMinutes:kpiMedian_(turnElapsed),MedianReviewElapsedMinutes:kpiMedian_(el),ObservedActiveMinutes:rows.reduce(function(s,x){return s+x.activeMinutes;},0),ProductiveSessions:session.sessions,ActiveDay:eng.timestamps.length||rows.length?'TRUE':'FALSE',SlaEligible:rows.length,SlaResponsePassed:rows.filter(function(x){return x.responseSlaPassed;}).length,SlaTurnaroundPassed:rows.filter(function(x){return x.turnaroundSlaPassed;}).length,ChecklistCompletionRate:rows.length?kpiAverage_(rows.map(function(x){return x.checklistCompletion;}))*100:0,AdminOverrides:0,ReopenedReviews:0,QueueChecks:eng.queueChecks,UpdatedAt:kpiNowIso_()};});
    kpiJobStage_('WRITING_DAILY','กำลังบันทึก Daily Aggregate',out.length);
    var count=kpiReplaceObjects_(KPI_CONST.SHEETS.DAILY,KPI_HEADERS.PC_KPIDaily,out);kpiJobStage_('PRUNING','กำลังดูแล retention',count);var prunedEvents=kpiPruneEvents_(cfg.eventRetentionDays);kpiInvalidateCaches_();return{ok:true,rows:count,prunedEvents:prunedEvents};
  }finally{lock.releaseLock();}
}

/** Captures one lightweight current-queue snapshot for trend analysis. */
function takeKpiQueueSnapshotCore_() {
  var lock=LockService.getScriptLock();if(!lock.tryLock(3000))return{ok:false,skipped:'LOCKED'};
  try {
    var cfg=kpiGetConfig_();if(!cfg.enabled)return{ok:true,disabled:true};kpiJobStage_('LOADING_QUEUE','กำลังอ่านสถานะคิว');var model=kpiLoadModel_({includeAudit:false}),q=kpiQueueHealth_(model,cfg),now=kpiNowIso_();
    kpiJobStage_('WRITING_SNAPSHOT','กำลังบันทึก Queue Snapshot');
    var obj={SnapshotId:kpiUuid_(),Timestamp:now,WaitingCount:q.waitingCount,InReviewCount:q.inReviewCount,RevisionWaitingCount:q.revisionWaitingCount,Under2Hours:q.under2Hours,Hours2to4:q.hours2to4,Hours4to8:q.hours4to8,Over8Hours:q.over8Hours,OldestWaitingMinutes:q.oldestWaitingMinutes,OverResponseSlaCount:q.overResponseSlaCount,CreatedAt:now};
    kpiAppendObjects_(KPI_CONST.SHEETS.QUEUE_SNAPSHOTS,KPI_HEADERS.PC_KPIQueueSnapshots,[obj]);var pruned=kpiPruneQueueSnapshots_(cfg.snapshotRetentionDays);return{ok:true,snapshot:obj,processed:1,pruned:pruned};
  } finally { lock.releaseLock(); }
}

/** Prunes old snapshots while preserving deterministic headers. */
function kpiPruneQueueSnapshots_(retentionDays) {
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.QUEUE_SNAPSHOTS,KPI_HEADERS.PC_KPIQueueSnapshots);if(rows.length<500)return 0;
  var cutoff=Date.now()-Number(retentionDays||365)*86400000,kept=rows.filter(function(r){var d=new Date(r.Timestamp);return isFinite(d.getTime())&&d.getTime()>=cutoff;});if(kept.length===rows.length)return 0;kpiReplaceObjects_(KPI_CONST.SHEETS.QUEUE_SNAPSHOTS,KPI_HEADERS.PC_KPIQueueSnapshots,kept);return rows.length-kept.length;
}

/** Manual editor-only wrappers. */
function rebuildKpiDailyAggregatesNow(){kpiRequireAdminEditor_();return kpiRunTrackedJob_('DAILY_AGGREGATE','MANUAL_EDITOR',rebuildKpiDailyAggregatesCore_);}
function takeKpiQueueSnapshotNow(){kpiRequireAdminEditor_();return kpiRunTrackedJob_('QUEUE_SNAPSHOT','MANUAL_EDITOR',takeKpiQueueSnapshotCore_);}

/** Prunes analytics events older than retention; operational audit/review data is never touched. */
function kpiPruneEvents_(retentionDays) {
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.EVENTS,KPI_HEADERS.PC_KPIEvents);if(rows.length<1000)return 0;
  var cutoff=Date.now()-Number(retentionDays||730)*86400000,kept=rows.filter(function(r){var d=new Date(r.Timestamp||r.CreatedAt);return !isFinite(d.getTime())||d.getTime()>=cutoff;});
  if(kept.length===rows.length)return 0;kpiReplaceObjects_(KPI_CONST.SHEETS.EVENTS,KPI_HEADERS.PC_KPIEvents,kept);return rows.length-kept.length;
}
