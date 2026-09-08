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
  var hasDataVerification = items.some(function(i){ var searchable=String(i.ItemLabel||'')+' '+String(i.HelpText||''); return pcBool_(i.Required,false) && searchable.indexOf('ข้อมูลสรุป')!==-1 && searchable.toLowerCase().indexOf('pdf')!==-1; });
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
    if (String(getPrecheckConfig_().defaultTemplateId||'') === String(templateId)) throw pcUserError_('ไม่สามารถยุติแบบตรวจค่าเริ่มต้นได้ กรุณาตั้งแบบตรวจอื่นเป็นค่าเริ่มต้นก่อน','DEFAULT_TEMPLATE_CANNOT_RETIRE');
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
/** Canonical production checklist definition for activity-report Pre-check. */
function pcProductionChecklistDefinition_() {
  return {
    templateName: 'แบบตรวจรายงานผลการดำเนินกิจกรรม (ใช้งานจริง)',
    documentType: PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY,
    items: [
      {sectionOrder:1,sectionTitle:'ส่วนต้นของรายงาน',subsectionOrder:1,subsectionTitle:'',itemOrder:1,itemLabel:'1. ปกหน้า',helpText:'ตรวจว่ามีปกหน้า และข้อมูลสำคัญบนปกสอดคล้องกับข้อมูลทะเบียนและเอกสารที่ส่งตรวจ',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_FRONT',active:true},
      {sectionOrder:1,sectionTitle:'ส่วนต้นของรายงาน',subsectionOrder:1,subsectionTitle:'',itemOrder:2,itemLabel:'2. คำนำ',helpText:'ตรวจว่ามีคำนำและเนื้อหาสอดคล้องกับรายงานผลการดำเนินโครงการ/กิจกรรม',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_FRONT',active:true},
      {sectionOrder:1,sectionTitle:'ส่วนต้นของรายงาน',subsectionOrder:1,subsectionTitle:'',itemOrder:3,itemLabel:'3. สารบัญ',helpText:'ตรวจว่ามีสารบัญ รายการหัวข้อครบถ้วน และเลขหน้าสอดคล้องกับเอกสารจริง',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_FRONT',active:true},
      {sectionOrder:2,sectionTitle:'เนื้อหารายงาน',subsectionOrder:1,subsectionTitle:'',itemOrder:1,itemLabel:'4. ตอนที่ 1 ข้อมูลทั่วไป',helpText:'ตรวจข้อมูลทั่วไปและข้อมูลสรุปที่กรอกในระบบให้ตรงกับข้อมูลใน PDF รวมถึงข้อมูลทะเบียน ชื่อกิจกรรม โครงการ เป้าหมาย ผล งบประมาณ และค่าสถิติที่เกี่ยวข้อง',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_CONTENT',active:true},
      {sectionOrder:2,sectionTitle:'เนื้อหารายงาน',subsectionOrder:1,subsectionTitle:'',itemOrder:2,itemLabel:'5. ตอนที่ 2 ผลการประเมิน',helpText:'ตรวจว่าผลการประเมินครบถ้วน สอดคล้องกับเป้าหมาย ผลการดำเนินงาน และหลักฐานที่เกี่ยวข้อง',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_CONTENT',active:true},
      {sectionOrder:2,sectionTitle:'เนื้อหารายงาน',subsectionOrder:1,subsectionTitle:'',itemOrder:3,itemLabel:'6. ตอนที่ 3 ปัญหาและอุปสรรค แนวทางการปรับปรุงพัฒนา',helpText:'ตรวจว่าระบุปัญหาและอุปสรรค พร้อมแนวทางการปรับปรุงพัฒนาอย่างครบถ้วนและสัมพันธ์กับผลการดำเนินงาน',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_CONTENT',active:true},
      {sectionOrder:2,sectionTitle:'เนื้อหารายงาน',subsectionOrder:1,subsectionTitle:'',itemOrder:4,itemLabel:'7. ตอนที่ 4 ข้อเสนอแนะในการพัฒนา',helpText:'ตรวจว่ามีข้อเสนอแนะในการพัฒนาที่ชัดเจนและสอดคล้องกับผลการประเมิน ปัญหา และอุปสรรค',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_CONTENT',active:true},
      {sectionOrder:3,sectionTitle:'ภาคผนวก',subsectionOrder:1,subsectionTitle:'',itemOrder:1,itemLabel:'8. ภาคผนวก',helpText:'ตรวจว่ามีส่วนภาคผนวกและจัดลำดับเอกสารประกอบอย่างเป็นระบบ',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_APPENDIX',active:true},
      {sectionOrder:3,sectionTitle:'ภาคผนวก',subsectionOrder:2,subsectionTitle:'',itemOrder:1,itemLabel:'8.1 โครงการ/กิจกรรม',helpText:'ตรวจว่ามีเอกสารโครงการ/กิจกรรมที่เกี่ยวข้องและสอดคล้องกับรายงานฉบับนี้',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_APPENDIX',active:true},
      {sectionOrder:3,sectionTitle:'ภาคผนวก',subsectionOrder:2,subsectionTitle:'',itemOrder:2,itemLabel:'8.2 เอกสารประกอบอื่น ๆ',helpText:'ตรวจเอกสารประกอบอื่น ๆ ที่เกี่ยวข้อง หากไม่มีเอกสารประเภทนี้ให้เลือก N/A',required:true,allowNA:true,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_APPENDIX',active:true},
      {sectionOrder:3,sectionTitle:'ภาคผนวก',subsectionOrder:2,subsectionTitle:'',itemOrder:3,itemLabel:'8.3 ภาพการดำเนินโครงการ/กิจกรรม',helpText:'ตรวจว่ามีภาพการดำเนินโครงการ/กิจกรรมที่เหมาะสม ชัดเจน และสอดคล้องกับกิจกรรมที่รายงาน',required:true,allowNA:false,defaultSeverity:'MINOR',quickCommentGroup:'REPORT_PHOTO',active:true}
    ],
    quickComments: [
      {groupId:'REPORT_FRONT',label:'ไม่พบ/ไม่ครบ',fullText:'กรุณาเพิ่มหรือแก้ไขส่วนนี้ให้ครบถ้วนตามรูปแบบรายงาน',sortOrder:10},
      {groupId:'REPORT_FRONT',label:'ข้อมูลไม่ตรง',fullText:'กรุณาตรวจสอบข้อมูลในส่วนนี้ให้ตรงกับข้อมูลทะเบียนและเอกสารที่ส่งตรวจ',sortOrder:20},
      {groupId:'REPORT_CONTENT',label:'เนื้อหาไม่ครบ',fullText:'กรุณาเพิ่มเติมข้อมูลในส่วนนี้ให้ครบถ้วนและชัดเจน',sortOrder:30},
      {groupId:'REPORT_CONTENT',label:'ข้อมูลไม่สอดคล้อง',fullText:'กรุณาตรวจสอบและแก้ไขข้อมูลให้สอดคล้องกับผลการดำเนินงาน ข้อมูลในระบบ และหลักฐานที่เกี่ยวข้อง',sortOrder:40},
      {groupId:'REPORT_APPENDIX',label:'ภาคผนวกไม่ครบ',fullText:'กรุณาเพิ่มหรือจัดเอกสารในภาคผนวกให้ครบถ้วนตามรายการที่กำหนด',sortOrder:50},
      {groupId:'REPORT_APPENDIX',label:'หลักฐานไม่สอดคล้อง',fullText:'กรุณาตรวจสอบเอกสารประกอบให้สอดคล้องกับโครงการ/กิจกรรมและรายงานฉบับนี้',sortOrder:60},
      {groupId:'REPORT_PHOTO',label:'ภาพไม่ครบ/ไม่ชัดเจน',fullText:'กรุณาเพิ่มหรือปรับภาพการดำเนินโครงการ/กิจกรรมให้ครบถ้วน ชัดเจน และสอดคล้องกับกิจกรรม',sortOrder:70}
    ]
  };
}

/** Checks whether a template exactly matches the canonical production checklist structure. */
function pcIsProductionChecklistTemplate_(templateId) {
  var expected = pcProductionChecklistDefinition_().items;
  var actual = pcTemplateItems_(templateId);
  if (actual.length !== expected.length) return false;
  for (var i = 0; i < expected.length; i++) {
    var a = actual[i], e = expected[i];
    if (String(a.ItemLabel||'') !== e.itemLabel || String(a.SectionTitle||'') !== e.sectionTitle) return false;
    if (Number(a.SectionOrder||0) !== Number(e.sectionOrder) || Number(a.SubsectionOrder||0) !== Number(e.subsectionOrder) || Number(a.ItemOrder||0) !== Number(e.itemOrder)) return false;
    if (pcBool_(a.Required,false) !== !!e.required || pcBool_(a.AllowNA,false) !== !!e.allowNA) return false;
  }
  return true;
}

/** Ensures reusable production quick comments exist, without creating duplicates. */
function pcEnsureProductionQuickComments_() {
  var defs = pcProductionChecklistDefinition_().quickComments;
  var existing = pcListObjects_(PC_CONST.SHEETS.QUICK_COMMENTS);
  var created = 0, updated = 0;
  defs.forEach(function(def){
    var found = existing.filter(function(q){ return String(q.GroupId) === def.groupId && String(q.Label) === def.label; })[0] || null;
    var patch = {GroupId:def.groupId,Label:def.label,FullText:def.fullText,Active:true,SortOrder:def.sortOrder};
    if (found) {
      if (String(found.FullText||'') !== def.fullText || !pcBool_(found.Active,true) || Number(found.SortOrder||0) !== Number(def.sortOrder)) {
        pcPatchObject_(PC_CONST.SHEETS.QUICK_COMMENTS, found._rowNumber, patch);updated++;
      }
    } else {
      patch.QuickCommentId = pcUuid_();pcAppendObject_(PC_CONST.SHEETS.QUICK_COMMENTS, patch);created++;
    }
  });
  return {created:created,updated:updated};
}

/** Admin API: returns production-template metadata used by the Admin UI. */
function getProductionChecklistAdminData() {
  requirePrecheckAdmin_('getProductionChecklistAdminData');
  var cfg=getPrecheckConfig_(),def=pcProductionChecklistDefinition_();
  return {defaultTemplateId:cfg.defaultTemplateId,productionChecklist:{templateName:def.templateName,items:def.items}};
}

/** Admin API: installs/publishes the canonical checklist, makes it default, and retires overlapping older published templates. */
function installProductionChecklistTemplate() {
  try {
    var principal = requirePrecheckAdmin_('installProductionChecklistTemplate');
    var result = pcWithScriptLock_(function(){
      var def=pcProductionChecklistDefinition_(),cfg=getPrecheckConfig_(),templates=pcListObjects_(PC_CONST.SHEETS.TEMPLATES);
      var candidates=templates.filter(function(t){return String(t.DocumentType)===PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY&&String(t.Status)!==PC_CONST.TEMPLATE_STATUS.RETIRED&&pcIsProductionChecklistTemplate_(t.TemplateId);})
        .sort(function(a,b){return Number(b.TemplateVersion||0)-Number(a.TemplateVersion||0);});
      var template=candidates[0]||null,created=false;
      if(!template){
        var nextVersion=templates.filter(function(t){return String(t.DocumentType)===PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY;}).reduce(function(m,t){return Math.max(m,Number(t.TemplateVersion||0));},0)+1;
        var templateId=pcUuid_();
        template=pcAppendObject_(PC_CONST.SHEETS.TEMPLATES,{TemplateId:templateId,TemplateName:def.templateName,TemplateVersion:nextVersion,DocumentType:PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY,AcademicYearFrom:Number(cfg.enforceFromYear||2569),AcademicYearTo:'',Status:PC_CONST.TEMPLATE_STATUS.DRAFT,CreatedAt:pcNowIso_(),CreatedBy:principal.email||principal.username,PublishedAt:''});
        pcAppendObjects_(PC_CONST.SHEETS.TEMPLATE_ITEMS,def.items.map(function(x){return{ItemId:pcUuid_(),TemplateId:templateId,SectionOrder:x.sectionOrder,SectionTitle:x.sectionTitle,SubsectionOrder:x.subsectionOrder,SubsectionTitle:x.subsectionTitle,ItemOrder:x.itemOrder,ItemLabel:x.itemLabel,HelpText:x.helpText,Required:x.required,AllowNA:x.allowNA,DefaultSeverity:x.defaultSeverity,QuickCommentGroup:x.quickCommentGroup,Active:x.active};}));
        template=pcFindObject_(PC_CONST.SHEETS.TEMPLATES,'TemplateId',templateId,false);created=true;
      }
      pcValidatePublishedTemplate_(template.TemplateId);
      if(String(template.Status)===PC_CONST.TEMPLATE_STATUS.DRAFT)template=pcPatchObject_(PC_CONST.SHEETS.TEMPLATES,template._rowNumber,{Status:PC_CONST.TEMPLATE_STATUS.PUBLISHED,PublishedAt:pcNowIso_()});
      var quick=pcEnsureProductionQuickComments_();
      PropertiesService.getScriptProperties().setProperty('PC_DEFAULT_TEMPLATE_ID',String(template.TemplateId));
      pcMemoDrop_('cfg:precheck'); // [HARDENING v2.1.2] expose the new default immediately in this execution
      var retired=[];
      pcListObjects_(PC_CONST.SHEETS.TEMPLATES).forEach(function(t){
        if(String(t.TemplateId)===String(template.TemplateId)||String(t.DocumentType)!==PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY||String(t.Status)!==PC_CONST.TEMPLATE_STATUS.PUBLISHED)return;
        if(Number(t.AcademicYearTo||9999)<Number(cfg.enforceFromYear||2569))return;
        pcPatchObject_(PC_CONST.SHEETS.TEMPLATES,t._rowNumber,{Status:PC_CONST.TEMPLATE_STATUS.RETIRED});retired.push(String(t.TemplateId));
      });
      CacheService.getScriptCache().remove('PC_TEMPLATE_CACHE');
      return{template:template,created:created,retiredTemplateIds:retired,quickComments:quick,itemCount:pcTemplateItems_(template.TemplateId).length};
    });
    pcAudit_('PRODUCTION_TEMPLATE_INSTALLED',{},principal,{templateId:result.template.TemplateId,created:result.created,itemCount:result.itemCount,retiredTemplateIds:result.retiredTemplateIds});
    return{success:true,templateId:result.template.TemplateId,templateName:result.template.TemplateName,templateVersion:Number(result.template.TemplateVersion||0),itemCount:result.itemCount,created:result.created,retiredCount:result.retiredTemplateIds.length,quickComments:result.quickComments};
  }catch(error){throw pcHandlePublicError_(error,'installProductionChecklistTemplate',{});}
}

/** Admin API: sets one published report template as default for new submissions. */
function setDefaultPrecheckTemplate(templateId) {
  try{
    var principal=requirePrecheckAdmin_('setDefaultPrecheckTemplate');
    var template=pcFindObject_(PC_CONST.SHEETS.TEMPLATES,'TemplateId',templateId,false);
    if(!template||String(template.Status)!==PC_CONST.TEMPLATE_STATUS.PUBLISHED||String(template.DocumentType)!==PC_CONST.DOCUMENT_TYPES.REPORT_ACTIVITY)throw pcUserError_('ตั้งเป็นค่าเริ่มต้นได้เฉพาะแบบตรวจรายงานที่เผยแพร่แล้ว','INVALID_DEFAULT_TEMPLATE');
    pcValidatePublishedTemplate_(templateId);PropertiesService.getScriptProperties().setProperty('PC_DEFAULT_TEMPLATE_ID',String(templateId));pcMemoDrop_('cfg:precheck');CacheService.getScriptCache().remove('PC_TEMPLATE_CACHE');
    pcAudit_('DEFAULT_TEMPLATE_CHANGED',{},principal,{templateId:templateId});return{success:true,templateId:templateId};
  }catch(error){throw pcHandlePublicError_(error,'setDefaultPrecheckTemplate',{templateId:templateId});}
}
