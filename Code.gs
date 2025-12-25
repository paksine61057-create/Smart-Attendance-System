
/**
 * ระบบจัดการฐานข้อมูลโรงเรียนประจักษ์ศิลปาคม 2026 (ชุดเชื่อมโยงข้อมูลสมบูรณ์)
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1r5-VJYsR_kvtSW_jSYG3sv1GQqXEVbCMjFj9ov6SiWI/
 */
 
const SHEET_NAME = "Attendance"; 
const SPREADSHEET_ID = "1r5-VJYsR_kvtSW_jSYG3sv1GQqXEVbCMjFj9ov6SiWI";

/**
 * ฟังก์ชันหลักในการดึง Spreadsheet โดยระบุ ID ที่แน่นอน
 */
function getSS() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    console.error("Critical Error: ไม่สามารถเปิดไฟล์ชีตด้วย ID ได้ - " + e.toString());
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

/**
 * คำนวณระยะทางระหว่างจุดพิกัด (Haversine Formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371000; // รัศมีโลกในหน่วยเมตร
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * เตรียมหน้าชีตสำหรับเก็บข้อมูล
 */
function setup() {
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NAME); }
  const headers = ["Timestamp", "Date", "Time", "Staff ID", "Name", "Role", "Type", "Status", "Reason", "Location", "Distance (m)", "AI Verification", "Image"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  return "Setup Complete";
}

/**
 * จัดการคำขอแบบ GET (ดึงข้อมูล/ตั้งค่า)
 */
function doGet(e) {
  const action = e.parameter.action;
  const ss = getSS();
  let sheet = ss.getSheetByName(SHEET_NAME);
  const props = PropertiesService.getScriptProperties();
  
  // กรณีเรียกตั้งค่าระบบ
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
  
  // กรณีดึงรายการบันทึกทั้งหมด
  if (action === "getRecords") {
    if (!sheet) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    const data = [];
    
    for (var i = rows.length - 1; i >= 1; i--) {
      if (data.length >= 1000) break; 
      let record = {};
      headers.forEach((header, index) => {
        let key = header.toLowerCase().replace(/\s/g, "").replace(/\(m\)/g, "");
        if (header === "Staff ID") key = "staffId";
        if (header === "Distance (m)") key = "distancefrombase";
        if (header === "AI Verification") key = "aiverification";
        if (header === "Image") key = "imageUrl";
        if (header === "Timestamp") key = "timestamp";
        
        let value = rows[i][index];
        
        // แปลง Timestamp ให้เป็นตัวเลขเพื่อความถูกต้องในการส่งผ่าน JSON
        if (key === "timestamp") {
          if (value instanceof Date) {
            value = value.getTime();
          } else if (typeof value === 'string' || typeof value === 'number') {
            value = Number(value);
          }
        }
        record[key] = value;
      });
      if (record.timestamp) data.push(record);
    }
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * จัดการคำขอแบบ POST (บันทึก/ลบข้อมูล)
 */
function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const rawData = e.postData.contents;
    const data = JSON.parse(rawData);
    
    const ss = getSS();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) { setup(); sheet = ss.getSheetByName(SHEET_NAME); }

    // บันทึกการตั้งค่าระบบลงใน Script Properties
    if (data.action === "saveSettings") {
      props.setProperty("lat", data.lat.toString());
      props.setProperty("lng", data.lng.toString());
      props.setProperty("maxDistance", data.maxDistance.toString());
      if(data.locationMode) props.setProperty("locationMode", data.locationMode.toString());
      return ContentService.createTextOutput("Settings Saved");
    }
    
    // ลบรายการบันทึก
    if (data.action === "deleteRecord") {
      const rows = sheet.getDataRange().getValues();
      const targetId = data.id.toString();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (rows[i][0].toString() === targetId) { sheet.deleteRow(i + 1); break; }
      }
      return ContentService.createTextOutput("Deleted");
    }

    // บันทึกรายการลงเวลาใหม่
    if (data.action === "insertRecord" || data.imageBase64) {
      let finalImageUrl = "-";
      
      // อัปโหลดรูปภาพลง Google Drive (ใช้ฟังก์ชันจาก ImageService.gs)
      if (data.imageBase64 && data.imageBase64.length > 500) {
        const staffId = data["Staff ID"] || "Unknown";
        const ts = data["Timestamp"] || new Date().getTime();
        const fileName = "ATT_" + staffId + "_" + ts + ".jpg";
        
        const uploadUrl = saveBase64ImageToDrive(data.imageBase64, fileName);
        if (uploadUrl && uploadUrl.indexOf("http") === 0) {
          finalImageUrl = uploadUrl; 
        }
      }

      let currentDistance = 0;
      if (data.lat && data.lng) {
        const targetLat = parseFloat(props.getProperty("lat") || "17.345854");
        const targetLng = parseFloat(props.getProperty("lng") || "102.834789");
        currentDistance = Math.round(calculateDistance(targetLat, targetLng, data.lat, data.lng));
      }

      // บันทึกข้อมูลลง Google Sheets แถวใหม่
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
        finalImageUrl
      ]);

      return ContentService.createTextOutput("Success");
    }
    
    return ContentService.createTextOutput("Invalid Action");
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.toString());
  }
}
