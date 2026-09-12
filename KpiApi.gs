/** Admin-only web API for KPI Dashboard. Authorization is enforced server-side. */

/** Main dashboard payload. */
function getAdminKpiDashboard(filter) {
  requirePrecheckAdmin_('getAdminKpiDashboard');var principal=getCurrentPrincipal_(),f=kpiNormalizeFilter_(filter),cfg=kpiGetConfig_();
  try{pcAudit_('KPI_DASHBOARD_VIEW',{},principal,{startDate:f.startDate,endDate:f.endDate,officerEmail:f.officerEmail,adminGroup:f.adminGroup,workGroup:f.workGroup});}catch(ignored){}
  var cache=CacheService.getScriptCache(),key=KPI_CONST.CACHE_PREFIX+'DASH:'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify({filter:f,config:kpiPublicConfig_(cfg),cacheEpoch:kpiCacheEpoch_()}))).substring(0,24),cached=cache.get(key);if(cached){try{return JSON.parse(cached);}catch(ignored){}}
  var model=kpiLoadModel_({includeAudit:true}),metrics=kpiBuildReviewMetrics_(model,f,cfg),officers=kpiOfficerTable_(model,metrics,f,cfg),overview=kpiOverview_(metrics,officers,cfg);
  var prevFilter=kpiPreviousFilter_(f),prevMetrics=kpiBuildReviewMetrics_(model,prevFilter,cfg),prevOfficers=kpiOfficerTable_(model,prevMetrics,prevFilter,cfg),prevOverview=kpiOverview_(prevMetrics,prevOfficers,cfg);
  var payload={ok:true,moduleVersion:KPI_CONST.VERSION,generatedAt:kpiNowIso_(),filter:f,previousFilter:prevFilter,config:kpiPublicConfig_(cfg),overview:overview,comparison:kpiComparison_(overview,prevOverview),queue:kpiQueueHealth_(model,cfg),officers:officers,trend:kpiTrend_(metrics,f),assignment:kpiAssignmentSummary_(model,cfg),filterOptions:kpiFilterOptions_(model),holidays:kpiGetHolidaysForUi_(),dataHealth:kpiDataHealth_(model),jobRuns:kpiLatestJobRuns_(8),runtime:{runner:KPI_SATELLITE.REQUIRED_RUNNER_EMAIL,moduleVersion:KPI_CONST.VERSION,execution:'SATELLITE'}};
  try{cache.put(key,JSON.stringify(payload),cfg.cacheSeconds);}catch(ignored){}
  return payload;
}

/** Drill-down to evidence for one officer. */
function getAdminKpiOfficerDetail(officerEmail, filter) {
  requirePrecheckAdmin_('getAdminKpiOfficerDetail');var principal=getCurrentPrincipal_(),f=kpiNormalizeFilter_(filter);f.officerEmail=kpiEmail_(officerEmail);if(!f.officerEmail)throw pcUserError_('กรุณาระบุเจ้าหน้าที่','KPI_OFFICER_REQUIRED');var cfg=kpiGetConfig_(),model=kpiLoadModel_({includeAudit:true}),metrics=kpiBuildReviewMetrics_(model,f,cfg),table=kpiOfficerTable_(model,metrics,f,cfg),summary=table.filter(function(x){return x.officerEmail===f.officerEmail;})[0]||null;
  var history=metrics.slice().sort(function(a,b){return new Date(b.completedAt)-new Date(a.completedAt);}).slice(0,100).map(function(m){return{reviewId:m.reviewId,submissionId:m.submissionId,versionId:m.versionId,versionNo:m.versionNo,documentNumber:m.documentNumber,documentName:m.documentName,decision:m.decision,startedAt:m.startedAt,completedAt:m.completedAt,responseMinutes:m.responseMinutes,responseElapsedMinutes:m.responseElapsedMinutes,turnaroundMinutes:m.turnaroundMinutes,turnaroundElapsedMinutes:m.turnaroundElapsedMinutes,reviewElapsedMinutes:m.reviewElapsedMinutes,activeMinutes:m.activeMinutes,checklistCompletionRate:m.checklistCompletion*100};});
  try{pcAudit_('KPI_OFFICER_DETAIL_VIEW',{},principal,{officerEmail:f.officerEmail,startDate:f.startDate,endDate:f.endDate});}catch(ignored){}
  return{ok:true,generatedAt:kpiNowIso_(),filter:f,summary:summary,trend:kpiTrend_(metrics,f),history:history};
}

/** Admin reads editable KPI configuration. */
function getAdminKpiConfig() {requirePrecheckAdmin_('getAdminKpiConfig');var cfg=kpiGetConfig_();return{ok:true,config:kpiPublicConfig_(cfg)};}

/** Admin saves whitelisted KPI config values. */
function saveAdminKpiConfig(updates) {
  requirePrecheckAdmin_('saveAdminKpiConfig');var principal=getCurrentPrincipal_(),allowed={};KPI_DEFAULT_CONFIG.forEach(function(row){allowed[row[0]]=true;});updates=updates||{};
  Object.keys(updates).forEach(function(k){if(!allowed[k])throw pcUserError_('ไม่รองรับการตั้งค่า '+k,'KPI_CONFIG_KEY');});
  kpiValidateConfigUpdates_(updates);
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.CONFIG,KPI_HEADERS.PC_KPIConfig),index={};rows.forEach(function(r,i){index[String(r.Key)]=i;});var now=kpiNowIso_();
  Object.keys(updates).forEach(function(key){var value=String(updates[key]);if(index[key]!=null){rows[index[key]].Value=value;rows[index[key]].UpdatedAt=now;rows[index[key]].UpdatedBy=kpiEmail_(principal.email);}else{rows.push({Key:key,Value:value,Description:'',UpdatedAt:now,UpdatedBy:kpiEmail_(principal.email)});}});
  kpiReplaceObjects_(KPI_CONST.SHEETS.CONFIG,KPI_HEADERS.PC_KPIConfig,rows);kpiInvalidateCaches_();
  var triggerResult=null;if(Object.prototype.hasOwnProperty.call(updates,'KPI_QUEUE_SNAPSHOT_MINUTES')){try{triggerResult=kpiInstallTriggers_();}catch(triggerError){throw pcUserError_('บันทึกค่าแล้ว แต่ปรับ Trigger ไม่สำเร็จ: '+String(triggerError&&triggerError.message||triggerError),'KPI_TRIGGER_UPDATE_FAILED');}}
  try{pcAudit_('KPI_CONFIG_CHANGE',{},principal,{keys:Object.keys(updates)});}catch(ignored){}
  return{ok:true,config:kpiPublicConfig_(kpiGetConfig_()),triggers:triggerResult};
}

/** Records an audited export action; actual CSV generation stays client-side. */
function recordAdminKpiExport(filter) {requirePrecheckAdmin_('recordAdminKpiExport');var p=getCurrentPrincipal_();try{pcAudit_('KPI_EXPORT',{},p,kpiNormalizeFilter_(filter));}catch(ignored){}return{ok:true};}

/** Safe subset for browser. */
function kpiPublicConfig_(cfg){return{enabled:cfg.enabled,baselineMode:cfg.baselineMode,scoreEnabled:cfg.scoreEnabled,assignmentMode:cfg.assignmentMode,workdayStart:cfg.workdayStart,workdayEnd:cfg.workdayEnd,workingDays:cfg.workingDays.join(','),sessionIdleMinutes:cfg.sessionIdleMinutes,responseSlaMinutes:cfg.responseSlaMinutes,turnaroundSlaMinutes:cfg.turnaroundSlaMinutes,minSampleSize:cfg.minSampleSize,cacheSeconds:cfg.cacheSeconds,snapshotMinutes:cfg.snapshotMinutes,weights:cfg.weights};}

/** Validates admin configuration before write. */
function kpiValidateConfigUpdates_(u){
  if(u.KPI_ASSIGNMENT_MODE&&String(u.KPI_ASSIGNMENT_MODE)!=='OFF')throw pcUserError_('KPI Satellite รุ่นนี้ล็อก Assignment Mode = OFF เพื่อไม่เปลี่ยน workflow หลัก','KPI_ASSIGNMENT_LOCKED');
  function validTime_(v){var m=/^(\d{2}):(\d{2})$/.exec(String(v||''));return !!m&&Number(m[1])<=23&&Number(m[2])<=59;}
  ['KPI_WORKDAY_START','KPI_WORKDAY_END'].forEach(function(k){if(u[k]!=null&&!validTime_(u[k]))throw pcUserError_(k+' ต้องเป็น HH:mm ที่ถูกต้อง','KPI_CONFIG_VALUE');});
  if(u.KPI_WORKING_DAYS!=null){var parts=String(u.KPI_WORKING_DAYS).split(',').map(function(x){return Number(String(x).trim());}),seen={};if(!parts.length||parts.some(function(n){if(!Number.isInteger(n)||n<1||n>7||seen[n])return true;seen[n]=true;return false;}))throw pcUserError_('KPI_WORKING_DAYS ต้องเป็นเลข 1-7 ไม่ซ้ำ คั่นด้วย comma เช่น 1,2,3,4,5','KPI_CONFIG_VALUE');}
  var numeric=['KPI_SESSION_IDLE_MINUTES','KPI_RESPONSE_SLA_MINUTES','KPI_TURNAROUND_SLA_MINUTES','KPI_MIN_SAMPLE_SIZE','KPI_CACHE_SECONDS','KPI_QUEUE_SNAPSHOT_MINUTES','KPI_WEIGHT_RESPONSIVENESS','KPI_WEIGHT_WORKLOAD','KPI_WEIGHT_PROCESSING','KPI_WEIGHT_QUALITY','KPI_WEIGHT_ENGAGEMENT'];numeric.forEach(function(k){if(u[k]!=null&&(!isFinite(Number(u[k]))||Number(u[k])<0))throw pcUserError_(k+' ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป','KPI_CONFIG_VALUE');});
  if(u.KPI_QUEUE_SNAPSHOT_MINUTES!=null&&[1,5,10,15,30].indexOf(Number(u.KPI_QUEUE_SNAPSHOT_MINUTES))<0)throw pcUserError_('รอบ Snapshot รองรับ 1,5,10,15,30 นาที','KPI_CONFIG_VALUE');
  var current=kpiGetConfig_(),start=String(u.KPI_WORKDAY_START!=null?u.KPI_WORKDAY_START:current.workdayStart),end=String(u.KPI_WORKDAY_END!=null?u.KPI_WORKDAY_END:current.workdayEnd);if(validTime_(start)&&validTime_(end)&&start>=end)throw pcUserError_('Workday End ต้องอยู่หลัง Workday Start','KPI_CONFIG_VALUE');
  var w={responsiveness:current.weights.responsiveness,workload:current.weights.workload,processing:current.weights.processing,quality:current.weights.quality,engagement:current.weights.engagement},map={KPI_WEIGHT_RESPONSIVENESS:'responsiveness',KPI_WEIGHT_WORKLOAD:'workload',KPI_WEIGHT_PROCESSING:'processing',KPI_WEIGHT_QUALITY:'quality',KPI_WEIGHT_ENGAGEMENT:'engagement'};Object.keys(map).forEach(function(k){if(u[k]!=null)w[map[k]]=Number(u[k]);});var total=w.responsiveness+w.workload+w.processing+w.quality+w.engagement;if(Math.abs(total-100)>0.0001)throw pcUserError_('น้ำหนัก KPI ทั้ง 5 มิติต้องรวมเท่ากับ 100 (ปัจจุบัน '+total+')','KPI_CONFIG_WEIGHT_TOTAL');
}

/** Current assignment-layer status for Admin. */
function kpiAssignmentSummary_(model,cfg){var rows=model.assignments||[],subById=model.submissionById||{};function c(status){return rows.filter(function(r){return String(r.Status)===status;}).length;}var active=rows.filter(function(r){return['AVAILABLE','ASSIGNED','CLAIMED','IN_PROGRESS'].indexOf(String(r.Status))>=0;}).slice(-50).reverse().map(function(r){var s=subById[String(r.SubmissionId||'')]||{};return{assignmentId:String(r.AssignmentId||''),submissionId:String(r.SubmissionId||''),versionId:String(r.VersionId||''),documentNumber:String(s.DocumentNumber||''),documentName:String(s.DocumentNameSnapshot||''),officerEmail:kpiEmail_(r.OfficerEmail),officerName:String(r.OfficerName||''),status:String(r.Status||''),assignedAt:String(r.AssignedAt||''),claimedAt:String(r.ClaimedAt||'')};});return{mode:cfg.assignmentMode,total:rows.length,available:c('AVAILABLE'),assigned:c('ASSIGNED'),claimed:c('CLAIMED'),inProgress:c('IN_PROGRESS'),completed:c('COMPLETED')+c('COMPLETED_OTHER'),active:active};}

/** Previous equal-length calendar period immediately before selected filter. */
function kpiPreviousFilter_(f){var start=new Date(f.startDate+'T12:00:00+07:00'),end=new Date(f.endDate+'T12:00:00+07:00'),days=Math.round((end-start)/86400000)+1;return{startDate:kpiAddDateKey_(f.startDate,-days),endDate:kpiAddDateKey_(f.startDate,-1),officerEmail:f.officerEmail||'',adminGroup:f.adminGroup||'',workGroup:f.workGroup||''};}

/** Comparison values are descriptive only; positive/negative meaning is interpreted by the UI label. */
function kpiComparison_(cur,prev){function pctChange(a,b){a=Number(a)||0;b=Number(b)||0;if(!b)return a?100:0;return(a-b)/b*100;}return{completedReviewsPct:pctChange(cur.completedReviews,prev.completedReviews),medianResponseDeltaMinutes:(Number(cur.medianResponseMinutes)||0)-(Number(prev.medianResponseMinutes)||0),medianTurnaroundDeltaMinutes:(Number(cur.medianTurnaroundMinutes)||0)-(Number(prev.medianTurnaroundMinutes)||0),turnaroundSlaDeltaPoints:(Number(cur.turnaroundSlaRate)||0)-(Number(prev.turnaroundSlaRate)||0),previous:prev};}

/** Filter lists come from authoritative snapshots/access and contain no private user-owner data. */
function kpiFilterOptions_(model){var admins={},works={};model.submissions.forEach(function(s){var a=String(s.AdminGroupSnapshot||'').trim(),w=String(s.WorkGroupSnapshot||'').trim();if(a)admins[a]=true;if(w)works[w]=true;});return{adminGroups:Object.keys(admins).sort(),workGroups:Object.keys(works).sort(),officers:kpiActiveOfficers_(model)};}

/** Data health makes trustworthiness explicit. */
function kpiDataHealth_(model){var eventKeys=kpiReadColumn_(KPI_CONST.SHEETS.EVENTS,2),eventSet={};eventKeys.forEach(function(k){eventSet[String(k||'')]=true;});var completed=model.reviews.filter(function(r){return String(r.ReviewStatus)===PC_CONST.REVIEW_STATUS.COMPLETED&&r.CompletedAt;});var missing=completed.filter(function(r){return!eventSet['REVIEW_COMPLETED:'+r.ReviewId];}).length;var dailySheet=kpiSheet_(KPI_CONST.SHEETS.DAILY),snapSheet=kpiSheet_(KPI_CONST.SHEETS.QUEUE_SNAPSHOTS),jobs=kpiLatestJobRuns_(50),staleJobs=jobs.filter(function(j){return j.stale;}).length;return{status:(missing||staleJobs)?'ATTENTION':'HEALTHY',missingCompletedReviewEvents:missing,staleJobRuns:staleJobs,eventRows:eventKeys.length,dailyRows:Math.max(0,dailySheet.getLastRow()-1),queueSnapshotRows:Math.max(0,snapSheet.getLastRow()-1),lastQueueSnapshot:String(kpiLastColumnValue_(KPI_CONST.SHEETS.QUEUE_SNAPSHOTS,2)||''),lastDailyAggregate:String(kpiLastColumnValue_(KPI_CONST.SHEETS.DAILY,28)||'')};}

/** Admin adds or updates one working-day/holiday override. */
function saveAdminKpiHoliday(entry) {
  requirePrecheckAdmin_('saveAdminKpiHoliday');
  var principal=getCurrentPrincipal_();entry=entry||{};
  var date=String(entry.date||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||kpiDateKey_(new Date(date+'T12:00:00+07:00'))!==date)throw pcUserError_('วันที่ต้องเป็น YYYY-MM-DD ที่ถูกต้อง','KPI_HOLIDAY_DATE');
  var isWorking=/^(true|1|yes|y)$/i.test(String(entry.isWorkingDay));
  var start=String(entry.startTime||'').trim(),end=String(entry.endTime||'').trim();
  if(start&&!/^\d{2}:\d{2}$/.test(start))throw pcUserError_('StartTime ต้องเป็น HH:mm','KPI_HOLIDAY_TIME');
  if(end&&!/^\d{2}:\d{2}$/.test(end))throw pcUserError_('EndTime ต้องเป็น HH:mm','KPI_HOLIDAY_TIME');
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.HOLIDAYS,KPI_HEADERS.PC_KPIHolidays),found=-1;for(var i=0;i<rows.length;i++)if(kpiDateKey_(rows[i].Date)===date){found=i;break;}
  var obj={Date:date,IsWorkingDay:isWorking?'TRUE':'FALSE',StartTime:isWorking?start:'',EndTime:isWorking?end:'',Description:String(entry.description||'').trim(),UpdatedAt:kpiNowIso_(),UpdatedBy:kpiEmail_(principal.email)};
  if(found>=0)rows[found]=obj;else rows.push(obj);rows.sort(function(a,b){return kpiDateKey_(a.Date).localeCompare(kpiDateKey_(b.Date));});
  kpiReplaceObjects_(KPI_CONST.SHEETS.HOLIDAYS,KPI_HEADERS.PC_KPIHolidays,rows);kpiInvalidateCaches_();
  try{pcAudit_('KPI_HOLIDAY_CHANGE',{},principal,{date:date,isWorkingDay:isWorking});}catch(ignored){}
  return{ok:true,holidays:kpiGetHolidaysForUi_()};
}

/** Admin deletes one holiday override. */
function deleteAdminKpiHoliday(date) {
  requirePrecheckAdmin_('deleteAdminKpiHoliday');var principal=getCurrentPrincipal_();date=String(date||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw pcUserError_('วันที่ไม่ถูกต้อง','KPI_HOLIDAY_DATE');
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.HOLIDAYS,KPI_HEADERS.PC_KPIHolidays),kept=rows.filter(function(r){return kpiDateKey_(r.Date)!==date;});
  kpiReplaceObjects_(KPI_CONST.SHEETS.HOLIDAYS,KPI_HEADERS.PC_KPIHolidays,kept);kpiInvalidateCaches_();
  try{pcAudit_('KPI_HOLIDAY_DELETE',{},principal,{date:date});}catch(ignored){}
  return{ok:true,holidays:kpiGetHolidaysForUi_()};
}

/** Browser-safe holiday override list. */
function kpiGetHolidaysForUi_(){return kpiReadObjects_(KPI_CONST.SHEETS.HOLIDAYS,KPI_HEADERS.PC_KPIHolidays).map(function(r){return{date:kpiDateKey_(r.Date),isWorkingDay:r.IsWorkingDay===true||/^(true|1|yes|y)$/i.test(String(r.IsWorkingDay)),startTime:String(r.StartTime||''),endTime:String(r.EndTime||''),description:String(r.Description||'')};}).filter(function(r){return!!r.date;}).sort(function(a,b){return a.date.localeCompare(b.date);});}
