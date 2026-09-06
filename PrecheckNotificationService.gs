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
  return pcAppendObject_(PC_CONST.SHEETS.NOTIFICATIONS, {
    NotificationId:pcUuid_(),SubmissionId:(metadata&&metadata.submissionId)||'',VersionId:(metadata&&metadata.versionId)||'',EventType:'OPERATIONAL_FAILURE',
    Recipient:cfg.officerGroupEmail,CC:'',Subject:'['+PC_CONST.USER_FACING_NAME+'] '+String(subject||'แจ้งเตือนระบบ'),
    BodyPayload:JSON.stringify({text:String(message||''),html:'<p>'+pcEscapeHtml_(message||'')+'</p>'}),Status:PC_CONST.NOTIFICATION_STATUS.PENDING,AttemptCount:0,CreatedAt:pcNowIso_(),LastAttemptAt:'',NextAttemptAt:pcNowIso_(),SentAt:'',ErrorCode:'',ErrorMessage:''
  });
}

/** Best-effort operational alert helper; alert-storage failure never replaces the originating error. */
function pcQueueOperationalAlertSafe_(subject, message, metadata) {
  try { return pcQueueOperationalAlert_(subject, message, metadata); }
  catch (error) { console.error('Operational alert queue failed: '+String(error&&error.message||error)); return null; }
}

/** Builds Thai user-facing email content without internal project identifiers. */
function pcBuildNotificationContent_(eventType, submission, version, extra) {
  var docNo=String(submission.DocumentNumber||''),name=String(submission.DocumentNameSnapshot||''),ver=version?Number(version.VersionNo||0):Number(submission.CurrentVersion||0);
  var baseUrl=ScriptApp.getService().getUrl(),deep=baseUrl+'?page=PrecheckDetail&submission='+encodeURIComponent(submission.SubmissionId);
  var subject='',lines=['หมายเลขเอกสาร: '+docNo,'ชื่อเอกสาร: '+name,'Version: V'+ver];
  if(eventType==='SUBMISSION_RECEIVED'){subject='['+PC_CONST.USER_FACING_NAME+'] รับรายงานเข้าสู่การตรวจแล้ว — '+docNo;lines.push('สถานะ: รอตรวจ');}
  else if(eventType==='REVISION_SUBMITTED'){subject='['+PC_CONST.USER_FACING_NAME+'] รับรายงานฉบับแก้ไขแล้ว — '+docNo;lines.push('สถานะ: รอตรวจฉบับแก้ไข');}
  else if(eventType==='REVISION_REQUIRED'){
    subject='['+PC_CONST.USER_FACING_NAME+'] ผลการตรวจรายงาน — ต้องแก้ไข — '+docNo;
    var review=extra.review||{},responses=extra.responses||{},itemsById={},quickById={};pcTemplateItems_(submission.TemplateId).forEach(function(i){itemsById[i.ItemId]=i;});pcListObjects_(PC_CONST.SHEETS.QUICK_COMMENTS).forEach(function(q){quickById[String(q.QuickCommentId)]=String(q.FullText||q.Label||'');});
    if(review.CompletedAt) lines.push('วันที่ตรวจ: '+String(review.CompletedAt));
    if(review.ReviewerName||review.ReviewerEmail) lines.push('ผู้ตรวจ: '+String(review.ReviewerName||review.ReviewerEmail));
    var fixes=[];Object.keys(responses).forEach(function(id){var r=responses[id];if(String(r.result)!==PC_CONST.REVIEW_RESULT.FIX)return;var item=itemsById[id]||{},quickTexts=(r.quickCommentIds||[]).map(function(qid){return quickById[String(qid)]||'';}).filter(String);fixes.push({page:r.pageNumber||'',label:item.ItemLabel||id,comment:r.comment||'',quickTexts:quickTexts});});
    fixes.sort(function(a,b){return Number(a.page||999999)-Number(b.page||999999);});
    lines.push('จำนวนรายการที่ต้องแก้ไข: '+fixes.length);fixes.forEach(function(f,index){var comment=f.comment||f.quickTexts.join('; ');lines.push((index+1)+'. '+(f.page?'หน้า '+f.page+' — ':'')+f.label+(comment?' — '+comment:''));});
    var corrections=pcCorrectionAuditForVersion_(version&&version.VersionId);if(corrections.length){lines.push('เจ้าหน้าที่ได้ปรับแก้ข้อมูลสรุปในระบบ:');corrections.forEach(function(c){lines.push('- '+c.FieldName+': '+c.OldValue+' → '+c.NewValue+' ('+c.Reason+')');});}
  } else if(eventType==='FINAL_SUCCESS'){subject='['+PC_CONST.USER_FACING_NAME+'] รายงานผ่านการตรวจและบันทึกเรียบร้อยแล้ว — '+docNo;lines.push('สถานะ: บันทึกเป็นเอกสารฉบับสมบูรณ์แล้ว');if(submission.FinalFileUrl)lines.push('ไฟล์ฉบับสมบูรณ์: '+submission.FinalFileUrl);var finalCorrections=pcCorrectionAuditForVersion_(version&&version.VersionId);if(finalCorrections.length){lines.push('เจ้าหน้าที่ได้ปรับแก้ข้อมูลสรุปในระบบ:');finalCorrections.forEach(function(c){lines.push('- '+c.FieldName+': '+c.OldValue+' → '+c.NewValue+' ('+c.Reason+')');});}}
  lines.push('เปิดรายละเอียด: '+deep);
  var text=lines.join('\n');
  var html='<div style="font-family:Arial,\'Noto Sans Thai\',sans-serif;line-height:1.7"><h2>'+pcEscapeHtml_(PC_CONST.USER_FACING_NAME)+'</h2>'+lines.map(function(line){return '<div>'+pcEscapeHtml_(line)+'</div>';}).join('')+'</div>';
  return {subject:subject,text:text,html:html};
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
