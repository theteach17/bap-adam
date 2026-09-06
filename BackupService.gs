/** Private daily trigger: copies the workflow database and applies configured retention. */
function createPrecheckDailyBackup_(){
  var cfg=getPrecheckConfig_();if(!cfg.dbId||!cfg.backupFolderId)return{success:false,reason:'CONFIG_MISSING'};
  try{
    var source=DriveApp.getFileById(cfg.dbId),folder=pcDriveFolder_(cfg.backupFolderId,'Backup'),name='Pre-check DB Backup - '+Utilities.formatDate(new Date(),PC_CONST.TIMEZONE,'yyyyMMdd-HHmmss');
    var copy=source.makeCopy(name,folder),cutoff=Date.now()-cfg.backupRetentionDays*86400000,files=folder.getFiles(),trashed=0;
    while(files.hasNext()){var f=files.next();if(f.getId()!==copy.getId()&&/^Pre-check DB Backup - /.test(f.getName())&&f.getDateCreated().getTime()<cutoff){f.setTrashed(true);trashed++;}}
    PropertiesService.getScriptProperties().setProperty('PC_LAST_BACKUP_AT',pcNowIso_());return{success:true,fileId:copy.getId(),trashedOldBackups:trashed};
  }catch(e){pcQueueOperationalAlertSafe_('Backup ไม่สำเร็จ','การสำรองฐานข้อมูล Pre-check ไม่สำเร็จ: '+String(e.message||e),{});throw e;}
}
