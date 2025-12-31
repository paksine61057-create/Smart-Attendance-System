
import React, { useState, useEffect } from 'react';
import { AppSettings, Staff, SpecialHoliday } from '../types';
import { getSettings, saveSettings, clearRecords } from '../services/storageService';
import { getAllStaff, addStaff, removeStaff } from '../services/staffService';
import { getSpecialHolidays, addSpecialHolidayRange, removeSpecialHoliday } from '../services/holidayService';
import { getAccuratePosition } from '../services/geoService';

interface SettingsProps {
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'staff' | 'holidays'>('general');
  const [settings, setSettingsState] = useState<AppSettings>(getSettings());
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);

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

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettingsState(prev => ({ ...prev, googleSheetUrl: e.target.value }));
  };

  const handleClearAllRecords = () => {
    if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมดในเครื่อง? (ข้อมูลบน Cloud จะไม่หาย)')) {
      clearRecords();
      setMsg('ล้างข้อมูลในเครื่องทั้งหมดเรียบร้อยแล้ว');
      setIsError(false);
    }
  };

  const handleGrabCurrentLocation = async () => {
    setIsGpsLoading(true); setMsg('กำลังค้นหาพิกัดที่แม่นยำ...'); setIsError(false);
    try {
      const pos = await getAccuratePosition();
      setSettingsState(prev => ({ ...prev, officeLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude } }));
      setMsg('ดึงพิกัดปัจจุบันสำเร็จแล้ว 📍');
    } catch (err: any) { setMsg(err.message || 'ไม่สามารถดึงพิกัดได้'); setIsError(true); } finally { setIsGpsLoading(false); }
  };

  const handleAddStaff = () => {
    setStaffError('');
    if (!newStaff.id.trim() || !newStaff.name.trim() || !newStaff.role.trim()) { setStaffError('กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
    if (addStaff(newStaff)) {
      setStaffList(getAllStaff()); setNewStaff({ id: '', name: '', role: '' });
      setMsg('บันทึกรายชื่อบุคลากรสำเร็จ'); setIsError(false);
    } else { setStaffError('รหัสบุคลากรนี้มีอยู่ในระบบแล้ว'); }
  };

  const handleRemoveStaff = (id: string) => confirm('ลบรายชื่อบุคลากรนี้?') && (removeStaff(id), setStaffList(getAllStaff()));

  const handleAddHoliday = () => {
    if (!newHolidayStartDate || !newHolidayName) return alert('กรุณาระบุข้อมูลให้ครบ');
    addSpecialHolidayRange(newHolidayStartDate, newHolidayEndDate || newHolidayStartDate, newHolidayName);
    setHolidayList(getSpecialHolidays()); setNewHolidayStartDate(''); setNewHolidayEndDate(''); setNewHolidayName('');
    setMsg('บันทึกวันหยุดพิเศษสำเร็จ'); setIsError(false);
  };

  const handleRemoveHoliday = (id: string) => confirm('ลบรายการวันหยุดนี้?') && (removeSpecialHoliday(id), setHolidayList(getSpecialHolidays()));

  const saveAndClose = () => { saveSettings(settings); onClose(); };

  return (
    <div className="fixed inset-0 bg-purple-950/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-[3rem] shadow-2xl max-w-2xl w-full p-0 relative overflow-hidden border border-white/50 flex flex-col max-h-[90vh]">
        
        <div className="p-8 border-b border-purple-50 flex justify-between items-center bg-purple-50/30">
          <h2 className="text-2xl font-black text-purple-900 flex items-center gap-4">
              <span className="p-2.5 bg-white rounded-2xl text-purple-600 shadow-sm border border-purple-100">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.29 1.52 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </span>
              ตั้งค่าระบบ (Settings)
          </h2>
          <button onClick={onClose} className="text-purple-300 hover:text-pink-500 p-2.5 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex px-8 pt-4 overflow-x-auto bg-white sticky top-0 z-10 gap-2 border-b border-purple-50">
          {[
            { id: 'general', label: 'ทั่วไป', icon: '⚙️' },
            { id: 'staff', label: 'บุคลากร', icon: '👥' },
            { id: 'holidays', label: 'วันหยุด', icon: '🏖️' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`pb-4 px-6 text-sm font-black transition-all relative whitespace-nowrap flex items-center gap-2 ${activeTab === tab.id ? 'text-purple-700' : 'text-purple-300 hover:text-purple-500'}`}>
              <span>{tab.icon}</span> {tab.label}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 rounded-t-full"></div>}
            </button>
          ))}
        </div>
        
        <div className="overflow-y-auto p-8 flex-1 bg-purple-50/10">
          {activeTab === 'general' && (
            <div className="space-y-8">
              <div className="p-8 bg-white rounded-[2.5rem] border border-purple-100 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:rotate-12 transition-transform"><svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>
                <h3 className="font-black text-purple-900 mb-6 text-sm uppercase tracking-widest flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span>
                    โหมดการลงเวลา (Accuracy)
                </h3>
                
                <div className="flex gap-3 mb-6 p-1.5 bg-purple-50 rounded-[1.5rem] border border-purple-100">
                  <button onClick={() => setSettingsState(prev => ({...prev, locationMode: 'online'}))} className={`flex-1 py-4 px-4 rounded-[1.2rem] font-black text-xs transition-all ${settings.locationMode === 'online' ? 'bg-white shadow-md text-purple-700' : 'text-purple-300'}`}>🌐 ออนไลน์ (ทั่วโลก)</button>
                  <button onClick={() => setSettingsState(prev => ({...prev, locationMode: 'gps'}))} className={`flex-1 py-4 px-4 rounded-[1.2rem] font-black text-xs transition-all ${settings.locationMode === 'gps' ? 'bg-white shadow-md text-purple-700' : 'text-purple-300'}`}>📍 เฉพาะในโรงเรียน (GPS)</button>
                </div>

                {settings.locationMode === 'gps' && (
                  <div className="space-y-6 animate-in slide-in-from-top-4 duration-300">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest ml-2">ละติจูด (Lat)</label>
                           <input type="number" step="any" value={settings.officeLocation.lat} onChange={e => setSettingsState(prev => ({...prev, officeLocation: {...prev.officeLocation, lat: parseFloat(e.target.value)}}))} className="w-full p-4 bg-purple-50/50 border border-purple-100 rounded-2xl text-xs font-black font-mono text-purple-900" />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest ml-2">ลองจิจูด (Lng)</label>
                           <input type="number" step="any" value={settings.officeLocation.lng} onChange={e => setSettingsState(prev => ({...prev, officeLocation: {...prev.officeLocation, lng: parseFloat(e.target.value)}}))} className="w-full p-4 bg-purple-50/50 border border-purple-100 rounded-2xl text-xs font-black font-mono text-purple-900" />
                        </div>
                     </div>
                     <button onClick={handleGrabCurrentLocation} disabled={isGpsLoading} className="w-full py-5 bg-purple-700 text-white rounded-[1.5rem] font-black text-xs flex items-center justify-center gap-3 hover:scale-[1.01] active:scale-95 transition-all shadow-lg shadow-purple-100">
                        {isGpsLoading ? '⏳ กำลังดึงพิกัดจากดาวเทียม...' : '🎯 บันทึกตำแหน่งปัจจุบันเป็นจุดศูนย์กลาง'}
                     </button>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest ml-2">รัศมีที่อนุญาต (เมตร)</label>
                        <input type="number" value={settings.maxDistanceMeters} onChange={e => setSettingsState(prev => ({...prev, maxDistanceMeters: parseInt(e.target.value)}))} className="w-full p-4 bg-purple-50/50 border border-purple-100 rounded-2xl text-xs font-black font-mono text-purple-900" />
                     </div>
                  </div>
                )}

                {msg && (
                    <p className={`text-[11px] mt-6 text-center font-black p-4 rounded-2xl border animate-in slide-in-from-top-2 ${isError ? 'bg-pink-50 border-pink-100 text-pink-600' : 'bg-purple-50 border-purple-100 text-purple-600'}`}>
                        {isError ? '❌ ' : '✅ '}{msg}
                    </p>
                )}
              </div>

              <div className="p-8 bg-white rounded-[2.5rem] border border-purple-100 shadow-sm">
                 <h3 className="font-black text-purple-900 mb-6 text-sm uppercase tracking-widest flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                    การเชื่อมต่อฐานข้อมูล (Database)
                 </h3>
                 <div className="space-y-2">
                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest ml-2">Google Apps Script Web App URL</label>
                    <input type="text" value={settings.googleSheetUrl || ''} onChange={handleUrlChange} className="w-full p-5 bg-purple-50/50 border border-purple-100 rounded-2xl outline-none text-[11px] font-mono font-bold text-purple-900" />
                 </div>
              </div>

              <div className="p-8 bg-pink-50/50 rounded-[2.5rem] border border-pink-100">
                 <h3 className="font-black text-pink-700 mb-2 text-sm uppercase tracking-widest flex items-center gap-3">⚠️ Danger Zone</h3>
                 <p className="text-[11px] text-pink-400 font-bold mb-6 leading-relaxed italic">การล้างข้อมูลจะลบเฉพาะข้อมูลในเบราว์เซอร์นี้ ไม่กระทบข้อมูลบน Cloud</p>
                 <button onClick={handleClearAllRecords} className="w-full py-5 bg-pink-600 hover:bg-pink-700 text-white rounded-[1.5rem] font-black text-sm shadow-xl shadow-pink-100 transition-all active:scale-[0.98]">ล้างข้อมูลในเครื่องทั้งหมด</button>
              </div>
            </div>
          )}

          {activeTab === 'staff' && (
             <div className="space-y-8">
                <div className="p-8 bg-white rounded-[2.5rem] border border-purple-100 shadow-sm">
                    <h3 className="font-black text-purple-900 mb-6 text-sm uppercase tracking-widest flex items-center gap-3">เพิ่มรายชื่อบุคลากร</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <input type="text" placeholder="รหัสบุคลากร (เช่น PJ001)" value={newStaff.id} onChange={e => setNewStaff({...newStaff, id: e.target.value.toUpperCase()})} className="p-5 bg-purple-50/50 border-2 border-purple-100 rounded-2xl text-sm font-black text-purple-900 focus:border-purple-400 outline-none" />
                        <input type="text" placeholder="ชื่อ-นามสกุล" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="p-5 bg-purple-50/50 border-2 border-purple-100 rounded-2xl text-sm font-black text-purple-900 focus:border-purple-400 outline-none" />
                    </div>
                    <input type="text" placeholder="ตำแหน่ง (เช่น ครูชำนาญการ)" value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="w-full p-5 bg-purple-50/50 border-2 border-purple-100 rounded-2xl text-sm font-black text-purple-900 focus:border-purple-400 outline-none mb-6" />
                    {staffError && <p className="text-pink-600 text-[11px] font-black mb-4">❌ {staffError}</p>}
                    <button onClick={handleAddStaff} className="w-full py-5 bg-purple-700 text-white rounded-[1.5rem] font-black text-sm shadow-xl shadow-purple-100 hover:scale-[1.01] transition-all">+ บันทึกรายชื่อใหม่</button>
                </div>
                <div className="bg-white rounded-[2.5rem] border border-purple-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] text-purple-400 font-black uppercase bg-purple-50/50 border-b border-purple-100">
                            <tr><th className="p-6">ID</th><th className="p-6">Name</th><th className="p-6">Role</th><th className="p-6 text-right">Delete</th></tr>
                        </thead>
                        <tbody className="divide-y divide-purple-50/50">
                            {staffList.map((s) => (
                                <tr key={s.id} className="hover:bg-purple-50/30 transition-colors">
                                    <td className="p-6 font-mono font-black text-purple-300">{s.id}</td>
                                    <td className="p-6 font-black text-purple-900">{s.name}</td>
                                    <td className="p-6 text-[11px] font-bold text-purple-400 uppercase tracking-tighter">{s.role}</td>
                                    <td className="p-6 text-right">
                                        <button onClick={() => handleRemoveStaff(s.id)} className="p-2.5 bg-purple-50 text-purple-300 hover:text-pink-600 rounded-xl transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
             <div className="space-y-8">
                <div className="p-8 bg-white rounded-[2.5rem] border border-purple-100 shadow-sm relative overflow-hidden">
                    <h3 className="font-black text-purple-900 mb-6 text-sm uppercase tracking-widest flex items-center gap-3">เพิ่มช่วงวันหยุดโรงเรียน 🏖️</h3>
                    <div className="bg-purple-50 p-5 rounded-[1.5rem] border border-purple-100 mb-8">
                        <p className="text-[11px] text-purple-500 font-bold leading-relaxed italic">
                            💡 วันหยุดราชการพื้นฐานระบบตรวจสอบให้อัตโนมัติ คุณเพียงแค่เพิ่มวันหยุดกรณีพิเศษหรือวันปิดเทอมของโรงเรียนเท่านั้น
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest ml-2">วันที่เริ่มต้น</label>
                            <input type="date" value={newHolidayStartDate} onChange={e => setNewHolidayStartDate(e.target.value)} className="w-full p-5 bg-purple-50/50 border-2 border-purple-100 rounded-2xl font-black text-purple-900 focus:border-purple-400 outline-none" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest ml-2">วันที่สิ้นสุด</label>
                            <input type="date" value={newHolidayEndDate} onChange={e => setNewHolidayEndDate(e.target.value)} className="w-full p-5 bg-purple-50/50 border-2 border-purple-100 rounded-2xl font-black text-purple-900 focus:border-purple-400 outline-none" />
                        </div>
                    </div>
                    <div className="space-y-2 mb-8">
                        <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest ml-2">ชื่อวันหยุด (เช่น ปิดเทอมภาคเรียนที่ 1)</label>
                        <input type="text" placeholder="พิมพ์ชื่อวันหยุด..." value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} className="w-full p-5 bg-purple-50/50 border-2 border-purple-100 rounded-2xl font-black text-purple-900 focus:border-purple-400 outline-none" />
                    </div>
                    <button onClick={handleAddHoliday} className="w-full py-5 bg-purple-700 text-white rounded-[1.5rem] font-black text-sm shadow-xl shadow-purple-100 hover:scale-[1.01] transition-all">+ บันทึกวันหยุดพิเศษ</button>
                </div>

                <div className="bg-white rounded-[2.5rem] border border-purple-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] text-purple-400 font-black uppercase bg-purple-50/50 border-b border-purple-100">
                            <tr><th className="p-6">ช่วงเวลา (Period)</th><th className="p-6">รายการ</th><th className="p-6 text-right">Delete</th></tr>
                        </thead>
                        <tbody className="divide-y divide-purple-50/50">
                            {holidayList.length === 0 && (
                                <tr><td colSpan={3} className="p-16 text-center text-purple-200 font-black uppercase tracking-widest italic">ไม่มีข้อมูลวันหยุดพิเศษ</td></tr>
                            )}
                            {holidayList.map((h) => (
                                <tr key={h.id} className="hover:bg-purple-50/30 transition-colors">
                                    <td className="p-6">
                                        <div className="font-black text-purple-900 text-xs">
                                            {new Date(h.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            {h.endDate !== h.startDate && <span className="block text-[10px] text-purple-300">ถึง {new Date(h.endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                                        </div>
                                    </td>
                                    <td className="p-6 font-black text-purple-900">{h.name}</td>
                                    <td className="p-6 text-right">
                                        <button onClick={() => handleRemoveHoliday(h.id)} className="p-2.5 bg-purple-50 text-purple-300 hover:text-pink-600 rounded-xl transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>
          )}
        </div>

        <div className="p-8 bg-white border-t border-purple-50 flex gap-4 sticky bottom-0 z-10 shadow-[0_-15px_40px_rgba(0,0,0,0.03)]">
          <button onClick={saveAndClose} className="flex-1 py-6 bg-purple-950 text-white rounded-[1.8rem] hover:bg-purple-900 font-black text-base transition-all shadow-xl shadow-purple-100 active:scale-[0.98] flex items-center justify-center gap-3">
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
