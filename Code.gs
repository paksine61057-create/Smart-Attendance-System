
/**
 * ระบบจัดการฐานข้อมูลโรงเรียนประจักษ์ศิลปาคม 2026 (Fixed Data Sync)
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

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371000; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function setup() {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NAME); }
  const headers = ["Timestamp", "Date", "Time", "Staff ID", "Name", "Role", "Type", "Status", "Reason", "Location", "Distance (m)", "AI Verification", "Image"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  return "Setup Complete";
}

function doGet(e) {
  const action = e.parameter.action;
  const ss = getSS();
  const sheet = getTargetSheet(ss);
  const props = PropertiesService.getScriptProperties();
  
  if (action === "getSettings" || !action) {
    return ContentService.createTextOutput(JSON.stringify({
      officeLocation: { 
        lat: parseFloat(props.getProperty("lat") || "17.345854"), 
        lng: parseFloat(props.getProperty("lng") || "102.834789") 
      },
      maxDistanceMeters: parseInt(props.getProperty("maxDistance") || "50"),
      locationMode: props.getProperty("locationMode") || "online" 
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "getRecords") {
    if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    
    const headers = rows[0].map(h => h.toString().trim());
    const data = [];
    
    for (var i = rows.length - 1; i >= 1; i--) {
      let record = {};
      headers.forEach((header, index) => {
        let val = rows[i][index];
        // แปลง Timestamp เป็นตัวเลขเสมอ
        if (header === "Timestamp") {
           val = (val instanceof Date) ? val.getTime() : Number(val);
        }
        record[header] = val;
      });
      if (record.Timestamp) data.push(record);
    }
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const data = JSON.parse(e.postData.contents);
    const ss = getSS();
    let sheet = getTargetSheet(ss);

    if (data.action === "saveSettings") {
      props.setProperty("lat", data.lat.toString());
      props.setProperty("lng", data.lng.toString());
      props.setProperty("maxDistance", data.maxDistance.toString());
      if(data.locationMode) props.setProperty("locationMode", data.locationMode.toString());
      return ContentService.createTextOutput("Settings Saved");
    }

    if (data.action === "insertRecord" || data.imageBase64) {
      let finalImageUrl = "-";
      if (data.imageBase64 && data.imageBase64.length > 500) {
        const fileName = "ATT_" + (data["Staff ID"] || "IMG") + "_" + (data["Timestamp"] || Date.now()) + ".jpg";
        finalImageUrl = saveBase64ImageToDrive(data.imageBase64, fileName);
      }

      let currentDistance = 0;
      if (data.lat && data.lng) {
        const targetLat = parseFloat(props.getProperty("lat") || "17.345854");
        const targetLng = parseFloat(props.getProperty("lng") || "102.834789");
        currentDistance = Math.round(calculateDistance(targetLat, targetLng, data.lat, data.lng));
      }

      sheet.appendRow([
        data["Timestamp"], data["Date"], data["Time"], data["Staff ID"],
        data["Name"], data["Role"], data["Type"], data["Status"],
        data["Reason"], data["Location"] || "Web App", currentDistance,
        data["AI Verification"] || "-", finalImageUrl
      ]);
      return ContentService.createTextOutput("Success");
    }
    return ContentService.createTextOutput("Invalid Action");
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.toString());
  }
}
