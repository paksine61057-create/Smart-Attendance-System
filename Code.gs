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
   Response Helper (CORS)
========================= */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
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

    const sheet = getSheet();

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
      data.Image || ""
    ]);

    return jsonResponse({ status: "success" });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

/* =========================
   OPTIONS : CORS Preflight
========================= */
function doOptions() {
  return ContentService.createTextOutput("")
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}