
export interface GeoLocation {
  lat: number;
  lng: number;
}

export type AttendanceType = 'arrival' | 'departure' | 'duty' | 'sick_leave' | 'personal_leave' | 'other_leave' | 'authorized_late';

export interface Staff {
  id: string;
  name: string;
  role: string;
}

export interface CheckInRecord {
  id: string; // UUID
  staffId?: string; // PJ...
  name: string;
  role: string;
  timestamp: number;
  type: AttendanceType; // 'arrival', 'departure', or leaves
  reason?: string; // Reason for early departure or leave details
  location: GeoLocation;
  distanceFromBase: number; // in meters
  status: 'On Time' | 'Late' | 'Normal' | 'Early Leave' | 'Duty' | 'Sick Leave' | 'Personal Leave' | 'Other Leave' | 'Authorized Late' | 'Admin Assist';
  imageUrl?: string; // base64
  aiVerification?: string; // Gemini's comment on the image
  syncedToSheets?: boolean;
}

export interface AppSettings {
  officeLocation: GeoLocation | null;
  maxDistanceMeters: number;
  googleSheetUrl?: string; // Google Apps Script Web App URL
}

export interface DailySummary {
  total: number;
  onTime: number;
  late: number;
  aiSummary: string;
}