/** Invalidates dashboard aggregate cache by bumping a version token. */
function pcInvalidateDashboardCache_(){
  PropertiesService.getScriptProperties().setProperty('PC_DASHBOARD_CACHE_VERSION',String(Date.now()));
}

/** Officer/Admin dashboard with server-side filters and 25-row default pagination. */
function getOfficerDashboard(filters,page){
  try{
    requireOfficer_('getOfficerDashboard'); filters=filters||{}; page=pcInt_(page,1,1,100000);
    var cfg=getPrecheckConfig_(),pageSize=cfg.dashboardPageSize||25,version=pcConfig_('PC_DASHBOARD_CACHE_VERSION','0');
    var cacheKey='PC_DASH_'+hashString_(JSON.stringify({filters:filters,page:page,v:version})).substring(0,32),cache=CacheService.getScriptCache(),cached=cache.get(cacheKey);
    if(cached)return pcParseJson_(cached,'dashboard cache');
    var submissions=pcListObjects_(PC_CONST.SHEETS.SUBMISSIONS),reviews=pcListObjects_(PC_CONST.SHEETS.REVIEWS),reviewerBySubmission={};
    reviews.forEach(function(r){ if(r.ReviewerEmail) reviewerBySubmission[String(r.SubmissionId)]=String(r.ReviewerEmail); });
    var all=submissions.slice();
    if(filters.year)submissions=submissions.filter(function(s){return Number(s.DocumentYear)===Number(filters.year);});
    if(filters.status)submissions=submissions.filter(function(s){return String(s.Status)===String(filters.status);});
    if(filters.adminGroup)submissions=submissions.filter(function(s){return String(s.AdminGroupSnapshot)===String(filters.adminGroup);});
    if(filters.workGroup)submissions=submissions.filter(function(s){return String(s.WorkGroupSnapshot)===String(filters.workGroup);});
    if(filters.owner)submissions=submissions.filter(function(s){return String(s.ResponsiblePersonSnapshot).indexOf(String(filters.owner))!==-1||pcKey_(s.OwnerEmail).indexOf(pcKey_(filters.owner))!==-1;});
    if(filters.reviewer)submissions=submissions.filter(function(s){return pcKey_(reviewerBySubmission[String(s.SubmissionId)]).indexOf(pcKey_(filters.reviewer))!==-1;});
    if(filters.dateFrom)submissions=submissions.filter(function(s){return String(s.LastSubmittedAt||s.CreatedAt||'')>=String(filters.dateFrom);});
    if(filters.dateTo)submissions=submissions.filter(function(s){return String(s.LastSubmittedAt||s.CreatedAt||'')<=String(filters.dateTo)+'T23:59:59+07:00';});
    if(pcBool_(filters.revisedOnly,false))submissions=submissions.filter(function(s){return Number(s.CurrentVersion||0)>1;});
    submissions.sort(function(a,b){return String(b.LastSubmittedAt||b.UpdatedAt||'').localeCompare(String(a.LastSubmittedAt||a.UpdatedAt||''));});
    var kpi={waiting:0,inReview:0,revisedWaiting:0,revisionRequired:0,committed:0,reviewedTotal:0,nearSla:0,overSla:0};
    all.forEach(function(s){var st=String(s.Status);if(st===PC_CONST.STATUS.WAITING_REVIEW)kpi.waiting++;if(st===PC_CONST.STATUS.IN_REVIEW)kpi.inReview++;if(st===PC_CONST.STATUS.WAITING_REVIEW_REVISED)kpi.revisedWaiting++;if(st===PC_CONST.STATUS.REVISION_REQUIRED)kpi.revisionRequired++;if(st===PC_CONST.STATUS.APPROVED_COMMITTED)kpi.committed++;if([PC_CONST.STATUS.REVISION_REQUIRED,PC_CONST.STATUS.APPROVED_PENDING_COMMIT,PC_CONST.STATUS.APPROVED_COMMITTING,PC_CONST.STATUS.APPROVED_COMMITTED,PC_CONST.STATUS.APPROVED_COMMIT_FAILED].indexOf(st)!==-1)kpi.reviewedTotal++;});
    if(cfg.slaEnabled) submissions.forEach(function(s){var sla=pcSlaState_(s,cfg);if(sla.state==='NEAR')kpi.nearSla++;if(sla.state==='OVER')kpi.overSla++;});
    var start=(page-1)*pageSize,items=submissions.slice(start,start+pageSize).map(function(s){var sla=pcSlaState_(s,cfg);return{submissionId:s.SubmissionId,caseNo:s.CaseNo,documentNumber:s.DocumentNumber,documentName:s.DocumentNameSnapshot,adminGroup:s.AdminGroupSnapshot,workGroup:s.WorkGroupSnapshot,owner:s.ResponsiblePersonSnapshot,status:s.Status,currentVersion:Number(s.CurrentVersion||0),lastSubmittedAt:s.LastSubmittedAt,reviewer:reviewerBySubmission[String(s.SubmissionId)]||'',revised:Number(s.CurrentVersion||0)>1,slaState:sla.state,slaLabel:sla.label};});
    var result={kpi:kpi,items:items,page:page,pageSize:pageSize,total:submissions.length,totalPages:Math.max(1,Math.ceil(submissions.length/pageSize))};
    cache.put(cacheKey,JSON.stringify(result),PC_CONST.DEFAULTS.DASHBOARD_CACHE_SECONDS);return result;
  }catch(error){throw pcHandlePublicError_(error,'getOfficerDashboard',{});}
}


/** Computes an operational SLA indicator using weekdays; organization holidays can be added later without changing stored workflow state. */
function pcSlaState_(submission,cfg){
  if(!cfg.slaEnabled)return{state:'',label:''};
  var st=String(submission.Status||'');
  if([PC_CONST.STATUS.WAITING_REVIEW,PC_CONST.STATUS.WAITING_REVIEW_REVISED,PC_CONST.STATUS.IN_REVIEW].indexOf(st)===-1)return{state:'',label:''};
  var start=new Date(submission.LastSubmittedAt||submission.CreatedAt||'');if(!isFinite(start.getTime()))return{state:'',label:''};
  var days=pcWorkingDaysBetween_(start,new Date());
  if(days>=cfg.slaWorkingDays)return{state:'OVER',label:'เกิน SLA '+days+' วันทำการ'};
  if(days>=cfg.slaWarningDay)return{state:'NEAR',label:'ใกล้ SLA '+days+' วันทำการ'};
  return{state:'OK',label:days+' วันทำการ'};
}

/** Counts elapsed Monday-Friday days for SLA display without mixing Buddhist years into date logic. */
function pcWorkingDaysBetween_(start,end){
  var a=new Date(start.getFullYear(),start.getMonth(),start.getDate()),b=new Date(end.getFullYear(),end.getMonth(),end.getDate()),count=0;
  while(a<b){a.setDate(a.getDate()+1);var d=a.getDay();if(d!==0&&d!==6)count++;if(count>3660)break;}
  return count;
}
