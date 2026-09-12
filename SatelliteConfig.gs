/** Standalone runtime configuration for Project Adam KPI Satellite. */
var KPI_SATELLITE = Object.freeze({
  VERSION: '1.2.1',
  REQUIRED_RUNNER_EMAIL: 'budgetservice@g.klaeng.ac.th',
  DEFAULT_DB_ID: '16FtFuJUVhdLj8eidgVtjsKThNrlS5ge5NznSU6EVMn0',
  PROP_DB_ID: 'KPI_PRECHECK_DB_ID',
  PROP_HANDOFF_SECRET: 'KPI_HANDOFF_SECRET',
  PROP_CACHE_EPOCH: 'KPI_CACHE_EPOCH',
  HANDOFF_ISSUER: 'PROJECT_ADAM_MAIN',
  HANDOFF_AUDIENCE: 'PROJECT_ADAM_KPI',
  HANDOFF_MAX_AGE_SECONDS: 180,
  SESSION_TTL_SECONDS: 1800,
  NONCE_TTL_SECONDS: 240,
  JOB_RETENTION_ROWS: 500,
  TRANSPORT_MODE: 'PUBLIC_SIGNED_HANDOFF',
  BOOTSTRAP_RATE_LIMIT: 30,
  BOOTSTRAP_RATE_WINDOW_SECONDS: 300
});

/** Returns configured Pre-check DB id. */
function kpiSatelliteDbId_() {
  return PropertiesService.getScriptProperties().getProperty(KPI_SATELLITE.PROP_DB_ID) || KPI_SATELLITE.DEFAULT_DB_ID;
}

/** Fail-closed runner assertion. Protects against deployment with the wrong execute-as identity. */
function kpiAssertSatelliteRunner_() {
  var effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (effective !== KPI_SATELLITE.REQUIRED_RUNNER_EMAIL) {
    throw new Error('KPI_WRONG_RUNNER: expected ' + KPI_SATELLITE.REQUIRED_RUNNER_EMAIL + ' but got ' + (effective || '(blank)'));
  }
  return effective;
}
