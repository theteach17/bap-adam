/** Public editor-safe bootstrap wrapper. Creates only isolated resources and keeps all behavior flags disabled. */
function setupPrecheckSystem() {
  pcRequireTechnicalOwner_();
  return setupPrecheckSystem_({});
}

/** Public editor-safe configuration wrapper. Intended for Apps Script editor/Execution API by the technical owner, not browser UI. */
function configurePrecheckSystem(config) {
  pcRequireTechnicalOwner_();
  var effectiveConfig = config && Object.keys(config).length ? config : pcReadPrecheckConfigFromSettingsSheet_();
  return configurePrecheckSystem_(effectiveConfig);
}

/** Public dry-run migration. Running with no argument never writes Production. */
function migratePrecheckSchema(options) {
  pcRequireTechnicalOwner_();
  options = options || { dryRun:true };
  if (options.dryRun !== false) options.dryRun = true;
  return migratePrecheckSchema_(options);
}

/** Explicit production migration wrapper; it performs a Production spreadsheet backup before writing AA:AF. */
function applyPrecheckSchemaMigration() {
  pcRequireTechnicalOwner_();
  return migratePrecheckSchema_({ dryRun:false });
}

/** Public read-only installation verification for the technical owner. */
function verifyPrecheckInstallation() {
  pcRequireTechnicalOwner_();

  var result = verifyPrecheckInstallation_();

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}

/** Public read-only health check for the technical owner. */
function runPrecheckHealthCheck() {
  pcRequireTechnicalOwner_();
  return runPrecheckHealthCheck_();
}

/** Public idempotent trigger installer for the technical owner. */
function installPrecheckTriggers() {
  pcRequireTechnicalOwner_();
  return installPrecheckTriggers_();
}

/** Public trigger removal wrapper that removes only this module's triggers. */
function removePrecheckTriggers() {
  pcRequireTechnicalOwner_();
  return removePrecheckTriggers_();
}

/** Bootstraps the first Pre-check administrator from the technical owner's Workspace identity. Idempotent. */
function bootstrapPrecheckAdmin() {
  var email = pcRequireTechnicalOwner_();
  var sheet;
  try { sheet = pcSheet_(PC_CONST.SHEETS.ACCESS); } catch (e) { throw pcUserError_('ยังไม่พบฐานข้อมูลสิทธิ์ กรุณารัน setupPrecheckSystem() ก่อน', 'PC_ACCESS_NOT_READY'); }
  var now = pcNowIso_();
  var displayName = '';
  try { displayName = Session.getActiveUser().getEmail() || email; } catch (e) { displayName = email; }
  var rows = pcListObjects_(PC_CONST.SHEETS.ACCESS);
  var existingIndex = -1;
  for (var i = 0; i < rows.length; i++) {
    if (pcKey_(rows[i].Email) === pcKey_(email)) { existingIndex = i; break; }
  }
  var values = [email, PC_CONST.ROLES.ADMIN, displayName, true, now, now];
  if (existingIndex >= 0) {
    var rowNumber = existingIndex + 2;
    var current = sheet.getRange(rowNumber, 1, 1, 6).getValues()[0];
    values[4] = current[4] || now;
    sheet.getRange(rowNumber, 1, 1, 6).setValues([values]);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, 6).setValues([values]);
  }
  CacheService.getScriptCache().remove('PC_ACCESS_CACHE');
  return { success: true, email: email, role: PC_CONST.ROLES.ADMIN, updated: existingIndex >= 0 };
}

/** Runs an immediate workflow-database backup so installation can be verified before rollout. */
function runPrecheckBackupNow() {
  pcRequireTechnicalOwner_();
  return createPrecheckDailyBackup_();
}
