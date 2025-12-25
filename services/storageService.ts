
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
      "lat": record.location.lat,
      "lng": record.location.lng,
      "AI Verification": record.aiVerification || '-',
      "imageBase64": cleanImageBase64 
    };

    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    return true; 
  } catch (e) { return false; }
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
        if (idx !== -1) { updated[idx].syncedToSheets = true; localStorage.setItem(RECORDS_KEY, JSON.stringify(updated)); }
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
  if (settings.googleSheetUrl) {
    try {
      await fetch(settings.googleSheetUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'saveSettings', lat: settings.officeLocation.lat, lng: settings.officeLocation.lng, maxDistance: settings.maxDistanceMeters, locationMode: settings.locationMode }) });
    } catch (e) {}
  }
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  const def: AppSettings = { googleSheetUrl: DEFAULT_GOOGLE_SHEET_URL, locationMode: 'online', officeLocation: { lat: 17.345854, lng: 102.834789 }, maxDistanceMeters: 50 };
  return data ? { ...def, ...JSON.parse(data) } : def;
};

export const syncSettingsFromCloud = async (): Promise<boolean> => {
    const s = getSettings();
    const targetUrl = s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;
    try {
        const response = await fetch(`${targetUrl}?action=getSettings&t=${Date.now()}`);
        if (response.ok) {
           const cloud = await response.json();
           if (cloud && cloud.officeLocation) {
               const news = { ...getSettings(), officeLocation: cloud.officeLocation, maxDistanceMeters: cloud.maxDistanceMeters || 50, locationMode: cloud.locationMode || 'online' };
               localStorage.setItem(SETTINGS_KEY, JSON.stringify(news));
           }
        }
        return true;
    } catch (e) { return false; }
};

export const syncUnsyncedRecords = async () => {
    const records = getRecords();
    const unsynced = records.filter(r => !r.syncedToSheets);
    if (unsynced.length === 0) return;
    const s = getSettings();
    for (const record of unsynced) {
        if (await sendToGoogleSheets(record, s.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL)) record.syncedToSheets = true;
    }
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
};

export const deleteRecord = async (record: CheckInRecord) => {
  const records = getRecords().filter(r => r.id !== record.id);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  const s = getSettings();
  if (s.googleSheetUrl) {
    try { await fetch(s.googleSheetUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'deleteRecord', id: record.timestamp }) }); } catch (e) {}
  }
  return true;
};

const formatDriveImageUrl = (url: string): string => {
  if (!url || url === '-' || url.startsWith('Error')) return '';
  const dMatch = url.match(/\/d\/([^/&#?]+)/);
  const idMatch = url.match(/[?&]id=([^&#?]+)/);
  const fileId = dMatch ? dMatch[1] : (idMatch ? idMatch[1] : '');
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId}=w1000` : url;
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
                // ค้นหาค่าแบบไม่สนตัวพิมพ์เล็ก-ใหญ่
                const getVal = (keys: string[]) => {
                    for (let k of keys) {
                        if (r[k] !== undefined) return r[k];
                        if (r[k.toLowerCase()] !== undefined) return r[k.toLowerCase()];
                        const keyNoSpace = k.replace(/\s/g, '');
                        if (r[keyNoSpace] !== undefined) return r[keyNoSpace];
                    }
                    return '';
                };

                const typeStr = String(getVal(['Type']) || '');
                let type: AttendanceType = 'arrival';
                if (typeStr.includes('กลับ')) type = 'departure';
                else if (typeStr.includes('ราชการ')) type = 'duty';
                else if (typeStr.includes('ป่วย')) type = 'sick_leave';
                else if (typeStr.includes('กิจ')) type = 'personal_leave';

                const ts = Number(getVal(['Timestamp']));
                let rawImg = getVal(['Image', 'imageUrl', 'image']);
                if (typeof rawImg === 'string' && rawImg.includes('drive.google.com')) rawImg = formatDriveImageUrl(rawImg);

                return {
                    id: String(ts || Math.random()), 
                    staffId: String(getVal(['Staff ID', 'staffId']) || ""),
                    name: String(getVal(['Name']) || ""),
                    role: String(getVal(['Role']) || ""),
                    timestamp: ts,
                    type: type,
                    status: (getVal(['Status']) || 'Normal') as any,
                    reason: String(getVal(['Reason']) || ""),
                    location: { lat: 0, lng: 0 },
                    distanceFromBase: Number(getVal(['Distance (m)', 'distancefrombase'])) || 0,
                    aiVerification: String(getVal(['AI Verification', 'aiverification']) || ""),
                    imageUrl: rawImg,
                    syncedToSheets: true
                };
            }).filter(rec => rec.timestamp > 0);
        }
    } catch (e) { console.error(e); }
    return [];
};
