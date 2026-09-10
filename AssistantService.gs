/**
 * =========================================================================
 * AssistantService.gs — จุดเชื่อมต่อสาธารณะของโมดูลผู้ช่วย
 * =========================================================================
 * มี public endpoint เพียง 4 ตัว ยิ่งน้อยยิ่งควบคุมความเสี่ยงได้ง่าย
 * ทุกตัวผ่านลำดับการตรวจเดียวกัน:
 *   1) ตัวตนผู้ใช้ (ใช้ session เดิมของระบบ)
 *   2) สวิตช์เปิด/ปิดโมดูล + ขอบเขตผู้ใช้นำร่อง
 *   3) จำกัดอัตราการเรียก
 *   4) ความยาว/รูปแบบข้อความ
 *   5) สิทธิ์ระดับเจตนา และสิทธิ์ระดับข้อมูล
 * เซิร์ฟเวอร์คืนโครงสร้าง JSON เท่านั้น ไม่คืน HTML เด็ดขาด
 * =========================================================================
 */

/** อ่านคอนฟิกเฉพาะของผู้ช่วย โดยไม่แก้ตรรกะ getPrecheckConfig_() เดิม */
function asConfig_() {
  return pcMemo_('cfg:assistant', function() {
    var base = getPrecheckConfig_();
    return {
      enabled: pcBool_(pcConfig_('PC_ASSIST_ENABLED', 'false'), false),
      pilotEmails: pcList_(pcConfig_('PC_ASSIST_PILOT_EMAILS', '')).map(pcKey_),
      assistStatusScope: String(pcConfig_('PC_ASSIST_STATUS_SCOPE', 'ORG') || 'ORG').toUpperCase(),
      assistNameMatch: pcBool_(pcConfig_('PC_ASSIST_NAME_MATCH', 'true'), true),
      assistWorkloadFromYear: pcInt_(pcConfig_('PC_ASSIST_WORKLOAD_FROM_YEAR', '0'), 0, 0, 3000),
      assistContactText: String(pcConfig_('PC_ASSIST_CONTACT_TEXT', '') || '').trim(),
      ratePerMin: pcInt_(pcConfig_('PC_ASSIST_RATE_PER_MIN', '20'), 20, 1, 120),
      logRetentionDays: pcInt_(pcConfig_('PC_ASSIST_LOG_RETENTION_DAYS', '90'), 90, 1, 3650),
      maxFileMb: base.maxFileMb
    };
  });
}

/** ผู้ช่วยเปิดใช้งานสำหรับผู้ใช้คนนี้หรือไม่ */
function asAvailableFor_(principal, cfg) {
  cfg = cfg || asConfig_();
  if (!cfg.enabled) return false;
  if (!cfg.pilotEmails.length) return true;
  if (asIsOfficer_(principal) && principal.roles.indexOf(PC_CONST.ROLES.ADMIN) !== -1) return true;
  return cfg.pilotEmails.indexOf(pcKey_(principal && principal.email)) !== -1;
}

/**
 * จำกัดจำนวนคำถามต่อนาทีต่อผู้ใช้
 * เก็บเวลาเริ่มหน้าต่างไว้ด้วย เพราะ CacheService.put() รีเซ็ต TTL ทุกครั้งที่เขียน
 * ถ้านับอย่างเดียวโดยไม่ดูเวลา ผู้ใช้ที่ถามห่าง ๆ ต่อเนื่องจะถูกล็อกทั้งที่ไม่ได้ถามถี่
 */
function asRateLimit_(principal, cfg) {
  var cache = CacheService.getScriptCache();
  var key = AS_CONST.CACHE.RATE_PREFIX + hashString_(String(principal.username || principal.email || '')).substring(0, 24);
  var now = Date.now();
  var windowMs = AS_CONST.CACHE.RATE_SECONDS * 1000;
  var state = { n: 0, at: now };
  var raw = cache.get(key);
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && isFinite(parsed.at) && (now - parsed.at) < windowMs) state = { n: pcInt_(parsed.n, 0, 0, 10000), at: parsed.at };
    } catch (ignored) {}
  }
  if (state.n >= cfg.ratePerMin) {
    throw pcUserError_('ท่านถามถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง', 'ASSIST_RATE_LIMIT');
  }
  state.n++;
  try { cache.put(key, JSON.stringify(state), AS_CONST.CACHE.RATE_SECONDS * 2); } catch (ignored) {}
}

/**
 * จุดตรวจรวมก่อนตอบทุกคำถาม
 * skipRateLimit ใช้กับการให้คะแนนคำตอบ เพราะเป็นการตอบกลับของผู้ใช้ ไม่ใช่คำถามใหม่
 * จึงไม่ควรกินโควตาการถามของเขาเอง
 */
function asGuard_(action, skipRateLimit) {
  var principal = getCurrentPrincipal_();
  var cfg = asConfig_();
  if (!asAvailableFor_(principal, cfg)) {
    throw pcUserError_('ผู้ช่วยอัตโนมัติยังไม่เปิดใช้งานสำหรับบัญชีของท่าน', 'ASSIST_DISABLED');
  }
  if (skipRateLimit !== true) asRateLimit_(principal, cfg);
  return { principal: principal, cfg: cfg, action: action || '' };
}

/* =========================================================================
 * Public endpoints
 * ====================================================================== */

/** โหลดค่าตั้งต้นของหน้าต่างแชท เรียกครั้งแรกตอนผู้ใช้เปิดวิดเจ็ตเท่านั้น */
function assistantBootstrap() {
  try {
    var principal = getCurrentPrincipal_();
    var cfg = asConfig_();
    if (!asAvailableFor_(principal, cfg)) {
      return { enabled: false, message: 'ผู้ช่วยอัตโนมัติยังไม่เปิดใช้งานสำหรับบัญชีของท่าน' };
    }
    var chips = AS_DEFAULT_CHIPS.map(function(chip) { return { label: chip.label, intent: chip.intent }; });
    if (asIsOfficer_(principal)) chips.push({ label: 'ภาพรวมคิวตรวจ', intent: AS_CONST.INTENT.QUEUE_SUMMARY });
    return {
      enabled: true,
      version: AS_CONST.VERSION,
      displayName: String(principal.displayName || ''),
      isOfficer: asIsOfficer_(principal),
      greeting: 'สวัสดีครับ' + (principal.displayName ? ' คุณ' + principal.displayName : '') +
                ' ผมช่วยตรวจสอบสถานะเอกสารและขั้นตอนการใช้งานได้ ลองเลือกหัวข้อด้านล่างหรือพิมพ์คำถามได้เลยครับ',
      chips: chips,
      disclaimer: 'ผู้ช่วยตอบข้อมูลจากระบบเท่านั้น ไม่สามารถแก้ไขหรือส่งเอกสารแทนท่านได้'
    };
  } catch (error) {
    throw pcHandlePublicError_(error, 'assistantBootstrap', {});
  }
}

/** รับคำถามอิสระหนึ่งข้อความ */
function assistantAsk(message, context) {
  var started = Date.now();
  try {
    var guard = asGuard_('assistantAsk');
    var raw = String(message == null ? '' : message);
    if (!raw.trim()) throw pcUserError_('กรุณาพิมพ์คำถามก่อนครับ', 'ASSIST_EMPTY');
    if (raw.length > AS_CONST.LIMITS.MAX_MESSAGE_LENGTH) raw = raw.substring(0, AS_CONST.LIMITS.MAX_MESSAGE_LENGTH);

    var safeContext = asSafeContext_(context);
    var parsed = asClassify_(raw, safeContext, guard.principal);
    var answer = asBuildAnswer_(parsed.intent, parsed.documentNumber, guard.principal, guard.cfg, false);

    // ผู้ใช้เอ่ยชื่อคนอื่น เช่น "งานค้างของครูสมชาย" แต่ระบบตอบด้วยงานของผู้ถามเสมอ
    // ต้องบอกให้ชัด ไม่เช่นนั้นผู้ใช้จะเข้าใจว่ารายการที่เห็นเป็นของคนที่เอ่ยถึง
    if (parsed.mentionsOtherPerson && String(parsed.intent).indexOf('MY_') === 0) {
      answer.blocks = [asNote_('ผมแสดงได้เฉพาะเอกสารในความรับผิดชอบของท่านเองครับ ไม่สามารถดูรายการของผู้อื่นได้ หากต้องการตรวจสอบเอกสารของผู้อื่น กรุณาระบุเลขเอกสารแทน')]
        .concat(answer.blocks || []);
    }
    return asFinalizeReply_(parsed, answer, guard, raw, started);
  } catch (error) {
    throw pcHandlePublicError_(error, 'assistantAsk', {});
  }
}

/** ผู้ใช้กดปุ่มลัด ข้ามชั้นจำแนกเจตนาไปเรียกโดยตรง เร็วและแม่นกว่าการพิมพ์ */
function assistantQuickAction(intent, params) {
  var started = Date.now();
  try {
    var guard = asGuard_('assistantQuickAction');
    var wanted = String(intent || '').trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(AS_CONST.INTENT, wanted)) throw pcUserError_('ไม่พบคำสั่งที่ต้องการ', 'ASSIST_BAD_INTENT');
    if (AS_CONST.OFFICER_INTENTS.indexOf(wanted) !== -1 && !asIsOfficer_(guard.principal)) {
      throw pcUserError_('คุณไม่มีสิทธิ์ใช้งานส่วนนี้', 'FORBIDDEN');
    }

    params = params || {};
    var docNo = normalizeDocumentNumberForPrecheck_(params.documentNumber || '');
    if (docNo && !isValidDocumentNumberFormat_(docNo)) docNo = '';
    var refresh = pcBool_(params.refresh, false);
    if (refresh) asDropWorkloadCache_(guard.principal);

    var answer = asBuildAnswer_(wanted, docNo, guard.principal, guard.cfg, refresh, pcBool_(params.allYears, false));
    var parsed = { intent: wanted, confidence: 1, documentNumber: docNo, alternatives: [] };
    return asFinalizeReply_(parsed, answer, guard, '[ปุ่มลัด] ' + wanted + (docNo ? ' ' + docNo : ''), started);
  } catch (error) {
    throw pcHandlePublicError_(error, 'assistantQuickAction', {});
  }
}

/** บันทึกความเห็นของผู้ใช้ต่อคำตอบ เพื่อนำมาปรับปรุงคำตอบในภายหลัง */
function assistantFeedback(replyId, helpful) {
  try {
    var guard = asGuard_('assistantFeedback', true);
    var id = String(replyId || '').trim();
    if (!id) return { ok: false };
    var rows = pcFilterObjects_(AS_CONST.SHEETS.LOG, function(row) { return String(row.LogId) === id; });
    if (!rows.length) return { ok: false };
    if (String(rows[0].Username || '') !== String(guard.principal.username || '')) return { ok: false };
    pcPatchObject_(AS_CONST.SHEETS.LOG, rows[0]._rowNumber, { Helpful: pcBool_(helpful, false) ? 'TRUE' : 'FALSE' });
    return { ok: true };
  } catch (error) {
    console.error('ASSIST_FEEDBACK_FAILED ' + String(error && error.message || error));
    return { ok: false };
  }
}

/* =========================================================================
 * Answer composition
 * ====================================================================== */

/** รับ context จากฝั่งหน้าเว็บอย่างระมัดระวัง ใช้เติมช่องว่างเท่านั้น */
function asSafeContext_(context) {
  context = context || {};
  var docNo = normalizeDocumentNumberForPrecheck_(context.lastDocumentNumber || '');
  return { lastDocumentNumber: isValidDocumentNumberFormat_(docNo) ? docNo : '' };
}

/** ประกอบคำตอบตามเจตนา */
function asBuildAnswer_(intent, documentNumber, principal, cfg, refresh, allYears) {
  switch (intent) {
    case AS_CONST.INTENT.HOWTO_START:
    case AS_CONST.INTENT.HOWTO_REGISTER:
    case AS_CONST.INTENT.HOWTO_SUBMIT_REPORT:
    case AS_CONST.INTENT.HOWTO_NON_COMPLETED:
    case AS_CONST.INTENT.HOWTO_REVISION:
    case AS_CONST.INTENT.HOWTO_FILE_RULES:
    case AS_CONST.INTENT.HOWTO_CONTACT:
      return { blocks: asKnowledgeBlocks_(intent, cfg), chips: asDefaultChipSet_(principal), needs: null };

    case AS_CONST.INTENT.DOC_STATUS:
    case AS_CONST.INTENT.DOC_NEXT_ACTION:
      return asAnswerDocumentStatus_(documentNumber, principal, cfg);

    case AS_CONST.INTENT.DOC_FIX_LIST:
      return asAnswerFixList_(documentNumber, principal, cfg);

    case AS_CONST.INTENT.DOC_FINAL_LINK:
      return asAnswerFinalLink_(documentNumber, principal, cfg);

    case AS_CONST.INTENT.DOC_HISTORY:
      return asAnswerHistory_(documentNumber, principal, cfg);

    case AS_CONST.INTENT.MY_PENDING:
      return asAnswerMyPending_(principal, cfg, refresh, allYears);

    case AS_CONST.INTENT.MY_NEEDS_FIX:
      return asAnswerMyFiltered_(principal, cfg, refresh, ['REVISION_REQUIRED'], 'เอกสารที่ต้องแก้ไขและส่งใหม่', allYears);

    case AS_CONST.INTENT.MY_IN_REVIEW:
      return asAnswerMyFiltered_(principal, cfg, refresh, AS_STATUS_GROUP.WITH_OFFICER, 'เอกสารที่รอเจ้าหน้าที่ตรวจ', allYears);

    case AS_CONST.INTENT.MY_SUMMARY:
      return asAnswerMySummary_(principal, cfg, refresh, allYears);

    case AS_CONST.INTENT.QUEUE_SUMMARY:
      return asAnswerQueueSummary_(principal);

    case AS_CONST.INTENT.NEED_DOCUMENT_NUMBER:
      return asAnswerNeedDocumentNumber_(principal, cfg);

    default:
      return { blocks: asUnknownBlocks_(cfg), chips: asDefaultChipSet_(principal), needs: null };
  }
}

/** ปุ่มลัดมาตรฐานท้ายคำตอบ */
function asDefaultChipSet_(principal) {
  var chips = [
    { label: 'เอกสารค้างส่งของฉัน', intent: AS_CONST.INTENT.MY_PENDING },
    { label: 'ตรวจสอบสถานะเอกสาร', intent: AS_CONST.INTENT.NEED_DOCUMENT_NUMBER }
  ];
  if (asIsOfficer_(principal)) chips.push({ label: 'ภาพรวมคิวตรวจ', intent: AS_CONST.INTENT.QUEUE_SUMMARY });
  return chips;
}

/** คำตอบ: สถานะและขั้นตอนถัดไปของเอกสารหนึ่งฉบับ */
function asAnswerDocumentStatus_(documentNumber, principal, cfg) {
  var state = asDocumentState_(principal, documentNumber);
  if (!state.found || !asCanSeeStatus_(principal, state, cfg)) return asAnswerDocumentNotFound_(documentNumber, principal);

  var info = asStatusInfo_(state.statusCode);
  var master = state.master;
  var submission = state.submission;

  var blocks = [
    asText_('เอกสาร ' + master.documentNumber + (master.documentName ? ' — ' + master.documentName : '')),
    asStatusBlock_(state.statusCode),
    asKeyValues_([
      ['กลุ่มบริหาร', master.adminGroup],
      ['กลุ่มงาน', master.workGroup],
      ['ผู้รับผิดชอบ', master.responsiblePerson],
      ['ฉบับปัจจุบัน', submission && Number(submission.CurrentVersion || 0) ? 'V' + Number(submission.CurrentVersion) : ''],
      ['ส่งตรวจล่าสุด', submission ? asThaiDateTime_(submission.LastSubmittedAt) : '']
    ]),
    asText_(info.next)
  ];

  if (state.statusCode === PC_CONST.STATUS.REVISION_REQUIRED && state.canViewDetail) {
    var fixes = asFixItems_(submission);
    if (fixes.length) blocks.push(asNote_('เจ้าหน้าที่ระบุรายการที่ต้องแก้ไขไว้ ' + fixes.length + ' รายการ'));
  }

  blocks.push.apply(blocks, asActionBlocksFor_(state, info));
  blocks.push(asNote_('ข้อมูล ณ ' + asThaiDateTime_(pcNowIso_())));

  var chips = [];
  if (state.statusCode === AS_CONST.SYNTHETIC.NAME_NOT_SUPPORTED) {
    chips.push({ label: 'ติดต่อเจ้าหน้าที่', intent: AS_CONST.INTENT.HOWTO_CONTACT });
  }
  if (state.statusCode === PC_CONST.STATUS.REVISION_REQUIRED && state.canViewDetail) {
    chips.push({ label: 'ต้องแก้อะไรบ้าง', intent: AS_CONST.INTENT.DOC_FIX_LIST, params: { documentNumber: master.documentNumber } });
  }
  if (asStatusGroup_(state.statusCode) === 'CLOSED' && master.finalLink) {
    chips.push({ label: 'ขอไฟล์ฉบับสมบูรณ์', intent: AS_CONST.INTENT.DOC_FINAL_LINK, params: { documentNumber: master.documentNumber } });
  }
  chips.push({ label: 'เอกสารค้างส่งของฉัน', intent: AS_CONST.INTENT.MY_PENDING });

  return { blocks: blocks, chips: chips, needs: null, documentNumber: master.documentNumber };
}

/** สร้างปุ่มพาไปหน้าที่เกี่ยวข้องตามสถานะ */
function asActionBlocksFor_(state, info) {
  if (!info || !info.action) return [];
  var action = info.action;
  if (action.page === 'PrecheckDetail') {
    if (!state.submission || !state.canViewDetail) return [];
    return [asAction_(action.label, 'PrecheckDetail', { submission: String(state.submission.SubmissionId || '') })];
  }
  if (action.page === 'SubmitDocument') {
    return [asAction_(action.label, 'SubmitDocument', { document: state.master.documentNumber })];
  }
  return [asAction_(action.label, action.page, {})];
}

/** ข้อความเดียวกันทั้งกรณีไม่พบและกรณีไม่มีสิทธิ์ เพื่อไม่ให้สุ่มเลขเอกสารหาข้อมูลได้ */
function asAnswerDocumentNotFound_(documentNumber, principal) {
  return {
    blocks: [
      asText_('ไม่พบข้อมูลเอกสาร' + (documentNumber ? ' ' + documentNumber : '') + ' ที่ท่านสอบถามครับ'),
      asBullets_([
        'ตรวจสอบว่าเลขเอกสารถูกต้อง เช่น บง 123/2569',
        'หากยังไม่เคยขึ้นทะเบียน ให้ขอเลขทะเบียนเอกสารก่อน'
      ]),
      asAction_('ไปหน้าหลักเพื่อขอเลขทะเบียน', 'Index', {})
    ],
    chips: asDefaultChipSet_(principal),
    needs: null
  };
}

/** คำตอบ: รายการที่ต้องแก้ไข */
function asAnswerFixList_(documentNumber, principal, cfg) {
  var state = asDocumentState_(principal, documentNumber);
  if (!state.found || !asCanSeeStatus_(principal, state, cfg)) return asAnswerDocumentNotFound_(documentNumber, principal);
  if (!state.submission || !state.canViewDetail) {
    return {
      blocks: [asText_('ผลการตรวจเป็นข้อมูลเฉพาะเจ้าของเรื่องและเจ้าหน้าที่ จึงไม่สามารถแสดงให้ได้ครับ'),
               asNote_('หากเอกสารนี้เป็นของท่าน กรุณาเข้าสู่ระบบด้วยบัญชีที่ระบุไว้ในทะเบียนเอกสาร')],
      chips: asDefaultChipSet_(principal), needs: null
    };
  }

  var fixes = asFixItems_(state.submission);
  if (!fixes.length) {
    return {
      blocks: [asText_('เอกสาร ' + state.master.documentNumber + ' ยังไม่มีรายการที่ต้องแก้ไขจากการตรวจครับ'),
               asStatusBlock_(state.statusCode), asText_(asStatusInfo_(state.statusCode).next)],
      chips: asDefaultChipSet_(principal), needs: null, documentNumber: state.master.documentNumber
    };
  }

  var shown = fixes.slice(0, AS_CONST.LIMITS.MAX_LIST_ITEMS);
  var blocks = [
    asText_('เอกสาร ' + state.master.documentNumber + ' มีรายการที่ต้องแก้ไข ' + fixes.length + ' รายการ'),
    asList_('รายการที่ต้องแก้ไข', shown.map(function(f) {
      return { title: f.title, subtitle: f.detail, badge: f.page ? ('หน้า ' + f.page) : '' };
    }))
  ];
  if (fixes.length > shown.length) blocks.push(asNote_('แสดง ' + shown.length + ' จาก ' + fixes.length + ' รายการ กรุณาเปิดหน้ารายละเอียดเพื่อดูทั้งหมด'));
  blocks.push(asAction_('เปิดหน้ารายละเอียด', 'PrecheckDetail', { submission: String(state.submission.SubmissionId || '') }));
  blocks.push(asAction_('ส่งฉบับแก้ไข', 'SubmitDocument', { document: state.master.documentNumber }));
  blocks.push(asNote_('ข้อมูล ณ ' + asThaiDateTime_(pcNowIso_())));

  return { blocks: blocks, chips: asDefaultChipSet_(principal), needs: null, documentNumber: state.master.documentNumber };
}

/** คำตอบ: ไฟล์ฉบับสมบูรณ์ */
function asAnswerFinalLink_(documentNumber, principal, cfg) {
  var state = asDocumentState_(principal, documentNumber);
  if (!state.found || !asCanSeeStatus_(principal, state, cfg)) return asAnswerDocumentNotFound_(documentNumber, principal);

  var url = String(state.master.finalLink || '');
  if (!url && state.submission) url = String(state.submission.FinalFileUrl || '');
  if (!url) {
    return {
      blocks: [asText_('เอกสาร ' + state.master.documentNumber + ' ยังไม่มีไฟล์ฉบับสมบูรณ์ในระบบครับ'),
               asStatusBlock_(state.statusCode), asText_(asStatusInfo_(state.statusCode).next)],
      chips: asDefaultChipSet_(principal), needs: null, documentNumber: state.master.documentNumber
    };
  }
  return {
    blocks: [asText_('เอกสาร ' + state.master.documentNumber + ' มีไฟล์ฉบับสมบูรณ์แล้วครับ'),
             asLink_('เปิดไฟล์ฉบับสมบูรณ์', url),
             asNote_('ข้อมูล ณ ' + asThaiDateTime_(pcNowIso_()))],
    chips: asDefaultChipSet_(principal), needs: null, documentNumber: state.master.documentNumber
  };
}

/** คำตอบ: ประวัติการส่ง */
function asAnswerHistory_(documentNumber, principal, cfg) {
  var state = asDocumentState_(principal, documentNumber);
  if (!state.found || !asCanSeeStatus_(principal, state, cfg)) return asAnswerDocumentNotFound_(documentNumber, principal);
  if (!state.submission || !state.canViewDetail) {
    return {
      blocks: [asText_('ประวัติการส่งเป็นข้อมูลเฉพาะเจ้าของเรื่องและเจ้าหน้าที่ครับ')],
      chips: asDefaultChipSet_(principal), needs: null
    };
  }
  var versions = pcVersionsForSubmission_(state.submission.SubmissionId);
  var blocks = [
    asText_('เอกสาร ' + state.master.documentNumber + ' ส่งเข้าระบบแล้ว ' + versions.length + ' ฉบับ'),
    asList_('ประวัติการส่ง', versions.slice(-AS_CONST.LIMITS.MAX_LIST_ITEMS).map(function(v) {
      return { title: 'ฉบับที่ V' + String(v.VersionNo || ''), subtitle: asThaiDateTime_(v.UploadedAt), badge: '' };
    })),
    asAction_('เปิดหน้ารายละเอียด', 'PrecheckDetail', { submission: String(state.submission.SubmissionId || '') })
  ];
  return { blocks: blocks, chips: asDefaultChipSet_(principal), needs: null, documentNumber: state.master.documentNumber };
}

/** คำตอบ: เอกสารค้างส่งของฉัน */
function asAnswerMyPending_(principal, cfg, refresh, allYears) {
  var work = asMyWorkload_(principal, cfg, refresh === true, allYears === true);
  if (!work.openCount) {
    var emptyBlocks = [asText_(work.filteredByYear
      ? ('ไม่พบเอกสารค้างของปี ' + work.fromYear + ' เป็นต้นไปในความรับผิดชอบของท่านครับ')
      : 'ไม่พบเอกสารค้างในความรับผิดชอบของท่านครับ')];
    emptyBlocks.push.apply(emptyBlocks, asOlderBacklogBlocks_(work));
    emptyBlocks.push(asNote_(asWorkloadFootnote_(work)));
    var emptyChips = [];
    if (work.filteredByYear) emptyChips.push({ label: 'ดูงานค้างปีก่อนหน้า', intent: AS_CONST.INTENT.MY_PENDING, params: { allYears: true } });
    emptyChips.push({ label: 'สรุปงานของฉัน', intent: AS_CONST.INTENT.MY_SUMMARY });
    emptyChips.push({ label: 'ตรวจสอบสถานะเอกสาร', intent: AS_CONST.INTENT.NEED_DOCUMENT_NUMBER });
    return { blocks: emptyBlocks, chips: emptyChips, needs: null };
  }

  var blocks = [asText_('พบเอกสารที่ยังไม่เสร็จสมบูรณ์ในความรับผิดชอบของท่าน ' + work.openCount + ' ฉบับ')];
  var counts = work.counts || {};
  blocks.push.apply(blocks, asWorkloadGroupBlocks_(work.notStarted, 'ยังไม่เริ่มดำเนินการ', counts.notStarted));
  blocks.push.apply(blocks, asWorkloadGroupBlocks_(work.withYou, 'ค้างที่ท่าน', counts.withYou));
  blocks.push.apply(blocks, asWorkloadGroupBlocks_(work.blocked, 'ต้องแก้ชื่อในทะเบียนก่อน', counts.blocked));
  if ((counts.blocked || 0) > 0) {
    blocks.push(asNote_('เอกสารกลุ่มนี้ส่งเข้าระบบไม่ได้จนกว่าชื่อในทะเบียนจะถูกแก้ให้ขึ้นต้นด้วยรูปแบบที่ระบบรองรับ กรุณาแจ้งเจ้าหน้าที่งานแผนงานและสารสนเทศ'));
  }
  blocks.push.apply(blocks, asWorkloadGroupBlocks_(work.withOfficer, 'รอเจ้าหน้าที่ตรวจ', counts.withOfficer));
  blocks.push.apply(blocks, asWorkloadGroupBlocks_(work.inSystem, 'ระบบกำลังดำเนินการ', counts.inSystem));
  blocks.push.apply(blocks, asOlderBacklogBlocks_(work));
  blocks.push(asNote_(asWorkloadFootnote_(work)));

  var chips = [
    { label: 'รีเฟรชข้อมูล', intent: AS_CONST.INTENT.MY_PENDING, params: { refresh: true } },
    { label: 'เฉพาะที่ต้องแก้ไข', intent: AS_CONST.INTENT.MY_NEEDS_FIX }
  ];
  if (work.filteredByYear) chips.push({ label: 'ดูงานค้างปีก่อนหน้า', intent: AS_CONST.INTENT.MY_PENDING, params: { allYears: true } });
  else chips.push({ label: 'ส่งเอกสาร', intent: AS_CONST.INTENT.HOWTO_SUBMIT_REPORT });

  return { blocks: blocks, chips: chips, needs: null };
}

/** คำตอบ: รายการของฉันที่กรองตามสถานะ */
function asAnswerMyFiltered_(principal, cfg, refresh, statuses, title, allYears) {
  var work = asMyWorkload_(principal, cfg, refresh === true, allYears === true);
  var pool = [].concat(work.notStarted, work.withYou, work.blocked, work.withOfficer, work.inSystem);
  var items = pool.filter(function(item) { return statuses.indexOf(item.statusCode) !== -1; });

  if (!items.length) {
    return {
      blocks: [asText_('ไม่พบ' + title + 'ในความรับผิดชอบของท่านครับ'), asNote_(asWorkloadFootnote_(work))],
      chips: asDefaultChipSet_(principal), needs: null
    };
  }
  var blocks = [asText_('พบ' + title + ' ' + items.length + ' ฉบับ')];
  blocks.push.apply(blocks, asWorkloadGroupBlocks_(items, title));
  blocks.push(asNote_(asWorkloadFootnote_(work)));
  return { blocks: blocks, chips: asDefaultChipSet_(principal), needs: null };
}

/** คำตอบ: สรุปภาพรวมงานของฉัน */
function asAnswerMySummary_(principal, cfg, refresh, allYears) {
  var work = asMyWorkload_(principal, cfg, refresh === true, allYears === true);
  return {
    blocks: [
      asText_('สรุปเอกสารในความรับผิดชอบของท่าน'),
      asKeyValues_([
        ['เอกสารทั้งหมด', String(work.total)],
        ['เสร็จสมบูรณ์แล้ว', String(work.closed)],
        ['ยังไม่เริ่มดำเนินการ', String((work.counts || {}).notStarted || 0)],
        ['ค้างที่ท่าน', String((work.counts || {}).withYou || 0)],
        ['ต้องแก้ชื่อในทะเบียนก่อน', String((work.counts || {}).blocked || 0)],
        ['รอเจ้าหน้าที่ตรวจ', String((work.counts || {}).withOfficer || 0)],
        ['ค้างจากปีก่อนหน้า (ไม่แสดงในรายการ)', work.filteredByYear ? String(work.filteredByYear) : '']
      ]),
      asNote_(asWorkloadFootnote_(work))
    ],
    chips: asOlderBacklogChips_(work, principal),
    needs: null
  };
}

/** คำตอบ: ภาพรวมคิวตรวจ (เฉพาะเจ้าหน้าที่) */
function asAnswerQueueSummary_(principal) {
  var kpi = asOfficerKpi_();
  return {
    blocks: [
      asText_('ภาพรวมคิวตรวจรายงาน Pre-check'),
      asKeyValues_([
        ['รอตรวจ (ฉบับแรก)', String(kpi.waiting)],
        ['กำลังตรวจ', String(kpi.inReview)],
        ['รอตรวจ (ฉบับแก้ไข)', String(kpi.revisedWaiting)],
        ['ส่งกลับให้แก้ไข', String(kpi.revisionRequired)],
        ['ผ่านและบันทึกแล้ว', String(kpi.committed)]
      ]),
      asAction_('เปิดหน้าคิวตรวจ', 'PrecheckOfficer', {}),
      asNote_('ข้อมูล ณ ' + asThaiDateTime_(pcNowIso_()))
    ],
    chips: asDefaultChipSet_(principal),
    needs: null
  };
}

/** คำตอบ: ขอเลขเอกสารเพิ่มเติม พร้อมเสนอเอกสารของผู้ใช้เองให้กดเลือก */
function asAnswerNeedDocumentNumber_(principal, cfg) {
  var work = asMyWorkload_(principal, cfg, false);
  var candidates = [].concat(work.withYou, work.notStarted, work.withOfficer).slice(0, AS_CONST.LIMITS.MAX_LIST_ITEMS);
  var chips = candidates.map(function(item) {
    return { label: item.documentNumber, intent: AS_CONST.INTENT.DOC_STATUS, params: { documentNumber: item.documentNumber } };
  });
  chips.push({ label: 'เอกสารค้างส่งของฉัน', intent: AS_CONST.INTENT.MY_PENDING });

  return {
    blocks: [
      asText_('กรุณาระบุเลขเอกสารที่ต้องการตรวจสอบครับ เช่น บง 123/2569'),
      candidates.length ? asNote_('หรือเลือกจากเอกสารของท่านด้านล่างได้เลย') : asNote_('ท่านสามารถดูเลขเอกสารได้จากตารางในหน้าหลัก')
    ],
    chips: chips,
    needs: { type: 'documentNumber', prompt: 'พิมพ์เลขเอกสาร เช่น บง 123/2569' }
  };
}

/* =========================================================================
 * Helpers
 * ====================================================================== */

/**
 * แปลงรายการงานเป็นบล็อกรายการ พร้อมปุ่มพาไปทำต่อ
 * totalCount คือจำนวนจริงในกลุ่มนั้น ซึ่งอาจมากกว่ารายการที่เก็บไว้ในแคช
 * ต้องแสดงจำนวนจริงเสมอ เพื่อไม่ให้ผู้ใช้เข้าใจว่ามีงานค้างน้อยกว่าความเป็นจริง
 */
function asWorkloadGroupBlocks_(items, title, totalCount) {
  if (!items || !items.length) return [];
  var total = (typeof totalCount === 'number' && totalCount >= items.length) ? totalCount : items.length;
  var shown = items.slice(0, AS_CONST.LIMITS.MAX_LIST_ITEMS);
  var blocks = [asList_(title + ' (' + total + ')', shown.map(function(item) {
    // เอกสารที่ชื่อไม่อยู่ในรูปแบบที่รองรับ ต้องไม่มีปุ่มพาไปหน้าส่งเอกสาร
    // เพราะ lookupDocument() จะปฏิเสธ ผู้ใช้จะเจอทางตันและเสียความเชื่อมั่น
    var blocked = item.statusCode === AS_CONST.SYNTHETIC.NAME_NOT_SUPPORTED;
    var target = item.submissionId
      ? { page: 'PrecheckDetail', params: { submission: item.submissionId } }
      : { page: 'SubmitDocument', params: { document: item.documentNumber } };
    return {
      title: item.documentNumber,
      subtitle: item.documentName,
      badge: item.statusLabel,
      note: item.matchSource === 'NAME' ? 'จับคู่จากชื่อผู้รับผิดชอบ' : '',
      action: blocked ? null : { label: item.submissionId ? 'ดูรายละเอียด' : 'เริ่มทำรายการ', page: target.page, params: target.params }
    };
  }))];
  if (total > shown.length) {
    blocks.push(asNote_('แสดง ' + shown.length + ' จาก ' + total + ' ฉบับ'));
    blocks.push(asAction_('ดูทั้งหมดในหน้ารายการเอกสารของฉัน', 'MyDocuments', {}));
  }
  return blocks;
}

/**
 * แจ้งงานค้างของปีก่อนหน้าที่ถูกกรองออกจากรายการหลัก
 * หลักการ: ซ่อนจากรายการได้ แต่ห้ามทำให้ผู้ใช้เข้าใจว่าไม่มีอะไรค้างเลย
 * การให้ความอุ่นใจที่ผิดร้ายแรงกว่าการแสดงรายการยาว
 */
function asOlderBacklogBlocks_(work) {
  if (!work || !work.filteredByYear) return [];
  var text = 'นอกจากนี้ยังมีเอกสารค้างของปีก่อน ' + work.fromYear + ' อีก ' + work.filteredByYear + ' ฉบับ';
  if (work.filteredBlocked) {
    text += ' ซึ่ง ' + work.filteredBlocked + ' ฉบับติดเรื่องรูปแบบชื่อเอกสารในทะเบียน จึงยังส่งเข้าระบบไม่ได้';
  }
  return [asNote_(text)];
}

/** ปุ่มลัดที่เพิ่มทางเลือกดูงานค้างปีเก่าเมื่อมีของถูกกรองไว้ */
function asOlderBacklogChips_(work, principal) {
  var chips = [{ label: 'ดูรายการค้างส่ง', intent: AS_CONST.INTENT.MY_PENDING }];
  if (work && work.filteredByYear) {
    chips.push({ label: 'ดูงานค้างปีก่อนหน้า', intent: AS_CONST.INTENT.MY_PENDING, params: { allYears: true } });
  } else {
    chips.push({ label: 'เฉพาะที่ต้องแก้ไข', intent: AS_CONST.INTENT.MY_NEEDS_FIX });
  }
  if (asIsOfficer_(principal)) chips.push({ label: 'ภาพรวมคิวตรวจ', intent: AS_CONST.INTENT.QUEUE_SUMMARY });
  return chips;
}

/** ข้อความกำกับท้ายรายการ เพื่อไม่ให้ผู้ใช้เข้าใจผิดว่ารายการครบถ้วนแน่นอน */
function asWorkloadFootnote_(work) {
  var parts = ['แสดงเฉพาะเอกสารที่ระบุอีเมลหรือชื่อของท่านไว้ในทะเบียน'];
  if (work.matchedByName) parts.push('มี ' + work.matchedByName + ' ฉบับที่จับคู่จากชื่อผู้รับผิดชอบ หากไม่ใช่ของท่านโปรดแจ้งเจ้าหน้าที่');
  if (work.fromYear) parts.push('แสดงเฉพาะเอกสารปี ' + work.fromYear + ' เป็นต้นไป');
  if (work.truncated) parts.push('รายการมีจำนวนมาก จึงแสดงบางส่วน กรุณาดูทั้งหมดที่เมนูรายการเอกสารของฉัน');
  parts.push('ข้อมูล ณ ' + asThaiDateTime_(work.generatedAt));
  return parts.join(' · ');
}

/** จัดรูปแบบวันเวลาไทยแบบสั้น */
function asThaiDateTime_(iso) {
  if (!iso) return '';
  var date = new Date(iso);
  if (!isFinite(date.getTime())) return '';
  var months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var text = Utilities.formatDate(date, PC_CONST.TIMEZONE, 'd|M|yyyy|HH:mm').split('|');
  return text[0] + ' ' + months[Number(text[1]) - 1] + ' ' + (Number(text[2]) + 543) + ' ' + text[3] + ' น.';
}

/** บล็อกลิงก์ภายนอก (ใช้กับไฟล์ใน Drive เท่านั้น) */
function asLink_(label, url) {
  return { type: 'link', label: String(label || ''), url: String(url || '') };
}

/** ประกอบผลลัพธ์สุดท้าย บันทึก log แล้วคืนให้หน้าเว็บ */
function asFinalizeReply_(parsed, answer, guard, rawMessage, startedAt) {
  var replyId = 'R-' + pcUuid_().replace(/-/g, '').substring(0, 16).toUpperCase();
  var tookMs = Date.now() - startedAt;
  var matched = parsed.intent !== AS_CONST.INTENT.UNKNOWN;

  asWriteLog_({
    LogId: replyId,
    Username: guard.principal.username,
    RawMessage: rawMessage,
    Intent: parsed.intent,
    Confidence: parsed.confidence,
    Matched: matched ? 'TRUE' : 'FALSE',
    EntitiesJSON: JSON.stringify({ documentNumber: parsed.documentNumber || '' }),
    TookMs: tookMs
  });

  // บันทึก audit เฉพาะคำถามที่เข้าถึงข้อมูลเอกสารจริง
  // คำถามเชิงวิธีใช้ไม่แตะข้อมูลใคร จึงไม่จำเป็นต้องมีร่องรอย และการเขียนทุกครั้ง
  // จะทำให้ PC_Audit บวมจนกระทบ pcFilterObjects_(PC_Audit) ที่ระบบแจ้งเตือนเดิมใช้อยู่
  if (parsed.intent.indexOf('DOC_') === 0 || parsed.intent.indexOf('MY_') === 0 || parsed.intent === AS_CONST.INTENT.QUEUE_SUMMARY) {
    try {
      pcAudit_('ASSISTANT_QUERY', {}, guard.principal, {
        intent: parsed.intent, matched: matched, documentNumber: parsed.documentNumber || '', tookMs: tookMs
      });
    } catch (ignored) {}
  }

  return {
    ok: true,
    replyId: replyId,
    intent: parsed.intent,
    confidence: parsed.confidence,
    blocks: answer.blocks || [],
    chips: answer.chips || [],
    needs: answer.needs || null,
    documentNumber: answer.documentNumber || parsed.documentNumber || '',
    meta: { tookMs: tookMs, source: 'RULE' }
  };
}

/** บันทึกคำถามลงชีตของผู้ช่วยเอง ความล้มเหลวต้องไม่ทำให้คำตอบล้มเหลว */
function asWriteLog_(entry) {
  try {
    if (!getPrecheckConfig_().dbId) return;
    pcAppendObject_(AS_CONST.SHEETS.LOG, {
      LogId: entry.LogId,
      Timestamp: pcNowIso_(),
      Username: entry.Username || '',
      RawMessage: String(entry.RawMessage || '').substring(0, AS_CONST.LIMITS.MAX_MESSAGE_LENGTH),
      Intent: entry.Intent || '',
      Confidence: entry.Confidence || 0,
      Matched: entry.Matched || 'FALSE',
      EntitiesJSON: entry.EntitiesJSON || '{}',
      TookMs: entry.TookMs || 0,
      Helpful: ''
    });
  } catch (error) {
    console.error('ASSIST_LOG_WRITE_FAILED ' + String(error && error.message || error));
  }
}
