
import { CheckInRecord, AppSettings, AttendanceType } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

/** 
 * วาง Web App URL ของคุณที่นี่เป็นค่าเริ่มต้น
 */
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzUoPM2lDmpMbCwfryM1EuiZDQnFPuF4paqayK5XWL0nNF_MYGmPcOS7AEjDTNEaM1q/exec'; 

export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    const dateObj = new Date(record.timestamp);
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
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  let s = data ? JSON.parse(data) : { googleSheetUrl: DEFAULT_GOOGLE_SHEET_URL };
  if (!s.googleSheetUrl) s.googleSheetUrl = DEFAULT_GOOGLE_SHEET_URL;
  return s;
};

export const syncSettingsFromCloud = async (): Promise<boolean> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(targetUrl);
        await response.json();
        return true;
    } catch (e) { return false; }
}

export const syncUnsyncedRecords = async () => {
    const records = getRecords();
    const unsynced = records.filter(r => !r.syncedToSheets);
    if (unsynced.length === 0) return;
    const settings = getSettings();
    const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    for (const record of unsynced) {
        if (await sendToGoogleSheets(record, targetUrl)) record.syncedToSheets = true;
    }
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
};

export const deleteRecord = async (record: CheckInRecord) => {
  const records = getRecords();
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records.filter(r => r.id !== record.id)));
  const settings = getSettings();
  const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
  if (targetUrl) {
    await fetch(targetUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({ action: 'deleteRecord', id: record.timestamp })
    });
  }
  return true;
};

export const fetchGlobalRecords = async (): Promise<CheckInRecord[]> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(`${targetUrl}?action=getRecords&t=${Date.now()}`);
        const data = await response.json();
        if (Array.isArray(data)) {
            return data.map((r: any) => {
                const typeStr = String(r.type || '');
                let type: AttendanceType = 'arrival';
                if (typeStr.includes('กลับบ้าน')) type = 'departure';
                else if (typeStr.includes('ราชการ')) type = 'duty';
                else if (typeStr.includes('ป่วย')) type = 'sick_leave';
                else if (typeStr.includes('กิจ')) type = 'personal_leave';
                else if (typeStr.includes('อนุญาตสาย')) type = 'authorized_late';

                // แก้ไข: ปรับปรุงการดึงรูปภาพให้ฉลาดขึ้น
                let rawImg = r.imageUrl || r.imageurl || r.imageBase64 || r.imagebase64 || "";
                if (rawImg && typeof rawImg === 'string' && rawImg.length > 30) {
                    // ถ้าข้อมูลเป็น URL (ส่งมาจาก Google Drive) ไม่ต้องเติม Prefix
                    if (rawImg.startsWith('http')) {
                        // คงเดิม
                    } 
                    // ถ้าเป็น Base64 แต่ไม่มี Prefix ให้เติมเข้าไป
                    else if (!rawImg.startsWith('data:image')) {
                        rawImg = `data:image/jpeg;base64,${rawImg}`;
                    }
                }

                return {
                    id: String(r.timestamp), 
                    staffId: String(r.staffId || r.staffid || ""),
                    name: String(r.name || ""),
                    role: String(r.role || ""),
                    timestamp: Number(r.timestamp),
                    type: type,
                    status: (r.status || 'Normal') as any,
                    reason: String(r.reason || ""),
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: Number(r.distancefrombase) || 0,
                    aiVerification: String(r.aiverification || ""),
                    imageUrl: rawImg,
                    syncedToSheets: true
                };
            });
        }
    } catch (e) { console.error("Fetch error", e); }
    return [];
};
