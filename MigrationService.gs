/** Private editor function: creates isolated workflow resources without changing production tables. */
function setupPrecheckSystem_(options){
  options=options||{};
  var props=PropertiesService.getScriptProperties();
  if(!props.getProperty('key'))throw new Error('Run initialSetup() first so the existing production spreadsheet is configured.');
  if(options.config)configurePrecheckSystem_(options.config);
  var cfg=getPrecheckConfig_(),created={};
  if(!cfg.dbId){
    var db=SpreadsheetApp.create('Central Information Pre-check DB');
    props.setProperty('PC_DB_ID',db.getId());created.dbId=db.getId();
    pcInitializeWorkflowSheets_(db);
  }else{
    pcInitializeWorkflowSheets_(SpreadsheetApp.openById(cfg.dbId));
  }
  cfg=getPrecheckConfig_();
  var folderDefinitions=[['PC_STAGING_FOLDER_ID','Central Information Pre-check - Staging'],['PC_ARCHIVE_FOLDER_ID','Central Information Pre-check - Archive'],['PC_ORPHAN_FOLDER_ID','Central Information Pre-check - Orphan'],['PC_BACKUP_FOLDER_ID','Central Information Pre-check - Backup']];
  folderDefinitions.forEach(function(def){if(!pcConfig_(def[0],'')){var folder=DriveApp.createFolder(def[1]);props.setProperty(def[0],folder.getId());created[def[0]]=folder.getId();}});
  var defaults={PC_CHUNK_SIZE_BYTES:String(PC_CONST.DEFAULTS.CHUNK_SIZE_BYTES),PC_REVIEW_LOCK_MINUTES:String(PC_CONST.DEFAULTS.REVIEW_LOCK_MINUTES),PC_RECONCILE_ENABLED:'true',PC_COMMIT_MAX_AUTO_RETRY:String(PC_CONST.DEFAULTS.COMMIT_MAX_AUTO_RETRY),PC_COMMIT_ALERT_AFTER_MINUTES:String(PC_CONST.DEFAULTS.COMMIT_ALERT_AFTER_MINUTES),PC_DASHBOARD_PAGE_SIZE:String(PC_CONST.DEFAULTS.DASHBOARD_PAGE_SIZE),PC_SLA_ENABLED:'false',PC_SLA_WORKING_DAYS:String(PC_CONST.DEFAULTS.SLA_WORKING_DAYS),PC_SLA_WARNING_DAY:String(PC_CONST.DEFAULTS.SLA_WARNING_DAY),PC_BACKUP_RETENTION_DAYS:String(PC_CONST.DEFAULTS.BACKUP_RETENTION_DAYS),PC_ENFORCE_FROM_YEAR:'2569',PC_ENABLED:'false',PC_AUTO_COMMIT_ENABLED:'false',PC_ENFORCE_REPORT_ACTIVITY:'false',PC_UPLOAD_EXPIRE_MINUTES:String(PC_CONST.DEFAULTS.UPLOAD_EXPIRE_MINUTES)};
  Object.keys(defaults).forEach(function(k){if(props.getProperty(k)==null)props.setProperty(k,defaults[k]);});
  pcSeedBaselineTemplate_();
  cfg=getPrecheckConfig_();
  if(cfg.officerGroupEmail&&cfg.stagingFolderId){try{DriveApp.getFolderById(cfg.stagingFolderId).addViewer(cfg.officerGroupEmail);}catch(e){console.warn('Unable to add staging viewer: '+e.message);}}
  return{created:created,verification:verifyPrecheckInstallation_()};
}

/** Creates missing workflow sheets and validates existing headers without overwriting them. */
function pcInitializeWorkflowSheets_(db){
  var names=Object.keys(PC_HEADERS),existing=db.getSheets();
  names.forEach(function(name,index){
    var sheet=db.getSheetByName(name);
    if(!sheet){
      if(index===0&&existing.length===1&&db.getSheetByName('Sheet1')){sheet=db.getSheetByName('Sheet1');sheet.setName(name);}else sheet=db.insertSheet(name);
      var headers=PC_HEADERS[name];if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);
    }else{
      var expected=PC_HEADERS[name];if(sheet.getMaxColumns()<expected.length)throw new Error('Existing workflow sheet has insufficient columns: '+name);
      var actual=sheet.getRange(1,1,1,expected.length).getValues()[0].map(function(v){return String(v||'').trim();});
      for(var i=0;i<expected.length;i++)if(actual[i]!==expected[i])throw new Error('Existing workflow sheet header conflict: '+name+' column '+(i+1));
    }
  });
}

/** Seeds a small requirement-derived published checklist so enforcement has a valid immutable template. */
function pcSeedBaselineTemplate_(){
  var cfg=getPrecheckConfig_();if(!cfg.dbId)return;
  var existing=pcListObjects_(PC_CONST.SHEETS.TEMPLATES);if(existing.length)return;
  var templateId=pcUuid_(),now=pcNowIso_();
  pcAppendObject_(PC_CONST.SHEETS.TEMPLATES,{TemplateId:templateId,TemplateName:'แบบตรวจรายงานผลการดำเนินกิจกรรม',TemplateVersion:1,DocumentType:PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY,AcademicYearFrom:2569,AcademicYearTo:'',Status:PC_CONST.TEMPLATE_STATUS.PUBLISHED,CreatedAt:now,CreatedBy:'SYSTEM_SETUP',PublishedAt:now});
  var labels=[
    {label:'ข้อมูลสรุปที่กรอกในระบบตรงกับข้อมูลใน PDF',help:'ตรวจข้อมูลเป้าหมาย ผล งบประมาณ และค่าสถิติที่เกี่ยวข้อง',required:true,allowNA:false,group:'DATA'},
    {label:'หมายเลขเอกสารและชื่อเอกสารตรงกับข้อมูลทะเบียน',help:'ตรวจหน้ารายงานเทียบกับข้อมูลทะเบียนของศูนย์สารสนเทศกลาง',required:true,allowNA:false,group:'MASTER'},
    {label:'ไฟล์ PDF เปิดอ่านได้และเป็นฉบับที่ต้องการส่งตรวจ',help:'ตรวจความสมบูรณ์และลำดับหน้าของไฟล์',required:true,allowNA:false,group:'PDF'},
    {label:'ข้อมูลเป้าหมายและผลการดำเนินงานครบถ้วนและสอดคล้องกัน',help:'ตรวจสาระเป้าหมายและผลการดำเนินงาน',required:true,allowNA:false,group:'CONTENT'},
    {label:'ข้อมูลงบประมาณและค่าสถิติที่เกี่ยวข้องถูกต้อง',help:'เลือก N/A ได้เมื่อเอกสารประเภทนั้นไม่มีข้อมูลดังกล่าว',required:false,allowNA:true,group:'DATA'}
  ];
  pcAppendObjects_(PC_CONST.SHEETS.TEMPLATE_ITEMS,labels.map(function(x,i){return{ItemId:pcUuid_(),TemplateId:templateId,SectionOrder:1,SectionTitle:'การตรวจรายงาน',SubsectionOrder:1,SubsectionTitle:'',ItemOrder:i+1,ItemLabel:x.label,HelpText:x.help,Required:x.required,AllowNA:x.allowNA,DefaultSeverity:'MINOR',QuickCommentGroup:x.group,Active:true};}));
  pcAppendObjects_(PC_CONST.SHEETS.QUICK_COMMENTS,[
    {QuickCommentId:pcUuid_(),GroupId:'DATA',Label:'ข้อมูลไม่ตรง PDF',FullText:'กรุณาแก้ไขข้อมูลสรุปให้ตรงกับข้อมูลในไฟล์ PDF',Active:true,SortOrder:1},
    {QuickCommentId:pcUuid_(),GroupId:'MASTER',Label:'ข้อมูลทะเบียนไม่ตรง',FullText:'กรุณาตรวจสอบหมายเลขเอกสารหรือชื่อเอกสารให้ตรงกับข้อมูลทะเบียน',Active:true,SortOrder:2},
    {QuickCommentId:pcUuid_(),GroupId:'PDF',Label:'ไฟล์/หน้าไม่สมบูรณ์',FullText:'กรุณาตรวจสอบความครบถ้วนและลำดับหน้าของไฟล์ PDF',Active:true,SortOrder:3},
    {QuickCommentId:pcUuid_(),GroupId:'CONTENT',Label:'ข้อมูลไม่ครบ',FullText:'กรุณาเพิ่มเติมหรือแก้ไขข้อมูลผลการดำเนินงานให้ครบถ้วน',Active:true,SortOrder:4}
  ]);
  PropertiesService.getScriptProperties().setProperty('PC_DEFAULT_TEMPLATE_ID',templateId);
}

/** Private editor function: dry-run or safely installs only AA:AF provenance columns in ReportSubmit. Idempotent after a successful migration. */
function migratePrecheckSchema_(options){
  options=options||{};
  var dryRun=options.dryRun!==false,ss=getSpreadsheet_(),sheet=ss.getSheetByName(reportSubmitSheetName);
  if(!sheet)throw new Error('ReportSubmit sheet missing');
  var expected={2:'หมายเลขเอกสาร',3:'ชื่อรายงาน',4:'กลุ่มบริหาร',5:'กลุ่มงาน',6:'ผู้รับผิดชอบ',7:'ลิงก์ไฟล์',8:'เป้าหมายเชิงปริมาณ',9:'เป้าหมายเชิงคุณภาพ',10:'ผลการดำเนินการเชิงปริมาณ',11:'ผลการดำเนินการเชิงคุณภาพ',12:'ผลการดำเนินการที่คาดหวัง',13:'ค่า X̄ (X Bar) ของผลการบริหารกิจกรรม',14:'เหตุผลที่ไม่ดำเนินการ',15:'โครงการตามแผนปฎิบัติการ',16:'อีเมล',17:'งบประมาณที่ได้รับจัดสรร',18:'งบประมาณที่ใช้จริง',19:'รหัสกิจกรรม',20:'ชื่อกิจกรรม',21:'บรรลุผลที่คาดว่าจะได้รับ',22:'ค่า X̄ (X Bar) ความพึงพอใจ',23:'ค่า SD ความพึงพอใจ',24:'ค่า SD ผลการบริหารกิจกรรม',25:'ประเภทเอกสารสำหรับการตรวจค่าสถิติ',26:'PR Indicator'};
  if(sheet.getMaxColumns()<26)throw new Error('ReportSubmit has fewer than 26 columns; migration aborted');
  var first26=sheet.getRange(1,1,1,26).getValues()[0];
  Object.keys(expected).forEach(function(k){var col=Number(k);if(String(first26[col-1]||'').trim()!==expected[col])throw new Error('ReportSubmit header mismatch at column '+col+': expected "'+expected[col]+'"');});

  var maxCols=sheet.getMaxColumns(),lastRow=Math.max(1,sheet.getLastRow()),installed=false;
  if(maxCols>=32){
    var installedHeaders=sheet.getRange(1,27,1,6).getValues()[0].map(function(v){return String(v||'').trim();});
    installed=installedHeaders.every(function(v,i){return v===PC_CONST.REPORTSUBMIT_PROVENANCE[i];});
    if(installed){
      return{dryRun:dryRun,alreadyInstalled:true,currentMaxColumns:maxCols,willAddColumns:0,willSetHeaders:[],conflicts:[],message:'ReportSubmit provenance schema is already installed'};
    }
  }

  var conflicts=[];
  if(maxCols>=27){
    var width=Math.min(6,maxCols-26),target=sheet.getRange(1,27,lastRow,width).getValues();
    for(var r=0;r<target.length;r++)for(var c=0;c<target[r].length;c++)if(String(target[r][c]||'').trim()!=='')conflicts.push({row:r+1,column:27+c,value:String(target[r][c]).substring(0,80)});
  }
  if(conflicts.length)throw new Error('Migration aborted: AA:AF contains existing data: '+JSON.stringify(conflicts.slice(0,20)));
  var report={dryRun:dryRun,alreadyInstalled:false,currentMaxColumns:maxCols,willAddColumns:Math.max(0,32-maxCols),willSetHeaders:PC_CONST.REPORTSUBMIT_PROVENANCE.slice(),conflicts:conflicts};
  if(dryRun)return report;
  var backup=createProductionDataBackup_();
  if(sheet.getMaxColumns()<32)sheet.insertColumnsAfter(sheet.getMaxColumns(),32-sheet.getMaxColumns());
  sheet.getRange(1,27,1,6).setValues([PC_CONST.REPORTSUBMIT_PROVENANCE]);SpreadsheetApp.flush();
  pcRequireReportSubmitProvenanceSchema_(sheet);
  report.backup=backup;report.completedAt=pcNowIso_();return report;
}

/** Creates a timestamped production spreadsheet copy before a schema write. */
function createProductionDataBackup_(){
  var cfg=getPrecheckConfig_(),ss=getSpreadsheet_(),file=DriveApp.getFileById(ss.getId()),name='Production DB Backup - '+Utilities.formatDate(new Date(),PC_CONST.TIMEZONE,'yyyyMMdd-HHmmss');
  var copy=cfg.backupFolderId?file.makeCopy(name,pcDriveFolder_(cfg.backupFolderId,'Backup')):file.makeCopy(name);
  PropertiesService.getScriptProperties().setProperty('PC_PRODUCTION_BACKUP_AT',pcNowIso_());return{id:copy.getId(),name:copy.getName()};
}

/** Private editor function: returns installation validation without mutating data. */
function verifyPrecheckInstallation_(){return runPrecheckHealthCheck_();}
