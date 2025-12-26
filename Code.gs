
/**
 * ระบบจัดการฐานข้อมูลโรงเรียนประจักษ์ศิลปาคม 2026
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
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Timestamp", "Date", "Time", "Staff ID", "Name", "Role", "Type", "Status", "Reason", "Location", "Distance (m)", "AI Verification", "Image"
    ]);
  }
  return sheet;
}

function doGet(e) {
  const action = e.parameter.action;
  const ss = getSS();
  const sheet = getTargetSheet(ss);
  
  if (action === "getRecords" || !action) {
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    
    const headers = rows[0];
    const data = [];
    
    // วนจากล่างขึ้นบนเพื่อให้ข้อมูลใหม่ล่าสุดอยู่บน
    for (var i = rows.length - 1; i >= 1; i--) {
      let record = {};
      headers.forEach((header, index) => {
        let val = rows[i][index];
        if (header === "Timestamp") {
          val = (val instanceof Date) ? val.getTime() : Number(val);
        }
        record[header] = val;
      });
      if (record["Timestamp"]) data.push(record);
    }
    
    const output = JSON.stringify(data);
    return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = getSS();
    let sheet = getTargetSheet(ss);

    if (data.action === "insertRecord") {
      let finalImageUrl = data["Image"] || "-";
      
      // ถ้ามีการส่งรูป Base64 มา ให้บันทึกลง Drive
      if (data.imageBase64 && data.imageBase64.length > 100) {
        const fileName = "ATT_" + (data["Staff ID"] || "STAFF") + "_" + (data["Timestamp"] || Date.now()) + ".jpg";
        finalImageUrl = saveBase64ImageToDrive(data.imageBase64, fileName);
      }

      sheet.appendRow([
        data["Timestamp"],
        data["Date"],
        data["Time"],
        data["Staff ID"],
        data["Name"],
        data["Role"],
        data["Type"],
        data["Status"],
        data["Reason"],
        data["Location"],
        data["Distance (m)"],
        data["AI Verification"],
        finalImageUrl
      ]);
      
      return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput("Unknown Action").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}
