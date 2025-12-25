
/**
 * ImageService: ระบบจัดการรูปภาพอัตโนมัติ (เจาะจงโฟลเดอร์ ID)
 */

function getOrCreateImageFolder() {
  const TARGET_FOLDER_ID = "1JRULnhyQB83UwuEe6RxSwjgsGbhMhyA2";
  try {
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    // ตั้งค่าสิทธิ์โฟลเดอร์ให้สาธารณะเพื่อให้แอปดึงไปแสดงผลได้
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } catch (e) {
    console.error("Critical: Folder ID not found. Using Root.");
    const FOLDER_NAME = "School_CheckIn_Images_Fallback";
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (folders.hasNext()) return folders.next();
    const newFolder = DriveApp.createFolder(FOLDER_NAME);
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return newFolder;
  }
}

/**
 * บันทึกรูปและคืนค่า URL ที่ใช้งานได้ทันที
 */
function saveBase64ImageToDrive(base64String, fileName) {
  try {
    if (!base64String) return "Error: No data";
    
    const folder = getOrCreateImageFolder();
    
    // ทำความสะอาดรหัสรูปภาพ
    let cleanBase64 = base64String;
    if (base64String.indexOf(",") > -1) {
      cleanBase64 = base64String.split(",")[1];
    }
    cleanBase64 = cleanBase64.replace(/\s/g, ""); 
    
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // คืนค่า URL ของไฟล์
    return file.getUrl();
    
  } catch (e) {
    return "Error: " + e.toString();
  }
}
