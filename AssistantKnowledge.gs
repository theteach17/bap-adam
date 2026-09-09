/**
 * =========================================================================
 * AssistantKnowledge.gs — เนื้อหาคงที่ (ขั้นตอนการใช้งาน / FAQ)
 * =========================================================================
 * แยกข้อความออกจากตรรกะ เพื่อให้ผู้ดูแลแก้ถ้อยคำได้โดยไม่ต้องแตะโค้ดส่วนอื่น
 * ทุกคำตอบในไฟล์นี้ไม่มีการอ่านข้อมูลผู้ใช้ ยกเว้นค่าคอนฟิกที่ปลอดภัย
 * =========================================================================
 */

/** คืนบล็อกคำตอบสำหรับ intent กลุ่มขั้นตอน/วิธีใช้ */
function asKnowledgeBlocks_(intent, cfg) {
  cfg = cfg || {};
  var maxFileMb = Number(cfg.maxFileMb || 0);
  var contactText = String(cfg.assistContactText || '').trim();

  switch (intent) {
    case AS_CONST.INTENT.HOWTO_START:
      return [
        asText_('การเริ่มต้นใช้งานมี 3 ขั้นตอนหลักครับ'),
        asSteps_([
          { title: 'ขอเลขทะเบียนเอกสาร', detail: 'เมนู "ขอเลขทะเบียนเอกสาร" กรอกชื่อเอกสาร กลุ่มบริหาร กลุ่มงาน ผู้รับผิดชอบ และโครงการ ระบบจะออกเลขให้ทันที' },
          { title: 'จัดทำเอกสารและแปลงเป็น PDF', detail: maxFileMb ? ('ไฟล์ต้องเป็น PDF ขนาดไม่เกิน ' + maxFileMb + ' MB') : 'ไฟล์ต้องเป็น PDF' },
          { title: 'ส่งเอกสารเข้าระบบ', detail: 'เมนู "ส่งเอกสาร" กรอกเลขที่ได้จากขั้นที่ 1 ระบบจะพาไปตามประเภทเอกสารเองโดยอัตโนมัติ' }
        ]),
        asNote_('หลังส่งแล้วสามารถติดตามสถานะได้ที่เมนู "รายการเอกสารของฉัน" หรือถามผมได้ตลอดเวลา')
      ];

    case AS_CONST.INTENT.HOWTO_REGISTER:
      return [
        asText_('การขอเลขทะเบียนเอกสารทำได้จากหน้าหลักครับ'),
        asSteps_([
          { title: 'เปิดเมนู "ขอเลขทะเบียนเอกสาร"', detail: 'อยู่ในกลุ่ม "การจัดการเอกสาร" ทางแถบเมนูซ้าย' },
          { title: 'กรอกข้อมูลให้ครบ', detail: 'ชื่อเอกสารต้องขึ้นต้นด้วย "รายงานผลการดำเนินกิจกรรม" "บันทึกข้อความชี้แจงไม่ดำเนินกิจกรรม" หรือ "เอกสาร" อย่างใดอย่างหนึ่ง' },
          { title: 'บันทึก', detail: 'ระบบจะออกเลขให้ตามกลุ่มบริหาร และนำไปแสดงในตารางหน้าหลักทันที' }
        ]),
        asAction_('ไปหน้าหลักเพื่อขอเลข', 'Index', null)
      ];

    case AS_CONST.INTENT.HOWTO_SUBMIT_REPORT:
      return [
        asText_('การส่งรายงานผลการดำเนินกิจกรรมทำตามลำดับนี้ครับ'),
        asSteps_([
          { title: 'เปิดเมนู "ส่งเอกสาร"', detail: 'กรอกเลขเอกสารที่ขึ้นทะเบียนไว้แล้ว ระบบจะตรวจประเภทเอกสารให้เอง' },
          { title: 'กรอกข้อมูลผลการดำเนินงาน', detail: 'เป้าหมายและผลเชิงปริมาณ เชิงคุณภาพ ผลที่คาดว่าจะได้รับ งบประมาณ และค่าสถิติตามที่ระบบร้องขอ' },
          { title: 'แนบไฟล์ PDF', detail: maxFileMb ? ('ขนาดไม่เกิน ' + maxFileMb + ' MB รอจนอัปโหลดครบ 100% ก่อนกดส่ง') : 'รอจนอัปโหลดครบ 100% ก่อนกดส่ง' },
          { title: 'กดส่งตรวจ', detail: 'สถานะจะเปลี่ยนเป็น "รอเจ้าหน้าที่ตรวจ" และระบบจะแจ้งผลทางอีเมล' }
        ]),
        asAction_('ไปหน้าส่งเอกสาร', 'SubmitDocument', null)
      ];

    case AS_CONST.INTENT.HOWTO_NON_COMPLETED:
      return [
        asText_('กรณีกิจกรรมไม่ได้ดำเนินการ ต้องส่งบันทึกข้อความชี้แจงแทนรายงานผลครับ'),
        asSteps_([
          { title: 'ขอเลขทะเบียนเอกสาร', detail: 'ชื่อเอกสารต้องขึ้นต้นด้วย "บันทึกข้อความชี้แจงไม่ดำเนินกิจกรรม"' },
          { title: 'จัดทำบันทึกข้อความชี้แจงเหตุผล', detail: 'ระบุเหตุผลที่ไม่ได้ดำเนินกิจกรรมให้ชัดเจน แล้วแปลงเป็น PDF' },
          { title: 'ส่งผ่านเมนู "แจ้งกิจกรรมที่ไม่ได้ดำเนินการ"', detail: 'อยู่ในแถบเมนูหน้าหลัก' }
        ])
      ];

    case AS_CONST.INTENT.HOWTO_REVISION:
      return [
        asText_('เมื่อเอกสารถูกส่งกลับให้แก้ไข ให้ทำตามนี้ครับ'),
        asSteps_([
          { title: 'เปิดดูรายการที่ต้องแก้', detail: 'เมนู "รายการเอกสารของฉัน" แล้วกดดูรายละเอียดของเอกสารที่สถานะเป็น "ต้องแก้ไขและส่งใหม่"' },
          { title: 'แก้ไขไฟล์ตามความเห็นเจ้าหน้าที่', detail: 'ระบบจะระบุหัวข้อที่ต้องแก้และหมายเลขหน้าไว้ให้' },
          { title: 'ส่งฉบับแก้ไข', detail: 'กลับไปที่เมนู "ส่งเอกสาร" ใช้เลขเอกสารเดิม ระบบจะสร้างฉบับใหม่ต่อจากเดิมให้เอง ไม่ต้องขอเลขใหม่' }
        ]),
        asAction_('ดูรายการเอกสารของฉัน', 'MyDocuments', null)
      ];

    case AS_CONST.INTENT.HOWTO_FILE_RULES:
      return [
        asText_(maxFileMb
          ? ('ระบบรับเฉพาะไฟล์ PDF ขนาดไม่เกิน ' + maxFileMb + ' MB ต่อหนึ่งไฟล์ครับ')
          : 'ระบบรับเฉพาะไฟล์ PDF ครับ'),
        asBullets_([
          'ตั้งชื่อไฟล์เป็นภาษาไทยได้ ระบบจะจัดชื่อให้เองเมื่อบันทึกฉบับสมบูรณ์',
          'อัปโหลดไฟล์ใหญ่ระบบจะแบ่งส่งเป็นช่วง ต้องรอจนครบ 100% ก่อนกดส่ง',
          'หากอัปโหลดค้าง ให้กดเริ่มอัปโหลดใหม่ได้ ระบบจะไม่นับไฟล์เดิมซ้ำ'
        ])
      ];

    case AS_CONST.INTENT.HOWTO_CONTACT:
      return [
        asText_('หากต้องการความช่วยเหลือที่เกินกว่าข้อมูลในระบบ กรุณาติดต่อเจ้าหน้าที่งานแผนงานและสารสนเทศโรงเรียนครับ'),
        contactText ? asNote_(contactText) : asNote_('กรุณาติดต่อผ่านช่องทางที่โรงเรียนกำหนด')
      ];

    default:
      return [];
  }
}

/** ข้อความเมื่อจับเจตนาไม่ได้ */
function asUnknownBlocks_(cfg) {
  var contactText = String((cfg || {}).assistContactText || '').trim();
  var blocks = [
    asText_('ขออภัยครับ ผมยังไม่เข้าใจคำถามนี้'),
    asBullets_([
      'ตรวจสอบสถานะเอกสาร เช่น พิมพ์ "บง 123/2569 อยู่ขั้นตอนไหน"',
      'ดูเอกสารค้างส่งของท่าน',
      'สอบถามขั้นตอนการใช้งานระบบ'
    ])
  ];
  if (contactText) blocks.push(asNote_('หากเป็นปัญหาการใช้งานระบบ ' + contactText));
  return blocks;
}

/* ---------- ตัวช่วยสร้างบล็อกคำตอบ (โครงสร้างข้อมูลล้วน ไม่มี HTML) ---------- */

function asText_(text) { return { type: 'text', text: String(text || '') }; }
function asNote_(text) { return { type: 'note', text: String(text || '') }; }
function asBullets_(items) { return { type: 'bullets', items: (items || []).map(String) }; }
function asSteps_(items) {
  return { type: 'steps', items: (items || []).map(function(s) {
    return { title: String(s.title || ''), detail: String(s.detail || '') };
  })};
}
function asAction_(label, page, params) {
  return { type: 'action', label: String(label || ''), page: String(page || ''), params: params || {} };
}
function asStatusBlock_(statusCode) {
  var info = asStatusInfo_(statusCode);
  return { type: 'status', code: String(statusCode || ''), label: info.label, tone: info.tone, owner: info.owner };
}
function asKeyValues_(pairs) {
  return { type: 'kv', items: (pairs || [])
    .filter(function(p) { return p && p[1] !== '' && p[1] != null; })
    .map(function(p) { return { k: String(p[0]), v: String(p[1]) }; }) };
}
function asList_(title, items) {
  return { type: 'list', title: String(title || ''), items: items || [] };
}
