
/**
 * ImageService: ระบบจัดการรูปภาพอัตโนมัติ (เจาะจงโฟลเดอร์ ID)
 */

function getOrCreateImageFolder() {
  const TARGET_FOLDER_ID = "1JRULnhyQB83UwuEe6RxSwjgsGbhMhyA2";
  try {
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    // ตรวจสอบและตั้งค่าสิทธิ์ให้ทุกคนที่มีลิงก์สามารถดูได้ (เพื่อให้แอปดึงรูปไปแสดงได้)
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } catch (e) {
    // กรณีหา ID ไม่เจอหรือไม่มีสิทธิ์ ให้สร้างโฟลเดอร์ใหม่ชื่อเดิมและแจ้งเตือน
    console.error("Folder ID not found, creating new one: " + e.toString());
    const FOLDER_NAME = "School_CheckIn_Images_Backup";
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    }
    const newFolder = DriveApp.createFolder(FOLDER_NAME);
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return newFolder;
  }
}

/**
 * แปลง Base64 และบันทึกลง Drive
 */
function saveBase64ImageToDrive(base64String, fileName) {
  try {
    if (!base64String) return "Error: No Image Data";
    
    const folder = getOrCreateImageFolder();
    
    // ทำความสะอาด Base64
    let cleanBase64 = base64String;
    if (base64String.indexOf(",") > -1) {
      cleanBase64 = base64String.split(",")[1];
    }
    cleanBase64 = cleanBase64.replace(/\s/g, ""); 
    
    // แปลงเป็น Byte
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    
    // สร้างไฟล์ในโฟลเดอร์ที่กำหนด
    const file = folder.createFile(blob);
    // ตั้งค่าไฟล์รายตัวให้เป็น Public (View Only) เพื่อความแน่นอนในการดึงรูป
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // คืนค่า URL สำหรับดูรูปภาพ
    return file.getUrl();
    
  } catch (e) {
    return "Error: " + e.toString();
  }
}
