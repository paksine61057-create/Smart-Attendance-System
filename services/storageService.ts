
import { CheckInRecord, AppSettings } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

// *** สำคัญ: ใส่ URL ของ Google Apps Script Web App ที่นี่ เพื่อให้เป็นค่าเริ่มต้นสำหรับทุกเครื่อง ***
// วิธีการ: Deploy Apps Script > เลือก Web App > Who has access: Anyone > Copy URL
// 
// ⚠️ หากพบ Error "DriveApp Permission" หรือรูปไม่ขึ้น:
// 1. ไปที่ Google Apps Script
// 2. สร้างฟังก์ชันใหม่: function setupDrivePermission() { DriveApp.getRootFolder(); }
// 3. กด Run ฟังก์ชันนี้เพื่อขอสิทธิ์
// 4. Deploy ใหม่อีกครั้ง (New Version)
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwtuFU-Rrc3mIGM3Oi7ECQYr_HJG-HAzxDf7Qgwt2xcku58icMVpW9Ro4Iw4avMMOIY/exec'; 

// พิกัดเริ่มต้น: โรงเรียนประจักษ์ศิลปาคม (Hardcoded)
const HARDCODED_OFFICE_LOCATION = {
    lat: 17.345854, 
    lng: 102.834789
};

export const saveRecord = (record: CheckInRecord) => {
  const records = getRecords();
  records.push(record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  
  // Attempt to sync to Google Sheets if URL is present
  const settings = getSettings();
  const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
  
  if (targetUrl) {
    sendToGoogleSheets(record, targetUrl);
  }
};

export const getRecords = (): CheckInRecord[] => {
  const data = localStorage.getItem(RECORDS_KEY);
  return data ? JSON.parse(data) : [];
};

export const clearRecords = () => {
  localStorage.removeItem(RECORDS_KEY);
}

export const saveSettings = async (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  
  // Sync Global Settings to Cloud if URL is available
  const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
  if (targetUrl && settings.officeLocation) {
     try {
         await fetch(targetUrl, {
             method: 'POST',
             mode: 'no-cors',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 action: 'saveSettings',
                 lat: settings.officeLocation.lat,
                 lng: settings.officeLocation.lng,
                 maxDistance: settings.maxDistanceMeters
             })
         });
         console.log("Global settings synced to cloud");
     } catch (e) {
         console.error("Failed to sync settings to cloud", e);
     }
  }
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  let localSettings = data ? JSON.parse(data) : {
    officeLocation: null,
    maxDistanceMeters: 10,
    googleSheetUrl: ''
  };

  // If local doesn't have URL but code has default, use default
  if (!localSettings.googleSheetUrl && DEFAULT_GOOGLE_SHEET_URL) {
      localSettings.googleSheetUrl = DEFAULT_GOOGLE_SHEET_URL;
  }
  
  return localSettings;
};

// Function called when App starts to get the "Official" location from Admin
export const syncSettingsFromCloud = async (): Promise<boolean> => {
    const currentSettings = getSettings();
    const targetUrl = currentSettings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;

    if (!targetUrl) return false;

    try {
        // Add timestamp to prevent caching (Cache Busting)
        const cacheBuster = new Date().getTime();
        const response = await fetch(`${targetUrl}?t=${cacheBuster}`);
        const cloudConfig = await response.json();

        if (cloudConfig && cloudConfig.officeLocation) {
            // Cloud has data, use it
            const newSettings: AppSettings = {
                ...currentSettings,
                officeLocation: cloudConfig.officeLocation,
                maxDistanceMeters: cloudConfig.maxDistanceMeters || 10,
                googleSheetUrl: targetUrl // Ensure URL is saved
            };
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
            console.log("Settings updated from cloud:", newSettings);
            return true;
        } else {
             // Cloud is empty/null! Use Hardcoded Seed
             console.log("Cloud has no settings. Seeding default location (Prajak Silpakom School)...");
             const seedSettings: AppSettings = {
                 ...currentSettings,
                 officeLocation: HARDCODED_OFFICE_LOCATION,
                 maxDistanceMeters: 20, // Default distance allowance
                 googleSheetUrl: targetUrl
             };
             
             // 1. Save locally
             localStorage.setItem(SETTINGS_KEY, JSON.stringify(seedSettings));
             
             // 2. Upload to Cloud so it becomes the database record
             await saveSettings(seedSettings);
             return true;
        }
    } catch (e) {
        console.error("Could not fetch global settings", e);
        
        // Error fetching? Fallback to hardcoded locally if no location set
        if (!currentSettings.officeLocation) {
             const fallbackSettings: AppSettings = {
                ...currentSettings,
                officeLocation: HARDCODED_OFFICE_LOCATION,
                maxDistanceMeters: 20,
                googleSheetUrl: targetUrl
            };
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(fallbackSettings));
            return true;
        }
    }
    return false;
}

// Function to fetch all records from Google Sheets (Cloud)
export const fetchGlobalRecords = async (): Promise<CheckInRecord[]> => {
    const settings = getSettings();
    const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;

    if (!targetUrl) return [];

    try {
        // Calling doGet with ?action=getRecords
        const cacheBuster = new Date().getTime();
        const response = await fetch(`${targetUrl}?action=getRecords&t=${cacheBuster}`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
            console.log(`Fetched ${data.length} records from cloud.`);
            return data as CheckInRecord[];
        }
        return [];
    } catch (e) {
        console.error("Failed to fetch global records", e);
        return [];
    }
};

export const exportToCSV = (records?: CheckInRecord[]): string => {
  const dataToExport = records || getRecords();
  const header = ['ID,Staff ID,Name,Role,Type,Reason,Timestamp,Date,Time,Status,Latitude,Longitude,Distance(m),AI Verification'];
  const rows = dataToExport.map(r => {
    const dateObj = new Date(r.timestamp);
    let typeLabel = '';
    switch(r.type) {
        case 'arrival': typeLabel = 'มาทำงาน'; break;
        case 'departure': typeLabel = 'กลับบ้าน'; break;
        case 'duty': typeLabel = 'ไปราชการ'; break;
        case 'sick_leave': typeLabel = 'ลาป่วย'; break;
        case 'personal_leave': typeLabel = 'ลากิจ'; break;
        case 'other_leave': typeLabel = 'ลาอื่นๆ'; break;
        default: typeLabel = r.type;
    }

    const reasonText = r.reason ? r.reason.replace(/"/g, '""') : '';
    
    return [
      r.id,
      r.staffId || '-',
      `"${r.name}"`,
      r.role,
      typeLabel,
      `"${reasonText}"`,
      r.timestamp,
      dateObj.toLocaleDateString(),
      dateObj.toLocaleTimeString(),
      r.status,
      r.location.lat,
      r.location.lng,
      r.distanceFromBase.toFixed(2),
      `"${r.aiVerification?.replace(/"/g, '""')}"`
    ].join(',');
  });
  return [header, ...rows].join('\n');
};

export const sendToGoogleSheets = async (record: CheckInRecord, url: string) => {
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', 
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record)
    });
    console.log("Sent to Google Sheets");
  } catch (e) {
    console.error("Failed to sync to sheets", e);
  }
};
