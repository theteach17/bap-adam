/** Read-only diagnostics for Satellite runtime. */
function runKpiHealthCheckCore_(){
  var result={ok:true,moduleVersion:KPI_CONST.VERSION,runner:'',checkedAt:kpiNowIso_(),checks:[],failedCount:0,warnings:[]};
  function check(name,fn){try{var detail=fn();result.checks.push({name:name,ok:true,detail:detail});}catch(e){result.ok=false;result.failedCount++;result.checks.push({name:name,ok:false,error:String(e&&e.message||e)});}}
  check('runner',function(){result.runner=kpiAssertSatelliteRunner_();return result.runner;});
  check('database',function(){return{id:kpiDb_().getId(),name:kpiDb_().getName()};});
  check('timezone',function(){var scriptTz=Session.getScriptTimeZone(),sheetTz=kpiDb_().getSpreadsheetTimeZone();if(scriptTz!==KPI_CONST.TIMEZONE||sheetTz!==KPI_CONST.TIMEZONE)throw new Error('timezone mismatch script='+scriptTz+' sheet='+sheetTz+' expected='+KPI_CONST.TIMEZONE);return{script:scriptTz,spreadsheet:sheetTz};});
  Object.keys(KPI_HEADERS).forEach(function(name){check('schema:'+name,function(){var sheet=kpiSheet_(name),headers=KPI_HEADERS[name],actual=sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];headers.forEach(function(h,i){if(actual[i]!==h)throw new Error('column '+(i+1)+' expected '+h+' got '+actual[i]);});return{rows:Math.max(0,sheet.getLastRow()-1),columns:headers.length};});});
  check('source:PC_Reviews',function(){return{rows:kpiReadSource_('PC_Reviews').length};});
  check('source:PC_Access',function(){var model=kpiLoadModel_({includeAudit:false}),active=kpiActiveOfficers_(model),admins=active.filter(function(x){return x.role===PC_CONST.ROLES.ADMIN;}).length;if(!admins)throw new Error('no Active PRECHECK_ADMIN in PC_Access');return{activeOfficers:active.length,activeAdmins:admins};});
  check('config',function(){var c=kpiGetConfig_();if(!/^\d{2}:\d{2}$/.test(c.workdayStart)||!/^\d{2}:\d{2}$/.test(c.workdayEnd))throw new Error('invalid working hours');return kpiPublicConfig_(c);});
  check('handoff-secret',function(){var s=kpiHandoffSecret_();if(s.length<32)throw new Error('handoff secret too short');return{configured:true,length:s.length};});
  check('triggers',function(){var h={},missing=[];ScriptApp.getProjectTriggers().forEach(function(t){h[t.getHandlerFunction()]=(h[t.getHandlerFunction()]||0)+1;});['kpiReconcileTrigger','kpiQueueSnapshotTrigger','kpiDailyAggregateTrigger'].forEach(function(k){if(!h[k])missing.push(k);if(h[k]>1)throw new Error('duplicate trigger '+k);});if(missing.length)throw new Error('missing trigger(s): '+missing.join(', '));return h;});
  check('data-health',function(){var h=kpiDataHealth_(kpiLoadModel_({includeAudit:false}));if(h.status!=='HEALTHY')throw new Error('data health '+h.status+'; missingEvents='+h.missingCompletedReviewEvents+'; staleJobs='+h.staleJobRuns);return h;});
  return result;
}
function runKpiHealthCheck(){kpiRequireAdminEditor_();return runKpiHealthCheckCore_();}
function runKpiProductionSmokeTest(){kpiRequireAdminEditor_();var cfg=kpiGetConfig_(),model=kpiLoadModel_({includeAudit:false}),today=kpiDateKey_(new Date()),filter={startDate:kpiAddDateKey_(today,-29),endDate:today,officerEmail:'',adminGroup:'',workGroup:''},metrics=kpiBuildReviewMetrics_(model,filter,cfg),table=kpiOfficerTable_(model,metrics,filter,cfg),queue=kpiQueueHealth_(model,cfg);return{ok:true,reviewMetrics:metrics.length,officers:table.length,queue:queue,businessTimeSelfTest:kpiBusinessMinutes_('2026-09-14T08:00:00+07:00','2026-09-14T09:30:00+07:00',cfg,{})};}
