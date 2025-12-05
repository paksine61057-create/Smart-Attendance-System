
import { Staff } from '../types';

const STAFF_STORAGE_KEY = 'school_checkin_staff_list';

const DEFAULT_STAFF_LIST: Staff[] = [
  { id: 'PJ001', name: 'นางชัชตะวัน สีเขียว', role: 'ผู้อำนวยการ' },
  { id: 'PJ002', name: 'นายภราดร คัณทักษ์', role: 'รองผู้อำนวยการ' },
  { id: 'PJ003', name: 'นางทิวาวรรณ กองแก้ว', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ004', name: 'นายบุญจันทร์ สุวรรณพรม', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ005', name: 'นายอภิชาติ ชุมพล', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ006', name: 'นายภาคภูมิ พงษ์สิทธิศักดิ์', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ007', name: 'นางวัชรี พิมพ์ศรี', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ008', name: 'นางบุญญาภรณ์ ธิตานนท์', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ009', name: 'นางสาวอัญชนีย์ วงศ์วาน', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ010', name: 'นางวลัยรัตน์ แนวบุตร', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ011', name: 'นายยุทธไกร อ่างแก้ว', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ012', name: 'นางสาวเสาวภา สิงหเสนา', role: 'ครูชำนาญการพิเศษ' },
  { id: 'PJ013', name: 'นางสาวกันต์ฤทัย นามมาลา', role: 'ครูชำนาญการ' },
  { id: 'PJ014', name: 'นางสาวสุภาภรณ์ ลัพธะลักษ์', role: 'ครูชำนาญการ' },
  { id: 'PJ015', name: 'นายจักรพงษ์ ไชยราช', role: 'ครู' },
  { id: 'PJ016', name: 'ว่าที่ ร.ต.วิษณุ โสภา', role: 'ครู' },
  { id: 'PJ017', name: 'นายบุญเสริม สาทไทสงค์', role: 'ครู' },
  { id: 'PJ018', name: 'นายอุดมวิทย์ บุพิ', role: 'ครู' },
  { id: 'PJ019', name: 'นายพงษ์เพชร แซ่ตั้ง', role: 'ครู' },
  { id: 'PJ020', name: 'นางสาวชลฎา บุตรเนียน', role: 'ครูผู้ช่วย' },
  { id: 'PJ021', name: 'นางสาวปภัสพ์มณ ทองอาสา', role: 'ครูผู้ช่วย' },
  { id: 'PJ022', name: 'นายศราวุธ ศรีวงราช', role: 'ลูกจ้างประจำ' },
  { id: 'PJ023', name: 'นางสาวตรีนัทธิ์ธนา บุญโท', role: 'ครูธุรการ' },
  { id: 'PJ024', name: 'นางสาวศิรินภา นาแว่น', role: 'ครูอัตราจ้าง' },
  { id: 'PJ025', name: 'นายวชิรวิทย์ นันทชัย', role: 'ครูอัตราจ้าง' }
];

export const getAllStaff = (): Staff[] => {
  const stored = localStorage.getItem(STAFF_STORAGE_KEY);
  if (stored) {
    let list = JSON.parse(stored) as Staff[];
    
    // *** ระบบแก้คำผิดอัตโนมัติ (Auto-fix typo) ***
    // ตรวจสอบว่ามีชื่อเก่าค้างอยู่หรือไม่ ถ้ามีให้แก้แล้วบันทึกทับทันที
    let changed = false;
    const pj023Index = list.findIndex(s => s.id === 'PJ023');
    
    // เช็คกรณีชื่อเป็น "ตรีนัทธ์ธนา" (แบบผิด)
    if (pj023Index !== -1 && list[pj023Index].name.includes('ตรีนัทธ์ธนา')) {
        list[pj023Index].name = 'นางสาวตรีนัทธิ์ธนา บุญโท';
        changed = true;
    }
    
    if (changed) {
        localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(list));
        console.log('Fixed typo for PJ023 in localStorage');
    }

    return list;
  }
  // Initialize default if empty
  localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(DEFAULT_STAFF_LIST));
  return DEFAULT_STAFF_LIST;
};

export const getStaffById = (id: string): Staff | undefined => {
  const staffList = getAllStaff();
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
