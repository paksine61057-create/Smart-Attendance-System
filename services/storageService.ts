
import { CheckInRecord, AppSettings, AttendanceType } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

/** 
 * วาง Web App URL ของคุณที่นี่ (URL ที่ได้จากการ Deploy Google Apps Script)
 */
const DEFAULT_GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzUoPM2lDmpMbCwfryM1EuiZDQnFPuF4paqayK5XWL0nNF_MYGmPcOS7AEjDTNEaM1q/exec'; 

export const sendToGoogleSheets = async (record: CheckInRecord, url: string): Promise<boolean> => {
  try {
    const dateObj = new Date(record.timestamp);
    const cleanImageBase64 = record.imageUrl || "";

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

    const response = await fetch(url, {
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
        const text = await response.text();
        JSON.parse(text);
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
 * ฟังก์ชันช่วยแปลงลิงก์ Google Drive ให้เป็น Direct Image Link
 */
const formatDriveImageUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return url;
  
  // ตรวจสอบว่าเป็นลิงก์ Google Drive หรือไม่
  if (url.includes('drive.google.com')) {
    let fileId = '';
    
    // พยายามดึง ID จากรูปแบบ /file/d/FILE_ID/...
    const dMatch = url.match(/\/d\/([^/]+)/);
    if (dMatch) fileId = dMatch[1];
    
    // พยายามดึง ID จากรูปแบบ ?id=FILE_ID
    if (!fileId) {
      const idMatch = url.match(/[?&]id=([^&]+)/);
      if (idMatch) fileId = idMatch[1];
    }
    
    // ถ้าเจอ File ID ให้แปลงเป็น Thumbnail URL (รองรับการแสดงผลใน img tag ได้ดีที่สุด)
    if (fileId) {
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    }
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
                
                if (typeStr.includes('กลับ') || typeStr.includes('เลิก') || typeStr.includes('ออก')) {
                    type = 'departure';
                } else if (typeStr.includes('ราชการ')) {
                    type = 'duty';
                } else if (typeStr.includes('ป่วย')) {
                    type = 'sick_leave';
                } else if (typeStr.includes('กิจ')) {
                    type = 'personal_leave';
                } else if (typeStr.includes('อนุญาต') || typeStr.includes('สาย')) {
                    type = 'authorized_late';
                } else if (typeStr.includes('มา') || typeStr.includes('ทำงาน') || typeStr.includes('เข้า')) {
                    type = 'arrival';
                }

                let ts = Number(r.timestamp || r.Timestamp);
                if (isNaN(ts) || ts === 0) {
                    const dateVal = r.date || r.Date || '';
                    const timeVal = r.time || r.Time || '';
                    ts = parseThaiDateTimeToTimestamp(dateVal, timeVal);
                }

                let rawImg = r.imageUrl || r.imageurl || r.image || r.Image || "";
                
                // จัดการประเภทของรูปภาพ (Base64 vs URLs)
                if (rawImg && typeof rawImg === 'string') {
                    if (rawImg.startsWith('http')) {
                        // ถ้าเป็น URL ให้ตรวจสอบและแปลงกรณีเป็น Drive Link
                        rawImg = formatDriveImageUrl(rawImg);
                    } else if (rawImg.length > 50 && !rawImg.startsWith('data:image')) {
                        // ถ้าเป็น Base64 ที่ไม่มี Header
                        rawImg = `data:image/jpeg;base64,${rawImg}`;
                    }
                }

                return {
                    id: String(ts || Date.now() + Math.random()), 
                    staffId: String(r.staffId || r.staffid || r["Staff ID"] || ""),
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
    } catch (e) { 
      console.error("Fetch global records error", e); 
    }
    return [];
};
