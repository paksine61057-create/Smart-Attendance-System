
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
const CUTOFF_TIMESTAMP = new Date(2025, 11, 11, 0, 0, 0, 0).getTime();

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

  useEffect(() => {
    if (activeTab === 'manual') {
      setManualDate(selectedDate);
    }
  }, [activeTab, selectedDate]);

  const staffList = useMemo(() => getAllStaff(), []);

  const syncData = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncUnsyncedRecords();
      const cloud = await fetchGlobalRecords();
      const local = getRecords();
      
      const getSig = (r: CheckInRecord) => `${r.timestamp}_${String(r.staffId || '').toUpperCase().trim()}_${r.type}`;
      
      const mergedMap = new Map<string, CheckInRecord>();
      
      // 1. นำข้อมูลจาก Cloud ตั้งต้น (ข้อมูลที่นี่จะสะอาด มี URL รูปภาพจาก Drive)
      cloud.forEach(r => {
        mergedMap.set(getSig(r), { ...r, syncedToSheets: true });
      });
      
      // 2. ตรวจสอบข้อมูลใน Local เพื่อดึงรายการที่พึ่งบันทึกและยังไม่ได้ Sync
      local.forEach(l => {
        const sig = getSig(l);
        if (!mergedMap.has(sig)) {
          // รายการใหม่ที่ยังไม่ขึ้น Cloud ให้ใช้ภาพ Base64 จากเครื่องไปก่อน
          mergedMap.set(sig, l);
        } else {
          // รายการที่มีอยู่ทั้งสองที่: ให้ใช้ของ Cloud เป็นหลัก (เพราะภาพเป็น URL แล้ว)
          const cloudRecord = mergedMap.get(sig)!;
          const isCloudImgValid = cloudRecord.imageUrl && cloudRecord.imageUrl.startsWith('http');
          
          if (!isCloudImgValid && l.imageUrl && l.imageUrl.length > 100) {
            // กรณีพิเศษ: ถ้าใน Cloud ดึงมาแล้วรูปเสีย แต่ในเครื่องมีรูป Base64 อยู่ ให้ใช้ Base64 ไปก่อน
            mergedMap.set(sig, { ...cloudRecord, imageUrl: l.imageUrl });
          }
        }
      });
      
      const filtered = Array.from(mergedMap.values()).filter(r => r.timestamp >= CUTOFF_TIMESTAMP);
      setAllRecords(filtered);
    } catch (e) {
      console.error("Sync error:", e);
      const localOnly = getRecords().filter(r => r.timestamp >= CUTOFF_TIMESTAMP);
      setAllRecords(localOnly);
    } finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { 
    syncData(); 
  }, [selectedDate, syncData]);

  // ฟังก์ชันช่วยแสดงรูปภาพ (แปลง Google Drive URL เป็น Direct Link)
  const formatImageUrl = (url: string | undefined): string => {
    if (!url || url === "-" || url === "null" || url === "undefined" || url.length < 5) return "";
    const cleanUrl = url.trim();

    // กรณีเป็นรหัส Base64 (จะแสดงผลเฉพาะตอนที่ยังไม่ได้ Sync)
    if (cleanUrl.startsWith('data:')) return cleanUrl;

    // กรณีเป็นลิงก์ Google Drive
    if (cleanUrl.startsWith('http')) {
      if (cleanUrl.includes('drive.google.com')) {
        let fileId = "";
        const fileIdMatch = cleanUrl.match(/\/d\/(.+?)\//) || cleanUrl.match(/id=(.+?)(&|$)/);
        if (fileIdMatch && fileIdMatch[1]) {
           fileId = fileIdMatch[1];
           // แปลงลิงก์ Drive เป็น Direct Image Link เพื่อให้แสดงผลในแท็ก img ได้
           return `https://lh3.googleusercontent.com/d/${fileId}`;
        }
      }
      return cleanUrl;
    }

    // กรณีเป็นรหัส Base64 ดิบที่ไม่มี prefix (เผื่อมีค้างในชีต)
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
      const records = filteredToday.filter(r => r.staffId === staff.id);
      const arrival = records.find(r => r.type === 'arrival' || r.type === 'authorized_late');
      const departure = records.find(r => r.type === 'departure');
      const special = records.find(r => ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type));

      let arrivalValue = '-';
      let departureValue = '-';
      let remark = '';
      let arrivalImg = arrival?.imageUrl || null;
      let arrivalAi = arrival?.aiVerification || '';
      let mainRecord = arrival || special || departure;

      const statusMap: Record<string, string> = {
        'Duty': 'ไปราชการ', 'Sick Leave': 'ลาป่วย', 'Personal Leave': 'ลากิจ', 'Other Leave': 'ลาอื่นๆ', 'Authorized Late': 'อนุญาตสาย', 'Admin Assist': 'แอดมินลงเวลาให้'
      };

      if (special) {
        const thaiStatus = statusMap[special.status] || special.status;
        arrivalValue = thaiStatus;
        departureValue = thaiStatus;
        remark = special.reason || '';
        arrivalImg = special.imageUrl || null;
        arrivalAi = special.aiVerification || '';
      } else {
        if (arrival) {
          const time = new Date(arrival.timestamp);
          arrivalValue = time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          if (arrival.type === 'authorized_late' || arrival.status === 'Authorized Late') remark = 'อนุญาตสาย' + (arrival.reason ? ` (${arrival.reason})` : '');
          else if (arrival.status === 'Late') remark = 'สาย' + (arrival.reason ? ` (${arrival.reason})` : '');
          else if (arrival.status === 'Admin Assist') remark = 'แอดมินลงเวลาให้';
        }
        if (departure) {
          const time = new Date(departure.timestamp);
          departureValue = time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          if (departure.status === 'Early Leave') {
            const leaveMsg = 'กลับก่อน' + (departure.reason ? ` (${departure.reason})` : '');
            remark = remark ? `${remark}, ${leaveMsg}` : leaveMsg;
          } else if (departure.status === 'Admin Assist' && !remark.includes('แอดมิน')) remark = remark ? `${remark}, แอดมินลงเวลาให้` : 'แอดมินลงเวลาให้';
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
    const presentIds = new Set(filteredToday.filter(r => ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(r.type)).map(r => r.staffId));
    const absentStaff = staffList.filter(s => !presentIds.has(s.id));
    return {
      present: filteredToday.filter(r => ['arrival', 'duty', 'authorized_late'].includes(r.type)).length,
      late: filteredToday.filter(r => r.status === 'Late').length,
      leave: filteredToday.filter(r => r.type.includes('_leave')).length,
      duty: filteredToday.filter(r => r.type === 'duty').length,
      absentCount: absentStaff.length,
      absentList: absentStaff
    };
  }, [filteredToday, staffList]);

  const monthlyLatenessData = useMemo(() => {
    const [year, month] = selectedDate.split('-').map(Number);
    const currentMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthlyRecords = allRecords.filter(r => {
        const d = new Date(r.timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentMonthPrefix;
    });
    const now = new Date();
    const isCurrentMonth = (year === now.getFullYear() && (month - 1) === now.getMonth());
    const lastDayToCount = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate();
    const workingDays: string[] = [];
    for (let d = 1; d <= lastDayToCount; d++) {
      const dateObj = new Date(year, month - 1, d);
      if (dateObj.getTime() < CUTOFF_TIMESTAMP) continue;
      const dayOfWeek = dateObj.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !getHoliday(dateObj)) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (monthlyRecords.some(r => {
           const rd = new Date(r.timestamp);
           return `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}-${String(rd.getDate()).padStart(2, '0')}` === dateStr;
        })) workingDays.push(dateStr);
      }
    }
    return staffList.map((staff, index) => {
      const staffRecords = monthlyRecords.filter(r => r.staffId === staff.id);
      const lateRecords = staffRecords.filter(r => r.status === 'Late');
      const lateDates = lateRecords.map(r => new Date(r.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })).join(', ');
      let absentCount = 0;
      workingDays.forEach(wDate => {
        if (!staffRecords.some(r => {
            const d = new Date(r.timestamp);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === wDate && ['arrival', 'duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(r.type);
        })) absentCount++;
      });
      return { no: index + 1, name: staff.name, role: staff.role, lateCount: lateRecords.length, lateDates: lateDates || '-', absentCount };
    });
  }, [allRecords, selectedDate, staffList]);

  const handleExportPDF = (type: 'daily' | 'monthly') => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const data = type === 'daily' ? officialData : monthlyLatenessData;
    const dateFormatted = new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    const monthFormatted = new Date(selectedDate).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    
    const title = type === 'daily' 
        ? `รายงานการปฏิบัติงานประจำวัน วันที่ ${dateFormatted}`
        : `รายงานสถิติประจำเดือน ${monthFormatted}`;
    
    const headers = type === 'daily' 
        ? [['ลำดับ', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'เวลามา', 'เวลากลับ', 'หมายเหตุ']]
        : [['ลำดับ', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'ไม่ลงเวลา', 'มาสาย', 'วันที่มาสาย']];
    
    const body = data.map(d => {
        if (type === 'daily') {
            const row = d as any;
            return [row.no, row.name, row.role, row.arrival, row.departure, row.remark];
        } else {
            const row = d as any;
            return [row.no, row.name, row.role, row.absentCount, row.lateCount, row.lateDates];
        }
    });

    doc.setFontSize(14);
    doc.text('โรงเรียนประจักษ์ศิลปาคม', 105, 12, { align: 'center' });
    doc.setFontSize(11);
    doc.text(title, 105, 18, { align: 'center' });

    (doc as any).autoTable({
        startY: 20, 
        head: headers,
        body: body,
        theme: 'grid',
        styles: { 
            fontSize: 9, 
            cellPadding: 1.0, 
            halign: 'center', 
            valign: 'middle', 
            lineWidth: 0.1, 
            overflow: 'visible' 
        },
        headStyles: { fillColor: [190, 18, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 
            0: { cellWidth: 8 }, 
            1: { halign: 'left', cellWidth: 55, fontStyle: 'bold' }, 
            2: { halign: 'center', cellWidth: 42 }, 
            3: { cellWidth: 14 }, 
            4: { cellWidth: 14 } 
        },
        margin: { left: 15, right: 15, top: 15, bottom: 20 },
        pageBreak: 'avoid',
    });

    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(9.5);
    doc.text('(ลงชื่อ)...........................................................', 65, finalY + 8, { align: 'center' });
    doc.text('กลุ่มบริหารงานบุคคล', 65, finalY + 13, { align: 'center' });
    doc.text('(ลงชื่อ)...........................................................', 145, finalY + 8, { align: 'center' });
    doc.text('ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม', 145, finalY + 13, { align: 'center' });

    doc.save(`report_${type}_${selectedDate}.pdf`);
  };

  const handleQuickLeave = async (staff: Staff, type: AttendanceType) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const now = new Date();
    const timestamp = new Date(year, month - 1, day, now.getHours(), now.getMinutes()).getTime();
    const record: CheckInRecord = {
      id: crypto.randomUUID(), staffId: staff.id, name: staff.name, role: staff.role, timestamp, type,
      status: type === 'duty' ? 'Duty' : (type === 'sick_leave' ? 'Sick Leave' : (type === 'personal_leave' ? 'Personal Leave' : 'Other Leave')),
      reason: `Admin recorded: ${type.replace('_', ' ')}`, location: { lat: 0, lng: 0 }, distanceFromBase: 0, aiVerification: 'Admin Direct Authorized'
    };
    await saveRecord(record); await syncData();
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
    const [year, month, day] = manualDate.split('-').map(Number);
    const [hours, minutes] = manualTime.split(':').map(Number);
    const manualTimestamp = new Date(year, month - 1, day, hours, minutes).getTime();
    let status: any = 'Admin Assist';
    if (manualType === 'arrival') {
        const limit = new Date(year, month - 1, day, 8, 1, 0, 0).getTime();
        status = manualTimestamp >= limit ? 'Late' : 'On Time';
    }
    const record: CheckInRecord = {
      id: crypto.randomUUID(), staffId: staff.id, name: staff.name, role: staff.role, timestamp: manualTimestamp, type: manualType,
      status, reason: manualReason || 'Manual override by admin', location: { lat: 0, lng: 0 }, distanceFromBase: 0, aiVerification: 'Admin Authorized'
    };
    await saveRecord(record); setManualReason(''); setSelectedDate(manualDate); await syncData(); setActiveTab('today');
  };

  const openPreview = (url: string | null, name: string, timestamp: number | null, ai: string) => {
    if (!url) return;
    const timeStr = timestamp 
        ? new Date(timestamp).toLocaleTimeString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) 
        : '-';
    setPreviewData({ url, title: name, time: timeStr, ai });
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-20">
      {previewData && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4 no-print animate-in fade-in duration-300" onClick={() => setPreviewData(null)}>
          <div className="bg-white rounded-[3rem] p-8 max-w-md w-full shadow-2xl border-4 border-white/50 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewData(null)} className="absolute -top-4 -right-4 bg-rose-600 p-3 rounded-full shadow-xl hover:bg-rose-700 transition-all text-white active:scale-90 border-4 border-white">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div className="mb-6 text-center">
                <h3 className="text-2xl font-black text-stone-800 leading-tight">{previewData.title}</h3>
                <p className="text-rose-500 text-xs font-black uppercase tracking-widest mt-2 bg-rose-50 inline-block px-4 py-1.5 rounded-full border border-rose-100">{previewData.time}</p>
            </div>
            <div className="aspect-[4/5] w-full rounded-[2.5rem] overflow-hidden bg-stone-100 border-4 border-stone-100 shadow-inner mb-6 relative">
                <img 
                   src={formatImageUrl(previewData.url)} 
                   className="w-full h-full object-cover" 
                   alt="Identity Verification" 
                   onError={(e) => { (e.target as any).src = "https://via.placeholder.com/400x500?text=Image+Load+Error"; }} 
                />
            </div>
            {previewData.ai && (
              <div className="bg-emerald-50 p-5 rounded-3xl border-2 border-emerald-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                   <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                   <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">AI Vision Analysis</p>
                </div>
                <p className="text-xs font-bold text-emerald-800 leading-relaxed italic">"{previewData.ai}"</p>
              </div>
            )}
            <button onClick={() => setPreviewData(null)} className="w-full mt-6 py-4 bg-stone-900 text-white rounded-2xl font-black text-sm hover:bg-stone-800 transition-all">ปิดหน้าต่าง ❄️</button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/10 backdrop-blur-md p-8 rounded-[3rem] border border-white/20">
        <div className="text-center md:text-left">
          <h2 className="text-4xl font-black text-white flex items-center gap-3">Admin Dashboard ❄️</h2>
          <p className="text-rose-200 text-xs font-bold tracking-widest uppercase mt-2 opacity-80">Attendance Monitoring (Started 11 Dec 2025)</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={syncData} disabled={isSyncing} className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-bold text-sm transition-all flex items-center gap-2">
            {isSyncing ? '🔄 Syncing...' : '🔄 Sync Cloud'}
          </button>
          <div className="flex flex-col">
            <label className="text-[10px] text-white/60 font-black uppercase mb-1 ml-1">วันที่แสดงข้อมูล</label>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3 rounded-2xl bg-white border-none font-bold text-rose-700 shadow-lg text-sm outline-none cursor-pointer" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print">
        {[{ id: 'today', label: 'รายการประจำวัน', emoji: '📅' }, { id: 'official', label: 'รายงานสรุปวัน', emoji: '📜' }, { id: 'monthly', label: 'สถิติรายเดือน', emoji: '📊' }, { id: 'manual', label: 'ลงเวลาแทน', emoji: '✍️' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-4 rounded-2xl font-black text-sm whitespace-nowrap transition-all shadow-lg flex items-center gap-2 ${activeTab === tab.id ? 'bg-rose-600 text-white scale-105' : 'bg-white/80 text-stone-500 hover:bg-white'}`}>
            <span>{tab.emoji}</span> {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
        {isSyncing && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-[20] flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-rose-600 font-black text-xs uppercase tracking-widest animate-pulse">กำลังโหลดข้อมูลจาก Cloud... ❄️</p>
                </div>
            </div>
        )}
        
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
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ยังไม่ลงชื่อเช้า</p>
                <p className="text-3xl font-black text-slate-600">{dailyAnalysis.absentCount}</p>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <div>
                    <h3 className="text-2xl font-black text-stone-800">รายละเอียดวันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ⛄</h3>
                    <p className="text-stone-400 text-xs font-bold mt-1 uppercase tracking-widest">Attendance Records List (Retrieved from Cloud)</p>
                  </div>
                  <button onClick={handleAiSummary} disabled={isGeneratingAi || filteredToday.length === 0} className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-50">
                    {isGeneratingAi ? '...' : '✨ AI วิเคราะห์'}
                  </button>
                </div>
                {aiSummary && <div className="mb-8 p-6 bg-emerald-50 rounded-3xl border border-emerald-100 text-emerald-800 animate-in zoom-in text-sm font-medium leading-relaxed shadow-inner"><p className="font-black text-[10px] uppercase tracking-widest mb-2 text-emerald-400">สรุปภาพรวมโดย AI</p>{aiSummary}</div>}
                
                <div className="overflow-x-auto rounded-3xl border border-stone-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-stone-50 text-[10px] font-black uppercase text-stone-400 border-b border-stone-100">
                        <th className="p-5">เวลา</th><th className="p-5">รหัส</th><th className="p-5">ชื่อ-นามสกุล</th><th className="p-5 text-center">สถานะ</th><th className="p-5 text-center">หลักฐาน (รูปถ่าย)</th><th className="p-5 text-right">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {filteredToday.length === 0 ? (<tr><td colSpan={6} className="p-20 text-center text-stone-400 font-bold italic">ไม่พบข้อมูลการลงเวลาในวันที่เลือก ❄️</td></tr>) : filteredToday.map(r => (
                        <tr key={r.id} className="hover:bg-rose-50/20 transition-colors group">
                          <td className="p-5 font-mono font-black text-rose-500">{new Date(r.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</td>
                          <td className="p-5 font-bold text-stone-400">{r.staffId || '-'}</td>
                          <td className="p-5"><div className="font-bold text-stone-800 whitespace-nowrap">{r.name}</div><div className="text-[10px] text-stone-400 font-bold uppercase whitespace-nowrap">{r.role}</div></td>
                          <td className="p-5 text-center"><span className={`px-4 py-1.5 rounded-full text-[10px] font-black whitespace-nowrap ${r.status.includes('Time') ? 'bg-emerald-100 text-emerald-700' : r.status.includes('Late') ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{r.status === 'On Time' ? 'มาตรงเวลา' : r.status === 'Late' ? 'มาสาย' : r.status === 'Duty' ? 'ไปราชการ' : r.status.includes('Leave') ? 'ลา' : r.status}</span></td>
                          <td className="p-5 text-center">
                            {r.imageUrl && r.imageUrl.length > 5 ? (
                                <button 
                                    onClick={() => openPreview(r.imageUrl!, r.name, r.timestamp, r.aiVerification || '')} 
                                    className="w-12 h-12 rounded-2xl bg-stone-900 overflow-hidden border-2 border-white shadow-lg active:scale-95 transition-all hover:ring-4 hover:ring-rose-100" 
                                    title="กดเพื่อดูรูปขยายใหญ่"
                                >
                                    <img 
                                      src={formatImageUrl(r.imageUrl)} 
                                      className="w-full h-full object-cover opacity-90" 
                                      alt="Thumbnail" 
                                      loading="lazy"
                                    />
                                </button>
                            ) : (
                                <span className="text-[10px] text-stone-300 italic">ไม่มีรูปถ่าย</span>
                            )}
                          </td>
                          <td className="p-5 text-right"><button onClick={() => { if(confirm('ต้องการลบข้อมูลหรือไม่?')) deleteRecord(r).then(syncData) }} className="text-stone-300 hover:text-rose-500 transition-colors p-2 bg-stone-50 rounded-xl hover:bg-rose-50"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="w-full lg:w-80">
                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 no-print flex flex-col max-h-[700px]">
                    <h4 className="font-black text-stone-800 mb-6 flex items-center justify-between shrink-0">ยังไม่ลงชื่อเช้า ⛄<span className="bg-rose-500 text-white text-[10px] px-3 py-1 rounded-full">{dailyAnalysis.absentCount}</span></h4>
                    <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                      {dailyAnalysis.absentList.map(s => (
                          <div key={s.id} className="p-5 bg-white rounded-3xl border border-stone-100 shadow-sm transition-all hover:shadow-md">
                              <div className="font-bold text-stone-700 text-xs">{s.name}</div>
                              <div className="text-[10px] text-stone-400 font-bold mt-1 uppercase mb-4">{s.id} • {s.role}</div>
                              <div className="grid grid-cols-3 gap-1.5">
                                  <button onClick={() => handleQuickLeave(s, 'personal_leave')} className="py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-[9px] font-black transition-colors border border-amber-100">ลากิจ</button>
                                  <button onClick={() => handleQuickLeave(s, 'sick_leave')} className="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-[9px] font-black transition-colors border border-rose-100">ลาป่วย</button>
                                  <button onClick={() => handleQuickLeave(s, 'duty')} className="py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[9px] font-black transition-colors border border-blue-100">ราชการ</button>
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
          <div className="p-0 md:p-3 bg-stone-200 min-h-screen relative overflow-auto">
             <div className="no-print absolute top-4 right-8 z-50 flex items-center gap-3">
                <button onClick={() => handleExportPDF('daily')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-xl flex items-center gap-2 transition-all active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  บันทึก PDF
                </button>
                <button onClick={() => window.print()} className="bg-white hover:bg-stone-50 text-stone-700 px-5 py-2.5 rounded-xl font-black text-xs shadow-xl border border-stone-200 transition-all active:scale-95">พิมพ์เอกสาร</button>
             </div>
             <div className="max-w-[210mm] mx-auto bg-white shadow-2xl px-[15mm] py-[15mm] min-h-[297mm] border border-stone-200">
                <div className="flex flex-col items-center text-center mb-10">
                   <img src={SCHOOL_LOGO_URL} alt="School Logo" className="w-16 h-16 object-contain mb-4" />
                   <h1 className="text-sm font-black text-stone-900 leading-tight uppercase">รายงานการมาปฏิบัติงานของครูและบุคลากรทางการศึกษา</h1>
                   <h1 className="text-sm font-black text-stone-900 leading-tight uppercase">โรงเรียนประจักษ์ศิลปาคม</h1>
                   <h2 className="text-xs font-bold text-stone-700 mt-2">ประจำวันที่ {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
                </div>
                <div className="mt-1">
                   <table className="w-full border-collapse border border-stone-400">
                      <thead>
                         <tr className="bg-stone-50">
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-10">ลำดับ</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-48">รายชื่อ</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-40">ตำแหน่ง</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-20">เวลามา</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-20">เวลากลับ</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center">หมายเหตุ</th>
                         </tr>
                      </thead>
                      <tbody style={{ fontSize: '10.5px' }}>
                         {officialData.map(d => (
                            <tr key={d.no} className="hover:bg-stone-50/50 relative">
                               <td className="border border-stone-400 py-1.5 px-1 text-center font-mono">{d.no}</td>
                               <td className="border border-stone-400 py-1.5 px-4 text-left font-bold text-stone-800 whitespace-nowrap">{d.name}</td>
                               <td className="border border-stone-400 py-1.5 px-2 text-center text-stone-500 whitespace-nowrap">{d.role}</td>
                               <td className="border border-stone-400 py-1.5 px-1 text-center whitespace-nowrap">{d.arrival}</td>
                               <td className="border border-stone-400 py-1.5 px-1 text-center whitespace-nowrap">{d.departure}</td>
                               <td className="border border-stone-400 py-1.5 px-3 text-center text-stone-500 italic leading-tight text-[10px]">{d.remark}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
                <div className="mt-12 flex justify-around px-8 py-2">
                   <div className="text-center">
                      <p className="text-[11px] text-stone-800 mb-3 font-bold">(ลงชื่อ)...........................................................</p>
                      <p className="text-[11px] font-black text-stone-400 uppercase">กลุ่มบริหารงานบุคคล</p>
                   </div>
                   <div className="text-center">
                      <p className="text-[11px] text-stone-800 mb-3 font-bold">(ลงชื่อ)...........................................................</p>
                      <p className="text-[11px] font-black text-stone-400 uppercase">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'monthly' && (
          <div className="p-0 md:p-3 bg-stone-200 min-h-screen relative overflow-auto">
             <div className="no-print absolute top-4 right-8 z-50 flex items-center gap-3">
                <button onClick={() => handleExportPDF('monthly')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-xl transition-all active:scale-95">บันทึก PDF</button>
                <button onClick={() => window.print()} className="bg-white hover:bg-stone-50 text-stone-700 px-5 py-2.5 rounded-xl font-black text-xs shadow-xl border border-stone-200 transition-all active:scale-95">พิมพ์เอกสาร</button>
             </div>
             <div className="max-w-[210mm] mx-auto bg-white shadow-2xl px-[15mm] py-[15mm] min-h-[297mm] border border-stone-200">
                <div className="flex flex-col items-center text-center mb-10">
                   <img src={SCHOOL_LOGO_URL} alt="School Logo" className="w-16 h-16 object-contain mb-4" />
                   <h1 className="text-sm font-black text-stone-900 leading-tight uppercase">รายงานสถิติการมาปฏิบัติงานรายเดือน</h1>
                   <h1 className="text-sm font-black text-stone-900 leading-tight uppercase">โรงเรียนประจักษ์ศิลปาคม</h1>
                   <h2 className="text-xs font-bold text-stone-700 mt-2">ประจำเดือน {new Date(selectedDate).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</h2>
                </div>
                <div className="mt-1">
                   <table className="w-full border-collapse border border-stone-400">
                      <thead>
                         <tr className="bg-stone-50">
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-10">ลำดับ</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-48">รายชื่อ</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-40">ตำแหน่ง</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-22">ไม่ลงเวลา</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center w-22">มาสาย</th>
                            <th className="border border-stone-400 p-2 text-[11px] font-black text-center">วันที่ที่มาสาย</th>
                         </tr>
                      </thead>
                      <tbody style={{ fontSize: '10.5px' }}>
                         {monthlyLatenessData.map(d => (
                            <tr key={d.no} className="hover:bg-stone-50/50">
                               <td className="border border-stone-400 py-1.5 px-1 text-center font-mono">{d.no}</td>
                               <td className="border border-stone-400 py-1.5 px-4 text-left font-bold text-stone-800 whitespace-nowrap">{d.name}</td>
                               <td className="border border-stone-400 py-1.5 px-2 text-center text-stone-500 whitespace-nowrap">{d.role}</td>
                               <td className={`border border-stone-400 py-1.5 px-2 text-center whitespace-nowrap ${d.absentCount > 0 ? 'text-orange-600 font-black' : 'text-stone-300'}`}>{d.absentCount || '-'}</td>
                               <td className={`border border-stone-400 py-1.5 px-2 text-center whitespace-nowrap ${d.lateCount > 0 ? 'text-rose-600 font-black' : 'text-stone-300'}`}>{d.lateCount || '-'}</td>
                               <td className="border border-stone-400 py-1.5 px-3 text-center text-stone-500 italic text-[10px] leading-tight break-all">{d.lateDates}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
                <div className="mt-12 flex justify-around px-8 py-2">
                   <div className="text-center">
                      <p className="text-[11px] text-stone-800 mb-3 font-bold">(ลงชื่อ)...........................................................</p>
                      <p className="text-[11px] font-black text-stone-400 uppercase">กลุ่มบริหารงานบุคคล</p>
                   </div>
                   <div className="text-center">
                      <p className="text-[11px] text-stone-800 mb-3 font-bold">(ลงชื่อ)...........................................................</p>
                      <p className="text-[11px] font-black text-stone-400 uppercase">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="p-10 max-w-2xl mx-auto no-print">
             <div className="text-center mb-10"><span className="text-6xl mb-4 inline-block">✍️</span><h3 className="text-2xl font-black text-stone-800">ลงเวลาทดแทน / แก้ไขย้อนหลัง</h3></div>
             <form onSubmit={handleManualCheckIn} className="space-y-6 bg-stone-50 p-10 rounded-[3rem] border-2 border-stone-100 shadow-xl">
                <div><label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">เลือกบุคลากร</label><select value={manualStaffId} onChange={e => setManualStaffId(e.target.value)} className="w-full p-5 bg-white border-2 border-stone-200 rounded-[1.5rem] font-bold text-stone-800 outline-none" required><option value="">-- ค้นหารายชื่อ --</option>{staffList.map(s => <option key={s.id} value={s.id}>{s.id} : {s.name}</option>)}</select></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="md:col-span-2"><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setManualType('arrival')} className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${manualType === 'arrival' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white text-stone-400'}`}>มาทำงาน</button><button type="button" onClick={() => setManualType('departure')} className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${manualType === 'departure' ? 'bg-amber-500 text-white border-amber-400' : 'bg-white text-stone-400'}`}>กลับบ้าน</button></div></div>
                   <div><input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full p-4 bg-white border-2 border-stone-200 rounded-2xl font-bold" required /></div>
                   <div><input type="time" value={manualTime} onChange={e => setManualTime(e.target.value)} className="w-full p-4 bg-white border-2 border-stone-200 rounded-2xl font-bold" required /></div>
                </div>
                <button type="submit" className="w-full py-6 bg-rose-600 hover:bg-rose-700 text-white rounded-[1.5rem] font-black shadow-2xl transition-all">บันทึกข้อมูลย้อนหลัง ❄️</button>
             </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
