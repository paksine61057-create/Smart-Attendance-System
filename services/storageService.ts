
import { CheckInRecord, AppSettings, AttendanceType } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

/** 
 * URL ที่เชื่อมกับ Google Sheets ของคุณ (Deploy as Web App)
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1r5-VJYsR_kvtSW_jSYG3sv1GQqXEVbCMjFj9ov6SiWI/edit
 */
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzUoPM2lDmpMbCwfryM1EuiZDQnFPuF4paqayK5XWL0nNF_MYGmPcOS7AEjDTNEaM1q/exec'; 

/**
 * ส่งข้อมูลไปยัง Google Sheets (doPost)
 */
export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    const dateObj = new Date(record.timestamp);
    // ลบส่วนหัว Base64 เพื่อให้ Apps Script นำไปสร้างไฟล์ใน Drive ได้
    const cleanImageBase64 = (record.imageUrl || "").replace(/^data:image\/\w+;base64,/, "");

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
      "Distance (m)": record.distanceFromBase || 0,
      "AI Verification": record.aiVerification || '-',
      "imageBase64": cleanImageBase64
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

export const getRecords = (): CheckInRecord[] => {
  const data = localStorage.getItem(RECORDS_KEY);
  if (!data) return [];
  try {
    const list = JSON.parse(data);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
};

export const clearRecords = () => localStorage.removeItem(RECORDS_KEY);

export const saveSettings = async (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  let s = data ? JSON.parse(data) : { googleSheetUrl: DEFAULT_GOOGLE_SHEET_URL };
  if (!s.googleSheetUrl || s.googleSheetUrl === "") s.googleSheetUrl = DEFAULT_GOOGLE_SHEET_URL;
  return s;
};

export const syncSettingsFromCloud = async (): Promise<boolean> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(`${targetUrl}?t=${Date.now()}`);
        await response.json();
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
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'deleteRecord', id: record.timestamp })
        });
      } catch (e) { console.error("Cloud delete failed", e); }
  }
  return true;
};

/**
 * ดึงข้อมูลจาก Google Sheets (doGet)
 * อ้างอิง Key Mapping จาก Apps Script:
 * - Staff ID -> staffId
 * - Distance (m) -> distanceFromBase
 * - AI Verification -> aiVerification
 * - Image -> imageUrl
 */
export const fetchGlobalRecords = async (): Promise<CheckInRecord[]> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(`${targetUrl}?action=getRecords&t=${Date.now()}`, { cache: 'no-store' });
        const data = await response.json();
        
        if (Array.isArray(data)) {
            return data.map((r: any) => {
                const rawType = String(r.type || '').toLowerCase();
                
                let type: AttendanceType = 'arrival';
                if (rawType.includes('กลับบ้าน')) type = 'departure';
                else if (rawType.includes('ราชการ')) type = 'duty';
                else if (rawType.includes('ป่วย')) type = 'sick_leave';
                else if (rawType.includes('กิจ')) type = 'personal_leave';
                else if (rawType.includes('อนุญาตสาย')) type = 'authorized_late';

                return {
                    id: String(r.id || r.timestamp), 
                    staffId: String(r.staffId || ""),
                    name: String(r.name || "ไม่ทราบชื่อ"),
                    role: String(r.role || ""),
                    timestamp: Number(r.timestamp) || Date.now(),
                    type: type,
                    status: (r.status || 'Normal') as any,
                    reason: String(r.reason || ""),
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: Number(r.distanceFromBase) || 0,
                    aiVerification: String(r.aiVerification || ""),
                    imageUrl: String(r.imageUrl || ""),
                    syncedToSheets: true
                };
            });
        }
    } catch (e) {
        console.error("Fetch global records failed", e);
    }
    return [];
};
