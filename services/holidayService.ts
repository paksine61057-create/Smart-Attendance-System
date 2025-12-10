
export interface Holiday {
  date: string; // MM-DD for fixed, YYYY-MM-DD for specific
  name: string;
}

// 1. วันหยุดคงที่ (Fixed Holidays) - ตรงกันทุกปี
// รูปแบบ: MM-DD (เดือน-วัน)
const FIXED_HOLIDAYS_BASE = [
  { date: '01-01', name: 'วันขึ้นปีใหม่' },
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

// 2. วันหยุดตามปฏิทินจันทรคติ & วันหยุดชดเชยเฉพาะปี (Dynamic Holidays)
// ต้องระบุปี YYYY-MM-DD (เพิ่มข้อมูลปี 2026 ให้ล่วงหน้า)
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
  2026: [ // ข้อมูลปีหน้า (2569)
    { date: '03-03', name: 'วันมาฆบูชา' },
    { date: '04-06', name: 'วันจักรี' }, // ตรงวันจันทร์ ไม่ต้องชดเชย
    { date: '05-26', name: 'วันวิสาขบูชา' }, // โดยประมาณ
    { date: '07-29', name: 'วันอาสาฬหบูชา' }, // โดยประมาณ
    { date: '07-30', name: 'วันเข้าพรรษา' },
  ]
};

export const getHoliday = (date: Date): string | null => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  const currentFullDate = `${year}-${month}-${day}`;
  const currentShortDate = `${month}-${day}`;

  // 1. ตรวจสอบวันหยุดคงที่ (ใช้ได้ทุกปี)
  const fixedHoliday = FIXED_HOLIDAYS_BASE.find(h => h.date === currentShortDate);
  if (fixedHoliday) {
    return fixedHoliday.name;
  }

  // 2. ตรวจสอบวันหยุดเฉพาะปี (เช่น วันพระใหญ่ หรือวันชดเชยที่ประกาศล่วงหน้า)
  if (DYNAMIC_HOLIDAYS[year]) {
    const dynamicHoliday = DYNAMIC_HOLIDAYS[year].find(h => h.date === currentShortDate);
    if (dynamicHoliday) {
      return dynamicHoliday.name;
    }
  }

  // 3. (Optional) Logic คำนวณชดเชยอัตโนมัติสำหรับวันหยุดคงที่
  // ถ้าวันหยุดราชการตรงกับเสาร์/อาทิตย์ -> วันจันทร์มักเป็นวันหยุดชดเชย
  // ตรวจสอบว่า "เมื่อวาน" หรือ "เมื่อวานซืน" เป็นวันหยุดคงที่ และเป็น เสาร์/อาทิตย์ หรือไม่
  /* 
     หมายเหตุ: การเปิดใช้ Logic นี้อาจมีความเสี่ยงผิดพลาดหากรัฐบาลประกาศไม่หยุดชดเชย 
     ดังนั้นวิธีที่แม่นยำที่สุดคือการใส่ข้อมูลใน DYNAMIC_HOLIDAYS แบบข้อ 2
  */

  return null;
};
