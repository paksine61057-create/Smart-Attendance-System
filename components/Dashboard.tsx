
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff } from '../services/staffService';
import { getHoliday } from '../services/holidayService';
import { CheckInRecord, Staff, AttendanceType } from '../types';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'today' | 'official' | 'monthly' | 'manual';

const SCHOOL_LOGO_URL = 'https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  
  // Manual Entry States
  const [manualStaffId, setManualStaffId] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualTime, setManualTime] = useState(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.'));
  const [manualType, setManualType] = useState<AttendanceType>('arrival');
  const [manualReason, setManualReason] = useState('');

  const [previewData, setPreviewData] = useState<{url: string, title: string, time: string, ai: string} | null>(null);

  const staffList = useMemo(() => getAllStaff(), []);

  const openPreview = (url: string, title: string, timestamp: number, ai: string) => {
    setPreviewData({
      url,
      title,
      time: new Date(timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      ai
    });
  };

  const syncData = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncUnsyncedRecords();
      const cloud = await fetchGlobalRecords();
      const local = getRecords();
      
      const mergedMap = new Map<string, CheckInRecord>();
      const getSig = (r: CheckInRecord) => {
        const d = new Date(r.timestamp);
        // Signature แยกตาม StaffID + Type + Date เพื่อให้แสดงได้ทั้งมาและกลับในวันเดียวกัน
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
      console.error("Sync failed, using local", e);
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
    const presentIds = new Set(filteredToday.filter(r => ['arrival', 'duty', 'authorized_late'].includes(r.type)).map(r => r.staffId?.toUpperCase()));
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

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const staff = staffList.find(s => s.id === manualStaffId);
    if (!staff) return alert('โปรดเลือกบุคลากร');

    const [hours, minutes] = manualTime.split(/[:.]/).map(Number);
    const ts = new Date(manualDate);
    ts.setHours(hours || 0, minutes || 0, 0, 0);

    let status: any = 'Normal';
    if (manualType === 'arrival') {
        status = (hours > 8 || (hours === 8 && minutes > 0)) ? 'Late' : 'On Time';
    } else if (manualType === 'departure') {
        status = hours < 16 ? 'Early Leave' : 'Normal';
    } else {
        status = manualType.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    const record: CheckInRecord = {
        id: crypto.randomUUID(),
        staffId: staff.id,
        name: staff.name,
        role: staff.role,
        timestamp: ts.getTime(),
        type: manualType,
        status,
        reason: manualReason,
        location: { lat: 0, lng: 0 },
        distanceFromBase: 0,
        aiVerification: 'Admin Manual Entry'
    };

    await saveRecord(record);
    alert('บันทึกเวลาแทนเรียบร้อยแล้ว');
    syncData();
  };

  const getStatusLabel = (status: string) => {
    const map: any = { 'On Time': 'ตรงเวลา', 'Late': 'มาสาย', 'Authorized Late': 'ขอเข้าสาย', 'Sick Leave': 'ลาป่วย', 'Personal Leave': 'ลากิจ', 'Duty': 'ไปราชการ', 'Early Leave': 'กลับก่อน', 'Normal': 'ปกติ', 'Admin Assist': 'แอดมินลงให้' };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    if (['On Time', 'Normal'].includes(status)) return 'bg-emerald-100 text-emerald-700';
    if (status === 'Late') return 'bg-rose-100 text-rose-700';
    if (['Duty', 'ไปราชการ'].includes(status)) return 'bg-blue-100 text-blue-700';
    if (['Sick Leave', 'Personal Leave', 'ลาป่วย', 'ลากิจ'].includes(status)) return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  };

  const monthlySummary = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    return staffList.map((staff, idx) => {
      const staffRecords = allRecords.filter(r => 
        r.staffId?.toUpperCase() === staff.id.toUpperCase() && 
        new Date(r.timestamp).getFullYear() === year && 
        new Date(r.timestamp).getMonth() === (month - 1)
      );

      const lateRecords = staffRecords.filter(r => r.status === 'Late');
      const lateDates = lateRecords.map(r => new Date(r.timestamp).getDate()).sort((a, b) => a - b);
      
      let missingCount = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const checkDate = new Date(year, month - 1, d);
        const holiday = getHoliday(checkDate);
        if (!holiday) {
          const hasRecord = staffRecords.some(r => new Date(r.timestamp).getDate() === d && ['arrival', 'duty', 'sick_leave', 'personal_leave', 'authorized_late'].includes(r.type));
          if (!hasRecord) missingCount++;
        }
      }

      return {
        no: idx + 1,
        id: staff.id,
        name: staff.name,
        role: staff.role,
        lateCount: lateRecords.length,
        lateDates: lateDates.join(', '),
        missingCount
      };
    });
  }, [staffList, allRecords, selectedMonth]);

  const officialDailyData = useMemo(() => {
    return staffList.map((staff, idx) => {
      const dayRecs = filteredToday.filter(r => r.staffId?.toUpperCase() === staff.id.toUpperCase());
      const arrival = dayRecs.find(r => ['arrival', 'duty', 'sick_leave', 'personal_leave', 'authorized_late'].includes(r.type));
      const departure = dayRecs.find(r => r.type === 'departure');
      
      let remark = '';
      if (arrival?.status === 'Late' || arrival?.status === 'Early Leave' || arrival?.type === 'duty' || arrival?.type.includes('leave')) {
        remark = arrival.reason || getStatusLabel(arrival.status);
      }
      if (departure?.status === 'Early Leave') {
        remark = remark ? `${remark}, ${departure.reason || 'กลับก่อน'}` : (departure.reason || 'กลับก่อน');
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

  const printMonthLabel = useMemo(() => {
      const [year, month] = selectedMonth.split('-').map(Number);
      return new Date(year, month - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  return (
    <div className="w-full max-w-6xl mx-auto pb-20">
      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setPreviewData(null)}>
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full animate-in zoom-in" onClick={e => e.stopPropagation()}>
             <img src={previewData.url} className="w-full aspect-square object-cover rounded-2xl mb-4" alt="preview" onError={(e) => (e.target as any).src="https://via.placeholder.com/300?text=Image+Not+Found"} />
             <h3 className="font-bold text-center text-stone-800">{previewData.title}</h3>
             <p className="text-center text-xs text-stone-400 mt-1">{previewData.time}</p>
             <button onClick={() => setPreviewData(null)} className="w-full mt-4 py-3 bg-stone-100 rounded-xl font-bold">ปิดหน้าต่าง</button>
          </div>
        </div>
      )}

      {/* Header Admin */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/10 backdrop-blur-md p-8 rounded-[3rem] border border-white/20">
        <div>
          <h2 className="text-4xl font-black text-white">Admin Dashboard ❄️</h2>
          <p className="text-rose-200 text-xs font-bold uppercase tracking-widest mt-2">จัดการข้อมูลระบบโรงเรียนประจักษ์ศิลปาคม</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={syncData} disabled={isSyncing} className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-95">
            {isSyncing ? '🔄 กำลังซิงค์ข้อมูล...' : '🔄 ซิงค์ข้อมูลล่าสุด'}
          </button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3 rounded-2xl bg-white font-bold text-rose-700 shadow-xl text-sm outline-none border-2 border-white focus:border-rose-400" />
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print">
        {[
          { id: 'today', label: 'รายการประจำวัน', emoji: '📅' },
          { id: 'manual', label: 'ลงเวลาแทน', emoji: '✍️' },
          { id: 'official', label: 'รายงานสรุปวัน', emoji: '📜' },
          { id: 'monthly', label: 'สรุปรายเดือน', emoji: '📊' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-4 rounded-2xl font-black text-sm whitespace-nowrap transition-all shadow-lg flex items-center gap-2 ${activeTab === tab.id ? 'bg-rose-600 text-white scale-105' : 'bg-white/80 text-stone-500 hover:bg-white'}`}>
            <span>{tab.emoji}</span> {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] animate-in fade-in relative">
        
        {/* TAB: TODAY LIST */}
        {activeTab === 'today' && (
          <div className="p-10">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10 text-center">
              <div className="bg-emerald-50 p-6 rounded-[2.5rem] border-2 border-emerald-100 shadow-sm">
                <p className="text-[10px] font-black text-emerald-400 uppercase mb-1 tracking-widest">มาทำงาน</p>
                <p className="text-3xl font-black text-emerald-600">{dailyAnalysis.arrived}</p>
              </div>
              <div className="bg-rose-50 p-6 rounded-[2.5rem] border-2 border-rose-100 shadow-sm">
                <p className="text-[10px] font-black text-rose-400 uppercase mb-1 tracking-widest">มาสาย</p>
                <p className="text-3xl font-black text-rose-600">{dailyAnalysis.late}</p>
              </div>
              <div className="bg-amber-50 p-6 rounded-[2.5rem] border-2 border-amber-100 shadow-sm">
                <p className="text-[10px] font-black text-amber-400 uppercase mb-1 tracking-widest">ลา</p>
                <p className="text-3xl font-black text-amber-600">{dailyAnalysis.leave}</p>
              </div>
              <div className="bg-blue-50 p-6 rounded-[2.5rem] border-2 border-blue-100 shadow-sm">
                <p className="text-[10px] font-black text-blue-400 uppercase mb-1 tracking-widest">ไปราชการ</p>
                <p className="text-3xl font-black text-blue-600">{dailyAnalysis.duty}</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">ไม่ลงเวลา</p>
                <p className="text-3xl font-black text-slate-600">{dailyAnalysis.absentCount}</p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              {/* Recent Transactions Table */}
              <div className="flex-1 overflow-x-auto">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-black text-stone-800">รายการล่าสุด ⛄</h3>
                    <p className="text-[10px] font-bold text-stone-400 italic">*แสดงข้อมูลที่ซิงค์จาก Cloud ล่าสุด</p>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b">
                      <th className="p-5">เวลา</th>
                      <th className="p-5">ชื่อ-นามสกุล</th>
                      <th className="p-5">สถานะ</th>
                      <th className="p-5 text-center">รูป</th>
                      <th className="p-5 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {filteredToday.length === 0 ? (
                      <tr><td colSpan={5} className="p-20 text-center text-stone-300 font-bold italic">ไม่พบข้อมูลในวันนี้ ❄️</td></tr>
                    ) : filteredToday.map(r => (
                      <tr key={r.id} className="hover:bg-rose-50/20 transition-colors">
                        <td className="p-5 font-mono font-black text-rose-500">{new Date(r.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="p-5">
                          <div className="font-bold text-stone-800">{r.name}</div>
                          <div className="text-[10px] text-stone-400 font-bold uppercase">{r.role}</div>
                        </td>
                        <td className="p-5">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black whitespace-nowrap shadow-sm ${getStatusColor(r.status)}`}>
                            {getStatusLabel(r.status)}
                          </span>
                        </td>
                        <td className="p-5 text-center">
                          {r.imageUrl && r.imageUrl.length > 20 ? (
                            <button onClick={() => openPreview(r.imageUrl!, r.name, r.timestamp, r.aiVerification || '')} className="w-10 h-10 rounded-xl bg-stone-100 border-2 border-white shadow-sm overflow-hidden hover:scale-110 transition-transform">
                               <img src={r.imageUrl} className="w-full h-full object-cover" alt="thumb" onError={(e) => (e.target as any).src="https://via.placeholder.com/100?text=Err"} />
                            </button>
                          ) : <span className="text-[10px] text-stone-300 italic">ไม่มีรูป</span>}
                        </td>
                        <td className="p-5 text-right">
                          <button onClick={() => confirm('ต้องการลบข้อมูลนี้หรือไม่?') && deleteRecord(r).then(syncData)} className="text-stone-300 hover:text-rose-500 transition-colors p-2 bg-stone-50 rounded-lg">
                             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Absent Staff List */}
              <div className="w-full lg:w-80">
                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 flex flex-col max-h-[600px] no-print shadow-inner">
                  <h4 className="font-black text-stone-800 mb-6 flex items-center justify-between">
                    ยังไม่ลงเช้าวันนี้ ⛄
                    <span className="bg-rose-500 text-white text-[10px] px-3 py-1 rounded-full">{dailyAnalysis.absentCount}</span>
                  </h4>
                  <div className="space-y-4 overflow-y-auto pr-2 flex-1 scrollbar-hide">
                    {dailyAnalysis.absentList.map(s => (
                      <div key={s.id} className="p-5 bg-white rounded-3xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="font-bold text-stone-700 text-xs">{s.name}</div>
                        <div className="text-[10px] text-stone-400 font-bold mb-3 uppercase tracking-tighter">{s.role}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => { setManualStaffId(s.id); setManualType('personal_leave'); setActiveTab('manual'); }} className="py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-[9px] font-black transition-colors">ลากิจ</button>
                          <button onClick={() => { setManualStaffId(s.id); setManualType('sick_leave'); setActiveTab('manual'); }} className="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-[9px] font-black transition-colors">ลาป่วย</button>
                          <button onClick={() => { setManualStaffId(s.id); setManualType('duty'); setActiveTab('manual'); }} className="py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[9px] font-black transition-colors">ราชการ</button>
                          <button onClick={() => { setManualStaffId(s.id); setManualType('authorized_late'); setActiveTab('manual'); }} className="py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[9px] font-black transition-colors">ขอเข้าสาย</button>
                        </div>
                      </div>
                    ))}
                    {dailyAnalysis.absentList.length === 0 && (
                        <div className="p-10 text-center text-stone-300 italic text-[10px] font-bold uppercase tracking-widest">บุคลากรลงเวลาครบแล้ว 🎉</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: MANUAL ENTRY */}
        {activeTab === 'manual' && (
          <div className="p-10 max-w-2xl mx-auto">
            <h3 className="text-3xl font-black text-stone-800 mb-2">ลงเวลาแทนบุคลากร ✍️</h3>
            <p className="text-stone-400 text-sm font-bold mb-8 uppercase tracking-widest italic">แอดมินสามารถบันทึกข้อมูลย้อนหลังหรือลงเวลาแทนบุคลากรได้</p>
            
            <form onSubmit={handleManualSubmit} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-stone-400 uppercase mb-2 ml-2">เลือกบุคลากร</label>
                    <select value={manualStaffId} onChange={e => setManualStaffId(e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl outline-none focus:border-rose-400 transition-all font-bold shadow-sm">
                       <option value="">-- เลือกรายชื่อ --</option>
                       {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-stone-400 uppercase mb-2 ml-2">วันที่ต้องการลงเวลา</label>
                    <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl outline-none focus:border-rose-400 font-bold shadow-sm" />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-stone-400 uppercase mb-2 ml-2">เวลา (รูปแบบ 24 ชม. เช่น 08.00)</label>
                    <input type="text" value={manualTime} onChange={e => setManualTime(e.target.value)} placeholder="08.00" className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl outline-none focus:border-rose-400 font-bold shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-stone-400 uppercase mb-2 ml-2">ประเภทรายการ</label>
                    <select value={manualType} onChange={e => setManualType(e.target.value as AttendanceType)} className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl outline-none focus:border-rose-400 font-bold shadow-sm">
                       <option value="arrival">มาทำงาน (ปกติ)</option>
                       <option value="departure">กลับบ้าน</option>
                       <option value="duty">ไปราชการ</option>
                       <option value="sick_leave">ลาป่วย</option>
                       <option value="personal_leave">ลากิจ</option>
                       <option value="authorized_late">อนุญาตเข้าสาย (Authorized)</option>
                    </select>
                  </div>
               </div>

               <div>
                 <label className="block text-[10px] font-black text-stone-400 uppercase mb-2 ml-2">หมายเหตุ / เหตุผล</label>
                 <textarea value={manualReason} onChange={e => setManualReason(e.target.value)} rows={3} placeholder="ระบุเหตุผลที่แอดมินลงเวลาแทน..." className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl outline-none focus:border-rose-400 font-bold shadow-sm" />
               </div>

               <button type="submit" className="w-full py-5 bg-stone-900 hover:bg-rose-700 text-white rounded-3xl font-black text-xl shadow-xl transition-all active:scale-[0.98] mt-4">บันทึกข้อมูล 🦌</button>
            </form>
          </div>
        )}

        {/* TAB: OFFICIAL DAILY REPORT */}
        {activeTab === 'official' && (
          <div className="p-5 bg-stone-100 min-h-screen overflow-auto">
             <div className="mx-auto bg-white shadow-2xl p-[10mm] border border-stone-300 print-page-a4" style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}>
                <div className="text-center mb-8">
                   <img src={SCHOOL_LOGO_URL} alt="logo" className="w-16 h-16 mx-auto mb-2 object-contain" />
                   <h1 className="text-lg font-black uppercase tracking-tight">รายงานสรุปการมาปฏิบัติราชการรายวัน</h1>
                   <p className="text-sm font-bold text-stone-600">โรงเรียนประจักษ์ศิลปาคม สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาอุดรธานี</p>
                   <p className="text-xs font-black mt-1">วันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
                
                <table className="w-full border-collapse border border-stone-400 text-[11px]">
                   <thead>
                      <tr className="bg-stone-50">
                         <th className="border border-stone-400 p-2 w-10">ที่</th>
                         <th className="border border-stone-400 p-2 text-left">ชื่อ - นามสกุล</th>
                         <th className="border border-stone-400 p-2">ตำแหน่ง</th>
                         <th className="border border-stone-400 p-2">เวลามา</th>
                         <th className="border border-stone-400 p-2">เวลากลับ</th>
                         <th className="border border-stone-400 p-2">หมายเหตุ</th>
                      </tr>
                   </thead>
                   <tbody>
                      {officialDailyData.map(d => (
                        <tr key={d.no}>
                           <td className="border border-stone-400 p-2 text-center">{d.no}</td>
                           <td className="border border-stone-400 p-2 font-bold">{d.name}</td>
                           <td className="border border-stone-400 p-2 text-center">{d.role}</td>
                           <td className="border border-stone-400 p-2 text-center">{d.arrival}</td>
                           <td className="border border-stone-400 p-2 text-center">{d.departure}</td>
                           <td className="border border-stone-400 p-2 italic text-rose-600 font-bold">{d.remark}</td>
                        </tr>
                      ))}
                   </tbody>
                </table>
                <div className="mt-20 text-center ml-auto w-64 no-print-placeholder">
                    <p className="text-[11px] font-bold">(ลงชื่อ)........................................................</p>
                    <p className="text-[11px] font-bold mt-2">เจ้าหน้าที่ผู้ตรวจสอบ</p>
                </div>
             </div>
          </div>
        )}

        {/* TAB: MONTHLY SUMMARY (Official A4 Style) */}
        {activeTab === 'monthly' && (
           <div className="p-5 bg-stone-100 min-h-screen overflow-auto">
              <div className="max-w-4xl mx-auto mb-6 flex justify-end no-print">
                 <div className="bg-white p-4 rounded-3xl shadow-lg border border-stone-100 flex items-center gap-4">
                    <label className="text-xs font-black text-stone-400 uppercase tracking-widest">เดือนที่ออกรายงาน:</label>
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="p-3 bg-stone-50 border-2 border-stone-100 rounded-xl font-black text-rose-600 outline-none focus:border-rose-300" />
                 </div>
              </div>

              <div className="mx-auto bg-white shadow-2xl p-[10mm] border border-stone-300 print-page-a4" style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}>
                  <div className="text-center mb-10">
                     <img src={SCHOOL_LOGO_URL} alt="logo" className="w-16 h-16 mx-auto mb-2 object-contain" />
                     <h1 className="text-lg font-black uppercase tracking-tight">รายงานสรุปสถิติการมาสายและไม่ลงเวลาปฏิบัติราชการ</h1>
                     <p className="text-sm font-bold text-stone-600">โรงเรียนประจักษ์ศิลปาคม สำนักงานเขตพื้นที่การศึกษามัธยมศึกษาอุดรธานี</p>
                     <p className="text-xs font-black mt-1">ประจำเดือน {printMonthLabel}</p>
                  </div>

                  <table className="w-full border-collapse border border-stone-500 text-[11px]">
                     <thead>
                        <tr className="bg-stone-100">
                           <th className="border border-stone-500 p-3 w-10">ที่</th>
                           <th className="border border-stone-500 p-3 text-left">ชื่อ - นามสกุล</th>
                           <th className="border border-stone-500 p-3 w-28">มาสาย (ครั้ง)</th>
                           <th className="border border-stone-500 p-3">วันที่มาสาย (วันที่)</th>
                           <th className="border border-stone-500 p-3 w-28">ไม่ลงเวลามา (วัน)</th>
                        </tr>
                     </thead>
                     <tbody>
                        {monthlySummary.map(s => (
                           <tr key={s.id} className="hover:bg-stone-50/50">
                              <td className="border border-stone-500 p-3 text-center font-bold">{s.no}</td>
                              <td className="border border-stone-500 p-3 font-bold">{s.name}</td>
                              <td className="border border-stone-500 p-3 text-center">
                                 {s.lateCount > 0 ? <span className="font-black text-rose-600 text-sm">{s.lateCount}</span> : '0'}
                              </td>
                              <td className="border border-stone-500 p-3 text-[10px] italic text-stone-500 font-mono leading-relaxed">
                                 {s.lateDates || '-'}
                              </td>
                              <td className="border border-stone-500 p-3 text-center">
                                 {s.missingCount > 0 ? <span className="font-black text-rose-800 text-sm">{s.missingCount}</span> : '0'}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  
                  <div className="mt-12 text-[10px] text-stone-500 italic space-y-1">
                      <p>* หมายเหตุ: ระบบจะไม่นับรวมวันหยุดเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์ที่ตั้งค่าไว้ในระบบ</p>
                      <p>* สรุปข้อมูลโดย: ระบบ School Attendance AI (Prachaksinlapakhom School)</p>
                  </div>

                  <div className="mt-20 flex justify-end text-center no-print-placeholder">
                      <div className="w-64">
                        <p className="text-[11px] font-bold">ลงชื่อ........................................................</p>
                        <p className="text-[11px] font-bold mt-2">ผู้สรุปรายงาน</p>
                      </div>
                  </div>
              </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
