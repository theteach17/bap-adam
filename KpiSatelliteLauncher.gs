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
function verifyKpiSatelliteMainBridge(){
  requirePrecheckAdmin_('verifyKpiSatelliteMainBridge');
  var checkedAt=new Date().toISOString();
  console.log('[KPI MAIN BRIDGE] START version=1.1.3 checkedAt='+checkedAt);
  try{
    var props=PropertiesService.getScriptProperties();
    var url=String(props.getProperty(KPI_MAIN_BRIDGE.PROP_URL)||'').trim();
    var secret=String(props.getProperty(KPI_MAIN_BRIDGE.PROP_SECRET)||'');
    var urlConfigured=!!url;
    var urlValid=/^https:\/\/script\.google\.com\//i.test(url)&&/\/exec(?:[?#]|$)/i.test(url);
    var secretConfigured=secret.length>=32;
    var ticketOk=false,ticketExpiresAt='';
    var ticketError='';

    if(urlConfigured&&urlValid&&secretConfigured){
      try{
        var t=kpiMainTicket_();
        ticketOk=!!(t&&t.ticket&&t.url&&t.expiresAt&&String(t.ticket).indexOf('.')>0);
        ticketExpiresAt=t&&t.expiresAt?String(t.expiresAt):'';
      }catch(ticketEx){
        ticketError=(ticketEx&&ticketEx.message)?ticketEx.message:String(ticketEx);
      }
    }

    console.log('[KPI MAIN BRIDGE] '+(urlConfigured?'PASS':'FAIL')+' satellite-url-configured — '+JSON.stringify({configured:urlConfigured}));
    console.log('[KPI MAIN BRIDGE] '+(urlValid?'PASS':'FAIL')+' satellite-url-format — '+JSON.stringify({valid:urlValid,host:urlValid?'script.google.com':'',execPath:urlValid}));
    console.log('[KPI MAIN BRIDGE] '+(secretConfigured?'PASS':'FAIL')+' handoff-secret — '+JSON.stringify({configured:secretConfigured,length:secret.length}));
    if(urlConfigured&&urlValid&&secretConfigured){
      console.log('[KPI MAIN BRIDGE] '+(ticketOk?'PASS':'FAIL')+' ticket-generation — '+JSON.stringify({ok:ticketOk,expiresAt:ticketExpiresAt,error:ticketError}));
    }else{
      console.warn('[KPI MAIN BRIDGE] SKIP ticket-generation — prerequisite configuration failed');
    }

    var failed=[];
    if(!urlConfigured)failed.push('satellite-url-configured');
    if(!urlValid)failed.push('satellite-url-format');
    if(!secretConfigured)failed.push('handoff-secret');
    if(urlConfigured&&urlValid&&secretConfigured&&!ticketOk)failed.push('ticket-generation');
    var result={
      ok:failed.length===0,
      checkedAt:checkedAt,
      version:'1.1.3',
      urlConfigured:urlConfigured,
      urlValid:urlValid,
      secretConfigured:secretConfigured,
      ticketGenerationOk:ticketOk,
      ticketExpiresAt:ticketExpiresAt,
      failedChecks:failed
    };
    console.log('[KPI MAIN BRIDGE] COMPLETE ok='+result.ok+' failed='+failed.length+(failed.length?' failedChecks='+failed.join(','):''));
    return result;
  }catch(e){
    var msg=(e&&e.message)?e.message:String(e);
    console.error('[KPI MAIN BRIDGE] FATAL — '+msg);
    throw e;
  }
}
