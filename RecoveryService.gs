/** Private hourly trigger: reconciles recoverable states without blind deletion. */
function precheckReconcileTrigger_(){
  var cfg=getPrecheckConfig_();
  if(!cfg.enabled||!cfg.reconcileEnabled)return{enabled:false};

  // Critical safety rule:
  // automatic final commit is allowed only when PC_AUTO_COMMIT_ENABLED=true.
  var commitResult=cfg.autoCommitEnabled
    ? reconcilePendingCommits_()
    : {attempted:0,disabled:true,reason:'PC_AUTO_COMMIT_ENABLED=false'};

  return{
    uploads:cleanupStaleUploads_(),
    locks:cleanupExpiredReviewLocks_(),
    commits:commitResult,
    staleNotifications:reconcileStaleSendingNotifications_(),
    notifications:retryNotification_(),
    orphans:reconcileOrphanFiles_()
  };
}

/** Reconciles expired upload sessions against Drive before changing state; no file is blindly deleted. */
function cleanupStaleUploads_(){
  var props=PropertiesService.getScriptProperties(),all=props.getProperties(),keys=Object.keys(all),count=0,recovered=0,deferred=0,doneCleaned=0,bindingsCleaned=0;
  keys.filter(function(k){return k.indexOf(PC_CONST.PROP_PREFIX.UPLOAD)===0&&k.indexOf(PC_CONST.PROP_PREFIX.UPLOAD_DONE)!==0;}).forEach(function(key){
    try{
      var r=JSON.parse(all[key]);if(!pcIsoExpired_(r.expiresAt))return;
      var state;
      try{state=r.finalized&&r.fileId?{state:'COMPLETED',fileId:r.fileId,nextByte:Number(r.totalSize||0)}:pcQueryDriveResumableState_(r);}catch(queryError){state={state:'ERROR',message:queryError.message};}
      if(state.state==='COMPLETED'&&state.fileId){
        r.finalized=true;r.fileId=state.fileId;r.expectedNextByte=Number(r.totalSize||0);
        if(r.purpose===PC_CONST.UPLOAD_PURPOSE.PRECHECK_REPORT&&pcRecoverCompletedPrecheckUpload_(r,state.fileId)){
          recovered++;props.deleteProperty(key);return;
        }
        props.deleteProperty(key);count++;return;
      }
      if(state.state==='ERROR'||state.state==='AMBIGUOUS'){
        r.recoveryAttemptCount=Number(r.recoveryAttemptCount||0)+1;r.recoveryError=String(state.message||state.state).substring(0,300);r.expiresAt=pcIsoAfterMinutes_(10);props.setProperty(key,JSON.stringify(r));deferred++;return;
      }
      if(r.submissionId&&r.versionId){pcWithScriptLock_(function(){var v=pcVersionById_(r.versionId),sub=pcSubmissionById_(r.submissionId);if(v&&String(v.VersionStatus)===PC_CONST.VERSION_STATUS.UPLOADING&&!v.FileId)pcPatchObject_(PC_CONST.SHEETS.VERSIONS,v._rowNumber,{VersionStatus:PC_CONST.VERSION_STATUS.DRAFT});if(sub&&String(sub.Status)===PC_CONST.STATUS.UPLOADING)pcPatchObject_(PC_CONST.SHEETS.SUBMISSIONS,sub._rowNumber,{Status:Number(sub.CurrentVersion||0)>0?PC_CONST.STATUS.REVISION_REQUIRED:PC_CONST.STATUS.DRAFT,UpdatedAt:pcNowIso_()});});}
      props.deleteProperty(key);count++;
    }catch(e){console.error('Stale upload cleanup: '+e.message);}
  });
  var doneCutoff=Date.now()-24*60*60*1000;
  keys.filter(function(k){return k.indexOf(PC_CONST.PROP_PREFIX.UPLOAD_DONE)===0;}).forEach(function(key){try{var r=JSON.parse(all[key]);var t=Date.parse(r.completedAt||'');if(t&&t<doneCutoff){props.deleteProperty(key);doneCleaned++;}}catch(e){console.error('Completed upload cleanup: '+e.message);}});
  keys.filter(function(k){return k.indexOf(PC_CONST.PROP_PREFIX.FILE_BIND)===0;}).forEach(function(key){try{var r=JSON.parse(all[key]);if(pcIsoExpired_(r.expiresAt)){props.deleteProperty(key);bindingsCleaned++;}}catch(e){console.error('File binding cleanup: '+e.message);}});
  return{cleaned:count,recoveredCompletedPrecheck:recovered,deferredAmbiguous:deferred,completedMappingsCleaned:doneCleaned,fileBindingsCleaned:bindingsCleaned};
}

/** Clears only expired logical review leases; review content remains untouched. */
function cleanupExpiredReviewLocks_(){
  var rows=pcListObjects_(PC_CONST.SHEETS.REVIEWS),patches=[];rows.forEach(function(r){if(String(r.ReviewStatus)===PC_CONST.REVIEW_STATUS.IN_PROGRESS&&r.LockedBy&&pcIsoExpired_(r.LockUntil))patches.push({rowNumber:r._rowNumber,patch:{LockedBy:'',LockUntil:''}});});pcBatchPatchObjects_(PC_CONST.SHEETS.REVIEWS,patches);return{cleared:patches.length};
}

/** Moves old unmapped staging files to the configured orphan folder, excluding active upload/binding references. */
function reconcileOrphanFiles_(){
  var cfg=getPrecheckConfig_();if(!cfg.stagingFolderId||!cfg.orphanFolderId)return{moved:0};
  var mapped={};pcListObjects_(PC_CONST.SHEETS.VERSIONS).forEach(function(v){if(v.FileId)mapped[String(v.FileId)]=true;});
  var props=PropertiesService.getScriptProperties().getProperties();Object.keys(props).forEach(function(k){
    if(k.indexOf(PC_CONST.PROP_PREFIX.UPLOAD)!==0&&k.indexOf(PC_CONST.PROP_PREFIX.FILE_BIND)!==0)return;
    try{var r=JSON.parse(props[k]);if(r.fileId)mapped[String(r.fileId)]=true;}catch(e){}
  });
  var folder=pcDriveFolder_(cfg.stagingFolderId,'Staging'),orphan=pcDriveFolder_(cfg.orphanFolderId,'Orphan'),files=folder.getFiles(),moved=0,cutoff=Date.now()-cfg.uploadExpireMinutes*60000;
  while(files.hasNext()){var f=files.next();if(mapped[f.getId()])continue;if(f.getDateCreated().getTime()>cutoff)continue;f.moveTo(orphan);moved++;}
  return{moved:moved};
}
