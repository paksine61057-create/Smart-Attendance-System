
import { CheckInRecord, AppSettings } from '../types';

const RECORDS_KEY = 'school_checkin_records';
const SETTINGS_KEY = 'school_checkin_settings';

export const saveRecord = (record: CheckInRecord) => {
  const records = getRecords();
  records.push(record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  
  // Attempt to sync to Google Sheets if URL is present
  const settings = getSettings();
  if (settings.googleSheetUrl) {
    sendToGoogleSheets(record, settings.googleSheetUrl);
  }
};

export const getRecords = (): CheckInRecord[] => {
  const data = localStorage.getItem(RECORDS_KEY);
  return data ? JSON.parse(data) : [];
};

export const clearRecords = () => {
  localStorage.removeItem(RECORDS_KEY);
}

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const getSettings = (): AppSettings => {
  const data = localStorage.getItem(SETTINGS_KEY);
  // Default settings
  return data ? JSON.parse(data) : {
    officeLocation: null, // Must be set by user initially
    maxDistanceMeters: 10,
    googleSheetUrl: ''
  };
};

export const exportToCSV = (records?: CheckInRecord[]): string => {
  const dataToExport = records || getRecords();
  // Add Type and Reason to header
  const header = ['ID,Staff ID,Name,Role,Type,Reason,Timestamp,Date,Time,Status,Latitude,Longitude,Distance(m),AI Verification'];
  const rows = dataToExport.map(r => {
    const dateObj = new Date(r.timestamp);
    let typeLabel = '';
    switch(r.type) {
        case 'arrival': typeLabel = 'มาทำงาน'; break;
        case 'departure': typeLabel = 'กลับบ้าน'; break;
        case 'duty': typeLabel = 'ไปราชการ'; break;
        case 'sick_leave': typeLabel = 'ลาป่วย'; break;
        case 'personal_leave': typeLabel = 'ลากิจ'; break;
        case 'other_leave': typeLabel = 'ลาอื่นๆ'; break;
        default: typeLabel = r.type;
    }

    const reasonText = r.reason ? r.reason.replace(/"/g, '""') : '';
    
    return [
      r.id,
      r.staffId || '-',
      `"${r.name}"`,
      r.role,
      typeLabel,
      `"${reasonText}"`,
      r.timestamp,
      dateObj.toLocaleDateString(),
      dateObj.toLocaleTimeString(),
      r.status,
      r.location.lat,
      r.location.lng,
      r.distanceFromBase.toFixed(2),
      `"${r.aiVerification?.replace(/"/g, '""')}"`
    ].join(',');
  });
  return [header, ...rows].join('\n');
};

// Simple Fire-and-forget sync to Google Sheets Web App
export const sendToGoogleSheets = async (record: CheckInRecord, url: string) => {
  try {
    // Note: Google Apps Script Web Apps require 'no-cors' for simple fetch from browser 
    // or a proxy. For this demo, we assume the user sets up the script to accept POST.
    // However, direct fetch to Google Scripts often has CORS issues. 
    // The most reliable way without a proxy is submitting a hidden form or using 'no-cors' 
    // which implies we won't know if it succeeded or failed in the UI.
    
    // Using no-cors mode (Opaque response)
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors', 
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record)
    });
    console.log("Sent to Google Sheets");
  } catch (e) {
    console.error("Failed to sync to sheets", e);
  }
};
