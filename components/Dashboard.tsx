
import React, { useState, useEffect, useCallback } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord } from '../services/storageService';
import { CheckInRecord } from '../types';

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
          // 1. Sync ข้อมูลที่ค้างอยู่ขึ้นไป
          await syncUnsyncedRecords();
          
          // 2. ดึงจากทั้ง Cloud และ Local
          const [cloud, local] = await Promise.all([
              fetchGlobalRecords(),
              Promise.resolve(getRecords())
          ]);
          
          const mergedMap = new Map<string, CheckInRecord>();
          
          // รวมข้อมูลจาก Cloud ก่อน
          cloud.forEach(r => {
              const sig = `${r.timestamp}_${String(r.staffId).toUpperCase()}`;
              mergedMap.set(sig, r);
          });
          
          // รวมข้อมูลจาก Local (เผื่อในเครื่องมีรูปที่ชัดกว่า)
          local.forEach(l => {
              const sig = `${l.timestamp}_${String(l.staffId).toUpperCase()}`;
              if (!mergedMap.has(sig)) {
                  mergedMap.set(sig, l);
              } else {
                  const cloudRec = mergedMap.get(sig)!;
                  if ((l.imageUrl || "").length > (cloudRec.imageUrl || "").length) {
                      mergedMap.set(sig, { ...cloudRec, imageUrl: l.imageUrl });
                  }
              }
          });
          
          const result = Array.from(mergedMap.values());
          console.debug("Dashboard Synced Data:", result);
          setAllRecords(result);
      } catch (e) { 
          console.error("Sync Error:", e);
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
    if (url && url.length > 50) {
        setPreviewImage(url.startsWith('data:') ? url : `data:image/jpeg;base64,${url}`);
    } else {
        alert("ข้อมูลรูปภาพไม่มีในระบบหรืออยู่นอกระยะเวลาบันทึก");
    }
  };

  const handleDelete = async (record: CheckInRecord) => {
      if (confirm('ลบรายการนี้ออกจากระบบ?')) {
          await deleteRecord(record);
          await syncData();
      }
  };

  return (
    <div className="w-full">
      {/* Image Preview Overlay */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
            <div className="relative max-w-xl w-full flex flex-col items-center animate-in zoom-in duration-300">
                <button className="absolute -top-12 right-0 text-white font-bold bg-white/20 px-4 py-2 rounded-full">✕ ปิดหน้าต่าง</button>
                <img src={previewImage} className="w-full h-auto rounded-[2rem] shadow-2xl border-4 border-white/20" />
            </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6 no-print">
        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/20 shadow-2xl text-white">
          <h2 className="text-3xl font-black flex items-center gap-3">Admin Dashboard ❄️</h2>
          <p className="text-amber-200 text-xs font-bold mt-1 tracking-widest uppercase opacity-80">Prachaksinlapakhom Monitoring System</p>
        </div>
        <div className="flex gap-4 items-center">
             <button 
                onClick={syncData} 
                disabled={isSyncing} 
                className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white border-2 border-white/20 rounded-3xl font-black text-sm shadow-xl active:scale-95 transition-all flex items-center gap-3"
             >
                {isSyncing ? <div className="w-4 h-4 border-2 border-t-white border-white/20 rounded-full animate-spin" /> : '🔄'}
                {isSyncing ? 'กำลังซิงค์ข้อมูล...' : 'อัปเดตข้อมูล'}
             </button>
             <input 
                type="date" 
                value={selectedDate} 
                onChange={e => setSelectedDate(e.target.value)} 
                className="px-6 py-4 bg-white border-4 border-rose-100 rounded-3xl text-rose-700 font-black text-sm shadow-xl outline-none" 
             />
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden flex flex-col min-h-[600px]">
        <div className="p-8 border-b-4 border-stone-50 flex justify-between items-center bg-white sticky top-0 z-10">
            <h3 className="font-black text-stone-800 text-2xl">รายการลงเวลาล่าสุด 🎄</h3>
            <span className="text-[10px] font-black text-stone-400 bg-stone-50 px-4 py-2 rounded-full uppercase tracking-tighter">
                {isSyncing ? 'Synchronizing...' : `Total: ${filteredRecords.length} Items`}
            </span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/30">
            {isSyncing && filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-stone-400">
                    <div className="w-16 h-16 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="font-black animate-pulse">กำลังดึงข้อมูลจาก Google Sheets...</p>
                </div>
            ) : filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-stone-300">
                    <span className="text-6xl mb-4">⛄</span>
                    <p className="font-black text-xl">ไม่พบข้อมูลในวันที่เลือก</p>
                    <button onClick={syncData} className="mt-4 text-rose-500 text-xs font-bold underline">ลองดึงข้อมูลใหม่อีกครั้ง</button>
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-[11px] font-black uppercase text-stone-400 border-b border-stone-100">
                            <th className="p-4 text-center">เวลา</th>
                            <th className="p-4 text-left">บุคลากร</th>
                            <th className="p-4 text-center">สถานะ</th>
                            <th className="p-4 text-center">หลักฐาน</th>
                            <th className="p-4 text-right"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {filteredRecords.map(r => (
                            <tr key={r.id} className="hover:bg-white transition-colors">
                                <td className="p-5 text-center">
                                    <div className="font-mono font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-xl inline-block text-base">
                                        {new Date(r.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}
                                    </div>
                                </td>
                                <td className="p-5">
                                    <div className="font-black text-stone-800 text-lg">{r.name}</div>
                                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{r.staffId} • {r.role}</div>
                                </td>
                                <td className="p-5 text-center">
                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border-2 ${
                                        r.status.includes('Late') || r.status.includes('Early') ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    }`}>
                                        {r.status}
                                    </span>
                                </td>
                                <td className="p-5 text-center">
                                    {r.imageUrl ? (
                                        <button onClick={() => openImage(r.imageUrl)} className="px-5 py-2 bg-stone-900 text-white rounded-2xl text-[10px] font-black hover:bg-rose-600 transition-all shadow-lg">
                                            VIEW PHOTO 📷
                                        </button>
                                    ) : (
                                        <span className="text-stone-300 text-[10px] font-bold italic">NO IMAGE</span>
                                    )}
                                </td>
                                <td className="p-5 text-right">
                                    <button onClick={() => handleDelete(r)} className="text-stone-200 hover:text-rose-500 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
