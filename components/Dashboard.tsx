
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff } from '../services/staffService';
import { generateDailyReportSummary } from '../services/geminiService';
import { CheckInRecord, Staff, AttendanceType } from '../types';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'today' | 'monthly' | 'stats' | 'manual';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Manual Entry State
  const [manualStaffId, setManualStaffId] = useState('');
  const [manualType, setManualType] = useState<AttendanceType>('arrival');
  const [manualReason, setManualReason] = useState('');
  const [manualTime, setManualTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  const staffList = useMemo(() => getAllStaff(), []);

  const syncData = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncUnsyncedRecords();
      const [cloud, local] = await Promise.all([
        fetchGlobalRecords(),
        Promise.resolve(getRecords())
      ]);
      const mergedMap = new Map<string, CheckInRecord>();
      const getSig = (r: CheckInRecord) => `${r.timestamp}_${String(r.staffId || '').toUpperCase().trim()}`;
      cloud.forEach(r => mergedMap.set(getSig(r), r));
      local.forEach(l => {
        const sig = getSig(l);
        if (!mergedMap.has(sig)) mergedMap.set(sig, l);
        else if ((l.imageUrl || "").length > (mergedMap.get(sig)!.imageUrl || "").length) {
          mergedMap.set(sig, { ...mergedMap.get(sig)!, imageUrl: l.imageUrl });
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
      return d.toISOString().split('T')[0] === selectedDate;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [allRecords, selectedDate]);

  const dailyAnalysis = useMemo(() => {
    const presentIds = new Set(filteredToday.filter(r => ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type)).map(r => r.staffId));
    const absentStaff = staffList.filter(s => !presentIds.has(s.id));
    
    return {
      present: filteredToday.filter(r => r.type === 'arrival').length,
      late: filteredToday.filter(r => r.status === 'Late').length,
      leave: filteredToday.filter(r => r.type.includes('_leave')).length,
      duty: filteredToday.filter(r => r.type === 'duty').length,
      absentCount: absentStaff.length,
      absentList: absentStaff
    };
  }, [filteredToday, staffList]);

  const monthlyData = useMemo(() => {
    const currentMonth = selectedDate.substring(0, 7);
    const monthlyRecords = allRecords.filter(r => new Date(r.timestamp).toISOString().startsWith(currentMonth));
    
    return staffList.map(staff => {
      const staffRecs = monthlyRecords.filter(r => r.staffId === staff.id);
      return {
        ...staff,
        total: staffRecs.filter(r => r.type === 'arrival').length,
        onTime: staffRecs.filter(r => r.status === 'On Time').length,
        late: staffRecs.filter(r => r.status === 'Late').length,
        leave: staffRecs.filter(r => r.type.includes('_leave')).length,
        duty: staffRecs.filter(r => r.type === 'duty').length,
      };
    }).sort((a, b) => b.late - a.late);
  }, [allRecords, selectedDate, staffList]);

  const handleQuickLeave = async (staff: Staff, type: AttendanceType) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const now = new Date();
    const timestamp = new Date(year, month - 1, day, now.getHours(), now.getMinutes()).getTime();
    
    const record: CheckInRecord = {
      id: crypto.randomUUID(),
      staffId: staff.id,
      name: staff.name,
      role: staff.role,
      timestamp: timestamp,
      type: type,
      status: type === 'duty' ? 'Duty' : (type === 'sick_leave' ? 'Sick Leave' : 'Personal Leave'),
      reason: `Admin recorded: ${type.replace('_', ' ')}`,
      location: { lat: 0, lng: 0 },
      distanceFromBase: 0,
      aiVerification: 'Admin Direct Authorized'
    };
    
    await saveRecord(record);
    syncData();
  };

  const exportOfficialDailyPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const dateFormatted = new Date(selectedDate).toLocaleDateString('th-TH', { 
        day: 'numeric', month: 'long', year: 'numeric' 
    });

    // Header
    doc.setFontSize(14);
    doc.text(`รายงานการมาปฏิบัติงานของครูและบุคลากรทางการศึกษาโรงเรียนประจักษ์ศิลปาคม`, 105, 15, { align: 'center' });
    doc.text(`ประจำวันที่ ${dateFormatted}`, 105, 23, { align: 'center' });

    // Processing Data: Merging Arrival and Departure for each staff
    const tableData = staffList.map((staff, index) => {
      const records = filteredToday.filter(r => r.staffId === staff.id);
      const arrival = records.find(r => r.type === 'arrival');
      const departure = records.find(r => r.type === 'departure');
      const special = records.find(r => ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type));

      let arrivalTime = '-';
      let departureTime = '-';
      let remark = '';

      if (arrival) {
        const time = new Date(arrival.timestamp);
        arrivalTime = time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        
        // Late calculation (After 08:00)
        const limit = new Date(time);
        limit.setHours(8, 0, 0, 0);
        if (time > limit) {
          remark = 'สาย' + (arrival.reason ? ` (${arrival.reason})` : '');
        }
      }

      if (departure) {
        departureTime = new Date(departure.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      }

      if (special) {
        remark = special.status + (special.reason ? ` (${special.reason})` : '');
      }

      return [
        index + 1,
        staff.name,
        staff.role,
        arrivalTime,
        departureTime,
        remark
      ];
    });

    (doc as any).autoTable({
      startY: 32,
      head: [['ลำดับที่', 'รายชื่อ', 'ตำแหน่ง', 'เวลามา', 'เวลากลับ', 'หมายเหตุ']],
      body: tableData,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [190, 18, 60], textColor: [255, 255, 255], halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        3: { halign: 'center', cellWidth: 25 },
        4: { halign: 'center', cellWidth: 25 },
        5: { cellWidth: 40 }
      }
    });

    doc.save(`Official-Daily-Report-${selectedDate}.pdf`);
  };

  const exportPDF = (type: 'daily' | 'monthly') => {
    if (type === 'daily') {
      exportOfficialDailyPDF();
      return;
    }
    
    const doc = new jsPDF();
    doc.text(`Monthly Summary Report: ${selectedDate.substring(0, 7)}`, 14, 15);
    const tableData = monthlyData.map(m => [
        m.staffId,
        m.name,
        m.total,
        m.onTime,
        m.late,
        m.leave + m.duty,
        `${Math.round((m.onTime / (m.total || 1)) * 100)}%`
    ]);
    (doc as any).autoTable({
        startY: 25,
        head: [['ID', 'Name', 'Attend', 'OnTime', 'Late', 'Leave/Duty', 'Efficiency']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [31, 41, 55] },
        styles: { font: 'helvetica', fontSize: 9 }
    });
    doc.save(`Prachak-Monthly-Report-${selectedDate}.pdf`);
  };

  const handleAiSummary = async () => {
    if (filteredToday.length === 0) return;
    setIsGeneratingAi(true);
    const summary = await generateDailyReportSummary(filteredToday);
    setAiSummary(summary);
    setIsGeneratingAi(false);
  };

  const handleManualCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const staff = staffList.find(s => s.id === manualStaffId);
    if (!staff) return alert('ไม่พบรหัสบุคลากร');
    
    const [year, month, day] = selectedDate.split('-').map(Number);
    const [hours, minutes] = manualTime.split(':').map(Number);
    const manualTimestamp = new Date(year, month - 1, day, hours, minutes).getTime();
    
    let status: any = 'Admin Assist';
    if (manualType === 'arrival') {
        const limit = new Date(year, month - 1, day, 8, 0, 0, 0).getTime();
        status = manualTimestamp > limit ? 'Late' : 'On Time';
    }

    const record: CheckInRecord = {
      id: crypto.randomUUID(),
      staffId: staff.id,
      name: staff.name,
      role: staff.role,
      timestamp: manualTimestamp,
      type: manualType,
      status: status,
      reason: manualReason || 'Manual override by admin',
      location: { lat: 0, lng: 0 },
      distanceFromBase: 0,
      aiVerification: 'Admin Authorized'
    };
    
    await saveRecord(record);
    setManualReason('');
    alert('บันทึกสำเร็จ');
    syncData();
    setActiveTab('today');
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-20">
      {/* Image Preview Overlay */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage.startsWith('data:') ? previewImage : `data:image/jpeg;base64,${previewImage}`} className="max-w-full max-h-[90vh] rounded-3xl border-4 border-white shadow-2xl" alt="Preview" />
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/10 backdrop-blur-md p-8 rounded-[3rem] border border-white/20">
        <div className="text-center md:text-left">
          <h2 className="text-4xl font-black text-white flex items-center gap-3">
            Admin Dashboard <span className="animate-sway">❄️</span>
          </h2>
          <p className="text-rose-200 text-xs font-bold tracking-widest uppercase mt-2 opacity-80">Reports & Monitoring Center</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={syncData} disabled={isSyncing} className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-bold text-sm transition-all flex items-center gap-2">
            {isSyncing ? '...' : '🔄 Sync Cloud'}
          </button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3 rounded-2xl bg-white border-none font-bold text-rose-700 shadow-lg text-sm outline-none" />
        </div>
      </div>

      {/* Modern Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print">
        {[
          { id: 'today', label: 'บันทึกวันนี้', emoji: '📅' },
          { id: 'monthly', label: 'สรุปรายเดือน', emoji: '📊' },
          { id: 'manual', label: 'ลงเวลาแทน', emoji: '✍️' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-6 py-4 rounded-2xl font-black text-sm whitespace-nowrap transition-all shadow-lg flex items-center gap-2 ${
              activeTab === tab.id ? 'bg-rose-600 text-white scale-105' : 'bg-white/80 text-stone-500 hover:bg-white'
            }`}
          >
            <span>{tab.emoji}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {activeTab === 'today' && (
          <div className="p-10">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
              <div className="bg-emerald-50 p-6 rounded-[2.5rem] border-2 border-emerald-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Present</p>
                <p className="text-3xl font-black text-emerald-600">{dailyAnalysis.present}</p>
              </div>
              <div className="bg-rose-50 p-6 rounded-[2.5rem] border-2 border-rose-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Late</p>
                <p className="text-3xl font-black text-rose-600">{dailyAnalysis.late}</p>
              </div>
              <div className="bg-blue-50 p-6 rounded-[2.5rem] border-2 border-blue-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Leave</p>
                <p className="text-3xl font-black text-blue-600">{dailyAnalysis.leave}</p>
              </div>
              <div className="bg-amber-50 p-6 rounded-[2.5rem] border-2 border-amber-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Duty</p>
                <p className="text-3xl font-black text-amber-600">{dailyAnalysis.duty}</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Not Signed</p>
                <p className="text-3xl font-black text-slate-600">{dailyAnalysis.absentCount}</p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              {/* Daily Table Section */}
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <div>
                    <h3 className="text-2xl font-black text-stone-800">รายงานการลงเวลาประจำวัน 🎁</h3>
                    <p className="text-stone-400 text-xs font-bold mt-1 uppercase tracking-widest">Daily Detailed Attendance Table</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => exportPDF('daily')} className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      พิมพ์รายงานราชการ (A4)
                    </button>
                    <button onClick={handleAiSummary} disabled={isGeneratingAi || filteredToday.length === 0} className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-50">
                      {isGeneratingAi ? '...' : '✨ AI Analyze'}
                    </button>
                  </div>
                </div>

                {aiSummary && (
                    <div className="mb-8 p-6 bg-emerald-50 rounded-3xl border border-emerald-100 text-emerald-800 animate-in zoom-in text-sm font-medium leading-relaxed shadow-inner">
                        <p className="font-black text-[10px] uppercase tracking-widest mb-2 text-emerald-400">Gemini Strategic Insight</p>
                        {aiSummary}
                    </div>
                )}

                <div className="overflow-x-auto rounded-3xl border border-stone-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b border-stone-100">
                        <th className="p-5">Time</th>
                        <th className="p-5">ID</th>
                        <th className="p-5">Name</th>
                        <th className="p-5 text-center">Status</th>
                        <th className="p-5 text-center">Evidence</th>
                        <th className="p-5 text-right">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {filteredToday.map(r => (
                        <tr key={r.id} className="hover:bg-rose-50/20 transition-colors group">
                          <td className="p-5 font-mono font-black text-rose-500">{new Date(r.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</td>
                          <td className="p-5 font-bold text-stone-400">{r.staffId || '-'}</td>
                          <td className="p-5">
                            <div className="font-bold text-stone-800">{r.name}</div>
                            <div className="text-[10px] text-stone-400 font-bold uppercase">{r.role}</div>
                          </td>
                          <td className="p-5 text-center">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black ${
                              r.status.includes('Time') ? 'bg-emerald-100 text-emerald-700' : 
                              r.status.includes('Late') ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                            }`}>{r.status}</span>
                          </td>
                          <td className="p-5 text-center">
                            {r.imageUrl ? (
                              <button onClick={() => setPreviewImage(r.imageUrl!)} className="w-12 h-12 rounded-2xl bg-stone-900 overflow-hidden border-2 border-white shadow-lg active:scale-90 transition-all hover:ring-4 hover:ring-rose-100">
                                <img src={r.imageUrl.startsWith('data:') ? r.imageUrl : `data:image/jpeg;base64,${r.imageUrl}`} className="w-full h-full object-cover opacity-80" alt="Thumb" />
                              </button>
                            ) : <span className="text-[10px] text-stone-300 italic">No Photo</span>}
                          </td>
                          <td className="p-5 text-right">
                            <button onClick={() => { if(confirm('Delete record?')) deleteRecord(r).then(syncData) }} className="text-stone-300 hover:text-rose-500 transition-colors p-2 bg-stone-50 rounded-xl hover:bg-rose-50">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredToday.length === 0 && (
                    <div className="py-24 text-center text-stone-300 font-black">
                      <span className="text-7xl block mb-4">🎄</span>
                      <p>ไม่มีรายการบันทึกในวันนี้</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Absent Sidebar - Updated to "Not Signed" */}
              <div className="w-full lg:w-80 bg-slate-50 p-8 rounded-[3rem] border border-slate-100">
                  <h4 className="font-black text-stone-800 mb-6 flex items-center justify-between">
                    ยังไม่ลงชื่อ ⛄
                    <span className="bg-rose-500 text-white text-[10px] px-3 py-1 rounded-full">{dailyAnalysis.absentCount}</span>
                  </h4>
                  <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                    {dailyAnalysis.absentList.map(s => (
                        <div key={s.id} className="p-5 bg-white rounded-3xl border border-stone-100 shadow-sm transition-all hover:shadow-md">
                            <div className="font-bold text-stone-700 text-xs">{s.name}</div>
                            <div className="text-[10px] text-stone-400 font-bold mt-1 uppercase mb-4">{s.id} • {s.role}</div>
                            
                            <div className="grid grid-cols-3 gap-1.5">
                                <button 
                                  onClick={() => handleQuickLeave(s, 'personal_leave')}
                                  className="py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-[9px] font-black transition-colors border border-amber-100"
                                >ลากิจ</button>
                                <button 
                                  onClick={() => handleQuickLeave(s, 'sick_leave')}
                                  className="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-[9px] font-black transition-colors border border-rose-100"
                                >ลาป่วย</button>
                                <button 
                                  onClick={() => handleQuickLeave(s, 'duty')}
                                  className="py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[9px] font-black transition-colors border border-blue-100"
                                >ไปราชการ</button>
                            </div>
                        </div>
                    ))}
                    {dailyAnalysis.absentList.length === 0 && (
                        <div className="text-center py-10 opacity-30 italic text-sm">ลงชื่อครบทุกคนแล้ว 🎉</div>
                    )}
                  </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'monthly' && (
          <div className="p-10">
             <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
                <div>
                    <h3 className="text-2xl font-black text-stone-800">ตารางรายงานการมาสายรายเดือน 📊</h3>
                    <p className="text-stone-400 text-xs font-bold mt-1 uppercase tracking-widest">Performance & Lateness Monthly Audit</p>
                </div>
                <button onClick={() => exportPDF('monthly')} className="px-6 py-3 bg-stone-900 hover:bg-black text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  ส่งออกรายเดือน (PDF)
                </button>
             </div>
             
             <div className="overflow-x-auto rounded-3xl border border-stone-100">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b border-stone-100">
                      <th className="p-5">ID</th>
                      <th className="p-5">บุคลากร</th>
                      <th className="p-5 text-center">มาเรียนทั้งหมด</th>
                      <th className="p-5 text-center">ตรงเวลา</th>
                      <th className="p-5 text-center text-rose-500">มาสาย</th>
                      <th className="p-5 text-center text-blue-500">ลา/ภารกิจ</th>
                      <th className="p-5 text-right">ประสิทธิภาพ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {monthlyData.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-5 font-bold text-stone-400">{m.id}</td>
                        <td className="p-5">
                          <div className="font-bold text-stone-800">{m.name}</div>
                          <div className="text-[10px] text-stone-400 font-bold uppercase">{m.role}</div>
                        </td>
                        <td className="p-5 text-center font-black">{m.total}</td>
                        <td className="p-5 text-center text-emerald-600 font-bold">{m.onTime}</td>
                        <td className={`p-5 text-center font-black ${m.late > 0 ? 'bg-rose-50 text-rose-600' : 'text-stone-300'}`}>{m.late}</td>
                        <td className="p-5 text-center text-blue-500 font-bold">{m.leave + m.duty}</td>
                        <td className="p-5 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <span className="text-[10px] font-black text-stone-400">{Math.round((m.onTime / (m.total || 1)) * 100)}%</span>
                            <div className="w-20 bg-stone-100 h-1.5 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-1000 ${m.late > 3 ? 'bg-rose-400' : 'bg-emerald-400'}`} 
                                     style={{ width: `${Math.min(100, (m.onTime / (m.total || 1)) * 100)}%` }}></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="p-10 max-w-2xl mx-auto">
             <div className="text-center mb-10">
                <span className="text-6xl mb-4 inline-block">✍️</span>
                <h3 className="text-2xl font-black text-stone-800">ลงเวลาทดแทน (Admin Entry)</h3>
                <p className="text-stone-400 text-xs font-bold mt-2 italic">กรณีบุคลากรติดภารกิจ หรือมีปัญหาเรื่องอุปกรณ์บันทึกภาพ</p>
             </div>
             
             <form onSubmit={handleManualCheckIn} className="space-y-6 bg-stone-50 p-10 rounded-[3rem] border-2 border-stone-100 shadow-xl">
                <div>
                   <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">เลือกบุคลากรที่ต้องการบันทึก</label>
                   <select 
                    value={manualStaffId} 
                    onChange={e => setManualStaffId(e.target.value)}
                    className="w-full p-5 bg-white border-2 border-stone-200 rounded-[1.5rem] font-bold text-stone-800 outline-none focus:ring-4 focus:ring-rose-100 transition-all shadow-sm"
                    required
                   >
                      <option value="">-- ค้นหารายชื่อบุคลากร --</option>
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.id} : {s.name}</option>)}
                   </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                      <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">ประเภทการลงเวลา</label>
                      <div className="grid grid-cols-2 gap-3">
                         <button 
                          type="button"
                          onClick={() => setManualType('arrival')}
                          className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${manualType === 'arrival' ? 'bg-emerald-500 text-white border-emerald-400 shadow-md scale-105' : 'bg-white text-stone-400 border-stone-100 opacity-60'}`}
                         >มาทำงาน</button>
                         <button 
                          type="button"
                          onClick={() => setManualType('departure')}
                          className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${manualType === 'departure' ? 'bg-amber-500 text-white border-amber-400 shadow-md scale-105' : 'bg-white text-stone-400 border-stone-100 opacity-60'}`}
                         >กลับบ้าน</button>
                      </div>
                   </div>
                   <div>
                      <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">ระบุเวลา (Time)</label>
                      <input 
                        type="time" 
                        value={manualTime}
                        onChange={e => setManualTime(e.target.value)}
                        className="w-full p-4 bg-white border-2 border-stone-200 rounded-2xl font-bold text-stone-800 outline-none focus:ring-4 focus:ring-rose-100 transition-all shadow-sm h-[52px]"
                        required
                      />
                   </div>
                </div>

                <div>
                   <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">เหตุผลในการลงเวลาแทน</label>
                   <textarea 
                    value={manualReason} 
                    onChange={e => setManualReason(e.target.value)}
                    className="w-full p-5 bg-white border-2 border-stone-200 rounded-[1.5rem] font-bold text-stone-800 outline-none h-32 shadow-sm"
                    placeholder="ระบุเหตุผล เช่น ติดราชการภายนอก, ลืมบันทึกเวลา..."
                   />
                </div>

                <button type="submit" className="w-full py-6 bg-rose-600 hover:bg-rose-700 text-white rounded-[1.5rem] font-black shadow-2xl shadow-rose-200 active:scale-95 transition-all text-lg">
                  บันทึกข้อมูลเข้าระบบ 🎉
                </button>
             </form>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
