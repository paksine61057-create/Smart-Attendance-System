
import { SpecialHoliday } from '../types';

const SPECIAL_HOLIDAYS_KEY = 'school_checkin_special_holidays_ranges';

// วันหยุดคงที่ (Fixed Holidays)
const FIXED_HOLIDAYS_BASE = [
  { date: '01-01', name: 'วันขึ้นปีใหม่' },
  { date: '01-16', name: 'วันครู' },
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

// วันหยุดตามปี (Dynamic)
const DYNAMIC_HOLIDAYS: Record<number, { date: string, name: string }[]> = {
  2025: [
    { date: '02-12', name: 'วันมาฆบูชา' },
    { date: '04-07', name: 'วันหยุดชดเชยวันจักรี' },
    { date: '04-16', name: 'วันหยุดชดเชยวันสงกรานต์' },
    { date: '05-05', name: 'วันหยุดชดเชยวันฉัตรมงคล' },
    { date: '05-11', name: 'วันวิสาขบูชา' },
    { date: '05-12', name: 'วันหยุดชดเชยวันวิสาขบูชา' },
    { date: '07-10', name: 'วันอาสาฬหบูชา' },
    { date: '07-11', name: 'วันเข้าพรรษา' },
  ],
  2026: [
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

export const addSpecialHolidayRange = (startDate: string, endDate: string, name: string) => {
  const list = getSpecialHolidays();
  const newHoliday: SpecialHoliday = {
    id: crypto.randomUUID(),
    startDate,
    endDate,
    name
  };
  list.push(newHoliday);
  list.sort((a, b) => a.startDate.localeCompare(b.startDate));
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

  // 1. ตรวจสอบวันเสาร์-อาทิตย์
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return 'วันอาทิตย์';
  if (dayOfWeek === 6) return 'วันเสาร์';

  // 2. ตรวจสอบวันหยุดช่วง (Special Holiday Ranges - Admin Defined)
  const ranges = getSpecialHolidays();
  for (const range of ranges) {
    if (currentFullDate >= range.startDate && currentFullDate <= range.endDate) {
      return range.name;
    }
  }

  // 3. ตรวจสอบวันหยุดคงที่ (Fixed)
  const fixedHoliday = FIXED_HOLIDAYS_BASE.find(h => h.date === currentShortDate);
  if (fixedHoliday) return fixedHoliday.name;

  // 4. ตรวจสอบวันหยุดตามปฏิทิน (Dynamic)
  if (DYNAMIC_HOLIDAYS[year]) {
    const dynamicHoliday = DYNAMIC_HOLIDAYS[year].find(h => `${year}-${h.date}` === currentFullDate || h.date === currentShortDate);
    if (dynamicHoliday) return dynamicHoliday.name;
  }

  return null;
};
