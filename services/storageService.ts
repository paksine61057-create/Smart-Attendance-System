
import { CheckInRecord, AppSettings, AttendanceType } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

// ลิ้งค์เซิร์ฟเวอร์หลัก
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzxtqmNg2Xx9EJNQGYNJO9xb-I5XkUiLR3ZIq_q3RCTdDBDAx_aQL9be_A_mynuSWwj/exec'; 

export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    const dateObj = new Date(record.timestamp);
    
    // ตรวจสอบและทำความสะอาด Base64 (ตัด prefix data:image/jpeg;base64, ออกเพื่อให้เหลือแค่เนื้อไฟล์)
    const rawImage = record.imageUrl || "";
    const cleanImageBase64 = rawImage.includes(',') ? rawImage.split(',')[1] : rawImage;

    const payload = {
      "action": "insertRecord",
      "Timestamp": record.timestamp,
      "Date": dateObj.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      "Time": dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      "Staff ID": record.staffId || '-',
      "Name": record.name,
      "Role": record.role,
      "Type": record.type === 'arrival' ? 'มาทำงาน' : 
              record.type === 'departure' ? 'กลับบ้าน' : 
              record.type === 'duty' ? 'ไปราชการ' :
              record.type === 'sick_leave' ? 'ลาป่วย' :
              record.type === 'personal_leave' ? 'ลากิจ' :
              record.type === 'authorized_late' ? 'อนุญาตสาย' : 'อื่นๆ',
      "Status": record.status,
      "Reason": record.reason || '-',
      "Location": "บันทึกผ่านระบบ AI Web App",
      "lat": record.location.lat,
      "lng": record.location.lng,
      "Distance (m)": record.distanceFromBase || 0,
      "AI Verification": record.aiVerification || '-',
      "imageBase64": cleanImageBase64 // ส่ง Base64 ที่คลีนแล้ว
    };

    // ส่งข้อมูลแบบ POST โดยใช้ text/plain เพื่อเลี่ยงปัญหา CORS ของ Google Apps Script
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    
    return true; 
  } catch (e) {
    console.error("Sync to sheets failed", e);
    return false;
  }
};

export const saveRecord = async (record: CheckInRecord) => {
  const records = getRecords();
  record.syncedToSheets = false; 
  records.push(record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  
  const settings = getSettings();
  const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
  
  if (targetUrl) {
    const success = await sendToGoogleSheets(record, targetUrl);
    if (success) {
        const updated = getRecords();
        const idx = updated.findIndex(r => r.id === record.id);
        if (idx !== -1) {
            updated[idx].syncedToSheets = true;
            localStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
        }
    }
  }
};

export const clearRecords = () => {
  localStorage.removeItem(RECORDS_KEY);
};

export const getRecords = (): CheckInRecord[] => {
  const data = localStorage.getItem(RECORDS_KEY);
  if (!data) return [];
  try { return JSON.parse(data); } catch (e) { return []; }
};

export const saveSettings = async (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  
  if (settings.googleSheetUrl) {
    try {
      await fetch(settings.googleSheetUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          action: 'saveSettings',
          lat: settings.officeLocation.lat,
          lng: settings.officeLocation.lng,
          maxDistance: settings.maxDistanceMeters,
          locationMode: settings.locationMode,
          googleSheetUrl: settings.googleSheetUrl
        })
      });
    } catch (e) {
      console.error("Failed to push settings to cloud", e);
    }
  }
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  const defaultSettings: AppSettings = {
    googleSheetUrl: DEFAULT_GOOGLE_SHEET_URL,
    locationMode: 'online',
    officeLocation: { lat: 17.345854, lng: 102.834789 },
    maxDistanceMeters: 50
  };
  
  if (!data) return defaultSettings;
  
  try { 
    const s = JSON.parse(data);
    return { ...defaultSettings, ...s };
  } catch (e) { 
    return defaultSettings; 
  }
};

export const syncSettingsFromCloud = async (): Promise<boolean> => {
    const currentLocalSettings = getSettings();
    const storedUrl = currentLocalSettings.googleSheetUrl;

    const applyCloudSettings = (cloudSettings: any) => {
        if (cloudSettings && cloudSettings.officeLocation) {
            const current = getSettings();
            const newSettings = {
                ...current,
                officeLocation: cloudSettings.officeLocation,
                maxDistanceMeters: cloudSettings.maxDistanceMeters || current.maxDistanceMeters,
                locationMode: cloudSettings.locationMode || current.locationMode,
                googleSheetUrl: cloudSettings.googleSheetUrl || current.googleSheetUrl 
            };
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
            return true;
        }
        return false;
    };

    if (storedUrl && storedUrl !== DEFAULT_GOOGLE_SHEET_URL) {
        try {
            const forceResp = await fetch(`${DEFAULT_GOOGLE_SHEET_URL}?action=getSettings&t=${Date.now()}`);
            if (forceResp.ok) {
                const cloudSettings = await forceResp.json();
                if (applyCloudSettings(cloudSettings)) {
                    return true;
                }
            }
        } catch (e) {}
    }

    const targetUrl = storedUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(`${targetUrl}?action=getSettings&t=${Date.now()}`);
        if (response.ok) {
           const cloudSettings = await response.json();
           applyCloudSettings(cloudSettings);
        }
        return true;
    } catch (e) { 
      return false; 
    }
}

export const syncUnsyncedRecords = async () => {
    const records = getRecords();
    const unsynced = records.filter(r => !r.syncedToSheets);
    if (unsynced.length === 0) return;
    const settings = getSettings();
    const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    for (const record of unsynced) {
        if (await sendToGoogleSheets(record, targetUrl)) {
          record.syncedToSheets = true;
        }
    }
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
};

export const deleteRecord = async (record: CheckInRecord) => {
  const records = getRecords();
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records.filter(r => r.id !== record.id)));
  const settings = getSettings();
  const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
  if (targetUrl) {
    try {
      await fetch(targetUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ action: 'deleteRecord', id: record.timestamp })
      });
    } catch (e) { console.error("Delete on cloud failed", e); }
  }
  return true;
};

const parseThaiDateTimeToTimestamp = (dateStr: string, timeStr: string): number => {
    try {
        if (!dateStr || !timeStr) return 0;
        const [d, m, yBE] = dateStr.split('/').map(Number);
        const timeClean = timeStr.replace('.', ':');
        const [h, min, s] = timeClean.split(':').map(Number);
        if (isNaN(d) || isNaN(m) || isNaN(yBE)) return 0;
        const yCE = yBE - 543;
        return new Date(yCE, m - 1, d, h || 0, min || 0, s || 0).getTime();
    } catch (e) {
        return 0;
    }
};

/**
 * ฟังก์ชันแปลงลิงก์ Google Drive ให้เป็น Direct Image URL
 */
const formatDriveImageUrl = (url: string): string => {
  if (!url || typeof url !== 'string' || url === '-' || url.startsWith('Error')) return '';
  
  // ตรวจสอบว่ามี ID ของ Google Drive หรือไม่
  let fileId = '';
  const dMatch = url.match(/\/d\/([^/&#?]+)/);
  if (dMatch) {
    fileId = dMatch[1];
  } else {
    const idMatch = url.match(/[?&]id=([^&#?]+)/);
    if (idMatch) fileId = idMatch[1];
  }

  if (fileId) {
    // ใช้ Google Thumbnail CDN ซึ่งรองรับการแสดงผลบนเว็บแอปได้เสถียรที่สุด
    return `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
  }
  
  return url;
};

export const fetchGlobalRecords = async (): Promise<CheckInRecord[]> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(`${targetUrl}?action=getRecords&t=${Date.now()}`);
        if (!response.ok) throw new Error("Server responded with error");
        const data = await response.json();
        if (Array.isArray(data)) {
            return data.map((r: any) => {
                const typeStr = String(r.type || r.Type || '');
                let type: AttendanceType = 'arrival';
                if (typeStr.includes('กลับ')) type = 'departure';
                else if (typeStr.includes('ราชการ')) type = 'duty';
                else if (typeStr.includes('ป่วย')) type = 'sick_leave';
                else if (typeStr.includes('กิจ')) type = 'personal_leave';
                else if (typeStr.includes('อนุญาต')) type = 'authorized_late';

                let ts = Number(r.timestamp || r.Timestamp);
                if (isNaN(ts) || ts === 0) {
                    ts = parseThaiDateTimeToTimestamp(r.date || r.Date || '', r.time || r.Time || '');
                }

                // ตรวจสอบชื่อ Key ของรูปภาพให้ครอบคลุม (imageUrl จาก Code.gs)
                let rawImg = r.imageUrl || r.imageurl || r.image || r.Image || "";
                
                // ถ้าเป็นลิงก์ (เริ่มต้นด้วย http) ให้ทำการแปลงเป็นรูปภาพตรง
                if (typeof rawImg === 'string' && rawImg.startsWith('http')) {
                    rawImg = formatDriveImageUrl(rawImg);
                }

                return {
                    id: String(ts || Date.now()), 
                    staffId: String(r.staffId || r["Staff ID"] || ""),
                    name: String(r.name || r.Name || ""),
                    role: String(r.role || r.Role || ""),
                    timestamp: ts,
                    type: type,
                    status: (r.status || r.Status || 'Normal') as any,
                    reason: String(r.reason || r.Reason || ""),
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: Number(r.distancefrombase || r["Distance (m)"]) || 0,
                    aiVerification: String(r.aiverification || r["AI Verification"] || ""),
                    imageUrl: rawImg,
                    syncedToSheets: true
                };
            }).filter(rec => rec.timestamp > 0);
        }
    } catch (e) { console.error("Fetch Global Records Error:", e); }
    return [];
};
