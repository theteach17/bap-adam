/** Reads a Pre-check configuration value from Script Properties. */
function pcConfig_(key, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(String(key));
  return value == null || value === '' ? fallback : value;
}

/** Returns effective configuration with safe defaults for non-secret operational values. */
function getPrecheckConfig_() {
  return {
    enabled: pcBool_(pcConfig_('PC_ENABLED', 'false'), false),
    autoCommitEnabled: pcBool_(pcConfig_('PC_AUTO_COMMIT_ENABLED', 'false'), false),
    enforceReportActivity: pcBool_(pcConfig_('PC_ENFORCE_REPORT_ACTIVITY', 'false'), false),
    enforceFromYear: pcInt_(pcConfig_('PC_ENFORCE_FROM_YEAR', '2569'), 2569, 2500, 3000),
    dbId: String(pcConfig_('PC_DB_ID', '') || '').trim(),
    stagingFolderId: String(pcConfig_('PC_STAGING_FOLDER_ID', '') || '').trim(),
    archiveFolderId: String(pcConfig_('PC_ARCHIVE_FOLDER_ID', '') || '').trim(),
    orphanFolderId: String(pcConfig_('PC_ORPHAN_FOLDER_ID', '') || '').trim(),
    officerGroupEmail: String(pcConfig_('PC_OFFICER_GROUP_EMAIL', '') || '').trim(),
    maxFileMb: pcInt_(pcConfig_('PC_MAX_FILE_MB', '0'), 0, 0, 2048),
    chunkSizeBytes: pcInt_(pcConfig_('PC_CHUNK_SIZE_BYTES', String(PC_CONST.DEFAULTS.CHUNK_SIZE_BYTES)), PC_CONST.DEFAULTS.CHUNK_SIZE_BYTES, 262144, 4194304),
    reviewLockMinutes: pcInt_(pcConfig_('PC_REVIEW_LOCK_MINUTES', String(PC_CONST.DEFAULTS.REVIEW_LOCK_MINUTES)), PC_CONST.DEFAULTS.REVIEW_LOCK_MINUTES, 5, 120),
    defaultTemplateId: String(pcConfig_('PC_DEFAULT_TEMPLATE_ID', '') || '').trim(),
    reconcileEnabled: pcBool_(pcConfig_('PC_RECONCILE_ENABLED', 'true'), true),
    commitMaxAutoRetry: pcInt_(pcConfig_('PC_COMMIT_MAX_AUTO_RETRY', String(PC_CONST.DEFAULTS.COMMIT_MAX_AUTO_RETRY)), PC_CONST.DEFAULTS.COMMIT_MAX_AUTO_RETRY, 1, 20),
    commitAlertAfterMinutes: pcInt_(pcConfig_('PC_COMMIT_ALERT_AFTER_MINUTES', String(PC_CONST.DEFAULTS.COMMIT_ALERT_AFTER_MINUTES)), PC_CONST.DEFAULTS.COMMIT_ALERT_AFTER_MINUTES, 5, 1440),
    dashboardPageSize: pcInt_(pcConfig_('PC_DASHBOARD_PAGE_SIZE', String(PC_CONST.DEFAULTS.DASHBOARD_PAGE_SIZE)), PC_CONST.DEFAULTS.DASHBOARD_PAGE_SIZE, 5, 100),
    slaEnabled: pcBool_(pcConfig_('PC_SLA_ENABLED', 'false'), false),
    slaWorkingDays: pcInt_(pcConfig_('PC_SLA_WORKING_DAYS', String(PC_CONST.DEFAULTS.SLA_WORKING_DAYS)), PC_CONST.DEFAULTS.SLA_WORKING_DAYS, 1, 30),
    slaWarningDay: pcInt_(pcConfig_('PC_SLA_WARNING_DAY', String(PC_CONST.DEFAULTS.SLA_WARNING_DAY)), PC_CONST.DEFAULTS.SLA_WARNING_DAY, 1, 30),
    backupFolderId: String(pcConfig_('PC_BACKUP_FOLDER_ID', '') || '').trim(),
    backupRetentionDays: pcInt_(pcConfig_('PC_BACKUP_RETENTION_DAYS', String(PC_CONST.DEFAULTS.BACKUP_RETENTION_DAYS)), PC_CONST.DEFAULTS.BACKUP_RETENTION_DAYS, 7, 3650),
    pilotAdminGroups: pcList_(pcConfig_('PC_PILOT_ADMIN_GROUPS', '')),
    pilotOfficers: pcList_(pcConfig_('PC_PILOT_OFFICERS', '')).map(pcKey_),
    uploadExpireMinutes: pcInt_(pcConfig_('PC_UPLOAD_EXPIRE_MINUTES', String(PC_CONST.DEFAULTS.UPLOAD_EXPIRE_MINUTES)), PC_CONST.DEFAULTS.UPLOAD_EXPIRE_MINUTES, 10, 240)
  };
}

/** Validates configuration needed for an upload and fails closed when incomplete. */
function requireUploadConfig_() {
  var cfg = getPrecheckConfig_();
  if (!cfg.maxFileMb) throw pcUserError_('ระบบอัปโหลดยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ', 'UPLOAD_CONFIG_MISSING');
  if (!cfg.chunkSizeBytes) throw pcUserError_('ระบบอัปโหลดยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ', 'UPLOAD_CONFIG_MISSING');
  return cfg;
}

/** Validates configuration needed for the Pre-check workflow database. */
function requirePrecheckDbConfig_() {
  var cfg = getPrecheckConfig_();
  if (!cfg.dbId) throw pcUserError_('ระบบ Pre-check ยังไม่ได้ตั้งค่าฐานข้อมูล กรุณาแจ้งผู้ดูแลระบบ', 'PC_DB_MISSING');
  return cfg;
}

/** Returns true when the module is in Pilot mode rather than Shadow or Full Enforcement. */
function pcPilotMode_(cfg) {
  cfg = cfg || getPrecheckConfig_();
  return !!(cfg.enabled && !cfg.enforceReportActivity && (cfg.pilotAdminGroups.length || cfg.pilotOfficers.length));
}

/** Returns whether a report must enter Pre-check under full-enforcement or pilot scope. */
function shouldEnforcePrecheck_(document, principal) {
  var cfg = getPrecheckConfig_();
  if (!cfg.enabled || !document || document.documentType !== PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY) return false;
  var year = Number(document.documentYear || 0);
  if (year < cfg.enforceFromYear) return false;
  if (cfg.enforceReportActivity) return true;
  if (!pcPilotMode_(cfg)) return false; // Shadow mode preserves the existing report workflow.
  if (!cfg.pilotAdminGroups.length) return true; // Pilot officer list only = all admin groups are in pilot scope.
  return cfg.pilotAdminGroups.indexOf(String(document.adminGroup || '').trim()) !== -1;
}

/** Returns whether an officer is allowed to review during Pilot mode. Administrators retain oversight access. */
function pcOfficerAllowedInPilot_(principal) {
  var cfg = getPrecheckConfig_();
  if (!pcPilotMode_(cfg) || !cfg.pilotOfficers.length) return true;
  if (principal && principal.roles && principal.roles.indexOf(PC_CONST.ROLES.ADMIN) !== -1) return true;
  return cfg.pilotOfficers.indexOf(pcKey_(principal && principal.email)) !== -1;
}

/** Returns whether Pre-check can be used even while enforcement is still off. */
function isPrecheckAvailable_(document) {
  var cfg = getPrecheckConfig_();
  return cfg.enabled && document && document.documentType === PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY && Number(document.documentYear || 0) >= cfg.enforceFromYear;
}

/** Returns a safe subset of configuration for the browser. */
function getPrecheckClientConfig() {
  var principal = getCurrentPrincipal_();
  var cfg = getPrecheckConfig_();
  return {
    appName: PC_CONST.USER_FACING_NAME,
    enabled: cfg.enabled,
    maxFileMb: cfg.maxFileMb,
    chunkSizeBytes: cfg.chunkSizeBytes,
    dashboardPageSize: cfg.dashboardPageSize,
    roles: principal.roles.slice(),
    principal: { displayName: principal.displayName, email: principal.email, roles: principal.roles.slice() },
    baseUrl: ScriptApp.getService().getUrl()
  };
}

/** Reads whitelisted PC_* key/value rows from the existing Settings Sheet without modifying Production. */
function pcReadPrecheckConfigFromSettingsSheet_() {
  var sheet = getSpreadsheet_().getSheetByName('Settings Sheet');
  if (!sheet) throw new Error('Settings Sheet is missing');
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) throw new Error('Settings Sheet is empty');
  var values = sheet.getRange(1, 1, lastRow, 2).getValues();
  var allowed = [
    'PC_ENABLED','PC_AUTO_COMMIT_ENABLED','PC_ENFORCE_REPORT_ACTIVITY','PC_ENFORCE_FROM_YEAR','PC_DB_ID',
    'PC_STAGING_FOLDER_ID','PC_ARCHIVE_FOLDER_ID','PC_ORPHAN_FOLDER_ID','PC_OFFICER_GROUP_EMAIL','PC_MAX_FILE_MB',
    'PC_CHUNK_SIZE_BYTES','PC_REVIEW_LOCK_MINUTES','PC_DEFAULT_TEMPLATE_ID','PC_RECONCILE_ENABLED','PC_COMMIT_MAX_AUTO_RETRY',
    'PC_COMMIT_ALERT_AFTER_MINUTES','PC_DASHBOARD_PAGE_SIZE','PC_SLA_ENABLED','PC_SLA_WORKING_DAYS','PC_SLA_WARNING_DAY',
    'PC_BACKUP_FOLDER_ID','PC_BACKUP_RETENTION_DAYS','PC_PILOT_ADMIN_GROUPS','PC_PILOT_OFFICERS','PC_UPLOAD_EXPIRE_MINUTES'
  ];
  var config = {};
  values.forEach(function(row){
    var key = String(row[0] == null ? '' : row[0]).trim();
    if (allowed.indexOf(key) !== -1 && row[1] !== '' && row[1] != null) config[key] = row[1];
  });
  if (!Object.keys(config).length) throw new Error('ไม่พบค่า PC_* ใน Settings Sheet กรุณาเพิ่มค่าที่ต้องการในคอลัมน์ A:B ก่อนรัน configurePrecheckSystem()');
  return config;
}

/** Private editor function: applies validated configuration without exposing a public mutation endpoint. */
function configurePrecheckSystem_(config) {
  config = config || {};
  var allowed = [
    'PC_ENABLED','PC_AUTO_COMMIT_ENABLED','PC_ENFORCE_REPORT_ACTIVITY','PC_ENFORCE_FROM_YEAR','PC_DB_ID',
    'PC_STAGING_FOLDER_ID','PC_ARCHIVE_FOLDER_ID','PC_ORPHAN_FOLDER_ID','PC_OFFICER_GROUP_EMAIL','PC_MAX_FILE_MB',
    'PC_CHUNK_SIZE_BYTES','PC_REVIEW_LOCK_MINUTES','PC_DEFAULT_TEMPLATE_ID','PC_RECONCILE_ENABLED','PC_COMMIT_MAX_AUTO_RETRY',
    'PC_COMMIT_ALERT_AFTER_MINUTES','PC_DASHBOARD_PAGE_SIZE','PC_SLA_ENABLED','PC_SLA_WORKING_DAYS','PC_SLA_WARNING_DAY',
    'PC_BACKUP_FOLDER_ID','PC_BACKUP_RETENTION_DAYS','PC_PILOT_ADMIN_GROUPS','PC_PILOT_OFFICERS','PC_UPLOAD_EXPIRE_MINUTES'
  ];
  var props = {};
  Object.keys(config).forEach(function(key) {
    if (allowed.indexOf(key) === -1) throw new Error('Unsupported configuration key: ' + key);
    props[key] = Array.isArray(config[key]) ? config[key].join(',') : String(config[key]);
  });
  if (props.PC_MAX_FILE_MB && pcInt_(props.PC_MAX_FILE_MB, 0, 0, 2048) <= 0) throw new Error('PC_MAX_FILE_MB must be greater than 0');
  if (props.PC_OFFICER_GROUP_EMAIL && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pcKey_(props.PC_OFFICER_GROUP_EMAIL))) throw new Error('PC_OFFICER_GROUP_EMAIL is not a valid email address');
  var previewStaging=props.PC_STAGING_FOLDER_ID||pcConfig_('PC_STAGING_FOLDER_ID','');
  if (props.PC_STAGING_FOLDER_ID) pcDriveFolder_(props.PC_STAGING_FOLDER_ID,'Staging');
  PropertiesService.getScriptProperties().setProperties(props, false);
  CacheService.getScriptCache().remove('PC_ACCESS_CACHE');
  var updated=getPrecheckConfig_();
  if(updated.officerGroupEmail&&updated.stagingFolderId){
    try{DriveApp.getFolderById(updated.stagingFolderId).addViewer(updated.officerGroupEmail);}catch(e){throw new Error('Unable to grant staging-folder Viewer permission to PC_OFFICER_GROUP_EMAIL: '+e.message);}
  }
  return updated;
}
