
import { CheckInRecord, AppSettings, AttendanceType } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzxtqmNg2Xx9EJNQGYNJO9xb-I5XkUiLR3ZIq_q3RCTdDBDAx_aQL9be_A_mynuSWwj/exec'; 

export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    const dateObj = new Date(record.timestamp);
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
      "Type": record.type === 'arrival' ? 'มาทำงาน' : record.type === 'departure' ? 'กลับบ้าน' : record.type === 'duty' ? 'ไปราชการ' : record.type === 'sick_leave' ? 'ลาป่วย' : record.type === 'personal_leave' ? 'ลากิจ' : 'อื่นๆ',
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
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload) 
    });
    return true; 
  } catch (e) { 
    console.error("Post to Sheets Error:", e);
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
  return data ? JSON.parse(data) : [];
};

export const clearRecords = () => localStorage.removeItem(RECORDS_KEY);

export const saveSettings = async (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  const def: AppSettings = { googleSheetUrl: DEFAULT_GOOGLE_SHEET_URL, locationMode: 'online', officeLocation: { lat: 17.345854, lng: 102.834789 }, maxDistanceMeters: 50 };
  return data ? { ...def, ...JSON.parse(data) } : def;
};

export const syncSettingsFromCloud = async (): Promise<boolean> => {
    return true; 
};

export const syncUnsyncedRecords = async () => {
    const records = getRecords();
    const unsynced = records.filter(r => !r.syncedToSheets);
    if (unsynced.length === 0) return;
    const s = getSettings();
    for (const record of unsynced) {
        if (await sendToGoogleSheets(record, s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL)) {
          record.syncedToSheets = true;
        }
    }
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
};

export const deleteRecord = async (record: CheckInRecord) => {
  const records = getRecords().filter(r => r.id !== record.id);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  return true;
};

export const fetchGlobalRecords = async (): Promise<CheckInRecord[]> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(`${targetUrl}?action=getRecords&t=${Date.now()}`);
        if (!response.ok) return [];
        const data = await response.json();
        
        if (Array.isArray(data)) {
            return data.map((r: any) => {
                // ฟังก์ชันช่วยดึงค่าแบบไม่สน Case sensitive หรือช่องว่าง
                const getValue = (keys: string[]) => {
                  for (let key of keys) {
                    if (r[key] !== undefined) return r[key];
                    // ลองหาแบบตัวเล็กทั้งหมดและตัดช่องว่าง
                    const normalizedKey = key.toLowerCase().replace(/\s/g, '');
                    const foundKey = Object.keys(r).find(k => k.toLowerCase().replace(/\s/g, '') === normalizedKey);
                    if (foundKey) return r[foundKey];
                  }
                  return null;
                };

                const typeStr = String(getValue(["Type"]) || "");
                let type: AttendanceType = 'arrival';
                if (typeStr.includes('กลับ')) type = 'departure';
                else if (typeStr.includes('ราชการ')) type = 'duty';
                else if (typeStr.includes('ป่วย')) type = 'sick_leave';
                else if (typeStr.includes('กิจ')) type = 'personal_leave';

                const ts = Number(getValue(["Timestamp"]));

                return {
                    id: String(ts || Math.random()),
                    staffId: String(getValue(["Staff ID"]) || ""),
                    name: String(getValue(["Name"]) || ""),
                    role: String(getValue(["Role"]) || ""),
                    timestamp: ts,
                    type: type,
                    status: (getValue(["Status"]) || 'Normal') as any,
                    reason: String(getValue(["Reason"]) || ""),
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: Number(getValue(["Distance (m)"])) || 0,
                    aiVerification: String(getValue(["AI Verification"]) || ""),
                    imageUrl: String(getValue(["Image"]) || "").includes('http') ? getValue(["Image"]) : "",
                    syncedToSheets: true
                };
            }).filter(rec => rec.timestamp > 0);
        }
    } catch (e) {
        console.error("Fetch Global Records Error:", e);
    }
    return [];
};
