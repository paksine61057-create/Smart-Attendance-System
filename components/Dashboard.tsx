
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff, getStaffById } from '../services/staffService';
import { getHoliday } from '../services/holidayService';
import { CheckInRecord, Staff, AttendanceType } from '../types';

type TabType = 'today' | 'official' | 'monthly' | 'manual';

const SCHOOL_LOGO_URL = 'https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png';
const STATS_START_DATE = new Date(2025, 11, 11);

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); 
  const [previewData, setPreviewData] = useState<{url: string, title: string, time: string, ai: string} | null>(null);

  const [manualStaffId, setManualStaffId] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualTime, setManualTime] = useState(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.'));
  const [manualType, setManualType] = useState<AttendanceType>('arrival');
  const [manualReason, setManualReason] = useState('');

  const staffList = useMemo(() => getAllStaff(), []);
  const ATTENDANCE_START_TYPES: AttendanceType[] = ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'];

  const syncData = useCallback(async () => {
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
      setAllRecords(getRecords());
    } finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { syncData(); }, [syncData]);

  const filteredToday = useMemo(() => {
    return allRecords.filter(r => {
      const d = new Date(r.timestamp);
      const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateString === selectedDate;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [allRecords, selectedDate]);

  const dailyAnalysis = useMemo(() => {
    const presentIds = new Set(filteredToday.filter(r => ATTENDANCE_START_TYPES.includes(r.type)).map(r => r.staffId?.toUpperCase()));
    const absentStaff = staffList.filter(s => !presentIds.has(s.id.toUpperCase()));
    
    return {
      arrived: filteredToday.filter(r => r.type === 'arrival' && r.status === 'On Time').length,
      late: filteredToday.filter(r => r.status === 'Late').length,
      leave: filteredToday.filter(r => ['sick_leave', 'personal_leave', 'other_leave'].includes(r.type)).length,
      duty: filteredToday.filter(r => r.type === 'duty').length,
      absentCount: absentStaff.length,
      absentList: absentStaff
    };
  }, [filteredToday, staffList]);

  const officialDailyData = useMemo(() => {
    return staffList.map((staff, idx) => {
      const dayRecs = filteredToday.filter(r => r.staffId?.toUpperCase() === staff.id.toUpperCase());
      const earliestFirst = [...dayRecs].sort((a, b) => a.timestamp - b.timestamp);
      const latestFirst = [...dayRecs].sort((a, b) => b.timestamp - a.timestamp);

      const arrival = earliestFirst.find(r => ATTENDANCE_START_TYPES.includes(r.type));
      const departure = latestFirst.find(r => r.type === 'departure');
      
      let remark = '';
      if (arrival?.status === 'Late' || arrival?.type === 'duty' || arrival?.type.includes('leave')) {
        remark = arrival.reason || arrival.status;
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
    const map: any = { 'On Time': 'ตรงเวลา', 'Late': 'มาสาย', 'Duty': 'ไปราชการ', 'Sick Leave': 'ลาป่วย', 'Personal Leave': 'ลากิจ', 'Other Leave': 'ลาอื่นๆ', 'Normal': 'ปกติ' };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    if (['On Time', 'Normal'].includes(status)) return 'bg-emerald-100 text-emerald-700';
    if (status === 'Late') return 'bg-rose-100 text-rose-700';
    if (status === 'Duty') return 'bg-blue-100 text-blue-700';
    if (status.includes('Leave')) return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-20">
      {/* ส่วนอื่นๆ ของ Dashboard (Tabs, Table, Forms) คงเดิมตามไฟล์ที่เคยให้ไว้ข้างต้น */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/10 backdrop-blur-md p-8 rounded-[3rem] border border-white/20">
        <h2 className="text-4xl font-black text-white">Admin Dashboard ❄️</h2>
        <div className="flex gap-3">
          <button onClick={syncData} className="px-6 py-3 bg-white/20 text-white rounded-2xl font-bold transition-all shadow-lg active:scale-95">🔄 ซิงค์ข้อมูลล่าสุด</button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3 rounded-2xl bg-white font-bold text-rose-700 shadow-xl outline-none" />
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print">
        {['today', 'manual', 'official', 'monthly'].map(t => (
          <button key={t} onClick={() => setActiveTab(t as TabType)} className={`px-6 py-4 rounded-2xl font-black text-sm whitespace-nowrap transition-all shadow-lg ${activeTab === t ? 'bg-rose-600 text-white' : 'bg-white/80 text-stone-500'}`}>
            {t === 'today' ? '📅 รายการประจำวัน' : t === 'manual' ? '✍️ ลงเวลาแทน' : t === 'official' ? '📜 รายงานสรุปวัน' : '📊 สรุปรายเดือน'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] p-10 animate-in fade-in">
         {activeTab === 'today' && (
           <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b">
                    <th className="p-5">เวลามา</th>
                    <th className="p-5">ชื่อ-นามสกุล</th>
                    <th className="p-5">สถานะ</th>
                    <th className="p-5">รูปภาพ</th>
                    <th className="p-5 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {filteredToday.map(r => (
                    <tr key={r.id} className="hover:bg-rose-50/20">
                      <td className="p-5 font-mono font-black text-rose-500">{new Date(r.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-5 font-bold">{r.name}</td>
                      <td className="p-5">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black ${getStatusColor(r.status)}`}>
                          {getStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="p-5">
                        {r.imageUrl && <img src={r.imageUrl} crossOrigin="anonymous" className="w-10 h-10 rounded-lg object-cover border shadow-sm" alt="profile" />}
                      </td>
                      <td className="p-5 text-right">
                        <button onClick={() => confirm('ลบข้อมูล?') && deleteRecord(r).then(syncData)} className="text-stone-300 hover:text-rose-500">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
         )}
         
         {activeTab === 'official' && (
            <div className="bg-white p-10 border shadow-inner rounded-3xl overflow-auto">
               <div className="text-center mb-8">
                  <h1 className="text-xl font-black">รายงานการมาปฏิบัติราชการ</h1>
                  <p className="text-sm font-bold text-stone-500">วันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
               </div>
               <table className="w-full border-collapse border text-xs">
                  <thead>
                     <tr className="bg-stone-100">
                        <th className="border p-2">ที่</th>
                        <th className="border p-2">ชื่อ - นามสกุล</th>
                        <th className="border p-2">เวลามา</th>
                        <th className="border p-2">เวลากลับ</th>
                        <th className="border p-2">หมายเหตุ</th>
                     </tr>
                  </thead>
                  <tbody>
                     {officialDailyData.map(d => (
                        <tr key={d.no}>
                           <td className="border p-2 text-center">{d.no}</td>
                           <td className="border p-2 font-bold">{d.name}</td>
                           <td className="border p-2 text-center">{d.arrival}</td>
                           <td className="border p-2 text-center">{d.departure}</td>
                           <td className="border p-2 italic text-rose-600">{d.remark}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         )}
      </div>
    </div>
  );
};

export default Dashboard;
