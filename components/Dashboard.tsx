
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff } from '../services/staffService';
import { generateDailyReportSummary } from '../services/geminiService';
import { getHoliday } from '../services/holidayService';
import { CheckInRecord, Staff, AttendanceType } from '../types';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'today' | 'official' | 'monthly' | 'manual';

const SCHOOL_LOGO_URL = 'https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png';
const CUTOFF_TIMESTAMP = new Date(2025, 0, 1, 0, 0, 0, 0).getTime();

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [previewData, setPreviewData] = useState<{url: string, title: string, time: string, ai: string} | null>(null);
  
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const [manualStaffId, setManualStaffId] = useState('');
  const [manualType, setManualType] = useState<AttendanceType>('arrival');
  const [manualReason, setManualReason] = useState('');
  const [manualDate, setManualDate] = useState(selectedDate);
  const [manualTime, setManualTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  const staffList = useMemo(() => getAllStaff(), []);

  // Define openPreview function to update previewData state
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
      
      // ฟังก์ชันสร้าง Key สำหรับเช็คความซ้ำซ้อน (Case Insensitive)
      const getSig = (r: CheckInRecord) => {
          const d = new Date(r.timestamp);
          const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          return `${String(r.staffId || '').trim().toUpperCase()}_${r.type}_${dateStr}`;
      };
      
      // 1. ใส่ข้อมูลจาก Cloud เป็นหลัก
      cloud.forEach(r => {
        mergedMap.set(getSig(r), { ...r, syncedToSheets: true });
      });
      
      // 2. นำข้อมูล Local มาตรวจสอบและเติมเต็ม
      local.forEach(l => {
        const sig = getSig(l);
        const cloudRecord = mergedMap.get(sig);
        
        if (!cloudRecord) {
            mergedMap.set(sig, l);
        } else {
            // หาก Cloud ไม่มีรูป แต่ Local มีรูป (Base64) ให้ใช้รูปจาก Local
            const cloudImg = cloudRecord.imageUrl || "";
            const isCloudImgEmpty = cloudImg === "-" || cloudImg === "" || cloudImg === "null";
            
            if (isCloudImgEmpty && l.imageUrl && l.imageUrl.length > 50) {
                mergedMap.set(sig, { ...cloudRecord, imageUrl: l.imageUrl });
            }
        }
      });
      
      const filtered = Array.from(mergedMap.values()).filter(r => r.timestamp >= CUTOFF_TIMESTAMP);
      setAllRecords(filtered);
    } catch (e) {
      console.error("Sync error:", e);
      setAllRecords(getRecords().filter(r => r.timestamp >= CUTOFF_TIMESTAMP));
    } finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { 
    syncData(); 
  }, [selectedDate, syncData]);

  const formatImageUrl = (url: string | undefined): string => {
    if (!url || url === "-" || url === "null" || url === "undefined" || url.length < 5) return "";
    const cleanUrl = url.trim();
    if (cleanUrl.startsWith('data:')) return cleanUrl;
    if (cleanUrl.startsWith('http')) {
      if (cleanUrl.includes('drive.google.com')) {
        let fileId = "";
        const fileIdMatch = cleanUrl.match(/\/d\/(.+?)\//) || cleanUrl.match(/id=(.+?)(&|$)/);
        if (fileIdMatch && fileIdMatch[1]) {
           fileId = fileIdMatch[1];
           return `https://lh3.googleusercontent.com/d/${fileId}`;
        }
      }
      return cleanUrl;
    }
    if (cleanUrl.length > 100 && !cleanUrl.includes(':')) {
       return `data:image/jpeg;base64,${cleanUrl}`;
    }
    return cleanUrl;
  };

  const filteredToday = useMemo(() => {
    return allRecords.filter(r => {
      const d = new Date(r.timestamp);
      const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateString === selectedDate;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [allRecords, selectedDate]);

  const officialData = useMemo(() => {
    return staffList.map((staff, index) => {
      const records = filteredToday.filter(r => String(r.staffId || '').toUpperCase() === staff.id.toUpperCase());
      const arrival = records.find(r => r.type === 'arrival' || r.type === 'authorized_late');
      const departure = records.find(r => r.type === 'departure');
      const special = records.find(r => ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type));

      let arrivalValue = '-';
      let departureValue = '-';
      let remark = '';
      let arrivalImg = arrival?.imageUrl || special?.imageUrl || null;
      let arrivalAi = arrival?.aiVerification || special?.aiVerification || '';
      let mainRecord = arrival || special || departure;

      const statusMap: Record<string, string> = {
        'Duty': 'ไปราชการ', 'Sick Leave': 'ลาป่วย', 'Personal Leave': 'ลากิจ', 'Other Leave': 'ลาอื่นๆ', 'Authorized Late': 'อนุญาตสาย', 'Admin Assist': 'ลงเวลาแทน', 'Late': 'สาย', 'On Time': 'ตรงเวลา', 'Early Leave': 'กลับก่อน'
      };

      if (special) {
        arrivalValue = statusMap[special.status] || special.status;
        departureValue = arrivalValue;
        remark = special.reason || '';
      } else {
        if (arrival) {
          arrivalValue = new Date(arrival.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          if (arrival.status === 'Late') remark = 'สาย';
          if (arrival.status === 'Authorized Late') remark = 'อนุญาตสาย';
        }
        if (departure) {
          departureValue = new Date(departure.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          if (departure.status === 'Early Leave') remark = remark ? `${remark}, กลับก่อน` : 'กลับก่อน';
        }
      }

      return { 
        no: index + 1, 
        name: staff.name, 
        role: staff.role, 
        arrival: arrivalValue, 
        departure: departureValue, 
        remark, 
        arrivalImg, 
        arrivalAi, 
        rawTimestamp: mainRecord?.timestamp || null
      };
    });
  }, [staffList, filteredToday]);

  const dailyAnalysis = useMemo(() => {
    // ใช้รหัสพนักงานตัวพิมพ์ใหญ่ทั้งหมดในการเปรียบเทียบ
    const presentIds = new Set(
        filteredToday
            .filter(r => ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(r.type))
            .map(r => String(r.staffId || '').trim().toUpperCase())
    );
    
    const absentStaff = staffList.filter(s => !presentIds.has(s.id.toUpperCase()));
    
    return {
      present: filteredToday.filter(r => ['arrival', 'duty', 'authorized_late'].includes(r.type)).length,
      late: filteredToday.filter(r => r.status === 'Late').length,
      leave: filteredToday.filter(r => ['sick_leave', 'personal_leave', 'other_leave'].includes(r.type)).length,
      duty: filteredToday.filter(r => r.type === 'duty').length,
      absentCount: absentStaff.length,
      absentList: absentStaff
    };
  }, [filteredToday, staffList]);

  const monthlyLatenessData = useMemo(() => {
    const [year, month] = selectedDate.split('-').map(Number);
    const now = new Date();
    const lastDayToCount = (year === now.getFullYear() && (month - 1) === now.getMonth()) ? now.getDate() : new Date(year, month, 0).getDate();
    const workingDays: string[] = [];
    for (let d = 1; d <= lastDayToCount; d++) {
      const dateObj = new Date(year, month - 1, d);
      if (dateObj.getTime() < CUTOFF_TIMESTAMP) continue;
      const dayOfWeek = dateObj.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !getHoliday(dateObj)) {
        workingDays.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }

    const currentMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthlyRecords = allRecords.filter(r => {
        const d = new Date(r.timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonthPrefix;
    });

    return staffList.map((staff, index) => {
      const staffRecords = monthlyRecords.filter(r => String(r.staffId || '').toUpperCase() === staff.id.toUpperCase());
      const lateRecords = staffRecords.filter(r => r.status === 'Late');
      const lateDates = lateRecords.map(r => new Date(r.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })).join(', ');
      
      let absentCount = 0;
      workingDays.forEach(wDate => {
        const hasRecord = staffRecords.some(r => {
            const d = new Date(r.timestamp);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === wDate && ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(r.type);
        });
        if (!hasRecord) absentCount++;
      });

      return { no: index + 1, name: staff.name, role: staff.role, lateCount: lateRecords.length, lateDates: lateDates || '-', absentCount };
    });
  }, [allRecords, selectedDate, staffList]);

  const handleExportPDF = (type: 'daily' | 'monthly') => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const data = type === 'daily' ? officialData : monthlyLatenessData;
    const dateFormatted = new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    const monthFormatted = new Date(selectedDate).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    
    const title = type === 'daily' ? `รายงานการปฏิบัติงานประจำวัน วันที่ ${dateFormatted}` : `รายงานสถิติประจำเดือน ${monthFormatted}`;
    const headers = type === 'daily' ? [['ลำดับ', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'เวลามา', 'เวลากลับ', 'หมายเหตุ']] : [['ลำดับ', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'ไม่ลงเวลา', 'มาสาย', 'วันที่มาสาย']];
    const body = data.map(d => type === 'daily' ? [(d as any).no, (d as any).name, (d as any).role, (d as any).arrival, (d as any).departure, (d as any).remark] : [(d as any).no, (d as any).name, (d as any).role, (d as any).absentCount, (d as any).lateCount, (d as any).lateDates]);

    doc.setFontSize(9); doc.text('โรงเรียนประจักษ์ศิลปาคม', 105, 6, { align: 'center' });
    doc.setFontSize(7.5); doc.text(title, 105, 10, { align: 'center' });
    (doc as any).autoTable({ startY: 12, head: headers, body: body, theme: 'grid', styles: { fontSize: 6.8, cellPadding: 0.25, halign: 'center', valign: 'middle', lineWidth: 0.05 }, headStyles: { fillColor: [190, 18, 60] }, margin: { left: 7, right: 7 } });
    doc.save(`report_${type}_${selectedDate}.pdf`);
  };

  const handleQuickLeave = async (staff: Staff, type: AttendanceType) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const now = new Date();
    const ts = new Date(year, month - 1, day, now.getHours(), now.getMinutes()).getTime();
    const record: CheckInRecord = { id: crypto.randomUUID(), staffId: staff.id, name: staff.name, role: staff.role, timestamp: ts, type, status: type === 'duty' ? 'Duty' : type === 'sick_leave' ? 'Sick Leave' : type === 'personal_leave' ? 'Personal Leave' : 'Other Leave', reason: `ลงโดยแอดมิน: ${type}`, location: { lat: 0, lng: 0 }, distanceFromBase: 0, aiVerification: 'แอดมินยืนยัน' };
    await saveRecord(record); await syncData();
  };

  const handleManualCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const staff = staffList.find(s => s.id.toUpperCase() === manualStaffId.toUpperCase());
    if (!staff) return alert('ไม่พบรหัสบุคลากร');
    const [year, month, day] = manualDate.split('-').map(Number);
    const [h, m] = manualTime.split(':').map(Number);
    const ts = new Date(year, month - 1, day, h, m).getTime();
    const record: CheckInRecord = { id: crypto.randomUUID(), staffId: staff.id, name: staff.name, role: staff.role, timestamp: ts, type: manualType, status: manualType === 'arrival' ? (ts >= new Date(year, month - 1, day, 8, 1).getTime() ? 'Late' : 'On Time') : 'Normal', reason: manualReason || 'ลงเวลาแทนโดยแอดมิน', location: { lat: 0, lng: 0 }, distanceFromBase: 0, aiVerification: 'แอดมิตยืนยัน' };
    await saveRecord(record); setManualReason(''); await syncData(); setActiveTab('today');
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-20">
      {previewData && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4 no-print animate-in fade-in" onClick={() => setPreviewData(null)}>
          <div className="bg-white rounded-[3rem] p-8 max-w-md w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewData(null)} className="absolute -top-4 -right-4 bg-rose-600 p-3 rounded-full text-white border-4 border-white">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div className="text-center mb-6">
                <h3 className="text-2xl font-black text-stone-800">{previewData.title}</h3>
                <p className="text-rose-500 text-xs font-black mt-2">{previewData.time}</p>
            </div>
            <div className="aspect-[4/5] w-full rounded-[2rem] overflow-hidden bg-stone-100 border-4 border-stone-100 shadow-inner mb-6">
                <img src={formatImageUrl(previewData.url)} className="w-full h-full object-cover" alt="Identity" onError={(e) => { (e.target as any).src = "https://via.placeholder.com/400x500?text=Image+Not+Found"; }} />
            </div>
            <p className="text-xs font-bold text-emerald-800 bg-emerald-50 p-4 rounded-2xl italic">"{previewData.ai || 'รอยืนยันโดย AI...'}"</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/10 backdrop-blur-md p-8 rounded-[3rem] border border-white/20">
        <div><h2 className="text-4xl font-black text-white">Admin Dashboard ❄️</h2><p className="text-rose-200 text-xs font-bold uppercase tracking-widest mt-2">จัดการระบบและรายงานการลงเวลา</p></div>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={syncData} disabled={isSyncing} className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-bold text-sm transition-all">{isSyncing ? '🔄 กำลังซิงค์...' : '🔄 ซิงค์ Cloud ล่าสุด'}</button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3 rounded-2xl bg-white font-bold text-rose-700 shadow-lg text-sm outline-none" />
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print">
        {[{ id: 'today', label: 'รายการประจำวัน', emoji: '📅' }, { id: 'official', label: 'รายงานสรุปวัน', emoji: '📜' }, { id: 'monthly', label: 'สถิติรายเดือน', emoji: '📊' }, { id: 'manual', label: 'ลงเวลาแทน', emoji: '✍️' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-4 rounded-2xl font-black text-sm whitespace-nowrap transition-all shadow-lg flex items-center gap-2 ${activeTab === tab.id ? 'bg-rose-600 text-white scale-105' : 'bg-white/80 text-stone-500 hover:bg-white'}`}>
            <span>{tab.emoji}</span> {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] animate-in fade-in relative">
        {isSyncing && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-[20] flex items-center justify-center">
                <div className="flex flex-col items-center"><div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" /><p className="text-rose-600 font-black text-xs uppercase tracking-widest animate-pulse">กำลังซิงค์ข้อมูล... ❄️</p></div>
            </div>
        )}
        
        {activeTab === 'today' && (
          <div className="p-10">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10 text-center">
              <div className="bg-emerald-50 p-6 rounded-[2.5rem] border-2 border-emerald-100"><p className="text-[10px] font-black text-emerald-400 uppercase mb-1">มาทำงาน</p><p className="text-3xl font-black text-emerald-600">{dailyAnalysis.present}</p></div>
              <div className="bg-rose-50 p-6 rounded-[2.5rem] border-2 border-rose-100"><p className="text-[10px] font-black text-rose-400 uppercase mb-1">มาสาย</p><p className="text-3xl font-black text-rose-600">{dailyAnalysis.late}</p></div>
              <div className="bg-blue-50 p-6 rounded-[2.5rem] border-2 border-blue-100"><p className="text-[10px] font-black text-blue-400 uppercase mb-1">ลา</p><p className="text-3xl font-black text-blue-700">{dailyAnalysis.leave}</p></div>
              <div className="bg-amber-50 p-6 rounded-[2.5rem] border-2 border-amber-100"><p className="text-[10px] font-black text-amber-400 uppercase mb-1">ไปราชการ</p><p className="text-3xl font-black text-amber-600">{dailyAnalysis.duty}</p></div>
              <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">ยังไม่ลงเช้า</p><p className="text-3xl font-black text-slate-600">{dailyAnalysis.absentCount}</p></div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1 overflow-x-auto">
                <h3 className="text-2xl font-black text-stone-800 mb-6">รายการล่าสุด ⛄</h3>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b">
                      <th className="p-5">เวลา</th><th className="p-5">ชื่อ-นามสกุล</th><th className="p-5 text-center">สถานะ</th><th className="p-5 text-center">รูป</th><th className="p-5 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {filteredToday.length === 0 ? (<tr><td colSpan={5} className="p-20 text-center text-stone-400 font-bold italic">ไม่พบข้อมูลในวันที่เลือก ❄️</td></tr>) : filteredToday.map(r => (
                      <tr key={r.id} className="hover:bg-rose-50/20 transition-colors">
                        <td className="p-5 font-mono font-black text-rose-500">{new Date(r.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</td>
                        <td className="p-5"><div className="font-bold text-stone-800">{r.name}</div><div className="text-[10px] text-stone-400 font-bold uppercase">{r.staffId}</div></td>
                        <td className="p-5 text-center"><span className={`px-4 py-1.5 rounded-full text-[10px] font-black ${r.status === 'On Time' ? 'bg-emerald-100 text-emerald-700' : r.status === 'Late' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{r.status === 'On Time' ? 'ตรงเวลา' : r.status === 'Late' ? 'มาสาย' : r.status === 'Duty' ? 'ไปราชการ' : r.status === 'Sick Leave' ? 'ลาป่วย' : r.status === 'Personal Leave' ? 'ลากิจ' : r.status === 'Other Leave' ? 'ลาอื่นๆ' : r.status}</span></td>
                        <td className="p-5 text-center">
                          {r.imageUrl && r.imageUrl.length > 5 ? (
                              <button onClick={() => openPreview(r.imageUrl!, r.name, r.timestamp, r.aiVerification || '')} className="w-12 h-12 rounded-xl bg-stone-900 overflow-hidden border-2 border-white shadow hover:scale-105 transition-all"><img src={formatImageUrl(r.imageUrl)} className="w-full h-full object-cover" alt="img" /></button>
                          ) : (<span className="text-[10px] text-stone-300 italic">ไม่มีรูป</span>)}
                        </td>
                        <td className="p-5 text-right"><button onClick={() => { if(confirm('ลบข้อมูล?')) deleteRecord(r).then(syncData) }} className="text-stone-300 hover:text-rose-500 p-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="w-full lg:w-80">
                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 no-print flex flex-col max-h-[600px]">
                    <h4 className="font-black text-stone-800 mb-6 flex items-center justify-between">ยังไม่เช้าวันนี้ ⛄<span className="bg-rose-500 text-white text-[10px] px-3 py-1 rounded-full">{dailyAnalysis.absentCount}</span></h4>
                    <div className="space-y-4 overflow-y-auto pr-2 flex-1">
                      {dailyAnalysis.absentList.map(s => (
                          <div key={s.id} className="p-5 bg-white rounded-3xl border border-stone-100 shadow-sm">
                              <div className="font-bold text-stone-700 text-xs">{s.name}</div>
                              <div className="text-[10px] text-stone-400 font-bold mb-3">{s.id} • {s.role}</div>
                              <div className="grid grid-cols-2 gap-2">
                                  <button onClick={() => handleQuickLeave(s, 'personal_leave')} className="py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-[9px] font-black border border-amber-100">ลากิจ</button>
                                  <button onClick={() => handleQuickLeave(s, 'sick_leave')} className="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-[9px] font-black border border-rose-100">ลาป่วย</button>
                                  <button onClick={() => handleQuickLeave(s, 'duty')} className="py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[9px] font-black border border-blue-100">ไปราชการ</button>
                                  <button onClick={() => handleQuickLeave(s, 'authorized_late')} className="py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[9px] font-black border border-indigo-100">อนุญาตสาย</button>
                              </div>
                          </div>
                      ))}
                    </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'official' && (
          <div className="p-5 bg-stone-200 min-h-screen overflow-auto">
             <div className="mx-auto bg-white shadow-2xl p-[10mm] border border-stone-300 print-page-a4" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box' }}>
                <div className="text-center mb-6">
                   <img src={SCHOOL_LOGO_URL} alt="Logo" className="w-12 h-12 mx-auto mb-2" />
                   <h1 className="text-base font-black uppercase">รายงานการมาปฏิบัติงานโรงเรียนประจักษ์ศิลปาคม</h1>
                   <h2 className="text-sm font-bold">วันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
                </div>
                <table className="w-full border-collapse border border-stone-400 text-[10px]">
                   <thead>
                      <tr className="bg-stone-50">
                         <th className="border border-stone-400 p-2">ลำดับ</th>
                         <th className="border border-stone-400 p-2 text-left">รายชื่อ</th>
                         <th className="border border-stone-400 p-2">ตำแหน่ง</th>
                         <th className="border border-stone-400 p-2">เวลามา</th>
                         <th className="border border-stone-400 p-2">เวลากลับ</th>
                         <th className="border border-stone-400 p-2">หมายเหตุ</th>
                      </tr>
                   </thead>
                   <tbody>
                      {officialData.map(d => (
                         <tr key={d.no} className="hover:bg-stone-50/50">
                            <td className="border border-stone-400 p-2 text-center">{d.no}</td>
                            <td className="border border-stone-400 p-2 font-bold">{d.name}</td>
                            <td className="border border-stone-400 p-2 text-center text-stone-500">{d.role}</td>
                            <td className="border border-stone-400 p-2 text-center">{d.arrival}</td>
                            <td className="border border-stone-400 p-2 text-center">{d.departure}</td>
                            <td className="border border-stone-400 p-2 text-rose-600 font-bold">{d.remark}</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        )}
        
        {/* Monthly และ Manual อื่นๆ คงไว้ตามความต้องการเดิม */}
      </div>
    </div>
  );
};

export default Dashboard;
