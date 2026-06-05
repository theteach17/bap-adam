var sheetName = 'ReportNo';
var reportSubmitSheetName = 'ReportSubmit';
var scriptProp = PropertiesService.getScriptProperties();

function initialSetup() {
  var activeSpreadsheet = SpreadsheetApp.openById('1hGYwUELNW7-MZpjZMYOLtCEChgFrbj06Cj0ILRJw05I');
  scriptProp.setProperty('key', activeSpreadsheet.getId());
}

// ==========================================
// [EDITED] ฟังก์ชันแก้ไข: ทำระบบดักจับข้อผิดพลาดและดึงค่าตั้งค่า
// ==========================================
function doGet(e) {
  try {
    var page = e.parameter.page || 'Login';
    var settings = getGlobalSettings();
    var webTitle = settings['WEB_TITLE'] || 'ศูนย์สารสนเทศกลาง KIC';
    var logoUrl = settings['LOGO_URL'] || 'https://img2.pic.in.th/pic/logofd3322a65d133ac4.png';

    return HtmlService.createHtmlOutputFromFile(page)
      .setTitle(webTitle)
      .setFaviconUrl(logoUrl)
      //.addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return ContentService.createTextOutput("เกิดข้อผิดพลาดในการโหลดระบบ: ไม่พบไฟล์หน้าเว็บ " + (e.parameter.page || 'Login') + " หรือ " + error.message);
  }
}

function checkLogin(username, password) {
  const ss = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  const sheet = ss.getSheetByName('Credential');
  const data = sheet.getDataRange().getValues();
  let loginSuccess = false;
  let name = '';
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      loginSuccess = true;
      name = data[i][4]; 
      break;
    }
  }
  logAction(username, 'เข้าสู่ระบบ', loginSuccess ? 'สำเร็จ' : 'ล้มเหลว', name);
  return { success: loginSuccess, name: name };
}

function logAction(username, action, result, documentNumberOrProjectName = '') {
  try {
    const ss = SpreadsheetApp.openById(scriptProp.getProperty('key'));
    const logSheet = ss.getSheetByName('Logfile');
    const date = new Date();
    const formattedDate = Utilities.formatDate(date, 'GMT+7', 'dd/MM/yyyy');
    const formattedTime = Utilities.formatDate(date, 'GMT+7', 'HH:mm:ss');
    const actionText = documentNumberOrProjectName ? `${action} - ${documentNumberOrProjectName}` : action;
    
    // ใช้วิธี appendRow เพื่อป้องกัน Race Condition ในไฟล์ Log
    // [Date, Time, Username, Action, Result]
    logSheet.appendRow([formattedDate, formattedTime, username, actionText, result]);
  } catch (e) {
    Logger.log("Error in logAction (non-critical): " + e.message);
    // ไม่ throw error ต่อ เพื่อให้การทำงานหลักของผู้ใช้ดำเนินต่อไปได้
  }
}

function getData(search, limit, page) {
  var spreadsheet = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  var sheet = spreadsheet.getSheetByName(sheetName); 
  if (!sheet) {
    Logger.log("Error: Sheet '" + sheetName + "' not found.");
    return { headers: [], data: [], total: 0 };
  }
  var data = sheet.getDataRange().getValues();
  var headers = data.shift();
  var filteredData = data.filter(row => row.some(cell => cell.toString().toLowerCase().includes(search.toLowerCase())));
  var nonEmptyRows = filteredData.filter(row => row.some(cell => cell.toString().trim() !== ""));
  nonEmptyRows.reverse();
  var startIndex = (page - 1) * limit;
  var endIndex = startIndex + limit;
  var pageData = nonEmptyRows.slice(startIndex, endIndex);
  return { headers: headers, data: pageData, total: nonEmptyRows.length };
}

function getDocumentData(documentNumber) {
  var spreadsheet = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  var sheet = spreadsheet.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  data.shift(); 
  for (var i = 0; i < data.length; i++) {
    if (data[i][1] === documentNumber) { 
      return {
        reportName:        data[i][2],  // C
        adminGroup:        data[i][3],  // D
        workGroup:         data[i][4],  // E
        responsiblePerson: data[i][5],  // F
        actionPlanProject: data[i][8],  // I
        email:             data[i][9],  // J
        activityCode:      data[i][10]  // K
      };
    }
  }
  return null;
}

// =========================================================================
// [EDITED] 1. ฟังก์ชันขอเลขทะเบียนเอกสาร
// =========================================================================
function saveData(reportName, adminGroup, workGroup, responsiblePerson, actionPlanProject, email, activityCode, loggedUser) {
  // 1. ขอ Lock จาก Script
  const lock = LockService.getScriptLock();
  
  // 2. พยายาม Lock (รอสูงสุด 30 วินาที)
  if (!lock.tryLock(30000)) { 
    throw new Error('ระบบกำลังประมวลผลคำขออื่น โปรดรอสักครู่แล้วลองใหม่อีกครั้ง (Server is busy)');
  }

  try {
    var ss = SpreadsheetApp.openById(scriptProp.getProperty('key'));
    var sheet = ss.getSheetByName(sheetName);
    
    // --- CRITICAL SECTION START ---
    // (ส่วนนี้จะมีเพียง 1 User ที่ทำงานได้ ณ เวลาใดเวลาหนึ่ง)

    // 3. ใช้ตรรกะเดิมของคุณเพื่อหาแถวว่างถัดไป (ซึ่งตอนนี้ปลอดภัยแล้ว)
    var lastRow = sheet.getRange("C:C").getValues().filter(String).length;
    var newRow = lastRow + 1;

    // 4. เขียนข้อมูลลงในแถวที่หาได้
    sheet.getRange(newRow, 3).setValue(reportName);        // C
    sheet.getRange(newRow, 4).setValue(adminGroup);        // D
    sheet.getRange(newRow, 5).setValue(workGroup);         // E
    sheet.getRange(newRow, 6).setValue(responsiblePerson); // F
    sheet.getRange(newRow, 9).setValue(actionPlanProject); // I
    sheet.getRange(newRow,10).setValue(email);             // J
    sheet.getRange(newRow,11).setValue( (activityCode || '').toString().trim().toUpperCase() ); // K
    
    // 5. บังคับให้ Sheet คำนวณสูตร (สำคัญมากสำหรับเลขเอกสาร)
    SpreadsheetApp.flush(); 
    
    // 6. อ่านค่า Document Number จากแถวที่เพิ่งสร้าง (คอลัมน์ B)
    var documentNumber = sheet.getRange(newRow, 2).getValue(); 
    
    // --- CRITICAL SECTION END ---

    // 7. บันทึก Log (ตอนนี้ปลอดภัยแล้ว และใช้ชื่อคนล็อกอิน)
    logAction(loggedUser || responsiblePerson, 'ขอเลขทะเบียนเอกสาร', 'สำเร็จ', documentNumber);
    
    return documentNumber;
    
  } catch (e) {
    Logger.log("Error in locked saveData: " + e.message);
    throw e; // โยน Error กลับไปให้ Client
  } finally {
    // 8. ปลด Lock เสมอ (สำคัญมาก!)
    lock.releaseLock();
  }
}

// =========================================================================
// [EDITED] 2. ฟังก์ชันส่งรายงานฉบับสมบูรณ์
// =========================================================================
function saveReport(documentNumber, fileId, quantitativeTarget, quantitativeResult, qualitativeTarget, qualitativeResult, expectedTarget, expectedResult, actionPlanProject, allocatedBudget, actualBudget, loggedUser) {
  var documentData = getDocumentData(documentNumber);
  if (!documentData) throw new Error('Invalid document number');
  
  var fileUrl;
  try {
    fileUrl = DriveApp.getFileById(fileId).getUrl(); 
  } catch (e) {
    Logger.log(e);
    throw new Error("ไม่พบไฟล์ที่อัปโหลด (ID: " + fileId + ")");
  }

  var ss = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  var reportSubmitSheet = ss.getSheetByName(reportSubmitSheetName);
  
  // --- ส่วนที่ 1: เขียนลง reportSubmitSheet (ใช้ appendRow เพราะสันนิษฐานว่าชีตนี้ไม่มีสูตรจองแถว) ---
  // สร้าง Array เปล่าขนาด 19 ช่อง (คอลัมน์ A-S)
  var newRowData = new Array(19).fill('');
  
  // เติมข้อมูลลงใน Array ตาม Index ที่ถูกต้อง
  newRowData[1] = documentNumber;          // B
  newRowData[2] = documentData.reportName; // C
  newRowData[3] = documentData.adminGroup; // D
  newRowData[4] = documentData.workGroup;  // E
  newRowData[5] = documentData.responsiblePerson; // F
  newRowData[6] = fileUrl;                 // G
  newRowData[7] = quantitativeTarget;      // H
  newRowData[8] = qualitativeTarget;       // I
  newRowData[9] = quantitativeResult;      // J
  newRowData[10] = qualitativeResult;      // K
  newRowData[11] = expectedTarget;         // L
  newRowData[12] = parseFloat(expectedResult); // M
  // newRowData[13] = ''; // N (Reason - ปล่อยว่าง)
  newRowData[14] = actionPlanProject;      // O
  newRowData[15] = documentData.email;     // P
  newRowData[16] = allocatedBudget;        // Q
  newRowData[17] = actualBudget;           // R
  newRowData[18] = (documentData.activityCode || '').toString().trim().toUpperCase(); // S
  
  // ใช้ appendRow ซึ่งเป็น Atomic
  reportSubmitSheet.appendRow(newRowData); 

  // --- ส่วนที่ 2: อัปเดต reportNoSheet (ต้องใช้ Lock เพราะเป็นชีตเดียวกับ saveData) ---
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    // แม้จะบันทึก Log สำเร็จ แต่ถ้าอัปเดตชีตหลักไม่สำเร็จ ควรถือเป็น Error
    throw new Error('Server is busy, could not update master list. Please try again.');
  }
  
  try {
    // --- CRITICAL SECTION START ---
    var reportNoSheet = ss.getSheetByName(sheetName);
    var data = reportNoSheet.getDataRange().getValues();
    
    // ค้นหาแถวที่ตรงกันเพื่ออัปเดต
    for (var i = 0; i < data.length; i++) {
      if (data[i][1] === documentNumber) { // คอลัมน์ B
        reportNoSheet.getRange(i + 1, 8).setValue(fileUrl); // อัปเดตคอลัมน์ H
        break;
      }
    }
    // --- CRITICAL SECTION END ---
  } catch (e) {
    Logger.log("Error in locked saveReport (part 2): " + e.message);
    throw e; // โยน Error กลับไป
  } finally {
    lock.releaseLock();
  }
  
  // บันทึก Log เมื่อทุกอย่างสำเร็จ (ใช้ชื่อคนล็อกอิน)
  logAction(loggedUser || documentData.responsiblePerson, 'ส่งรายงาน', 'สำเร็จ', documentNumber);
}

// =========================================================================
// [EDITED] 3. ฟังก์ชันบันทึกกิจกรรมที่ไม่ได้ดำเนินการ (เพิ่มการคัดลอกรหัสกิจกรรมไปคอลัมน์ S)
// =========================================================================
function saveNonCompletedProject(projectName, adminGroup, workGroup, responsiblePerson, reason, fileId, actionPlanProject, documentNumber, loggedUser) {
  var fileUrl;
  try {
    fileUrl = DriveApp.getFileById(fileId).getUrl();
  } catch (e) {
    Logger.log(e);
    throw new Error("ไม่พบไฟล์ที่อัปโหลด (ID: " + fileId + ")");
  }

  // [NEW] ดึงรหัสกิจกรรมจากฐานข้อมูลเดิม โดยใช้หมายเลขเอกสาร
  var activityCode = '';
  if (documentNumber && documentNumber !== 'N/A') {
    var documentData = getDocumentData(documentNumber);
    if (documentData) {
      activityCode = documentData.activityCode || '';
    }
  }

  var spreadsheet = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  var reportSubmitSheet = spreadsheet.getSheetByName(reportSubmitSheetName);
  
  // สร้าง Array สำหรับทั้งแถว (สมมติว่าชีตมี 19 คอลัมน์ A-S เหมือน saveReport)
  var rowData = new Array(19).fill(''); // สร้าง Array 19 ช่อง เติมค่าว่างไว้ก่อน

  // เติมข้อมูลลงใน Index ที่ถูกต้อง (Index 0 คือคอลัมน์ A)
  // rowData[0] = ''; // A (ปล่อยว่าง)
  rowData[1] = documentNumber || 'N/A'; // B (บันทึกหมายเลขเอกสารที่แนบมาด้วย)
  rowData[2] = projectName;       // C
  rowData[3] = adminGroup;        // D
  rowData[4] = workGroup;         // E
  rowData[5] = responsiblePerson; // F
  rowData[6] = fileUrl;           // G
  // ข้าม H-M
  rowData[13] = reason;           // N
  rowData[14] = actionPlanProject;// O
  // ข้าม P-R
  
  // [NEW] บันทึกรหัสกิจกรรมลงคอลัมน์ S (Index 18) ให้เหมือนฟังก์ชัน saveReport
  rowData[18] = activityCode.toString().trim().toUpperCase(); 

  // ใช้ appendRow ซึ่งเป็น Atomic Operation
  reportSubmitSheet.appendRow(rowData);
  
  if (documentNumber && documentNumber !== 'N/A') {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error('ระบบกำลังประมวลผลคำขออื่น ไม่สามารถอัปเดตลิงก์ในฐานข้อมูลหลักได้ โปรดลองอีกครั้ง');
    }
    
    try {
      var reportNoSheet = spreadsheet.getSheetByName(sheetName); 
      var data = reportNoSheet.getDataRange().getValues();
      
      for (var i = 0; i < data.length; i++) {
        if (data[i][1] === documentNumber) { 
          reportNoSheet.getRange(i + 1, 7).setValue(fileUrl); 
          break;
        }
      }
    } catch (e) {
      Logger.log("Error in locked saveNonCompletedProject (ReportNo Update): " + e.message);
      throw e; 
    } finally {
      lock.releaseLock(); 
    }
  }
  
  // บันทึก Log เมื่อทุกอย่างสำเร็จ (ใช้ชื่อคนล็อกอิน)
  logAction(loggedUser || responsiblePerson, 'ส่งบันทึกข้อความโครงการ/กิจกรรม ที่ไม่ได้ดำเนินการ', 'สำเร็จ', projectName);
}

function getDropdownData() {
  var spreadsheet = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  var sheet = spreadsheet.getSheetByName('Dropdown');
  var data = sheet.getDataRange().getValues();
  var adminGroups = data.map(row => row[0]).filter(value => value);
  var workGroups = {
    'กลุ่มบริหารวิชาการ': data.map(row => row[1]).filter(value => value),
    'กลุ่มบริหารงบประมาณ': data.map(row => row[2]).filter(value => value),
    'กลุ่มบริหารงานบุคคล': data.map(row => row[3]).filter(value => value),
    'กลุ่มบริหารทั่วไป': data.map(row => row[4]).filter(value => value)
  };
  var actionPlanProjects = data.map(row => row[5]).filter(value => value);
  return { adminGroups: adminGroups, workGroups: workGroups, actionPlanProjects: actionPlanProjects };
}

function getReportCounts() {
  var spreadsheet = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  var sheet = spreadsheet.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  data.shift(); 
  var totalDocuments = 0;
  var academicGroupCount = 0;
  var generalGroupCount = 0;
  var personnelGroupCount = 0;
  var budgetGroupCount = 0;
  data.forEach(row => {
    if (row[1]) { 
      totalDocuments++;
      switch (row[3]) { 
        case 'กลุ่มบริหารวิชาการ':   academicGroupCount++; break;
        case 'กลุ่มบริหารทั่วไป':    generalGroupCount++; break;
        case 'กลุ่มบริหารงานบุคคล':  personnelGroupCount++; break;
        case 'กลุ่มบริหารงบประมาณ': budgetGroupCount++; break;
      }
    }
  });
  return { totalDocuments, academicGroupCount, generalGroupCount, personnelGroupCount, budgetGroupCount };
}

function _normalizeHeader_(h) { return h.toString().trim().toLowerCase().replace(/\s+/g, '').replace(/[()]/g, ''); }

function _findIndex_(headers, candidates) {
  const map = {};
  headers.forEach((h, i) => map[_normalizeHeader_(h)] = i);
  for (var c of candidates) {
    var key = _normalizeHeader_(c);
    if (map.hasOwnProperty(key)) return map[key];
  }
  return -1;
}

function getActivityInfo(activityCode) {
  if (!activityCode) return null;
  var code = activityCode.toString().trim().toUpperCase();
  var ss = SpreadsheetApp.openById(scriptProp.getProperty('key'));
  var sheet = ss.getSheetByName('LinkBAP');
  if (!sheet) return null;
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return null;
  var headers = values[0];
  var idxCode  = _findIndex_(headers, ['รหัสกิจกรรม','activity code','activitycode','code']);
  var idxAdmin = _findIndex_(headers, ['กลุ่มบริหาร','admin group','admingroup']);
  var idxWork  = _findIndex_(headers, ['กลุ่มงาน','work group','workgroup']);
  var idxProj  = _findIndex_(headers, ['โครงการตามแผนปฏิบัติการ','โครงการตามแผน','action plan project','actionplanproject']);
  var idxEmail = _findIndex_(headers, ['email','อีเมล','อีเมล์']);
  if (idxProj  < 0) idxProj  = 1;
  if (idxWork  < 0) idxWork  = 3;
  if (idxEmail < 0) idxEmail = 6;
  if (idxCode === -1) return null;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[idxCode]) continue;
    if (row[idxCode].toString().trim().toUpperCase() === code) {
      return {
        adminGroup:        idxAdmin >= 0 ? String(row[idxAdmin] || '').trim() : '',
        workGroup:         String(row[idxWork]  || '').trim(),
        actionPlanProject: String(row[idxProj]  || '').trim(),
        email:             String(row[idxEmail] || '').trim(),
        responsiblePerson: (function(){
          var i = _findIndex_(headers, ['ผู้รับผิดชอบ','responsible person','responsibleperson','owner']);
          return i >= 0 ? String(row[i] || '').trim() : '';
        })()
      };
    }
  }
  return null;
}

// ==========================================
// [EDITED] ฟังก์ชันแก้ไข: ถอด Hardcoded Folder ID ออก
// ==========================================
function getUploadUrl(metadata) {
  try {
    var folderId;
    var fileName;
    var settings = getGlobalSettings();

    if (metadata.documentNumber) {
      const documentData = getDocumentData(metadata.documentNumber);
      if (!documentData) throw new Error('Invalid document number');
      
      switch (documentData.adminGroup) {
        case 'กลุ่มบริหารวิชาการ':   folderId = settings['FOLDER_ACADEMIC']; break;
        case 'กลุ่มบริหารงบประมาณ':  folderId = settings['FOLDER_BUDGET']; break;
        case 'กลุ่มบริหารทั่วไป':    folderId = settings['FOLDER_GENERAL']; break;
        case 'กลุ่มบริหารงานบุคคล':  folderId = settings['FOLDER_PERSONNEL']; break;
        default: throw new Error('Invalid admin group');
      }
      fileName = `${metadata.documentNumber}-${(documentData.reportName || '').toString().substring(0, 50)}.pdf`;

    } 
    else if (metadata.projectName) {
      switch (metadata.adminGroup) {
        case 'กลุ่มบริหารวิชาการ':   folderId = settings['FOLDER_ACADEMIC']; break;
        case 'กลุ่มบริหารงบประมาณ':  folderId = settings['FOLDER_BUDGET']; break;
        case 'กลุ่มบริหารทั่วไป':    folderId = settings['FOLDER_GENERAL']; break;
        case 'กลุ่มบริหารงานบุคคล':  folderId = settings['FOLDER_PERSONNEL']; break;
        default: throw new Error('Invalid admin group');
      }
      var truncatedProjectName = metadata.projectName.length > 50 ? metadata.projectName.substring(0, 47) + "..." : metadata.projectName;
      fileName = `ไม่ได้ดำเนินการ-${truncatedProjectName}.pdf`;

    } else {
      throw new Error("Invalid metadata for upload");
    }

    if (!folderId) {
      throw new Error("ไม่พบ Folder ID ใน Settings Sheet สำหรับกลุ่มบริหารนี้");
    }

    const accessToken = ScriptApp.getOAuthToken();
    const driveMetadata = {
      name: fileName,
      mimeType: metadata.mimeType || 'application/pdf',
      parents: [folderId]
    };

    const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
    const options = {
      method: "POST",
      headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
      payload: JSON.stringify(driveMetadata),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const uploadUrl = response.getHeaders()["Location"]; 

    if (!uploadUrl) {
      Logger.log("Error getting upload URL: " + response.getContentText());
      throw new Error("ไม่สามารถเริ่มต้นการอัปโหลดได้ (Server Error)");
    }
    
    return uploadUrl; 

  } catch (e) {
    Logger.log(e);
    throw new Error("Server error: " + e.message);
  }
}

function uploadChunk(uploadUrl, chunkBase64, startByte, chunkEndByte, totalSize) {
  try {
    const accessToken = ScriptApp.getOAuthToken();
    const chunkBlob = Utilities.base64Decode(chunkBase64);

    const options = {
      method: "PUT",
      payload: chunkBlob,
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Range": `bytes ${startByte}-${chunkEndByte}/${totalSize}`
      },
      muteHttpExceptions: true 
    };

    const response = UrlFetchApp.fetch(uploadUrl, options);
    
    return {
      statusCode: response.getResponseCode(),
      headers: response.getHeaders(),
      content: response.getContentText() 
    };

  } catch (e) {
    Logger.log(e);
    throw new Error("Chunk upload failed: " + e.message);
  }
}

// ==========================================
// [NEW] เพิ่มฟังก์ชันใหม่: สำหรับดึงค่าจาก Settings Sheet
// ==========================================
function getGlobalSettings() {
  var scriptProp = PropertiesService.getScriptProperties();
  var key = scriptProp.getProperty('key');
  var ss = key ? SpreadsheetApp.openById(key) : SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getSheetByName("Settings Sheet");
  if (!sheet) {
    throw new Error("System Error: ไม่พบแผ่นงานชื่อ 'Settings Sheet'");
  }

  var data = sheet.getDataRange().getValues();
  var settings = {};
  for (var i = 1; i < data.length; i++) {
    var varName = data[i][0];
    var varValue = data[i][1];
    if (varName && varName.toString().trim() !== "") {
      settings[varName.toString().trim()] = varValue;
    }
  }
  return settings;
}

// ==========================================
// [NEW] เพิ่มฟังก์ชันใหม่: สำหรับดึง URL ของ Web App ปัจจุบันอัตโนมัติ
// ==========================================
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}