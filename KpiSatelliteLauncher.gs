/** Minimal secure bridge from Project Adam Main to the budgetservice KPI Satellite. */
var KPI_MAIN_BRIDGE = Object.freeze({
  PROP_URL:'PROJECT_ADAM_KPI_SATELLITE_URL',
  PROP_SECRET:'PROJECT_ADAM_KPI_HANDOFF_SECRET',
  ISSUER:'PROJECT_ADAM_MAIN', AUDIENCE:'PROJECT_ADAM_KPI', TICKET_SECONDS:120
});
function kpiMainB64u_(bytes){return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');}
function kpiMainTicket_(){
  requirePrecheckAdmin_('getKpiSatelliteLaunchTicket');
  var p=getCurrentPrincipal_(),props=PropertiesService.getScriptProperties(),url=String(props.getProperty(KPI_MAIN_BRIDGE.PROP_URL)||'').trim(),secret=String(props.getProperty(KPI_MAIN_BRIDGE.PROP_SECRET)||'');
  if(!/^https:\/\/script\.google\.com\//i.test(url)||url.indexOf('/exec')<0)throw pcUserError_('ยังไม่ได้ตั้งค่า KPI Satellite Web App URL','KPI_SATELLITE_URL_MISSING');
  if(secret.length<32)throw pcUserError_('ยังไม่ได้ตั้งค่า KPI Handoff Secret','KPI_SATELLITE_SECRET_MISSING');
  var now=Math.floor(Date.now()/1000),payload={v:1,iss:KPI_MAIN_BRIDGE.ISSUER,aud:KPI_MAIN_BRIDGE.AUDIENCE,email:String(p.email||'').trim().toLowerCase(),name:String(p.displayName||''),iat:now,exp:now+KPI_MAIN_BRIDGE.TICKET_SECONDS,nonce:Utilities.getUuid()};
  var body=kpiMainB64u_(Utilities.newBlob(JSON.stringify(payload),'application/json').getBytes()),sig=kpiMainB64u_(Utilities.computeHmacSha256Signature(body,secret));
  return{url:url,ticket:body+'.'+sig,expiresAt:new Date(payload.exp*1000).toISOString()};
}
function getKpiSatelliteLaunchTicket(){return kpiMainTicket_();}
function verifyKpiSatelliteMainBridge(){requirePrecheckAdmin_('verifyKpiSatelliteMainBridge');var props=PropertiesService.getScriptProperties(),url=String(props.getProperty(KPI_MAIN_BRIDGE.PROP_URL)||''),secret=String(props.getProperty(KPI_MAIN_BRIDGE.PROP_SECRET)||'');return{ok:/^https:\/\/script\.google\.com\//i.test(url)&&url.indexOf('/exec')>=0&&secret.length>=32,urlConfigured:!!url,secretConfigured:secret.length>=32};}
