/** Metric engine: derives review-, officer-, queue- and trend-level metrics from canonical Pre-check data. */

/** Normalizes requested reporting period; default = trailing 30 calendar days. */
function kpiNormalizeFilter_(filter) {
  filter = filter || {};
  var now = new Date();
  var endKey = /^\d{4}-\d{2}-\d{2}$/.test(String(filter.endDate || '')) ? String(filter.endDate) : kpiDateKey_(now);
  var defaultStart = kpiAddDateKey_(endKey, -29);
  var startKey = /^\d{4}-\d{2}-\d{2}$/.test(String(filter.startDate || '')) ? String(filter.startDate) : defaultStart;
  if (startKey > endKey) { var t = startKey; startKey = endKey; endKey = t; }
  return {
    startDate: startKey,
    endDate: endKey,
    officerEmail: kpiEmail_(filter.officerEmail),
    adminGroup: String(filter.adminGroup || '').trim(),
    workGroup: String(filter.workGroup || '').trim()
  };
}

/** True when a timestamp falls in inclusive local-date filter. */
function kpiInPeriod_(value, filter) {
  var key = kpiDateKey_(value);
  return !!key && key >= filter.startDate && key <= filter.endDate;
}

/** Loads canonical tables once per execution. */
function kpiLoadModel_(options) {
  options=options||{};
  var submissions = kpiReadSource_('PC_Submissions');
  var versions = kpiReadSource_('PC_Versions');
  var reviews = kpiReadSource_('PC_Reviews');
  var audit = options.includeAudit===false ? [] : kpiReadSource_('PC_Audit');
  var access = kpiReadSource_('PC_Access');
  var assignments = kpiReadObjects_(KPI_CONST.SHEETS.ASSIGNMENTS, KPI_HEADERS.PC_KPIAssignments);
  return {
    submissions: submissions, versions: versions, reviews: reviews, audit: audit, access: access, assignments: assignments,
    submissionById: kpiIndexBy_(submissions, 'SubmissionId'), versionById: kpiIndexBy_(versions, 'VersionId')
  };
}

/** Active reviewers/admins recognized by PC_Access. */
function kpiActiveOfficers_(model) {
  return model.access.filter(function(r) {
    var active = r.Active === true || /^(true|1|yes|y)$/i.test(String(r.Active));
    return active && (String(r.Role) === PC_CONST.ROLES.OFFICER || String(r.Role) === PC_CONST.ROLES.ADMIN);
  }).map(function(r) { return { email: kpiEmail_(r.Email), name: String(r.DisplayName || r.Email), role: String(r.Role) }; });
}

/** True only for audit actions that represent real queue/review work. */
function kpiIsProductiveAuditAction_(auditRow) {
  var action=String((auditRow&&auditRow.Action)||'');
  if(['REVIEW_STARTED','REVIEW_AUTOSAVED','REVISION_REQUIRED','APPROVAL'].indexOf(action)>=0)return true;
  if(action==='LOOKUP'){
    var metadata=String((auditRow&&auditRow.MetadataJSON)||'');
    return /[\"']workflow[\"']\s*:\s*[\"']PRECHECK[\"']/i.test(metadata);
  }
  return false;
}

/** Derives one metric record per completed review. */
function kpiBuildReviewMetrics_(model, filter, cfg) {
  var holidays = kpiGetHolidayMap_();
  var auditByReview = {}, auditByVersion = {}, auditBySubmission = {};
  model.audit.forEach(function(a) {
    var key;
    key = String(a.ReviewId || ''); if (key) (auditByReview[key] = auditByReview[key] || []).push(a);
    key = String(a.VersionId || ''); if (key) (auditByVersion[key] = auditByVersion[key] || []).push(a);
    key = String(a.SubmissionId || ''); if (key) (auditBySubmission[key] = auditBySubmission[key] || []).push(a);
  });
  var rows = [];
  model.reviews.forEach(function(r) {
    if (String(r.ReviewStatus) !== PC_CONST.REVIEW_STATUS.COMPLETED || !r.CompletedAt) return;
    if (!kpiInPeriod_(r.CompletedAt, filter)) return;
    var email = kpiEmail_(r.ReviewerEmail);
    if (filter.officerEmail && email !== filter.officerEmail) return;
    var version = model.versionById[String(r.VersionId || '')] || {};
    var submission = model.submissionById[String(r.SubmissionId || '')] || {};
    if (filter.adminGroup && String(submission.AdminGroupSnapshot || '') !== filter.adminGroup) return;
    if (filter.workGroup && String(submission.WorkGroupSnapshot || '') !== filter.workGroup) return;
    var uploaded = version.UploadedAt || submission.LastSubmittedAt || submission.CreatedAt;
    var started = r.StartedAt || r.CompletedAt;
    var responseBusiness = uploaded ? kpiBusinessMinutes_(uploaded, started, cfg, holidays) : 0;
    var turnaroundBusiness = uploaded ? kpiBusinessMinutes_(uploaded, r.CompletedAt, cfg, holidays) : 0;
    var responseElapsed = uploaded ? kpiElapsedMinutes_(uploaded, started) : 0;
    var turnaroundElapsed = uploaded ? kpiElapsedMinutes_(uploaded, r.CompletedAt) : 0;
    var elapsedReview = kpiElapsedMinutes_(started, r.CompletedAt);
    var relevantAudit = [];
    [auditByReview[String(r.ReviewId||'')] || [], auditByVersion[String(r.VersionId||'')] || [], auditBySubmission[String(r.SubmissionId||'')] || []].forEach(function(list) {
      list.forEach(function(a) {
        if (kpiEmail_(a.ActorEmail) !== email) return;
        if (!kpiIsProductiveAuditAction_(a)) return;
        var ts = new Date(a.Timestamp);
        if (!isFinite(ts.getTime())) return;
        if (ts >= new Date(started) && ts <= new Date(r.CompletedAt)) relevantAudit.push(a.Timestamp);
      });
    });
    var session = kpiSessionStats_(relevantAudit, cfg.sessionIdleMinutes, elapsedReview || null);
    var total = Number(r.TotalItems || 0), unreviewed = Number(r.UnreviewedItems || 0);
    var completeness = total > 0 ? Math.max(0, Math.min(1, (total - unreviewed) / total)) : 0;
    rows.push({
      reviewId: String(r.ReviewId || ''), submissionId: String(r.SubmissionId || ''), versionId: String(r.VersionId || ''),
      versionNo: Number(version.VersionNo || 0), reviewerEmail: email, reviewerName: String(r.ReviewerName || email),
      completedDate: kpiDateKey_(r.CompletedAt), uploadedAt: uploaded || '', startedAt: started || '', completedAt: r.CompletedAt || '',
      responseMinutes: responseBusiness, turnaroundMinutes: turnaroundBusiness, responseElapsedMinutes:responseElapsed, turnaroundElapsedMinutes:turnaroundElapsed, reviewElapsedMinutes: elapsedReview,
      activeMinutes: session.activeMinutes, reviewSessions: session.sessions,
      checklistCompletion: completeness, totalItems: total, unreviewedItems: unreviewed,
      decision: String(r.Decision || ''), documentNumber: String(submission.DocumentNumber || ''), documentName: String(submission.DocumentNameSnapshot || ''),
      adminGroup: String(submission.AdminGroupSnapshot || ''), workGroup: String(submission.WorkGroupSnapshot || ''), responsiblePerson: String(submission.ResponsiblePersonSnapshot || ''),
      responseSlaPassed: responseBusiness <= cfg.responseSlaMinutes, turnaroundSlaPassed: turnaroundBusiness <= cfg.turnaroundSlaMinutes
    });
  });
  return rows;
}

/** Engagement stats from actual Officer/Admin audit activity. */
function kpiEngagementByOfficer_(model, filter, cfg) {
  if (!model.audit || !model.audit.length) return kpiEngagementFromDaily_(filter);
  var grouped = {};
  model.audit.forEach(function(a) {
    var email = kpiEmail_(a.ActorEmail);
    if (!email || !kpiInPeriod_(a.Timestamp, filter)) return;
    if (filter.officerEmail && email !== filter.officerEmail) return;
    var role = String(a.ActorRole || '');
    if (role !== PC_CONST.ROLES.OFFICER && role !== PC_CONST.ROLES.ADMIN) return;
    if (!kpiIsProductiveAuditAction_(a)) return;
    var g = grouped[email] = grouped[email] || { timestamps: [], days: {}, queueChecks: 0 };
    g.timestamps.push(a.Timestamp);
    g.days[kpiDateKey_(a.Timestamp)] = true;
    if (String(a.Action || '') === 'LOOKUP') g.queueChecks++;
  });
  var out = {};
  Object.keys(grouped).forEach(function(email) {
    var s = kpiSessionStats_(grouped[email].timestamps, cfg.sessionIdleMinutes, null);
    out[email] = { activeDays: Object.keys(grouped[email].days).length, productiveSessions: s.sessions, observedActiveMinutes: s.activeMinutes, queueChecks: grouped[email].queueChecks };
  });
  return out;
}

/** Uses pre-aggregated daily activity when dashboard intentionally skips raw PC_Audit for performance. */
function kpiEngagementFromDaily_(filter) {
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.DAILY,KPI_HEADERS.PC_KPIDaily),out={};
  rows.forEach(function(r){var day=String(r.Date||''),email=kpiEmail_(r.OfficerEmail);if(!email||day<filter.startDate||day>filter.endDate)return;if(filter.officerEmail&&email!==filter.officerEmail)return;var g=out[email]=out[email]||{activeDays:0,productiveSessions:0,observedActiveMinutes:0,queueChecks:0};if(String(r.ActiveDay).toUpperCase()==='TRUE')g.activeDays++;g.productiveSessions+=Number(r.ProductiveSessions||0);g.observedActiveMinutes+=Number(r.ObservedActiveMinutes||0);g.queueChecks+=Number(r.QueueChecks||0);});
  return out;
}

/** Aggregates review metrics by officer. */
function kpiOfficerTable_(model, metrics, filter, cfg) {
  var active = kpiActiveOfficers_(model), engagement = kpiEngagementByOfficer_(model, filter, cfg), groups = {};
  active.forEach(function(o){ groups[o.email] = { officerEmail:o.email, officerName:o.name, role:o.role, rows:[] }; });
  metrics.forEach(function(m) {
    var g = groups[m.reviewerEmail] || (groups[m.reviewerEmail] = { officerEmail:m.reviewerEmail, officerName:m.reviewerName, role:'', rows:[] });
    if ((!g.officerName || kpiEmail_(g.officerName) === g.officerEmail) && m.reviewerName) g.officerName = m.reviewerName;
    g.rows.push(m);
  });
  var totalCompleted = metrics.length;
  var table = Object.keys(groups).map(function(email) {
    var g = groups[email], rows = g.rows, responses = rows.map(function(x){return x.responseMinutes;}), responseElapsed=rows.map(function(x){return x.responseElapsedMinutes;}), turnarounds = rows.map(function(x){return x.turnaroundMinutes;}), turnaroundElapsed=rows.map(function(x){return x.turnaroundElapsedMinutes;}), elapsed = rows.map(function(x){return x.reviewElapsedMinutes;});
    var unique = {}; rows.forEach(function(x){unique[x.submissionId]=true;});
    var first = rows.filter(function(x){return x.versionNo === 1;}).length;
    var approved = rows.filter(function(x){return x.decision === 'APPROVED';}).length;
    var revision = rows.filter(function(x){return x.decision === 'REVISION_REQUIRED';}).length;
    var responsePassed = rows.filter(function(x){return x.responseSlaPassed;}).length;
    var turnaroundPassed = rows.filter(function(x){return x.turnaroundSlaPassed;}).length;
    var completeness = rows.length ? kpiAverage_(rows.map(function(x){return x.checklistCompletion;})) * 100 : 0;
    var eng = engagement[email] || {activeDays:0,productiveSessions:0,observedActiveMinutes:0,queueChecks:0};
    var out = {
      officerEmail: email, officerName: g.officerName, role:g.role, completedReviews: rows.length, uniqueSubmissions:Object.keys(unique).length,
      firstReviews:first, revisionReviews:rows.length-first, approvedReviews:approved, revisionRequiredReviews:revision,
      medianResponseMinutes:kpiMedian_(responses), p90ResponseMinutes:kpiPercentile_(responses,.90), medianResponseElapsedMinutes:kpiMedian_(responseElapsed),
      medianTurnaroundMinutes:kpiMedian_(turnarounds), p90TurnaroundMinutes:kpiPercentile_(turnarounds,.90), medianTurnaroundElapsedMinutes:kpiMedian_(turnaroundElapsed), medianReviewElapsedMinutes:kpiMedian_(elapsed),
      observedActiveMinutes: (model.audit&&model.audit.length)?rows.reduce(function(s,x){return s+x.activeMinutes;},0):eng.observedActiveMinutes, activeDays:eng.activeDays, productiveSessions:eng.productiveSessions,
      queueChecks:eng.queueChecks, responseSlaRate:rows.length?responsePassed/rows.length*100:0, turnaroundSlaRate:rows.length?turnaroundPassed/rows.length*100:0,
      checklistCompletionRate:completeness, workloadShare:totalCompleted?rows.length/totalCompleted*100:0, sampleSufficient:rows.length>=cfg.minSampleSize,
      score:null
    };
    return out;
  });
  table.sort(function(a,b){return b.completedReviews-a.completedReviews || a.officerName.localeCompare(b.officerName);});
  // score depends on team distribution, calculate in second pass.
  if (cfg.scoreEnabled && !cfg.baselineMode) table.forEach(function(row){ if(row.sampleSufficient) row.score=kpiCompositeScore_(row, table, cfg); });
  return table;
}

/** Conservative composite score; disabled by default until baseline is approved. */
function kpiCompositeScore_(row, team, cfg) {
  var totalWeight = cfg.weights.responsiveness + cfg.weights.workload + cfg.weights.processing + cfg.weights.quality + cfg.weights.engagement;
  if (!totalWeight) return null;
  var positiveWorkloads = (team || []).map(function(x){return Number(x.completedReviews||0);}).filter(function(n){return n>0;});
  var medianWorkload = kpiMedian_(positiveWorkloads) || 1;
  var responsiveness = Math.max(0, Math.min(100, (row.responseSlaRate + row.turnaroundSlaRate) / 2));
  var workload = Math.max(0, Math.min(100, row.completedReviews / medianWorkload * 80)); // capped; avoids rewarding volume without bound.
  // Processing uses observed productive time per completed review when available,
  // not wall-clock StartedAt→CompletedAt, so teaching/meeting gaps do not penalize staff.
  var activePerReview = row.completedReviews > 0 ? Number(row.observedActiveMinutes || 0) / row.completedReviews : 0;
  var processing = activePerReview > 0 ? Math.max(40, Math.min(100, 100 - Math.max(0, activePerReview - 60) / 4)) : 50;
  var quality = Math.max(0, Math.min(100, row.checklistCompletionRate));
  var engagement = Math.max(0, Math.min(100, row.activeDays * 5 + Math.min(50, row.productiveSessions * 2)));
  var weighted = responsiveness*cfg.weights.responsiveness + workload*cfg.weights.workload + processing*cfg.weights.processing + quality*cfg.weights.quality + engagement*cfg.weights.engagement;
  return Math.round(weighted/totalWeight*10)/10;
}

/** Builds service/team overview. */
function kpiOverview_(metrics, officerTable, cfg) {
  var responses=metrics.map(function(x){return x.responseMinutes;}), responseElapsed=metrics.map(function(x){return x.responseElapsedMinutes;}), turns=metrics.map(function(x){return x.turnaroundMinutes;}), turnElapsed=metrics.map(function(x){return x.turnaroundElapsedMinutes;});
  var unique={}; metrics.forEach(function(x){unique[x.submissionId]=true;});
  var responsePass=metrics.filter(function(x){return x.responseSlaPassed;}).length, turnPass=metrics.filter(function(x){return x.turnaroundSlaPassed;}).length;
  return {
    completedReviews:metrics.length, uniqueSubmissions:Object.keys(unique).length,
    medianResponseMinutes:kpiMedian_(responses), p90ResponseMinutes:kpiPercentile_(responses,.9), medianResponseElapsedMinutes:kpiMedian_(responseElapsed),
    medianTurnaroundMinutes:kpiMedian_(turns), p90TurnaroundMinutes:kpiPercentile_(turns,.9), medianTurnaroundElapsedMinutes:kpiMedian_(turnElapsed),
    responseSlaRate:metrics.length?responsePass/metrics.length*100:0, turnaroundSlaRate:metrics.length?turnPass/metrics.length*100:0,
    checklistCompletionRate:metrics.length?kpiAverage_(metrics.map(function(x){return x.checklistCompletion;}))*100:0,
    activeOfficerCount:officerTable.filter(function(x){return x.completedReviews>0;}).length,
    baselineMode:cfg.baselineMode, scoreEnabled:cfg.scoreEnabled
  };
}

/** Current queue status computed from canonical submissions, not cached aggregates. */
function kpiQueueHealth_(model, cfg) {
  var now = new Date(), waiting = [], inReview = 0, revised = 0;
  model.submissions.forEach(function(s) {
    var status=String(s.Status||'');
    if(status===PC_CONST.STATUS.IN_REVIEW){inReview++;return;}
    if(status!==PC_CONST.STATUS.WAITING_REVIEW && status!==PC_CONST.STATUS.WAITING_REVIEW_REVISED)return;
    if(status===PC_CONST.STATUS.WAITING_REVIEW_REVISED)revised++;
    var since=s.LastSubmittedAt||s.UpdatedAt||s.CreatedAt;
    var ageBusiness=kpiBusinessMinutes_(since,now,cfg,kpiGetHolidayMap_());
    var ageElapsed=kpiElapsedMinutes_(since,now);
    var latestVersion=model.versions.filter(function(v){return String(v.SubmissionId)===String(s.SubmissionId);}).sort(function(a,b){return Number(b.VersionNo||0)-Number(a.VersionNo||0);})[0]||{};
    waiting.push({submissionId:String(s.SubmissionId||''),versionId:String(latestVersion.VersionId||''),versionNo:Number(latestVersion.VersionNo||0),documentNumber:String(s.DocumentNumber||''),documentName:String(s.DocumentNameSnapshot||''),status:status,since:since,ageMinutes:ageElapsed,businessAgeMinutes:ageBusiness,overSla:ageBusiness>cfg.responseSlaMinutes});
  });
  waiting.sort(function(a,b){return b.businessAgeMinutes-a.businessAgeMinutes;});
  function count(min,max){return waiting.filter(function(x){return x.ageMinutes>=min&&(max==null||x.ageMinutes<max);}).length;}
  return {waitingCount:waiting.length,inReviewCount:inReview,revisionWaitingCount:revised,under2Hours:count(0,120),hours2to4:count(120,240),hours4to8:count(240,480),over8Hours:count(480,null),oldestWaitingMinutes:waiting.length?waiting[0].businessAgeMinutes:0,overResponseSlaCount:waiting.filter(function(x){return x.overSla;}).length,oldest:waiting.slice(0,10)};
}

/** Daily trend from completed review metrics. */
function kpiTrend_(metrics, filter) {
  var map={}, d=filter.startDate, guard=0;
  while(d<=filter.endDate&&guard++<370){map[d]={date:d,completed:0,responseValues:[],turnaroundValues:[],slaPassed:0};d=kpiAddDateKey_(d,1);}
  metrics.forEach(function(m){var g=map[m.completedDate]||(map[m.completedDate]={date:m.completedDate,completed:0,responseValues:[],turnaroundValues:[],slaPassed:0});g.completed++;g.responseValues.push(m.responseMinutes);g.turnaroundValues.push(m.turnaroundMinutes);if(m.turnaroundSlaPassed)g.slaPassed++;});
  return Object.keys(map).sort().map(function(k){var g=map[k];return{date:k,completed:g.completed,medianResponseMinutes:kpiMedian_(g.responseValues),medianTurnaroundMinutes:kpiMedian_(g.turnaroundValues),turnaroundSlaRate:g.completed?g.slaPassed/g.completed*100:0};});
}
