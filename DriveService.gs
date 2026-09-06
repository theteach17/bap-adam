/** Verifies a Drive folder exists and is accessible by the deployment identity. */
function pcDriveFolder_(folderId, label) {
  try { return DriveApp.getFolderById(String(folderId || '').trim()); }
  catch (e) { throw pcUserError_('ไม่สามารถเข้าถึงพื้นที่จัดเก็บ ' + (label || 'ไฟล์') + ' ได้ กรุณาแจ้งผู้ดูแลระบบ', 'DRIVE_FOLDER_ACCESS'); }
}

/** Returns true when a file currently has the specified parent. */
function pcFileHasParent_(file, folderId) {
  var parents = file.getParents();
  while (parents.hasNext()) if (String(parents.next().getId()) === String(folderId)) return true;
  return false;
}

/** Validates the uploaded Drive object against expected MIME, size and parent. */
function pcValidateDrivePdf_(fileId, expectedSize, expectedFolderId) {
  var file;
  try { file = DriveApp.getFileById(String(fileId)); } catch (e) { throw pcUserError_('ไม่พบไฟล์ที่อัปโหลด กรุณาลองอัปโหลดอีกครั้ง', 'UPLOADED_FILE_MISSING'); }
  if (String(file.getMimeType()) !== 'application/pdf') throw pcUserError_('ไฟล์ที่อัปโหลดไม่ใช่ PDF', 'INVALID_DRIVE_MIME');
  if (Number(file.getSize()) !== Number(expectedSize)) throw pcUserError_('ขนาดไฟล์หลังอัปโหลดไม่ตรงกับไฟล์ต้นฉบับ กรุณาลองใหม่', 'FILE_SIZE_MISMATCH');
  if (expectedFolderId && !pcFileHasParent_(file, expectedFolderId)) throw pcUserError_('ไฟล์ถูกจัดเก็บผิดพื้นที่ ระบบจึงยุติการบันทึก', 'FILE_PARENT_MISMATCH');
  return file;
}

/** Moves an approved file idempotently and keeps the same Drive FileId. */
function pcMoveApprovedFile_(version, submission, document) {
  var finalFolderId = pcFinalFolderIdForAdminGroup_(document.adminGroup);
  var finalFolder = pcDriveFolder_(finalFolderId, 'เอกสารฉบับสมบูรณ์');
  var file = DriveApp.getFileById(String(version.FileId));
  if (!pcFileHasParent_(file, finalFolderId)) file.moveTo(finalFolder);
  var finalName = pcSafeFileName_(document.documentNumber + '-' + document.documentName) + '.pdf';
  if (String(file.getName()) !== finalName) file.setName(finalName);
  return { fileId:file.getId(), fileUrl:file.getUrl(), finalFolderId:finalFolderId };
}
