
/**
 * ImageService: ระบบจัดการรูปภาพอัตโนมัติ (เจาะจงโฟลเดอร์ ID)
 */

function getOrCreateImageFolder() {
  const TARGET_FOLDER_ID = "1JRULnhyQB83UwuEe6RxSwjgsGbhMhyA2";
  try {
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    // ตั้งค่าสิทธิ์โฟลเดอร์ให้ทุกคนที่มีลิงก์ดูได้ เพื่อให้แอปดึงภาพไปแสดงได้
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } catch (e) {
    console.error("Folder ID not found, using default location: " + e.toString());
    // กรณีเข้าถึง ID ไม่ได้ ให้หาจากชื่อหรือสร้างใหม่ใน Root
    const FOLDER_NAME = "School_CheckIn_Images";
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
    
    // ทำความสะอาด Base64 เพื่อป้องกันความล้มเหลวในการ Decode
    let cleanBase64 = base64String;
    if (base64String.indexOf(",") > -1) {
      cleanBase64 = base64String.split(",")[1];
    }
    // ลบช่องว่างหรืออักขระที่ผิดปกติ
    cleanBase64 = cleanBase64.replace(/\s/g, ""); 
    
    // แปลงข้อมูลเป็น Blob
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    
    // สร้างไฟล์ในโฟลเดอร์เป้าหมาย
    const file = folder.createFile(blob);
    
    // ตั้งค่าไฟล์เป็นสาธารณะ (ดูเท่านั้น) เพื่อให้แอปดึงไปแสดงผลได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // คืนค่า URL สำหรับเข้าถึงไฟล์
    return file.getUrl();
    
  } catch (e) {
    console.error("Save to Drive Failed: " + e.toString());
    return "Error: " + e.toString();
  }
}
