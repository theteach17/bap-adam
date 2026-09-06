/** Appends a detailed immutable Pre-check audit event. Audit storage failure is logged but never makes a completed business operation look failed. */
function pcAudit_(action, context, principal, metadata) {
  try {
    var cfg = getPrecheckConfig_();
    if (!cfg.dbId) return null;
    principal = principal || { username:'SYSTEM', displayName:'SYSTEM', email:'', roles:[] };
    context = context || {};
    var role = principal.roles && principal.roles.length ? principal.roles[principal.roles.length - 1] : PC_CONST.ROLES.USER;
    return pcAppendObject_(PC_CONST.SHEETS.AUDIT, {
      AuditId: pcUuid_(),
      Timestamp: pcNowIso_(),
      ActorUsername: principal.username || 'SYSTEM',
      ActorName: principal.displayName || principal.username || 'SYSTEM',
      ActorEmail: principal.email || '',
      ActorRole: role,
      Action: String(action || ''),
      SubmissionId: context.SubmissionId || context.submissionId || '',
      VersionId: context.VersionId || context.versionId || '',
      ReviewId: context.ReviewId || context.reviewId || '',
      PreviousStatus: context.PreviousStatus || context.previousStatus || '',
      NewStatus: context.NewStatus || context.newStatus || '',
      MetadataJSON: JSON.stringify(metadata || {}),
      CorrelationId: context.CorrelationId || context.correlationId || pcCorrelationId_()
    });
  } catch (error) {
    console.error('PC_AUDIT_WRITE_FAILED action='+String(action||'')+' message='+String(error&&error.message||error));
    return null;
  }
}

/** Writes a concise event to the legacy Logfile without exposing technical detail. */
function pcLegacySummaryLog_(principal, action, documentNumber) {
  try { logActionInternal_((principal && (principal.displayName || principal.username)) || 'SYSTEM', action, 'สำเร็จ', documentNumber || ''); } catch (ignored) {}
}
