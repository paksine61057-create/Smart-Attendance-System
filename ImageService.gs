
/**
 * ImageService: ระบบจัดการรูปภาพอัตโนมัติ
 */

function getOrCreateImageFolder() {
  const FOLDER_NAME = "School_CheckIn_Images";
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  
  if (folders.hasNext()) {
    const folder = folders.next();
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } else {
    const folder = DriveApp.createFolder(FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  }
}

/**
 * แปลง Base64 และบันทึกลง Drive
 */
function saveBase64ImageToDrive(base64String, fileName) {
  try {
    const folder = getOrCreateImageFolder();
    
    // ล้างหัว Base64
    let content = base64String;
    if (base64String.indexOf(",") > -1) {
      content = base64String.split(",")[1];
    }
    
    // แปลงเป็น Byte
    const decoded = Utilities.base64Decode(content);
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    
    // สร้างไฟล์
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // ส่งลิงก์กลับ
    return "https://drive.google.com/file/d/" + file.getId() + "/view?usp=sharing";
    
  } catch (e) {
    return "Upload Failed: " + e.toString();
  }
}
