/** Standalone Web App transport entry point. The HTML is intentionally data-free until signed handoff succeeds. */
function doGet(e){
  var t=HtmlService.createTemplateFromFile('KpiSatellite');
  var p=(e&&e.parameter)||{};
  t.embed=String(p.embed||'')==='1';
  var channel=String(p.channel||'').trim();
  t.channel=/^[A-Za-z0-9_-]{8,160}$/.test(channel)?channel:'';
  return t.evaluate().setTitle('Project Adam KPI').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1');
}
function includeKpi_(name){ return HtmlService.createHtmlOutputFromFile(name).getContent(); }
