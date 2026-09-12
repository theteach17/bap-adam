/** Standalone Web App transport entry point. The HTML is intentionally data-free until signed handoff succeeds. */
function doGet(e){
  var t=HtmlService.createTemplateFromFile('KpiSatellite');
  t.embed=!!(e&&e.parameter&&String(e.parameter.embed)==='1');
  return t.evaluate().setTitle('Project Adam KPI').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport','width=device-width, initial-scale=1');
}
function includeKpi_(name){ return HtmlService.createHtmlOutputFromFile(name).getContent(); }
