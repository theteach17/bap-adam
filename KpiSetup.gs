/** One-time setup and trigger management for standalone KPI Satellite. */
function setupKpiSatellite(){
  console.log('[KPI SETUP] START v'+KPI_CONST.VERSION);
  var runner=kpiRequireAdminEditor_();
  Object.keys(KPI_HEADERS).forEach(function(name){kpiEnsureSheet_(name,KPI_HEADERS[name]);});
  var props=PropertiesService.getScriptProperties(),secret=props.getProperty(KPI_SATELLITE.PROP_HANDOFF_SECRET),createdSecret=false;
  if(!secret){secret=kpiNewSecret_();props.setProperty(KPI_SATELLITE.PROP_HANDOFF_SECRET,secret);createdSecret=true;}
  kpiSeedConfigDefaults_(runner.email);
  var removedTriggers=kpiRemoveOwnedTriggers_();
  var reconcile=kpiRunTrackedJob_('RECONCILE','SETUP',runKpiReconcileCore_);
  var aggregate=kpiRunTrackedJob_('DAILY_AGGREGATE','SETUP',rebuildKpiDailyAggregatesCore_);
  var snapshot=kpiRunTrackedJob_('QUEUE_SNAPSHOT','SETUP',takeKpiQueueSnapshotCore_);
  var triggers=kpiInstallTriggers_();
  var health=runKpiHealthCheckCore_();
  console.log('[KPI SETUP] COMPLETE health='+health.ok+' failed='+health.failedCount);
  return {ok:health.ok,moduleVersion:KPI_CONST.VERSION,runner:runner.email,dbId:kpiSatelliteDbId_(),handoffSecret:createdSecret?secret:'(existing secret preserved — run getKpiSatelliteIntegrationInfo() if needed)',removedOldTriggers:removedTriggers,triggers:triggers,reconcile:reconcile,aggregate:aggregate,snapshot:snapshot,health:health,nextStep:'Deploy as Web app Execute as Me, then copy deployment URL + handoff secret into Project Adam Script Properties.'};
}

function kpiSeedConfigDefaults_(email){
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.CONFIG,KPI_HEADERS.PC_KPIConfig),existing={},changed=false,now=kpiNowIso_(),normalizedEmail=kpiEmail_(email),add=[];
  rows.forEach(function(r){var key=String(r.Key||'');existing[key]=true;if(!r.UpdatedAt){r.UpdatedAt=now;changed=true;}if(!r.UpdatedBy){r.UpdatedBy=normalizedEmail;changed=true;}});
  KPI_DEFAULT_CONFIG.forEach(function(def){if(!existing[def[0]])add.push({Key:def[0],Value:def[1],Description:def[2],UpdatedAt:now,UpdatedBy:normalizedEmail});});
  if(changed)kpiReplaceObjects_(KPI_CONST.SHEETS.CONFIG,KPI_HEADERS.PC_KPIConfig,rows);if(add.length)kpiAppendObjects_(KPI_CONST.SHEETS.CONFIG,KPI_HEADERS.PC_KPIConfig,add);kpiInvalidateCaches_();return{added:add.length,backfilled:changed};
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
function kpiRequireAdminEditor_(){var effective=kpiAssertSatelliteRunner_();return{email:effective};}
