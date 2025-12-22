
import { CheckInRecord, AppSettings, AttendanceType } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwtuFU-Rrc3mIGM3Oi7ECQYr_HJG-HAzxDf7Qgwt2xcku58icMVpW9Ro4Iw4avMMOIY/exec'; 

export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    const dateObj = new Date(record.timestamp);
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
      "Location": "ลงเวลาออนไลน์",
      "Distance (m)": 0,
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
  return data ? JSON.parse(data) : [];
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
    return true;
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
            body: JSON.stringify({ action: 'deleteRecord', id: record.id })
        });
      } catch (e) { console.error("Cloud delete failed", e); }
  }
  return true;
};

export const fetchGlobalRecords = async (): Promise<CheckInRecord[]> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(`${targetUrl}?action=getRecords&t=${Date.now()}`, { cache: 'no-store' });
        const data = await response.json();
        
        if (Array.isArray(data)) {
            return data.map((r: any) => {
                const getVal = (keys: string[]) => {
                    const normalizedKeys = keys.map(k => k.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, ''));
                    for (const objKey in r) {
                        const normalizedObjKey = objKey.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
                        if (normalizedKeys.includes(normalizedObjKey)) return r[objKey];
                    }
                    return null;
                };

                let ts = Date.now();
                const rawTs = getVal(['timestamp', 'id', 'Timestamp']);
                if (rawTs && !isNaN(Number(rawTs)) && Number(rawTs) > 0) ts = Number(rawTs);
                
                // ค้นหาสถานะ (รองรับคอลัมน์ Status หรือ สถานะ)
                const rawStatus = String(getVal(['status', 'สถานะ']) || "Normal").trim();
                let status: any = rawStatus;
                // Mapping ภาษาไทยกลับเป็นระบบ
                if (rawStatus === 'มาตรงเวลา' || rawStatus === 'On Time') status = 'On Time';
                else if (rawStatus === 'มาสาย' || rawStatus === 'Late') status = 'Late';
                else if (rawStatus === 'ไปราชการ' || rawStatus === 'Duty') status = 'Duty';
                else if (rawStatus === 'ลาป่วย' || rawStatus === 'Sick Leave') status = 'Sick Leave';
                else if (rawStatus === 'ลากิจ' || rawStatus === 'Personal Leave') status = 'Personal Leave';
                else if (rawStatus === 'ลาอื่นๆ' || rawStatus === 'Other Leave') status = 'Other Leave';
                else if (rawStatus === 'อนุญาตสาย' || rawStatus === 'Authorized Late') status = 'Authorized Late';
                else if (rawStatus === 'กลับก่อน' || rawStatus === 'Early Leave') status = 'Early Leave';

                // ค้นหาประเภท
                const rawType = String(getVal(['type', 'ประเภท']) || 'arrival').trim();
                let type: AttendanceType = 'arrival';
                if (rawType === 'กลับบ้าน' || rawType === 'departure' || rawType === 'Departure') type = 'departure';
                else if (rawType === 'ไปราชการ' || rawType === 'duty' || rawType === 'Duty') type = 'duty';
                else if (rawType === 'ลาป่วย' || rawType === 'sick_leave' || rawType === 'Sick Leave') type = 'sick_leave';
                else if (rawType === 'ลากิจ' || rawType === 'personal_leave' || rawType === 'Personal Leave') type = 'personal_leave';
                else if (rawType === 'ลาอื่นๆ' || rawType === 'other_leave' || rawType === 'Other Leave') type = 'other_leave';
                else if (rawType === 'อนุญาตสาย' || rawType === 'authorized_late' || rawType === 'Authorized Late') type = 'authorized_late';

                return {
                    id: String(getVal(['id', 'idพนักงาน', 'StaffID', 'Staff ID']) || ts),
                    staffId: String(getVal(['staffId', 'staffid', 'idพนักงาน', 'StaffID', 'Staff ID']) || ""),
                    name: String(getVal(['name', 'ชื่อ', 'ชื่อนามสกุล', 'Name']) || "ไม่ระบุชื่อ"),
                    role: String(getVal(['role', 'ตำแหน่ง', 'Role']) || ""),
                    timestamp: ts,
                    type: type,
                    status: status,
                    reason: String(getVal(['reason', 'เหตุผล', 'Reason']) || ""),
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: 0,
                    aiVerification: String(getVal(['aiVerification', 'ai', 'การตรวจสอบ', 'AIVerification']) || ""),
                    imageUrl: String(getVal(['imageUrl', 'image', 'รูปภาพ', 'url', 'Image']) || "")
                };
            });
        }
    } catch (e) {
        console.error("Fetch global records failed", e);
    }
    return [];
};
