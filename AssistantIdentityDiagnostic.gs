/**
 * =========================================================================
 * AssistantIdentityDiagnostic.gs — ตรวจตรรกะการยืนยันตัวตนและการจับคู่ชื่อ
 * =========================================================================
 * ตอบคำถาม 3 ข้อด้วยข้อมูลจริงในระบบ:
 *   1) ระบบยึดอะไรเป็นตัวตนของผู้ใช้เป็นอันดับแรก
 *   2) การจับคู่ชื่อผู้รับผิดชอบใช้ได้จริงหรือไม่
 *   3) ผู้ใช้พิมพ์ชื่อคนอื่นเข้าไปถาม จะดึงข้อมูลของคนนั้นได้หรือไม่
 *
 * ความปลอดภัย: READ ONLY ล้วน ไม่มีคำสั่งเขียนแม้แต่บรรทัดเดียว
 *              ไม่แสดงรหัสผ่าน ไม่แก้ session ไม่แตะข้อมูลใด
 * วิธีใช้: วางไฟล์นี้ในโปรเจกต์ แล้วรัน diagnoseAssistantIdentity() จาก Editor
 *         เมื่อตรวจเสร็จจะลบไฟล์นี้ทิ้งก็ได้ ไม่มีผลต่อระบบ
 * =========================================================================
 */

function diagnoseAssistantIdentity() {
  pcRequireTechnicalOwner_();

  var out = [];
  function say(line) { out.push(line); Logger.log(line); }

  say('===== ตรวจตรรกะตัวตนและการจับคู่ชื่อ =====');
  say('เวลา: ' + Utilities.formatDate(new Date(), PC_CONST.TIMEZONE, 'dd/MM/yyyy HH:mm'));
  say('');

  // ---------- [1] ลำดับการยืนยันตัวตน ----------
  var activeEmail = '';
  try { activeEmail = String(Session.getActiveUser().getEmail() || '').trim(); } catch (e) {}

  var session = null, sessionError = '';
  try { session = requireAuth_('diagnostic'); } catch (e) { sessionError = String(e && e.message || e); }

  say('[1] ลำดับการยืนยันตัวตน (ตามลำดับที่โค้ดทำงานจริง)');
  say('    1.1 Session.getTemporaryActiveUserKey()  = คีย์จากบัญชี Google ที่ล็อกอินเบราว์เซอร์');
  say('        << นี่คือ "อันดับแรก" ที่แท้จริง ถ้าไม่มีคีย์นี้ ระบบ throw ทันที');
  say('    1.2 hashString_(userKey) -> ค้นแถวในชีต Sessions ที่ UserKeyHash ตรงกัน');
  say('    1.3 ได้ Username / DisplayName จากแถว session นั้น');
  say('    1.4 email = Session.getActiveUser().getEmail() || Credential คอลัมน์ C ของ Username');
  say('        << อีเมลบัญชี Google ชนะเสมอ อีเมลใน Credential เป็นเพียงตัวสำรอง');
  say('');

  if (sessionError) { say('    !! อ่าน session ไม่ได้: ' + sessionError); }
  else {
    var principal = getCurrentPrincipal_();
    var credentialEmail = pcCredentialEmailForUsername_(session.username);
    say('    ผลจริงของผู้ที่กำลังรันสคริปต์นี้:');
    say('      อีเมลบัญชี Google (activeEmail)   : ' + (activeEmail || '(ว่าง)'));
    say('      Username จากแถว session           : ' + principal.username);
    say('      DisplayName จากแถว session        : "' + principal.displayName + '"');
    say('      อีเมลใน Credential ของ Username นี้ : ' + (credentialEmail || '(ว่าง)'));
    say('      email ที่ระบบใช้จริง               : ' + principal.email);
    say('      authSource                        : ' + principal.authSource);
    say('      roles                             : ' + principal.roles.join(', '));
    if (activeEmail && credentialEmail && pcKey_(activeEmail) !== pcKey_(credentialEmail)) {
      say('      !! อีเมล Google กับอีเมลใน Credential ไม่ตรงกัน');
      say('         ระบบจะใช้อีเมล Google ในการหาเอกสาร แต่ใช้ DisplayName ของ Username ในการจับคู่ชื่อ');
      say('         = ตัวตนถูกแยกเป็นสองส่วน ควรตรวจสอบ');
    } else if (activeEmail) {
      say('      OK อีเมลทั้งสองแหล่งตรงกัน ตัวตนเป็นหนึ่งเดียว');
    }
  }
  say('');

  // ---------- [2] โครงสร้างชีต Credential ----------
  var ss = getSpreadsheet_();
  var cred = ss.getSheetByName('Credential');
  say('[2] โครงสร้างชีต Credential');
  if (!cred || cred.getLastRow() < 2) { say('    !! ไม่พบข้อมูล'); }
  else {
    var header = cred.getRange(1, 1, 1, Math.min(8, cred.getLastColumn())).getValues()[0];
    var letters = 'ABCDEFGH'.split('');
    header.forEach(function(h, i) {
      var note = '';
      if (i === 0) note = '  << Username (checkLogin ใช้ data[i][0])';
      if (i === 1) note = '  << Password (ไม่แสดงค่า)';
      if (i === 2) note = '  << Email (pcCredentialEmailForUsername_ ใช้ values[i][2])';
      if (i === 4) note = '  << DisplayName (checkLogin ใช้ data[i][4]) <<< ตัวที่ใช้จับคู่ชื่อ';
      say('    คอลัมน์ ' + letters[i] + ' : "' + String(h) + '"' + note);
    });
    say('');
    say('    ตัวอย่างค่าในคอลัมน์ D, E, F (3 แถวแรก ไม่แสดงรหัสผ่าน):');
    var sampleRows = cred.getRange(2, 4, Math.min(3, cred.getLastRow() - 1), 3).getValues();
    sampleRows.forEach(function(r, i) {
      say('      แถว ' + (i + 2) + ' : D="' + String(r[0]) + '"  E="' + String(r[1]) + '"  F="' + String(r[2]) + '"');
    });
  }
  say('');

  // ---------- [3] การจับคู่ชื่อใช้ได้จริงหรือไม่ ----------
  say('[3] ทดสอบการจับคู่ชื่อกับทะเบียนจริง');
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || !cred || cred.getLastRow() < 2) {
    say('    !! ข้อมูลไม่พอสำหรับทดสอบ');
  } else {
    var master = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(12, sheet.getLastColumn())).getValues();
    var credRows = cred.getRange(2, 1, cred.getLastRow() - 1, Math.min(6, cred.getLastColumn())).getValues();

    var responsibleKeys = {};
    master.forEach(function(row) {
      var k = asNormalizePersonName_(row[5]);
      if (k) responsibleKeys[k] = (responsibleKeys[k] || 0) + 1;
    });

    var matchedAccounts = 0, unmatchedAccounts = 0, samples = [];
    credRows.forEach(function(r) {
      var display = String(r[4] || '').trim();
      if (!display) return;
      var key = asNormalizePersonName_(display);
      if (responsibleKeys[key]) matchedAccounts++;
      else {
        unmatchedAccounts++;
        if (samples.length < 8) samples.push('"' + display + '" -> normalize "' + key + '"');
      }
    });

    say('    บัญชีที่ DisplayName จับคู่กับผู้รับผิดชอบในทะเบียนได้ : ' + matchedAccounts);
    say('    บัญชีที่จับคู่ไม่ได้เลย                              : ' + unmatchedAccounts);
    say('');
    if (matchedAccounts === 0) {
      say('    !!!! การจับคู่ด้วยชื่อใช้งานไม่ได้เลยในระบบนี้');
      say('         สาเหตุที่พบบ่อยคือ Credential คอลัมน์ E เก็บเฉพาะ "ชื่อ" ไม่มี "นามสกุล"');
      say('         แต่ทะเบียนคอลัมน์ F เก็บ "คำนำหน้า+ชื่อ+นามสกุล"');
      say('         asNormalizePersonName_ ตัดคำนำหน้าออกได้ แต่เติมนามสกุลให้ไม่ได้');
      say('         >> แนะนำให้ตั้ง PC_ASSIST_NAME_MATCH = false');
    } else if (matchedAccounts < credRows.length * 0.5) {
      say('    !! จับคู่ได้เพียงบางส่วน ควรพิจารณาปิด PC_ASSIST_NAME_MATCH');
    } else {
      say('    OK การจับคู่ด้วยชื่อใช้งานได้');
    }
    if (samples.length) {
      say('');
      say('    ตัวอย่าง DisplayName ที่จับคู่ไม่ได้:');
      samples.forEach(function(x) { say('      ' + x); });
      var mk = Object.keys(responsibleKeys).slice(0, 5);
      say('    ตัวอย่าง key ของผู้รับผิดชอบในทะเบียน:');
      mk.forEach(function(x) { say('      "' + x + '"'); });
    }

    // ความเสี่ยงชื่อซ้ำ ถ้าจะเปลี่ยนไปใช้การจับคู่แบบหลวม
    var firstNameCollisions = {};
    Object.keys(responsibleKeys).forEach(function(k) {
      var head = k.substring(0, 4);
      firstNameCollisions[head] = (firstNameCollisions[head] || 0) + 1;
    });
    var collided = Object.keys(firstNameCollisions).filter(function(k) { return firstNameCollisions[k] > 1; });
    say('');
    say('    ความเสี่ยงถ้าเปลี่ยนไปจับคู่แบบ "ขึ้นต้นตรงกัน":');
    say('      กลุ่มชื่อที่ 4 ตัวอักษรแรกซ้ำกัน : ' + collided.length + ' กลุ่ม');
    say('      << ยิ่งมากยิ่งเสี่ยงแสดงเอกสารของคนอื่น จึงไม่แนะนำวิธีนี้');
  }
  say('');

  // ---------- [4] ผู้ใช้พิมพ์ชื่อคนอื่นได้หรือไม่ ----------
  say('[4] ผู้ใช้พิมพ์ชื่อคนอื่นเข้าไปถาม จะดึงข้อมูลได้หรือไม่');
  var probes = ['เอกสารของนายสุรกิจ ลิอิ้น มีอะไรบ้าง', 'งานค้างของครูสมชาย', 'ขอดูเอกสารของ พชรพล'];
  probes.forEach(function(q) {
    var r = asClassify_(q, {}, { roles: [PC_CONST.ROLES.USER] });
    say('    "' + q + '"');
    say('        intent=' + r.intent + '  documentNumber="' + r.documentNumber + '"');
  });
  say('');
  say('    asClassify_() คืนเฉพาะ { intent, confidence, documentNumber, alternatives }');
  say('    ไม่มีการสกัด "ชื่อบุคคล" ออกจากข้อความเลย และ asBuildAnswer_() ไม่รับพารามิเตอร์ชื่อ');
  say('    asMyWorkload_() ใช้เฉพาะ principal.email และ principal.displayName ของผู้ถามเท่านั้น');
  say('    >> สรุป: พิมพ์ชื่อคนอื่นไม่มีผลใด ๆ ดึงข้อมูลของคนนั้นไม่ได้');
  say('');

  say('===== จบรายงาน =====');
  return out.join('\n');
}
