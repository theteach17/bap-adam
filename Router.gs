/** Returns authenticated navigation context for rendering role-aware menus. */
function getNavigationContext(){
  try{
    var principal=getCurrentPrincipal_(),cfg=getPrecheckConfig_();
    return{appName:PC_CONST.USER_FACING_NAME,baseUrl:ScriptApp.getService().getUrl(),displayName:principal.displayName,email:principal.email,roles:principal.roles.slice(),precheckEnabled:cfg.enabled,enforceReportActivity:cfg.enforceReportActivity,maxFileMb:cfg.maxFileMb,chunkSizeBytes:cfg.chunkSizeBytes};
  }catch(error){throw pcHandlePublicError_(error,'getNavigationContext',{});}
}

/** Builds a same-web-app URL from a server allowlist, never an open redirect. */
function getAppNavigationUrl(page,params){
  requireAuth_('getAppNavigationUrl');page=String(page||'Index');
  if(PROTECTED_PAGES.indexOf(page)===-1)throw pcUserError_('ไม่พบหน้าที่ต้องการ','INVALID_PAGE');
  if(page==='PrecheckOfficer'||page==='PrecheckReview') requireOfficer_('navigate_'+page);
  if(page==='PrecheckAdmin') requirePrecheckAdmin_('navigate_'+page);
  var url=ScriptApp.getService().getUrl()+'?page='+encodeURIComponent(page);params=params||{};
  Object.keys(params).forEach(function(k){if(!/^[A-Za-z0-9_]+$/.test(k))return;url+='&'+encodeURIComponent(k)+'='+encodeURIComponent(String(params[k]));});return url;
}
