
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff } from '../services/staffService';
import { generateDailyReportSummary } from '../services/geminiService';
import { getHoliday } from '../services/holidayService';
import { CheckInRecord, Staff, AttendanceType } from '../types';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

type TabType = 'today' | 'official' | 'monthly' | 'manual';

const SCHOOL_LOGO_URL = 'https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png';
const CUTOFF_TIMESTAMP = new Date(2025, 11, 12).getTime();

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
      const filtered = Array.from(mergedMap.values()).filter(r => r.timestamp >= CUTOFF_TIMESTAMP);
      setAllRecords(filtered);
    } catch (e) {
      const localOnly = getRecords().filter(r => r.timestamp >= CUTOFF_TIMESTAMP);
      setAllRecords(localOnly);
    } finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { syncData(); }, [syncData]);

  const filteredToday = useMemo(() => {
    return allRecords.filter(r => {
      const d = new Date(r.timestamp);
      return d.toISOString().split('T')[0] === selectedDate;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [allRecords, selectedDate]);

  const officialData = useMemo(() => {
    return staffList.map((staff, index) => {
      const records = filteredToday.filter(r => r.staffId === staff.id);
      const arrival = records.find(r => r.type === 'arrival' || r.type === 'authorized_late');
      const departure = records.find(r => r.type === 'departure');
      const special = records.find(r => ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type));

      let arrivalValue = '-';
      let departureValue = '-';
      let remark = '';

      const statusMap: Record<string, string> = {
        'Duty': 'ไปราชการ',
        'Sick Leave': 'ลาป่วย',
        'Personal Leave': 'ลากิจ',
        'Other Leave': 'ลาอื่นๆ',
        'Authorized Late': 'อนุญาตสาย',
        'Admin Assist': 'แอดมินลงเวลาให้'
      };

      if (special) {
        const thaiStatus = statusMap[special.status] || special.status;
        arrivalValue = thaiStatus;
        departureValue = thaiStatus;
        remark = special.reason || '';
      } else {
        if (arrival) {
          const time = new Date(arrival.timestamp);
          arrivalValue = time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          if (arrival.type === 'authorized_late' || arrival.status === 'Authorized Late') {
             remark = 'อนุญาตสาย' + (arrival.reason ? ` (${arrival.reason})` : '');
          } else if (arrival.status === 'Late') {
            remark = 'สาย' + (arrival.reason ? ` (${arrival.reason})` : '');
          } else if (arrival.status === 'Admin Assist') {
            remark = 'แอดมินลงเวลาให้';
          }
        }
        if (departure) {
          const time = new Date(departure.timestamp);
          departureValue = time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          if (departure.status === 'Early Leave') {
            const leaveMsg = 'กลับก่อน' + (departure.reason ? ` (${departure.reason})` : '');
            remark = remark ? `${remark}, ${leaveMsg}` : leaveMsg;
          } else if (departure.status === 'Admin Assist' && !remark.includes('แอดมิน')) {
             remark = remark ? `${remark}, แอดมินลงเวลาให้` : 'แอดมินลงเวลาให้';
          }
        }
      }

      return {
        no: index + 1,
        name: staff.name,
        role: staff.role,
        arrival: arrivalValue,
        departure: departureValue,
        remark: remark
      };
    });
  }, [staffList, filteredToday]);

  const dailyAnalysis = useMemo(() => {
    const presentIds = new Set(filteredToday.filter(r => ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(r.type)).map(r => r.staffId));
    const absentStaff = staffList.filter(s => !presentIds.has(s.id));
    return {
      present: filteredToday.filter(r => r.type === 'arrival' || r.type === 'duty' || r.type === 'authorized_late').length,
      late: filteredToday.filter(r => r.status === 'Late').length,
      leave: filteredToday.filter(r => r.type.includes('_leave')).length,
      duty: filteredToday.filter(r => r.type === 'duty').length,
      absentCount: absentStaff.length,
      absentList: absentStaff
    };
  }, [filteredToday, staffList]);

  const chartData = useMemo(() => {
    return [
      { name: 'มาตรงเวลา', value: Math.max(0, dailyAnalysis.present - dailyAnalysis.late - dailyAnalysis.duty), color: '#10b981' },
      { name: 'มาสาย', value: dailyAnalysis.late, color: '#f43f5e' },
      { name: 'ลา', value: dailyAnalysis.leave, color: '#3b82f6' },
      { name: 'ไปราชการ', value: dailyAnalysis.duty, color: '#f59e0b' },
      { name: 'ยังไม่ลงชื่อ', value: dailyAnalysis.absentCount, color: '#64748b' }
    ].filter(d => d.value > 0);
  }, [dailyAnalysis]);

  const monthlyLatenessData = useMemo(() => {
    const [year, month] = selectedDate.split('-').map(Number);
    const currentMonthPrefix = selectedDate.substring(0, 7);
    const monthlyRecords = allRecords.filter(r => new Date(r.timestamp).toISOString().startsWith(currentMonthPrefix));
    const now = new Date();
    const isCurrentMonth = (year === now.getFullYear() && (month - 1) === now.getMonth());
    const lastDayToCount = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate();
    const workingDays: string[] = [];
    for (let d = 1; d <= lastDayToCount; d++) {
      const dateObj = new Date(year, month - 1, d);
      if (dateObj.getTime() < CUTOFF_TIMESTAMP) continue;
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const holiday = getHoliday(dateObj);
      if (!isWeekend && !holiday) {
        workingDays.push(dateObj.toISOString().split('T')[0]);
      }
    }
    return staffList.map((staff, index) => {
      const staffRecords = monthlyRecords.filter(r => r.staffId === staff.id);
      const lateRecords = staffRecords.filter(r => r.status === 'Late');
      const lateDates = lateRecords.map(r => {
        const d = new Date(r.timestamp);
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
      }).join(', ');
      let absentCount = 0;
      workingDays.forEach(wDate => {
        const hasArrivalOrEquivalent = staffRecords.some(r => {
            const rDate = new Date(r.timestamp).toISOString().split('T')[0];
            return rDate === wDate && ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(r.type);
        });
        if (!hasArrivalOrEquivalent) absentCount++;
      });
      return {
        no: index + 1,
        name: staff.name,
        role: staff.role,
        lateCount: lateRecords.length,
        lateDates: lateDates || '-',
        absentCount: absentCount
      };
    });
  }, [allRecords, selectedDate, staffList]);

  // Handle Export PDF with Normal proportions but Correct Positioning
  const handleExportPDF = (type: 'daily' | 'monthly') => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const data = type === 'daily' ? officialData : monthlyLatenessData;
    
    const title = type === 'daily' 
        ? `รายงานการปฏิบัติงานประจำวัน วันที่ ${new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : `รายงานการมาสายประจำเดือน ${new Date(selectedDate).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`;

    const headers = type === 'daily' 
        ? [['ลำดับ', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'เวลามา', 'เวลากลับ', 'หมายเหตุ']]
        : [['ลำดับ', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'ขาดงาน', 'มาสาย', 'วันที่มาสาย']];

    const body = data.map(d => {
        if (type === 'daily') {
            const row = d as any;
            return [row.no, row.name, row.role, row.arrival, row.departure, row.remark];
        } else {
            const row = d as any;
            return [row.no, row.name, row.role, row.absentCount, row.lateCount, row.lateDates];
        }
    });

    // Header
    doc.setFontSize(14);
    doc.text('โรงเรียนประจักษ์ศิลปาคม', 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(title, 105, 22, { align: 'center' });

    (doc as any).autoTable({
        startY: 28,
        head: headers,
        body: body,
        theme: 'grid',
        styles: {
            fontSize: 9,
            cellPadding: 2,
            halign: 'center',
            valign: 'middle',
            lineWidth: 0.1
        },
        headStyles: {
            fillColor: [190, 18, 60],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        columnStyles: {
            1: { halign: 'left' }
        },
        margin: { top: 20, bottom: 20 }, 
    });

    // FIXED: Calculate final position accurately and add signature block right after
    const finalY = (doc as any).lastAutoTable.finalY;
    const sigY = finalY + 15; // Move up to 15mm after the table ends
    
    doc.setFontSize(10);
    // Draw Left Signature
    doc.text('(ลงชื่อ)...........................................................', 55, sigY, { align: 'center' });
    doc.text('กลุ่มบริหารงานบุคคล', 55, sigY + 7, { align: 'center' });

    // Draw Right Signature
    doc.text('(ลงชื่อ)...........................................................', 155, sigY, { align: 'center' });
    doc.text('ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม', 155, sigY + 7, { align: 'center' });

    doc.save(`report_${type}_${selectedDate}.pdf`);
  };

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

  // Web view font size
  const webFontSize = '9px';

  return (
    <div className="w-full max-w-6xl mx-auto pb-20">
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4 no-print" onClick={() => setPreviewImage(null)}>
          <img src={previewImage.startsWith('data:') ? previewImage : `data:image/jpeg;base64,${previewImage}`} className="max-w-full max-h-[90vh] rounded-3xl border-4 border-white shadow-2xl" alt="Preview" />
        </div>
      )}

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
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3 rounded-2xl bg-white border-none font-bold text-rose-700 shadow-lg text-sm outline-none cursor-pointer" />
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print">
        {[
          { id: 'today', label: 'รายการวันนี้', emoji: '📅' },
          { id: 'official', label: 'ตารางสรุปประจำวัน', emoji: '📜' },
          { id: 'monthly', label: 'ตารางสรุปประจำเดือน', emoji: '📊' },
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

      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {activeTab === 'today' && (
          <div className="p-10">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
              <div className="bg-emerald-50 p-6 rounded-[2.5rem] border-2 border-emerald-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">มาทำงาน</p>
                <p className="text-3xl font-black text-emerald-600">{dailyAnalysis.present}</p>
              </div>
              <div className="bg-rose-50 p-6 rounded-[2.5rem] border-2 border-rose-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">มาสาย</p>
                <p className="text-3xl font-black text-rose-600">{dailyAnalysis.late}</p>
              </div>
              <div className="bg-blue-50 p-6 rounded-[2.5rem] border-2 border-blue-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">ลา</p>
                <p className="text-3xl font-black text-blue-700">{dailyAnalysis.leave}</p>
              </div>
              <div className="bg-amber-50 p-6 rounded-[2.5rem] border-2 border-amber-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">ไปราชการ</p>
                <p className="text-3xl font-black text-amber-600">{dailyAnalysis.duty}</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100 text-center shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ยังไม่ลงชื่อ</p>
                <p className="text-3xl font-black text-slate-600">{dailyAnalysis.absentCount}</p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <div>
                    <h3 className="text-2xl font-black text-stone-800">บันทึกการลงเวลาล่าสุด 🎁</h3>
                    <p className="text-stone-400 text-xs font-bold mt-1 uppercase tracking-widest">ข้อมูลการลงเวลาล่าสุด</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAiSummary} disabled={isGeneratingAi || filteredToday.length === 0} className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-50">
                      {isGeneratingAi ? '...' : '✨ AI วิเคราะห์'}
                    </button>
                  </div>
                </div>

                {aiSummary && (
                    <div className="mb-8 p-6 bg-emerald-50 rounded-3xl border border-emerald-100 text-emerald-800 animate-in zoom-in text-sm font-medium leading-relaxed shadow-inner">
                        <p className="font-black text-[10px] uppercase tracking-widest mb-2 text-emerald-400">การวิเคราะห์โดย AI</p>
                        {aiSummary}
                    </div>
                )}

                <div className="overflow-x-auto rounded-3xl border border-stone-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b border-stone-100">
                        <th className="p-5">เวลา</th>
                        <th className="p-5">รหัส</th>
                        <th className="p-5">ชื่อ-นามสกุล</th>
                        <th className="p-5 text-center">สถานะ</th>
                        <th className="p-5 text-center">หลักฐาน</th>
                        <th className="p-5 text-right">ลบ</th>
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
                            }`}>{r.status === 'On Time' ? 'มาตรงเวลา' : r.status === 'Late' ? 'มาสาย' : r.status === 'Duty' ? 'ไปราชการ' : r.status.includes('Leave') ? 'ลา' : r.status}</span>
                          </td>
                          <td className="p-5 text-center">
                            {r.imageUrl ? (
                              <button onClick={() => setPreviewImage(r.imageUrl!)} className="w-12 h-12 rounded-2xl bg-stone-900 overflow-hidden border-2 border-white shadow-lg active:scale-90 transition-all hover:ring-4 hover:ring-rose-100">
                                <img src={r.imageUrl.startsWith('data:') ? r.imageUrl : `data:image/jpeg;base64,${r.imageUrl}`} className="w-full h-full object-cover opacity-80" alt="Thumb" />
                              </button>
                            ) : <span className="text-[10px] text-stone-300 italic">ไม่มีรูป</span>}
                          </td>
                          <td className="p-5 text-right">
                            <button onClick={() => { if(confirm('ต้องการลบข้อมูลหรือไม่?')) deleteRecord(r).then(syncData) }} className="text-stone-300 hover:text-rose-500 transition-colors p-2 bg-stone-50 rounded-xl hover:bg-rose-50">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="w-full lg:w-80 flex flex-col gap-6">
                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 no-print flex-1 overflow-hidden flex flex-col">
                    <h4 className="font-black text-stone-800 mb-6 flex items-center justify-between shrink-0">
                      ยังไม่ลงชื่อ ⛄
                      <span className="bg-rose-500 text-white text-[10px] px-3 py-1 rounded-full">{dailyAnalysis.absentCount}</span>
                    </h4>
                    <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                      {dailyAnalysis.absentList.map(s => (
                          <div key={s.id} className="p-5 bg-white rounded-3xl border border-stone-100 shadow-sm transition-all hover:shadow-md">
                              <div className="font-bold text-stone-700 text-xs">{s.name}</div>
                              <div className="text-[10px] text-stone-400 font-bold mt-1 uppercase mb-4">{s.id} • {s.role}</div>
                              <div className="grid grid-cols-3 gap-1.5">
                                  <button onClick={() => handleQuickLeave(s, 'personal_leave')} className="py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-[9px] font-black transition-colors border border-amber-100">ลากิจ</button>
                                  <button onClick={() => handleQuickLeave(s, 'sick_leave')} className="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-[9px] font-black transition-colors border border-rose-100">ลาป่วย</button>
                                  <button onClick={() => handleQuickLeave(s, 'duty')} className="py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[9px] font-black transition-colors border border-blue-100">ไปราชการ</button>
                              </div>
                          </div>
                      ))}
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[3rem] border-4 border-rose-50 shadow-xl no-print">
                   <h4 className="font-black text-stone-800 mb-6 text-center text-sm uppercase tracking-widest">สัดส่วนการมาปฏิบัติงาน</h4>
                   <div className="h-64 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={chartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                        </PieChart>
                     </ResponsiveContainer>
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'official' && (
          <div className="p-0 md:p-4 bg-stone-100 min-h-screen relative overflow-auto">
             <div className="no-print absolute top-2 right-4 z-50 flex items-center gap-2">
                <button onClick={() => handleExportPDF('daily')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-black text-[9px] shadow-lg">PDF</button>
                <button onClick={() => window.print()} className="bg-white hover:bg-stone-50 text-stone-700 px-3 py-1.5 rounded-lg font-black text-[9px] shadow-lg border border-stone-200">Print</button>
             </div>

             <div className="max-w-[210mm] mx-auto bg-white shadow-2xl p-[5mm] md:p-[10mm] min-h-[297mm] flex flex-col border border-stone-200">
                <div className="flex flex-col items-center text-center mb-6">
                   <img src={SCHOOL_LOGO_URL} alt="School Logo" className="w-12 h-12 md:w-16 md:h-16 object-contain mb-2" />
                   <h1 className="text-sm md:text-base font-black text-stone-900 leading-tight uppercase">รายงานการมาปฏิบัติงานของครูและบุคลากรทางการศึกษา</h1>
                   <h1 className="text-sm md:text-base font-black text-stone-900 leading-tight uppercase">โรงเรียนประจักษ์ศิลปาคม</h1>
                   <h2 className="text-xs font-bold text-stone-700">ประจำวันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
                </div>
                
                {/* FIXED: Removed flex-1 to allow signature to follow the table naturally */}
                <div className="mt-2">
                   <table className="w-full border-collapse border border-stone-400">
                      <thead>
                         <tr className="bg-stone-50">
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-10">ลำดับ</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center">รายชื่อ</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-28">ตำแหน่ง</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-20">เวลามา</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-20">เวลากลับ</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-40">หมายเหตุ</th>
                         </tr>
                      </thead>
                      <tbody style={{ fontSize: webFontSize }}>
                         {officialData.map(d => (
                            <tr key={d.no} className="hover:bg-stone-50/20">
                               <td className="border border-stone-400 p-2 text-center font-mono">{d.no}</td>
                               <td className="border border-stone-400 p-2 text-left font-bold text-stone-800 pl-4">{d.name}</td>
                               <td className="border border-stone-400 p-2 text-center text-stone-500">{d.role}</td>
                               <td className="border border-stone-400 p-2 text-center">{d.arrival}</td>
                               <td className="border border-stone-400 p-2 text-center">{d.departure}</td>
                               <td className="border border-stone-400 p-2 text-center text-stone-500 italic">{d.remark}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                {/* SIGNATURE BLOCK: Anchored 30px after table ends */}
                <div className="mt-8 grid grid-cols-2 gap-10 text-center py-4">
                   <div>
                      <p className="text-[10px] text-stone-800 mb-2">(ลงชื่อ)...........................................................</p>
                      <p className="text-[10px] font-black text-stone-500 uppercase">กลุ่มบริหารงานบุคคล</p>
                   </div>
                   <div>
                      <p className="text-[10px] text-stone-800 mb-2">(ลงชื่อ)...........................................................</p>
                      <p className="text-[10px] font-black text-stone-500 uppercase">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'monthly' && (
          <div className="p-0 md:p-4 bg-stone-100 min-h-screen relative overflow-auto">
             <div className="no-print absolute top-2 right-4 z-50 flex items-center gap-2 bg-white/80 p-2 rounded-lg shadow-sm border border-stone-100 backdrop-blur-sm">
                <input type="month" value={selectedDate.substring(0, 7)} onChange={e => setSelectedDate(e.target.value + "-12")} className="bg-stone-100 border-none rounded-lg p-1 text-xs font-bold text-stone-700 cursor-pointer" />
                <button onClick={() => handleExportPDF('monthly')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md font-black text-[10px] shadow-sm">PDF</button>
             </div>
             <div className="max-w-[210mm] mx-auto bg-white shadow-2xl p-[5mm] md:p-[10mm] min-h-[297mm] flex flex-col border border-stone-200">
                <div className="flex flex-col items-center text-center mb-6">
                   <img src={SCHOOL_LOGO_URL} alt="School Logo" className="w-12 h-12 md:w-16 md:h-16 object-contain mb-2" />
                   <h1 className="text-sm md:text-base font-black text-stone-900 leading-tight uppercase">รายงานการมาสายของครูและบุคลากรทางการศึกษา</h1>
                   <h1 className="text-sm md:text-base font-black text-stone-900 leading-tight uppercase">โรงเรียนประจักษ์ศิลปาคม</h1>
                   <h2 className="text-xs font-bold text-stone-700">ประจำเดือน {new Date(selectedDate).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</h2>
                </div>
                
                {/* FIXED: Removed flex-1 to allow signature to follow the table naturally */}
                <div className="mt-2">
                   <table className="w-full border-collapse border border-stone-400">
                      <thead>
                         <tr className="bg-stone-50">
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-10">ลำดับ</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center">รายชื่อ</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-28">ตำแหน่ง</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-20">ขาดงาน</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center w-20">มาสาย</th>
                            <th className="border border-stone-400 p-2 text-[9px] font-black text-center">วันที่ที่มาสาย</th>
                         </tr>
                      </thead>
                      <tbody style={{ fontSize: webFontSize }}>
                         {monthlyLatenessData.map(d => (
                            <tr key={d.no} className="hover:bg-stone-50/20">
                               <td className="border border-stone-400 p-2 text-center font-mono">{d.no}</td>
                               <td className="border border-stone-400 p-2 text-left font-bold text-stone-800 pl-4">{d.name}</td>
                               <td className="border border-stone-400 p-2 text-center text-stone-500">{d.role}</td>
                               <td className={`border border-stone-400 p-2 text-center ${d.absentCount > 0 ? 'text-orange-600 font-black' : 'text-stone-300'}`}>{d.absentCount || '-'}</td>
                               <td className={`border border-stone-400 p-2 text-center ${d.lateCount > 0 ? 'text-rose-600 font-black' : 'text-stone-300'}`}>{d.lateCount || '-'}</td>
                               <td className="border border-stone-400 p-2 text-center text-stone-500 italic text-[8px]">{d.lateDates}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                {/* SIGNATURE BLOCK: Anchored 30px after table ends */}
                <div className="mt-8 grid grid-cols-2 gap-10 text-center py-4">
                   <div>
                      <p className="text-[10px] text-stone-800 mb-2">(ลงชื่อ)...........................................................</p>
                      <p className="text-[10px] font-black text-stone-500 uppercase">กลุ่มบริหารงานบุคคล</p>
                   </div>
                   <div>
                      <p className="text-[10px] text-stone-800 mb-2">(ลงชื่อ)...........................................................</p>
                      <p className="text-[10px] font-black text-stone-500 uppercase">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="p-10 max-w-2xl mx-auto no-print">
             <div className="text-center mb-10"><span className="text-6xl mb-4 inline-block">✍️</span><h3 className="text-2xl font-black text-stone-800">ลงเวลาทดแทน (Admin Entry)</h3><p className="text-stone-400 text-xs font-bold mt-2 italic">กรณีบุคลากรติดภารกิจ หรือมีปัญหาเรื่องอุปกรณ์บันทึกภาพ</p></div>
             <form onSubmit={handleManualCheckIn} className="space-y-6 bg-stone-50 p-10 rounded-[3rem] border-2 border-stone-100 shadow-xl">
                <div><label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">เลือกบุคลากรที่ต้องการบันทึก</label><select value={manualStaffId} onChange={e => setManualStaffId(e.target.value)} className="w-full p-5 bg-white border-2 border-stone-200 rounded-[1.5rem] font-bold text-stone-800 outline-none focus:ring-4 focus:ring-rose-100 transition-all shadow-sm" required><option value="">-- ค้นหารายชื่อบุคลากร --</option>{staffList.map(s => <option key={s.id} value={s.id}>{s.id} : {s.name}</option>)}</select></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div><label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">ประเภทการลงเวลา</label><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setManualType('arrival')} className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${manualType === 'arrival' ? 'bg-emerald-500 text-white border-emerald-400 shadow-md scale-105' : 'bg-white text-stone-400 border-stone-100 opacity-60'}`}>มาทำงาน</button><button type="button" onClick={() => setManualType('departure')} className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${manualType === 'departure' ? 'bg-amber-500 text-white border-amber-400 shadow-md scale-105' : 'bg-white text-stone-400 border-stone-100 opacity-60'}`}>กลับบ้าน</button></div></div>
                   <div><label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">ระบุเวลา (Time)</label><input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)} className="w-full p-4 bg-white border-2 border-stone-200 rounded-2xl font-bold text-stone-800 outline-none focus:ring-4 focus:ring-rose-100 transition-all shadow-sm h-[52px]" required /></div>
                </div>
                <div><label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">เหตุผลในการลงเวลาแทน</label><textarea value={manualReason} onChange={e => setManualReason(e.target.value)} className="w-full p-5 bg-white border-2 border-stone-200 rounded-[1.5rem] font-bold text-stone-800 outline-none h-32 shadow-sm" placeholder="ระบุเหตุผล เช่น ติดราชการภายนอก, ลืมบันทึกเวลา..." /></div>
                <button type="submit" className="w-full py-6 bg-rose-600 hover:bg-rose-700 text-white rounded-[1.5rem] font-black shadow-2xl shadow-rose-200 active:scale-95 transition-all text-lg">บันทึกข้อมูลเข้าระบบ 🎉</button>
             </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
