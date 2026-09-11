/**
 * One-time installer. Run manually while signed in as budgetservice@g.klaeng.ac.th.
 * It starts from the current end of PC_Notifications to avoid historical email bursts.
 */
function setupOfficerNotificationWorker() {
  paAssertRunner_();
  var db = paDb_();
  paAssertHeaders_(paSheetRequired_(PA_NOTIFY.SHEETS.SOURCE), PA_SOURCE_HEADERS);
  paAssertHeaders_(paSheetRequired_(PA_NOTIFY.SHEETS.ACCESS), PA_ACCESS_HEADERS);
  paSheetRequired_(PA_NOTIFY.SHEETS.SUBMISSIONS);
  paSheetRequired_(PA_NOTIFY.SHEETS.VERSIONS);
  paEnsureAlertSheet_();

  var recipients = paLoadActiveRecipients_();
  if (!recipients.length) throw new Error('PC_Access has no active officer/admin recipients');

  var sourceLastRow = paSheetRequired_(PA_NOTIFY.SHEETS.SOURCE).getLastRow();
  var props = PropertiesService.getScriptProperties();
  var existingCursor = props.getProperty(PA_NOTIFY.PROP_CURSOR);
  var firstInstall = !existingCursor;
  if (firstInstall) {
    var initial = {};
    initial[PA_NOTIFY.PROP_CURSOR] = String(sourceLastRow);
    initial[PA_NOTIFY.PROP_INSTALLED_AT] = new Date().toISOString();
    props.setProperties(initial, false);
  }

  paInstallMinuteTrigger_();
  var health = runOfficerNotificationHealthCheck();
  if (!health.ok) throw new Error('Installation health check failed: ' + JSON.stringify(health));
  return {
    ok: true,
    version: PA_NOTIFY.VERSION,
    database: db.getName(),
    sourceCursor: Number(props.getProperty(PA_NOTIFY.PROP_CURSOR) || sourceLastRow),
    firstInstall: firstInstall,
    recipients: recipients,
    triggerEveryMinutes: PA_NOTIFY.TRIGGER_EVERY_MINUTES,
    message: firstInstall ? 'Installed. Only source events created after the initial cursor will be emailed.' : 'Reinstalled safely. Existing cursor was preserved.'
  };
}

/** Recreates only this worker's trigger. */
function reinstallOfficerNotificationTrigger() {
  paAssertRunner_();
  paInstallMinuteTrigger_();
  return runOfficerNotificationHealthCheck();
}

/** Removes duplicate worker triggers and creates exactly one one-minute time-driven trigger. */
function paInstallMinuteTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'processOfficerNotifications') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('processOfficerNotifications')
    .timeBased()
    .everyMinutes(PA_NOTIFY.TRIGGER_EVERY_MINUTES)
    .create();
}

/** Emergency stop: removes only the worker trigger. Data and queue are preserved. */
function disableOfficerNotificationWorker() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'processOfficerNotifications') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return { ok: true, removedTriggers: removed, queuePreserved: true };
}

/** Resume after emergency stop without changing the source cursor. */
function enableOfficerNotificationWorker() {
  paAssertRunner_();
  paInstallMinuteTrigger_();
  return runOfficerNotificationHealthCheck();
}

/**
 * Intentional reset to NOW. Use only if the operator explicitly wants to abandon un-ingested historical source rows.
 * Existing alert jobs are never deleted.
 */
function resetNotificationCursorToNow() {
  paAssertRunner_();
  var row = paSheetRequired_(PA_NOTIFY.SHEETS.SOURCE).getLastRow();
  PropertiesService.getScriptProperties().setProperty(PA_NOTIFY.PROP_CURSOR, String(row));
  return { ok: true, cursor: row };
}
