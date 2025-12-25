
/**
 * ระบบจัดการฐานข้อมูลโรงเรียนประจักษ์ศิลปาคม 2026 (Fixed Image Flow)
 */
 
const SHEET_NAME = "Attendance"; 

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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NAME); }
  const headers = ["Timestamp", "Date", "Time", "Staff ID", "Name", "Role", "Type", "Status", "Reason", "Location", "Distance (m)", "AI Verification", "Image"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  return "Setup Complete";
}

function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
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
    const headers = rows[0];
    const data = [];
    for (var i = rows.length - 1; i >= 1; i--) {
      if (data.length >= 500) break; 
      let record = {};
      headers.forEach((header, index) => {
        let key = header.toLowerCase().replace(/\s/g, "").replace(/\(m\)/g, "");
        if (header === "Staff ID") key = "staffId";
        if (header === "Distance (m)") key = "distancefrombase";
        if (header === "AI Verification") key = "aiverification";
        if (header === "Image") key = "imageUrl";
        if (header === "Timestamp") key = "timestamp";
        record[key] = rows[i][index];
      });
      data.push(record);
    }
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const rawData = e.postData.contents;
    const data = JSON.parse(rawData);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) { setup(); sheet = ss.getSheetByName(SHEET_NAME); }

    // บันทึกการตั้งค่า
    if (data.action === "saveSettings") {
      props.setProperty("lat", data.lat.toString());
      props.setProperty("lng", data.lng.toString());
      props.setProperty("maxDistance", data.maxDistance.toString());
      if(data.locationMode) props.setProperty("locationMode", data.locationMode.toString());
      return ContentService.createTextOutput("Settings Saved");
    }
    
    // ลบข้อมูล
    if (data.action === "deleteRecord") {
      const rows = sheet.getDataRange().getValues();
      const targetId = data.id.toString();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (rows[i][0].toString() === targetId) { sheet.deleteRow(i + 1); break; }
      }
      return ContentService.createTextOutput("Deleted");
    }

    // บันทึกเวลา (insertRecord)
    if (data.action === "insertRecord" || data.imageBase64) {
      let finalImageUrl = "No Image Data";
      
      // 1. จัดการรูปภาพก่อนบันทึกลง Sheet
      if (data.imageBase64 && data.imageBase64.length > 50) {
        const staffId = data["Staff ID"] || "Unknown";
        const ts = data["Timestamp"] || new Date().getTime();
        const fileName = "ATT_" + staffId + "_" + ts + ".jpg";
        
        const uploadResult = saveBase64ImageToDrive(data.imageBase64, fileName);
        if (uploadResult && uploadResult.indexOf("http") === 0) {
          finalImageUrl = uploadResult; // เป็น URL แล้ว
        } else {
          finalImageUrl = uploadResult; // เป็นข้อความ Error
        }
      }

      // 2. คำนวณระยะทาง
      let currentDistance = 0;
      if (data.lat && data.lng) {
        const targetLat = parseFloat(props.getProperty("lat") || "17.345854");
        const targetLng = parseFloat(props.getProperty("lng") || "102.834789");
        currentDistance = Math.round(calculateDistance(targetLat, targetLng, data.lat, data.lng));
      }

      // 3. บันทึกข้อมูลลง Sheet
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
        data["Location"] || "Web App",
        currentDistance,
        data["AI Verification"] || "-",
        finalImageUrl // บันทึกเฉพาะ URL หรือ Error Message
      ]);

      return ContentService.createTextOutput("Success");
    }
    
    return ContentService.createTextOutput("Invalid Action");
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.toString());
  }
}
