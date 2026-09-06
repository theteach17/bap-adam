/** Starts or resumes a server-owned Google Drive resumable upload and returns only an opaque UploadSessionId. */
function beginChunkUpload(metadata) {
  try {
    var principal = getCurrentPrincipal_();
    var cfg = requireUploadConfig_();
    metadata = metadata || {};
    var fileName = String(metadata.fileName || '').trim();
    var mimeType = String(metadata.mimeType || '').toLowerCase().trim();
    var totalSize = Number(metadata.totalSize || 0);
    if (!fileName || !/\.pdf$/i.test(fileName)) throw pcUserError_('รองรับเฉพาะไฟล์ PDF เท่านั้น', 'INVALID_EXTENSION');
    if (mimeType !== 'application/pdf') throw pcUserError_('รองรับเฉพาะไฟล์ PDF เท่านั้น', 'INVALID_MIME');
    if (!isFinite(totalSize) || totalSize <= 0) throw pcUserError_('ขนาดไฟล์ไม่ถูกต้อง', 'INVALID_FILE_SIZE');
    if (totalSize > cfg.maxFileMb * 1024 * 1024) throw pcUserError_('ไฟล์มีขนาดเกิน ' + cfg.maxFileMb + ' MB', 'FILE_TOO_LARGE');

    var document = pcMasterDocument_(metadata.documentNumber, true);
    if (!document) throw pcUserError_('ไม่พบหมายเลขเอกสารนี้', 'DOCUMENT_NOT_FOUND');
    if (document.finalLink) throw pcUserError_('เอกสารนี้ได้รับการบันทึกเป็นเอกสารฉบับสมบูรณ์แล้ว', 'ALREADY_FINAL');
    var purpose = pcResolveUploadPurpose_(metadata, document);
    var destinationFolderId = '', storedName = '', submissionId = '', versionId = '';
    var submission = null, version = null;

    if (purpose === PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT) {
      if (document.documentType !== PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY || !isPrecheckAvailable_(document)) throw pcUserError_('Workflow อัปโหลดไม่ตรงกับประเภทเอกสาร', 'WORKFLOW_MISMATCH');
      if (!cfg.stagingFolderId) throw pcUserError_('ระบบ Pre-check ยังไม่ได้ตั้งค่าพื้นที่ Staging', 'STAGING_MISSING');
      submission = pcSubmissionById_(metadata.submissionId);
      version = pcVersionById_(metadata.versionId);
      if (!submission || !version || String(version.SubmissionId) !== String(submission.SubmissionId) || normalizeDocumentNumberForPrecheck_(submission.DocumentNumber) !== document.documentNumber) throw pcUserError_('ข้อมูลฉบับเอกสารไม่ถูกต้อง', 'VERSION_MISMATCH');
      if (!pcCanEditSubmission_(submission, principal)) throw pcUserError_('คุณไม่มีสิทธิ์อัปโหลดไฟล์สำหรับรายการนี้', 'FORBIDDEN');
      if (version.FileId) throw pcUserError_('ฉบับนี้มีไฟล์แล้ว กรุณาสร้างฉบับแก้ไขใหม่แทนการแทนที่ไฟล์เดิม', 'VERSION_IMMUTABLE');
      submissionId = submission.SubmissionId; versionId = version.VersionId;
      var existing = pcFindActiveUploadRecord_(principal, document.documentNumber, purpose, submissionId, versionId);
      if (existing) {
        if (Number(existing.totalSize) !== totalSize || String(existing.fileName) !== fileName) throw pcUserError_('มี Upload session เดิมของไฟล์อื่น กรุณาเลือกไฟล์เดิมหรือรอ session หมดอายุ', 'ACTIVE_UPLOAD_FILE_MISMATCH');
        return { uploadSessionId:existing.uploadSessionId, chunkSize:cfg.chunkSizeBytes, expiry:existing.expiresAt, resumed:true, nextByte:Number(existing.expectedNextByte||0) };
      }
      if (String(version.VersionStatus) === PC_CONST.VERSION_STATUS.UPLOADING) {
        pcWithScriptLock_(function(){
          var fv=pcVersionById_(versionId), fs=pcSubmissionById_(submissionId);
          if (fv && !fv.FileId && String(fv.VersionStatus)===PC_CONST.VERSION_STATUS.UPLOADING) pcPatchObject_(PC_CONST.SHEETS.VERSIONS,fv._rowNumber,{VersionStatus:PC_CONST.VERSION_STATUS.DRAFT});
          if (fs && String(fs.Status)===PC_CONST.STATUS.UPLOADING) pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,fs._rowNumber,{Status:Number(fs.CurrentVersion||0)>0?PC_CONST.STATUS.REVISION_REQUIRED:PC_CONST.STATUS.DRAFT,UpdatedAt:pcNowIso_()});
        });
        version = pcVersionById_(versionId); submission = pcSubmissionById_(submissionId);
      }
      if (String(version.VersionStatus) !== PC_CONST.VERSION_STATUS.DRAFT) throw pcUserError_('สถานะฉบับเอกสารไม่อนุญาตให้อัปโหลด', 'INVALID_VERSION_STATE');
      if ([PC_CONST.STATUS.DRAFT,PC_CONST.STATUS.REVISION_REQUIRED].indexOf(String(submission.Status))===-1) throw pcUserError_('สถานะรายการไม่อนุญาตให้อัปโหลด', 'INVALID_SUBMISSION_STATE');
      destinationFolderId = cfg.stagingFolderId;
      storedName = pcSafeFileName_(document.documentNumber + '-V' + version.VersionNo + '-' + fileName.replace(/\.pdf$/i,'')) + '.pdf';
    } else {
      var existingLegacy = pcFindActiveUploadRecord_(principal, document.documentNumber, purpose, '', '');
      if (existingLegacy) {
        if (Number(existingLegacy.totalSize) !== totalSize || String(existingLegacy.fileName) !== fileName) throw pcUserError_('มี Upload session เดิมของไฟล์อื่น กรุณาเลือกไฟล์เดิมหรือรอ session หมดอายุ', 'ACTIVE_UPLOAD_FILE_MISMATCH');
        return { uploadSessionId:existingLegacy.uploadSessionId, chunkSize:cfg.chunkSizeBytes, expiry:existingLegacy.expiresAt, resumed:true, nextByte:Number(existingLegacy.expectedNextByte||0) };
      }
      destinationFolderId = pcFinalFolderIdForAdminGroup_(document.adminGroup);
      storedName = purpose === PC_CONST.UPLOAD_PURPOSE.NON_COMPLETED
        ? pcSafeFileName_('ไม่ได้ดำเนินการ-' + document.documentNumber + '-' + document.documentName) + '.pdf'
        : pcSafeFileName_(document.documentNumber + '-' + document.documentName) + '.pdf';
    }

    pcDriveFolder_(destinationFolderId, 'อัปโหลด');
    // Network operation is intentionally outside Script Lock.
    var sessionUri = pcCreateDriveResumableSession_(storedName, totalSize, destinationFolderId);
    var uploadSessionId = pcUuid_();
    var record = {
      uploadSessionId:uploadSessionId, sessionUri:sessionUri, submissionId:submissionId, versionId:versionId,
      documentNumber:document.documentNumber, documentType:document.documentType, purpose:purpose, ownerPrincipal:pcPrincipalKey_(principal), ownerUsername:principal.username||'', ownerEmail:principal.email||'', fileName:fileName,
      storedFileName:storedName, mimeType:mimeType, totalSize:totalSize, expectedNextByte:0, createdAt:pcNowIso_(),
      lastActivityAt:pcNowIso_(), expiresAt:pcIsoAfterMinutes_(cfg.uploadExpireMinutes), finalized:false,
      destinationFolderId:destinationFolderId, fileId:'', fileUrl:''
    };
    if (purpose === PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT) {
      pcWithScriptLock_(function(){
        var freshVersion=pcVersionById_(versionId), freshSubmission=pcSubmissionById_(submissionId);
        if (!freshVersion || !freshSubmission || freshVersion.FileId) throw pcUserError_('ฉบับนี้มีไฟล์แล้ว', 'VERSION_IMMUTABLE');
        if (String(freshVersion.VersionStatus)!==PC_CONST.VERSION_STATUS.DRAFT || [PC_CONST.STATUS.DRAFT,PC_CONST.STATUS.REVISION_REQUIRED].indexOf(String(freshSubmission.Status))===-1) throw pcUserError_('สถานะรายการเปลี่ยนไป กรุณาโหลดใหม่', 'UPLOAD_STATE_CHANGED');
        PropertiesService.getScriptProperties().setProperty(PC_CONST.PROP_PREFIX.UPLOAD + uploadSessionId, JSON.stringify(record));
        pcPatchObject_(PC_CONST.SHEETS.VERSIONS, freshVersion._rowNumber, { VersionStatus:PC_CONST.VERSION_STATUS.UPLOADING });
        pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS, freshSubmission._rowNumber, { Status:PC_CONST.STATUS.UPLOADING, UpdatedAt:pcNowIso_() });
      });
    } else {
      PropertiesService.getScriptProperties().setProperty(PC_CONST.PROP_PREFIX.UPLOAD + uploadSessionId, JSON.stringify(record));
    }
    pcAudit_('UPLOAD_START', {SubmissionId:submissionId,VersionId:versionId}, principal, { documentNumber:document.documentNumber, purpose:purpose, totalSize:totalSize });
    return { uploadSessionId:uploadSessionId, chunkSize:cfg.chunkSizeBytes, expiry:record.expiresAt, resumed:false, nextByte:0 };
  } catch (error) {
    throw pcHandlePublicError_(error, 'beginChunkUpload', {});
  }
}

/** Finds an unexpired upload session owned by the principal for safe resume/double-click idempotency. */
function pcFindActiveUploadRecord_(principal, documentNumber, purpose, submissionId, versionId) {
  var props=PropertiesService.getScriptProperties().getProperties(), prefix=PC_CONST.PROP_PREFIX.UPLOAD, owner=pcPrincipalKey_(principal), found=null;
  Object.keys(props).forEach(function(key){
    if (key.indexOf(prefix)!==0 || key.indexOf(PC_CONST.PROP_PREFIX.UPLOAD_DONE)===0) return;
    try {
      var r=JSON.parse(props[key]);
      if (pcIsoExpired_(r.expiresAt)) return; // Drive-completed records remain resumable until finalizeUpload() persists the binding.
      if (r.ownerPrincipal!==owner || normalizeDocumentNumberForPrecheck_(r.documentNumber)!==normalizeDocumentNumberForPrecheck_(documentNumber) || String(r.purpose)!==String(purpose)) return;
      if (String(r.submissionId||'')!==String(submissionId||'') || String(r.versionId||'')!==String(versionId||'')) return;
      if (!found || String(r.lastActivityAt||r.createdAt)>String(found.lastActivityAt||found.createdAt)) found=r;
    } catch (e) {}
  });
  return found;
}

/** Returns resumable state for a selected draft after browser interruption without exposing the Drive session URI. */
function getActiveUploadSession(submissionId, versionId) {
  try {
    var principal=getCurrentPrincipal_(), submission=pcSubmissionById_(submissionId), version=pcVersionById_(versionId);
    if (!submission || !version || String(version.SubmissionId)!==String(submissionId) || !pcCanEditSubmission_(submission,principal)) throw pcUserError_('ไม่พบ Upload session ที่สามารถดำเนินการต่อได้','UPLOAD_SESSION_MISSING');
    var r=pcFindActiveUploadRecord_(principal,submission.DocumentNumber,PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT,submissionId,versionId);
    if (!r) return {active:false};
    var progress=queryUploadProgress(r.uploadSessionId);
    return {active:!progress.completed,uploadSessionId:r.uploadSessionId,fileName:r.fileName,totalSize:Number(r.totalSize),nextByte:Number(progress.nextByte||0),percent:Number(progress.percent||0),expiry:r.expiresAt};
  } catch(error){ throw pcHandlePublicError_(error,'getActiveUploadSession',{submissionId:submissionId,versionId:versionId}); }
}

/** Creates the Google resumable session URI entirely on the server. */
function pcCreateDriveResumableSession_(fileName, totalSize, folderId) {
  var response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,parents,webViewLink', {
    method:'post',
    headers:{ Authorization:'Bearer ' + ScriptApp.getOAuthToken(), 'Content-Type':'application/json; charset=UTF-8', 'X-Upload-Content-Type':'application/pdf', 'X-Upload-Content-Length':String(totalSize) },
    payload:JSON.stringify({ name:fileName, mimeType:'application/pdf', parents:[folderId] }),
    muteHttpExceptions:true
  });
  var code = response.getResponseCode();
  var headers = response.getAllHeaders ? response.getAllHeaders() : response.getHeaders();
  var location = headers.Location || headers.location || '';
  if (code < 200 || code >= 300 || !location) throw new Error('Drive resumable session creation failed: HTTP ' + code + ' ' + response.getContentText());
  return String(location);
}

/** Resolves upload purpose from trusted document type plus server-side workflow state. */
function pcResolveUploadPurpose_(metadata, document) {
  var requested = String(metadata.purpose || metadata.uploadPurpose || '').trim();
  if (metadata.submissionId && metadata.versionId) return PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT;
  if (document.documentType === PC_CONST.DOCUMENT_TYPES.NON_COMPLETED_MEMO) return PC_CONST.UPLOAD_PURPOSE.NON_COMPLETED;
  if (document.documentType === PC_CONST.DOCUMENT_TYPES.OTHER_DOCUMENT) return PC_CONST.UPLOAD_PURPOSE.OTHER_DOCUMENT;
  if (document.documentType === PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY) {
    if (shouldEnforcePrecheck_(document, getCurrentPrincipal_())) throw pcUserError_('รายงานประเภทนี้ต้องส่งผ่านระบบ Pre-check', 'PRECHECK_REQUIRED');
    return PC_CONST.UPLOAD_PURPOSE.LEGACY_REPORT;
  }
  throw pcUserError_('ประเภทเอกสารไม่รองรับการอัปโหลด', 'UNKNOWN_DOCUMENT_TYPE');
}

/** Loads and revalidates an opaque upload session against current workflow state on every request. */
function pcUploadSession_(uploadSessionId, totalSize, allowFinalized) {
  var id=String(uploadSessionId||'').trim();
  if (!id) throw pcUserError_('Upload session ไม่ถูกต้อง','UPLOAD_SESSION_INVALID');
  var key=PC_CONST.PROP_PREFIX.UPLOAD+id, raw=PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) throw pcUserError_('Upload session หมดอายุหรือไม่พบ กรุณาเริ่มอัปโหลดใหม่','UPLOAD_SESSION_MISSING');
  var record=pcParseJson_(raw,'upload session'), principal=getCurrentPrincipal_(), cfg=requireUploadConfig_();
  if (pcIsoExpired_(record.expiresAt)) throw pcUserError_('Upload session หมดอายุ กรุณาเริ่มอัปโหลดใหม่','UPLOAD_SESSION_EXPIRED');
  if (record.ownerPrincipal!==pcPrincipalKey_(principal)) throw pcUserError_('Upload session นี้ไม่ได้เป็นของผู้ใช้งานปัจจุบัน','UPLOAD_OWNER_MISMATCH');
  if (totalSize!=null && Number(record.totalSize)!==Number(totalSize)) throw pcUserError_('ขนาดไฟล์ไม่ตรงกับ Upload session','UPLOAD_SIZE_MISMATCH');
  if (Number(record.totalSize)>cfg.maxFileMb*1024*1024) throw pcUserError_('ไฟล์มีขนาดเกินค่าที่ระบบอนุญาต','FILE_TOO_LARGE');
  if (record.finalized && !allowFinalized) throw pcUserError_('Upload session นี้เสร็จสิ้นแล้ว','UPLOAD_ALREADY_FINAL');
  var document=pcMasterDocument_(record.documentNumber,true);
  if (!document || document.finalLink) throw pcUserError_('สถานะเอกสารเปลี่ยนไปและไม่อนุญาตให้อัปโหลดต่อ','UPLOAD_DOCUMENT_CHANGED');
  if (String(document.documentType)!==String(record.documentType||document.documentType)) throw pcUserError_('ประเภทเอกสารไม่ตรงกับ Upload session','UPLOAD_WORKFLOW_MISMATCH');
  if (record.purpose===PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT) {
    var submission=pcSubmissionById_(record.submissionId), version=pcVersionById_(record.versionId);
    if (!submission || !version || String(version.SubmissionId)!==String(submission.SubmissionId) || normalizeDocumentNumberForPrecheck_(submission.DocumentNumber)!==document.documentNumber) throw pcUserError_('Upload session ไม่ตรงกับฉบับเอกสาร','UPLOAD_VERSION_MISMATCH');
    if (!pcCanEditSubmission_(submission,principal)) throw pcUserError_('คุณไม่มีสิทธิ์อัปโหลดไฟล์สำหรับรายการนี้','FORBIDDEN');
    if (!record.finalized && (String(submission.Status)!==PC_CONST.STATUS.UPLOADING || String(version.VersionStatus)!==PC_CONST.VERSION_STATUS.UPLOADING || version.FileId)) throw pcUserError_('สถานะ Upload เปลี่ยนไป กรุณาโหลดหน้าใหม่','UPLOAD_STATE_CHANGED');
    if (document.documentType!==PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY || !isPrecheckAvailable_(document)) throw pcUserError_('Workflow อัปโหลดไม่ตรงกับเอกสาร','UPLOAD_WORKFLOW_MISMATCH');
  } else {
    var validPurpose=(record.purpose===PC_CONST.UPLOAD_PURPOSE.NON_COMPLETED && document.documentType===PC_CONST.DOCUMENT_TYPES.NON_COMPLETED_MEMO) ||
      (record.purpose===PC_CONST.UPLOAD_PURPOSE.OTHER_DOCUMENT && document.documentType===PC_CONST.DOCUMENT_TYPES.OTHER_DOCUMENT) ||
      (record.purpose===PC_CONST.UPLOAD_PURPOSE.LEGACY_REPORT && document.documentType===PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY && !shouldEnforcePrecheck_(document,principal));
    if (!validPurpose) throw pcUserError_('Workflow อัปโหลดไม่ตรงกับประเภทเอกสาร','UPLOAD_WORKFLOW_MISMATCH');
  }
  record._propertyKey=key;
  return record;
}

/** Uploads one verified chunk; lost responses can be recovered with queryUploadProgress(). */
function uploadChunkSecure_(uploadSessionId, chunkBase64, startByte, endByte, totalSize) {
  var cfg = requireUploadConfig_();
  var record = pcUploadSession_(uploadSessionId, totalSize, false);
  startByte = Number(startByte); endByte = Number(endByte); totalSize = Number(totalSize);
  if (startByte !== Number(record.expectedNextByte)) throw pcUserError_('ตำแหน่ง Chunk ไม่ตรงกับสถานะบน Server กรุณา Resume จากตำแหน่งล่าสุด', 'UPLOAD_OFFSET_MISMATCH');
  if (endByte < startByte || endByte >= totalSize) throw pcUserError_('Byte range ไม่ถูกต้อง', 'UPLOAD_RANGE_INVALID');
  var bytes = Utilities.base64Decode(String(chunkBase64 || ''));
  if (bytes.length !== endByte - startByte + 1) throw pcUserError_('ขนาด Chunk ไม่ตรงกับ Byte range', 'UPLOAD_CHUNK_SIZE_MISMATCH');
  if (bytes.length > cfg.chunkSizeBytes) throw pcUserError_('Chunk มีขนาดเกินค่าที่ระบบอนุญาต', 'UPLOAD_CHUNK_TOO_LARGE');
  var response = UrlFetchApp.fetch(record.sessionUri, {
    method:'put', payload:bytes,
    headers:{ Authorization:'Bearer ' + ScriptApp.getOAuthToken(), 'Content-Type':'application/pdf', 'Content-Range':'bytes ' + startByte + '-' + endByte + '/' + totalSize },
    muteHttpExceptions:true
  });
  var code = response.getResponseCode();
  var nextByte = endByte + 1, completed = false, fileId = '';
  if (code === 308) {
    var headers = response.getAllHeaders ? response.getAllHeaders() : response.getHeaders();
    var range = String(headers.Range || headers.range || '');
    var match = range.match(/bytes=0-(\d+)/i);
    nextByte = match ? Number(match[1]) + 1 : endByte + 1;
  } else if (code >= 200 && code < 300) {
    var body = pcParseJson_(response.getContentText() || '{}', 'Drive upload response');
    fileId = String(body.id || '').trim();
    if (!fileId) throw new Error('Drive upload completed without file id');
    nextByte = totalSize; completed = true;
  } else {
    throw new Error('Drive chunk upload failed: HTTP ' + code + ' ' + response.getContentText());
  }
  record.expectedNextByte = nextByte; record.lastActivityAt = pcNowIso_(); record.expiresAt = pcIsoAfterMinutes_(cfg.uploadExpireMinutes);
  if (completed) { record.finalized = true; record.fileId = fileId; }
  PropertiesService.getScriptProperties().setProperty(record._propertyKey, JSON.stringify(pcStripTransient_(record)));
  return { status:completed?'COMPLETED':'UPLOADING', nextByte:nextByte, percent:Math.min(100, Math.round(nextByte * 100 / totalSize)), completed:completed };
}

/** Removes non-persisted helper fields before storing records. */
function pcStripTransient_(record) {
  var copy = {};
  Object.keys(record).forEach(function(k){ if (k.charAt(0) !== '_') copy[k] = record[k]; });
  return copy;
}

/** Queries the trusted Google resumable URI without relying on browser state. */
function pcQueryDriveResumableState_(record) {
  var response = UrlFetchApp.fetch(record.sessionUri, {
    method:'put', payload:Utilities.newBlob('').getBytes(),
    headers:{ Authorization:'Bearer ' + ScriptApp.getOAuthToken(), 'Content-Range':'bytes */' + record.totalSize },
    muteHttpExceptions:true
  });
  var code=response.getResponseCode(),nextByte=Number(record.expectedNextByte||0),fileId='';
  if(code===308){
    var headers=response.getAllHeaders?response.getAllHeaders():response.getHeaders();
    var range=String(headers.Range||headers.range||''),match=range.match(/bytes=0-(\d+)/i);
    nextByte=match?Number(match[1])+1:0;
    return{state:'INCOMPLETE',code:code,nextByte:nextByte,fileId:''};
  }
  if(code>=200&&code<300){
    var body=pcParseJson_(response.getContentText()||'{}','Drive progress response');fileId=String(body.id||'').trim();
    if(fileId)return{state:'COMPLETED',code:code,nextByte:Number(record.totalSize),fileId:fileId};
    return{state:'AMBIGUOUS',code:code,nextByte:nextByte,fileId:''};
  }
  if(code===404||code===410)return{state:'EXPIRED',code:code,nextByte:nextByte,fileId:''};
  return{state:'ERROR',code:code,nextByte:nextByte,fileId:'',message:String(response.getContentText()||'').substring(0,500)};
}

/** Recovers a completed expired Pre-check upload by binding the server-known FileId without requiring a browser retry. */
function pcRecoverCompletedPrecheckUpload_(record, fileId) {
  if(String(record.purpose)!==PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT)return false;
  var file=pcValidateDrivePdf_(fileId,record.totalSize,record.destinationFolderId);
  return pcWithScriptLock_(function(){
    var version=pcVersionById_(record.versionId),submission=pcSubmissionById_(record.submissionId);
    if(!version||!submission||String(version.SubmissionId)!==String(submission.SubmissionId))return false;
    if(version.FileId&&String(version.FileId)!==String(file.getId()))return false;
    if(!version.FileId){
      pcPatchObject_(PC_CONST.SHEETS.VERSIONS,version._rowNumber,{VersionStatus:PC_CONST.VERSION_STATUS.UPLOADED,FileId:file.getId(),FileUrl:file.getUrl(),OriginalFileName:record.fileName||'',StoredFileName:file.getName(),FileSizeBytes:file.getSize(),MimeType:file.getMimeType(),UploadedAt:pcNowIso_(),UploadedByUsername:record.ownerUsername||'',UploadedByEmail:record.ownerEmail||''});
    }
    if(String(submission.Status)===PC_CONST.STATUS.UPLOADING)pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,submission._rowNumber,{Status:Number(submission.CurrentVersion||0)>0?PC_CONST.STATUS.REVISION_REQUIRED:PC_CONST.STATUS.DRAFT,UpdatedAt:pcNowIso_()});
    return true;
  });
}

/** Queries Google's actual expected offset after an ambiguous client/server response. */
function queryUploadProgress(uploadSessionId) {
  try {
    var doneRaw = PropertiesService.getScriptProperties().getProperty(PC_CONST.PROP_PREFIX.UPLOAD_DONE + String(uploadSessionId || '').trim());
    if (doneRaw) {
      var done = pcParseJson_(doneRaw, 'completed upload');
      if (done.ownerPrincipal && done.ownerPrincipal !== pcPrincipalKey_(getCurrentPrincipal_())) throw pcUserError_('Upload session นี้ไม่ได้เป็นของผู้ใช้งานปัจจุบัน', 'UPLOAD_OWNER_MISMATCH');
      return { status:'COMPLETED', nextByte:Number(done.totalSize || 0), percent:100, completed:true, fileBindingId:done.fileBindingId || '', versionId:done.versionId || '' };
    }
    var record = pcUploadSession_(uploadSessionId, null, true);
    if (record.finalized) return { status:'COMPLETED', nextByte:Number(record.totalSize), percent:100, completed:true };
    var state=pcQueryDriveResumableState_(record),completed=state.state==='COMPLETED',nextByte=Number(state.nextByte||0),fileId=String(state.fileId||'');
    if(state.state==='EXPIRED')throw pcUserError_('Upload session หมดอายุ กรุณาเริ่มอัปโหลดใหม่','UPLOAD_SESSION_EXPIRED');
    if(state.state==='ERROR'||state.state==='AMBIGUOUS')throw new Error('Drive progress query failed: HTTP '+state.code+' '+String(state.message||state.state));
    record.expectedNextByte = nextByte; record.lastActivityAt = pcNowIso_();
    if (completed) { record.finalized = true; record.fileId = fileId; }
    PropertiesService.getScriptProperties().setProperty(record._propertyKey, JSON.stringify(pcStripTransient_(record)));
    return { status:completed?'COMPLETED':'UPLOADING', nextByte:nextByte, percent:Math.min(100, Math.round(nextByte * 100 / Number(record.totalSize))), completed:completed };
  } catch (error) { throw pcHandlePublicError_(error, 'queryUploadProgress', { uploadSessionId:String(uploadSessionId||'') }); }
}

/** Finalizes an upload idempotently, binds the server-resolved FileId, and destroys the trusted session URI. */
function finalizeUpload(uploadSessionId) {
  try {
    var principal=getCurrentPrincipal_(), props=PropertiesService.getScriptProperties(), doneKey=PC_CONST.PROP_PREFIX.UPLOAD_DONE+String(uploadSessionId||'').trim();
    var doneRaw=props.getProperty(doneKey);
    if (doneRaw) {
      var done=pcParseJson_(doneRaw,'completed upload');
      if (done.ownerPrincipal && done.ownerPrincipal!==pcPrincipalKey_(principal)) throw pcUserError_('Upload session นี้ไม่ได้เป็นของผู้ใช้งานปัจจุบัน','UPLOAD_OWNER_MISMATCH');
      return {success:true,purpose:done.purpose||'',submissionId:done.submissionId||'',versionId:done.versionId||'',fileBindingId:done.fileBindingId||'',idempotent:true};
    }
    var record=pcUploadSession_(uploadSessionId,null,true);
    if (!record.finalized || !record.fileId) {
      var progress=queryUploadProgress(uploadSessionId);
      if (!progress.completed) throw pcUserError_('ไฟล์ยังอัปโหลดไม่ครบ กรุณารอให้อัปโหลดเสร็จ','UPLOAD_INCOMPLETE');
      record=pcUploadSession_(uploadSessionId,null,true);
    }
    var file=pcValidateDrivePdf_(record.fileId,record.totalSize,record.destinationFolderId), result={success:true,purpose:record.purpose};
    if (record.purpose===PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT) {
      pcWithScriptLock_(function(){
        var version=pcVersionById_(record.versionId),submission=pcSubmissionById_(record.submissionId);
        if (!version||!submission||String(version.SubmissionId)!==String(submission.SubmissionId)) throw pcUserError_('ไม่พบฉบับเอกสารสำหรับผูกไฟล์','VERSION_NOT_FOUND');
        if (!pcCanEditSubmission_(submission,principal)) throw pcUserError_('คุณไม่มีสิทธิ์อัปโหลดไฟล์สำหรับรายการนี้','FORBIDDEN');
        if (version.FileId && String(version.FileId)!==String(file.getId())) throw pcUserError_('ฉบับนี้มีไฟล์อื่นอยู่แล้วและห้ามแทนที่','VERSION_IMMUTABLE');
        if (!version.FileId) {
          if (String(version.VersionStatus)!==PC_CONST.VERSION_STATUS.UPLOADING || String(submission.Status)!==PC_CONST.STATUS.UPLOADING) throw pcUserError_('สถานะ Upload เปลี่ยนไป กรุณาโหลดหน้าใหม่','UPLOAD_STATE_CHANGED');
          pcPatchObject_(PC_CONST.SHEETS.VERSIONS,version._rowNumber,{VersionStatus:PC_CONST.VERSION_STATUS.UPLOADED,FileId:file.getId(),FileUrl:file.getUrl(),OriginalFileName:record.fileName,StoredFileName:file.getName(),FileSizeBytes:file.getSize(),MimeType:file.getMimeType(),UploadedAt:pcNowIso_(),UploadedByUsername:principal.username,UploadedByEmail:principal.email});
          pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,submission._rowNumber,{Status:Number(submission.CurrentVersion||0)>0?PC_CONST.STATUS.REVISION_REQUIRED:PC_CONST.STATUS.DRAFT,UpdatedAt:pcNowIso_()});
        }
      });
      result.submissionId=record.submissionId;result.versionId=record.versionId;
    } else {
      var bindingId=pcUuid_();
      props.setProperty(PC_CONST.PROP_PREFIX.FILE_BIND+bindingId,JSON.stringify({bindingId:bindingId,fileId:file.getId(),fileUrl:file.getUrl(),documentNumber:record.documentNumber,purpose:record.purpose,ownerPrincipal:record.ownerPrincipal,createdAt:pcNowIso_(),expiresAt:pcIsoAfterMinutes_(60),used:false}));
      result.fileBindingId=bindingId;
    }
    var done={purpose:record.purpose,documentNumber:record.documentNumber,completedAt:pcNowIso_(),submissionId:record.submissionId||'',versionId:record.versionId||'',fileBindingId:result.fileBindingId||'',totalSize:record.totalSize,ownerPrincipal:record.ownerPrincipal};
    props.setProperty(doneKey,JSON.stringify(done));
    props.deleteProperty(record._propertyKey);
    pcAudit_('UPLOAD_COMPLETE',{SubmissionId:record.submissionId,VersionId:record.versionId},principal,{documentNumber:record.documentNumber,purpose:record.purpose,fileSize:record.totalSize});
    return result;
  } catch(error){ throw pcHandlePublicError_(error,'finalizeUpload',{uploadSessionId:String(uploadSessionId||'')}); }
}

/** Resolves an opaque legacy file binding; arbitrary Drive FileIds are rejected. */
function resolveLegacyFileBinding_(bindingId, documentNumber, allowedPurposes, allowUsed) {
  var raw = PropertiesService.getScriptProperties().getProperty(PC_CONST.PROP_PREFIX.FILE_BIND + String(bindingId || '').trim());
  if (!raw) throw pcUserError_('ข้อมูลไฟล์อัปโหลดไม่ถูกต้องหรือหมดอายุ กรุณาอัปโหลดใหม่', 'FILE_BINDING_INVALID');
  var binding = pcParseJson_(raw, 'file binding');
  if (pcIsoExpired_(binding.expiresAt)) throw pcUserError_('ข้อมูลไฟล์อัปโหลดหมดอายุ กรุณาอัปโหลดใหม่', 'FILE_BINDING_EXPIRED');
  if (binding.ownerPrincipal !== pcPrincipalKey_(getCurrentPrincipal_())) throw pcUserError_('ไฟล์นี้ไม่ได้เป็นของผู้ใช้งานปัจจุบัน', 'FILE_BINDING_OWNER');
  if (normalizeDocumentNumberForPrecheck_(binding.documentNumber) !== normalizeDocumentNumberForPrecheck_(documentNumber)) throw pcUserError_('ไฟล์ไม่ตรงกับหมายเลขเอกสาร', 'FILE_BINDING_DOCUMENT');
  if (allowedPurposes && allowedPurposes.indexOf(String(binding.purpose)) === -1) throw pcUserError_('ไฟล์ไม่ตรงกับ Workflow เอกสาร', 'FILE_BINDING_WORKFLOW');
  if (binding.used && !allowUsed) throw pcUserError_('ไฟล์นี้ถูกบันทึกแล้ว กรุณาตรวจสอบรายการก่อนส่งซ้ำ', 'FILE_BINDING_USED');
  return binding;
}

/** Marks a legacy binding used only after the legacy transaction succeeds. */
function markLegacyFileBindingUsed_(bindingId) {
  var key = PC_CONST.PROP_PREFIX.FILE_BIND + String(bindingId || '').trim();
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return;
  var binding = pcParseJson_(raw, 'file binding'); binding.used = true; binding.usedAt = pcNowIso_();
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(binding));
}

/** Legacy-compatible chunk response that exposes only an opaque binding id at completion. */
function uploadChunkLegacyCompatible_(uploadSessionId, chunkBase64, startByte, endByte, totalSize) {
  var result = uploadChunkSecure_(uploadSessionId, chunkBase64, startByte, endByte, totalSize);
  if (!result.completed) return { status:result.status, statusCode:308, headers:{}, content:'', nextByte:result.nextByte, percent:result.percent, completed:false };
  var record = pcUploadSession_(uploadSessionId, null, true);
  if (record.purpose === PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT) {
    return { status:'COMPLETED', statusCode:200, headers:{}, content:'', nextByte:result.nextByte, percent:100, completed:true };
  }
  var finalized = finalizeUpload(uploadSessionId);
  return { status:'COMPLETED', statusCode:200, headers:{}, content:JSON.stringify({ id:finalized.fileBindingId || '' }), nextByte:result.nextByte, percent:100, completed:true };
}
