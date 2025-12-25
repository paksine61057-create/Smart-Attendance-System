
/**
 * ระบบจัดการฐานข้อมูลโรงเรียนประจักษ์ศิลปาคม 2026 (ฉบับแก้ไขการซิงค์)
 * Spreadsheet ID: 1r5-VJYsR_kvtSW_jSYG3sv1GQqXEVbCMjFj9ov6SiWI
 */
 
const SHEET_NAME = "Attendance"; 
const SPREADSHEET_ID = "1r5-VJYsR_kvtSW_jSYG3sv1GQqXEVbCMjFj9ov6SiWI";

function getSS() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function getTargetSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.getSheets()[0]; 
  return sheet;
}

function doGet(e) {
  const action = e.parameter.action;
  const ss = getSS();
  const sheet = getTargetSheet(ss);
  
  if (action === "getRecords" || !action) {
    if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    
    const headers = rows[0];
    const data = [];
    
    // วนลูปจากล่างขึ้นบน (เอาข้อมูลล่าสุดขึ้นก่อน)
    for (var i = rows.length - 1; i >= 1; i--) {
      let record = {};
      headers.forEach((header, index) => {
        let val = rows[i][index];
        if (header === "Timestamp") {
           val = (val instanceof Date) ? val.getTime() : Number(val);
        }
        // ใช้ชื่อ Header เป็น Key ตรงๆ เลยเพื่อไม่ให้สับสน
        record[header] = val;
      });
      if (record["Timestamp"]) data.push(record);
    }
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = getSS();
    let sheet = getTargetSheet(ss);

    if (data.action === "insertRecord") {
      let finalImageUrl = data["Image"] || "-";
      if (data.imageBase64 && data.imageBase64.length > 500) {
        const fileName = "ATT_" + (data["Staff ID"] || "IMG") + "_" + (data["Timestamp"] || Date.now()) + ".jpg";
        finalImageUrl = saveBase64ImageToDrive(data.imageBase64, fileName);
      }

      sheet.appendRow([
        data["Timestamp"], data["Date"], data["Time"], data["Staff ID"],
        data["Name"], data["Role"], data["Type"], data["Status"],
        data["Reason"], data["Location"], data["Distance (m)"],
        data["AI Verification"], finalImageUrl
      ]);
      return ContentService.createTextOutput("Success");
    }
    return ContentService.createTextOutput("Invalid Action");
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.toString());
  }
}
