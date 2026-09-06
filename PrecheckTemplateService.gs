/** Resolves the immutable published template for a document. */
function pcResolveTemplateForDocument_(document) {
  var cfg = getPrecheckConfig_();
  var templates = pcListObjects_(PC_CONST.SHEETS.TEMPLATES).filter(function(t){
    if (String(t.Status) !== PC_CONST.TEMPLATE_STATUS.PUBLISHED) return false;
    if (String(t.DocumentType) !== PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY) return false;
    var from = Number(t.AcademicYearFrom || 0), to = Number(t.AcademicYearTo || 9999), year = Number(document.documentYear || 0);
    return (!from || year >= from) && (!to || year <= to);
  });
  var selected = null;
  if (cfg.defaultTemplateId) selected = templates.filter(function(t){ return String(t.TemplateId) === cfg.defaultTemplateId; })[0] || null;
  if (!selected) templates.sort(function(a,b){ return Number(b.TemplateVersion || 0) - Number(a.TemplateVersion || 0); }), selected = templates[0] || null;
  if (!selected) throw pcUserError_('ยังไม่มีแบบตรวจที่เผยแพร่สำหรับเอกสารนี้ กรุณาแจ้งผู้ดูแลระบบ', 'TEMPLATE_MISSING');
  pcValidatePublishedTemplate_(selected.TemplateId);
  return selected;
}

/** Returns active items for one template in stable section/item order. */
function pcTemplateItems_(templateId) {
  return pcFilterObjects_(PC_CONST.SHEETS.TEMPLATE_ITEMS, function(i){ return String(i.TemplateId) === String(templateId) && pcBool_(i.Active, true); })
    .sort(function(a,b){ return Number(a.SectionOrder||0)-Number(b.SectionOrder||0) || Number(a.SubsectionOrder||0)-Number(b.SubsectionOrder||0) || Number(a.ItemOrder||0)-Number(b.ItemOrder||0); });
}

/** Enforces the mandatory data-verification item and non-empty active checklist. */
function pcValidatePublishedTemplate_(templateId) {
  var items = pcTemplateItems_(templateId);
  if (!items.length) throw new Error('Published template has no active items: ' + templateId);
  var hasDataVerification = items.some(function(i){ return pcBool_(i.Required, false) && String(i.ItemLabel || '').indexOf('ข้อมูลสรุป') !== -1 && String(i.ItemLabel || '').indexOf('PDF') !== -1; });
  if (!hasDataVerification) throw new Error('Published template is missing the mandatory data-verification item');
  return true;
}

/** Returns published template items and quick comments for a submission. */
function getSubmissionTemplate(submissionId) {
  var principal = getCurrentPrincipal_();
  var submission = pcSubmissionById_(submissionId);
  if (!submission || !pcCanViewSubmission_(submission, principal)) throw pcUserError_('ไม่พบรายการหรือคุณไม่มีสิทธิ์ดูข้อมูลนี้', 'FORBIDDEN');
  return { items:pcTemplateItems_(submission.TemplateId), quickComments:pcListObjects_(PC_CONST.SHEETS.QUICK_COMMENTS).filter(function(q){ return pcBool_(q.Active, true); }) };
}

/** Admin API: returns template, item, quick-comment and access data. */
function getTemplateAdminData() {
  requirePrecheckAdmin_('getTemplateAdminData');
  return {
    templates: pcListObjects_(PC_CONST.SHEETS.TEMPLATES),
    items: pcListObjects_(PC_CONST.SHEETS.TEMPLATE_ITEMS),
    quickComments: pcListObjects_(PC_CONST.SHEETS.QUICK_COMMENTS),
    access: pcListObjects_(PC_CONST.SHEETS.ACCESS)
  };
}

/** Admin API: clones a template into an editable new version. */
function cloneTemplate(templateId, newName) {
  try {
    var principal = requirePrecheckAdmin_('cloneTemplate');
    return pcWithScriptLock_(function(){
      var source = pcFindObject_(PC_CONST.SHEETS.TEMPLATES, 'TemplateId', templateId, false);
      if (!source) throw pcUserError_('ไม่พบแบบตรวจต้นฉบับ', 'TEMPLATE_NOT_FOUND');
      var siblings = pcFilterObjects_(PC_CONST.SHEETS.TEMPLATES, function(t){ return String(t.DocumentType) === String(source.DocumentType); });
      var nextVersion = siblings.reduce(function(m,t){ return Math.max(m, Number(t.TemplateVersion||0)); }, 0) + 1;
      var id = pcUuid_();
      var created = pcAppendObject_(PC_CONST.SHEETS.TEMPLATES, {
        TemplateId:id, TemplateName:String(newName || source.TemplateName || 'แบบตรวจ').trim(), TemplateVersion:nextVersion,
        DocumentType:source.DocumentType, AcademicYearFrom:source.AcademicYearFrom, AcademicYearTo:source.AcademicYearTo,
        Status:PC_CONST.TEMPLATE_STATUS.DRAFT, CreatedAt:pcNowIso_(), CreatedBy:principal.email || principal.username, PublishedAt:''
      });
      var items = pcFilterObjects_(PC_CONST.SHEETS.TEMPLATE_ITEMS, function(i){ return String(i.TemplateId) === String(templateId); });
      var copies = items.map(function(i){
        var copy = {};
        PC_HEADERS.PC_TemplateItems.forEach(function(h){ copy[h] = i[h]; });
        copy.ItemId = pcUuid_(); copy.TemplateId = id; return copy;
      });
      pcAppendObjects_(PC_CONST.SHEETS.TEMPLATE_ITEMS, copies);
      pcAudit_('TEMPLATE_CLONED', {}, principal, { sourceTemplateId:templateId, newTemplateId:id });
      return created;
    });
  } catch (error) { throw pcHandlePublicError_(error, 'cloneTemplate', { templateId:templateId }); }
}

/** Admin API: creates or updates an item only while the template is DRAFT. */
function upsertTemplateItem(templateId, item) {
  try {
    var principal = requirePrecheckAdmin_('upsertTemplateItem');
    item = item || {};
    return pcWithScriptLock_(function(){
      var template = pcFindObject_(PC_CONST.SHEETS.TEMPLATES, 'TemplateId', templateId, false);
      if (!template || String(template.Status) !== PC_CONST.TEMPLATE_STATUS.DRAFT) throw pcUserError_('แก้ไขได้เฉพาะแบบตรวจสถานะร่าง', 'TEMPLATE_IMMUTABLE');
      var existing = item.itemId ? pcFindObject_(PC_CONST.SHEETS.TEMPLATE_ITEMS, 'ItemId', item.itemId, false) : null;
      if (existing && String(existing.TemplateId) !== String(templateId)) throw pcUserError_('รายการตรวจไม่อยู่ในแบบตรวจที่กำลังแก้ไข', 'TEMPLATE_ITEM_MISMATCH');
      var data = {
        TemplateId:templateId, SectionOrder:pcInt_(item.sectionOrder,1,1,999), SectionTitle:String(item.sectionTitle||'การตรวจเอกสาร').trim(),
        SubsectionOrder:pcInt_(item.subsectionOrder,1,1,999), SubsectionTitle:String(item.subsectionTitle||'').trim(), ItemOrder:pcInt_(item.itemOrder,1,1,999),
        ItemLabel:String(item.itemLabel||'').trim(), HelpText:String(item.helpText||'').trim(), Required:pcBool_(item.required,false), AllowNA:pcBool_(item.allowNA,false),
        DefaultSeverity:['MINOR','CRITICAL'].indexOf(String(item.defaultSeverity||'MINOR')) !== -1 ? String(item.defaultSeverity||'MINOR') : 'MINOR',
        QuickCommentGroup:String(item.quickCommentGroup||'GENERAL').trim(), Active:item.active == null ? true : pcBool_(item.active,true)
      };
      if (!data.ItemLabel) throw pcUserError_('กรุณาระบุรายการตรวจ', 'ITEM_LABEL_REQUIRED');
      if (existing) return pcPatchObject_(PC_CONST.SHEETS.TEMPLATE_ITEMS, existing._rowNumber, data);
      data.ItemId = pcUuid_();
      var created = pcAppendObject_(PC_CONST.SHEETS.TEMPLATE_ITEMS, data);
      pcAudit_('TEMPLATE_ITEM_CHANGED', {}, principal, { templateId:templateId, itemId:created.ItemId });
      return created;
    });
  } catch (error) { throw pcHandlePublicError_(error, 'upsertTemplateItem', { templateId:templateId }); }
}

/** Admin API: validates and publishes an immutable template version. */
function publishTemplate(templateId) {
  try {
    var principal = requirePrecheckAdmin_('publishTemplate');
    return pcWithScriptLock_(function(){
      var template = pcFindObject_(PC_CONST.SHEETS.TEMPLATES, 'TemplateId', templateId, false);
      if (!template) throw pcUserError_('ไม่พบแบบตรวจ', 'TEMPLATE_NOT_FOUND');
      if (String(template.Status) === PC_CONST.TEMPLATE_STATUS.PUBLISHED) return template;
      if (String(template.Status) !== PC_CONST.TEMPLATE_STATUS.DRAFT) throw pcUserError_('แบบตรวจนี้ไม่สามารถเผยแพร่ได้', 'INVALID_TEMPLATE_STATE');
      pcValidatePublishedTemplate_(templateId);
      var updated = pcPatchObject_(PC_CONST.SHEETS.TEMPLATES, template._rowNumber, { Status:PC_CONST.TEMPLATE_STATUS.PUBLISHED, PublishedAt:pcNowIso_() });
      pcAudit_('TEMPLATE_PUBLISHED', {}, principal, { templateId:templateId });
      return updated;
    });
  } catch (error) { throw pcHandlePublicError_(error, 'publishTemplate', { templateId:templateId }); }
}

/** Admin API: retires a template so it cannot be selected for new submissions. Existing submissions keep their frozen TemplateId. */
function retireTemplate(templateId) {
  try {
    var principal = requirePrecheckAdmin_('retireTemplate');
    return pcWithScriptLock_(function(){
      var template = pcFindObject_(PC_CONST.SHEETS.TEMPLATES, 'TemplateId', templateId, false);
      if (!template) throw pcUserError_('ไม่พบแบบตรวจ', 'TEMPLATE_NOT_FOUND');
      if (String(template.Status) === PC_CONST.TEMPLATE_STATUS.RETIRED) return template;
      if ([PC_CONST.TEMPLATE_STATUS.DRAFT, PC_CONST.TEMPLATE_STATUS.PUBLISHED].indexOf(String(template.Status)) === -1) throw pcUserError_('แบบตรวจนี้ไม่สามารถยุติการใช้งานได้', 'INVALID_TEMPLATE_STATE');
      var updated = pcPatchObject_(PC_CONST.SHEETS.TEMPLATES, template._rowNumber, { Status:PC_CONST.TEMPLATE_STATUS.RETIRED });
      pcAudit_('TEMPLATE_RETIRED', {}, principal, { templateId:templateId });
      CacheService.getScriptCache().remove('PC_TEMPLATE_CACHE');
      return updated;
    });
  } catch (error) { throw pcHandlePublicError_(error, 'retireTemplate', { templateId:templateId }); }
}

/** Admin API: updates or creates an officer/admin access entry. */
function upsertPrecheckAccess(entry) {
  try {
    var principal = requirePrecheckAdmin_('upsertPrecheckAccess');
    entry = entry || {};
    var email = pcKey_(entry.email);
    var role = String(entry.role || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw pcUserError_('รูปแบบ Email ไม่ถูกต้อง', 'INVALID_EMAIL');
    if ([PC_CONST.ROLES.OFFICER, PC_CONST.ROLES.ADMIN].indexOf(role) === -1) throw pcUserError_('Role ไม่ถูกต้อง', 'INVALID_ROLE');
    var now = pcNowIso_();
    var existing = pcFindObject_(PC_CONST.SHEETS.ACCESS, 'Email', email, true);
    var result = existing ? pcPatchObject_(PC_CONST.SHEETS.ACCESS, existing._rowNumber, { Role:role, DisplayName:String(entry.displayName||'').trim(), Active:pcBool_(entry.active,true), UpdatedAt:now })
      : pcAppendObject_(PC_CONST.SHEETS.ACCESS, { Email:email, Role:role, DisplayName:String(entry.displayName||'').trim(), Active:pcBool_(entry.active,true), CreatedAt:now, UpdatedAt:now });
    CacheService.getScriptCache().remove('PC_ACCESS_CACHE');
    pcAudit_('ACCESS_CHANGED', {}, principal, { targetEmail:email, role:role, active:result.Active });
    return result;
  } catch (error) { throw pcHandlePublicError_(error, 'upsertPrecheckAccess', {}); }
}

/** Admin API: creates or updates a reusable quick comment. */
function upsertQuickComment(entry) {
  try {
    var principal=requirePrecheckAdmin_('upsertQuickComment'); entry=entry||{};
    var groupId=String(entry.groupId||'GENERAL').trim(), label=String(entry.label||'').trim(), fullText=String(entry.fullText||'').trim();
    if(!label||!fullText) throw pcUserError_('กรุณาระบุ Label และข้อความ Quick Comment','QUICK_COMMENT_REQUIRED');
    var existing=entry.quickCommentId?pcFindObject_(PC_CONST.SHEETS.QUICK_COMMENTS,'QuickCommentId',entry.quickCommentId,false):null;
    var patch={GroupId:groupId,Label:label,FullText:fullText,Active:entry.active==null?true:pcBool_(entry.active,true),SortOrder:pcInt_(entry.sortOrder,1,1,9999)},result;
    if(existing) result=pcPatchObject_(PC_CONST.SHEETS.QUICK_COMMENTS,existing._rowNumber,patch);
    else {patch.QuickCommentId=pcUuid_();result=pcAppendObject_(PC_CONST.SHEETS.QUICK_COMMENTS,patch);}
    pcAudit_('QUICK_COMMENT_CHANGED',{},principal,{quickCommentId:result.QuickCommentId,groupId:groupId,active:result.Active});
    return result;
  } catch(error){throw pcHandlePublicError_(error,'upsertQuickComment',{});}
}
