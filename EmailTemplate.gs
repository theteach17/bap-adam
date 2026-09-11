/** Builds compact responsive HTML and plain-text email bodies. */
function paBuildEmail_(job) {
  var isRevision = String(job.EventType) === 'REVISION_SUBMITTED';
  var badge = isRevision ? 'ฉบับแก้ไข • รอตรวจซ้ำ' : 'รายงานใหม่ • รอตรวจ';
  var intro = isRevision
    ? 'มีผู้ใช้อัปโหลดรายงานฉบับแก้ไขกลับเข้าสู่คิวตรวจ กรุณาตรวจสอบเมื่อสะดวก'
    : 'มีผู้ใช้อัปโหลดรายงานผลการดำเนินกิจกรรมเข้าสู่คิวตรวจใหม่ กรุณาตรวจสอบเมื่อสะดวก';
  var url = paBuildOfficerUrl_();
  var submittedAt = paFormatDateTime_(job.SourceCreatedAt || job.CreatedAt);
  var versionText = job.VersionNo ? 'V' + String(job.VersionNo).replace(/^V/i, '') : '-';

  var rows = [
    ['หมายเลขเอกสาร', job.DocumentNumber || '-'],
    ['Case No.', job.CaseNo || '-'],
    ['ชื่อรายงาน / กิจกรรม', job.DocumentName || '-'],
    ['กลุ่มบริหาร', job.AdminGroup || '-'],
    ['กลุ่มงาน', job.WorkGroup || '-'],
    ['ผู้รับผิดชอบ', job.ResponsiblePerson || '-'],
    ['ผู้ส่งเข้าระบบ', job.SubmittedByName || job.SubmittedByEmail || '-'],
    ['Version', versionText],
    ['เวลาที่เข้าคิว', submittedAt]
  ];

  var detailHtml = rows.map(function(row) {
    return '<tr>' +
      '<td style="padding:8px 10px;color:#64748b;font-size:13px;vertical-align:top;width:34%;border-bottom:1px solid #eef2f7">' + paEscapeHtml_(row[0]) + '</td>' +
      '<td style="padding:8px 10px;color:#0f172a;font-size:13px;font-weight:600;vertical-align:top;border-bottom:1px solid #eef2f7">' + paEscapeHtml_(row[1]) + '</td>' +
      '</tr>';
  }).join('');

  var html = '<!doctype html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,\'Noto Sans Thai\',Tahoma,sans-serif;color:#0f172a">' +
    '<div style="display:none;max-height:0;overflow:hidden">' + paEscapeHtml_(badge + ' ' + (job.DocumentNumber || '')) + '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 10px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.08)">' +
    '<tr><td style="background:#173b64;padding:22px 26px;color:#ffffff">' +
      '<div style="font-size:12px;letter-spacing:.4px;opacity:.82">PROJECT ADAM • CENTRAL INFORMATION</div>' +
      '<div style="font-size:21px;font-weight:700;margin-top:5px">แจ้งเตือนคิวตรวจรายงาน</div>' +
    '</td></tr>' +
    '<tr><td style="padding:24px 26px">' +
      '<span style="display:inline-block;background:' + (isRevision ? '#fff7ed' : '#ecfdf5') + ';color:' + (isRevision ? '#9a3412' : '#166534') + ';border-radius:999px;padding:6px 11px;font-size:12px;font-weight:700">' + paEscapeHtml_(badge) + '</span>' +
      '<p style="font-size:14px;line-height:1.75;color:#475569;margin:16px 0 18px">เรียน เจ้าหน้าที่งานสารสนเทศ<br>' + paEscapeHtml_(intro) + '</p>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5eaf0;border-radius:12px;overflow:hidden">' + detailHtml + '</table>' +
      '<div style="text-align:center;margin:24px 0 10px">' +
        '<a href="' + paEscapeHtml_(url) + '" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 22px;border-radius:10px">เข้าสู่ระบบเพื่อตรวจรายงาน</a>' +
      '</div>' +
      '<p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:18px 0 0;text-align:center">ปุ่มนี้จะเปิดหน้า “ตรวจรายงาน Pre-check” ของ Project Adam โดยตรง</p>' +
    '</td></tr>' +
    '<tr><td style="background:#f8fafc;padding:15px 26px;border-top:1px solid #eef2f7;color:#94a3b8;font-size:11px;line-height:1.6">' +
      'ข้อความอัตโนมัติจากงานสารสนเทศโรงเรียน • Alert ID: ' + paEscapeHtml_(job.AlertId) +
    '</td></tr></table></td></tr></table></body></html>';

  var text = [
    'Project Adam - แจ้งเตือนคิวตรวจรายงาน',
    badge,
    '',
    'หมายเลขเอกสาร: ' + (job.DocumentNumber || '-'),
    'Case No.: ' + (job.CaseNo || '-'),
    'ชื่อรายงาน / กิจกรรม: ' + (job.DocumentName || '-'),
    'กลุ่มบริหาร: ' + (job.AdminGroup || '-'),
    'กลุ่มงาน: ' + (job.WorkGroup || '-'),
    'ผู้รับผิดชอบ: ' + (job.ResponsiblePerson || '-'),
    'ผู้ส่งเข้าระบบ: ' + (job.SubmittedByName || job.SubmittedByEmail || '-'),
    'Version: ' + versionText,
    'เวลาที่เข้าคิว: ' + submittedAt,
    '',
    'เข้าสู่ระบบเพื่อตรวจรายงาน: ' + url,
    '',
    'Alert ID: ' + job.AlertId
  ].join('\n');

  return { html: html, text: text };
}

/** Formats a timestamp in the configured Thailand timezone for email display. */
function paFormatDateTime_(value) {
  var date = paToDate_(value) || new Date();
  return Utilities.formatDate(date, PA_NOTIFY.TIMEZONE, 'dd/MM/yyyy HH:mm:ss') + ' น.';
}
