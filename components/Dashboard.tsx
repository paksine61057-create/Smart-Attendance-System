
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff } from '../services/staffService';
import { getHoliday } from '../services/holidayService';
import { CheckInRecord, Staff, AttendanceType } from '../types';

type TabType = 'today' | 'official' | 'monthly' | 'admin_checkin';

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
  
  // --- Admin Manual Check-in States ---
  const [manualStaffId, setManualStaffId] = useState('');
  const [manualType, setManualType] = useState<AttendanceType>('arrival');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualTime, setManualTime] = useState(new Date().toLocaleTimeString('th-TH', { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(':', '.').split('.')[0] + ':' + new Date().getMinutes().toString().padStart(2, '0'));
  const [manualReason, setManualReason] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

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
        const holiday = getHoliday(checkDate);
        if (holiday) continue; 
        if (checkDate < STATS_START_DATE) continue;
        const now = new Date();
        const todayAtStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (checkDate > todayAtStart) continue;

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayRecs = allRecords.filter(r => {
          const d = new Date(r.timestamp);
          const rDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return rDate === dateStr && r.staffId?.toUpperCase() === staff.id.toUpperCase();
        });

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

  const handleManualSave = async () => {
    if (!manualStaffId) {
      alert('กรุณาเลือกบุคลากร');
      return;
    }
    const staff = staffList.find(s => s.id === manualStaffId);
    if (!staff) return;

    setIsSavingManual(true);
    try {
      const [year, month, day] = manualDate.split('-').map(Number);
      const [hour, min] = manualTime.split(':').map(Number);
      const timestamp = new Date(year, month - 1, day, hour, min).getTime();
      
      let status: any = 'Normal';
      if (manualType === 'arrival') {
        status = hour >= 8 && min >= 1 ? 'Late' : 'On Time';
      } else if (manualType === 'departure') {
        status = hour < 16 ? 'Early Leave' : 'Normal';
      } else if (manualType === 'authorized_late') {
        status = 'Authorized Late';
      } else if (['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(manualType)) {
        status = manualType.replace('_', ' ').split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      }

      const record: CheckInRecord = {
        id: crypto.randomUUID(),
        staffId: staff.id,
        name: staff.name,
        role: staff.role,
        type: manualType,
        timestamp,
        location: { lat: 0, lng: 0 },
        distanceFromBase: 0,
        status: status || 'Admin Assist',
        reason: manualReason + ' (โดยผู้ดูแลระบบ)',
        aiVerification: 'Admin manual entry'
      };

      await saveRecord(record);
      alert('บันทึกข้อมูลสำเร็จ');
      setManualReason('');
      syncData();
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setIsSavingManual(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const map: any = { 'On Time': 'ตรงเวลา', 'Late': 'มาสาย', 'Duty': 'ไปราชการ', 'Sick Leave': 'ลาป่วย', 'Personal Leave': 'ลากิจ', 'Normal': 'ปกติ' };
    return map[status] || status;
  };

  const getTypeLabel = (type: AttendanceType) => {
    const map: any = { 'arrival': '🌅 มาทำงาน', 'departure': '🏠 กลับบ้าน', 'duty': '🏛️ ไปราชการ', 'sick_leave': '🤒 ลาป่วย', 'personal_leave': '🙏 ลากิจ', 'authorized_late': '🕒 อนุญาตสาย' };
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
             <h2 className="text-2xl font-black text-white">Admin Dashboard</h2>
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
          ) : activeTab === 'admin_checkin' ? null : (
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
          { id: 'monthly', label: 'สถิติรายเดือน', emoji: '📊' },
          { id: 'admin_checkin', label: 'ลงเวลาแทน', emoji: '📝' }
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
            <div className="p-4 md:p-8 bg-white border-2 border-stone-100 rounded-[3rem] shadow-inner print-page-a4">
               <div className="text-center mb-8">
                  <img src={SCHOOL_LOGO_URL} alt="school logo" className="w-16 h-16 mx-auto mb-4 bg-white p-1 rounded-full shadow-md" />
                  <h1 className="text-2xl font-black text-stone-800">รายงานสรุปการลงปฏิบัติงานรายวัน</h1>
                  <p className="text-stone-500 font-bold">โรงเรียนประจักษ์ศิลปาคม สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาอุดรธานี</p>
                  <p className="text-rose-600 font-black mt-1">ประจำวันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full border-collapse border border-stone-800 text-[13px]">
                    <thead>
                       <tr className="bg-white text-stone-800 border-b-2 border-stone-800">
                          <th className="border border-stone-800 p-3 w-12 text-center font-black">ที่</th>
                          <th className="border border-stone-800 p-3 text-left font-black">ชื่อ - นามสกุล</th>
                          <th className="border border-stone-800 p-3 text-center font-black">ตำแหน่ง</th>
                          <th className="border border-stone-800 p-3 text-center font-black">เวลามา</th>
                          <th className="border border-stone-800 p-3 text-center font-black">เวลากลับ</th>
                          <th className="border border-stone-800 p-3 text-left font-black">หมายเหตุ</th>
                       </tr>
                    </thead>
                    <tbody>
                       {officialDailyData.map(d => (
                          <tr key={d.no} className="hover:bg-stone-50">
                             <td className="border border-stone-300 p-2 text-center text-stone-500 font-bold">{d.no}</td>
                             <td className="border border-stone-300 p-2">
                                <div className="font-bold text-stone-800">{d.name}</div>
                             </td>
                             <td className="border border-stone-300 p-2 text-center">
                                <div className="text-[10px] text-stone-500 font-bold uppercase tracking-tighter">{d.role}</div>
                             </td>
                             <td className={`border border-stone-300 p-2 text-center font-mono font-bold ${d.arrival !== '-' ? 'text-emerald-700' : 'text-stone-300'}`}>{d.arrival}</td>
                             <td className={`border border-stone-300 p-2 text-center font-mono font-bold ${d.departure !== '-' ? 'text-blue-700' : 'text-stone-300'}`}>{d.departure}</td>
                             <td className="border border-stone-300 p-2 text-[11px] italic text-rose-600 font-bold leading-tight">{d.remark}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
               
               <div className="mt-8 flex justify-around text-center">
                  <div className="flex-1">
                     <p className="text-[11px] font-bold text-stone-400 mb-10">เจ้าหน้าที่ผู้รับผิดชอบ</p>
                     <p className="font-bold text-stone-800">....................................................</p>
                     <p className="text-[10px] font-bold text-stone-400 mt-1">(....................................................)</p>
                  </div>
                  <div className="flex-1">
                     <p className="text-[11px] font-bold text-stone-400 mb-10">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                     <p className="font-bold text-stone-800">....................................................</p>
                     <p className="text-[10px] font-bold text-stone-400 mt-1">(....................................................)</p>
                  </div>
               </div>

               <button onClick={() => window.print()} className="mt-8 w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm no-print shadow-xl">🖨️ พิมพ์รายงานฉบับนี้</button>
            </div>
         )}

         {activeTab === 'monthly' && (
           <div className="p-4 md:p-8 bg-white border-2 border-stone-100 rounded-[3rem] shadow-inner print-page-a4">
             <div className="text-center mb-8">
                <img src={SCHOOL_LOGO_URL} alt="school logo" className="w-16 h-16 mx-auto mb-4 bg-white p-1 rounded-full shadow-md" />
                <h1 className="text-2xl font-black text-stone-800">รายงานสรุปสถิติการมาปฏิบัติราชการรายเดือน</h1>
                <p className="text-stone-500 font-bold">โรงเรียนประจักษ์ศิลปาคม สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาอุดรธานี</p>
                <div className="flex flex-col items-center gap-1 mt-1">
                    <p className="text-rose-600 font-black">ประจำเดือน {new Date(selectedMonth).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</p>
                    <span className="text-[9px] bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full font-bold border border-emerald-100">สถิติตั้งแต่วันที่ 11 ธ.ค. 2568 เป็นต้นไป</span>
                </div>
             </div>
             
             <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-stone-800 text-[12px]">
                  <thead>
                    <tr className="bg-white text-stone-800 border-b-2 border-stone-800">
                      <th className="border border-stone-800 p-3 w-10 text-center font-black">ที่</th>
                      <th className="border border-stone-800 p-3 text-left font-black">ชื่อ-นามสกุล</th>
                      <th className="border border-stone-800 p-3 text-left font-black">ตำแหน่ง</th>
                      <th className="border border-stone-800 p-3 text-center font-black">มาสาย (ครั้ง)</th>
                      <th className="border border-stone-800 p-3 text-left min-w-[110px] font-black">วันที่มาสาย</th>
                      <th className="border border-stone-800 p-3 text-center font-black">ไม่ลงเวลา (ครั้ง)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {monthlyStats.map(s => (
                      <tr key={s.id} className="hover:bg-stone-50 transition-colors">
                        <td className="border border-stone-300 p-2 text-center font-bold text-stone-400">{s.no}</td>
                        <td className="border border-stone-300 p-2">
                           <div className="font-bold text-stone-800">{s.name}</div>
                        </td>
                        <td className="border border-stone-300 p-2">
                           <div className="text-[9px] text-stone-400 font-bold uppercase tracking-tighter">{s.role}</div>
                        </td>
                        <td className="border border-stone-300 p-2 text-center font-mono font-black text-rose-600">
                          {s.lateCount > 0 ? s.lateCount : '-'}
                        </td>
                        <td className="border border-stone-300 p-2 text-stone-600 font-bold text-[10px] leading-tight whitespace-normal break-words max-w-[180px]">
                           {s.lateDates}
                        </td>
                        <td className="border border-stone-300 p-2 text-center font-mono font-bold text-stone-500">
                          {s.absentCount > 0 ? s.absentCount : '-'}
                        </td>
                      </tr>
                    ))}
                    {monthlyStats.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-16 text-center text-stone-300 font-bold italic">ไม่พบข้อมูลสถิติในเดือนนี้</td>
                      </tr>
                    )}
                  </tbody>
                </table>
             </div>
             
             <div className="mt-10 flex justify-between text-center">
                <div className="flex-1">
                   <p className="text-[11px] font-bold text-stone-400 mb-10">เจ้าหน้าที่ผู้สรุปรายงาน</p>
                   <p className="font-bold text-stone-800">....................................................</p>
                   <p className="text-[10px] font-bold text-stone-400 mt-1">(....................................................)</p>
                </div>
                <div className="flex-1">
                   <p className="text-[11px] font-bold text-stone-400 mb-10">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                   <p className="font-bold text-stone-800">....................................................</p>
                   <p className="text-[10px] font-bold text-stone-400 mt-1">(....................................................)</p>
                </div>
             </div>

             <button 
               onClick={() => window.print()} 
               className="mt-8 w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm no-print shadow-xl hover:bg-stone-800 transition-all active:scale-95"
             >
               🖨️ พิมพ์รายงานสถิติรายเดือน
             </button>
           </div>
         )}

         {activeTab === 'admin_checkin' && (
           <div className="p-4 md:p-10 bg-white border-2 border-stone-100 rounded-[3rem] shadow-inner max-w-2xl mx-auto">
              <div className="text-center mb-10">
                 <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121(2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                 </div>
                 <h2 className="text-2xl font-black text-stone-800 tracking-tight">ลงเวลาแทนบุคลากร</h2>
                 <p className="text-stone-500 font-bold text-xs uppercase tracking-widest mt-1">Manual Attendance Entry ❄️</p>
              </div>

              <div className="space-y-6">
                <div>
                   <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 ml-2">เลือกบุคลากร</label>
                   <select 
                    value={manualStaffId} 
                    onChange={e => setManualStaffId(e.target.value)}
                    className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold outline-none focus:border-rose-300"
                   >
                     <option value="">-- เลือกรายชื่อ --</option>
                     {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                   </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 ml-2">วันที่</label>
                    <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold outline-none focus:border-rose-300" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 ml-2">เวลา</label>
                    <input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold outline-none focus:border-rose-300" />
                  </div>
                </div>

                <div>
                   <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 ml-2">ประเภทการลงเวลา</label>
                   <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                     {[
                       { id: 'arrival', label: 'มาทำงาน', icon: '🌅' },
                       { id: 'departure', label: 'กลับบ้าน', icon: '🏠' },
                       { id: 'authorized_late', label: 'อนุญาตสาย', icon: '🕒' },
                       { id: 'duty', label: 'ไปราชการ', icon: '🏛️' },
                       { id: 'sick_leave', label: 'ลาป่วย', icon: '🤒' },
                       { id: 'personal_leave', label: 'ลากิจ', icon: '🙏' }
                     ].map(t => (
                       <button 
                        key={t.id} 
                        onClick={() => setManualType(t.id as AttendanceType)}
                        className={`p-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 transition-all ${manualType === t.id ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-stone-100 text-stone-500 hover:border-rose-100'}`}
                       >
                         <span>{t.icon}</span>
                         <span>{t.label}</span>
                       </button>
                     ))}
                   </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 ml-2">เหตุผล / หมายเหตุ</label>
                  <textarea 
                    value={manualReason} 
                    onChange={e => setManualReason(e.target.value)}
                    className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold outline-none focus:border-rose-300" 
                    rows={2} 
                    placeholder="ระบุเหตุผล (ถ้ามี)"
                  />
                </div>

                <button 
                  onClick={handleManualSave}
                  disabled={isSavingManual}
                  className="w-full py-5 bg-stone-900 text-white rounded-3xl font-black text-lg shadow-xl hover:bg-stone-800 transition-all active:scale-95 disabled:bg-stone-400"
                >
                  {isSavingManual ? '⏳ กำลังบันทึก...' : '✅ บันทึกการลงเวลา'}
                </button>
              </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default Dashboard;
