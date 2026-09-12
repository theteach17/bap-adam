/** Business-time and statistical helpers for KPI Module. */

/** Converts a date/value to yyyy-MM-dd in Bangkok timezone. */
function kpiDateKey_(value) {
  if (value == null || value === '') return '';
  var d = value instanceof Date ? value : new Date(value);
  if (!isFinite(d.getTime())) {
    var s = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }
  return Utilities.formatDate(d, KPI_CONST.TIMEZONE, 'yyyy-MM-dd');
}

/** Parses HH:mm and returns minutes after midnight. */
function kpiClockMinutes_(text, fallback) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(text || ''));
  if (!m) return fallback;
  var h = Number(m[1]), min = Number(m[2]);
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? h * 60 + min : fallback;
}

/** Creates a Bangkok Date from yyyy-MM-dd and minutes after midnight. */
function kpiBangkokDate_(dateKey, minuteOfDay) {
  var h = Math.floor(minuteOfDay / 60), m = minuteOfDay % 60;
  var text = dateKey + 'T' + ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':00+07:00';
  return new Date(text);
}

/** ISO weekday number 1=Mon ... 7=Sun. */
function kpiWeekday_(dateKey) {
  var d = new Date(dateKey + 'T12:00:00+07:00');
  var js = d.getDay();
  return js === 0 ? 7 : js;
}

/** Adds calendar days in Bangkok (no DST). */
function kpiAddDateKey_(dateKey, days) {
  var d = new Date(dateKey + 'T12:00:00+07:00');
  d.setTime(d.getTime() + Number(days || 0) * 86400000);
  return Utilities.formatDate(d, KPI_CONST.TIMEZONE, 'yyyy-MM-dd');
}

/** Returns effective working window for a date, including holiday overrides. */
function kpiWorkingWindow_(dateKey, cfg, holidayMap) {
  var override = holidayMap[dateKey];
  var isWorking = cfg.workingDays.indexOf(kpiWeekday_(dateKey)) !== -1;
  var startText = cfg.workdayStart, endText = cfg.workdayEnd;
  if (override) {
    isWorking = !!override.isWorkingDay;
    if (override.startTime) startText = override.startTime;
    if (override.endTime) endText = override.endTime;
  }
  if (!isWorking) return null;
  var start = kpiClockMinutes_(startText, 8 * 60);
  var end = kpiClockMinutes_(endText, 16 * 60 + 30);
  if (end <= start) return null;
  return { start: kpiBangkokDate_(dateKey, start), end: kpiBangkokDate_(dateKey, end) };
}

/** Calculates elapsed business minutes, excluding weekends and configured holidays. */
function kpiBusinessMinutes_(startValue, endValue, cfg, holidayMap) {
  var start = startValue instanceof Date ? startValue : new Date(startValue);
  var end = endValue instanceof Date ? endValue : new Date(endValue);
  if (!isFinite(start.getTime()) || !isFinite(end.getTime()) || end <= start) return 0;
  cfg = cfg || kpiGetConfig_();
  holidayMap = holidayMap || kpiGetHolidayMap_();
  var dateKey = kpiDateKey_(start), endKey = kpiDateKey_(end), total = 0, guard = 0;
  while (dateKey && dateKey <= endKey && guard++ < 3700) {
    var window = kpiWorkingWindow_(dateKey, cfg, holidayMap);
    if (window) {
      var from = Math.max(start.getTime(), window.start.getTime());
      var to = Math.min(end.getTime(), window.end.getTime());
      if (to > from) total += (to - from) / 60000;
    }
    dateKey = kpiAddDateKey_(dateKey, 1);
  }
  return Math.round(total * 100) / 100;
}

/** Raw elapsed minutes. */
function kpiElapsedMinutes_(startValue, endValue) {
  var s = new Date(startValue), e = new Date(endValue);
  return isFinite(s.getTime()) && isFinite(e.getTime()) && e > s ? Math.round(((e - s) / 60000) * 100) / 100 : 0;
}

/** Median of numeric values. */
function kpiMedian_(values) {
  var a = (values || []).map(Number).filter(isFinite).sort(function(x,y){return x-y;});
  if (!a.length) return 0;
  var mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Nearest-rank percentile. */
function kpiPercentile_(values, p) {
  var a = (values || []).map(Number).filter(isFinite).sort(function(x,y){return x-y;});
  if (!a.length) return 0;
  var rank = Math.max(1, Math.ceil((Number(p) || 0) * a.length));
  return a[Math.min(a.length - 1, rank - 1)];
}

/** Arithmetic mean. */
function kpiAverage_(values) {
  var a = (values || []).map(Number).filter(isFinite);
  return a.length ? a.reduce(function(s,n){return s+n;},0) / a.length : 0;
}

/** Groups event timestamps into productive sessions and approximates observed active minutes. */
function kpiSessionStats_(timestamps, idleMinutes, hardCapMinutes) {
  var items = (timestamps || []).map(function(v){return new Date(v);}).filter(function(d){return isFinite(d.getTime());}).sort(function(a,b){return a-b;});
  if (!items.length) return { sessions: 0, activeMinutes: 0 };
  var idleMs = Math.max(1, Number(idleMinutes) || 10) * 60000;
  var sessions = 1, sessionStart = items[0], last = items[0], active = 0;
  for (var i = 1; i < items.length; i++) {
    if (items[i] - last > idleMs) {
      active += Math.max(1, (last - sessionStart) / 60000 + 1);
      sessions++;
      sessionStart = items[i];
    }
    last = items[i];
  }
  active += Math.max(1, (last - sessionStart) / 60000 + 1);
  if (hardCapMinutes && active > hardCapMinutes) active = hardCapMinutes;
  return { sessions: sessions, activeMinutes: Math.round(active * 100) / 100 };
}

/** Formats minutes for UI while keeping raw numeric values available. */
function kpiHumanMinutes_(minutes) {
  var m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return m + ' นาที';
  var h = Math.floor(m / 60), rem = m % 60;
  return h + ' ชม.' + (rem ? ' ' + rem + ' นาที' : '');
}
