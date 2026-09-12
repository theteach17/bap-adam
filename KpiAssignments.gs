/** Optional opportunity/assignment layer. Default mode OFF so existing Officer workflow is unchanged. */

/** Finds current assignment for a VersionId. */
function kpiFindAssignment_(versionId) {
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.ASSIGNMENTS,KPI_HEADERS.PC_KPIAssignments);
  for(var i=rows.length-1;i>=0;i--)if(String(rows[i].VersionId)===String(versionId)&&['AVAILABLE','ASSIGNED','CLAIMED','IN_PROGRESS'].indexOf(String(rows[i].Status))>=0)return{row:rows[i],rowNumber:i+2};
  return null;
}

/** Reconciles waiting work into optional assignment metadata. */
function kpiReconcileAssignments_(model,cfg) {
  if(cfg.assignmentMode===KPI_CONST.ASSIGNMENT_MODE.OFF)return{mode:'OFF',created:0,completed:0};
  var rows=kpiReadObjects_(KPI_CONST.SHEETS.ASSIGNMENTS,KPI_HEADERS.PC_KPIAssignments),byVersion={},now=kpiNowIso_(),created=[],completed=0;
  rows.forEach(function(r,i){(byVersion[String(r.VersionId||'')]=byVersion[String(r.VersionId||'')]||[]).push({row:r,rowNumber:i+2});});
  var allActive=kpiActiveOfficers_(model);
  var active=allActive.filter(function(o){return o.role===PC_CONST.ROLES.OFFICER;});
  if(!active.length)active=allActive.filter(function(o){return o.role===PC_CONST.ROLES.ADMIN;});
  var openCount={};rows.forEach(function(r){if(['ASSIGNED','CLAIMED','IN_PROGRESS'].indexOf(String(r.Status))>=0){var e=kpiEmail_(r.OfficerEmail);openCount[e]=(openCount[e]||0)+1;}});
  function chooseOfficer(){return active.slice().sort(function(a,b){return(openCount[a.email]||0)-(openCount[b.email]||0)||a.email.localeCompare(b.email);})[0]||null;}
  model.submissions.forEach(function(s){
    var status=String(s.Status||'');if(status!==PC_CONST.STATUS.WAITING_REVIEW&&status!==PC_CONST.STATUS.WAITING_REVIEW_REVISED)return;
    var version=model.versions.filter(function(v){return String(v.SubmissionId)===String(s.SubmissionId);}).sort(function(a,b){return Number(b.VersionNo||0)-Number(a.VersionNo||0);})[0];
    if(!version||byVersion[String(version.VersionId||'')])return;
    var officer=cfg.assignmentMode===KPI_CONST.ASSIGNMENT_MODE.ROUND_ROBIN?chooseOfficer():null;
    var id=kpiUuid_(),obj={AssignmentId:id,AssignmentKey:'ASSIGN:'+version.VersionId,SubmissionId:String(s.SubmissionId||''),VersionId:String(version.VersionId||''),OfficerEmail:officer?officer.email:'',OfficerName:officer?officer.name:'',AssignmentType:cfg.assignmentMode,AssignedAt:officer?now:'',AssignedBy:officer?'SYSTEM':'',ClaimedAt:'',FirstOpenedAt:'',CompletedAt:'',CompletedByEmail:'',CompletedByName:'',Status:officer?KPI_CONST.ASSIGNMENT_STATUS.ASSIGNED:KPI_CONST.ASSIGNMENT_STATUS.AVAILABLE,ReassignedFrom:'',ReassignedTo:'',Reason:'',CreatedAt:now,UpdatedAt:now};
    created.push(obj);byVersion[String(version.VersionId)]=[{row:obj,rowNumber:0}];if(officer)openCount[officer.email]=(openCount[officer.email]||0)+1;
  });
  if(created.length)kpiAppendObjects_(KPI_CONST.SHEETS.ASSIGNMENTS,KPI_HEADERS.PC_KPIAssignments,created);
  // Mark assignments completed from authoritative completed reviews.
  model.reviews.filter(function(r){return String(r.ReviewStatus)===PC_CONST.REVIEW_STATUS.COMPLETED&&r.CompletedAt;}).forEach(function(r){var list=byVersion[String(r.VersionId||'')]||[];list.forEach(function(item){if(!item.rowNumber)return;var st=String(item.row.Status||'');if(['COMPLETED','COMPLETED_OTHER','CANCELLED','REASSIGNED'].indexOf(st)>=0)return;item.row.CompletedAt=r.CompletedAt;item.row.CompletedByEmail=kpiEmail_(r.ReviewerEmail);item.row.CompletedByName=String(r.ReviewerName||'');item.row.Status=item.row.OfficerEmail&&kpiEmail_(item.row.OfficerEmail)!==kpiEmail_(r.ReviewerEmail)?KPI_CONST.ASSIGNMENT_STATUS.COMPLETED_OTHER:KPI_CONST.ASSIGNMENT_STATUS.COMPLETED;item.row.UpdatedAt=now;kpiUpdateRow_(KPI_CONST.SHEETS.ASSIGNMENTS,KPI_HEADERS.PC_KPIAssignments,item.rowNumber,item.row);completed++;});});
  return{mode:cfg.assignmentMode,created:created.length,completed:completed};
}

/** Admin assigns or reassigns a version without restricting legacy queue access. */
function adminAssignKpiWork(submissionId,versionId,officerEmail,reason) {
  requirePrecheckAdmin_('adminAssignKpiWork');if(kpiGetConfig_().assignmentMode===KPI_CONST.ASSIGNMENT_MODE.OFF)throw pcUserError_('Assignment Mode ยังปิดอยู่','KPI_ASSIGNMENT_DISABLED');var principal=getCurrentPrincipal_(),email=kpiEmail_(officerEmail),model=kpiLoadModel_();
  var officer=kpiActiveOfficers_(model).filter(function(o){return o.email===email;})[0];if(!officer)throw pcUserError_('ไม่พบเจ้าหน้าที่ที่ Active','KPI_OFFICER_NOT_FOUND');
  if(!model.versionById[String(versionId||'')])throw pcUserError_('ไม่พบ Version ที่ต้องการมอบหมาย','KPI_VERSION_NOT_FOUND');
  var now=kpiNowIso_(),found=kpiFindAssignment_(versionId);
  if(found){var old=kpiEmail_(found.row.OfficerEmail);found.row.Status=KPI_CONST.ASSIGNMENT_STATUS.REASSIGNED;found.row.ReassignedFrom=old;found.row.ReassignedTo=email;found.row.UpdatedAt=now;kpiUpdateRow_(KPI_CONST.SHEETS.ASSIGNMENTS,KPI_HEADERS.PC_KPIAssignments,found.rowNumber,found.row);}
  var obj={AssignmentId:kpiUuid_(),AssignmentKey:'ASSIGN:'+versionId+':'+now,SubmissionId:String(submissionId||''),VersionId:String(versionId||''),OfficerEmail:email,OfficerName:officer.name,AssignmentType:'MANUAL',AssignedAt:now,AssignedBy:kpiEmail_(principal.email),ClaimedAt:'',FirstOpenedAt:'',CompletedAt:'',CompletedByEmail:'',CompletedByName:'',Status:KPI_CONST.ASSIGNMENT_STATUS.ASSIGNED,ReassignedFrom:found?kpiEmail_(found.row.OfficerEmail):'',ReassignedTo:'',Reason:String(reason||''),CreatedAt:now,UpdatedAt:now};
  kpiAppendObjects_(KPI_CONST.SHEETS.ASSIGNMENTS,KPI_HEADERS.PC_KPIAssignments,[obj]);
  try{pcAudit_('KPI_ASSIGN_WORK',{submissionId:submissionId,versionId:versionId},principal,{officerEmail:email,reason:String(reason||'')});}catch(ignored){}
  return{ok:true,assignmentId:obj.AssignmentId};
}

/** Officer claims own/available assignment; additive metadata only. */
function claimKpiAssignment(assignmentId) {
  requireOfficer_('claimKpiAssignment');if(kpiGetConfig_().assignmentMode===KPI_CONST.ASSIGNMENT_MODE.OFF)throw pcUserError_('Assignment Mode ยังปิดอยู่','KPI_ASSIGNMENT_DISABLED');var principal=getCurrentPrincipal_(),email=kpiEmail_(principal.email),rows=kpiReadObjects_(KPI_CONST.SHEETS.ASSIGNMENTS,KPI_HEADERS.PC_KPIAssignments),now=kpiNowIso_();
  for(var i=0;i<rows.length;i++){var r=rows[i];if(String(r.AssignmentId)!==String(assignmentId))continue;var assigned=kpiEmail_(r.OfficerEmail);if(assigned&&assigned!==email&&principal.roles.indexOf(PC_CONST.ROLES.ADMIN)===-1)throw pcUserError_('งานนี้ถูกมอบหมายให้เจ้าหน้าที่อื่น','KPI_ASSIGNMENT_FORBIDDEN');if(['AVAILABLE','ASSIGNED'].indexOf(String(r.Status))===-1)throw pcUserError_('สถานะงานไม่สามารถรับได้','KPI_ASSIGNMENT_STATE');r.OfficerEmail=email;r.OfficerName=String(principal.displayName||email);r.ClaimedAt=now;r.Status=KPI_CONST.ASSIGNMENT_STATUS.CLAIMED;r.UpdatedAt=now;kpiUpdateRow_(KPI_CONST.SHEETS.ASSIGNMENTS,KPI_HEADERS.PC_KPIAssignments,i+2,r);return{ok:true,assignmentId:r.AssignmentId};}
  throw pcUserError_('ไม่พบ Assignment','KPI_ASSIGNMENT_NOT_FOUND');
}
