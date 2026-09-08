/**
 * Resolves the authenticated principal from the existing session and Workspace identity.
 * [PERF PATCH v2.1.1] ฟังก์ชันนี้ถูกเรียกซ้ำ 2-5 ครั้งต่อ 1 คำขอ และแต่ละครั้งอ่านชีต
 * Credential ทั้งใบใหม่ จึงจำผลไว้ต่อ execution โดย "ผูกกับ userKeyHash ของผู้ใช้"
 * ถ้าเป็นคนละคนจะคำนวณใหม่เสมอ ไม่มีทางได้สิทธิ์ข้ามผู้ใช้
 */
function getCurrentPrincipal_() {
  var session = requireAuth_('principal');
  var identity = String(session.userKeyHash || '') + '|' + String(session.username || '');
  return pcMemoScoped_('principal', identity, function() {
    return pcBuildCurrentPrincipal_(session);
  });
}

/** Builds the principal from a validated session. Behaviour identical to the original. */
function pcBuildCurrentPrincipal_(session) {
  var activeEmail = '';
  try { activeEmail = String(Session.getActiveUser().getEmail() || '').trim(); } catch (e) { activeEmail = ''; }
  var credentialEmail = pcCredentialEmailForUsername_(session.username);
  var email = activeEmail || credentialEmail;
  var roles = [PC_CONST.ROLES.USER];
  var access = email ? pcAccessForEmail_(email) : null;
  if (access && pcBool_(access.Active, false)) {
    var role = String(access.Role || '').trim();
    if ([PC_CONST.ROLES.OFFICER, PC_CONST.ROLES.ADMIN].indexOf(role) !== -1) roles.push(role);
  }
  if (roles.indexOf(PC_CONST.ROLES.ADMIN) !== -1 && roles.indexOf(PC_CONST.ROLES.OFFICER) === -1) roles.push(PC_CONST.ROLES.OFFICER);
  return {
    username: String(session.username || ''),
    displayName: String(session.displayName || session.username || ''),
    email: email,
    roles: roles,
    authSource: activeEmail ? 'ACTIVE_USER+EXISTING_SESSION' : 'EXISTING_SESSION'
  };
}

/** Finds a user's email in the existing Credential sheet without changing the legacy login model. */
function pcCredentialEmailForUsername_(username) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('Credential');
  if (!sheet || sheet.getLastRow() < 2) return '';
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(6, sheet.getLastColumn())).getValues();
  var key = String(username || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === key) return String(values[i][2] || '').trim();
  }
  return '';
}

/** Reads the active officer/admin allowlist, with a short cache. */
function pcAccessMap_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('PC_ACCESS_CACHE');
  if (cached) return pcParseJson_(cached, 'access cache');
  var map = {};
  try {
    var rows = pcListObjects_(PC_CONST.SHEETS.ACCESS);
    rows.forEach(function(row) {
      if (row.Email) map[pcKey_(row.Email)] = row;
    });
  } catch (e) {
    return map;
  }
  cache.put('PC_ACCESS_CACHE', JSON.stringify(map), 300);
  return map;
}

/** Returns access record for an email. */
function pcAccessForEmail_(email) {
  return pcAccessMap_()[pcKey_(email)] || null;
}

/** Requires at least one specified role and audits unauthorized requests. */
function requirePrecheckRole_(allowedRoles, action) {
  var principal = getCurrentPrincipal_();
  var ok = allowedRoles.some(function(role){ return principal.roles.indexOf(role) !== -1; });
  if (!ok) {
    try { pcAudit_('UNAUTHORIZED_REQUEST', {}, principal, { action: action || '' }); } catch (ignored) {}
    throw pcUserError_('คุณไม่มีสิทธิ์ใช้งานส่วนนี้', 'FORBIDDEN');
  }
  return principal;
}

/** Requires officer/admin role and enforces the optional Pilot officer allowlist server-side. */
function requireOfficer_(action) {
  var principal = requirePrecheckRole_([PC_CONST.ROLES.OFFICER, PC_CONST.ROLES.ADMIN], action);
  if (!pcOfficerAllowedInPilot_(principal)) {
    try { pcAudit_('UNAUTHORIZED_REQUEST', {}, principal, { action: action || '', reason: 'PILOT_OFFICER_SCOPE' }); } catch (ignored) {}
    throw pcUserError_('คุณยังไม่อยู่ในกลุ่มเจ้าหน้าที่นำร่องของระบบตรวจเอกสาร', 'PILOT_SCOPE_FORBIDDEN');
  }
  return principal;
}

/** Requires administrator role. */
function requirePrecheckAdmin_(action) {
  return requirePrecheckRole_([PC_CONST.ROLES.ADMIN], action);
}

/** Returns a stable ownership key for upload/review checks. */
function pcPrincipalKey_(principal) {
  principal = principal || getCurrentPrincipal_();
  return pcKey_(principal.email || principal.username) + '|' + pcKey_(principal.username);
}

/** Checks that a principal can view a submission as owner or submitter. */
function pcCanViewSubmission_(submission, principal) {
  principal = principal || getCurrentPrincipal_();
  if (principal.roles.indexOf(PC_CONST.ROLES.OFFICER) !== -1 || principal.roles.indexOf(PC_CONST.ROLES.ADMIN) !== -1) return true;
  var email = pcKey_(principal.email);
  return (email && (email === pcKey_(submission.OwnerEmail) || email === pcKey_(submission.SubmittedByEmail))) || String(submission.SubmittedByUsername || '') === String(principal.username || '');
}

/** Checks whether the current principal may edit/submit a case; officer visibility alone never grants edit ownership. */
function pcCanEditSubmission_(submission, principal) {
  principal = principal || getCurrentPrincipal_();
  var email = pcKey_(principal.email);
  if (email && (email === pcKey_(submission.OwnerEmail) || email === pcKey_(submission.SubmittedByEmail))) return true;
  return String(submission.SubmittedByUsername || '') === String(principal.username || '');
}

/** Allows bootstrap/setup only from the effective deployment owner in editor/deployer context. */
function pcRequireTechnicalOwner_() {
  var active = '', effective = '';
  try { active = pcKey_(Session.getActiveUser().getEmail()); } catch (e) {}
  try { effective = pcKey_(Session.getEffectiveUser().getEmail()); } catch (e) {}
  if (!active || !effective || active !== effective) throw pcUserError_('ฟังก์ชันนี้อนุญาตเฉพาะผู้ดูแลทางเทคนิคของระบบ', 'TECHNICAL_OWNER_REQUIRED');
  return active;
}
