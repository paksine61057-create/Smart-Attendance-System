
import { SpecialHoliday } from '../types';

export interface Holiday {
  date: string; // MM-DD for fixed, YYYY-MM-DD for specific
  name: string;
}

const SPECIAL_HOLIDAYS_KEY = 'school_checkin_special_holidays';

// 1. วันหยุดคงที่ (Fixed Holidays) - ตรงกันทุกปี
const FIXED_HOLIDAYS_BASE = [
  { date: '01-01', name: 'วันขึ้นปีใหม่' },
  { date: '01-16', name: 'วันครู' }, // เพิ่มวันครู สำหรับโรงเรียน
  { date: '04-06', name: 'วันจักรี' },
  { date: '04-13', name: 'วันสงกรานต์' },
  { date: '04-14', name: 'วันสงกรานต์' },
  { date: '04-15', name: 'วันสงกรานต์' },
  { date: '05-01', name: 'วันแรงงานแห่งชาติ' },
  { date: '05-04', name: 'วันฉัตรมงคล' },
  { date: '06-03', name: 'วันเฉลิมพระชนมพรรษาพระราชินี' },
  { date: '07-28', name: 'วันเฉลิมพระชนมพรรษาในหลวง ร.10' },
  { date: '08-12', name: 'วันแม่แห่งชาติ' },
  { date: '10-13', name: 'วันนวมินทรมหาราช' },
  { date: '10-23', name: 'วันปิยมหาราช' },
  { date: '12-05', name: 'วันพ่อแห่งชาติ' },
  { date: '12-10', name: 'วันรัฐธรรมนูญ' },
  { date: '12-31', name: 'วันสิ้นปี' }
];

// 2. วันหยุดตามปฏิทินจันทรคติ (Dynamic)
// หมายเหตุ: ปี ค.ศ. 2025 ตรงกับ พ.ศ. 2568
const DYNAMIC_HOLIDAYS: Record<number, { date: string, name: string }[]> = {
  2025: [ // พ.ศ. 2568
    { date: '02-12', name: 'วันมาฆบูชา' },
    { date: '04-07', name: 'วันหยุดชดเชยวันจักรี' },
    { date: '04-16', name: 'วันหยุดชดเชยวันสงกรานต์' },
    { date: '05-05', name: 'วันหยุดชดเชยวันฉัตรมงคล' },
    { date: '05-11', name: 'วันวิสาขบูชา' },
    { date: '05-12', name: 'วันหยุดชดเชยวันวิสาขบูชา' },
    { date: '07-10', name: 'วันอาสาฬหบูชา' },
    { date: '07-11', name: 'วันเข้าพรรษา' },
    { date: '08-12', name: 'วันแม่แห่งชาติ' },
    // วันหยุดอื่นๆ ที่เป็น Fixed จะถูกดึงมาจาก FIXED_HOLIDAYS_BASE
  ],
  2026: [ // พ.ศ. 2569
    { date: '03-03', name: 'วันมาฆบูชา' },
    { date: '05-26', name: 'วันวิสาขบูชา' },
    { date: '07-29', name: 'วันอาสาฬหบูชา' },
    { date: '07-30', name: 'วันเข้าพรรษา' },
  ]
};

export const getSpecialHolidays = (): SpecialHoliday[] => {
  const data = localStorage.getItem(SPECIAL_HOLIDAYS_KEY);
  return data ? JSON.parse(data) : [];
};

export const addSpecialHoliday = (date: string, name: string) => {
  const list = getSpecialHolidays();
  // Prevent duplicate dates
  if (list.some(h => h.date === date)) {
     return false; 
  }
  const newHoliday: SpecialHoliday = {
    id: crypto.randomUUID(),
    date, 
    name
  };
  list.push(newHoliday);
  list.sort((a, b) => a.date.localeCompare(b.date)); // Sort by date
  localStorage.setItem(SPECIAL_HOLIDAYS_KEY, JSON.stringify(list));
  return true;
};

export const removeSpecialHoliday = (id: string) => {
  const list = getSpecialHolidays();
  const newList = list.filter(h => h.id !== id);
  localStorage.setItem(SPECIAL_HOLIDAYS_KEY, JSON.stringify(newList));
};

export const getHoliday = (date: Date): string | null => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  const currentFullDate = `${year}-${month}-${day}`;
  const currentShortDate = `${month}-${day}`;

  // 1. ตรวจสอบวันหยุดพิเศษ (Special Holidays - Admin Defined)
  const specialHolidays = getSpecialHolidays();
  const special = specialHolidays.find(h => h.date === currentFullDate);
  if (special) return special.name;

  // 2. ตรวจสอบวันหยุดคงที่ (Fixed)
  const fixedHoliday = FIXED_HOLIDAYS_BASE.find(h => h.date === currentShortDate);
  if (fixedHoliday) {
    return fixedHoliday.name;
  }

  // 3. ตรวจสอบวันหยุดตามปฏิทิน (Dynamic)
  if (DYNAMIC_HOLIDAYS[year]) {
    const dynamicHoliday = DYNAMIC_HOLIDAYS[year].find(h => `${year}-${h.date}` === currentFullDate || h.date === currentShortDate);
    if (dynamicHoliday) {
      return dynamicHoliday.name;
    }
  }

  return null;
};
