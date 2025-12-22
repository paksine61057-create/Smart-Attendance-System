
import React, { useState, useEffect } from 'react';
import { AppSettings, GeoLocation, Staff, SpecialHoliday } from '../types';
import { getSettings, saveSettings, clearRecords } from '../services/storageService';
import { getAccuratePosition, getDistanceFromLatLonInMeters, getCurrentPosition } from '../services/geoService';
import { getAllStaff, addStaff, removeStaff } from '../services/staffService';
import { getSpecialHolidays, addSpecialHolidayRange, removeSpecialHoliday } from '../services/holidayService';

interface SettingsProps {
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'staff' | 'holidays'>('general');
  const [settings, setSettingsState] = useState<AppSettings & { lockLocation?: boolean }>(getSettings());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [testDist, setTestDist] = useState<number | null>(null);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [newStaff, setNewStaff] = useState<Staff>({ id: '', name: '', role: '' });
  const [staffError, setStaffError] = useState('');

  const [holidayList, setHolidayList] = useState<SpecialHoliday[]>([]);
  const [newHolidayStartDate, setNewHolidayStartDate] = useState('');
  const [newHolidayEndDate, setNewHolidayEndDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  useEffect(() => {
    setStaffList(getAllStaff());
    setHolidayList(getSpecialHolidays());
  }, []);

  const handleSetCurrentLocation = async () => {
    setLoading(true);
    setIsError(false);
    setMsg('กำลังล็อกสัญญาณพิกัดที่แม่นยำที่สุด (โปรดรอสักครู่)...');
    try {
      const pos = await getAccuratePosition();
      const newLoc: GeoLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      setSettingsState(prev => ({ ...prev, officeLocation: newLoc, lockLocation: true }));
      setMsg(`ดึงพิกัดสำเร็จ! (แม่นยำ +/- ${Math.round(pos.coords.accuracy)} ม.)`);
      setTestDist(0);
    } catch (err: any) {
      setIsError(true);
      setMsg(err.message || 'ไม่พบสัญญาณ - โปรดเปิด GPS');
    } finally {
      setLoading(false);
    }
  };

  const handleTestDistance = async () => {
    if (!settings.officeLocation) return;
    setLoading(true);
    try {
        const pos = await getCurrentPosition();
        const dist = getDistanceFromLatLonInMeters(
            pos.coords.latitude, pos.coords.longitude,
            settings.officeLocation.lat, settings.officeLocation.lng
        );
        setTestDist(dist);
        setMsg(`ขณะนี้คุณอยู่ห่างจากจุดที่ตั้งไว้ประมาณ ${Math.round(dist)} เมตร`);
    } catch (err: any) {
        setIsError(true);
        setMsg(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleCoordinateChange = (field: 'lat' | 'lng', value: string) => {
    const numValue = parseFloat(value);
    setSettingsState(prev => ({
        ...prev,
        officeLocation: {
            lat: field === 'lat' ? (isNaN(numValue) ? 0 : numValue) : (prev.officeLocation?.lat || 0),
            lng: field === 'lng' ? (isNaN(numValue) ? 0 : numValue) : (prev.officeLocation?.lng || 0)
        },
        lockLocation: true // ถ้ามีการพิมพ์มือ ให้ล็อกพิกัดไว้อัตโนมัติ
    }));
  };

  const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setSettingsState(prev => ({ ...prev, maxDistanceMeters: isNaN(val) ? 0 : val }));
  };
  
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettingsState(prev => ({ ...prev, googleSheetUrl: e.target.value }));
  };

  // Fix: Added handleClearAllRecords to clear all local records with confirmation
  const handleClearAllRecords = () => {
    if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมดในเครื่อง? (ข้อมูลบน Cloud จะไม่หาย)')) {
      clearRecords();
      setMsg('ล้างข้อมูลในเครื่องทั้งหมดเรียบร้อยแล้ว');
      setIsError(false);
    }
  };

  // Fix: Added handleAddStaff to validate and save a new staff member
  const handleAddStaff = () => {
    setStaffError('');
    if (!newStaff.id.trim() || !newStaff.name.trim() || !newStaff.role.trim()) {
      setStaffError('กรุณากรอกข้อมูลบุคลากรให้ครบถ้วนทุกช่อง');
      return;
    }
    const success = addStaff(newStaff);
    if (success) {
      setStaffList(getAllStaff());
      setNewStaff({ id: '', name: '', role: '' });
      setMsg('บันทึกรายชื่อบุคลากรสำเร็จ');
      setIsError(false);
    } else {
      setStaffError('รหัสบุคลากรนี้มีอยู่ในระบบแล้ว โปรดตรวจสอบอีกครั้ง');
    }
  };

  // Fix: Added handleRemoveStaff to delete a staff member with confirmation
  const handleRemoveStaff = (id: string) => {
    if (window.confirm('คุณต้องการลบรายชื่อบุคลากรนี้ออกจากระบบใช่หรือไม่?')) {
      removeStaff(id);
      setStaffList(getAllStaff());
    }
  };

  // Fix: Added handleAddHoliday to validate and save a new holiday period
  const handleAddHoliday = () => {
    if (!newHolidayStartDate || !newHolidayName) {
      alert('กรุณาระบุวันที่เริ่มต้นและชื่อรายการวันหยุด');
      return;
    }
    const end = newHolidayEndDate || newHolidayStartDate;
    addSpecialHolidayRange(newHolidayStartDate, end, newHolidayName);
    setHolidayList(getSpecialHolidays());
    setNewHolidayStartDate('');
    setNewHolidayEndDate('');
    setNewHolidayName('');
    setMsg('บันทึกวันหยุดพิเศษสำเร็จ');
    setIsError(false);
  };

  // Fix: Added handleRemoveHoliday to delete a holiday entry with confirmation
  const handleRemoveHoliday = (id: string) => {
    if (window.confirm('ต้องการลบรายการวันหยุดนี้ใช่หรือไม่?')) {
      removeSpecialHoliday(id);
      setHolidayList(getSpecialHolidays());
    }
  };

  const saveAndClose = () => {
    saveSettings(settings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-2xl w-full p-0 relative overflow-hidden border border-white/50 flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-3">
              <span className="p-2 bg-stone-200 rounded-full text-stone-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.29 1.52 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </span>
              ตั้งค่าระบบ (Settings)
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex border-b border-stone-100 px-6 pt-2 overflow-x-auto bg-white sticky top-0 z-10">
          <button onClick={() => setActiveTab('general')} className={`pb-3 px-4 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === 'general' ? 'text-rose-600' : 'text-stone-400 hover:text-stone-600'}`}>
            ทั่วไป {activeTab === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600 rounded-t-full"></div>}
          </button>
          <button onClick={() => setActiveTab('staff')} className={`pb-3 px-4 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === 'staff' ? 'text-rose-600' : 'text-stone-400 hover:text-stone-600'}`}>
            บุคลากร {activeTab === 'staff' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600 rounded-t-full"></div>}
          </button>
          <button onClick={() => setActiveTab('holidays')} className={`pb-3 px-4 text-sm font-bold transition-all relative whitespace-nowrap ${activeTab === 'holidays' ? 'text-rose-600' : 'text-stone-400 hover:text-stone-600'}`}>
            วันหยุด/ปิดเทอม {activeTab === 'holidays' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-600 rounded-t-full"></div>}
          </button>
        </div>
        
        <div className="overflow-y-auto p-6 flex-1 bg-stone-50/30">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="p-6 bg-white rounded-3xl border border-stone-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>
                <h3 className="font-black text-stone-800 mb-4 text-sm uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    จุดลงเวลาโรงเรียน (Office Location)
                </h3>
                
                <div className="flex gap-3 mb-6">
                    <div className="flex-1">
                        <label className="text-[10px] font-black text-stone-400 mb-1.5 block uppercase">ละติจูด (Latitude)</label>
                        <input type="number" step="any" value={settings.officeLocation?.lat || ''} onChange={(e) => handleCoordinateChange('lat', e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl text-stone-800 font-mono text-sm outline-none focus:border-rose-300 transition-all" placeholder="13.xxxxxx" />
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] font-black text-stone-400 mb-1.5 block uppercase">ลองจิจูด (Longitude)</label>
                        <input type="number" step="any" value={settings.officeLocation?.lng || ''} onChange={(e) => handleCoordinateChange('lng', e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl text-stone-800 font-mono text-sm outline-none focus:border-rose-300 transition-all" placeholder="100.xxxxxx" />
                    </div>
                </div>

                <div className="flex items-center gap-3 mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <input 
                      type="checkbox" 
                      id="lockLoc" 
                      checked={settings.lockLocation} 
                      onChange={(e) => setSettingsState(prev => ({ ...prev, lockLocation: e.target.checked }))}
                      className="w-5 h-5 rounded accent-blue-600"
                    />
                    <label htmlFor="lockLoc" className="text-xs font-black text-blue-800 cursor-pointer">
                        🔒 ล็อกพิกัด (ห้ามพิกัดจาก Cloud มาทับค่าที่ตั้งไว้นี้)
                    </label>
                </div>

                <div className="space-y-3">
                    <button 
                        onClick={handleSetCurrentLocation} 
                        disabled={loading} 
                        className={`w-full py-4 rounded-2xl transition-all flex items-center justify-center gap-3 font-black text-sm shadow-lg active:scale-[0.98]
                        ${loading ? 'bg-stone-200 text-stone-500' : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700'}`}
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-3 border-t-white border-white/30 rounded-full animate-spin"></div>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        )}
                        {loading ? 'กำลังระบุพิกัด...' : 'ดึงพิกัดปัจจุบันใส่ในช่อง (GPS)'}
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={handleTestDistance}
                            disabled={loading || !settings.officeLocation}
                            className="py-3 border-2 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-2xl transition-all flex items-center justify-center gap-2 font-black text-xs disabled:opacity-50"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            ทดสอบระยะห่าง
                        </button>
                        <a 
                            href={`https://www.google.com/maps?q=${settings.officeLocation?.lat},${settings.officeLocation?.lng}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="py-3 border-2 border-stone-100 text-stone-500 hover:bg-stone-50 rounded-2xl transition-all flex items-center justify-center gap-2 font-bold text-xs"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            ดูใน Maps
                        </a>
                    </div>
                </div>
                
                {msg && (
                    <p className={`text-[11px] mt-4 text-center font-black p-3 rounded-xl border animate-in slide-in-from-top-2
                    ${isError ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                        {isError ? '❌ ' : '✅ '}{msg}
                    </p>
                )}
              </div>

              <div className="p-6 bg-white rounded-3xl border border-stone-100 shadow-sm">
                 <h3 className="font-black text-stone-800 mb-6 text-sm uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    การตั้งค่ารัศมีและเซิร์ฟเวอร์
                 </h3>
                 <div className="mb-6">
                    <label className="block text-[10px] font-black text-stone-400 mb-2 uppercase tracking-widest">รัศมีลงเวลาสูงสุด (เมตร)</label>
                    <div className="relative">
                        <input type="number" value={settings.maxDistanceMeters} onChange={handleDistanceChange} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl outline-none font-black text-rose-600 focus:border-rose-300" />
                        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-sm">m.</span>
                    </div>
                    <p className="text-[9px] text-stone-400 mt-2 italic font-bold">* แนะนำที่ 100 เมตร เพื่อรองรับความคลาดเคลื่อนของ GPS มือถือบางรุ่น</p>
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-stone-400 mb-2 uppercase tracking-widest">Google Apps Script URL (Sync Cloud)</label>
                    <input type="text" value={settings.googleSheetUrl || ''} onChange={handleUrlChange} placeholder="https://script.google.com/macros/s/..." className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl outline-none text-[10px] font-mono focus:border-rose-300" />
                 </div>
              </div>

              <div className="p-6 bg-rose-50 rounded-3xl border-2 border-rose-100 shadow-sm">
                 <h3 className="font-black text-rose-800 mb-2 text-xs uppercase tracking-widest flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    เขตอันตราย (Danger Zone)
                 </h3>
                 <p className="text-[10px] text-rose-700/60 font-bold mb-4 italic">การล้างข้อมูลจะลบเฉพาะข้อมูล "ที่เก็บไว้ในเครื่องนี้" เท่านั้น ไม่กระทบบน Google Sheets</p>
                 <button onClick={handleClearAllRecords} className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-sm shadow-lg transition-all active:scale-[0.98]">ล้างข้อมูลในเครื่องทั้งหมด 🗑️</button>
              </div>
            </div>
          )}

          {activeTab === 'staff' && (
             <div className="space-y-6">
                <div className="p-6 bg-white rounded-3xl border border-stone-100 shadow-sm">
                    <h3 className="font-black text-stone-800 mb-4 text-sm uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        เพิ่มบุคลากรใหม่
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                        <input type="text" placeholder="รหัสบุคลากร" value={newStaff.id} onChange={e => setNewStaff({...newStaff, id: e.target.value})} className="p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl text-sm font-bold focus:border-emerald-300 outline-none" />
                        <input type="text" placeholder="ชื่อ-นามสกุล" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl text-sm font-bold focus:border-emerald-300 outline-none" />
                        <input type="text" placeholder="ตำแหน่ง" value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl text-sm font-bold focus:border-emerald-300 outline-none" />
                    </div>
                    {staffError && <p className="text-rose-500 text-[10px] font-black mt-2 mb-2 ml-1">❌ {staffError}</p>}
                    <button onClick={handleAddStaff} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-sm font-black shadow-lg transition-all">+ บันทึกรายชื่อ</button>
                </div>
                <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] text-stone-400 font-black uppercase bg-stone-50 border-b">
                            <tr><th className="px-6 py-4">ID</th><th className="px-6 py-4">Name</th><th className="px-6 py-4">Role</th><th className="px-6 py-4 text-right">Action</th></tr>
                        </thead>
                        <tbody className="divide-y divide-stone-50">
                            {staffList.map((s) => (
                                <tr key={s.id} className="hover:bg-stone-50 transition-colors">
                                    <td className="px-6 py-4 font-black text-stone-400">{s.id}</td>
                                    <td className="px-6 py-4 font-bold text-stone-700">{s.name}</td>
                                    <td className="px-6 py-4 text-[10px] font-black text-stone-400 uppercase tracking-tighter">{s.role}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleRemoveStaff(s.id)} className="text-stone-300 hover:text-rose-500 transition-colors p-2 bg-stone-50 rounded-xl hover:bg-rose-50">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>
          )}

          {activeTab === 'holidays' && (
             <div className="space-y-6">
                <div className="p-6 bg-white rounded-3xl border border-stone-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12"><svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></div>
                    <h3 className="font-black text-stone-800 mb-4 text-sm uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        เพิ่มช่วงวันหยุด / ปิดเทอม 🏖️
                    </h3>
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-6">
                        <p className="text-[10px] text-amber-700 font-bold leading-relaxed italic">
                            💡 วันเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์ตามประกาศรัฐบาล <span className="underline">ระบบจะตรวจสอบให้โดยอัตโนมัติ</span> คุณเพียงแค่เพิ่มวันหยุดเฉพาะของโรงเรียนเท่านั้น เช่น "ปิดเทอม" หรือ "วันหยุดกรณีพิเศษ"
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="text-[10px] font-black text-stone-400 mb-1.5 block uppercase tracking-widest">วันที่เริ่มต้น</label>
                            <input type="date" value={newHolidayStartDate} onChange={e => setNewHolidayStartDate(e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold focus:border-blue-300 outline-none" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-stone-400 mb-1.5 block uppercase tracking-widest">วันที่สิ้นสุด (ถ้าหยุดวันเดียวไม่ต้องใส่)</label>
                            <input type="date" value={newHolidayEndDate} onChange={e => setNewHolidayEndDate(e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold focus:border-blue-300 outline-none" />
                        </div>
                    </div>
                    <div className="mb-6">
                        <label className="text-[10px] font-black text-stone-400 mb-1.5 block uppercase tracking-widest">ชื่อรายการวันหยุด (เช่น ปิดเทอมภาคฤดูหนาว)</label>
                        <input type="text" placeholder="พิมพ์ชื่อวันหยุด..." value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold focus:border-blue-300 outline-none" />
                    </div>
                    <button onClick={handleAddHoliday} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-black shadow-lg transition-all active:scale-[0.98]">+ บันทึกวันหยุดพิเศษ</button>
                </div>

                <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] text-stone-400 font-black uppercase bg-stone-50 border-b">
                                <tr>
                                    <th className="px-6 py-4">ช่วงเวลา (Period)</th>
                                    <th className="px-6 py-4">ชื่อรายการ (Label)</th>
                                    <th className="px-6 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                                {holidayList.length === 0 && (
                                    <tr><td colSpan={3} className="px-6 py-12 text-center text-stone-300 text-[10px] font-black uppercase italic tracking-widest">ยังไม่มีวันหยุดพิเศษเพิ่มในระบบ</td></tr>
                                )}
                                {holidayList.map((h) => (
                                    <tr key={h.id} className="hover:bg-stone-50 transition-colors group">
                                        <td className="px-6 py-4 font-mono text-[11px] text-stone-800 leading-tight">
                                            <div className="flex flex-col">
                                                <span className="font-black text-blue-600">{new Date(h.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                {h.endDate !== h.startDate && (
                                                    <span className="text-[9px] text-stone-400 font-bold uppercase mt-1">ถึง {new Date(h.endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-stone-700 font-black text-sm">{h.name}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleRemoveHoliday(h.id)} className="text-stone-300 hover:text-rose-500 transition-colors p-2 bg-stone-50 rounded-xl hover:bg-rose-50">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
             </div>
          )}
        </div>

        <div className="p-6 bg-white border-t border-stone-100 flex gap-4 sticky bottom-0 z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          <button onClick={saveAndClose} className="flex-1 px-6 py-5 bg-stone-900 text-white rounded-2xl hover:bg-stone-800 font-black text-sm transition-all shadow-xl active:scale-[0.98]">บันทึกการตั้งค่าและปิด ⛄</button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
