/** Finds or creates the next editable version while preserving CurrentVersion until submission. */
function pcEnsureDraftVersion_(submission, document, principal) {
  var draft = pcDraftVersion_(submission.SubmissionId);

  if (
    draft &&
    [
      PC_CONST.VERSION_STATUS.DRAFT,
      PC_CONST.VERSION_STATUS.UPLOADED,
      PC_CONST.VERSION_STATUS.UPLOADING
    ].indexOf(String(draft.VersionStatus)) !== -1
  ) {
    return draft;
  }

  var versions = pcVersionsForSubmission_(submission.SubmissionId);

  var nextNo = versions.reduce(function(max, row) {
    return Math.max(max, Number(row.VersionNo || 0));
  }, 0) + 1;

  /*
   * Revision V2+ must start from the latest submitted version so the user
   * edits only what needs correction instead of re-entering the entire report.
   *
   * CurrentVersion deliberately remains unchanged until the new version is
   * successfully submitted for review.
   */
  var previousVersion = null;
  var currentVersionNo = Number(submission.CurrentVersion || 0);

  if (currentVersionNo > 0) {
    previousVersion = versions.find(function(row) {
      return Number(row.VersionNo || 0) === currentVersionNo;
    }) || null;
  }

  return pcAppendObject_(PC_CONST.SHEETS.VERSIONS, {
    VersionId: pcUuid_(),
    SubmissionId: submission.SubmissionId,
    VersionNo: nextNo,
    VersionStatus: PC_CONST.VERSION_STATUS.DRAFT,

    // A revision must upload its own PDF.
    FileId: '',
    FileUrl: '',
    OriginalFileName: '',
    StoredFileName: '',
    FileSizeBytes: '',
    MimeType: '',
    UploadedAt: '',
    UploadedByUsername: '',
    UploadedByEmail: '',

    // Revision note describes only this new version.
    ChangeNote: '',

    // Carry forward structured report data from the current version.
    QuantitativeTarget: previousVersion ? previousVersion.QuantitativeTarget : '',
    QuantitativeResult: previousVersion ? previousVersion.QuantitativeResult : '',
    QualitativeTarget: previousVersion ? previousVersion.QualitativeTarget : '',
    QualitativeResult: previousVersion ? previousVersion.QualitativeResult : '',
    ExpectedTarget: previousVersion ? previousVersion.ExpectedTarget : '',
    ExpectedAchievementResult: previousVersion
      ? previousVersion.ExpectedAchievementResult
      : '',

    ManagementXbar: previousVersion ? previousVersion.ManagementXbar : '',
    ManagementSD: previousVersion ? previousVersion.ManagementSD : '',
    SatisfactionXbar: previousVersion ? previousVersion.SatisfactionXbar : '',
    SatisfactionSD: previousVersion ? previousVersion.SatisfactionSD : '',
    AllocatedBudget: previousVersion ? previousVersion.AllocatedBudget : '',
    ActualBudget: previousVersion ? previousVersion.ActualBudget : '',

    // Master-derived metadata remains server authoritative.
    ActivityNameSnapshot: document.activityName || '',
    ProjectSnapshot: document.project || '',
    ReportValidationType:
      document.reportValidationTypeLabel ||
      document.reportValidationType ||
      '',

    // Preserve an existing internal value, but it remains non-authoritative
    // from the browser/UI.
    PRIndicator: previousVersion ? previousVersion.PRIndicator || '' : '',

    // Officer-correction provenance belongs to the version where it occurred.
    DataCorrectedByOfficer: false,
    DataCorrectedAt: '',
    DataCorrectedByEmail: ''
  });
}

/** Applies only client-supplied editable draft fields while preserving existing draft values on resume. */
function pcPatchDraftFields_(version, payload, document, principal) {
  payload = payload || {};
  var patch = {
    ActivityNameSnapshot: document.activityName || '',
    ProjectSnapshot: document.project || '',
    ReportValidationType: document.reportValidationTypeLabel || document.reportValidationType || ''
  };
  function has(key){ return Object.prototype.hasOwnProperty.call(payload, key); }
  if (has('changeNote')) patch.ChangeNote = String(payload.changeNote || '').trim();
  if (has('quantitativeTarget')) patch.QuantitativeTarget = String(payload.quantitativeTarget || '').trim();
  if (has('quantitativeResult')) patch.QuantitativeResult = String(payload.quantitativeResult || '').trim();
  if (has('qualitativeTarget')) patch.QualitativeTarget = String(payload.qualitativeTarget || '').trim();
  if (has('qualitativeResult')) patch.QualitativeResult = String(payload.qualitativeResult || '').trim();
  if (has('expectedTarget')) patch.ExpectedTarget = String(payload.expectedTarget || '').trim();
  if (has('expectedAchievementResult')) {
    var expectedAchievement = String(payload.expectedAchievementResult || '').trim();
    if (expectedAchievement && ['บรรลุ','ไม่บรรลุ'].indexOf(expectedAchievement) === -1) throw pcUserError_('ค่าผลที่คาดว่าจะได้รับไม่ถูกต้อง', 'INVALID_RESULT_ENUM');
    patch.ExpectedAchievementResult = expectedAchievement;
  }
  if (has('managementXbar')) patch.ManagementXbar = validateDecimalTwoPlaces_(payload.managementXbar, 0.01, 5.00, 'ค่า X̄ (X Bar) ของผลการบริหารกิจกรรม', false);
  if (has('managementSD')) patch.ManagementSD = validateDecimalTwoPlaces_(payload.managementSD, 0.01, 1.00, 'ค่า SD ผลการบริหารกิจกรรม', false);
  if (has('satisfactionXbar')) patch.SatisfactionXbar = validateDecimalTwoPlaces_(payload.satisfactionXbar, 0.01, 5.00, 'ค่า X̄ (X Bar) ความพึงพอใจ', false);
  if (has('satisfactionSD')) patch.SatisfactionSD = validateDecimalTwoPlaces_(payload.satisfactionSD, 0.01, 1.00, 'ค่า SD ความพึงพอใจ', false);
  if (has('allocatedBudget')) patch.AllocatedBudget = pcNumberOrBlank_(payload.allocatedBudget, 'งบประมาณที่ได้รับจัดสรร', 0);
  if (has('actualBudget')) patch.ActualBudget = pcNumberOrBlank_(payload.actualBudget, 'งบประมาณที่ใช้จริง', 0);
  if (has('prIndicator')) patch.PRIndicator = String(payload.prIndicator || '').trim();
  return pcPatchObject_(PC_CONST.SHEETS.VERSIONS, version._rowNumber, patch);
}

/** Validates all mandatory fields immediately before submission. */
function pcValidateVersionForSubmit_(version, document) {
  var requiredText = ['QuantitativeTarget','QuantitativeResult','QualitativeTarget','QualitativeResult','ExpectedTarget','ExpectedAchievementResult'];
  requiredText.forEach(function(field){ if (!String(version[field] == null ? '' : version[field]).trim()) throw pcUserError_('กรุณากรอกข้อมูลรายงานให้ครบถ้วนก่อนส่งตรวจ', 'SUBMISSION_INCOMPLETE'); });
  if (version.AllocatedBudget === '' || version.ActualBudget === '') throw pcUserError_('กรุณากรอกข้อมูลงบประมาณให้ครบถ้วน', 'SUBMISSION_INCOMPLETE');
  if (!version.FileId || !version.FileUrl || String(version.MimeType || '') !== 'application/pdf') throw pcUserError_('กรุณาอัปโหลดไฟล์ PDF ให้สำเร็จก่อนส่งตรวจ', 'PDF_REQUIRED');
  if (document.requiresStatistics) {
    validateDecimalTwoPlaces_(version.ManagementXbar, 0.01, 5.00, 'ค่า X̄ (X Bar) ของผลการบริหารกิจกรรม', true);
    validateDecimalTwoPlaces_(version.ManagementSD, 0.01, 1.00, 'ค่า SD ผลการบริหารกิจกรรม', true);
    validateDecimalTwoPlaces_(version.SatisfactionXbar, 0.01, 5.00, 'ค่า X̄ (X Bar) ความพึงพอใจ', true);
    validateDecimalTwoPlaces_(version.SatisfactionSD, 0.01, 1.00, 'ค่า SD ความพึงพอใจ', true);
  }
  return true;
}
