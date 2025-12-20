
import { CheckInRecord, AppSettings } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

// ลิ้งค์ฐานข้อมูลที่คุณระบุ
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwtuFU-Rrc3mIGM3Oi7ECQYr_HJG-HAzxDf7Qgwt2xcku58icMVpW9Ro4Iw4avMMOIY/exec'; 

export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    // ใช้ text/plain เพื่อเลี่ยงปัญหา CORS preflight ใน Google Apps Script
    const response = await fetch(url, {
      method: 'POST',
      mode: 'no-cors', // สำคัญมากสำหรับการส่งไปยัง GAS Web App
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(record)
    });
    // เนื่องจากใช้ no-cors เราจะไม่รู้ผล response.ok แต่ assume ว่าถ้าไม่ throw คือส่งสำเร็จ
    return true;
  } catch (e) {
    console.error("Failed to sync to sheets", e);
    return false;
  }
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
  if (!s.googleSheetUrl) s.googleSheetUrl = DEFAULT_GOOGLE_SHEET_URL;
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
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ 
              ...s, 
              officeLocation: cloud.officeLocation, 
              maxDistanceMeters: cloud.maxDistanceMeters || 50 
            }));
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
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) { 
        console.error("Cloud records fetch failed", e);
        return []; 
    }
};
