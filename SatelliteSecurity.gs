/** Signed Project Adam handoff + short-lived Satellite sessions. */
function kpiB64uBytes_(bytes){ return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,''); }
function kpiB64uText_(text){ return kpiB64uBytes_(Utilities.newBlob(String(text),'text/plain').getBytes()); }
function kpiB64uDecodeText_(text){ var s=String(text||''); while(s.length%4)s+='='; return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString(); }
function kpiSha256Text_(text){ return kpiB64uBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text))); }
function kpiSecureEqual_(a,b){ a=String(a||''); b=String(b||''); var diff=a.length^b.length, n=Math.max(a.length,b.length); for(var i=0;i<n;i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0); return diff===0; }
function kpiHandoffSecret_(){ var secret=PropertiesService.getScriptProperties().getProperty(KPI_SATELLITE.PROP_HANDOFF_SECRET); if(!secret) throw new Error('KPI_HANDOFF_SECRET_NOT_CONFIGURED'); return secret; }
function kpiNewSecret_(){ var seed=[Utilities.getUuid(),Utilities.getUuid(),Utilities.getUuid(),String(new Date().getTime()),Math.random()].join('|'); return kpiB64uBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,seed)); }

/** Manual runner-only secret rotation. Update the matching Script Property in Project Adam immediately afterwards. */
function rotateKpiHandoffSecret(){ kpiAssertSatelliteRunner_(); var secret=kpiNewSecret_(); PropertiesService.getScriptProperties().setProperty(KPI_SATELLITE.PROP_HANDOFF_SECRET,secret); return {ok:true,secret:secret,warning:'Copy this value to Project Adam Script Property PROJECT_ADAM_KPI_HANDOFF_SECRET before opening the dashboard.'}; }
function getKpiSatelliteIntegrationInfo(){ kpiAssertSatelliteRunner_(); return {ok:true,moduleVersion:KPI_CONST.VERSION,runner:KPI_SATELLITE.REQUIRED_RUNNER_EMAIL,dbId:kpiSatelliteDbId_(),handoffSecret:kpiHandoffSecret_(),deploymentInstruction:'Deploy as Web app: Execute as Me (budgetservice), access limited to your Workspace domain.'}; }

function kpiVerifyHandoff_(ticket){
  var parts=String(ticket||'').split('.'); if(parts.length!==2) throw pcUserError_('ข้อมูลเชื่อมต่อ KPI ไม่ถูกต้อง','KPI_HANDOFF_FORMAT');
  var body=parts[0], supplied=parts[1], expected=kpiB64uBytes_(Utilities.computeHmacSha256Signature(body,kpiHandoffSecret_()));
  if(!kpiSecureEqual_(supplied,expected)) throw pcUserError_('ลายเซ็นการเชื่อมต่อ KPI ไม่ถูกต้อง','KPI_HANDOFF_SIGNATURE');
  var payload; try{ payload=JSON.parse(kpiB64uDecodeText_(body)); }catch(e){ throw pcUserError_('อ่านข้อมูลเชื่อมต่อ KPI ไม่ได้','KPI_HANDOFF_PAYLOAD'); }
  var now=Math.floor(Date.now()/1000),iat=Number(payload.iat||0),exp=Number(payload.exp||0);
  if(payload.iss!==KPI_SATELLITE.HANDOFF_ISSUER || payload.aud!==KPI_SATELLITE.HANDOFF_AUDIENCE) throw pcUserError_('ปลายทางการเชื่อมต่อ KPI ไม่ถูกต้อง','KPI_HANDOFF_AUDIENCE');
  if(!iat||!exp||iat>now+30||exp<now||exp-iat>KPI_SATELLITE.HANDOFF_MAX_AGE_SECONDS) throw pcUserError_('ข้อมูลเชื่อมต่อ KPI หมดอายุ กรุณาเปิดใหม่จาก Project Adam','KPI_HANDOFF_EXPIRED');
  var nonce=String(payload.nonce||''); if(!nonce) throw pcUserError_('ข้อมูลเชื่อมต่อ KPI ไม่มี nonce','KPI_HANDOFF_NONCE');
  var replayKey='KPI_NONCE:'+kpiSha256Text_(nonce),cache=CacheService.getScriptCache(),lock=LockService.getScriptLock();
  if(!lock.tryLock(5000)) throw pcUserError_('ระบบกำลังยืนยันสิทธิ์อีกคำขอ กรุณาลองใหม่','KPI_HANDOFF_BUSY');
  try { if(cache.get(replayKey)) throw pcUserError_('ข้อมูลเชื่อมต่อนี้ถูกใช้แล้ว กรุณาเปิดใหม่','KPI_HANDOFF_REPLAY'); cache.put(replayKey,'1',KPI_SATELLITE.NONCE_TTL_SECONDS); } finally { lock.releaseLock(); }
  return payload;
}

function kpiFindActiveAdmin_(email){
  email=kpiEmail_(email); var rows=kpiReadSource_('PC_Access');
  for(var i=0;i<rows.length;i++){ var r=rows[i],active=r.Active===true||/^(true|1|yes|y)$/i.test(String(r.Active)); if(active&&kpiEmail_(r.Email)===email&&String(r.Role)===PC_CONST.ROLES.ADMIN) return {email:email,displayName:String(r.DisplayName||email),roles:[PC_CONST.ROLES.ADMIN]}; }
  return null;
}

/** Called once by the embedded iframe after receiving the signed ticket from Project Adam. */
function bootstrapKpiSession(ticket){
  kpiAssertSatelliteRunner_(); var p=kpiVerifyHandoff_(ticket),principal=kpiFindActiveAdmin_(p.email); if(!principal) throw pcUserError_('บัญชีนี้ไม่มีสิทธิ์ PRECHECK_ADMIN ที่ Active','KPI_ADMIN_REQUIRED');
  var raw=[Utilities.getUuid(),Utilities.getUuid(),String(Date.now()),Math.random()].join('|'), token=kpiSha256Text_(raw), sessionId=Utilities.getUuid();
  principal.sessionId=sessionId; principal.issuedAt=kpiNowIso_(); principal.expiresAt=new Date(Date.now()+KPI_SATELLITE.SESSION_TTL_SECONDS*1000).toISOString();
  CacheService.getScriptCache().put('KPI_SESSION:'+kpiSha256Text_(token),JSON.stringify(principal),KPI_SATELLITE.SESSION_TTL_SECONDS);
  return {ok:true,sessionToken:token,principal:{email:principal.email,displayName:principal.displayName,roles:principal.roles},expiresAt:principal.expiresAt,moduleVersion:KPI_CONST.VERSION};
}

function kpiRequireSession_(token){
  kpiAssertSatelliteRunner_(); token=String(token||''); if(token.length<20) throw pcUserError_('KPI session ไม่ถูกต้อง','KPI_SESSION_INVALID');
  var cache=CacheService.getScriptCache(),key='KPI_SESSION:'+kpiSha256Text_(token),raw=cache.get(key); if(!raw) throw pcUserError_('KPI session หมดอายุ กรุณาปิดและเปิด Dashboard ใหม่','KPI_SESSION_EXPIRED');
  var p=JSON.parse(raw),absoluteExpiry=new Date(p.expiresAt||0).getTime(); if(!isFinite(absoluteExpiry)||absoluteExpiry<=Date.now()){cache.remove(key);throw pcUserError_('KPI session หมดอายุ กรุณาปิดและเปิด Dashboard ใหม่','KPI_SESSION_EXPIRED');}
  var fresh=kpiFindActiveAdmin_(p.email); if(!fresh) { cache.remove(key); throw pcUserError_('สิทธิ์ Admin ถูกยกเลิกแล้ว','KPI_ADMIN_REVOKED'); }
  p.displayName=fresh.displayName; p.roles=fresh.roles; var ttl=Math.max(1,Math.min(KPI_SATELLITE.SESSION_TTL_SECONDS,Math.floor((absoluteExpiry-Date.now())/1000))); cache.put(key,JSON.stringify(p),ttl); return p;
}

/** Single authenticated RPC surface. Direct calls to legacy functions fail because no request context is bound. */
function kpiRpc(sessionToken, method, args){
  var principal=kpiRequireSession_(sessionToken), map={
    dashboard:function(a){return getAdminKpiDashboard(a[0]||{});},
    officerDetail:function(a){return getAdminKpiOfficerDetail(a[0],a[1]||{});},
    saveConfig:function(a){return saveAdminKpiConfig(a[0]||{});},
    saveHoliday:function(a){return saveAdminKpiHoliday(a[0]||{});},
    deleteHoliday:function(a){return deleteAdminKpiHoliday(a[0]);},
    recordExport:function(a){return recordAdminKpiExport(a[0]||{});},
    assignWork:function(a){return adminAssignKpiWork(a[0],a[1],a[2],a[3]||'');},
    systemStatus:function(){return getAdminKpiSystemStatus_();},
    runReconcile:function(){return kpiRunTrackedJob_('RECONCILE','MANUAL',runKpiReconcileCore_);},
    runSnapshot:function(){return kpiRunTrackedJob_('QUEUE_SNAPSHOT','MANUAL',takeKpiQueueSnapshotCore_);},
    runAggregate:function(){return kpiRunTrackedJob_('DAILY_AGGREGATE','MANUAL',rebuildKpiDailyAggregatesCore_);}
  };
  if(!Object.prototype.hasOwnProperty.call(map,String(method||''))) throw pcUserError_('ไม่รองรับคำสั่ง KPI: '+String(method||''),'KPI_RPC_METHOD');
  KPI_REQUEST_CONTEXT_={email:principal.email,displayName:principal.displayName,roles:principal.roles,sessionId:principal.sessionId};
  try { return map[String(method)](Array.isArray(args)?args:[]); } finally { KPI_REQUEST_CONTEXT_=null; }
}
