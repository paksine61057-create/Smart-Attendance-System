
export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

// ปฏิทินวันหยุดราชการ ปี 2568 (2025)
const THAI_HOLIDAYS_2025: Holiday[] = [
  { date: '2025-01-01', name: 'วันขึ้นปีใหม่' },
  { date: '2025-02-12', name: 'วันมาฆบูชา' },
  { date: '2025-04-06', name: 'วันจักรี' },
  { date: '2025-04-07', name: 'วันหยุดชดเชยวันจักรี' },
  { date: '2025-04-13', name: 'วันสงกรานต์' },
  { date: '2025-04-14', name: 'วันสงกรานต์' },
  { date: '2025-04-15', name: 'วันสงกรานต์' },
  { date: '2025-04-16', name: 'วันหยุดชดเชยวันสงกรานต์' },
  { date: '2025-05-01', name: 'วันแรงงานแห่งชาติ' },
  { date: '2025-05-04', name: 'วันฉัตรมงคล' },
  { date: '2025-05-05', name: 'วันหยุดชดเชยวันฉัตรมงคล' },
  { date: '2025-05-11', name: 'วันวิสาขบูชา' },
  { date: '2025-05-12', name: 'วันหยุดชดเชยวันวิสาขบูชา' },
  { date: '2025-06-03', name: 'วันเฉลิมพระชนมพรรษาพระราชินี' },
  { date: '2025-07-10', name: 'วันอาสาฬหบูชา' },
  { date: '2025-07-11', name: 'วันเข้าพรรษา' },
  { date: '2025-07-28', name: 'วันเฉลิมพระชนมพรรษาในหลวง ร.10' },
  { date: '2025-08-12', name: 'วันแม่แห่งชาติ' },
  { date: '2025-10-13', name: 'วันนวมินทรมหาราช' },
  { date: '2025-10-23', name: 'วันปิยมหาราช' },
  { date: '2025-12-05', name: 'วันพ่อแห่งชาติ' },
  { date: '2025-12-10', name: 'วันรัฐธรรมนูญ' },
  { date: '2025-12-31', name: 'วันสิ้นปี' }
];

export const getHoliday = (date: Date): string | null => {
  // Format local date to YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  const holiday = THAI_HOLIDAYS_2025.find(h => h.date === dateString);
  return holiday ? holiday.name : null;
};
