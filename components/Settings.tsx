
import React, { useState, useEffect } from 'react';
import { AppSettings, GeoLocation, Staff, SpecialHoliday } from '../types';
import { getSettings, saveSettings, clearRecords } from '../services/storageService';
import { getCurrentPosition } from '../services/geoService';
import { getAllStaff, addStaff, removeStaff } from '../services/staffService';
import { getSpecialHolidays, addSpecialHolidayRange, removeSpecialHoliday } from '../services/holidayService';

interface SettingsProps {
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'staff' | 'holidays'>('general');
  const [settings, setSettingsState] = useState<AppSettings>(getSettings());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Staff Management State
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [newStaff, setNewStaff] = useState<Staff>({ id: '', name: '', role: '' });
  const [staffError, setStaffError] = useState('');

  // Holiday Management State
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
    setMsg('กำลังค้นหาสัญญาณ GPS...');
    try {
      const pos = await getCurrentPosition();
      const newLoc: GeoLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      const newSettings = { ...settings, officeLocation: newLoc };
      setSettingsState(newSettings);
      setMsg('ดึงพิกัดปัจจุบันเรียบร้อย');
    } catch (err) {
      setMsg('ไม่พบสัญญาณ - โปรดเปิด GPS');
    } finally {
      setLoading(false);
    }
  };

  const handleCoordinateChange = (field: 'lat' | 'lng', value: string) => {
    const numValue = parseFloat(value);
    setSettingsState(prev => ({
        ...prev,
        officeLocation: {
            lat: field === 'lat' ? numValue : (prev.officeLocation?.lat || 0),
            lng: field === 'lng' ? numValue : (prev.officeLocation?.lng || 0)
        }
    }));
  };

  const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setSettingsState(prev => ({ ...prev, maxDistanceMeters: val }));
  };
  
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettingsState(prev => ({ ...prev, googleSheetUrl: e.target.value }));
  };

  const handleAddStaff = () => {
    if (!newStaff.id || !newStaff.name || !newStaff.role) {
      setStaffError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    const success = addStaff(newStaff);
    if (success) {
      setStaffList(getAllStaff());
      setNewStaff({ id: '', name: '', role: '' });
      setStaffError('');
    } else {
      setStaffError('รหัสบุคลากรนี้มีอยู่ในระบบแล้ว');
    }
  };

  const handleRemoveStaff = (id: string) => {
    if (confirm('ยืนยันการลบบุคลากรนี้?')) {
      removeStaff(id);
      setStaffList(getAllStaff());
    }
  };

  const handleAddHoliday = () => {
    if (!newHolidayStartDate || !newHolidayName) {
        alert('กรุณากรอกวันที่เริ่มต้นและชื่อวันหยุด');
        return;
    }
    // If end date is empty, assume single day
    const endDate = newHolidayEndDate || newHolidayStartDate;
    
    const success = addSpecialHolidayRange(newHolidayStartDate, endDate, newHolidayName);
    if (success) {
        setHolidayList(getSpecialHolidays());
        setNewHolidayName('');
        setNewHolidayStartDate('');
        setNewHolidayEndDate('');
    }
  };

  const handleRemoveHoliday = (id: string) => {
      if (confirm('ลบวันหยุดนี้?')) {
          removeSpecialHoliday(id);
          setHolidayList(getSpecialHolidays());
      }
  };

  const handleClearAllRecords = () => {
    if (confirm('⚠️ คำเตือน: คุณต้องการลบข้อมูลการลงเวลาทั้งหมดในเครื่องนี้ใช่หรือไม่?')) {
        clearRecords();
        alert('ล้างข้อมูลเรียบร้อยแล้ว');
        window.location.reload();
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
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex border-b border-stone-100 px-6 pt-2 overflow-x-auto">
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
              <div className="p-6 bg-white rounded-2xl border border-stone-100 shadow-sm">
                <h3 className="font-bold text-stone-400 mb-3 text-xs uppercase tracking-widest">จุดลงเวลา (Location)</h3>
                <div className="flex gap-3 mb-4">
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-stone-400 mb-1 block">ละติจูด</label>
                        <input type="number" step="any" value={settings.officeLocation?.lat || ''} onChange={(e) => handleCoordinateChange('lat', e.target.value)} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 font-mono text-sm outline-none focus:ring-2 focus:ring-rose-200" placeholder="13.xxxxxx" />
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-stone-400 mb-1 block">ลองจิจูด</label>
                        <input type="number" step="any" value={settings.officeLocation?.lng || ''} onChange={(e) => handleCoordinateChange('lng', e.target.value)} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 font-mono text-sm outline-none focus:ring-2 focus:ring-rose-200" placeholder="100.xxxxxx" />
                    </div>
                </div>
                <button onClick={handleSetCurrentLocation} disabled={loading} className="w-full bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 py-3 rounded-xl transition-all flex items-center justify-center gap-2 font-bold text-sm">
                  {loading ? 'Locating...' : 'ดึงพิกัดปัจจุบันใส่ในช่อง'}
                </button>
                {msg && <p className="text-[10px] text-emerald-600 mt-3 text-center font-bold">{msg}</p>}
              </div>

              <div className="p-6 bg-white rounded-2xl border border-stone-100 shadow-sm">
                 <h3 className="font-bold text-stone-400 mb-3 text-xs uppercase tracking-widest">การตั้งค่าทั่วไป</h3>
                 <div className="mb-4">
                    <label className="block text-xs font-bold text-stone-500 mb-2">ระยะห่างสูงสุด (เมตร)</label>
                    <input type="number" value={settings.maxDistanceMeters} onChange={handleDistanceChange} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none font-bold" />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-stone-500 mb-2">Google Apps Script URL</label>
                    <input type="text" value={settings.googleSheetUrl || ''} onChange={handleUrlChange} placeholder="https://script.google.com/macros/s/..." className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none text-xs" />
                 </div>
              </div>

              <div className="p-6 bg-red-50 rounded-2xl border border-red-100 shadow-sm">
                 <h3 className="font-bold text-red-400 mb-2 text-xs uppercase tracking-widest">อันตราย</h3>
                 <button onClick={handleClearAllRecords} className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm shadow-md transition-all">ล้างข้อมูลทั้งหมด</button>
              </div>
            </div>
          )}

          {activeTab === 'staff' && (
             <div className="space-y-6">
                <div className="p-4 bg-white rounded-2xl border border-stone-100 shadow-sm">
                    <h3 className="font-bold text-stone-400 mb-3 text-xs uppercase tracking-widest">เพิ่มบุคลากรใหม่</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input type="text" placeholder="รหัส" value={newStaff.id} onChange={e => setNewStaff({...newStaff, id: e.target.value})} className="p-3 bg-stone-50 border rounded-xl text-sm" />
                        <input type="text" placeholder="ชื่อ-นามสกุล" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="p-3 bg-stone-50 border rounded-xl text-sm" />
                        <input type="text" placeholder="ตำแหน่ง" value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="p-3 bg-stone-50 border rounded-xl text-sm" />
                    </div>
                    {staffError && <p className="text-red-500 text-xs mt-2">{staffError}</p>}
                    <button onClick={handleAddStaff} className="mt-3 w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold">+ เพิ่มรายชื่อ</button>
                </div>
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b">
                            <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 text-right">Action</th></tr>
                        </thead>
                        <tbody className="divide-y">
                            {staffList.map((s) => (
                                <tr key={s.id} className="hover:bg-stone-50">
                                    <td className="px-4 py-3 font-medium">{s.id}</td><td className="px-4 py-3">{s.name}</td><td className="px-4 py-3 text-xs">{s.role}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => handleRemoveStaff(s.id)} className="text-red-400 hover:text-red-600 p-1"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
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
                <div className="p-4 bg-white rounded-2xl border border-stone-100 shadow-sm">
                    <h3 className="font-bold text-stone-400 mb-3 text-xs uppercase tracking-widest">เพิ่มช่วงวันหยุด / ปิดเทอม 🏝️</h3>
                    <p className="text-[10px] text-stone-500 mb-4 bg-amber-50 p-2 rounded-lg border border-amber-100">วันเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์ ระบบจะตรวจสอบให้โดยอัตโนมัติ คุณไม่ต้องเพิ่มเอง</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className="text-[10px] font-black text-stone-400 mb-1 block">วันที่เริ่มต้น</label>
                            <input type="date" value={newHolidayStartDate} onChange={e => setNewHolidayStartDate(e.target.value)} className="p-3 bg-stone-50 border rounded-xl text-sm w-full" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-stone-400 mb-1 block">วันที่สิ้นสุด (เว้นไว้ถ้าหยุดวันเดียว)</label>
                            <input type="date" value={newHolidayEndDate} onChange={e => setNewHolidayEndDate(e.target.value)} className="p-3 bg-stone-50 border rounded-xl text-sm w-full" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-stone-400 mb-1 block">ชื่อรายการ (เช่น ปิดเทอมภาคเรียนที่ 1)</label>
                        <input type="text" placeholder="ระบุชื่อวันหยุด..." value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} className="p-3 bg-stone-50 border rounded-xl text-sm w-full" />
                    </div>
                    <button onClick={handleAddHoliday} className="mt-4 w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-bold transition-all shadow-md">+ บันทึกช่วงวันหยุด</button>
                </div>

                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b">
                                <tr>
                                    <th className="px-4 py-3">ช่วงเวลา</th>
                                    <th className="px-4 py-3">รายการ</th>
                                    <th className="px-4 py-3 text-right">ลบ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {holidayList.length === 0 && (
                                    <tr><td colSpan={3} className="px-4 py-10 text-center text-stone-400 text-xs italic">ยังไม่มีการกำหนดวันหยุดพิเศษเพิ่ม</td></tr>
                                )}
                                {holidayList.map((h) => (
                                    <tr key={h.id} className="hover:bg-stone-50">
                                        <td className="px-4 py-3 font-mono text-[10px] text-stone-800 leading-tight">
                                            {new Date(h.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            {h.endDate !== h.startDate && (
                                                <> <br/> ถึง <br/> {new Date(h.endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-stone-600 font-bold">{h.name}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button onClick={() => handleRemoveHoliday(h.id)} className="text-red-400 hover:text-red-600 p-1"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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

        <div className="p-6 bg-white border-t border-stone-100">
          <button onClick={saveAndClose} className="w-full px-6 py-4 bg-stone-900 text-white rounded-xl hover:bg-stone-800 font-bold text-sm transition-all shadow-lg">บันทึกและปิด</button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
