/** Queues a business notification idempotently; email delivery is never part of the core transaction. */
function pcQueueSubmissionNotification_(eventType, submission, version, extra) {
  if (!submission) return null;
  extra = extra || {};
  var versionId = version && version.VersionId || '';
  var recipients = [];
  [submission.OwnerEmail, submission.SubmittedByEmail].forEach(function(email){ email=pcKey_(email); if(email && recipients.indexOf(email)===-1) recipients.push(email); });
  if (!recipients.length && eventType !== 'OPERATIONAL_FAILURE') return null;
  var payload = pcBuildNotificationContent_(eventType, submission, version, extra);
  return pcWithScriptLock_(function(){
    var existing = pcFilterObjects_(PC_CONST.SHEETS.NOTIFICATIONS, function(n){
      return String(n.SubmissionId)===String(submission.SubmissionId||'') && String(n.VersionId||'')===String(versionId) && String(n.EventType)===String(eventType);
    });
    if (existing.length) return existing[0];
    return pcAppendObject_(PC_CONST.SHEETS.NOTIFICATIONS, {
      NotificationId:pcUuid_(), SubmissionId:submission.SubmissionId||'', VersionId:versionId, EventType:eventType,
      Recipient:recipients.join(','), CC:'', Subject:payload.subject, BodyPayload:JSON.stringify({text:payload.text,html:payload.html}),
      Status:PC_CONST.NOTIFICATION_STATUS.PENDING, AttemptCount:0, CreatedAt:pcNowIso_(), LastAttemptAt:'', NextAttemptAt:pcNowIso_(), SentAt:'', ErrorCode:'', ErrorMessage:''
    });
  });
}

/** Best-effort notification queue helper so queue/storage failures never roll back completed business state. */
function pcQueueSubmissionNotificationSafe_(eventType, submission, version, extra) {
  try { return pcQueueSubmissionNotification_(eventType, submission, version, extra); }
  catch (error) { console.error('Notification queue failed ['+eventType+']: '+String(error&&error.message||error)); return null; }
}

/** Queues an operational alert to the configured officer group. */
function pcQueueOperationalAlert_(subject, message, metadata) {
  var cfg=getPrecheckConfig_(); if(!cfg.dbId||!cfg.officerGroupEmail)return null;
  var content=pcBuildOperationalNotificationContent_(subject,message,metadata||{});
  return pcAppendObject_(PC_CONST.SHEETS.NOTIFICATIONS, {
    NotificationId:pcUuid_(),SubmissionId:(metadata&&metadata.submissionId)||'',VersionId:(metadata&&metadata.versionId)||'',EventType:'OPERATIONAL_FAILURE',
    Recipient:cfg.officerGroupEmail,CC:'',Subject:content.subject,
    BodyPayload:JSON.stringify({text:content.text,html:content.html}),Status:PC_CONST.NOTIFICATION_STATUS.PENDING,AttemptCount:0,CreatedAt:pcNowIso_(),LastAttemptAt:'',NextAttemptAt:pcNowIso_(),SentAt:'',ErrorCode:'',ErrorMessage:''
  });
}

/** Best-effort operational alert helper; alert-storage failure never replaces the originating error. */
function pcQueueOperationalAlertSafe_(subject, message, metadata) {
  try { return pcQueueOperationalAlert_(subject, message, metadata); }
  catch (error) { console.error('Operational alert queue failed: '+String(error&&error.message||error)); return null; }
}

/** Builds Thai user-facing email content without exposing raw URLs in the HTML presentation. */
function pcBuildNotificationContent_(eventType, submission, version, extra) {
  var docNo=String(submission.DocumentNumber||''),name=String(submission.DocumentNameSnapshot||''),ver=version?Number(version.VersionNo||0):Number(submission.CurrentVersion||0);
  var baseUrl=pcNotificationSafeUrl_(ScriptApp.getService().getUrl());
  var deep=baseUrl?baseUrl+'?page=PrecheckDetail&submission='+encodeURIComponent(submission.SubmissionId):'';
  var subject='',statusText='',title='',intro='',icon='📄',tone='blue',lines=['หมายเลขเอกสาร: '+docNo,'ชื่อเอกสาร: '+name,'Version: V'+ver];
  var detailRows=[
    {label:'หมายเลขเอกสาร',value:docNo},
    {label:'ชื่อเอกสาร',value:name},
    {label:'ฉบับ',value:'V'+ver}
  ];
  var extraHtml='';
  var secondaryActions=[];

  if(eventType==='SUBMISSION_RECEIVED'){
    subject='['+PC_CONST.USER_FACING_NAME+'] รับรายงานเข้าสู่การตรวจแล้ว — '+docNo;
    statusText='รอตรวจ'; title='รับรายงานเข้าสู่การตรวจแล้ว'; intro='ระบบได้รับรายงานของคุณเรียบร้อยแล้ว และนำเข้าสู่คิวตรวจของเจ้าหน้าที่'; icon='📥'; tone='blue';
    lines.push('สถานะ: รอตรวจ');
  }
  else if(eventType==='REVISION_SUBMITTED'){
    subject='['+PC_CONST.USER_FACING_NAME+'] รับรายงานฉบับแก้ไขแล้ว — '+docNo;
    statusText='รอตรวจฉบับแก้ไข'; title='รับรายงานฉบับแก้ไขแล้ว'; intro='ระบบได้รับรายงานฉบับแก้ไขของคุณเรียบร้อยแล้ว และนำกลับเข้าสู่คิวตรวจ'; icon='🔄'; tone='purple';
    lines.push('สถานะ: รอตรวจฉบับแก้ไข');
  }
  else if(eventType==='REVISION_REQUIRED'){
    subject='['+PC_CONST.USER_FACING_NAME+'] ผลการตรวจรายงาน — ต้องแก้ไข — '+docNo;
    statusText='ต้องแก้ไข'; title='ผลการตรวจรายงาน: ต้องแก้ไข'; intro='เจ้าหน้าที่ตรวจรายงานแล้ว พบรายการที่ต้องแก้ไขก่อนส่งฉบับใหม่ กรุณาตรวจรายละเอียดด้านล่าง'; icon='⚠️'; tone='red';
    var review=extra.review||{},responses=extra.responses||{},itemsById={},quickById={};pcTemplateItems_(submission.TemplateId).forEach(function(i){itemsById[i.ItemId]=i;});pcListObjects_(PC_CONST.SHEETS.QUICK_COMMENTS).forEach(function(q){quickById[String(q.QuickCommentId)]=String(q.FullText||q.Label||'');});
    if(review.CompletedAt){lines.push('วันที่ตรวจ: '+String(review.CompletedAt));detailRows.push({label:'วันที่ตรวจ',value:pcNotificationDisplayDate_(review.CompletedAt)});}
    if(review.ReviewerName||review.ReviewerEmail){lines.push('ผู้ตรวจ: '+String(review.ReviewerName||review.ReviewerEmail));detailRows.push({label:'ผู้ตรวจ',value:String(review.ReviewerName||review.ReviewerEmail)});}
    var fixes=[];Object.keys(responses).forEach(function(id){var r=responses[id];if(String(r.result)!==PC_CONST.REVIEW_RESULT.FIX)return;var item=itemsById[id]||{},quickTexts=(r.quickCommentIds||[]).map(function(qid){return quickById[String(qid)]||'';}).filter(String);fixes.push({page:r.pageNumber||'',label:item.ItemLabel||id,comment:r.comment||'',quickTexts:quickTexts});});
    fixes.sort(function(a,b){return Number(a.page||999999)-Number(b.page||999999);});
    lines.push('จำนวนรายการที่ต้องแก้ไข: '+fixes.length);fixes.forEach(function(f,index){var comment=f.comment||f.quickTexts.join('; ');lines.push((index+1)+'. '+(f.page?'หน้า '+f.page+' — ':'')+f.label+(comment?' — '+comment:''));});
    detailRows.push({label:'จำนวนรายการที่ต้องแก้ไข',value:String(fixes.length)+' รายการ'});
    extraHtml+=pcNotificationFixesHtml_(fixes);
    var corrections=pcCorrectionAuditForVersion_(version&&version.VersionId);if(corrections.length){lines.push('เจ้าหน้าที่ได้ปรับแก้ข้อมูลสรุปในระบบ:');corrections.forEach(function(c){lines.push('- '+c.FieldName+': '+c.OldValue+' → '+c.NewValue+' ('+c.Reason+')');});extraHtml+=pcNotificationCorrectionsHtml_(corrections);}
  }
  else if(eventType==='FINAL_SUCCESS'){
    subject='['+PC_CONST.USER_FACING_NAME+'] รายงานผ่านการตรวจและบันทึกเรียบร้อยแล้ว — '+docNo;
    statusText='บันทึกฉบับสมบูรณ์แล้ว'; title='รายงานผ่านการตรวจเรียบร้อยแล้ว'; intro='รายงานของคุณผ่านการตรวจและระบบบันทึกเป็นเอกสารฉบับสมบูรณ์เรียบร้อยแล้ว'; icon='✅'; tone='green';
    lines.push('สถานะ: บันทึกเป็นเอกสารฉบับสมบูรณ์แล้ว');
    var finalFileUrl=pcNotificationSafeUrl_(submission.FinalFileUrl);
    if(submission.FinalFileUrl)lines.push('ไฟล์ฉบับสมบูรณ์: '+submission.FinalFileUrl);
    if(finalFileUrl)secondaryActions.push({url:finalFileUrl,label:'📎 เปิดไฟล์ฉบับสมบูรณ์'});
    var finalCorrections=pcCorrectionAuditForVersion_(version&&version.VersionId);if(finalCorrections.length){lines.push('เจ้าหน้าที่ได้ปรับแก้ข้อมูลสรุปในระบบ:');finalCorrections.forEach(function(c){lines.push('- '+c.FieldName+': '+c.OldValue+' → '+c.NewValue+' ('+c.Reason+')');});extraHtml+=pcNotificationCorrectionsHtml_(finalCorrections);}
  }
  else {
    statusText='แจ้งเตือน'; title='มีการอัปเดตสถานะรายงาน'; intro='กรุณาเปิดรายละเอียดในศูนย์สารสนเทศกลางเพื่อตรวจสอบข้อมูลล่าสุด'; icon='🔔'; tone='blue';
  }

  detailRows.push({label:'สถานะ',value:statusText});
  if(deep)lines.push('เปิดรายละเอียด: '+deep);
  var text=lines.join('\n');
  var html=pcNotificationEmailShell_({
    preheader:title+' — '+docNo,
    icon:icon,tone:tone,title:title,intro:intro,
    detailRows:detailRows,
    extraHtml:extraHtml,
    primaryUrl:deep,
    primaryLabel:'🔎 เปิดรายละเอียดในศูนย์สารสนเทศกลาง',
    secondaryActions:secondaryActions
  });
  return {subject:subject,text:text,html:html};
}

/** Builds the HTML/text payload for system operational alerts sent to officers. */
function pcBuildOperationalNotificationContent_(subject, message, metadata) {
  metadata=metadata||{};
  var baseUrl=pcNotificationSafeUrl_(ScriptApp.getService().getUrl());
  var deep=baseUrl;
  if(baseUrl&&metadata.submissionId)deep=baseUrl+'?page=PrecheckDetail&submission='+encodeURIComponent(metadata.submissionId);
  var fullSubject='['+PC_CONST.USER_FACING_NAME+'] '+String(subject||'แจ้งเตือนระบบ');
  var msg=String(message||'');
  var text=msg;
  var html=pcNotificationEmailShell_({
    preheader:String(subject||'แจ้งเตือนระบบ'),
    icon:'🛠️',tone:'red',title:String(subject||'แจ้งเตือนระบบ'),
    intro:'ระบบพบเหตุการณ์ที่เจ้าหน้าที่ควรตรวจสอบ',
    detailRows:[],
    extraHtml:'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px"><tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 18px;color:#7f1d1d;font-size:14px;line-height:1.75">'+pcEscapeHtml_(msg)+'</td></tr></table>',
    primaryUrl:deep,
    primaryLabel:metadata.submissionId?'🔎 เปิดรายการในศูนย์สารสนเทศกลาง':'🏠 เปิดศูนย์สารสนเทศกลาง',
    secondaryActions:[]
  });
  return {subject:fullSubject,text:text,html:html};
}

/** Shared responsive email shell using inline CSS for Gmail/Outlook compatibility. */
function pcNotificationEmailShell_(options) {
  options=options||{};
  var palette=pcNotificationPalette_(options.tone);
  var rows=options.detailRows||[],secondary=options.secondaryActions||[];
  var html='';
  html+='<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">'+pcEscapeHtml_(options.preheader||'')+'</div>';
  html+='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:0;background:#f4f7fb;font-family:Arial,\'Noto Sans Thai\',Tahoma,sans-serif;color:#1f2937">';
  html+='<tr><td align="center" style="padding:28px 12px">';
  html+='<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">';
  html+='<tr><td style="padding:20px 26px;background:#ffffff;border-bottom:1px solid #eef1f5">';
  html+='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>';
  html+='<td valign="middle" style="width:46px;font-size:30px;line-height:1">🏫</td>';
  html+='<td valign="middle"><div style="font-size:18px;font-weight:700;color:#d93025">'+pcEscapeHtml_(PC_CONST.USER_FACING_NAME)+'</div><div style="font-size:12px;color:#6b7280;margin-top:3px">ระบบตรวจรายงานผลการดำเนินกิจกรรม · Pre-check</div></td>';
  html+='</tr></table></td></tr>';
  html+='<tr><td style="padding:26px 26px 6px">';
  html+='<div style="display:inline-block;background:'+palette.soft+';color:'+palette.text+';border:1px solid '+palette.border+';border-radius:999px;padding:6px 11px;font-size:12px;font-weight:700">'+pcEscapeHtml_(options.icon||'🔔')+' '+pcEscapeHtml_(pcNotificationToneLabel_(options.tone))+'</div>';
  html+='<div style="font-size:24px;line-height:1.35;font-weight:700;color:#111827;margin-top:14px">'+pcEscapeHtml_(options.title||'แจ้งเตือน')+'</div>';
  if(options.intro)html+='<div style="font-size:14px;line-height:1.75;color:#4b5563;margin-top:9px">'+pcEscapeHtml_(options.intro)+'</div>';
  html+='</td></tr>';
  if(rows.length)html+='<tr><td style="padding:16px 26px 2px">'+pcNotificationDetailTableHtml_(rows)+'</td></tr>';
  if(options.extraHtml)html+='<tr><td style="padding:2px 26px 4px">'+options.extraHtml+'</td></tr>';
  if(options.primaryUrl||secondary.length){
    html+='<tr><td style="padding:22px 26px 26px">';
    if(options.primaryUrl)html+=pcNotificationButtonHtml_(options.primaryUrl,options.primaryLabel||'เปิดศูนย์สารสนเทศกลาง',true);
    secondary.forEach(function(action){if(action&&action.url)html+='<div style="height:8px;line-height:8px">&nbsp;</div>'+pcNotificationButtonHtml_(action.url,action.label||'เปิด',false);});
    html+='</td></tr>';
  }
  html+='<tr><td style="padding:16px 26px;background:#f9fafb;border-top:1px solid #eef1f5;font-size:11px;line-height:1.6;color:#9ca3af;text-align:center">อีเมลฉบับนี้ส่งอัตโนมัติจากศูนย์สารสนเทศกลาง กรุณาไม่ตอบกลับอีเมลฉบับนี้</td></tr>';
  html+='</table></td></tr></table>';
  return html;
}

/** Renders document metadata in a compact two-column email table. */
function pcNotificationDetailTableHtml_(rows) {
  var html='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">';
  rows.forEach(function(row,index){
    var border=index?'border-top:1px solid #e5e7eb;':'';
    html+='<tr><td valign="top" style="'+border+'width:120px;padding:10px 12px;font-size:12px;font-weight:700;color:#64748b">'+pcEscapeHtml_(row.label||'')+'</td><td valign="top" style="'+border+'padding:10px 12px;font-size:13px;line-height:1.65;color:#1f2937">'+pcEscapeHtml_(row.value==null?'':row.value)+'</td></tr>';
  });
  return html+'</table>';
}

/** Renders FIX items with page, checklist label, and reviewer comment. */
function pcNotificationFixesHtml_(fixes) {
  if(!fixes||!fixes.length)return'';
  var html='<div style="font-size:15px;font-weight:700;color:#991b1b;margin-top:18px">📝 รายการที่ต้องแก้ไข</div>';
  fixes.forEach(function(f,index){
    var parts=[];
    if(f.comment)parts.push(String(f.comment));
    (f.quickTexts||[]).forEach(function(q){q=String(q||'').trim();if(q&&parts.indexOf(q)===-1)parts.push(q);});
    html+='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:10px"><tr><td valign="top" style="width:30px;padding-top:1px"><div style="width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:700">'+(index+1)+'</div></td><td style="padding:0 0 11px 8px;border-bottom:1px solid #f1f5f9"><div style="font-size:13px;font-weight:700;color:#1f2937">'+(f.page?'<span style="color:#b91c1c">หน้า '+pcEscapeHtml_(f.page)+'</span> · ':'')+pcEscapeHtml_(f.label||'')+'</div>'+(parts.length?'<div style="font-size:13px;line-height:1.7;color:#4b5563;margin-top:5px">💬 '+pcEscapeHtml_(parts.join(' · '))+'</div>':'')+'</td></tr></table>';
  });
  return html;
}

/** Renders append-only officer corrections without exposing raw metadata or URLs. */
function pcNotificationCorrectionsHtml_(corrections) {
  if(!corrections||!corrections.length)return'';
  var html='<div style="font-size:15px;font-weight:700;color:#374151;margin-top:20px">✏️ ข้อมูลสรุปที่เจ้าหน้าที่ปรับแก้</div>';
  html+='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:10px;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden">';
  corrections.forEach(function(c,index){
    var border=index?'border-top:1px solid #e5e7eb;':'';
    html+='<tr><td style="'+border+'padding:11px 12px"><div style="font-size:12px;font-weight:700;color:#475569">'+pcEscapeHtml_(c.FieldName||'ข้อมูล')+'</div><div style="font-size:12px;line-height:1.65;color:#64748b;margin-top:4px"><span style="text-decoration:line-through">'+pcEscapeHtml_(c.OldValue||'')+'</span> &nbsp;→&nbsp; <strong style="color:#166534">'+pcEscapeHtml_(c.NewValue||'')+'</strong></div>'+(c.Reason?'<div style="font-size:11px;color:#94a3b8;margin-top:3px">เหตุผล: '+pcEscapeHtml_(c.Reason)+'</div>':'')+'</td></tr>';
  });
  return html+'</table>';
}

/** Email-safe CTA button; URL is escaped and restricted to http/https before use. */
function pcNotificationButtonHtml_(url, label, primary) {
  url=pcNotificationSafeUrl_(url);if(!url)return'';
  var bg=primary?'#0b57d0':'#ffffff',color=primary?'#ffffff':'#0b57d0',border=primary?'#0b57d0':'#b8cdf4';
  return '<a href="'+pcEscapeHtml_(url)+'" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;padding:11px 16px;border-radius:8px;background:'+bg+';border:1px solid '+border+';color:'+color+';font-size:13px;font-weight:700;text-decoration:none;line-height:1.2">'+pcEscapeHtml_(label||'เปิด')+'</a>';
}

/** Restricts email hrefs to safe web URLs. */
function pcNotificationSafeUrl_(value) {
  var url=String(value==null?'':value).trim();
  return /^https?:\/\//i.test(url)?url:'';
}

/** Presents ISO timestamps in Thai local time without changing stored data. */
function pcNotificationDisplayDate_(value) {
  var raw=String(value==null?'':value).trim();if(!raw)return'';
  var d=new Date(raw);if(isNaN(d.getTime()))return raw;
  try{
    var parts=Utilities.formatDate(d,PC_CONST.TIMEZONE||'Asia/Bangkok','d|M|yyyy|HH|mm').split('|');
    var months=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return parts[0]+' '+months[Number(parts[1])]+' '+(Number(parts[2])+543)+' '+parts[3]+':'+parts[4]+' น.';
  }catch(e){return raw;}
}

/** Maps semantic notification tones to email-safe inline colors. */
function pcNotificationPalette_(tone) {
  var palettes={
    blue:{soft:'#e8f0fe',text:'#174ea6',border:'#c6dafc'},
    purple:{soft:'#f3e8ff',text:'#6b21a8',border:'#e9d5ff'},
    red:{soft:'#fef2f2',text:'#b91c1c',border:'#fecaca'},
    green:{soft:'#ecfdf3',text:'#166534',border:'#bbf7d0'}
  };
  return palettes[String(tone||'blue')]||palettes.blue;
}

/** Human-readable status category shown in the email header badge. */
function pcNotificationToneLabel_(tone) {
  if(tone==='green')return'สำเร็จ';
  if(tone==='red')return'ต้องดำเนินการ';
  if(tone==='purple')return'ฉบับแก้ไข';
  return'แจ้งสถานะ';
}

/** Extracts structured corrections from append-only audit metadata for email transparency. */
function pcCorrectionAuditForVersion_(versionId){
  if(!versionId)return[];var rows=pcFilterObjects_(PC_CONST.SHEETS.AUDIT,function(a){return String(a.VersionId)===String(versionId)&&String(a.Action)==='OFFICER_DATA_CORRECTION';});
  return rows.map(function(a){try{return JSON.parse(a.MetadataJSON||'{}');}catch(e){return{};}}).filter(function(v){return v.FieldName;});
}

/** Claims one due notification under Script Lock so concurrent workers cannot send it twice. */
function pcClaimNotification_(notificationId) {
  return pcWithScriptLock_(function(){
    var n=pcFindObject_(PC_CONST.SHEETS.NOTIFICATIONS,'NotificationId',notificationId,false);
    if(!n)return null;
    if([PC_CONST.NOTIFICATION_STATUS.PENDING,PC_CONST.NOTIFICATION_STATUS.RETRY].indexOf(String(n.Status))===-1)return null;
    if(n.NextAttemptAt&&new Date(n.NextAttemptAt).getTime()>Date.now())return null;
    return pcPatchObject_(PC_CONST.SHEETS.NOTIFICATIONS,n._rowNumber,{Status:PC_CONST.NOTIFICATION_STATUS.SENDING,LastAttemptAt:pcNowIso_(),AttemptCount:Number(n.AttemptCount||0)+1});
  });
}

/** Private trigger/admin worker: sends due notifications with exponential backoff. */
function retryNotification_() {
  var cfg=getPrecheckConfig_();if(!cfg.dbId)return{processed:0,attempted:0};
  var now=Date.now(),rows=pcListObjects_(PC_CONST.SHEETS.NOTIFICATIONS),due=rows.filter(function(n){return [PC_CONST.NOTIFICATION_STATUS.PENDING,PC_CONST.NOTIFICATION_STATUS.RETRY].indexOf(String(n.Status))!==-1&&(!n.NextAttemptAt||new Date(n.NextAttemptAt).getTime()<=now);}).slice(0,20),processed=0,attempted=0;
  due.forEach(function(candidate){
    var n=null;
    try{n=pcClaimNotification_(candidate.NotificationId);}catch(claimError){console.error('Notification claim failed: '+claimError.message);}
    if(!n)return;
    attempted++;
    try{
      var body=pcParseJson_(n.BodyPayload,'notification');
      MailApp.sendEmail({to:String(n.Recipient||''),cc:String(n.CC||''),subject:String(n.Subject||''),body:String(body.text||''),htmlBody:String(body.html||'')});
      pcWithScriptLock_(function(){var fresh=pcFindObject_(PC_CONST.SHEETS.NOTIFICATIONS,'NotificationId',n.NotificationId,false);if(fresh&&String(fresh.Status)===PC_CONST.NOTIFICATION_STATUS.SENDING)pcPatchObject_(PC_CONST.SHEETS.NOTIFICATIONS,fresh._rowNumber,{Status:PC_CONST.NOTIFICATION_STATUS.SENT,SentAt:pcNowIso_(),NextAttemptAt:'',ErrorCode:'',ErrorMessage:''});});
      processed++;
    }catch(e){
      var attempts=Number(n.AttemptCount||1),delayMinutes=Math.min(1440,Math.pow(2,Math.min(attempts,10))*5),status=attempts>=8?PC_CONST.NOTIFICATION_STATUS.FAILED:PC_CONST.NOTIFICATION_STATUS.RETRY;
      try{pcWithScriptLock_(function(){var fresh=pcFindObject_(PC_CONST.SHEETS.NOTIFICATIONS,'NotificationId',n.NotificationId,false);if(fresh)pcPatchObject_(PC_CONST.SHEETS.NOTIFICATIONS,fresh._rowNumber,{Status:status,NextAttemptAt:status===PC_CONST.NOTIFICATION_STATUS.RETRY?pcIsoAfterMinutes_(delayMinutes):'',ErrorCode:'MAIL_SEND_FAILED',ErrorMessage:String(e.message||e).substring(0,500)});});}catch(patchError){console.error('Unable to persist mail failure: '+patchError.message);}
      try{pcAudit_('EMAIL_FAILURE',{SubmissionId:n.SubmissionId,VersionId:n.VersionId},{username:'SYSTEM',displayName:'SYSTEM',email:'',roles:[]},{notificationId:n.NotificationId,error:String(e.message||e)});}catch(ignored){}
    }
  });
  return{processed:processed,attempted:attempted};
}

/** Marks stale SENDING mail as ambiguous instead of blindly resending it and risking duplicate mail. */
function reconcileStaleSendingNotifications_() {
  var cutoff=Date.now()-30*60*1000,rows=pcListObjects_(PC_CONST.SHEETS.NOTIFICATIONS),patches=[];
  rows.forEach(function(n){
    if(String(n.Status)!==PC_CONST.NOTIFICATION_STATUS.SENDING)return;
    var t=new Date(n.LastAttemptAt||0).getTime();
    if(t&&t<cutoff)patches.push({rowNumber:n._rowNumber,patch:{Status:PC_CONST.NOTIFICATION_STATUS.FAILED,NextAttemptAt:'',ErrorCode:'AMBIGUOUS_SEND_STATE',ErrorMessage:'การส่งอีเมลหยุดค้างในสถานะ SENDING; งดส่งซ้ำอัตโนมัติเพื่อป้องกันอีเมลซ้ำ'}});
  });
  pcBatchPatchObjects_(PC_CONST.SHEETS.NOTIFICATIONS,patches);
  if(patches.length)pcQueueOperationalAlertSafe_('พบสถานะอีเมลที่ต้องตรวจสอบ','พบอีเมล '+patches.length+' รายการค้างในสถานะ SENDING และระบบงดส่งซ้ำอัตโนมัติเพื่อป้องกันอีเมลซ้ำ',{});
  return{markedAmbiguous:patches.length};
}
