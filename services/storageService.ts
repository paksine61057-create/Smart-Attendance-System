
import { CheckInRecord, AppSettings } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

// ลิ้งค์ฐานข้อมูลที่คุณระบุ (ตรวจสอบความถูกต้องแล้ว)
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwtuFU-Rrc3mIGM3Oi7ECQYr_HJG-HAzxDf7Qgwt2xcku58icMVpW9Ro4Iw4avMMOIY/exec'; 

export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    const dateObj = new Date(record.timestamp);
    const payload = {
      "Timestamp": record.timestamp,
      "Date": dateObj.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      "Time": dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      "Staff ID": record.staffId || '-',
      "Name": record.name,
      "Role": record.role,
      "Type": record.type === 'arrival' ? 'มาทำงาน' : 
              record.type === 'departure' ? 'กลับบ้าน' : 
              record.type.replace('_', ' '),
      "Status": record.status,
      "Reason": record.reason || '-',
      "Location": `https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`,
      "Distance (m)": Math.round(record.distanceFromBase),
      "AI Verification": record.aiVerification || '-',
      "imageBase64": record.imageUrl || "" 
    };

    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (e) {
    console.error("Failed to sync to sheets", e);
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

export const syncUnsyncedRecords = async () => {
    const records = getRecords();
    const unsynced = records.filter(r => !r.syncedToSheets);
    if (unsynced.length === 0) return;

    const settings = getSettings();
    const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    if (!targetUrl) return;

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
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'deleteRecord', id: record.id })
        });
      } catch (e) { console.error("Cloud delete failed", e); }
  }
  return true;
};

export const getRecords = (): CheckInRecord[] => {
  const data = localStorage.getItem(RECORDS_KEY);
  return data ? JSON.parse(data) : [];
};

export const clearRecords = () => localStorage.removeItem(RECORDS_KEY);

export const saveSettings = async (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
  if (targetUrl && settings.officeLocation) {
     try {
         await fetch(targetUrl, {
             method: 'POST',
             mode: 'no-cors',
             headers: { 'Content-Type': 'text/plain' },
             body: JSON.stringify({
                 action: 'saveSettings',
                 lat: settings.officeLocation.lat,
                 lng: settings.officeLocation.lng,
                 maxDistance: settings.maxDistanceMeters
             })
         });
     } catch (e) { console.error("Settings sync failed", e); }
  }
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  let s = data ? JSON.parse(data) : { officeLocation: null, maxDistanceMeters: 50, googleSheetUrl: DEFAULT_GOOGLE_SHEET_URL };
  if (!s.googleSheetUrl || s.googleSheetUrl === "") s.googleSheetUrl = DEFAULT_GOOGLE_SHEET_URL;
  return s;
};

export const syncSettingsFromCloud = async (): Promise<boolean> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    if (!targetUrl) return false;
    try {
        const response = await fetch(`${targetUrl}?t=${Date.now()}`);
        const cloud = await response.json();
        if (cloud && cloud.officeLocation) {
            const updatedSettings = { 
              ...s, 
              officeLocation: cloud.officeLocation, 
              maxDistanceMeters: cloud.maxDistanceMeters || 50 
            };
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
            return true;
        }
    } catch (e) { console.error("Cloud settings fetch failed", e); }
    return false;
}

export const fetchGlobalRecords = async (): Promise<CheckInRecord[]> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    if (!targetUrl) return [];
    try {
        const response = await fetch(`${targetUrl}?action=getRecords&t=${Date.now()}`);
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        
        if (Array.isArray(data)) {
            // ปรับแก้ข้อมูลที่ดึงมาจาก Sheet ให้มีรูปแบบเดียวกับ Local Storage
            return data.map(r => ({
                ...r,
                // ตรวจสอบว่า Timestamp เป็นตัวเลข (กันปัญหา Google Sheets แปลงเป็น String)
                timestamp: typeof r.timestamp === 'string' ? new Date(r.timestamp).getTime() : Number(r.timestamp),
                imageUrl: r.imageurl || r.imageUrl || "" // รองรับทั้ง lowercase/camelCase จาก GAS
            }));
        }
        return [];
    } catch (e) { 
        console.error("Cloud records fetch failed", e);
        return []; 
    }
};
