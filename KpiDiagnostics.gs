/** Read-only diagnostics for Satellite runtime. */
function runKpiHealthCheckCore_(){
  var result={ok:true,moduleVersion:KPI_CONST.VERSION,runner:'',checkedAt:kpiNowIso_(),checks:[],failedCount:0,failedChecks:[],warnings:[]};
  function check(name,fn){
    try{
      var detail=fn();
      result.checks.push({name:name,ok:true,detail:detail});
    }catch(e){
      var message=String(e&&e.message||e);
      result.ok=false;
      result.failedCount++;
      result.failedChecks.push({name:name,error:message});
      result.checks.push({name:name,ok:false,error:message});
    }
  }
  check('runner',function(){result.runner=kpiAssertSatelliteRunner_();return result.runner;});
  check('database',function(){return{id:kpiDb_().getId(),name:kpiDb_().getName()};});
  check('timezone',function(){var scriptTz=Session.getScriptTimeZone(),sheetTz=kpiDb_().getSpreadsheetTimeZone();if(scriptTz!==KPI_CONST.TIMEZONE||sheetTz!==KPI_CONST.TIMEZONE)throw new Error('timezone mismatch script='+scriptTz+' sheet='+sheetTz+' expected='+KPI_CONST.TIMEZONE);return{script:scriptTz,spreadsheet:sheetTz};});
  Object.keys(KPI_HEADERS).forEach(function(name){check('schema:'+name,function(){var sheet=kpiSheet_(name),headers=KPI_HEADERS[name],actual=sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];headers.forEach(function(h,i){if(actual[i]!==h)throw new Error('column '+(i+1)+' expected '+h+' got '+actual[i]);});return{rows:Math.max(0,sheet.getLastRow()-1),columns:headers.length};});});
  check('source:PC_Reviews',function(){return{rows:kpiReadSource_('PC_Reviews').length};});
  check('source:PC_Access',function(){var model=kpiLoadModel_({includeAudit:false}),active=kpiActiveOfficers_(model),admins=active.filter(function(x){return x.role===PC_CONST.ROLES.ADMIN;}).length;if(!admins)throw new Error('no Active PRECHECK_ADMIN in PC_Access');return{activeOfficers:active.length,activeAdmins:admins};});
  check('config',function(){var c=kpiGetConfig_(),start=kpiClockMinutes_(c.workdayStart,-1),end=kpiClockMinutes_(c.workdayEnd,-1);if(start<0||end<0||start>=end)throw new Error('invalid working hours start='+String(c.workdayStart)+' end='+String(c.workdayEnd));return kpiPublicConfig_(c);});
  check('handoff-secret',function(){var s=kpiHandoffSecret_();if(s.length<32)throw new Error('handoff secret too short');return{configured:true,length:s.length};});
  check('transport-security',function(){
    var directApiBlocked=false,forgedTriggerBlocked=false,oldCtx=KPI_REQUEST_CONTEXT_;
    try{KPI_REQUEST_CONTEXT_=null;getAdminKpiConfig();}catch(e){directApiBlocked=String(e&&e.message||e).indexOf('KPI_SESSION_REQUIRED')>=0;}
    finally{KPI_REQUEST_CONTEXT_=oldCtx;}
    try{kpiRequireOwnedTimeTriggerEvent_({triggerUid:'FORGED'},'kpiReconcileTrigger');}catch(e2){forgedTriggerBlocked=true;}
    if(!directApiBlocked||!forgedTriggerBlocked)throw new Error('public surface guard self-test failed');
    return{mode:KPI_SATELLITE.TRANSPORT_MODE,directApiBlocked:directApiBlocked,forgedTriggerBlocked:forgedTriggerBlocked,bootstrapRateLimit:KPI_SATELLITE.BOOTSTRAP_RATE_LIMIT};
  });
  check('triggers',function(){var h={},missing=[];ScriptApp.getProjectTriggers().forEach(function(t){h[t.getHandlerFunction()]=(h[t.getHandlerFunction()]||0)+1;});['kpiReconcileTrigger','kpiQueueSnapshotTrigger','kpiDailyAggregateTrigger'].forEach(function(k){if(!h[k])missing.push(k);if(h[k]>1)throw new Error('duplicate trigger '+k);});if(missing.length)throw new Error('missing trigger(s): '+missing.join(', '));return h;});
  check('data-health',function(){var h=kpiDataHealth_(kpiLoadModel_({includeAudit:false}));if(h.status!=='HEALTHY')throw new Error('data health '+h.status+'; missingEvents='+h.missingCompletedReviewEvents+'; staleJobs='+h.staleJobRuns);return h;});
  return result;
}

/** Human-readable execution log. Never logs secrets or session tokens. */
function kpiLogHealthResult_(result,label){
  result=result||{};
  var prefix='[KPI HEALTH'+(label?' '+String(label):'')+']';
  console.log(prefix+' START version='+(result.moduleVersion||KPI_CONST.VERSION)+' checkedAt='+(result.checkedAt||kpiNowIso_()));
  (result.checks||[]).forEach(function(c){
    if(c.ok){
      var detail='';
      try{detail=JSON.stringify(c.detail==null?{}:c.detail);}catch(ignored){detail=String(c.detail||'');}
      if(detail.length>500)detail=detail.slice(0,500)+'…';
      console.log(prefix+' PASS '+c.name+(detail?' — '+detail:''));
    }else{
      console.error(prefix+' FAIL '+c.name+' — '+String(c.error||'unknown error'));
    }
  });
  (result.warnings||[]).forEach(function(w){console.warn(prefix+' WARN '+String(w));});
  if(result.ok){console.log(prefix+' COMPLETE ok=true failed=0');}
  else{
    var names=(result.failedChecks||[]).map(function(x){return x.name;}).join(', ');
    console.error(prefix+' COMPLETE ok=false failed='+Number(result.failedCount||0)+(names?' failedChecks='+names:''));
  }
  return result;
}

/** Editor entry point: logs every check and also returns structured data. */
function runKpiHealthCheck(){
  kpiRequireAdminEditor_();
  return kpiLogHealthResult_(runKpiHealthCheckCore_(),'MANUAL');
}

/** Convenience alias for administrators who want an explicitly named verbose check. */
function runKpiHealthCheckVerbose(){
  return runKpiHealthCheck();
}

function runKpiProductionSmokeTest(){
  kpiRequireAdminEditor_();
  console.log('[KPI SMOKE] START v'+KPI_CONST.VERSION);
  var cfg=kpiGetConfig_(),model=kpiLoadModel_({includeAudit:false}),today=kpiDateKey_(new Date()),filter={startDate:kpiAddDateKey_(today,-29),endDate:today,officerEmail:'',adminGroup:'',workGroup:''},metrics=kpiBuildReviewMetrics_(model,filter,cfg),table=kpiOfficerTable_(model,metrics,filter,cfg),queue=kpiQueueHealth_(model,cfg),result={ok:true,moduleVersion:KPI_CONST.VERSION,reviewMetrics:metrics.length,officers:table.length,queue:queue,businessTimeSelfTest:kpiBusinessMinutes_('2026-09-14T08:00:00+07:00','2026-09-14T09:30:00+07:00',cfg,{})};
  console.log('[KPI SMOKE] COMPLETE '+JSON.stringify(result));
  return result;
}
