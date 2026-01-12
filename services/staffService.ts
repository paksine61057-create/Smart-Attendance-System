
import { Staff } from '../types';

const STAFF_STORAGE_KEY = 'school_checkin_staff_list';

const DEFAULT_STAFF_LIST: Staff[] = [
  { id: 'PJ001', name: 'นางชัชตะวัน สีเขียว', role: 'ผู้อำนวยการ', birthday: '20/02/2513' },
  { id: 'PJ002', name: 'นายภราดร คัณทักษ์', role: 'รองผู้อำนวยการ', birthday: '08/07/2525' },
  { id: 'PJ003', name: 'นางทิวาวรรณ กองแก้ว', role: 'ครูชำนาญการพิเศษ', birthday: '24/10/2513' },
  { id: 'PJ004', name: 'นายบุญจันทร์ สุวรรณพรม', role: 'ครูชำนาญการพิเศษ', birthday: '26/05/2523' },
  { id: 'PJ005', name: 'นายอภิชาติ ชุมพล', role: 'ครูชำนาญการพิเศษ', birthday: '01/07/2531' },
  { id: 'PJ006', name: 'นายภาคภูมิ พงษ์สิทธิศักดิ์', role: 'ครูชำนาญการพิเศษ', birthday: '24/05/2509' },
  { id: 'PJ007', name: 'นางวัชรี พิมพ์ศรี', role: 'ครูชำนาญการพิเศษ', birthday: '04/02/2510' },
  { id: 'PJ008', name: 'นางบุญญาภรณ์ ธิตานนท์', role: 'ครูชำนาญการพิเศษ', birthday: '08/10/2511' },
  { id: 'PJ009', name: 'นางสาวอัญชนีย์ วงศ์วาน', role: 'ครูชำนาญการพิเศษ', birthday: '21/09/2512' },
  { id: 'PJ010', name: 'นางวลัยรัตน์ แนวบุตร', role: 'ครูชำนาญการพิเศษ', birthday: '11/01/2514' },
  { id: 'PJ011', name: 'นายยุทธไกร อ่างแก้ว', role: 'ครูชำนาญการพิเศษ', birthday: '29/03/2523' },
  { id: 'PJ012', name: 'นางสาวเสาวภา สิงหเสนา', role: 'ครูชำนาญการพิเศษ', birthday: '26/08/2531' },
  { id: 'PJ013', name: 'นางสาวกันต์ฤทัย นามมาลา', role: 'ครูชำนาญการ', birthday: '02/02/2527' },
  { id: 'PJ014', name: 'นางสาวสุภาภรณ์ ลัพธะลักษ์', role: 'ครูชำนาญการ', birthday: '22/06/2535' },
  { id: 'PJ018', name: 'นายอุดมวิทย์ บุพิ', role: 'ครู', birthday: '12/11/2538' }, // ขยับขึ้นมาลำดับที่ 15 (Index 14)
  { id: 'PJ015', name: 'นายจักรพงษ์ ไชยราช', role: 'ครู', birthday: '16/12/2536' },
  { id: 'PJ016', name: 'ว่าที่ ร.ต.วิษณุ โสภา', role: 'ครู', birthday: '28/10/2532' },
  { id: 'PJ017', name: 'นายบุญเสริม สาทไทสงค์', role: 'ครู', birthday: '09/09/2539' },
  { id: 'PJ019', name: 'นายพงษ์เพชร แซ่ตั้ง', role: 'ครู', birthday: '18/02/2541' },
  { id: 'PJ020', name: 'นางสาวชลฎา บุตรเนียน', role: 'ครู', birthday: '21/01/2542' },
  { id: 'PJ021', name: 'นางสาวปภัสพ์มณ ทองอาสา', role: 'ครูผู้ช่วย', birthday: '12/07/2539' },
  { id: 'PJ022', name: 'นายศราวุธ ศรีวงราช', role: 'ลูกจ้างประจำ', birthday: '08/08/2510' },
  { id: 'PJ023', name: 'นางสาวตรีนัทธิ์ธนา บุญโท', role: 'ครูธุรการ', birthday: '03/08/2534' },
  { id: 'PJ024', name: 'นางสาวศิรินภา นาแว่น', role: 'ครูอัตราจ้าง', birthday: '08/01/2542' },
  { id: 'PJ025', name: 'นายวชิรวิทย์ นันทชัย', role: 'ครูอัตราจ้าง', birthday: '07/01/2545' }
];

export const getAllStaff = (forDate: Date = new Date()): Staff[] => {
  const stored = localStorage.getItem(STAFF_STORAGE_KEY);
  let list: Staff[] = [];
  
  if (stored) {
    list = JSON.parse(stored) as Staff[];
    
    // *** ระบบอัปเดตข้อมูลและลำดับอัตโนมัติ ***
    let changed = false;

    // ตรวจสอบความถูกต้องของข้อมูลพื้นฐานและอัปเดตหากมีการเปลี่ยนแปลงใน DEFAULT_STAFF_LIST
    DEFAULT_STAFF_LIST.forEach((defStaff, index) => {
      const existingIdx = list.findIndex(s => s.id === defStaff.id);
      if (existingIdx !== -1) {
        // อัปเดตข้อมูลวันเกิดหากไม่ตรง
        if (list[existingIdx].birthday !== defStaff.birthday) {
          list[existingIdx].birthday = defStaff.birthday;
          changed = true;
        }
        // อัปเดตตำแหน่ง PJ020
        if (defStaff.id === 'PJ020' && list[existingIdx].role !== 'ครู') {
          list[existingIdx].role = 'ครู';
          changed = true;
        }
      } else {
        // เพิ่มรายชื่อใหม่ที่ยังไม่มีใน Storage
        list.push(defStaff);
        changed = true;
      }
    });

    // บังคับการเรียงลำดับใหม่ตาม DEFAULT_STAFF_LIST หากเป็นรายชื่อดั้งเดิม (PJ001-PJ025)
    // เพื่อให้ลำดับในตารางรายงาน (เช่น ลำดับที่ 15 ของ PJ018) แสดงผลถูกต้องสำหรับผู้ใช้เดิม
    const sortedList: Staff[] = [];
    DEFAULT_STAFF_LIST.forEach(def => {
      const match = list.find(s => s.id === def.id);
      if (match) sortedList.push(match);
    });
    // เพิ่มรายชื่ออื่นๆ ที่อาจถูกแอดเพิ่มเองภายหลัง (ถ้ามี)
    list.forEach(s => {
      if (!DEFAULT_STAFF_LIST.some(def => def.id === s.id)) sortedList.push(s);
    });

    if (changed || JSON.stringify(list) !== JSON.stringify(sortedList)) {
        list = sortedList;
        localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(list));
    }
  } else {
    list = [...DEFAULT_STAFF_LIST];
    localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(list));
  }

  // ปรับตำแหน่งตามเงื่อนไขเวลา (PJ018)
  return list.map(s => {
    if (s.id === 'PJ018') {
      const threshold = new Date(2026, 0, 12); // 12 มกราคม 2569 (JS Months are 0-indexed)
      return {
        ...s,
        role: forDate >= threshold ? 'ครูชำนาญการ' : 'ครู'
      };
    }
    return s;
  });
};

export const getStaffById = (id: string, forDate: Date = new Date()): Staff | undefined => {
  const staffList = getAllStaff(forDate);
  return staffList.find(staff => staff.id.toUpperCase() === id.toUpperCase());
};

export const addStaff = (staff: Staff): boolean => {
  const staffList = getAllStaff();
  if (staffList.some(s => s.id.toUpperCase() === staff.id.toUpperCase())) {
    return false; // Duplicate ID
  }
  const newList = [...staffList, staff];
  localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(newList));
  return true;
};

export const removeStaff = (id: string) => {
  const staffList = getAllStaff();
  const newList = staffList.filter(s => s.id !== id);
  localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(newList));
};
