
import { CheckInRecord, AppSettings, AttendanceType } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

// URL เว็บแอปจาก Apps Script ของคุณ
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwtuFU-Rrc3mIGM3Oi7ECQYr_HJG-HAzxDf7Qgwt2xcku58icMVpW9Ro4Iw4avMMOIY/exec'; 

export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    const dateObj = new Date(record.timestamp);
    
    // ตัดหัวข้อ data:image/jpeg;base64 ออกเพื่อให้ฝั่ง Server นำไปแปลงเป็นไฟล์ได้เลย
    const cleanImageBase64 = (record.imageUrl || "").replace(/^data:image\/\w+;base64,/, "");

    const payload = {
      "action": "insertRecord",
      "id": record.id,
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
              record.type === 'other_leave' ? 'ลาอื่นๆ' :
              record.type === 'authorized_late' ? 'อนุญาตสาย' :
              (record.type as string).replace('_', ' '),
      "Status": record.status,
      "Reason": record.reason || '-',
      "Location": `https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`,
      "Distance (m)": Math.round(record.distanceFromBase),
      "AI Verification": record.aiVerification || '-',
      "imageBase64": cleanImageBase64 // ส่งรหัสภาพไปให้ Server สร้างไฟล์
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
    } catch (e) { /* ignore */ }
    return false;
}

export const fetchGlobalRecords = async (): Promise<CheckInRecord[]> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    if (!targetUrl) return [];
    
    try {
        const response = await fetch(`${targetUrl}?action=getRecords&t=${Date.now()}`);
        if (!response.ok) throw new Error("HTTP Error");
        
        const data = await response.json();

        if (Array.isArray(data)) {
            return data.map((r: any) => {
                const getVal = (keys: string[]) => {
                    for (const k of keys) {
                        const lowK = k.toLowerCase().replace(/\s/g, '');
                        for (const objKey in r) {
                            if (objKey.toLowerCase().replace(/\s/g, '') === lowK) return r[objKey];
                        }
                    }
                    return null;
                };

                let rawTs = getVal(['timestamp', 'Timestamp']);
                let ts = Date.now();
                if (rawTs) {
                    const parsed = new Date(rawTs).getTime();
                    ts = isNaN(parsed) ? Number(rawTs) : parsed;
                }

                const rawType = String(getVal(['type', 'Type']) || "").toLowerCase();
                let type: AttendanceType = 'arrival';
                if (rawType.includes('มา')) type = 'arrival';
                else if (rawType.includes('กลับ')) type = 'departure';
                else if (rawType.includes('ราชการ') || rawType === 'duty') type = 'duty';
                else if (rawType.includes('ป่วย') || rawType === 'sick_leave' || rawType === 'sick leave') type = 'sick_leave';
                else if (rawType.includes('กิจ') || rawType === 'personal_leave' || rawType === 'personal leave') type = 'personal_leave';
                else if (rawType.includes('อื่น') || rawType === 'other_leave' || rawType === 'other leave') type = 'other_leave';
                else if (rawType.includes('อนุญาต') || rawType === 'authorized_late' || rawType === 'authorized late') type = 'authorized_late';

                // ดึงค่า URL รูปภาพจาก Cloud
                let cloudImage = String(getVal(['imageUrl', 'imageurl', 'Image', 'imageBase64', 'หลักฐาน', 'รูปภาพ']) || "").trim();
                
                // หากค่าในชีตเป็น "-" หรือสั้นเกินไป ให้ถือว่าไม่มีรูป
                if (cloudImage === "-" || cloudImage.length < 5) {
                  cloudImage = "";
                }

                return {
                    id: String(getVal(['id', 'Timestamp']) || ts),
                    staffId: getVal(['staffId', 'staffid', 'Staff ID']) || "",
                    name: getVal(['name', 'Name']) || "Unknown",
                    role: getVal(['role', 'Role']) || "",
                    timestamp: ts,
                    type: type,
                    status: getVal(['status', 'Status']) || "Normal",
                    reason: getVal(['reason', 'Reason']) || "",
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: Number(getVal(['distance', 'Distance (m)']) || 0),
                    aiVerification: getVal(['aiVerification', 'AI Verification']) || "",
                    imageUrl: cloudImage
                };
            });
        }
        return [];
    } catch (e) { 
        console.error("Cloud fetch failed:", e);
        return []; 
    }
};
