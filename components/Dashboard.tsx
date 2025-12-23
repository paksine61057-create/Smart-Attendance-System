
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord } from '../services/storageService';
import { getAllStaff } from '../services/staffService';
import { getHoliday } from '../services/holidayService';
import { CheckInRecord, Staff, AttendanceType } from '../types';

type TabType = 'today' | 'official' | 'monthly';

const SCHOOL_LOGO_URL = 'https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png';

/**
 * วันที่เริ่มต้นนับสถิติ: 11 ธันวาคม 2568 (ค.ศ. 2025)
 */
const STATS_START_DATE = new Date(2025, 11, 11); 

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  
  const staffList = useMemo(() => getAllStaff(), []);
  const ATTENDANCE_START_TYPES: AttendanceType[] = ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'];

  const syncData = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncUnsyncedRecords();
      const cloud = await fetchGlobalRecords();
      const local = getRecords();
      const mergedMap = new Map<string, CheckInRecord>();
      
      const getSig = (r: CheckInRecord) => {
        const d = new Date(r.timestamp);
        return `${String(r.staffId || '').toUpperCase()}_${r.type}_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      };
      
      cloud.forEach(r => mergedMap.set(getSig(r), r));
      local.forEach(l => {
        const sig = getSig(l);
        if (!mergedMap.has(sig) || (l.imageUrl && l.imageUrl.length > (mergedMap.get(sig)?.imageUrl?.length || 0))) {
          mergedMap.set(sig, l);
        }
      });
      setAllRecords(Array.from(mergedMap.values()));
    } catch (e) {
      console.error("Sync failed", e);
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

  // --- Monthly Calculation Logic ---
  const monthlyStats = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const stats: any[] = [];

    staffList.forEach((staff, index) => {
      let lateCount = 0;
      let lateDatesArray: number[] = [];
      let absentCount = 0;
      let presentCount = 0;

      for (let day = 1; day <= lastDay; day++) {
        const checkDate = new Date(year, month - 1, day);
        
        // 1. ตรวจสอบว่าเป็นวันหยุดหรือไม่
        const holiday = getHoliday(checkDate);
        if (holiday) continue; 

        // 2. ตรวจสอบว่าถึงวันที่เริ่มต้นนับสถิติ (11 ธ.ค. 68) หรือยัง
        if (checkDate < STATS_START_DATE) continue;

        // 3. ไม่นับวันในอนาคตเป็นวันขาด
        const now = new Date();
        const todayAtStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (checkDate > todayAtStart) continue;

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayRecs = allRecords.filter(r => {
          const d = new Date(r.timestamp);
          const rDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return rDate === dateStr && r.staffId?.toUpperCase() === staff.id.toUpperCase();
        });

        // ดึงรายการลงเวลาครั้งแรกสุดของวันนั้น
        const arrival = dayRecs.filter(r => ATTENDANCE_START_TYPES.includes(r.type))
                               .sort((a, b) => a.timestamp - b.timestamp)[0];

        if (arrival) {
          presentCount++;
          if (arrival.status === 'Late') {
            lateCount++;
            lateDatesArray.push(day);
          }
        } else {
          absentCount++;
        }
      }

      stats.push({
        no: index + 1,
        ...staff,
        lateCount,
        lateDates: lateDatesArray.length > 0 ? lateDatesArray.join(', ') : '-',
        absentCount
      });
    });

    return stats;
  }, [allRecords, staffList, selectedMonth]);

  const officialDailyData = useMemo(() => {
    return staffList.map((staff, idx) => {
      const dayRecs = filteredToday.filter(r => r.staffId?.toUpperCase() === staff.id.toUpperCase());
      const arrival = [...dayRecs].filter(r => ATTENDANCE_START_TYPES.includes(r.type)).sort((a, b) => a.timestamp - b.timestamp)[0];
      const departure = [...dayRecs].filter(r => r.type === 'departure').sort((a, b) => b.timestamp - a.timestamp)[0];
      
      return {
        no: idx + 1,
        name: staff.name,
        role: staff.role,
        arrival: arrival ? new Date(arrival.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
        departure: departure ? new Date(departure.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-',
        remark: arrival?.reason || (arrival?.status === 'Late' ? 'มาสาย' : '')
      };
    });
  }, [staffList, filteredToday]);

  const getStatusLabel = (status: string) => {
    const map: any = { 'On Time': 'ตรงเวลา', 'Late': 'มาสาย', 'Duty': 'ไปราชการ', 'Sick Leave': 'ลาป่วย', 'Personal Leave': 'ลากิจ', 'Normal': 'ปกติ' };
    return map[status] || status;
  };

  const getTypeLabel = (type: AttendanceType) => {
    const map: any = { 'arrival': '🌅 มาทำงาน', 'departure': '🏠 กลับบ้าน', 'duty': '🏛️ ไปราชการ', 'sick_leave': '🤒 ลาป่วย', 'personal_leave': '🙏 ลากิจ' };
    return map[type] || type;
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-20 px-0 md:px-4">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/10 backdrop-blur-md p-8 rounded-[3rem] border border-white/20 shadow-xl mx-4">
        <div className="flex items-center gap-4 text-white">
          <div className="bg-white p-2 rounded-2xl shadow-lg">
             <img src={SCHOOL_LOGO_URL} alt="logo" className="w-10 h-10 object-contain" />
          </div>
          <div>
             <h2 className="text-2xl font-black">Admin Dashboard</h2>
             <p className="text-[10px] font-bold text-rose-200 uppercase tracking-widest">Attendance Management System ❄️</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button 
            onClick={syncData} 
            disabled={isSyncing}
            className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-lg flex items-center gap-2 ${isSyncing ? 'bg-stone-400 text-stone-200' : 'bg-white text-rose-600 hover:bg-rose-50'}`}
          >
            {isSyncing ? '⌛ กำลังโหลด...' : '🔄 ซิงค์ข้อมูลล่าสุด'}
          </button>
          {activeTab === 'monthly' ? (
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)} 
              className="px-5 py-3 rounded-2xl bg-white font-bold text-rose-700 shadow-xl outline-none" 
            />
          ) : (
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
              className="px-5 py-3 rounded-2xl bg-white font-bold text-rose-700 shadow-xl outline-none" 
            />
          )}
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print mx-4">
        {[
          { id: 'today', label: 'รายการวันนี้', emoji: '📅' },
          { id: 'official', label: 'รายงานสรุปวัน', emoji: '📜' },
          { id: 'monthly', label: 'สถิติรายเดือน', emoji: '📊' }
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

      {/* Content Area */}
      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] p-2 md:p-10 animate-in fade-in duration-500 mx-4">
         
         {activeTab === 'today' && (
           <div className="overflow-x-auto p-4">
              <h3 className="text-xl font-black text-stone-800 mb-6 px-2 flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                 รายการบันทึกเวลาวันนี้
              </h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b">
                    <th className="p-5">เวลา</th>
                    <th className="p-5">ประเภท</th>
                    <th className="p-5">ชื่อ-นามสกุล</th>
                    <th className="p-5">สถานะ</th>
                    <th className="p-5 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {filteredToday.map(r => (
                    <tr key={r.id} className="hover:bg-rose-50/20 group transition-colors">
                      <td className="p-5">
                         <div className="font-mono font-black text-rose-500 text-lg">
                           {new Date(r.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                         </div>
                      </td>
                      <td className="p-5">
                         <span className="text-[10px] font-black bg-stone-100 text-stone-500 px-3 py-1 rounded-lg">
                           {getTypeLabel(r.type)}
                         </span>
                      </td>
                      <td className="p-5 font-bold text-stone-700">{r.name}</td>
                      <td className="p-5">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black shadow-sm ${r.status === 'Late' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {getStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                        <button onClick={() => confirm('ลบรายการบันทึกนี้?') && deleteRecord(r).then(syncData)} className="text-stone-300 hover:text-rose-500 p-2 bg-stone-50 rounded-xl transition-all">🗑️</button>
                      </td>
                    </tr>
                  ))}
                  {filteredToday.length === 0 && (
                    <tr><td colSpan={5} className="p-20 text-center text-stone-300 font-bold italic">ไม่พบข้อมูลการลงเวลาในวันนี้ ❄️</td></tr>
                  )}
                </tbody>
              </table>
           </div>
         )}
         
         {activeTab === 'official' && (
            <div className="p-4 md:p-10 bg-white border-2 border-stone-100 rounded-[3rem] shadow-inner">
               <div className="text-center mb-10">
                  <img src={SCHOOL_LOGO_URL} alt="school logo" className="w-16 h-16 mx-auto mb-4 bg-white p-1 rounded-full shadow-md" />
                  <h1 className="text-2xl font-black text-stone-800">รายงานสรุปการลงปฏิบัติงานรายวัน</h1>
                  <p className="text-stone-500 font-bold">โรงเรียนประจักษ์ศิลปาคม สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาอุดรธานี</p>
                  <p className="text-rose-600 font-black mt-2">ประจำวันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full border-collapse border border-stone-300 text-sm">
                    <thead>
                       <tr className="bg-stone-800 text-white">
                          <th className="border border-stone-300 p-3 w-12 text-center">ที่</th>
                          <th className="border border-stone-300 p-3 text-left">ชื่อ - นามสกุล</th>
                          <th className="border border-stone-300 p-3 text-center">เวลามา</th>
                          <th className="border border-stone-300 p-3 text-center">เวลากลับ</th>
                          <th className="border border-stone-300 p-3 text-left">หมายเหตุ</th>
                       </tr>
                    </thead>
                    <tbody>
                       {officialDailyData.map(d => (
                          <tr key={d.no} className="hover:bg-stone-50">
                             <td className="border border-stone-200 p-3 text-center text-stone-400 font-bold">{d.no}</td>
                             <td className="border border-stone-200 p-3">
                                <div className="font-black text-stone-700">{d.name}</div>
                                <div className="text-[10px] text-stone-400 font-bold uppercase">{d.role}</div>
                             </td>
                             <td className={`border border-stone-200 p-3 text-center font-mono font-bold ${d.arrival !== '-' ? 'text-emerald-600' : 'text-stone-300'}`}>{d.arrival}</td>
                             <td className={`border border-stone-200 p-3 text-center font-mono font-bold ${d.departure !== '-' ? 'text-blue-600' : 'text-stone-300'}`}>{d.departure}</td>
                             <td className="border border-stone-200 p-3 text-xs italic text-rose-500 font-bold">{d.remark}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
               <button onClick={() => window.print()} className="mt-8 w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm no-print shadow-xl">🖨️ พิมพ์รายงานฉบับนี้</button>
            </div>
         )}

         {activeTab === 'monthly' && (
           <div className="p-4 md:p-10 bg-white border-2 border-stone-100 rounded-[3rem] shadow-inner">
             <div className="text-center mb-10">
                <img src={SCHOOL_LOGO_URL} alt="school logo" className="w-20 h-20 mx-auto mb-4 bg-white p-1 rounded-full shadow-md" />
                <h1 className="text-2xl font-black text-stone-800">รายงานสรุปสถิติการมาปฏิบัติราชการรายเดือน</h1>
                <p className="text-stone-500 font-bold">โรงเรียนประจักษ์ศิลปาคม สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาอุดรธานี</p>
                <div className="flex flex-col items-center gap-1 mt-2">
                    <p className="text-rose-600 font-black">ประจำเดือน {new Date(selectedMonth).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</p>
                    <span className="text-[10px] bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full font-bold">เริ่มนับสถิติตั้งแต่วันที่ 11 ธ.ค. 2568</span>
                </div>
             </div>
             
             <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-stone-300 text-[13px]">
                  <thead>
                    <tr className="bg-stone-800 text-white">
                      <th className="border border-stone-300 p-3 w-12 text-center">ที่</th>
                      <th className="border border-stone-300 p-3 text-left">ชื่อ-นามสกุล</th>
                      <th className="border border-stone-300 p-3 text-left">ตำแหน่ง</th>
                      <th className="border border-stone-300 p-3 text-center">มาสาย (ครั้ง)</th>
                      <th className="border border-stone-300 p-3 text-left min-w-[120px]">วันที่มาสาย</th>
                      <th className="border border-stone-300 p-3 text-center">ไม่ลงเวลา (ครั้ง)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {monthlyStats.map(s => (
                      <tr key={s.id} className="hover:bg-stone-50 transition-colors">
                        <td className="border border-stone-200 p-3 text-center font-bold text-stone-400">{s.no}</td>
                        <td className="border border-stone-200 p-3">
                           <div className="font-black text-stone-800">{s.name}</div>
                        </td>
                        <td className="border border-stone-200 p-3">
                           <div className="text-[10px] text-stone-400 font-bold uppercase">{s.role}</div>
                        </td>
                        <td className="border border-stone-200 p-3 text-center font-mono font-black text-rose-600 text-lg">
                          {s.lateCount > 0 ? s.lateCount : '-'}
                        </td>
                        <td className="border border-stone-200 p-3 text-stone-600 font-bold leading-relaxed whitespace-normal break-words max-w-[200px]">
                           {s.lateDates}
                        </td>
                        <td className="border border-stone-200 p-3 text-center font-mono font-black text-stone-500 text-lg">
                          {s.absentCount > 0 ? s.absentCount : '-'}
                        </td>
                      </tr>
                    ))}
                    {monthlyStats.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-20 text-center text-stone-300 font-bold italic">ไม่พบข้อมูลสถิติในเดือนนี้</td>
                      </tr>
                    )}
                  </tbody>
                </table>
             </div>
             
             <div className="mt-12 flex justify-between text-center no-print">
                <div className="flex-1">
                   <p className="text-xs font-bold text-stone-400 mb-12">เจ้าหน้าที่ผู้สรุปรายงาน</p>
                   <p className="font-black text-stone-800">....................................................</p>
                   <p className="text-[10px] font-bold text-stone-400 mt-1">(....................................................)</p>
                </div>
                <div className="flex-1">
                   <p className="text-xs font-bold text-stone-400 mb-12">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                   <p className="font-black text-stone-800">....................................................</p>
                   <p className="text-[10px] font-bold text-stone-400 mt-1">(....................................................)</p>
                </div>
             </div>

             <div className="mt-8 p-6 bg-amber-50 rounded-[2rem] border-2 border-amber-100 text-amber-800 no-print">
                <p className="text-xs font-black flex items-center gap-2">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                   หมายเหตุการสรุปสถิติ
                </p>
                <ul className="text-[10px] mt-2 space-y-1 font-bold list-disc ml-5 opacity-80">
                   <li>ไม่นับวันเสาร์-อาทิตย์ และวันหยุดพิเศษตามประกาศของโรงเรียน</li>
                   <li>การลงเวลาประเภท "ไปราชการ" หรือ "ลา" จะไม่ถูกนับเป็นวันขาด (ไม่ลงเวลา)</li>
                   <li>สถิติจะถูกคำนวณตั้งแต่วันที่ 11 ธันวาคม 2568 เป็นต้นไป</li>
                </ul>
             </div>

             <button 
               onClick={() => window.print()} 
               className="mt-8 w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm no-print shadow-xl hover:bg-stone-800 transition-all active:scale-95"
             >
               🖨️ พิมพ์รายงานสถิติรายเดือน
             </button>
           </div>
         )}
      </div>
    </div>
  );
};

export default Dashboard;
