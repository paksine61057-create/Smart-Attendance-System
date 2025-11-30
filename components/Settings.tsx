
import React, { useState, useEffect } from 'react';
import { AppSettings, GeoLocation, Staff } from '../types';
import { getSettings, saveSettings } from '../services/storageService';
import { getCurrentPosition } from '../services/geoService';
import { getAllStaff, addStaff, removeStaff } from '../services/staffService';

interface SettingsProps {
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'staff'>('general');
  const [settings, setSettingsState] = useState<AppSettings>(getSettings());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Staff Management State
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [newStaff, setNewStaff] = useState<Staff>({ id: '', name: '', role: '' });
  const [staffError, setStaffError] = useState('');

  useEffect(() => {
    setStaffList(getAllStaff());
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
      
      const newSettings = {
        ...settings,
        officeLocation: newLoc
      };
      
      setSettingsState(newSettings);
      // saveSettings(newSettings); // Don't save immediately, wait for user to click Save
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

  const saveAndClose = () => {
    saveSettings(settings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-2xl w-full p-0 relative overflow-hidden border border-white/50 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-3">
              <span className="p-2 bg-stone-200 rounded-full text-stone-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.29 1.52 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </span>
              ตั้งค่าระบบ (System Settings)
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-100 px-6 pt-2">
          <button 
            onClick={() => setActiveTab('general')}
            className={`pb-3 px-4 text-sm font-bold transition-all relative ${activeTab === 'general' ? 'text-purple-600' : 'text-stone-400 hover:text-stone-600'}`}
          >
            ทั่วไป (General)
            {activeTab === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 rounded-t-full"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('staff')}
            className={`pb-3 px-4 text-sm font-bold transition-all relative ${activeTab === 'staff' ? 'text-purple-600' : 'text-stone-400 hover:text-stone-600'}`}
          >
            จัดการบุคลากร (Staff)
            {activeTab === 'staff' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 rounded-t-full"></div>}
          </button>
        </div>
        
        <div className="overflow-y-auto p-6 flex-1 bg-stone-50/30">
          {activeTab === 'general' ? (
            <div className="space-y-6">
              <div className="p-6 bg-white rounded-2xl border border-stone-100 shadow-sm">
                <h3 className="font-bold text-stone-400 mb-3 text-xs uppercase tracking-widest">จุดลงเวลา (Office Location)</h3>
                
                <div className="flex gap-3 mb-4">
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-stone-400 mb-1 block">ละติจูด (Lat)</label>
                        <input 
                            type="number"
                            step="any"
                            value={settings.officeLocation?.lat || ''}
                            onChange={(e) => handleCoordinateChange('lat', e.target.value)}
                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 font-mono text-sm focus:ring-2 focus:ring-purple-200 outline-none"
                            placeholder="13.xxxxxx"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-stone-400 mb-1 block">ลองจิจูด (Lng)</label>
                        <input 
                            type="number"
                            step="any"
                            value={settings.officeLocation?.lng || ''}
                            onChange={(e) => handleCoordinateChange('lng', e.target.value)}
                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 font-mono text-sm focus:ring-2 focus:ring-purple-200 outline-none"
                            placeholder="100.xxxxxx"
                        />
                    </div>
                </div>

                <button
                  onClick={handleSetCurrentLocation}
                  disabled={loading}
                  className="w-full bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 font-bold text-sm"
                >
                  {loading ? (
                    <span className="animate-pulse">Locating...</span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                      ดึงพิกัดปัจจุบันใส่ในช่อง
                    </>
                  )}
                </button>
                {msg && <p className="text-[10px] text-emerald-600 mt-3 text-center font-bold tracking-wide">{msg}</p>}
              </div>

              <div className="p-6 bg-white rounded-2xl border border-stone-100 shadow-sm">
                 <h3 className="font-bold text-stone-400 mb-3 text-xs uppercase tracking-widest">การตั้งค่าทั่วไป</h3>
                 <div className="mb-4">
                    <label className="block text-xs font-bold text-stone-500 mb-2">ระยะห่างสูงสุด (เมตร)</label>
                    <input 
                    type="number" 
                    value={settings.maxDistanceMeters}
                    onChange={handleDistanceChange}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-purple-200 focus:border-purple-300 outline-none font-bold"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-stone-500 mb-2">Google Apps Script URL (สำหรับส่งข้อมูล)</label>
                    <input 
                    type="text" 
                    value={settings.googleSheetUrl || ''}
                    onChange={handleUrlChange}
                    placeholder="https://script.google.com/macros/s/..."
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-purple-200 focus:border-purple-300 outline-none text-xs text-stone-600"
                    />
                    <p className="text-[10px] text-stone-400 mt-1">ใช้ Webhook URL จากการ Deploy Web App ใน Google Apps Script</p>
                 </div>
              </div>
            </div>
          ) : (
             <div className="space-y-6">
                <div className="p-4 bg-white rounded-2xl border border-stone-100 shadow-sm">
                    <h3 className="font-bold text-stone-400 mb-3 text-xs uppercase tracking-widest">เพิ่มบุคลากรใหม่</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input 
                            type="text" 
                            placeholder="รหัส (PJ...)" 
                            value={newStaff.id}
                            onChange={e => setNewStaff({...newStaff, id: e.target.value})}
                            className="p-3 bg-stone-50 border rounded-xl text-sm"
                        />
                         <input 
                            type="text" 
                            placeholder="ชื่อ-นามสกุล" 
                            value={newStaff.name}
                            onChange={e => setNewStaff({...newStaff, name: e.target.value})}
                            className="p-3 bg-stone-50 border rounded-xl text-sm"
                        />
                         <input 
                            type="text" 
                            placeholder="ตำแหน่ง" 
                            value={newStaff.role}
                            onChange={e => setNewStaff({...newStaff, role: e.target.value})}
                            className="p-3 bg-stone-50 border rounded-xl text-sm"
                        />
                    </div>
                    {staffError && <p className="text-red-500 text-xs mt-2">{staffError}</p>}
                    <button onClick={handleAddStaff} className="mt-3 w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold">
                        + เพิ่มรายชื่อ
                    </button>
                </div>

                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-stone-100">
                                <tr>
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Name</th>
                                    <th className="px-4 py-3">Role</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {staffList.map((s) => (
                                    <tr key={s.id} className="hover:bg-stone-50">
                                        <td className="px-4 py-3 font-medium text-stone-800">{s.id}</td>
                                        <td className="px-4 py-3 text-stone-600">{s.name}</td>
                                        <td className="px-4 py-3 text-stone-500 text-xs">{s.role}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button onClick={() => handleRemoveStaff(s.id)} className="text-red-400 hover:text-red-600 p-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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

        <div className="p-6 bg-white border-t border-stone-100">
          <button 
            onClick={saveAndClose}
            className="w-full px-6 py-3.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 font-bold text-sm tracking-wide transition-all shadow-lg hover:shadow-xl"
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
