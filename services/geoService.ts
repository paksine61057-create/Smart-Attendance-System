
import { GeoLocation } from '../types';

export const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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

export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง GPS'));
      return;
    }
    
    // ตรวจสอบว่าเป็น HTTPS หรือไม่ (สำคัญมากสำหรับ Geolocation)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      reject(new Error('ระบบพิกัดต้องการการเชื่อมต่อแบบปลอดภัย (HTTPS) โปรดตรวจสอบ URL ของคุณ'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      let message = 'ไม่สามารถระบุตำแหน่งได้';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'ผู้ใช้ปฏิเสธการเข้าถึงตำแหน่ง (Permission Denied) โปรดอนุญาตการเข้าถึงตำแหน่งในตั้งค่าเบราว์เซอร์';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'ไม่สามารถดึงข้อมูลพิกัดจากดาวเทียมได้ในขณะนี้';
          break;
        case error.TIMEOUT:
          message = 'การค้นหาพิกัดใช้เวลานานเกินไป (Timeout) โปรดลองใหม่อีกครั้งในที่โล่ง';
          break;
      }
      reject(new Error(message));
    }, {
      enableHighAccuracy: true,
      timeout: 20000, // เพิ่มเป็น 20 วินาทีเพื่อให้เวลา GPS ค้นหาสัญญาณ
      maximumAge: 0
    });
  });
};
