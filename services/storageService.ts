
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
      "Location": `https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`,
      "Distance (m)": Math.round(record.distanceFromBase),
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
  
  const targetUrl = settings.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
  if (targetUrl) {
    try {
      const payload = {
        action: 'updateSettings',
        officeLocation: settings.officeLocation,
        maxDistanceMeters: settings.maxDistanceMeters,
        bypassLocation: !!settings.bypassLocation
      };
      await fetch(targetUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("Failed to push settings to cloud", e);
    }
  }
};

export const getSettings = (): AppSettings & { lockLocation?: boolean } => {
  const data = localStorage.getItem(SETTINGS_KEY);
  let s = data ? JSON.parse(data) : { officeLocation: null, maxDistanceMeters: 100, googleSheetUrl: DEFAULT_GOOGLE_SHEET_URL, lockLocation: false, bypassLocation: false };
  if (!s.googleSheetUrl || s.googleSheetUrl === "") s.googleSheetUrl = DEFAULT_GOOGLE_SHEET_URL;
  if (s.bypassLocation === undefined) s.bypassLocation = false;
  return s;
};

export const syncSettingsFromCloud = async (): Promise<boolean> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    if (!targetUrl) return false;
    
    try {
        const response = await fetch(`${targetUrl}?action=getSettings&t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
        });
        const cloud = await response.json();
        
        if (cloud) {
            // สำคัญ: Bypass Location จะซิงค์เสมอ ไม่ว่าเครื่องจะล็อกพิกัดไว้หรือไม่
            let updatedSettings = { ...s };
            
            // 1. อัปเดตสถานะ Bypass เสมอ
            if (cloud.bypassLocation !== undefined) {
                updatedSettings.bypassLocation = !!cloud.bypassLocation;
            }

            // 2. อัปเดตพิกัดและระยะทาง เฉพาะเมื่อเครื่องไม่ได้สั่ง "ล็อกพิกัด" ไว้
            if (!s.lockLocation) {
                if (cloud.officeLocation && cloud.officeLocation.lat !== 0) {
                    updatedSettings.officeLocation = cloud.officeLocation;
                }
                if (cloud.maxDistanceMeters !== undefined) {
                    updatedSettings.maxDistanceMeters = cloud.maxDistanceMeters;
                }
            }
            
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
            window.dispatchEvent(new Event('settings_updated'));
            return true;
        }
    } catch (e) {
        console.error("Sync settings error", e);
    }
    return false;
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
                    for (const k of keys) {
                        const lowK = k.toLowerCase().replace(/\s/g, '');
                        for (const objKey in r) {
                            if (objKey.toLowerCase().replace(/\s/g, '') === lowK) return r[objKey];
                        }
                    }
                    return null;
                };
                let ts = Date.now();
                const rawTs = getVal(['id', 'timestamp', 'Timestamp']);
                if (rawTs && !isNaN(Number(rawTs))) ts = Number(rawTs);
                
                return {
                    id: String(getVal(['id', 'Timestamp']) || ts),
                    staffId: getVal(['staffId', 'staffid', 'Staff ID']) || "",
                    name: getVal(['name', 'Name']) || "Unknown",
                    role: getVal(['role', 'Role']) || "",
                    timestamp: ts,
                    type: 'arrival',
                    status: getVal(['status', 'Status']) || "Normal",
                    reason: getVal(['reason', 'Reason']) || "",
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: Number(getVal(['distance', 'Distance (m)']) || 0),
                    aiVerification: getVal(['aiVerification', 'AI Verification']) || "",
                    imageUrl: String(getVal(['imageUrl', 'imageBase64', 'Image']) || "")
                };
            });
        }
    } catch (e) { }
    return [];
};
