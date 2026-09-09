/**
 * =========================================================================
 * AssistantFeasibilityAudit.gs  —  สคริปต์ประเมินความพร้อมของข้อมูล
 * =========================================================================
 * วัตถุประสงค์:
 *   วัดว่าข้อมูลใน ReportNo เพียงพอต่อการทำฟีเจอร์
 *   "เอกสารในความรับผิดชอบของฉันที่ยังค้างส่ง" หรือไม่
 *
 * ความปลอดภัย:
 *   - READ ONLY ทั้งไฟล์ ไม่มีคำสั่งเขียนแม้แต่บรรทัดเดียว
 *   - ไม่สร้างชีต ไม่แก้ค่า ไม่ลบอะไร ไม่ตั้ง trigger
 *   - จำกัดเฉพาะผู้ดูแลทางเทคนิค ตามรูปแบบเดิมของระบบ
 *
 * วิธีใช้:
 *   1. วางไฟล์นี้ในโปรเจกต์ Apps Script
 *   2. รัน auditAssistantFeasibility() จาก Editor
 *   3. ดูผลใน Execution log
 *   4. เมื่อประเมินเสร็จ จะลบไฟล์นี้ทิ้งก็ได้ ไม่มีผลต่อระบบ
 * =========================================================================
 */

function auditAssistantFeasibility() {
  pcRequireTechnicalOwner_();

  var ss = getSpreadsheet_();
  var report = [];
  function say(line) { report.push(line); Logger.log(line); }

  say('===== รายงานความพร้อมของข้อมูลสำหรับโมดูลผู้ช่วย =====');
  say('เวลา: ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'));
  say('');

  // ---------- 1) อ่านอีเมลผู้ใช้ทั้งหมดจากชีต Credential ----------
  var credentialEmails = {};
  var credentialCount = 0, credentialNoEmail = 0;
  var credSheet = ss.getSheetByName('Credential');
  if (credSheet && credSheet.getLastRow() >= 2) {
    var credRows = credSheet.getRange(2, 1, credSheet.getLastRow() - 1,
                     Math.min(6, credSheet.getLastColumn())).getValues();
    credRows.forEach(function(r) {
      if (!String(r[0] || '').trim()) return;
      credentialCount++;
      var email = pcKey_(r[2]);
      if (email) credentialEmails[email] = String(r[4] || r[0] || '').trim();
      else credentialNoEmail++;
    });
  }
  say('[1] บัญชีผู้ใช้ในชีต Credential');
  say('    จำนวนบัญชีทั้งหมด        : ' + credentialCount);
  say('    บัญชีที่ไม่ได้ระบุอีเมล     : ' + credentialNoEmail);
  say('    อีเมลไม่ซ้ำที่ใช้จับคู่ได้   : ' + Object.keys(credentialEmails).length);
  say('');

  // ---------- 2) อ่านทะเบียนเอกสาร ReportNo ----------
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    say('!! ไม่พบข้อมูลในชีต ' + sheetName);
    return report.join('\n');
  }

  var t0 = Date.now();
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1,
                 Math.min(12, sheet.getLastColumn())).getValues();
  var readMs = Date.now() - t0;

  var total = 0, open = 0, done = 0;
  var emailPresent = 0, emailValid = 0, emailMatched = 0;
  var openEmailMatched = 0, openNoEmail = 0;
  var byYear = {}, byType = {}, unmatchedEmails = {}, noEmailSamples = [];
  var emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  values.forEach(function(row) {
    var docNo = String(row[1] || '').trim();
    if (!docNo) return;
    total++;

    var year = pcDocumentYear_(normalizeDocumentNumberForPrecheck_(docNo));
    byYear[year] = (byYear[year] || 0) + 1;

    var type = resolveDocumentType_(row[2]);
    byType[type] = (byType[type] || 0) + 1;

    var isOpen = !String(row[7] || '').trim();   // H = ลิงก์ฉบับสมบูรณ์
    if (isOpen) open++; else done++;

    var rawEmail = String(row[9] || '').trim();  // J = อีเมลเจ้าของ
    if (rawEmail) {
      emailPresent++;
      if (emailPattern.test(pcKey_(rawEmail))) {
        emailValid++;
        if (credentialEmails[pcKey_(rawEmail)]) {
          emailMatched++;
          if (isOpen) openEmailMatched++;
        } else {
          unmatchedEmails[pcKey_(rawEmail)] = (unmatchedEmails[pcKey_(rawEmail)] || 0) + 1;
        }
      }
    } else if (isOpen) {
      openNoEmail++;
      if (noEmailSamples.length < 10) {
        noEmailSamples.push(docNo + '  |  ' + String(row[5] || '(ไม่ระบุผู้รับผิดชอบ)').trim());
      }
    }
  });

  function pct(n, d) { return d ? (Math.round(n / d * 1000) / 10) + '%' : '-'; }

  say('[2] ขนาดและประสิทธิภาพ');
  say('    จำนวนแถวทั้งหมด          : ' + total);
  say('    เวลาอ่านชีต 12 คอลัมน์    : ' + readMs + ' ms');
  say('    ประเมิน  : ' + (total < 5000 ? 'เล็ก — แคชต่อผู้ใช้เพียงพอ'
                        : total < 15000 ? 'กลาง — ต้องใช้แคชตามที่ออกแบบไว้'
                        : 'ใหญ่ — ควรพิจารณาสร้างชีต index แยก'));
  say('');

  say('[3] สถานะเอกสาร');
  say('    ยังไม่มีไฟล์ฉบับสมบูรณ์   : ' + open + '  (' + pct(open, total) + ')');
  say('    มีไฟล์ฉบับสมบูรณ์แล้ว    : ' + done + '  (' + pct(done, total) + ')');
  say('');

  say('[4] คุณภาพคอลัมน์ J (อีเมลเจ้าของ)  << ตัวชี้ขาดของฟีเจอร์ "งานค้างของฉัน"');
  say('    มีค่าในคอลัมน์ J          : ' + emailPresent + '  (' + pct(emailPresent, total) + ')');
  say('    รูปแบบอีเมลถูกต้อง        : ' + emailValid + '  (' + pct(emailValid, total) + ')');
  say('    จับคู่กับบัญชีผู้ใช้ได้     : ' + emailMatched + '  (' + pct(emailMatched, total) + ')  <<< ตัวเลขสำคัญที่สุด');
  say('');
  say('    เฉพาะเอกสารที่ยังไม่เสร็จ:');
  say('      จับคู่เจ้าของได้         : ' + openEmailMatched + '  (' + pct(openEmailMatched, open) + ')');
  say('      ไม่มีอีเมลเลย           : ' + openNoEmail + '  (' + pct(openNoEmail, open) + ')');
  say('');

  var matchRate = open ? (openEmailMatched / open) : 0;
  say('[5] ข้อสรุป');
  if (matchRate >= 0.85) {
    say('    ผ่าน — ข้อมูลพร้อมทำฟีเจอร์ "งานค้างของฉัน" ได้ทันที');
  } else if (matchRate >= 0.60) {
    say('    ผ่านแบบมีเงื่อนไข — ควรจับคู่ด้วยชื่อผู้รับผิดชอบ (คอลัมน์ F) เสริม');
    say('    และต้องแสดงข้อความกำกับว่ารายการอาจไม่ครบถ้วน');
  } else {
    say('    ยังไม่ผ่าน — ควรปรับปรุงข้อมูลคอลัมน์ J ก่อน');
    say('    มิฉะนั้นฟีเจอร์นี้จะแสดงรายการไม่ครบและทำให้ผู้ใช้เข้าใจผิด');
  }
  say('');

  say('[6] แยกตามประเภทเอกสาร');
  Object.keys(byType).sort().forEach(function(k) {
    say('    ' + k + ' : ' + byType[k]);
  });
  say('');

  say('[7] แยกตามปีเอกสาร');
  Object.keys(byYear).sort().forEach(function(k) {
    say('    ' + k + ' : ' + byYear[k]);
  });
  say('');

  var unmatchedList = Object.keys(unmatchedEmails)
    .map(function(e) { return { email: e, count: unmatchedEmails[e] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 15);
  if (unmatchedList.length) {
    say('[8] อีเมลในทะเบียนที่ไม่ตรงกับบัญชีผู้ใช้ใด (15 อันดับแรก)');
    say('    << กลุ่มนี้คือคนที่จะไม่เห็นงานค้างของตัวเอง');
    unmatchedList.forEach(function(x) { say('    ' + x.count + ' ฉบับ  ' + x.email); });
    say('');
  }

  if (noEmailSamples.length) {
    say('[9] ตัวอย่างเอกสารค้างที่ไม่ระบุอีเมลเจ้าของ');
    noEmailSamples.forEach(function(s) { say('    ' + s); });
    say('');
  }

  say('===== จบรายงาน =====');
  return report.join('\n');
}
