
/**
 * ImageService: ระบบจัดการรูปภาพอัตโนมัติ (Enhanced)
 */

function getOrCreateImageFolder() {
  const FOLDER_NAME = "School_CheckIn_Images";
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  let activeFolder = null;
  
  while (folders.hasNext()) {
    const folder = folders.next();
    if (!folder.isTrashed()) {
      activeFolder = folder;
      break; 
    }
  }
  
  if (activeFolder) {
    activeFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return activeFolder;
  } else {
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
    
    // ทำความสะอาด Base64: ตัดส่วนหัว data:image/... และช่องว่างที่อาจติดมา
    let cleanBase64 = base64String;
    if (base64String.indexOf(",") > -1) {
      cleanBase64 = base64String.split(",")[1];
    }
    cleanBase64 = cleanBase64.replace(/\s/g, ""); // ลบช่องว่างหรือ newline
    
    // แปลงเป็น Byte
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    
    // สร้างไฟล์
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // คืนค่า URL สำหรับดูรูปภาพ
    return file.getUrl();
    
  } catch (e) {
    return "Error: " + e.toString();
  }
}
