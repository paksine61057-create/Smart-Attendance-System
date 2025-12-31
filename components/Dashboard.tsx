
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff } from '../services/staffService';
import { getHoliday } from '../services/holidayService';
import { CheckInRecord, Staff, AttendanceType } from '../types';

type TabType = 'today' | 'official' | 'monthly' | 'admin_checkin';

const SCHOOL_LOGO_URL = 'https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png';
const STATS_START_DATE = new Date(2025, 11, 11, 0, 0, 0); 

const getLocalDateString = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Helper function to get readable labels for attendance types
const getTypeLabel = (type: AttendanceType): string => {
  switch (type) {
    case 'arrival': return '🌅 มาทำงาน';
    case 'departure': return '🏠 กลับบ้าน';
    case 'duty': return '🏛️ ไปราชการ';
    case 'sick_leave': return '🤒 ลาป่วย';
    case 'personal_leave': return '🙏 ลากิจ';
    case 'authorized_late': return '🕒 ขอเข้าสาย';
    case 'other_leave': return '📝 อื่นๆ';
    default: return type;
  }
};

// Helper function to get readable labels for status
const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'On Time': return 'มาตรงเวลา';
    case 'Late': return 'มาสาย';
    case 'Normal': return 'ปกติ';
    case 'Early Leave': return 'กลับก่อนเวลา';
    case 'Duty': return 'ไปราชการ';
    case 'Sick Leave': return 'ลาป่วย';
    case 'Personal Leave': return 'ลากิจ';
    case 'Other Leave': return 'ลาอื่นๆ';
    case 'Authorized Late': return 'ขอเข้าสาย';
    case 'Admin Assist': return 'แอดมินบันทึก';
    default: return status;
  }
};

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')); 
  
  const [manualStaffId, setManualStaffId] = useState('');
  const [manualType, setManualType] = useState<AttendanceType>('arrival');
  const [manualDate, setManualDate] = useState(todayStr);
  const [manualTime, setManualTime] = useState(new Date().toLocaleTimeString('th-TH', { hour12: false, hour: '2-digit', minute: '2-digit' }));
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
      
      const getSig = (r: CheckInRecord) => `${String(r.staffId || '').toUpperCase()}_${r.type}_${r.timestamp}`;
      
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

  useEffect(() => { syncData(); }, []);

  const filteredToday = useMemo(() => {
    return allRecords.filter(r => getLocalDateString(new Date(r.timestamp)) === selectedDate).sort((a, b) => b.timestamp - a.timestamp);
  }, [allRecords, selectedDate]);

  const missingStaff = useMemo(() => {
    if (selectedDate !== todayStr) return [];
    const presentStaffIds = new Set(filteredToday.filter(r => ATTENDANCE_START_TYPES.includes(r.type)).map(r => r.staffId?.toUpperCase()));
    return staffList.filter(s => !presentStaffIds.has(s.id.toUpperCase()));
  }, [staffList, filteredToday, selectedDate, todayStr]);

  const monthlyStats = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const stats: any[] = [];

    staffList.forEach((staff, index) => {
      let lateCount = 0; let lateDatesArray: number[] = []; let absentCount = 0; let presentCount = 0;
      for (let day = 1; day <= lastDay; day++) {
        const checkDate = new Date(year, month - 1, day, 0, 0, 0);
        if (getHoliday(checkDate)) continue; 
        if (checkDate.getTime() < STATS_START_DATE.getTime()) continue;
        const now = new Date(); if (checkDate.getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime()) continue;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayRecs = allRecords.filter(r => getLocalDateString(new Date(r.timestamp)) === dateStr && r.staffId?.toUpperCase() === staff.id.toUpperCase());
        const arrival = dayRecs.filter(r => ATTENDANCE_START_TYPES.includes(r.type)).sort((a, b) => a.timestamp - b.timestamp)[0];
        if (arrival) { presentCount++; if (arrival.status === 'Late') { lateCount++; lateDatesArray.push(day); } } else { absentCount++; }
      }
      stats.push({ no: index + 1, ...staff, lateCount, lateDates: lateDatesArray.length > 0 ? lateDatesArray.join(', ') : '-', absentCount });
    });
    return stats;
  }, [allRecords, staffList, selectedMonth]);

  const officialDailyData = useMemo(() => {
    return staffList.map((staff, idx) => {
      const dayRecs = filteredToday.filter(r => r.staffId?.toUpperCase() === staff.id.toUpperCase());
      const arrival = [...dayRecs].filter(r => ATTENDANCE_START_TYPES.includes(r.type)).sort((a, b) => a.timestamp - b.timestamp)[0];
      const departure = [...dayRecs].filter(r => r.type === 'departure').sort((a, b) => b.timestamp - a.timestamp)[0];
      const isLeaveOrDuty = (r?: CheckInRecord) => r ? ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type) : false;
      const getLeaveLabel = (type: AttendanceType) => ({ 'duty': 'ไปราชการ', 'sick_leave': 'ลาป่วย', 'personal_leave': 'ลากิจ', 'authorized_late': 'ขอเข้าสาย', 'other_leave': 'ลาอื่นๆ' }[type] || type);
      const cleanReasonSnippet = (str?: string) => str ? str.replace(/\((บันทึกด่วนโดยแอดมิน|โดยผู้ดูแลระบบ|แอดมินบันทึก)\)/g, '').trim() : '';

      let arrivalVal = '-'; let departureVal = '-'; let remarkParts: string[] = [];
      if (arrival) {
          if (isLeaveOrDuty(arrival)) {
              const label = getLeaveLabel(arrival.type); arrivalVal = label; departureVal = label;
              const rSnippet = cleanReasonSnippet(arrival.reason); if (rSnippet) remarkParts.push(rSnippet);
          } else {
              arrivalVal = new Date(arrival.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
              if (arrival.type === 'authorized_late' || arrival.status === 'Late') {
                  let txt = arrival.type === 'authorized_late' ? 'ขอเข้าสาย' : 'มาสาย';
                  const rSnippet = cleanReasonSnippet(arrival.reason); if (rSnippet) txt += `: ${rSnippet}`;
                  remarkParts.push(txt);
              } else { const rSnippet = cleanReasonSnippet(arrival.reason); if (rSnippet) remarkParts.push(rSnippet); }
          }
      }
      if (departure && !isLeaveOrDuty(arrival)) {
          departureVal = new Date(departure.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          if (departure.status === 'Early Leave') {
             let txt = 'กลับก่อนเวลา'; const rSnippet = cleanReasonSnippet(departure.reason); if (rSnippet) txt += `: ${rSnippet}`;
             remarkParts.push(txt);
          } else { const rSnippet = cleanReasonSnippet(departure.reason); if (rSnippet && !remarkParts.includes(rSnippet)) remarkParts.push(rSnippet); }
      }
      const isAdminEntry = (arrival?.aiVerification?.toLowerCase().includes('admin') || arrival?.reason?.includes('(แอดมินบันทึก)') || arrival?.reason?.includes('(โดยผู้ดูแลระบบ)'));
      let finalRemark = remarkParts.filter(p => p && p !== '-').join(', ');
      if (isAdminEntry) finalRemark = (finalRemark ? finalRemark + ' ' : '') + '(แอดมินบันทึก)';
      return { no: idx + 1, name: staff.name, role: staff.role, arrival: arrivalVal, departure: departureVal, remark: finalRemark };
    });
  }, [staffList, filteredToday]);

  const handleManualSave = async () => {
    if (!manualStaffId) return alert('กรุณาเลือกบุคลากร');
    const staff = staffList.find(s => s.id === manualStaffId); if (!staff) return;
    setIsSavingManual(true);
    try {
      const [year, month, day] = manualDate.split('-').map(Number); const [hour, min] = manualTime.split(':').map(Number);
      const timestamp = new Date(year, month - 1, day, hour, min).getTime();
      let status: any = 'Normal';
      if (manualType === 'arrival') status = hour >= 8 && min >= 1 ? 'Late' : 'On Time';
      else if (manualType === 'departure') status = hour < 16 ? 'Early Leave' : 'Normal';
      else if (manualType === 'authorized_late') status = 'Authorized Late';
      else if (['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(manualType)) status = manualType.replace('_', ' ').split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      const record: CheckInRecord = { id: crypto.randomUUID(), staffId: staff.id, name: staff.name, role: staff.role, type: manualType, timestamp, location: { lat: 0, lng: 0 }, distanceFromBase: 0, status: status || 'Admin Assist', reason: manualReason + ' (โดยผู้ดูแลระบบ)', aiVerification: 'Admin manual entry' };
      await saveRecord(record); alert('บันทึกข้อมูลสำเร็จ'); setManualReason(''); syncData();
    } catch (e) { alert('เกิดข้อผิดพลาดในการบันทึก'); } finally { setIsSavingManual(false); }
  };

  const handleQuickRecord = async (staff: Staff, type: AttendanceType) => {
    let status: any = 'Admin Assist'; let reasonText = '';
    if (type === 'duty') { status = 'Duty'; reasonText = 'ไปราชการ'; }
    else if (type === 'sick_leave') { status = 'Sick Leave'; reasonText = 'ลาป่วย'; }
    else if (type === 'personal_leave') { status = 'Personal Leave'; reasonText = 'ลากิจ'; }
    else if (type === 'authorized_late') { status = 'Authorized Late'; reasonText = 'ขอเข้าสาย (ได้รับอนุญาต)'; }
    const record: CheckInRecord = { id: crypto.randomUUID(), staffId: staff.id, name: staff.name, role: staff.role, type: type, timestamp: Date.now(), location: { lat: 0, lng: 0 }, distanceFromBase: 0, status: status, reason: reasonText + ' (บันทึกด่วนโดยแอดมิน)', aiVerification: 'Admin quick entry' };
    try { await saveRecord(record); syncData(); } catch (e) { alert('เกิดข้อผิดพลาดในการบันทึก'); }
  };

  return (
    <div className="w-full max-w-7xl mx-auto pb-20 px-0 md:px-4">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/60 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/40 shadow-xl shadow-purple-100/50 mx-4">
        <div className="flex items-center gap-5">
          <div className="bg-gradient-to-br from-purple-100 to-pink-50 p-2.5 rounded-2xl shadow-sm border border-purple-100">
             <img src={SCHOOL_LOGO_URL} alt="logo" className="w-10 h-10 object-contain" />
          </div>
          <div>
             <h2 className="text-2xl font-black text-purple-900 leading-tight">Admin Dashboard</h2>
             <p className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] opacity-80">Prachak Identity Management</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button 
            onClick={syncData} 
            disabled={isSyncing}
            className={`px-6 py-3.5 rounded-2xl font-black text-xs transition-all shadow-md flex items-center gap-3 uppercase tracking-wider ${isSyncing ? 'bg-purple-100 text-purple-400' : 'bg-purple-600 text-white hover:bg-purple-700 hover:scale-105 active:scale-95'}`}
          >
            {isSyncing ? '⌛ Syncing...' : '🔄 Sync Database'}
          </button>
          {activeTab === 'monthly' ? (
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="px-5 py-3.5 rounded-2xl bg-white border border-purple-100 font-black text-purple-800 shadow-sm outline-none focus:ring-4 focus:ring-purple-100 transition-all text-xs" />
          ) : activeTab === 'admin_checkin' ? null : (
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3.5 rounded-2xl bg-white border border-purple-100 font-black text-purple-800 shadow-sm outline-none focus:ring-4 focus:ring-purple-100 transition-all text-xs" />
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-8 overflow-x-auto pb-3 no-print mx-4 scrollbar-hide">
        {[
          { id: 'today', label: 'บันทึกเวลาวันนี้', emoji: '🕒' },
          { id: 'official', label: 'รายงานสรุปวัน', emoji: '📜' },
          { id: 'monthly', label: 'สถิติรายเดือน', emoji: '📊' },
          { id: 'admin_checkin', label: 'ลงเวลาแทน', emoji: '📝' }
        ].map(t => (
          <button 
            key={t.id} 
            onClick={() => setActiveTab(t.id as TabType)} 
            className={`px-8 py-4 rounded-[2rem] font-black text-sm whitespace-nowrap transition-all flex items-center gap-3 ${activeTab === t.id ? 'bg-white text-purple-700 shadow-xl shadow-purple-200/50 ring-2 ring-purple-100 scale-105' : 'bg-purple-50/50 text-purple-400 hover:bg-white hover:text-purple-600'}`}
          >
            <span className="text-xl">{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white/90 backdrop-blur-xl rounded-[4rem] shadow-2xl border border-white/60 overflow-hidden min-h-[650px] p-2 md:p-10 animate-in fade-in duration-700 mx-4">
         
         {activeTab === 'today' && (
           <div className="p-4 space-y-12">
              <div>
                 <h3 className="text-xl font-black text-purple-900 mb-8 flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shadow-glow"></span>
                    รายการลงเวลาประจำวัน
                 </h3>
                 <div className="overflow-x-auto rounded-3xl border border-purple-50">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-purple-50/50 text-[10px] font-black uppercase text-purple-400 border-b border-purple-100">
                          <th className="p-6">เวลา (Time)</th>
                          <th className="p-6">ประเภท</th>
                          <th className="p-6">รูปยืนยัน</th>
                          <th className="p-6">ชื่อ-นามสกุล</th>
                          <th className="p-6">สถานะ</th>
                          <th className="p-6 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-50/50">
                        {filteredToday.map(r => (
                          <tr key={r.id} className="hover:bg-purple-50/30 transition-colors group">
                            <td className="p-6">
                               <div className="font-mono font-black text-purple-700 text-lg">{new Date(r.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td className="p-6">
                               <span className="text-[10px] font-black bg-purple-100/50 text-purple-600 px-3 py-1.5 rounded-xl uppercase tracking-tighter">
                                 {getTypeLabel(r.type).split(' ')[1]}
                               </span>
                            </td>
                            <td className="p-6">
                               {r.imageUrl ? (
                                 <button onClick={() => setPreviewImage(r.imageUrl || null)} className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-white shadow-md hover:scale-110 transition-all">
                                   <img src={r.imageUrl} alt="AI" className="w-full h-full object-cover" />
                                   <div className="absolute inset-0 bg-purple-900/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[8px] font-black uppercase">View</div>
                                 </button>
                               ) : <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-[8px] font-black text-purple-200 uppercase text-center leading-none">N/A</div>}
                            </td>
                            <td className="p-6 font-black text-purple-900 whitespace-nowrap min-w-[200px]">{r.name}</td>
                            <td className="p-6">
                              <span className={`px-4 py-2 rounded-2xl text-[10px] font-black shadow-sm ${r.status === 'Late' || r.status === 'Early Leave' ? 'bg-pink-100 text-pink-700' : 'bg-purple-100 text-purple-700'}`}>
                                {getStatusLabel(r.status)}
                              </span>
                            </td>
                            <td className="p-6 text-right">
                              <button onClick={() => confirm('ลบรายการบันทึกนี้?') && deleteRecord(r).then(syncData)} className="p-2.5 bg-purple-50 text-purple-300 hover:text-pink-600 rounded-xl transition-all hover:bg-pink-50">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredToday.length === 0 && (
                          <tr><td colSpan={6} className="p-32 text-center text-purple-300 font-black uppercase tracking-[0.2em] italic">No attendance data today</td></tr>
                        )}
                      </tbody>
                    </table>
                 </div>
              </div>

              {missingStaff.length > 0 && (
                <div className="pt-12 border-t-2 border-purple-50">
                   <h3 className="text-xl font-black text-pink-600 mb-8 flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-pulse shadow-glow"></span>
                      ยังไม่ได้ลงเวลาวันนี้ ({missingStaff.length} คน)
                   </h3>
                   <div className="overflow-x-auto rounded-3xl border border-purple-50">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-purple-50/30 text-[10px] font-black uppercase text-purple-400 border-b border-purple-100">
                            <th className="p-6 w-[250px]">ชื่อ-นามสกุล</th>
                            <th className="p-6 w-[180px]">ตำแหน่ง</th>
                            <th className="p-6">บันทึกสถานะพิเศษ (Quick Actions)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-50/50">
                          {missingStaff.map(s => (
                            <tr key={s.id} className="hover:bg-purple-50/20 transition-colors">
                              <td className="p-6">
                                 <div className="font-black text-purple-900">{s.name}</div>
                                 <div className="text-[9px] text-purple-300 font-bold uppercase tracking-widest">{s.id}</div>
                              </td>
                              <td className="p-6">
                                 <div className="text-[10px] text-purple-500 font-black uppercase tracking-tighter">{s.role}</div>
                              </td>
                              <td className="p-6">
                                 <div className="flex flex-wrap gap-2">
                                    <button onClick={() => handleQuickRecord(s, 'duty')} className="px-4 py-2 bg-purple-50 text-purple-700 rounded-[1rem] text-[9px] font-black hover:bg-purple-700 hover:text-white transition-all shadow-sm border border-purple-100">🏛️ ไปราชการ</button>
                                    <button onClick={() => handleQuickRecord(s, 'personal_leave')} className="px-4 py-2 bg-pink-50 text-pink-700 rounded-[1rem] text-[9px] font-black hover:bg-pink-600 hover:text-white transition-all shadow-sm border border-pink-100">🙏 ลากิจ</button>
                                    <button onClick={() => handleQuickRecord(s, 'sick_leave')} className="px-4 py-2 bg-amber-50 text-amber-700 rounded-[1rem] text-[9px] font-black hover:bg-amber-500 hover:text-white transition-all shadow-sm border border-amber-100">🤒 ลาป่วย</button>
                                    <button onClick={() => handleQuickRecord(s, 'authorized_late')} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-[1rem] text-[9px] font-black hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100">🕒 อนุญาตสาย</button>
                                 </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                </div>
              )}
           </div>
         )}
         
         {activeTab === 'official' && (
            <div className="p-4 md:p-8 bg-white border-2 border-purple-100 rounded-[3rem] shadow-inner print-page-a4 flex flex-col mx-auto">
               <div className="text-center mb-6">
                  <img src={SCHOOL_LOGO_URL} alt="school logo" className="school-logo-print w-16 h-16 mx-auto mb-3 bg-white p-1 rounded-full shadow-md" />
                  <h1 className="text-xl font-black text-purple-950 leading-tight">รายงานสรุปการลงปฏิบัติงานรายวัน</h1>
                  <p className="text-purple-400 font-bold text-[10px] leading-tight uppercase tracking-widest mt-1">Prachaksinlapakhom School Identity</p>
                  <div className="mt-2 h-1 w-20 bg-gradient-to-r from-purple-500 to-pink-500 mx-auto rounded-full"></div>
                  <p className="text-purple-900 font-black mt-3 text-sm">ประจำวันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
               </div>
               <div className="flex-1">
                 <table className="w-full border-collapse border border-purple-950 text-[11px] table-fixed">
                    <thead>
                       <tr className="bg-purple-50 text-purple-950 border-b border-purple-950">
                          <th className="border border-purple-950 py-1.5 px-2 w-[35px] text-center font-black">ที่</th>
                          <th className="border border-purple-950 py-1.5 px-2 text-left font-black w-[160px]">ชื่อ - นามสกุล</th>
                          <th className="border border-purple-950 py-1.5 px-2 text-center font-black w-[130px]">ตำแหน่ง</th>
                          <th className="border border-purple-950 py-1.5 px-2 text-center font-black w-[65px]">เวลามา</th>
                          <th className="border border-purple-950 py-1.5 px-2 text-center font-black w-[65px]">เวลากลับ</th>
                          <th className="border border-purple-950 py-1.5 px-2 text-left font-black">หมายเหตุ</th>
                       </tr>
                    </thead>
                    <tbody>
                       {officialDailyData.map(d => (
                          <tr key={d.no} className="hover:bg-purple-50/50">
                             <td className="border border-purple-950 py-1 px-1 text-center text-purple-800 font-bold">{d.no}</td>
                             <td className="border border-purple-950 py-1 px-2 whitespace-nowrap overflow-hidden text-ellipsis font-black text-purple-950">{d.name}</td>
                             <td className="border border-purple-950 py-1 px-1 text-center whitespace-nowrap overflow-hidden text-ellipsis text-[10px] font-bold text-purple-500">{d.role}</td>
                             <td className={`border border-purple-950 py-1 px-1 text-center font-mono font-black ${d.arrival !== '-' && !ATTENDANCE_START_TYPES.includes(d.arrival as any) ? 'text-purple-700' : 'text-pink-600'}`}>{d.arrival}</td>
                             <td className={`border border-purple-950 py-1 px-1 text-center font-mono font-black ${d.departure !== '-' && !ATTENDANCE_START_TYPES.includes(d.departure as any) ? 'text-purple-700' : 'text-pink-600'}`}>{d.departure}</td>
                             <td className="border border-purple-950 py-1 px-2 text-[9px] italic text-purple-400 font-bold leading-tight break-words">{d.remark}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
               <div className="signature-section mt-10 flex justify-around text-center border-t border-dashed border-purple-100 pt-6">
                  <div className="flex-1">
                     <p className="text-[10px] font-black text-purple-300 mb-10 uppercase tracking-widest">เจ้าหน้าที่ผู้รับผิดชอบ</p>
                     <p className="font-bold text-purple-900 text-xs">....................................................</p>
                     <p className="text-[10px] font-bold text-purple-300 mt-2">(....................................................)</p>
                  </div>
                  <div className="flex-1">
                     <p className="text-[10px] font-black text-purple-300 mb-10 uppercase tracking-widest">ผู้อำนวยการโรงเรียน</p>
                     <p className="font-bold text-purple-900 text-xs">....................................................</p>
                     <p className="text-[10px] font-bold text-purple-300 mt-2">(....................................................)</p>
                  </div>
               </div>
               <button onClick={() => window.print()} className="mt-10 w-full py-5 bg-gradient-to-r from-purple-800 to-purple-950 text-white rounded-[2rem] font-black text-sm no-print shadow-xl hover:scale-[1.01] active:scale-95 transition-all">🖨️ พิมพ์รายงานสรุปรายวัน</button>
            </div>
         )}

         {activeTab === 'monthly' && (
           <div className="p-4 md:p-8 bg-white border-2 border-purple-100 rounded-[3rem] shadow-inner print-page-a4 flex flex-col mx-auto">
             <div className="text-center mb-6">
                <img src={SCHOOL_LOGO_URL} alt="school logo" className="school-logo-print w-16 h-16 mx-auto mb-3 bg-white p-1 rounded-full shadow-md" />
                <h1 className="text-xl font-black text-purple-950 leading-tight">สถิติการมาปฏิบัติราชการรายเดือน</h1>
                <p className="text-purple-400 font-bold text-[10px] leading-tight uppercase tracking-widest mt-1">Modern Attendance Analytics</p>
                <div className="mt-2 h-1 w-24 bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 mx-auto rounded-full"></div>
                <div className="flex flex-col items-center gap-1 mt-3">
                    <p className="text-purple-900 font-black text-base">เดือน {new Date(selectedMonth).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</p>
                </div>
             </div>
             <div className="flex-1">
                <table className="w-full border-collapse border border-purple-950 text-[11px] table-fixed">
                  <thead>
                    <tr className="bg-purple-50 text-purple-950 border-b border-purple-950">
                      <th className="border border-purple-950 py-1.5 px-2 w-[35px] text-center font-black">ที่</th>
                      <th className="border border-purple-950 py-1.5 px-2 text-left font-black w-[160px]">ชื่อ-นามสกุล</th>
                      <th className="border border-purple-950 py-1.5 px-2 text-center font-black w-[130px]">ตำแหน่ง</th>
                      <th className="border border-purple-950 py-1.5 px-2 text-center font-black w-[60px]">สาย (ครั้ง)</th>
                      <th className="border border-purple-950 py-1.5 px-2 text-center font-black">วันที่มาสาย</th>
                      <th className="border border-purple-950 py-1.5 px-2 text-center font-black w-[65px]">ขาด/ไม่ลง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-200">
                    {monthlyStats.map(s => (
                      <tr key={s.id} className="hover:bg-purple-50/50 transition-colors">
                        <td className="border border-purple-950 py-1 px-1 text-center font-bold text-purple-300">{s.no}</td>
                        <td className="border border-purple-950 py-1 px-2 text-left whitespace-nowrap overflow-hidden text-ellipsis font-black text-purple-950">{s.name}</td>
                        <td className="border border-purple-950 py-1 px-1 text-center whitespace-nowrap overflow-hidden text-ellipsis text-[9px] font-bold text-purple-400 uppercase tracking-tighter">{s.role}</td>
                        <td className="border border-purple-950 py-1 px-1 text-center font-mono font-black text-pink-600">{s.lateCount > 0 ? s.lateCount : '-'}</td>
                        <td className="border border-purple-950 py-1 px-2 text-center text-purple-500 font-bold text-[9px] leading-tight break-words">{s.lateDates}</td>
                        <td className="border border-purple-950 py-1 px-1 text-center font-mono font-bold text-purple-200">{s.absentCount > 0 ? s.absentCount : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
             <div className="signature-section mt-10 flex justify-between text-center border-t border-dashed border-purple-100 pt-6">
                <div className="flex-1">
                   <p className="text-[10px] font-black text-purple-300 mb-10 uppercase tracking-widest">ผู้สรุปรายงาน</p>
                   <p className="font-bold text-purple-900 text-xs">....................................................</p>
                   <p className="text-[10px] font-bold text-purple-300 mt-2">(....................................................)</p>
                </div>
                <div className="flex-1">
                   <p className="text-[10px] font-black text-purple-300 mb-10 uppercase tracking-widest">ผู้อำนวยการโรงเรียน</p>
                   <p className="font-bold text-purple-900 text-xs">....................................................</p>
                   <p className="text-[10px] font-bold text-purple-300 mt-2">(....................................................)</p>
                </div>
             </div>
             <button onClick={() => window.print()} className="mt-10 w-full py-5 bg-gradient-to-r from-purple-800 to-purple-950 text-white rounded-[2rem] font-black text-sm no-print shadow-xl hover:scale-[1.01] active:scale-95">🖨️ พิมพ์รายงานสถิติรายเดือน</button>
           </div>
         )}

         {activeTab === 'admin_checkin' && (
           <div className="p-4 md:p-12 bg-white/50 backdrop-blur-md border border-purple-100 rounded-[3.5rem] shadow-inner max-w-2xl mx-auto">
              <div className="text-center mb-10">
                 <div className="w-16 h-16 bg-purple-100 rounded-3xl flex items-center justify-center mx-auto mb-6 text-purple-600 shadow-sm border border-purple-200">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                 </div>
                 <h2 className="text-2xl font-black text-purple-950 tracking-tight">ลงเวลาแทนบุคลากร</h2>
                 <p className="text-purple-400 font-black text-[10px] uppercase tracking-widest mt-1">Manual Attendance Entry Platform</p>
              </div>
              <div className="space-y-8">
                <div>
                   <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 ml-3">เลือกรายชื่อบุคลากร</label>
                   <select value={manualStaffId} onChange={e => setManualStaffId(e.target.value)} className="w-full p-5 bg-white border-2 border-purple-100 rounded-[1.5rem] font-black text-purple-900 outline-none focus:border-purple-400 shadow-sm transition-all">
                     <option value="">-- เลือกรายชื่อ --</option>
                     {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                   </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 ml-3">วันที่ (Date)</label>
                    <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full p-5 bg-white border-2 border-purple-100 rounded-[1.5rem] font-black text-purple-900 outline-none focus:border-purple-400 shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 ml-3">เวลา (Time)</label>
                    <input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)} className="w-full p-5 bg-white border-2 border-purple-100 rounded-[1.5rem] font-black text-purple-900 outline-none focus:border-purple-400 shadow-sm" />
                  </div>
                </div>
                <div>
                   <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 ml-3">ประเภทการลงเวลา (Mode)</label>
                   <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                     {[
                       { id: 'arrival', label: 'มาทำงาน', icon: '🌅' },
                       { id: 'departure', label: 'กลับบ้าน', icon: '🏠' },
                       { id: 'authorized_late', label: 'อนุญาตสาย', icon: '🕒' },
                       { id: 'duty', label: 'ไปราชการ', icon: '🏛️' },
                       { id: 'sick_leave', label: 'ลาป่วย', icon: '🤒' },
                       { id: 'personal_leave', label: 'ลากิจ', icon: '🙏' }
                     ].map(t => (
                       <button key={t.id} onClick={() => setManualType(t.id as AttendanceType)} className={`p-4 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-2 transition-all ${manualType === t.id ? 'bg-purple-700 border-purple-700 text-white shadow-lg scale-105' : 'bg-white border-purple-50 text-purple-400 hover:border-purple-200'}`}>
                         <span className="text-xl">{t.icon}</span>
                         <span>{t.label}</span>
                       </button>
                     ))}
                   </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 ml-3">เหตุผล / หมายเหตุเพิ่มเติม</label>
                  <textarea value={manualReason} onChange={(e) => setManualReason(e.target.value)} className="w-full p-5 bg-white border-2 border-purple-100 rounded-[1.5rem] font-black text-purple-900 outline-none focus:border-purple-400 shadow-sm" rows={2} placeholder="ระบุเหตุผล (ถ้ามี)" />
                </div>
                <button onClick={handleManualSave} disabled={isSavingManual} className="w-full py-6 bg-gradient-to-r from-purple-700 to-purple-900 text-white rounded-[2rem] font-black text-lg shadow-xl hover:scale-[1.01] active:scale-95 transition-all disabled:bg-purple-200">
                  {isSavingManual ? '⌛ กำลังบันทึก...' : '✅ ยืนยันการบันทึกข้อมูล'}
                </button>
              </div>
           </div>
         )}
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/90 backdrop-blur-md animate-in fade-in duration-300 no-print" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl w-full bg-white rounded-[3rem] overflow-hidden shadow-2xl border-4 border-white animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
             <img src={previewImage} alt="Verification" className="w-full h-auto max-h-[80vh] object-contain" />
             <div className="p-8 bg-white flex justify-between items-center">
                <p className="font-black text-purple-900 tracking-tight uppercase text-xs">AI Verification Photo</p>
                <button onClick={() => setPreviewImage(null)} className="px-8 py-3 bg-purple-600 text-white rounded-2xl font-black text-sm hover:bg-purple-700 transition-all shadow-lg active:scale-95">ปิดหน้าต่าง</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
