
/**
 * ImageService: ระบบจัดการรูปภาพอัตโนมัติ (เจาะจงโฟลเดอร์ ID)
 */

/**
 * เข้าถึงโฟลเดอร์สำหรับเก็บรูปภาพ (หรือสร้างใหม่ถ้าไม่มี)
 */
function getOrCreateImageFolder() {
  const TARGET_FOLDER_ID = "1JRULnhyQB83UwuEe6RxSwjgsGbhMhyA2";
  try {
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    // ตั้งค่าสิทธิ์โฟลเดอร์ให้สาธารณะ "ทุกคนที่มีลิงก์ดูได้" เพื่อให้แอปดึงไปแสดงผลได้
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } catch (e) {
    console.error("Folder ID not found, creating a new fallback folder.");
    const FOLDER_NAME = "School_CheckIn_Images_2026";
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (folders.hasNext()) {
      const folder = folders.next();
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return folder;
    }
    const newFolder = DriveApp.createFolder(FOLDER_NAME);
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return newFolder;
  }
}

/**
 * บันทึกรูปภาพจากรหัส Base64 ลงใน Drive และคืนค่า URL
 */
function saveBase64ImageToDrive(base64String, fileName) {
  try {
    if (!base64String) return "Error: No data";
    
    const folder = getOrCreateImageFolder();
    
    // ทำความสะอาดรหัสรูปภาพ (ตัดส่วนหัว Header ออกถ้ามี)
    let cleanBase64 = base64String;
    if (base64String.indexOf(",") > -1) {
      cleanBase64 = base64String.split(",")[1];
    }
    cleanBase64 = cleanBase64.replace(/\s/g, ""); 
    
    // แปลง Base64 เป็น Blob และบันทึกไฟล์
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    
    const file = folder.createFile(blob);
    // ตั้งค่าไฟล์ให้เป็นสาธารณะ (ดูผ่านลิงก์ได้)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // คืนค่า URL ของไฟล์สำหรับการบันทึกลงชีต
    return file.getUrl();
    
  } catch (e) {
    console.error("Save Image Error: " + e.toString());
    return "Error: " + e.toString();
  }
}
