
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
    
    // บังคับให้ใช้ค่าล่าสุดเสมอ ไม่ใช้ Cache
    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
      ...options
    };

    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      let message = 'ไม่สามารถระบุตำแหน่งได้';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'โปรดอนุญาตสิทธิ์การเข้าถึงตำแหน่ง (Location Permission)';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'ข้อมูลพิกัดไม่พร้อมใช้งาน (โปรดเปิด GPS)';
          break;
        case error.TIMEOUT:
          message = 'ค้นหาสัญญาณพิกัดนานเกินไป (โปรดลองใหม่อีกครั้ง)';
          break;
      }
      reject(new Error(message));
    }, defaultOptions);
  });
};

// ฟังก์ชันพิเศษสำหรับแอดมิน: พยายามหาจุดที่แม่นยำที่สุด
export const getAccuratePosition = async (maxAttempts = 3): Promise<GeolocationPosition> => {
    let lastPos: GeolocationPosition | null = null;
    for (let i = 0; i < maxAttempts; i++) {
        const pos = await getCurrentPosition({ timeout: 10000 });
        if (!lastPos || pos.coords.accuracy < lastPos.coords.accuracy) {
            lastPos = pos;
        }
        // ถ้าแม่นยำกว่า 15 เมตร ถือว่าใช้ได้เลย
        if (pos.coords.accuracy <= 15) return pos;
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!lastPos) throw new Error("ไม่สามารถค้นหาพิกัดได้");
    return lastPos;
};
