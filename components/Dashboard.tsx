
import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getRecords, clearRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord } from '../services/storageService';
import { CheckInRecord, Staff } from '../types';
import { getAllStaff } from '../services/staffService';

const Dashboard: React.FC = () => {
  const getTodayStr = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<CheckInRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const syncData = useCallback(async () => {
      setIsSyncing(true);
      try {
          await syncUnsyncedRecords();
          const cloud = await fetchGlobalRecords();
          const local = getRecords();
          const mergedMap = new Map<string, CheckInRecord>();
          
          // นำข้อมูลจาก Cloud ใส่ Map ก่อน
          cloud.forEach(r => mergedMap.set(`${r.timestamp}_${r.staffId}`, r));
          
          // นำข้อมูลจาก Local มา Merge ทับ
          local.forEach(l => {
              const sig = `${l.timestamp}_${l.staffId}`;
              const cloudRec = mergedMap.get(sig);
              
              if (!cloudRec) {
                  mergedMap.set(sig, l);
              } else {
                  // [Smart Merge] ตรวจสอบรูปภาพ
                  const cImgLen = (cloudRec.imageUrl || '').length;
                  const lImgLen = (l.imageUrl || '').length;
                  
                  // ถ้าในเครื่องมีรูปที่ยาวกว่า (สมบูรณ์กว่า) ให้ใช้รูปในเครื่องแทน
                  if (lImgLen > cImgLen || (lImgLen > 5000 && cImgLen < 1000)) {
                      mergedMap.set(sig, { ...cloudRec, imageUrl: l.imageUrl });
                  }
              }
          });
          
          setAllRecords(Array.from(mergedMap.values()));
      } catch (e) { 
          console.error("Sync Logic Error", e);
          setAllRecords(getRecords()); 
      }
      finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { syncData(); }, [syncData]);

  useEffect(() => {
    const filtered = allRecords.filter(r => {
        const d = new Date(r.timestamp);
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return dStr === selectedDate;
    }).sort((a,b) => b.timestamp - a.timestamp);
    setFilteredRecords(filtered);
  }, [selectedDate, allRecords]);

  const openImage = (url?: string) => {
    if (url && url.length > 20) {
        setPreviewImage(url.startsWith('data:') ? url : `data:image/jpeg;base64,${url}`);
    } else {
        alert("รหัสภาพไม่สมบูรณ์ (Data is too short)");
    }
  };

  const handleDelete = async (record: CheckInRecord) => {
      if (confirm('ยืนยันการลบรายการนี้?')) {
          await deleteRecord(record);
          await syncData();
      }
  };

  return (
    <div className="w-full">
      {/* Lightbox / Preview */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl z-[100] flex items-center justify-center p-4 overflow-hidden" onClick={() => setPreviewImage(null)}>
            <div className="relative max-w-2xl w-full flex flex-col items-center animate-in zoom-in duration-300">
                <button className="absolute -top-12 right-0 text-white bg-white/20 p-2 rounded-full hover:bg-rose-500 transition-all">✕ Close</button>
                <div className="p-3 bg-white rounded-[3rem] shadow-[0_0_80px_rgba(255,255,255,0.2)] border-8 border-rose-100 overflow-hidden">
                    <img 
                      src={previewImage} 
                      className="w-full h-auto rounded-[2.2rem] max-h-[75vh] object-contain shadow-inner" 
                      onError={(e) => (e.target as any).src = 'https://via.placeholder.com/400?text=Image+Data+Broken'} 
                    />
                </div>
                <div className="mt-8 flex flex-col items-center">
                    <p className="text-white font-black text-2xl tracking-widest bg-gradient-to-r from-rose-500 to-amber-500 px-10 py-3 rounded-full shadow-2xl animate-shimmer-bg">IDENTITY VERIFIED ❄️</p>
                    <p className="text-rose-200 text-[10px] mt-3 font-bold opacity-60 uppercase tracking-tighter bg-black/40 px-4 py-1 rounded-full">Base64 Length: {previewImage.length.toLocaleString()} characters</p>
                </div>
            </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6 no-print">
        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/20 shadow-2xl text-white relative overflow-hidden group">
          <div className="absolute -top-6 -right-6 text-7xl opacity-20 group-hover:opacity-100 transition-all duration-700 animate-sway">⛄</div>
          <h2 className="text-3xl font-black flex items-center gap-3 drop-shadow-md">Admin Dashboard 🎁</h2>
          <p className="text-amber-200 text-xs font-bold mt-1 uppercase tracking-widest pl-1">Prachaksinlapakhom School Monitor ❄️</p>
        </div>
        <div className="flex gap-4 items-center">
             <button 
                onClick={syncData} 
                disabled={isSyncing} 
                className="px-8 py-4 bg-white/15 hover:bg-white/25 text-white border-2 border-white/20 rounded-3xl font-black text-sm shadow-2xl active:scale-95 transition-all flex items-center gap-3"
             >
                {isSyncing ? <div className="w-4 h-4 border-2 border-t-white rounded-full animate-spin" /> : '❄️'}
                {isSyncing ? 'Refreshing...' : 'Refresh & Sync'}
             </button>
             <input 
                type="date" 
                value={selectedDate} 
                onChange={e => setSelectedDate(e.target.value)} 
                className="px-6 py-4 bg-white border-4 border-rose-100 rounded-3xl text-rose-700 font-black text-sm shadow-2xl outline-none focus:ring-8 focus:ring-rose-200 transition-all" 
             />
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden h-[700px] flex flex-col animate-in slide-in-from-bottom-8 duration-700">
        <div className="p-8 border-b-4 border-stone-50 flex justify-between items-center bg-white sticky top-0 z-10">
            <h3 className="font-black text-stone-800 text-2xl flex items-center gap-3"><span className="w-2 h-8 bg-rose-500 rounded-full" /> รายการล่าสุด 🎄</h3>
            <div className="flex items-center gap-4">
                <span className="text-[10px] font-black text-stone-400 bg-stone-50 px-3 py-1 rounded-full">{filteredRecords.length} รายการ</span>
                <button onClick={() => confirm('ล้างข้อมูลแคชในเครื่อง?') && (clearRecords(), syncData())} className="text-[10px] font-black text-rose-400 hover:text-rose-600">Clear Cache</button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
            <table className="w-full text-sm">
                <thead className="text-[11px] font-black uppercase text-stone-400">
                    <tr className="border-b-2 border-stone-100">
                        <th className="p-5 text-center">เวลา</th>
                        <th className="p-5 text-left">ชื่อ-สกุล</th>
                        <th className="p-5 text-center">สถานะ</th>
                        <th className="p-5 text-center">หลักฐาน</th>
                        <th className="p-5 text-right"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                    {filteredRecords.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="p-20 text-center">
                                <p className="text-stone-300 font-black text-xl tracking-widest animate-pulse">NO DATA TODAY ❄️</p>
                            </td>
                        </tr>
                    ) : (
                        filteredRecords.map(r => (
                            <tr key={r.id} className="hover:bg-rose-50/50 transition-colors group">
                                <td className="p-6 text-center">
                                    <div className="font-mono font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-xl text-lg inline-block">
                                        {new Date(r.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}
                                    </div>
                                </td>
                                <td className="p-6">
                                    <div className="font-black text-stone-800 text-lg">{r.name}</div>
                                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{r.role} • {r.type.toUpperCase()}</div>
                                </td>
                                <td className="p-6 text-center">
                                    <span className={`px-5 py-2 rounded-full text-[10px] font-black uppercase shadow-sm border-2 ${
                                        r.status === 'Late' || r.status === 'Early Leave' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    }`}>
                                        {r.status}
                                    </span>
                                </td>
                                <td className="p-6 text-center">
                                    {r.imageUrl ? (
                                        <div className="flex flex-col items-center gap-1">
                                            <button 
                                                onClick={() => openImage(r.imageUrl)} 
                                                className="px-6 py-2 bg-stone-900 hover:bg-rose-600 text-white rounded-2xl text-[10px] font-black transition-all shadow-lg active:scale-95"
                                            >
                                                ดูรูปภาพ ❄️
                                            </button>
                                            <span className={`text-[8px] font-bold ${r.imageUrl.length < 5000 ? 'text-red-500 animate-pulse' : 'text-stone-300'}`}>
                                                Size: {r.imageUrl.length.toLocaleString()} ch
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-stone-300 italic text-xs">ไม่มีรูป</span>
                                    )}
                                </td>
                                <td className="p-6 text-right">
                                    <button onClick={() => handleDelete(r)} className="text-stone-200 hover:text-red-500 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
