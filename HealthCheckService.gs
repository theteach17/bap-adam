/** Private/read-only health check covering config, schema, folders, template, access, triggers and backup. */
function runPrecheckHealthCheck_(){
  var checks=[],cfg=getPrecheckConfig_();function add(name,ok,detail){checks.push({name:name,ok:!!ok,detail:String(detail||'')});}
  try{var main=getSpreadsheet_();add('Production spreadsheet',!!main,main.getName());}catch(e){add('Production spreadsheet',false,e.message);}
  try{var db=cfg.dbId?SpreadsheetApp.openById(cfg.dbId):null;add('Workflow DB',!!db,db?db.getName():'PC_DB_ID missing');if(db)Object.keys(PC_HEADERS).forEach(function(n){try{pcSheet_(n);add('Schema '+n,true,'OK');}catch(e){add('Schema '+n,false,e.message);}});}catch(e){add('Workflow DB',false,e.message);}
  [['Staging',cfg.stagingFolderId],['Archive',cfg.archiveFolderId],['Orphan',cfg.orphanFolderId],['Backup',cfg.backupFolderId]].forEach(function(x){try{add(x[0]+' folder',!!x[1]&&!!DriveApp.getFolderById(x[1]),x[1]?'accessible':'missing');}catch(e){add(x[0]+' folder',false,e.message);}});
  add('PC_MAX_FILE_MB',cfg.maxFileMb>0,cfg.maxFileMb?cfg.maxFileMb+' MB':'missing');add('Officer group',!!cfg.officerGroupEmail,cfg.officerGroupEmail?'configured':'missing');
  try{var template=cfg.defaultTemplateId?pcFindObject_(PC_CONST.SHEETS.TEMPLATES,'TemplateId',cfg.defaultTemplateId,false):null;add('Default template',!!template&&String(template.Status)===PC_CONST.TEMPLATE_STATUS.PUBLISHED,template?template.TemplateName:'missing');if(template)pcValidatePublishedTemplate_(template.TemplateId);}catch(e){add('Default template',false,e.message);}
  try{var prodTemplate=cfg.defaultTemplateId?pcFindObject_(PC_CONST.SHEETS.TEMPLATES,'TemplateId',cfg.defaultTemplateId,false):null;var prodOk=!!prodTemplate&&typeof pcIsProductionChecklistTemplate_==='function'&&pcIsProductionChecklistTemplate_(prodTemplate.TemplateId);add('Production checklist',prodOk,prodOk?'11 items ready':'default template is not the production 11-item checklist');}catch(e){add('Production checklist',false,e.message);}
  try{var access=pcListObjects_(PC_CONST.SHEETS.ACCESS).filter(function(a){return pcBool_(a.Active,false)&&[PC_CONST.ROLES.OFFICER,PC_CONST.ROLES.ADMIN].indexOf(String(a.Role))!==-1;});add('Active officer access',access.length>0,String(access.length));}catch(e){add('Active officer access',false,e.message);}
  var handlers=ScriptApp.getProjectTriggers().map(function(t){return t.getHandlerFunction();});add('Reconcile trigger',handlers.indexOf('precheckReconcileTrigger_')!==-1,handlers.join(','));add('Backup trigger',handlers.indexOf('createPrecheckDailyBackup_')!==-1,handlers.join(','));
  add('Recent workflow backup',!!pcConfig_('PC_LAST_BACKUP_AT',''),pcConfig_('PC_LAST_BACKUP_AT','not yet run'));
  try{var rs=getSpreadsheet_().getSheetByName(reportSubmitSheetName);pcRequireReportSubmitProvenanceSchema_(rs);add('ReportSubmit provenance schema',true,'AA:AF ready');}catch(e){add('ReportSubmit provenance schema',false,e.message);}
  var failed=checks.filter(function(c){return!c.ok;});return{success:failed.length===0,checkedAt:pcNowIso_(),checks:checks,failedCount:failed.length,featureFlags:{enabled:cfg.enabled,autoCommitEnabled:cfg.autoCommitEnabled,enforceReportActivity:cfg.enforceReportActivity,enforceFromYear:cfg.enforceFromYear}};
}

/** Private editor function: installs only this module's idempotent triggers. */
function installPrecheckTriggers_(){
  removePrecheckTriggers_();
  ScriptApp.newTrigger('precheckReconcileTrigger_').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('createPrecheckDailyBackup_').timeBased().everyDays(1).atHour(2).create();
  return ScriptApp.getProjectTriggers().filter(function(t){return['precheckReconcileTrigger_','createPrecheckDailyBackup_'].indexOf(t.getHandlerFunction())!==-1;}).map(function(t){return t.getHandlerFunction();});
}

/** Private editor function: removes only triggers owned by this module. */
function removePrecheckTriggers_(){var names=['precheckReconcileTrigger_','createPrecheckDailyBackup_'];ScriptApp.getProjectTriggers().forEach(function(t){if(names.indexOf(t.getHandlerFunction())!==-1)ScriptApp.deleteTrigger(t);});return true;}
