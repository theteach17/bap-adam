/** Main minute worker. Safe to run repeatedly; source ingestion is idempotent. */
function processOfficerNotifications() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(PA_NOTIFY.LOCK_WAIT_MS)) return { ok: true, skipped: 'BUSY' };
  var now = new Date();
  try {
    paAssertRunner_();
    paEnsureAlertSheet_();

    var ingest = paIngestNewEvents_(now);
    var dispatch = paDispatchDueJobs_(now);

    var props = PropertiesService.getScriptProperties();
    props.setProperty(PA_NOTIFY.PROP_LAST_RUN_AT, now.toISOString());
    props.setProperty(PA_NOTIFY.PROP_LAST_SUCCESS_AT, new Date().toISOString());
    return { ok: true, version: PA_NOTIFY.VERSION, ingest: ingest, dispatch: dispatch };
  } catch (error) {
    PropertiesService.getScriptProperties().setProperty(PA_NOTIFY.PROP_LAST_RUN_AT, now.toISOString());
    console.error('processOfficerNotifications failed', error && error.stack ? error.stack : error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/** Materializes eligible source events into per-recipient durable jobs, then advances the cursor. */
function paIngestNewEvents_(now) {
  var props = PropertiesService.getScriptProperties();
  var cursor = Number(props.getProperty(PA_NOTIFY.PROP_CURSOR) || 1);
  var source = paReadNewSourceEvents_(cursor);
  if (!source.events.length) {
    if (source.sourceLastRow > cursor) props.setProperty(PA_NOTIFY.PROP_CURSOR, String(source.sourceLastRow));
    return { scanned: Math.max(0, source.sourceLastRow - cursor), matchedEvents: 0, jobsCreated: 0, cursor: source.sourceLastRow };
  }

  var recipients = paLoadActiveRecipients_();
  if (!recipients.length) throw new Error('No active PRECHECK_OFFICER/PRECHECK_ADMIN recipients found in PC_Access');
  var existingKeys = paExistingDeliveryKeys_();
  var jobs = [];
  var matched = 0;

  source.events.forEach(function(event) {
    var submission = paFindSubmission_(event.submissionId);
    if (!paValidateEventForOfficerAlert_(event, submission)) return;
    var version = paFindVersion_(event.versionId);
    matched++;
    recipients.forEach(function(recipient) {
      var key = paDeliveryKey_(event.notificationId, recipient.email);
      if (existingKeys[key]) return;
      var job = paBuildJob_(event, recipient, submission, version, now);
      existingKeys[key] = true;
      jobs.push(job);
    });
  });

  var created = paAppendAlertJobs_(jobs);
  // Advance only after durable jobs have been written. Duplicate replays are blocked by DeliveryKey.
  props.setProperty(PA_NOTIFY.PROP_CURSOR, String(source.sourceLastRow));
  return { scanned: Math.max(0, source.sourceLastRow - cursor), matchedEvents: matched, recipients: recipients.length, jobsCreated: created, cursor: source.sourceLastRow };
}

/** Sends due jobs within quota and batch limits, recording sent, retry, or failed outcomes. */
function paDispatchDueJobs_(now) {
  var jobs = paLoadDueJobs_(now);
  if (!jobs.length) return { due: 0, sent: 0, retried: 0, failed: 0, quotaRemaining: MailApp.getRemainingDailyQuota() };

  var quota = MailApp.getRemainingDailyQuota();
  var sent = 0;
  var retried = 0;
  var failed = 0;
  var processed = 0;

  for (var i = 0; i < jobs.length; i++) {
    if (quota <= PA_NOTIFY.QUOTA_RESERVE) break;
    var job = jobs[i];
    var attempt = Number(job.AttemptCount || 0) + 1;
    var attemptAt = new Date();
    paPatchAlertJob_(job.__row, {
      Status: PA_NOTIFY.ALERT_STATUS.SENDING,
      AttemptCount: attempt,
      LastAttemptAt: attemptAt,
      ErrorCode: job.__staleSending ? 'STALE_SENDING_RECOVERED' : '',
      ErrorMessage: job.__staleSending ? 'Recovered automatically after an interrupted execution.' : ''
    });

    try {
      var content = paBuildEmail_(job);
      MailApp.sendEmail({
        to: paNormalizeEmail_(job.RecipientEmail),
        subject: String(job.Subject || paBuildSubject_(job.EventType, job.DocumentNumber)),
        body: content.text,
        htmlBody: content.html,
        name: PA_NOTIFY.SENDER_NAME
      });
      paPatchAlertJob_(job.__row, {
        Status: PA_NOTIFY.ALERT_STATUS.SENT,
        SentAt: new Date(),
        NextAttemptAt: '',
        ErrorCode: '',
        ErrorMessage: ''
      });
      sent++;
      quota--;
    } catch (error) {
      var terminal = attempt >= PA_NOTIFY.MAX_ATTEMPTS;
      var message = paTruncate_(error && error.message ? error.message : String(error), 1000);
      paPatchAlertJob_(job.__row, {
        Status: terminal ? PA_NOTIFY.ALERT_STATUS.FAILED : PA_NOTIFY.ALERT_STATUS.RETRY,
        NextAttemptAt: terminal ? '' : paRetryAt_(attemptAt, attempt),
        ErrorCode: paErrorCode_(error),
        ErrorMessage: message
      });
      terminal ? failed++ : retried++;
    }
    processed++;
  }

  return { due: jobs.length, processed: processed, sent: sent, retried: retried, failed: failed, quotaRemaining: quota };
}

/** Fails closed unless the effective user is the required budgetservice account. */
function paAssertRunner_() {
  var effective = paNormalizeEmail_(Session.getEffectiveUser().getEmail());
  if (!effective) throw new Error('Unable to verify the effective user email. Re-authorize the project before installation.');
  if (effective !== paNormalizeEmail_(PA_NOTIFY.REQUIRED_RUNNER_EMAIL)) {
    throw new Error('This worker must run as ' + PA_NOTIFY.REQUIRED_RUNNER_EMAIL + '; current effective user is ' + effective);
  }
  return effective;
}

/** Classifies a send exception into a compact operational error code. */
function paErrorCode_(error) {
  var message = String(error && error.message ? error.message : error || '').toLowerCase();
  if (message.indexOf('quota') !== -1 || message.indexOf('too many') !== -1) return 'MAIL_QUOTA';
  if (message.indexOf('invalid email') !== -1 || message.indexOf('invalid recipient') !== -1) return 'INVALID_RECIPIENT';
  if (message.indexOf('authorization') !== -1 || message.indexOf('permission') !== -1) return 'AUTHORIZATION';
  return 'MAIL_SEND_ERROR';
}

/** Limits stored error text to a safe maximum length. */
function paTruncate_(value, maxLength) {
  var text = String(value == null ? '' : value);
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}
