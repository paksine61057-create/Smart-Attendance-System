
/**
 * Smart Attendance System – Production Code.gs
 * Spreadsheet: โรงเรียนประจักษ์ศิลปาคม
 * ID: 1r5-VJYsR_kvtSW_jSYG3sv1GQqXEVbCMjFj9ov6SiWI
 */

const SPREADSHEET_ID = "1r5-VJYsR_kvtSW_jSYG3sv1GQqXEVbCMjFj9ov6SiWI";
const SHEET_NAME = "Attendance";

/* =========================
   Sheet Utilities
========================= */
function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Timestamp",
      "Date",
      "Time",
      "Staff ID",
      "Name",
      "Role",
      "Type",
      "Status",
      "Reason",
      "Location",
      "Distance (m)",
      "AI Verification",
      "Image"
    ]);
  }
  return sheet;
}

/* =========================
   Response Helper (GAS Standard)
========================= */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================
   GET : Read Records
========================= */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : "getRecords";
    const sheet = getSheet();

    if (action === "getRecords") {
      const values = sheet.getDataRange().getValues();
      if (values.length <= 1) return jsonResponse([]);

      const headers = values[0];
      const result = [];

      for (let i = values.length - 1; i >= 1; i--) {
        const row = values[i];
        let obj = {};
        headers.forEach((h, j) => {
          let val = row[j];
          if (h === "Timestamp" && val instanceof Date) {
            val = val.getTime();
          }
          obj[h] = val;
        });
        result.push(obj);
      }
      return jsonResponse(result);
    }

    return jsonResponse({ status: "unknown action" });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

/* =========================
   POST : Insert Record
========================= */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!data || data.action !== "insertRecord") {
      return jsonResponse({ status: "invalid action" });
    }

    let imageUrl = data.Image || "";
    
    // 1. ตรวจสอบและบันทึกรูปภาพลง Google Drive ผ่าน ImageService.gs
    if (imageUrl && (imageUrl.startsWith("data:image") || imageUrl.length > 500)) {
      const staffName = data.Name || "Staff";
      const timestamp = data.Timestamp || Date.now();
      const fileName = "CheckIn_" + staffName + "_" + timestamp + ".jpg";
      
      // เรียกใช้ฟังก์ชันจากไฟล์ ImageService.gs
      const driveUrl = saveBase64ImageToDrive(imageUrl, fileName);
      
      // ถ้าบันทึกสำเร็จ (คืนค่ามาเป็น URL) ให้ใช้ URL นั้นแทน Base64
      if (driveUrl && driveUrl.startsWith("http")) {
        imageUrl = driveUrl;
      }
    }

    const sheet = getSheet();

    // 2. บันทึกข้อมูลลงใน Google Sheets โดยคอลัมน์ Image จะเป็น URL ของไฟล์ใน Drive
    sheet.appendRow([
      data.Timestamp || Date.now(),
      data.Date || "",
      data.Time || "",
      data["Staff ID"] || "",
      data.Name || "",
      data.Role || "",
      data.Type || "",
      data.Status || "",
      data.Reason || "",
      data.Location || "",
      data["Distance (m)"] || "",
      data["AI Verification"] || "",
      imageUrl 
    ]);

    return jsonResponse({ status: "success", imageUrl: imageUrl });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}
