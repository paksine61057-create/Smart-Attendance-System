
function getOrCreateImageFolder() {
  const TARGET_FOLDER_ID = "1JRULnhyQB83UwuEe6RxSwjgsGbhMhyA2";
  try {
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  } catch (e) {
    const folder = DriveApp.createFolder("Attendance_Photos_2026");
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  }
}

function saveBase64ImageToDrive(base64String, fileName) {
  try {
    const folder = getOrCreateImageFolder();
    let cleanBase64 = base64String.includes(",") ? base64String.split(",")[1] : base64String;
    const blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64.replace(/\s/g, "")), "image/jpeg", fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return "Error: " + e.toString();
  }
}
