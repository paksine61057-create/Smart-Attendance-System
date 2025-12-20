
import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { getRecords, clearRecords, exportToCSV, fetchGlobalRecords, syncUnsyncedRecords, updateRecord, saveRecord, deleteRecord } from '../services/storageService';
import { CheckInRecord, Staff, GeoLocation, AttendanceType } from '../types';
import { getAllStaff } from '../services/staffService';
import { getHoliday } from '../services/holidayService';

const Dashboard: React.FC = () => {
  const getLocalYYYYMMDD = (dateInput: Date | number | string) => {
      const d = new Date(dateInput);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState<'realtime' | 'official' | 'monthly'>('realtime');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<CheckInRecord[]>([]);
  const [missingStaff, setMissingStaff] = useState<Staff[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getLocalYYYYMMDD(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<string>(getLocalYYYYMMDD(new Date()).slice(0, 7));
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [officialReportData, setOfficialReportData] = useState<any[]>([]);
  const [monthlyReportData, setMonthlyReportData] = useState<any[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CheckInRecord | null>(null);
  const [editNewTime, setEditNewTime] = useState('');
  const [showAdminCheckInModal, setShowAdminCheckInModal] = useState(false);
  const [adminForm, setAdminForm] = useState({
      staffId: '',
      date: getLocalYYYYMMDD(new Date()),
      time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}),
      type: 'arrival' as AttendanceType,
      reason: ''
  });

  const syncData = useCallback(async () => {
      setIsSyncing(true);
      try {
          await syncUnsyncedRecords();
          const cloudRecords = await fetchGlobalRecords();
          const localRecords = getRecords();
          const mergedRecords = [...cloudRecords];
          const cloudSignatures = new Set(cloudRecords.map(r => `${r.timestamp}_${r.staffId}`));
          localRecords.forEach(local => {
              if (!cloudSignatures.has(`${local.timestamp}_${local.staffId}`)) mergedRecords.push(local);
          });
          setAllRecords(mergedRecords.length > 0 ? mergedRecords : []);
      } catch (e) {
          setAllRecords(getRecords());
      } finally {
          setIsSyncing(false);
      }
  }, []);

  useEffect(() => {
    syncData();
    setStaffList(getAllStaff());
  }, [syncData]);

  useEffect(() => {
    let todaysRecords: CheckInRecord[] = [];
    if (allRecords.length > 0) {
        todaysRecords = allRecords.filter(r => getLocalYYYYMMDD(r.timestamp) === selectedDate).sort((a, b) => a.timestamp - b.timestamp);
        setFilteredRecords(todaysRecords);
    } else {
        setFilteredRecords([]);
    }

    const allStaff = getAllStaff();
    if (selectedDate === getLocalYYYYMMDD(new Date())) {
        const checkedInStaffIds = new Set(todaysRecords.filter(r => ['arrival', 'authorized_late', 'duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type)).map(r => r.staffId));
        setMissingStaff(allStaff.filter(s => !checkedInStaffIds.has(s.id)));
    } else {
        setMissingStaff([]);
    }

    const dailyStaffData = allStaff.map(staff => {
        const staffRecords = todaysRecords.filter(r => r.staffId === staff.id);
        const dutyOrLeave = staffRecords.find(r => ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type));
        let arrivalTime = '-', departureTime = '-', note = '', arrivalStatus = 'Absent', departureStatus = '-', hasImage = false;

        if (dutyOrLeave) {
            let label = dutyOrLeave.type === 'duty' ? 'ไปราชการ' : dutyOrLeave.type === 'sick_leave' ? 'ลาป่วย' : dutyOrLeave.type === 'personal_leave' ? 'ลากิจ' : 'ลาอื่นๆ';
            arrivalTime = departureTime = label;
            note = dutyOrLeave.reason || '';
            arrivalStatus = departureStatus = 'Leave';
            if (dutyOrLeave.imageUrl && dutyOrLeave.imageUrl.length > 20) hasImage = true;
        } else {
            const arrival = staffRecords.find(r => r.type === 'arrival' || r.type === 'authorized_late');
            const departure = staffRecords.find(r => r.type === 'departure');
            if (arrival) {
                arrivalTime = new Date(arrival.timestamp).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});
                arrivalStatus = arrival.status;
                if (arrival.status === 'Late') note += `สาย: ${arrival.reason || '-'} `;
                else if (arrival.status === 'Authorized Late') note += `อนุญาตเข้าสาย: ${arrival.reason || '-'} `;
                else if (arrival.status === 'Admin Assist') note += `(Admin ลงให้) `;
                if (arrival.imageUrl && arrival.imageUrl.length > 20) hasImage = true;
            }
            if (departure) {
                departureTime = new Date(departure.timestamp).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});
                departureStatus = departure.status;
                if (departure.status === 'Early Leave') note += `กลับก่อน: ${departure.reason || '-'} `;
                if (departure.imageUrl && departure.imageUrl.length > 20) hasImage = true;
            }
        }
        return { staffId: staff.id, name: staff.name, role: staff.role, arrivalTime, arrivalStatus, departureTime, departureStatus, note: note.trim(), hasImage };
    });
    setOfficialReportData(dailyStaffData);

    const monthlyStaffData = allStaff.map(staff => {
        const systemStartDate = new Date(2025, 11, 11); systemStartDate.setHours(0,0,0,0);
        const lateRecords = allRecords.filter(r => r.staffId === staff.id && r.status === 'Late' && r.type === 'arrival' && getLocalYYYYMMDD(r.timestamp).startsWith(selectedMonth) && new Date(r.timestamp) >= systemStartDate);
        lateRecords.sort((a, b) => a.timestamp - b.timestamp);
        const lateDays = lateRecords.map(r => new Date(r.timestamp).getDate()).join(', ');

        let notSignedInCount = 0;
        const [y, m] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const now = new Date(), currentYear = now.getFullYear(), currentMonth = now.getMonth() + 1, currentDay = now.getDate();
        let limitDay = (y === currentYear && m === currentMonth) ? currentDay : (y > currentYear || (y === currentYear && m > currentMonth)) ? 0 : daysInMonth;

        for (let d = 1; d <= limitDay; d++) {
            const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dateObj = new Date(dateStr);
            dateObj.setHours(0,0,0,0);
            if (dateObj < systemStartDate || dateObj.getDay() === 0 || dateObj.getDay() === 6 || getHoliday(dateObj)) continue;
            if (!allRecords.some(r => r.staffId === staff.id && getLocalYYYYMMDD(r.timestamp) === dateStr && (r.type === 'arrival' || r.type === 'authorized_late' || r.type === 'duty' || r.type === 'sick_leave' || r.type === 'personal_leave' || r.type === 'other_leave'))) notSignedInCount++;
        }
        return { staffId: staff.id, name: staff.name, role: staff.role, lateCount: lateRecords.length, lateDates: lateDays, notSignedInCount: notSignedInCount, note: '' };
    });
    setMonthlyReportData(monthlyStaffData);
  }, [selectedDate, selectedMonth, allRecords]);

  const onTimeCount = filteredRecords.filter(r => r.status === 'On Time' || r.status === 'Authorized Late' || r.status === 'Admin Assist').length;
  const lateCount = filteredRecords.filter(r => r.status === 'Late').length;
  const earlyLeaveCount = filteredRecords.filter(r => r.status === 'Early Leave').length;
  const dutyCount = filteredRecords.filter(r => ['Duty', 'Sick Leave', 'Personal Leave', 'Other Leave'].includes(r.status)).length;

  const data = [
    { name: 'มาปกติ', value: onTimeCount },
    { name: 'มาสาย', value: lateCount },
    { name: 'กลับก่อน', value: earlyLeaveCount },
    { name: 'ลา/ราชการ', value: dutyCount },
  ];
  
  const chartData = data.filter(d => d.value > 0);
  const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6']; 

  const handleDownloadCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," + exportToCSV(filteredRecords);
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBrowserPrint = () => window.print();

  const handleOfficialPDF = () => {
     const doc = new jsPDF();
     doc.setFontSize(16);
     doc.text("รายงานการปฏิบัติราชการ - โรงเรียนประจักษ์ศิลปาคม", 105, 20, { align: "center" });
     doc.setFontSize(12);
     doc.text(`วันที่: ${new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 105, 30, { align: "center" });
     const tableBody = officialReportData.map((row, index) => [index + 1, `${row.name}`, row.role, row.arrivalTime, row.departureTime, row.note]);
     autoTable(doc, { 
        startY: 40, 
        head: [['ลำดับ', 'ชื่อ-สกุล', 'ตำแหน่ง', 'เวลามา', 'เวลากลับ', 'หมายเหตุ']], 
        body: tableBody, 
        theme: 'grid'
     });
     doc.save(`Official_Report_${selectedDate}.pdf`);
  };

  const handleDelete = async (record: CheckInRecord) => {
      if(confirm(`คุณต้องการลบข้อมูลนี้ใช่หรือไม่?\n\nชื่อ: ${record.name}\nเวลา: ${new Date(record.timestamp).toLocaleTimeString('th-TH')}`)) {
          setAllRecords(allRecords.filter(r => r.id !== record.id));
          try { await deleteRecord(record); } catch (e) { alert('เกิดข้อผิดพลาดในการลบข้อมูล'); }
      }
  };

  const handleAdminAssistCheckIn = async (staff: Staff, type: 'duty' | 'sick' | 'personal') => {
      let typeLabel = type === 'duty' ? 'ไปราชการ' : type === 'sick' ? 'ลาป่วย' : 'ลากิจ';
      if (!confirm(`ยืนยันการบันทึก "${typeLabel}" ให้กับ ${staff.name}?`)) return;
      const now = new Date(); now.setHours(8, 0, 0, 0);
      const record: CheckInRecord = { id: crypto.randomUUID(), staffId: staff.id, name: staff.name, role: staff.role, type: type === 'duty' ? 'duty' : type === 'sick' ? 'sick_leave' : 'personal_leave', status: type === 'duty' ? 'Duty' : type === 'sick' ? 'Sick Leave' : 'Personal Leave', reason: 'Admin บันทึกให้', timestamp: now.getTime(), location: { lat: 0, lng: 0 } as GeoLocation, distanceFromBase: 0, aiVerification: 'Admin Override' };
      await saveRecord(record);
      alert(`บันทึกเรียบร้อย`);
      syncData();
  };

  const handleClear = () => {
    if (window.confirm('คุณต้องการล้างข้อมูลแคชในเครื่องนี้ใช่หรือไม่?')) {
      clearRecords();
      setAllRecords([]);
      syncData();
    }
  };

  const openImage = (url?: string) => {
    if (url) {
      const win = window.open();
      if (win) {
        win.document.write(`<img src="${url}" style="max-width:100%; height:auto;" />`);
        win.document.close();
      }
    }
  };

  const formatMonthYear = (monthStr: string) => {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="w-full">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { margin: 0; padding: 0; background: white !important; }
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            background: white !important; 
            z-index: 9999; 
            padding: 0;
            margin: 0;
          }
          .no-print { display: none !important; }
          table { width: 100%; border-collapse: collapse; border: 1px solid black !important; }
          th, td { border: 1px solid black !important; padding: 4px 8px; color: black !important; font-size: 11pt; }
          th { background-color: #f2f2f2 !important; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      {/* Interactive Festive Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 no-print">
        <div className="bg-white/10 backdrop-blur-xl p-5 rounded-[2rem] border border-white/20 shadow-2xl relative overflow-hidden group">
          <div className="absolute -top-4 -right-4 text-5xl opacity-20 group-hover:opacity-100 transition-opacity animate-sway">⛄</div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3 relative z-10">
             <span className="w-2.5 h-10 bg-gradient-to-b from-red-500 to-rose-600 rounded-full shadow-lg"></span>
             Admin Dashboard 🎁
          </h2>
          <p className="text-amber-200 text-sm font-bold mt-1 pl-5 drop-shadow-sm uppercase tracking-widest relative z-10">Happy New Year 2026 Monitor</p>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
             <button onClick={() => setShowAdminCheckInModal(true)} className="px-6 py-3.5 bg-rose-600 text-white rounded-2xl font-black text-sm shadow-[0_10px_30px_rgba(225,29,72,0.4)] hover:bg-rose-700 transition-all flex items-center gap-2 border-b-4 border-rose-800">
                ลงเวลาแทน 🦌
             </button>
             <button onClick={syncData} disabled={isSyncing} className="px-5 py-3.5 bg-white/10 text-white border border-white/20 rounded-2xl font-black text-sm shadow-xl hover:bg-white/20 transition-all flex items-center gap-2 backdrop-blur-md">
                <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                {isSyncing ? 'Syncing...' : 'Sync Cloud ❄️'}
             </button>
            <div className="relative">
                {activeTab === 'monthly' ? (
                    <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-5 py-3.5 bg-white border-4 border-rose-100 rounded-2xl text-rose-700 font-black text-sm shadow-2xl outline-none" />
                ) : (
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-5 py-3.5 bg-white border-4 border-rose-100 rounded-2xl text-rose-700 font-black text-sm shadow-2xl outline-none" />
                )}
            </div>
        </div>
      </div>

      {/* Festive Tabs */}
      <div className="flex flex-wrap gap-3 mb-8 border-b border-white/10 pb-4 no-print bg-white/5 p-3 rounded-[2rem] backdrop-blur-md shadow-2xl">
          <button onClick={() => setActiveTab('realtime')} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all border-2 uppercase tracking-widest ${activeTab === 'realtime' ? 'bg-white text-rose-700 border-rose-200 shadow-xl' : 'text-white/60 hover:bg-white/10 border-transparent'}`}>Realtime Log</button>
          <button onClick={() => setActiveTab('official')} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all border-2 uppercase tracking-widest ${activeTab === 'official' ? 'bg-white text-rose-700 border-rose-200 shadow-xl' : 'text-white/60 hover:bg-white/10 border-transparent'}`}>รายงานประจำวัน (Daily)</button>
          <button onClick={() => setActiveTab('monthly')} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all border-2 uppercase tracking-widest ${activeTab === 'monthly' ? 'bg-white text-rose-700 border-rose-200 shadow-xl' : 'text-white/60 hover:bg-white/10 border-transparent'}`}>สรุปมาสายรายเดือน</button>
      </div>

      {activeTab === 'realtime' ? (
      <>
        {/* Realtime Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 no-print">
            {[
                { label: 'มาทำงานวันนี้', count: filteredRecords.length, color: 'rose', icon: '🎅' },
                { label: 'มาสาย', count: lateCount, color: 'red', icon: '⏰' },
                { label: 'ลา/ราชการ', count: dutyCount, color: 'emerald', icon: '🏛️' },
                { label: 'กลับก่อน', count: earlyLeaveCount, color: 'amber', icon: '🏃' }
            ].map((stat, i) => (
                <div key={i} className={`bg-white p-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-4 border-${stat.color}-50 relative overflow-hidden group hover:-translate-y-2 transition-transform`}>
                   <div className="absolute right-0 top-0 w-24 h-24 bg-stone-50 rounded-bl-[80px] -mr-4 -mt-4 transition-transform group-hover:scale-125 flex items-center justify-center pt-4 pl-4 text-3xl opacity-20">{stat.icon}</div>
                   <div className="relative z-10">
                       <span className={`inline-block px-3 py-1 bg-${stat.color}-100 text-${stat.color}-700 text-[10px] font-black uppercase tracking-[0.2em] rounded-full mb-3 shadow-inner`}>{stat.label}</span>
                       <p className={`text-5xl font-black text-stone-800 drop-shadow-sm`}>{stat.count}</p>
                   </div>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 no-print">
            <div className="lg:col-span-1 flex flex-col gap-8">
                <div className="bg-white p-10 rounded-[3rem] shadow-[0_25px_60px_rgba(0,0,0,0.3)] border-4 border-rose-50 h-[400px] relative overflow-hidden">
                    <div className="absolute -bottom-6 -right-6 text-6xl opacity-10 animate-sway">⛄</div>
                    <h3 className="font-black text-stone-800 mb-8 flex items-center gap-3 text-lg"><span className="w-2 h-8 bg-rose-500 rounded-full"></span>สรุปสถิติ</h3>
                    <div className="flex-1 h-64 relative">
                        {filteredRecords.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={chartData} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={8} dataKey="value" stroke="none">
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', fontWeight: 'bold' }} />
                            <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontWeight: 'bold', fontSize: '11px' }}/>
                        </PieChart>
                        </ResponsiveContainer>
                        ) : <div className="h-full flex items-center justify-center text-stone-200 font-black text-2xl tracking-widest animate-pulse">NO RECORDS ❄️</div>}
                    </div>
                </div>

                {missingStaff.length > 0 && (
                    <div className="bg-white rounded-[3rem] shadow-[0_25px_60px_rgba(0,0,0,0.3)] border-4 border-amber-50 overflow-hidden relative">
                        <div className="absolute -top-4 -left-4 text-4xl opacity-10 animate-float">🎅</div>
                        <div className="p-6 border-b-4 border-amber-50 bg-amber-50/30">
                            <h3 className="font-black text-stone-800 flex items-center gap-3 text-sm">
                                <span className="w-3 h-3 bg-amber-500 rounded-full animate-ping"></span>
                                ยังไม่ลงชื่อ ({missingStaff.length} คน 🎁)
                            </h3>
                        </div>
                        <div className="overflow-y-auto max-h-[350px] p-4">
                             <table className="w-full text-xs">
                                 <tbody>
                                     {missingStaff.map(staff => (
                                         <tr key={staff.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50 transition-colors">
                                             <td className="p-4 text-stone-700 font-bold">{staff.name}</td>
                                             <td className="p-4 text-right">
                                                 <div className="flex gap-2 justify-end">
                                                     <button onClick={() => handleAdminAssistCheckIn(staff, 'duty')} className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 text-[9px] font-black border border-emerald-100 transition-all uppercase">+ ราชการ</button>
                                                     <button onClick={() => handleAdminAssistCheckIn(staff, 'sick')} className="px-3 py-2 bg-rose-50 text-rose-700 rounded-xl hover:bg-rose-100 text-[9px] font-black border border-rose-100 transition-all uppercase">+ ลา</button>
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

            <div className="lg:col-span-2 bg-white rounded-[3rem] shadow-[0_30px_80px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col h-[700px] border-4 border-rose-50 relative">
                <div className="absolute top-4 right-4 text-4xl opacity-5 animate-sparkle pointer-events-none">✨</div>
                <div className="p-8 flex justify-between items-center bg-white sticky top-0 z-10 border-b-4 border-stone-50">
                    <h3 className="font-black text-stone-800 flex items-center gap-3 text-xl"><span className="w-2 h-8 bg-emerald-500 rounded-full shadow-md"></span>รายการล่าสุด 🎄</h3>
                    <button onClick={handleClear} className="text-[10px] font-black text-rose-500 bg-rose-50 px-5 py-2 rounded-full hover:bg-rose-100 border-2 border-rose-100 tracking-widest uppercase">Clear Cache</button>
                </div>
                <div className="overflow-y-auto flex-1 p-6">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] text-stone-400 uppercase tracking-[0.2em] font-black bg-stone-50/50">
                            <tr>
                                <th className="px-6 py-4 text-center">เวลา</th>
                                <th className="px-6 py-4">ชื่อ-นามสกุล</th>
                                <th className="px-6 py-4 text-center">สถานะ</th>
                                <th className="px-6 py-4 text-center">หลักฐาน</th>
                                <th className="px-6 py-4 text-center">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-50">
                            {filteredRecords.map((record) => (
                            <tr key={record.id} className="hover:bg-rose-50/30 transition-colors group">
                                <td className="px-6 py-5 text-xs font-black text-center text-stone-600">
                                    <div className="text-lg font-mono">{new Date(record.timestamp).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}</div>
                                    <div className={`mt-2 inline-block px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase ${record.type === 'arrival' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {record.type === 'arrival' ? 'มา' : 'กลับ'}
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="font-black text-stone-800 text-sm">{record.name}</div>
                                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">{record.role}</div>
                                </td>
                                <td className="px-6 py-5 text-center">
                                    <span className={`px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 shadow-sm
                                        ${record.status === 'Late' ? 'bg-red-50 text-red-600 border-red-100' : 
                                          record.status === 'Early Leave' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                          record.status === 'On Time' || record.status === 'Normal' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                          'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                        {record.status}
                                    </span>
                                </td>
                                <td className="px-6 py-5 text-center">
                                    {(record.imageUrl && record.imageUrl.length > 20) ? (
                                        <button onClick={() => openImage(record.imageUrl)} className="px-4 py-2 bg-stone-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-stone-800 transition-all flex items-center justify-center gap-2 mx-auto">
                                            รูปภาพ
                                        </button>
                                    ) : <span className="text-stone-300 font-black">-</span>}
                                </td>
                                <td className="px-6 py-5 text-center">
                                    <div className="flex items-center justify-center gap-4">
                                        <button onClick={() => handleDelete(record)} className="p-2.5 bg-rose-50 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-xl transition-all shadow-sm border border-rose-100">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </>
      ) : (
        /* PROFESSIONAL REPORT DOCUMENT (Printable) */
        <div className="bg-white rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.4)] overflow-hidden min-h-[600px] border-4 border-rose-50 relative">
            <div className="absolute top-10 right-10 text-6xl opacity-10 animate-sway no-print">🎅</div>
            <div className="p-10 border-b-4 border-rose-50 flex flex-col md:flex-row justify-between items-center gap-6 bg-stone-50/40 no-print">
                <div className="p-6 bg-white rounded-[2rem] border-4 border-rose-50 shadow-xl max-w-lg relative overflow-hidden">
                    <div className="absolute -bottom-2 -right-2 text-3xl opacity-20">⛄</div>
                    <h3 className="text-2xl font-black text-stone-800 flex items-center gap-3 relative z-10"><span className="text-3xl">❄️</span> {activeTab === 'monthly' ? 'สรุปการมาสายรายเดือน' : 'รายงานการมาปฏิบัติราชการ 🎄'}</h3>
                    <p className="text-stone-500 font-bold text-sm mt-2 pl-2 relative z-10">โรงเรียนประจักษ์ศิลปาคม • {activeTab === 'monthly' ? `ประจำเดือน ${formatMonthYear(selectedMonth)}` : `ประจำ${new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`}</p>
                </div>
                <div className="flex gap-4">
                  <button onClick={handleBrowserPrint} className="px-10 py-5 bg-stone-900 text-white rounded-[2rem] shadow-2xl hover:bg-stone-800 text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95">
                      พิมพ์รายงาน (A4) 🎅
                  </button>
                  {activeTab === 'official' && (
                    <button onClick={handleOfficialPDF} className="px-8 py-5 bg-white text-stone-700 border-4 border-rose-100 rounded-[2rem] shadow-xl hover:bg-stone-50 text-sm font-black transition-all">
                      Save PDF
                    </button>
                  )}
                </div>
            </div>
            
            <div id="printable-report" className="p-6 md:p-12 bg-white">
                {/* Official Header */}
                <div className="hidden print:flex flex-col items-center justify-center mb-8">
                     <img src="https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png" className="w-20 h-20 object-contain mb-4" alt="Logo" />
                     <h1 className="text-2xl font-bold text-black leading-tight">โรงเรียนประจักษ์ศิลปาคม</h1>
                     <p className="text-base text-black font-bold mt-2 uppercase">
                        {activeTab === 'monthly' ? `รายงานสรุปการมาสายรายเดือน ประจำเดือน ${formatMonthYear(selectedMonth)}` : `รายงานการมาปฏิบัติราชการ ประจำ${new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
                     </p>
                </div>

                {/* Report Table */}
                <table className="w-full text-left border-collapse border-2 border-black">
                    <thead>
                        <tr className="text-black text-xs font-bold uppercase tracking-wider bg-gray-50/50">
                            {activeTab === 'monthly' ? (
                                <>
                                    <th className="px-3 py-3 border border-black text-center w-[5%]">ลำดับ</th>
                                    <th className="px-3 py-3 border border-black w-[30%]">ชื่อ-นามสกุล</th>
                                    <th className="px-3 py-3 border border-black text-center w-[15%]">ตำแหน่ง</th>
                                    <th className="px-3 py-3 border border-black text-center w-[10%]">มาสาย (ครั้ง)</th>
                                    <th className="px-3 py-3 border border-black text-center w-[10%]">ไม่ลงชื่อ (วัน)</th>
                                    <th className="px-3 py-3 border border-black text-center w-[15%]">วันที่มาสาย</th>
                                    <th className="px-3 py-3 border border-black text-center w-[15%]">หมายเหตุ</th>
                                </>
                            ) : (
                                <>
                                    <th className="px-3 py-3 border border-black text-center w-[5%]">ลำดับ</th>
                                    <th className="px-3 py-3 border border-black w-[40%]">ชื่อ-นามสกุล</th>
                                    <th className="px-3 py-3 border border-black text-center w-[15%]">ตำแหน่ง</th>
                                    <th className="px-3 py-3 border border-black text-center w-[12%]">เวลามา</th>
                                    <th className="px-3 py-3 border border-black text-center w-[12%]">เวลากลับ</th>
                                    <th className="px-3 py-3 border border-black text-center w-[16%]">หมายเหตุ</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="text-[11px] md:text-xs">
                        {activeTab === 'monthly' ? (
                            monthlyReportData.map((row, index) => (
                                <tr key={row.staffId} className="border-b border-gray-300">
                                    <td className="px-3 py-2 border-x border-gray-300 text-center font-mono">{index + 1}</td>
                                    <td className="px-3 py-2 border-r border-gray-300 text-left font-bold">{row.name}</td>
                                    <td className="px-3 py-2 border-r border-gray-300 text-center">{row.role}</td>
                                    <td className="px-3 py-2 border-r border-gray-300 text-center font-bold">{row.lateCount > 0 ? row.lateCount : '-'}</td>
                                    <td className="px-3 py-2 border-r border-gray-300 text-center font-bold text-red-600">{row.notSignedInCount > 0 ? row.notSignedInCount : '-'}</td>
                                    <td className="px-3 py-2 border-r border-gray-300 text-[10px] text-center">{row.lateDates || '-'}</td>
                                    <td className="px-3 py-2 text-center text-[10px]">{row.note || ''}</td>
                                </tr>
                            ))
                        ) : (
                            officialReportData.map((row, index) => (
                                <tr key={row.staffId} className="border-b border-gray-300">
                                    <td className="px-3 py-2 border-x border-gray-300 text-center font-mono">{index + 1}</td>
                                    <td className="px-3 py-2 border-r border-gray-300 text-left font-bold">{row.name}</td>
                                    <td className="px-3 py-2 border-r border-gray-300 text-center">{row.role}</td>
                                    <td className={`px-3 py-2 border-r border-gray-300 text-center font-bold font-mono ${row.arrivalStatus === 'Late' ? 'text-red-600' : 'text-black'}`}>{row.arrivalTime}</td>
                                    <td className="px-3 py-2 border-r border-gray-300 text-center font-bold font-mono">{row.departureTime}</td>
                                    <td className="px-3 py-2 text-center text-[10px]">{row.note || ''}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                
                {/* Official Signature Section */}
                <div className="hidden print:flex justify-between items-start mt-20 px-12 break-inside-avoid">
                    <div className="text-center w-64">
                        <p className="text-sm font-bold mb-12">ลงชื่อ..........................................................</p>
                        <p className="text-sm font-bold">เจ้าหน้าที่ฝ่ายบุคคล / ผู้ตรวจสอบ</p>
                        <p className="text-xs text-gray-500 mt-2">วันที่......../......../........</p>
                    </div>
                    <div className="text-center w-64">
                         <p className="text-sm font-bold mb-12">ลงชื่อ..........................................................</p>
                        <p className="text-sm font-bold">ผู้อำนวยการโรงเรียนประจักษ์ศิลปาคม</p>
                        <p className="text-xs text-gray-500 mt-2">วันที่......../......../........</p>
                    </div>
                </div>
                <div className="hidden print:block text-[9px] text-gray-400 mt-12 text-center border-t pt-2 italic">
                    เอกสารนี้สร้างโดยระบบจัดเก็บข้อมูลอัตโนมัติ (SchoolCheckIn AI System) | ข้อมูล ณ เวลา {new Date().toLocaleTimeString('th-TH')}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
