
import { CheckInRecord, AppSettings, AttendanceType } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

// อัปเดต URL เป็นตัวใหม่ตามที่ระบุ
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzUoPM2lDmpMbCwfryM1EuiZDQnFPuF4paqayK5XWL0nNF_MYGmPcOS7AEjDTNEaM1q/exec'; 

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

                // พยายามหา Timestamp ที่ดีที่สุดมาใช้เป็น ID
                let ts = Date.now();
                const rawTs = getVal(['timestamp', 'Timestamp', 'id', 'idพนักงาน', 'เวลาที่ทำรายการ']);
                if (rawTs) {
                    const parsed = Number(rawTs);
                    if (!isNaN(parsed) && parsed > 1000000000) ts = parsed;
                }
                
                const rawType = String(getVal(['type', 'ประเภท', 'Type']) || '').toLowerCase();
                const rawStatus = String(getVal(['status', 'สถานะ', 'Status']) || '').toLowerCase();
                const combined = (rawType + " " + rawStatus);
                
                let type: AttendanceType = 'arrival';
                if (['กลับบ้าน', 'departure', 'เลิกงาน', 'ออก', 'exit'].some(k => combined.includes(k))) type = 'departure';
                else if (['ไปราชการ', 'duty', 'ราชการ'].some(k => combined.includes(k))) type = 'duty';
                else if (['ลาป่วย', 'sick'].some(k => combined.includes(k))) type = 'sick_leave';
                else if (['ลากิจ', 'personal'].some(k => combined.includes(k))) type = 'personal_leave';
                else if (['ลาอื่นๆ', 'other'].some(k => combined.includes(k))) type = 'other_leave';
                else if (['อนุญาตสาย', 'authorized', 'ขอเข้าสาย'].some(k => combined.includes(k))) type = 'authorized_late';

                let status: any = 'Normal';
                if (['ตรงเวลา', 'on time'].some(k => combined.includes(k))) status = 'On Time';
                else if (['สาย', 'late'].some(k => combined.includes(k))) status = 'Late';
                else if (['กลับก่อน', 'early'].some(k => combined.includes(k))) status = 'Early Leave';
                else if (type === 'departure') status = 'Normal';
                else if (['duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(type)) {
                   status = type.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }
                else status = 'On Time';

                return {
                    id: String(getVal(['id', 'Staff ID', 'idพนักงาน', 'StaffID']) || ts),
                    staffId: String(getVal(['staffId', 'StaffID', 'Staff ID', 'idพนักงาน']) || ""),
                    name: String(getVal(['name', 'ชื่อ', 'ชื่อนามสกุล', 'Name', 'ชื่อ-นามสกุล']) || "ไม่ระบุชื่อ"),
                    role: String(getVal(['role', 'ตำแหน่ง', 'Role']) || ""),
                    timestamp: ts,
                    type: type,
                    status: status,
                    reason: String(getVal(['reason', 'เหตุผล', 'Reason', 'หมายเหตุ']) || ""),
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: 0,
                    aiVerification: String(getVal(['aiVerification', 'ai', 'การตรวจสอบ', 'AIVerification']) || ""),
                    imageUrl: String(getVal(['imageUrl', 'image', 'รูปภาพ', 'Photo', 'File Upload', 'ภาพถ่าย', 'url']) || ""),
                    syncedToSheets: true
                };
            });
        }
    } catch (e) {
        console.error("Fetch global records failed", e);
    }
    return [];
};
