
import { GeoLocation } from '../types';

export const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000; // Distance in meters
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

export const getCurrentPosition = (options?: PositionOptions): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง GPS'));
      return;
    }
    
    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0, // บังคับดึงใหม่เสมอ ไม่ใช้ Cache
      ...options
    };

    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      let message = 'ไม่สามารถระบุตำแหน่งได้';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'โปรดอนุญาตสิทธิ์การเข้าถึงตำแหน่งในเบราว์เซอร์';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'สัญญาณ GPS อ่อนหรือไม่พร้อมใช้งาน (ลองออกไปที่โล่ง)';
          break;
        case error.TIMEOUT:
          message = 'การค้นหาพิกัดใช้เวลานานเกินไป โปรดลองใหม่อีกครั้ง';
          break;
      }
      reject(new Error(message));
    }, defaultOptions);
  });
};

/**
 * พยายามดึงพิกัดที่แม่นยำที่สุด (Accuracy ต่ำกว่า 30 เมตร)
 */
export const getAccuratePosition = async (maxAttempts = 5): Promise<GeolocationPosition> => {
    let lastPos: GeolocationPosition | null = null;
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const pos = await getCurrentPosition({ timeout: 8000 });
            // เก็บตัวที่แม่นที่สุดไว้
            if (!lastPos || pos.coords.accuracy < lastPos.coords.accuracy) {
                lastPos = pos;
            }
            // ถ้าแม่นยำต่ำกว่า 20 เมตร ถือว่าดีเยี่ยม ใช้ได้เลย
            if (pos.coords.accuracy <= 20) return pos;
        } catch (e) {
            console.warn(`Attempt ${i+1} failed:`, e);
        }
        await new Promise(r => setTimeout(r, 800)); // พักแป๊บเดียวแล้วลองใหม่
    }
    
    if (!lastPos) throw new Error("ไม่สามารถค้นหาพิกัดที่แม่นยำได้ โปรดตรวจสอบว่าเปิด GPS และอินเทอร์เน็ตแล้ว");
    return lastPos;
};
