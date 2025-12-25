
/**
 * ImageService: ระบบจัดการรูปภาพอัตโนมัติ
 */

function getOrCreateImageFolder() {
  const TARGET_FOLDER_ID = "1JRULnhyQB83UwuEe6RxSwjgsGbhMhyA2";
  try {
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } catch (e) {
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

function saveBase64ImageToDrive(base64String, fileName) {
  try {
    if (!base64String || base64String.length < 10) return "Error: No data";
    
    const folder = getOrCreateImageFolder();
    let cleanBase64 = base64String;
    if (base64String.indexOf(",") > -1) {
      cleanBase64 = base64String.split(",")[1];
    }
    cleanBase64 = cleanBase64.replace(/\s/g, ""); 
    
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
    
  } catch (e) {
    console.error("Save Image Error: " + e.toString());
    return "Error: " + e.toString();
  }
}
