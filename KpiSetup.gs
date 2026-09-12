/** One-time setup and trigger management for standalone KPI Satellite. */
function setupKpiSatellite(){
  console.log('[KPI SETUP] START v'+KPI_CONST.VERSION);
  var runner=kpiRequireAdminEditor_();
  Object.keys(KPI_HEADERS).forEach(function(name){kpiEnsureSheet_(name,KPI_HEADERS[name]);});
  var props=PropertiesService.getScriptProperties(),secret=props.getProperty(KPI_SATELLITE.PROP_HANDOFF_SECRET),createdSecret=false;
  if(!secret){secret=kpiNewSecret_();props.setProperty(KPI_SATELLITE.PROP_HANDOFF_SECRET,secret);createdSecret=true;}
  kpiSeedConfigDefaults_(runner.email);
  var clockStorage=kpiRepairClockStorage_(runner.email);
  console.log('[KPI SETUP] CLOCK_STORAGE normalized='+clockStorage.normalized+' formatted='+clockStorage.formatted);
  var removedTriggers=kpiRemoveOwnedTriggers_();
  var reconcile=kpiRunTrackedJob_('RECONCILE','SETUP',runKpiReconcileCore_);
  var aggregate=kpiRunTrackedJob_('DAILY_AGGREGATE','SETUP',rebuildKpiDailyAggregatesCore_);
  var snapshot=kpiRunTrackedJob_('QUEUE_SNAPSHOT','SETUP',takeKpiQueueSnapshotCore_);
  var triggers=kpiInstallTriggers_();
  var health=runKpiHealthCheckCore_();
  kpiLogHealthResult_(health,'SETUP');
  console.log('[KPI SETUP] COMPLETE health='+health.ok+' failed='+health.failedCount+(health.failedChecks&&health.failedChecks.length?' failedChecks='+health.failedChecks.map(function(x){return x.name;}).join(', '):''));
  return {ok:health.ok,moduleVersion:KPI_CONST.VERSION,runner:runner.email,dbId:kpiSatelliteDbId_(),handoffSecret:createdSecret?secret:'(existing secret preserved — run getKpiSatelliteIntegrationInfo() if needed)',clockStorage:clockStorage,removedOldTriggers:removedTriggers,triggers:triggers,reconcile:reconcile,aggregate:aggregate,snapshot:snapshot,health:health,nextStep:'Deploy as Web app Execute as Me, then copy deployment URL + handoff secret into Project Adam Script Properties.'};
}

function kpiSeedConfigDefaults_(email){
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.CONFIG,KPI_HEADERS.PC_KPIConfig),existing={},changed=false,now=kpiNowIso_(),normalizedEmail=kpiEmail_(email),add=[];
  rows.forEach(function(r){var key=String(r.Key||'');existing[key]=true;if(!r.UpdatedAt){r.UpdatedAt=now;changed=true;}if(!r.UpdatedBy){r.UpdatedBy=normalizedEmail;changed=true;}});
  KPI_DEFAULT_CONFIG.forEach(function(def){if(!existing[def[0]])add.push({Key:def[0],Value:def[1],Description:def[2],UpdatedAt:now,UpdatedBy:normalizedEmail});});
  if(changed)kpiReplaceObjects_(KPI_CONST.SHEETS.CONFIG,KPI_HEADERS.PC_KPIConfig,rows);if(add.length)kpiAppendObjects_(KPI_CONST.SHEETS.CONFIG,KPI_HEADERS.PC_KPIConfig,add);kpiInvalidateCaches_();return{added:add.length,backfilled:changed};
}


/** Keeps clock configuration stable even when Google Sheets auto-converts HH:mm to TIME values. */
function kpiRepairClockStorage_(email){
  var normalized=0,formatted=0,configSheet=kpiSheet_(KPI_CONST.SHEETS.CONFIG),last=configSheet.getLastRow();
  if(last>=2){
    var keys=configSheet.getRange(2,1,last-1,1).getDisplayValues();
    for(var i=0;i<keys.length;i++){
      var key=String(keys[i][0]||''), row=i+2;
      if(key===KPI_CONST.CONFIG.WORKDAY_START || key===KPI_CONST.CONFIG.WORKDAY_END){
        var cell=configSheet.getRange(row,2), canonical=kpiNormalizeClockValue_(cell.getValue(), key===KPI_CONST.CONFIG.WORKDAY_START?'08:00':'16:30');
        cell.setNumberFormat('@'); formatted++;
        if(String(cell.getDisplayValue())!==canonical || typeof cell.getValue()!=='string'){cell.setValue(canonical);normalized++;}
      }
    }
  }
  var holidaySheet=kpiSheet_(KPI_CONST.SHEETS.HOLIDAYS),maxRows=Math.max(holidaySheet.getMaxRows(),2);
  holidaySheet.getRange(2,3,maxRows-1,2).setNumberFormat('@');formatted+=2;
  var holidayLast=holidaySheet.getLastRow();
  if(holidayLast>=2){
    var range=holidaySheet.getRange(2,3,holidayLast-1,2),vals=range.getValues(),changed=false;
    vals.forEach(function(row){for(var j=0;j<2;j++){if(row[j]!==''&&row[j]!=null){var c=kpiNormalizeClockValue_(row[j],'');if(String(row[j])!==c || typeof row[j]!=='string'){row[j]=c;normalized++;changed=true;}}}});
    if(changed)range.setValues(vals);
  }
  kpiInvalidateCaches_();
  return{ok:true,normalized:normalized,formatted:formatted,updatedBy:kpiEmail_(email||'')};
}

/** Admin-safe repair entry point for installations created before v1.1.2. */
function repairKpiClockStorage(){
  var runner=kpiRequireAdminEditor_();
  console.log('[KPI CLOCK REPAIR] START v'+KPI_CONST.VERSION);
  var result=kpiRepairClockStorage_(runner.email);
  var health=runKpiHealthCheckCore_();
  kpiLogHealthResult_(health,'CLOCK_REPAIR');
  console.log('[KPI CLOCK REPAIR] COMPLETE normalized='+result.normalized+' health='+health.ok);
  return{ok:health.ok,repair:result,health:health};
}

function kpiRemoveOwnedTriggers_(){
  var handlers=['kpiReconcileTrigger','kpiQueueSnapshotTrigger','kpiDailyAggregateTrigger'],removed=0;
  ScriptApp.getProjectTriggers().forEach(function(t){if(handlers.indexOf(t.getHandlerFunction())>=0){ScriptApp.deleteTrigger(t);removed++;}});
  return removed;
}
function kpiInstallTriggers_(){
  var handlers=['kpiReconcileTrigger','kpiQueueSnapshotTrigger','kpiDailyAggregateTrigger'],old=ScriptApp.getProjectTriggers().filter(function(t){return handlers.indexOf(t.getHandlerFunction())>=0;}),created=[];
  var cfg=kpiGetConfig_(),snapshot=[1,5,10,15,30].indexOf(Number(cfg.snapshotMinutes))>=0?Number(cfg.snapshotMinutes):30;
  try {
    created.push(ScriptApp.newTrigger('kpiReconcileTrigger').timeBased().everyMinutes(15).create());
    created.push(ScriptApp.newTrigger('kpiQueueSnapshotTrigger').timeBased().everyMinutes(snapshot).create());
    created.push(ScriptApp.newTrigger('kpiDailyAggregateTrigger').timeBased().atHour(2).nearMinute(10).everyDays(1).create());
  } catch(e) {
    created.forEach(function(t){try{ScriptApp.deleteTrigger(t);}catch(ignored){}});
    throw e;
  }
  old.forEach(function(t){ScriptApp.deleteTrigger(t);});
  return{ok:true,reconcileMinutes:15,snapshotMinutes:snapshot,daily:'02:10 approx',owner:KPI_SATELLITE.REQUIRED_RUNNER_EMAIL,replaced:old.length};
}
function installKpiTriggers(){kpiRequireAdminEditor_();return kpiInstallTriggers_();}
function disableKpiTriggers(){kpiRequireAdminEditor_();return{ok:true,removed:kpiRemoveOwnedTriggers_()};}
function kpiRequireAdminEditor_(){
  var effective=kpiAssertSatelliteRunner_();
  var active='';
  try{active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();}catch(ignored){active='';}
  if(active!==KPI_SATELLITE.REQUIRED_RUNNER_EMAIL){
    throw new Error('KPI_EDITOR_ONLY: this maintenance function must be run manually in the Apps Script editor by '+KPI_SATELLITE.REQUIRED_RUNNER_EMAIL);
  }
  return{email:effective,activeEmail:active};
}
