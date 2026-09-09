/**
 * =========================================================================
 * AssistantSetup.gs — ติดตั้ง ตรวจสอบ และดูแลรักษาโมดูลผู้ช่วย
 * =========================================================================
 * ฟังก์ชันในไฟล์นี้ใช้จาก Apps Script Editor เท่านั้น
 * ไม่มี public endpoint และจำกัดสิทธิ์เฉพาะผู้ดูแลทางเทคนิค
 * =========================================================================
 */

/**
 * ตรวจความพร้อมของโมดูลผู้ช่วยหลังติดตั้ง
 * ไม่แก้ไขข้อมูลใด ๆ เป็นการอ่านและรายงานผลเท่านั้น
 */
function verifyAssistantInstallation() {
  pcRequireTechnicalOwner_();
  var checks = [];
  function check(name, fn) {
    try { var detail = fn(); checks.push({ name: name, ok: true, detail: detail || '' }); }
    catch (e) { checks.push({ name: name, ok: false, detail: String(e && e.message || e) }); }
  }

  check('ชีต PC_AssistantLog อยู่ใน PC_HEADERS', function() {
    if (!PC_HEADERS[AS_CONST.SHEETS.LOG]) throw new Error('ยังไม่ได้เพิ่ม key PC_AssistantLog ใน PC_HEADERS');
    var keys = Object.keys(PC_HEADERS);
    if (keys[keys.length - 1] !== AS_CONST.SHEETS.LOG) {
      throw new Error('PC_AssistantLog ต้องอยู่ท้ายสุดของ PC_HEADERS เท่านั้น (ปัจจุบันอยู่ลำดับ ' + (keys.indexOf(AS_CONST.SHEETS.LOG) + 1) + '/' + keys.length + ')');
    }
    return keys.length + ' ชีตในสัญญา schema';
  });

  check('ชีต PC_AssistantLog ถูกสร้างแล้วและ header ตรง', function() {
    if (!getPrecheckConfig_().dbId) throw new Error('ยังไม่ได้ตั้งค่า PC_DB_ID');
    var sheet = pcOpenValidatedSheet_(AS_CONST.SHEETS.LOG);
    return 'พบ ' + Math.max(0, sheet.getLastRow() - 1) + ' รายการ';
  });

  check('หน้า Index แทรกวิดเจ็ตผู้ช่วยแล้ว', function() {
    var index = HtmlService.createHtmlOutputFromFile('Index').getContent();
    if (index.indexOf("include_('AssistantWidget')") === -1) {
      throw new Error('ยังไม่ได้แทรก include_(\'AssistantWidget\') ก่อน </body> ของ Index.html');
    }
    if (index.indexOf('pcwSetAvailable') === -1) {
      throw new Error('ยังไม่ได้เรียก pcwSetAvailable() ใน loadNavigationContext() ของ Index.html');
    }
    var widget = HtmlService.createHtmlOutputFromFile('AssistantWidget').getContent();
    if (widget.indexOf('pcAssistantWidget') === -1) throw new Error('ไฟล์ AssistantWidget.html ไม่สมบูรณ์');
    if (widget.indexOf('position: fixed') === -1) throw new Error('element รากของวิดเจ็ตต้องเป็น position:fixed');
    return 'พบ include, การเรียก pcwSetAvailable และไฟล์วิดเจ็ตครบ';
  });

  check('คอนฟิกผู้ช่วยอ่านได้', function() {
    var cfg = asConfig_();
    return 'enabled=' + cfg.enabled + ' scope=' + cfg.assistStatusScope +
           ' rate=' + cfg.ratePerMin + '/นาที nameMatch=' + cfg.assistNameMatch +
           ' pilot=' + (cfg.pilotEmails.length || 'ทั้งหมด');
  });

  check('คอนฟิกผู้ช่วยอยู่ใน whitelist ของ Settings Sheet', function() {
    var source = String(pcReadPrecheckConfigFromSettingsSheet_.toString());
    var required = ['PC_ASSIST_ENABLED','PC_ASSIST_PILOT_EMAILS','PC_ASSIST_STATUS_SCOPE','PC_ASSIST_NAME_MATCH','PC_ASSIST_CONTACT_TEXT','PC_ASSIST_RATE_PER_MIN','PC_ASSIST_LOG_RETENTION_DAYS'];
    var missing = required.filter(function(k) { return source.indexOf(k) === -1; });
    if (missing.length) throw new Error('ยังไม่ได้เพิ่มใน whitelist: ' + missing.join(', '));
    return 'ครบ ' + required.length + ' คีย์';
  });

  check('ตัวจำแนกเจตนาทำงาน', function() {
    var samples = [
      ['เริ่มต้นใช้งานระบบต้องทำอะไรก่อน', 'HOWTO_START'],
      ['บง 123/2569 อยู่ขั้นตอนไหน', 'DOC_STATUS'],
      ['เอกสารค้างส่งของฉันมีอะไรบ้าง', 'MY_PENDING']
    ];
    var failed = [];
    samples.forEach(function(s) {
      var r = asClassify_(s[0], {}, { roles: [PC_CONST.ROLES.USER] });
      if (r.intent !== s[1]) failed.push(s[0] + ' -> ' + r.intent);
    });
    if (failed.length) throw new Error('จับเจตนาผิด: ' + failed.join(' | '));
    return 'ผ่าน ' + samples.length + ' ตัวอย่าง';
  });

  check('พจนานุกรมสถานะครอบคลุมทุกสถานะของระบบ', function() {
    var missing = Object.keys(PC_CONST.STATUS).filter(function(k) { return !AS_STATUS_MAP[PC_CONST.STATUS[k]]; });
    if (missing.length) throw new Error('ยังไม่มีคำอธิบายไทยของสถานะ: ' + missing.join(', '));
    return 'ครบ ' + Object.keys(PC_CONST.STATUS).length + ' สถานะ';
  });

  var failedCount = checks.filter(function(c) { return !c.ok; }).length;
  var report = ['===== ผลตรวจการติดตั้งโมดูลผู้ช่วย v' + AS_CONST.VERSION + ' ====='];
  checks.forEach(function(c) { report.push((c.ok ? '  OK   ' : '  FAIL ') + c.name + (c.detail ? '  — ' + c.detail : '')); });
  report.push('สรุป: ผ่าน ' + (checks.length - failedCount) + '/' + checks.length + ' รายการ');
  var text = report.join('\n');
  console.log(text);
  return { success: failedCount === 0, failedCount: failedCount, checks: checks, report: text };
}

/**
 * ลบบันทึกคำถามที่เกินอายุการเก็บรักษา
 * ตั้งเป็น time-driven trigger รายสัปดาห์ได้ตามความเหมาะสม
 * แตะเฉพาะชีต PC_AssistantLog ของโมดูลนี้เท่านั้น
 */
function purgeAssistantLogs() {
  pcRequireTechnicalOwner_();
  var cfg = asConfig_();
  if (!getPrecheckConfig_().dbId) return { removed: 0, reason: 'PC_DB_ID ยังไม่ได้ตั้งค่า' };

  return pcWithScriptLock_(function() {
    var sheet = pcOpenValidatedSheet_(AS_CONST.SHEETS.LOG);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { removed: 0 };

    var headers = PC_HEADERS[AS_CONST.SHEETS.LOG];
    var cutoff = Date.now() - (cfg.logRetentionDays * 86400000);
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

    // เขียนทับด้วยแถวที่เก็บไว้ในครั้งเดียว แล้วลบส่วนท้ายทีเดียว
    // เร็วกว่าการเรียก deleteRow ทีละแถวมาก และไม่เสี่ยงชนเพดานเวลา 6 นาที
    var keep = values.filter(function(row) {
      var t = new Date(row[1]).getTime();
      return !isFinite(t) || t >= cutoff;
    });
    var removed = values.length - keep.length;
    if (!removed) return { removed: 0, retentionDays: cfg.logRetentionDays };

    if (keep.length) sheet.getRange(2, 1, keep.length, headers.length).setValues(keep);
    var tailStart = 2 + keep.length;
    var tailCount = lastRow - tailStart + 1;
    if (tailCount > 0) {
      if (typeof sheet.deleteRows === 'function') sheet.deleteRows(tailStart, tailCount);
      else for (var i = 0; i < tailCount; i++) sheet.deleteRow(tailStart);
    }

    pcInvalidateRows_(AS_CONST.SHEETS.LOG);
    console.log('purgeAssistantLogs: ลบ ' + removed + ' รายการที่เก่ากว่า ' + cfg.logRetentionDays + ' วัน');
    return { removed: removed, retentionDays: cfg.logRetentionDays };
  }, 30000);
}

/**
 * รายงานคำถามที่ผู้ช่วยตอบไม่ได้ ใช้ทบทวนรายสัปดาห์เพื่อเพิ่มคำสำคัญ
 * เป็นการอ่านอย่างเดียว
 */
function reportAssistantUnmatched() {
  pcRequireTechnicalOwner_();
  if (!getPrecheckConfig_().dbId) return 'PC_DB_ID ยังไม่ได้ตั้งค่า';

  var rows = pcListObjects_(AS_CONST.SHEETS.LOG);
  var unmatched = rows.filter(function(r) { return String(r.Matched).toUpperCase() !== 'TRUE'; });
  var byIntent = {}, unhelpful = 0;
  rows.forEach(function(r) {
    byIntent[r.Intent] = (byIntent[r.Intent] || 0) + 1;
    if (String(r.Helpful).toUpperCase() === 'FALSE') unhelpful++;
  });

  var out = ['===== รายงานการใช้งานผู้ช่วย ====='];
  out.push('คำถามทั้งหมด          : ' + rows.length);
  out.push('จับเจตนาได้           : ' + (rows.length - unmatched.length) +
           (rows.length ? '  (' + Math.round((rows.length - unmatched.length) / rows.length * 100) + '%)' : ''));
  out.push('ผู้ใช้กดว่าไม่มีประโยชน์ : ' + unhelpful);
  out.push('');
  out.push('-- เจตนาที่ถูกถามบ่อย --');
  Object.keys(byIntent).sort(function(a, b) { return byIntent[b] - byIntent[a]; }).slice(0, 10)
    .forEach(function(k) { out.push('  ' + byIntent[k] + '  ' + k); });
  out.push('');
  out.push('-- คำถามที่ตอบไม่ได้ 20 รายการล่าสุด --');
  unmatched.slice(-20).forEach(function(r) { out.push('  ' + String(r.RawMessage || '')); });

  var text = out.join('\n');
  console.log(text);
  return text;
}
