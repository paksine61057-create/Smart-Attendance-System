
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff, getStaffById } from '../services/staffService';
import { getHoliday } from '../services/holidayService';
import { CheckInRecord, Staff, AttendanceType } from '../types';

type TabType = 'today' | 'official' | 'monthly' | 'manual';

const SCHOOL_LOGO_URL = 'https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const staffList = useMemo(() => getAllStaff(), []);
  const ATTENDANCE_START_TYPES: AttendanceType[] = ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'];

  const syncData = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // 1. ส่งข้อมูลที่ยังค้างอยู่ในเครื่องขึ้น Cloud ก่อน
      await syncUnsyncedRecords();
      // 2. ดึงข้อมูลทั้งหมดจาก Cloud
      const cloud = await fetchGlobalRecords();
      const local = getRecords();
      
      const mergedMap = new Map<string, CheckInRecord>();
      
      const getSig = (r: CheckInRecord) => {
        const d = new Date(r.timestamp);
        return `${String(r.staffId || '').toUpperCase()}_${r.type}_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      };
      
      // รวมข้อมูลจาก Cloud
      cloud.forEach(r => mergedMap.set(getSig(r), r));
      // รวมข้อมูล Local (ถ้าใหม่กว่าหรือมีรูป)
      local.forEach(l => {
        const sig = getSig(l);
        if (!mergedMap.has(sig) || (l.imageUrl && l.imageUrl.length > (mergedMap.get(sig)?.imageUrl?.length || 0))) {
          mergedMap.set(sig, l);
        }
      });
      
      setAllRecords(Array.from(mergedMap.values()));
    } catch (e) {
      console.error("Sync failed", e);
      // ถ้าซิงค์ไม่ผ่าน ให้ใช้ข้อมูลในเครื่องไปก่อน
      setAllRecords(getRecords());
    } finally { 
      setIsSyncing(false); 
    }
  }, [isSyncing]);

  useEffect(() => { 
    syncData(); 
  }, []);

  const filteredToday = useMemo(() => {
    return allRecords.filter(r => {
      const d = new Date(r.timestamp);
      const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateString === selectedDate;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [allRecords, selectedDate]);

  const officialDailyData = useMemo(() => {
    return staffList.map((staff, idx) => {
      const dayRecs = filteredToday.filter(r => r.staffId?.toUpperCase() === staff.id.toUpperCase());
      
      // คัดเฉพาะรายการที่เป็น "การมา" ครั้งแรกสุด
      const arrivalRecs = dayRecs.filter(r => ATTENDANCE_START_TYPES.includes(r.type))
                                 .sort((a, b) => a.timestamp - b.timestamp);
      const arrival = arrivalRecs[0];

      // คัดเฉพาะรายการที่เป็น "การกลับ" ครั้งล่าสุด
      const departureRecs = dayRecs.filter(r => r.type === 'departure')
                                   .sort((a, b) => b.timestamp - a.timestamp);
      const departure = departureRecs[0];
      
      let remark = '';
      if (arrival?.status === 'Late' || arrival?.type === 'duty' || arrival?.type.includes('leave')) {
        remark = arrival.reason || getStatusLabel(arrival.status);
      }

      return {
        no: idx + 1,
        name: staff.name,
        role: staff.role,
        arrival: arrival ? new Date(arrival.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
        departure: departure ? new Date(departure.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
        remark
      };
    });
  }, [staffList, filteredToday]);

  const getStatusLabel = (status: string) => {
    const map: any = { 
      'On Time': 'ตรงเวลา', 
      'Late': 'มาสาย', 
      'Duty': 'ไปราชการ', 
      'Sick Leave': 'ลาป่วย', 
      'Personal Leave': 'ลากิจ', 
      'Other Leave': 'ลาอื่นๆ', 
      'Normal': 'ปกติ',
      'Early Leave': 'กลับก่อนเวลา',
      'Authorized Late': 'อนุญาตเข้าสาย'
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    if (['On Time', 'Normal'].includes(status)) return 'bg-emerald-100 text-emerald-700';
    if (status === 'Late') return 'bg-rose-100 text-rose-700';
    if (status === 'Duty') return 'bg-blue-100 text-blue-700';
    if (status.includes('Leave')) return 'bg-amber-100 text-amber-700';
    if (status === 'Early Leave') return 'bg-orange-100 text-orange-700';
    return 'bg-slate-100 text-slate-700';
  };

  const getTypeLabel = (type: AttendanceType) => {
    const map: any = {
      'arrival': '🌅 มาทำงาน',
      'departure': '🏠 กลับบ้าน',
      'duty': '🏛️ ไปราชการ',
      'sick_leave': '🤒 ลาป่วย',
      'personal_leave': '🙏 ลากิจ',
      'authorized_late': '🕒 อนุญาตสาย'
    };
    return map[type] || type;
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/10 backdrop-blur-md p-8 rounded-[3rem] border border-white/20 shadow-2xl">
        <div className="flex items-center gap-4">
           <img src={SCHOOL_LOGO_URL} alt="logo" className="w-12 h-12 object-contain bg-white rounded-full p-1" />
           <div>
              <h2 className="text-3xl font-black text-white">Admin Dashboard</h2>
              <p className="text-amber-200 text-xs font-bold uppercase tracking-widest">ระบบจัดการเวลาโรงเรียนประจักษ์ศิลปาคม</p>
           </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={syncData} 
            disabled={isSyncing}
            className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 flex items-center gap-2 ${isSyncing ? 'bg-stone-400 text-stone-200 cursor-not-allowed' : 'bg-white text-rose-600 hover:bg-rose-50'}`}
          >
            {isSyncing ? (
              <>
                <div className="w-4 h-4 border-2 border-t-transparent border-stone-200 rounded-full animate-spin" />
                กำลังซิงค์...
              </>
            ) : '🔄 ซิงค์ข้อมูลล่าสุด'}
          </button>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={e => setSelectedDate(e.target.value)} 
            className="px-5 py-3 rounded-2xl bg-white font-bold text-rose-700 shadow-xl outline-none focus:ring-4 focus:ring-rose-400/30" 
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print">
        {[
          { id: 'today', label: 'รายการประจำวัน', emoji: '📅' },
          { id: 'official', label: 'รายงานสรุปวัน', emoji: '📜' },
          { id: 'monthly', label: 'สรุปสถิติเดือน', emoji: '📊' }
        ].map(t => (
          <button 
            key={t.id} 
            onClick={() => setActiveTab(t.id as TabType)} 
            className={`px-6 py-4 rounded-2xl font-black text-sm whitespace-nowrap transition-all shadow-lg flex items-center gap-2 ${activeTab === t.id ? 'bg-rose-600 text-white scale-105' : 'bg-white/80 text-stone-500 hover:bg-white'}`}
          >
            <span>{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] animate-in fade-in duration-500">
         
         {activeTab === 'today' && (
           <div className="p-8">
              <h3 className="text-2xl font-black text-stone-800 mb-6 flex items-center gap-3">
                <span className="p-2 bg-rose-100 rounded-xl">🕒</span>
                รายการบันทึกเวลาล่าสุด
              </h3>
              <div className="overflow-x-auto rounded-3xl border border-stone-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b">
                      <th className="p-5">เวลาบันทึก</th>
                      <th className="p-5">ประเภท</th>
                      <th className="p-5">ชื่อ-นามสกุล</th>
                      <th className="p-5">สถานะ</th>
                      <th className="p-5">หลักฐาน</th>
                      <th className="p-5 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {filteredToday.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-20 text-center text-stone-300 font-bold italic">
                          {isSyncing ? 'กำลังโหลดข้อมูล...' : 'ไม่พบข้อมูลการลงเวลาในวันนี้ ❄️'}
                        </td>
                      </tr>
                    ) : (
                      filteredToday.map(r => (
                        <tr key={r.id} className="hover:bg-rose-50/20 transition-colors group">
                          <td className="p-5">
                            <div className="font-mono font-black text-rose-500 text-lg">
                              {new Date(r.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-[9px] text-stone-400 font-bold">{new Date(r.timestamp).toLocaleDateString('th-TH')}</div>
                          </td>
                          <td className="p-5">
                             <span className="text-xs font-black text-stone-600 bg-stone-100 px-3 py-1 rounded-lg">
                               {getTypeLabel(r.type)}
                             </span>
                          </td>
                          <td className="p-5">
                            <div className="font-bold text-stone-800">{r.name}</div>
                            <div className="text-[10px] text-stone-400 font-bold uppercase">{r.role}</div>
                          </td>
                          <td className="p-5">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black shadow-sm ${getStatusColor(r.status)}`}>
                              {getStatusLabel(r.status)}
                            </span>
                          </td>
                          <td className="p-5">
                            {r.imageUrl && r.imageUrl.length > 20 ? (
                              <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-white shadow-md hover:scale-110 transition-transform cursor-pointer bg-stone-100">
                                <img src={r.imageUrl} crossOrigin="anonymous" className="w-full h-full object-cover" alt="check-in" />
                              </div>
                            ) : <span className="text-[10px] text-stone-300 italic">ไม่มีรูป</span>}
                          </td>
                          <td className="p-5 text-right">
                            <button 
                              onClick={() => confirm('ยืนยันการลบรายการนี้?') && deleteRecord(r).then(syncData)} 
                              className="text-stone-300 hover:text-rose-500 p-2 bg-stone-50 rounded-lg transition-colors"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
           </div>
         )}
         
         {activeTab === 'official' && (
            <div className="p-8 bg-stone-50 min-h-[600px]">
               <div className="max-w-4xl mx-auto bg-white p-12 shadow-2xl rounded-[2rem] border border-stone-200">
                  <div className="text-center mb-10">
                     <img src={SCHOOL_LOGO_URL} alt="school logo" className="w-16 h-16 mx-auto mb-4 bg-white p-1 rounded-full shadow-md" />
                     <h1 className="text-2xl font-black text-stone-800">รายงานสรุปการลงปฏิบัติงานรายวัน</h1>
                     <p className="text-stone-500 font-bold">โรงเรียนประจักษ์ศิลปาคม สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาอุดรธานี</p>
                     <p className="text-rose-600 font-black mt-2">ประจำวันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                       <thead>
                          <tr className="bg-stone-800 text-white">
                             <th className="border border-stone-300 p-3 w-12 text-center">ที่</th>
                             <th className="border border-stone-300 p-3 text-left">ชื่อ - นามสกุล</th>
                             <th className="border border-stone-300 p-3 text-center">เวลามา</th>
                             <th className="border border-stone-300 p-3 text-center">เวลากลับ</th>
                             <th className="border border-stone-300 p-3 text-left">หมายเหตุ</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-stone-200">
                          {officialDailyData.map(d => (
                             <tr key={d.no} className="hover:bg-stone-50">
                                <td className="border border-stone-200 p-3 text-center font-bold text-stone-400">{d.no}</td>
                                <td className="border border-stone-200 p-3">
                                   <div className="font-black text-stone-800">{d.name}</div>
                                   <div className="text-[10px] text-stone-400 font-bold uppercase">{d.role}</div>
                                </td>
                                <td className={`border border-stone-200 p-3 text-center font-mono font-bold ${d.arrival !== '-' ? 'text-emerald-600' : 'text-stone-300'}`}>
                                  {d.arrival}
                                </td>
                                <td className={`border border-stone-200 p-3 text-center font-mono font-bold ${d.departure !== '-' ? 'text-blue-600' : 'text-stone-300'}`}>
                                  {d.departure}
                                </td>
                                <td className="border border-stone-200 p-3 text-xs italic text-rose-500 font-bold">
                                  {d.remark}
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-12 flex justify-between text-center no-print">
                     <div className="flex-1">
                        <p className="text-xs font-bold text-stone-400 mb-10">เจ้าหน้าที่ผู้สรุปรายงาน</p>
                        <p className="font-black text-stone-800">....................................................</p>
                        <p className="text-[10px] font-bold text-stone-400 mt-1">(....................................................)</p>
                     </div>
                     <div className="flex-1">
                        <p className="text-xs font-bold text-stone-400 mb-10">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                        <p className="font-black text-stone-800">....................................................</p>
                        <p className="text-[10px] font-bold text-stone-400 mt-1">(....................................................)</p>
                     </div>
                  </div>

                  <button 
                    onClick={() => window.print()}
                    className="mt-10 w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm no-print shadow-xl hover:bg-stone-800 transition-all active:scale-95"
                  >
                    🖨️ พิมพ์รายงานฉบับนี้
                  </button>
               </div>
            </div>
         )}
      </div>
    </div>
  );
};

export default Dashboard;
