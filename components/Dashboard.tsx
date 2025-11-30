
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { getRecords, clearRecords, exportToCSV } from '../services/storageService';
import { CheckInRecord, Staff } from '../types';
import { getAllStaff } from '../services/staffService';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'realtime' | 'official' | 'monthly'>('realtime');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<CheckInRecord[]>([]);
  
  // Date states
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM

  const [staffList, setStaffList] = useState<Staff[]>([]);

  // Consolidated Data for Reports
  const [officialReportData, setOfficialReportData] = useState<any[]>([]);
  const [monthlyReportData, setMonthlyReportData] = useState<any[]>([]);

  useEffect(() => {
    // Load data
    const records = getRecords();
    setAllRecords(records);
    setStaffList(getAllStaff());
  }, []);

  useEffect(() => {
    // 1. DAILY REPORT LOGIC
    let todaysRecords: CheckInRecord[] = [];
    if (allRecords.length > 0) {
        todaysRecords = allRecords.filter(r => {
            const rDate = new Date(r.timestamp).toISOString().split('T')[0];
            return rDate === selectedDate;
        }).sort((a, b) => a.timestamp - b.timestamp);
        setFilteredRecords(todaysRecords);
    } else {
        setFilteredRecords([]);
    }

    const dailyStaffData = getAllStaff().map(staff => {
        const staffRecords = todaysRecords.filter(r => r.staffId === staff.id);
        
        // Check for special leave/duty first
        const dutyOrLeave = staffRecords.find(r => ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type));
        
        let arrivalTime = '-';
        let departureTime = '-';
        let note = '';
        let arrivalStatus = 'Absent';
        let departureStatus = '-';

        if (dutyOrLeave) {
            // Map types to Thai
            let label = '';
            switch(dutyOrLeave.type) {
                case 'duty': label = 'ไปราชการ'; break;
                case 'sick_leave': label = 'ลาป่วย'; break;
                case 'personal_leave': label = 'ลากิจ'; break;
                case 'other_leave': label = 'ลาอื่นๆ'; break;
            }
            arrivalTime = label;
            departureTime = label;
            note = dutyOrLeave.reason || '';
            arrivalStatus = 'Leave';
            departureStatus = 'Leave';
        } else {
            const arrival = staffRecords.find(r => r.type === 'arrival');
            const departure = staffRecords.find(r => r.type === 'departure');

            if (arrival) {
                arrivalTime = new Date(arrival.timestamp).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});
                arrivalStatus = arrival.status;
                if (arrival.status === 'Late') note += `สาย: ${arrival.reason || '-'} `;
            }
            if (departure) {
                departureTime = new Date(departure.timestamp).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});
                departureStatus = departure.status;
                if (departure.status === 'Early Leave') note += `กลับก่อน: ${departure.reason || '-'} `;
            }
        }

        return {
            staffId: staff.id,
            name: staff.name,
            role: staff.role,
            arrivalTime,
            arrivalStatus,
            departureTime,
            departureStatus,
            note: note.trim()
        };
    });
    setOfficialReportData(dailyStaffData);

    // 2. MONTHLY REPORT LOGIC
    const monthlyStaffData = getAllStaff().map(staff => {
        // Filter records for this staff, in selected month, that are 'Late'
        const lateRecords = allRecords.filter(r => 
            r.staffId === staff.id &&
            r.status === 'Late' &&
            r.type === 'arrival' &&
            new Date(r.timestamp).toISOString().startsWith(selectedMonth)
        );

        // Sort by date
        lateRecords.sort((a, b) => a.timestamp - b.timestamp);

        const days = lateRecords.map(r => new Date(r.timestamp).getDate()).join(', ');

        return {
            staffId: staff.id,
            name: staff.name,
            role: staff.role,
            lateCount: lateRecords.length,
            dates: days,
            note: ''
        };
    });
    setMonthlyReportData(monthlyStaffData);

  }, [selectedDate, selectedMonth, allRecords]);

  const onTimeCount = filteredRecords.filter(r => r.status === 'On Time').length;
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
  const hasData = filteredRecords.length > 0;

  // Premium Soft Palette
  const COLORS = ['#34d399', '#f87171', '#fbbf24', '#60a5fa']; 

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

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleOfficialPDF = () => {
     const doc = new jsPDF();
     
     doc.setFontSize(16);
     doc.text("Daily Attendance Report - Prajak Silpakom School", 105, 20, { align: "center" });
     
     doc.setFontSize(12);
     doc.text(`Date: ${new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 105, 30, { align: "center" });

     const tableBody = officialReportData.map((row, index) => [
        index + 1,
        `${row.staffId} ${row.name}`,
        row.role,
        row.arrivalTime,
        row.departureTime,
        row.note
     ]);

     autoTable(doc, {
        startY: 40,
        head: [['No.', 'Name', 'Role', 'Arrival', 'Departure', 'Note']],
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 9, font: 'helvetica' },
        headStyles: { fillColor: [50, 50, 50], textColor: 255 },
     });
     doc.save(`Official_Report_${selectedDate}.pdf`);
  };

  const handleClear = () => {
    if(confirm("ยืนยันการลบข้อมูลทั้งหมด? (ไม่สามารถกู้คืนได้)")) {
      clearRecords();
      setAllRecords([]);
      setFilteredRecords([]);
    }
  };

  // Helper to format month (2023-10 -> ตุลาคม 2566)
  const formatMonthYear = (ym: string) => {
    const [y, m] = ym.split('-');
    const date = new Date(parseInt(y), parseInt(m)-1, 1);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="w-full">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0; /* IMPT: Removes browser headers/footers */
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
            -webkit-print-color-adjust: exact;
          }
          body * {
            visibility: hidden;
          }
          #printable-report, #printable-report * {
            visibility: visible;
          }
          #printable-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            min-height: 297mm;
            padding: 10mm 15mm; /* Internal padding for content */
            background: white;
            z-index: 9999;
            box-sizing: border-box;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 no-print">
        <div className="bg-white/60 backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm">
          <h2 className="text-3xl font-bold text-stone-800 tracking-tight flex items-center gap-2">
             <span className="w-2 h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></span>
             Dashboard
          </h2>
          <p className="text-stone-500 text-sm font-medium mt-1 pl-4">ระบบบริหารจัดการข้อมูลการลงเวลา</p>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center">
             {/* Dynamic Date/Month Picker */}
            <div className="relative">
                {activeTab === 'monthly' ? (
                    <input 
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-700 font-bold text-sm shadow-sm focus:ring-2 focus:ring-purple-200 outline-none"
                    />
                ) : (
                    <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-700 font-bold text-sm shadow-sm focus:ring-2 focus:ring-purple-200 outline-none"
                    />
                )}
            </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-stone-200/50 pb-2 no-print bg-white/40 p-2 rounded-2xl backdrop-blur-sm">
          <button 
            onClick={() => setActiveTab('realtime')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${activeTab === 'realtime' ? 'bg-white text-purple-700 shadow-sm border-purple-100' : 'text-stone-500 hover:bg-white/50 border-transparent'}`}
          >
            Realtime Log
          </button>
          <button 
            onClick={() => setActiveTab('official')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${activeTab === 'official' ? 'bg-white text-purple-700 shadow-sm border-purple-100' : 'text-stone-500 hover:bg-white/50 border-transparent'}`}
          >
            รายงานประจำวัน (Daily)
          </button>
          <button 
            onClick={() => setActiveTab('monthly')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${activeTab === 'monthly' ? 'bg-white text-purple-700 shadow-sm border-purple-100' : 'text-stone-500 hover:bg-white/50 border-transparent'}`}
          >
            สรุปมาสายรายเดือน (Monthly Late)
          </button>
      </div>

      {activeTab === 'realtime' ? (
      <>
        <div className="flex justify-end mb-4 no-print">
             <button 
                onClick={handleDownloadCSV}
                disabled={!hasData}
                className="px-6 py-2 bg-white text-stone-600 hover:text-green-600 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm ring-1 ring-stone-100 disabled:opacity-50"
            >
                Download CSV
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10 no-print">
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 relative overflow-hidden group">
               <div className="absolute right-0 top-0 w-24 h-24 bg-stone-50 rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
               <div className="relative z-10">
                   <span className="inline-block px-3 py-1 bg-stone-100 text-stone-500 text-[10px] font-bold uppercase tracking-widest rounded-full mb-2">รายการวันนี้</span>
                   <p className="text-4xl font-bold text-stone-800">{filteredRecords.length}</p>
               </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 relative overflow-hidden group">
               <div className="absolute right-0 top-0 w-24 h-24 bg-red-50 rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
               <div className="relative z-10">
                   <span className="inline-block px-3 py-1 bg-red-100 text-red-600 text-[10px] font-bold uppercase tracking-widest rounded-full mb-2">มาสาย</span>
                   <p className="text-4xl font-bold text-red-500">{lateCount}</p>
               </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 relative overflow-hidden group">
               <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
               <div className="relative z-10">
                   <span className="inline-block px-3 py-1 bg-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest rounded-full mb-2">ลา/ราชการ</span>
                   <p className="text-4xl font-bold text-blue-500">{dutyCount}</p>
               </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 relative overflow-hidden group">
               <div className="absolute right-0 top-0 w-24 h-24 bg-amber-50 rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
               <div className="relative z-10">
                   <span className="inline-block px-3 py-1 bg-amber-100 text-amber-600 text-[10px] font-bold uppercase tracking-widest rounded-full mb-2">กลับก่อน</span>
                   <p className="text-4xl font-bold text-amber-500">{earlyLeaveCount}</p>
               </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 no-print">
            <div className="lg:col-span-1 bg-white p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col h-[420px] border border-stone-100">
            <h3 className="font-bold text-stone-800 mb-6 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-purple-400 rounded-full"></span>
                Overview
            </h3>
            <div className="flex-1 relative">
                {hasData ? (
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                    {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle"/>
                </PieChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-stone-300 font-bold">NO DATA</div>
            )}
            </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col h-[420px] border border-stone-100">
            <div className="p-6 flex justify-between items-center bg-white sticky top-0 z-10 border-b border-stone-50">
                <h3 className="font-bold text-stone-800 flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-emerald-400 rounded-full"></span>
                    Records (ล่าสุด)
                </h3>
                <button onClick={handleClear} className="text-[10px] font-bold text-red-400 bg-red-50 px-3 py-1 rounded-full hover:bg-red-100 border border-red-100">RESET</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
                <table className="w-full text-sm text-left text-stone-600">
                <thead className="text-xs text-stone-400 uppercase tracking-widest bg-stone-50/50 rounded-lg">
                    <tr><th className="px-4 py-2 rounded-l-lg">Time</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 rounded-r-lg">Note</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                    {filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono">
                            {new Date(record.timestamp).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase 
                                ${record.type === 'arrival' ? 'bg-purple-100 text-purple-600' : 
                                  record.type === 'departure' ? 'bg-amber-100 text-amber-600' :
                                  'bg-blue-100 text-blue-600'}`}>
                                {record.type.substr(0,3)}
                            </span>
                        </td>
                        <td className="px-4 py-3">
                            <div className="font-bold text-stone-800 text-xs">{record.name}</div>
                            <div className="text-[10px] text-stone-400">{record.role}</div>
                        </td>
                        <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold 
                                ${record.status === 'Late' ? 'bg-red-50 text-red-500' : 
                                  record.status === 'Early Leave' ? 'bg-amber-50 text-amber-500' : 
                                  ['Duty', 'Sick Leave', 'Personal Leave', 'Other Leave'].includes(record.status) ? 'bg-blue-50 text-blue-600' :
                                  'bg-emerald-50 text-emerald-600'}`}>
                                {record.status}
                            </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-400">{record.reason || '-'}</td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            </div>
        </div>
      </>
      ) : (
        /* PRINTABLE REPORTS (Daily or Monthly) */
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden min-h-[600px] flex flex-col">
            <div className="p-8 border-b border-stone-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-stone-50/30 no-print">
                <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-sm">
                    <h3 className="text-xl font-bold text-stone-800 text-center md:text-left flex items-center gap-2">
                         <span className="w-1.5 h-6 bg-stone-800 rounded-full"></span>
                        {activeTab === 'monthly' ? 'รายงานสรุปการมาสายรายเดือน' : 'ตารางสรุปรายงานการมาปฏิบัติราชการ'}
                    </h3>
                    <p className="text-stone-500 text-sm mt-1 text-center md:text-left pl-4">
                        โรงเรียนประจักษ์ศิลปาคม • {activeTab === 'monthly' ? `ประจำเดือน ${formatMonthYear(selectedMonth)}` : `ประจำ${new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleBrowserPrint}
                        className="px-6 py-3 bg-stone-900 text-white rounded-xl shadow-lg hover:shadow-xl hover:bg-stone-800 text-sm font-bold flex items-center gap-2 transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        พิมพ์ (A4)
                    </button>
                    {activeTab === 'official' && (
                        <button 
                            onClick={handleOfficialPDF}
                            className="px-4 py-3 bg-white text-stone-600 border border-stone-200 rounded-xl hover:bg-stone-50 text-sm font-bold flex items-center gap-2 transition-all"
                        >
                            Save PDF
                        </button>
                    )}
                </div>
            </div>
            
            {/* Printable Area - Designed for A4 Print */}
            <div id="printable-report" className="overflow-x-auto p-4 md:p-0">
                
                {/* Print Header */}
                <div className="hidden print:flex flex-col items-center justify-center mb-6">
                     <img src="https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png" className="w-20 h-20 object-contain grayscale-0 mb-3" alt="Logo" />
                     <h1 className="text-2xl font-bold text-black leading-tight">โรงเรียนประจักษ์ศิลปาคม</h1>
                     <p className="text-sm text-black font-medium tracking-wide mt-1">
                        {activeTab === 'monthly' 
                            ? `รายงานสรุปการมาสายรายเดือน ประจำเดือน ${formatMonthYear(selectedMonth)}` 
                            : `รายงานการมาปฏิบัติราชการ ประจำ${new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
                     </p>
                </div>

                <table className="w-full text-left border-collapse border-b-2 border-t-2 border-black">
                    <thead>
                        <tr className="text-black text-sm uppercase tracking-wider border-b-2 border-black">
                            {activeTab === 'monthly' ? (
                                <>
                                    <th className="px-2 py-2 border-r border-black text-center w-[5%]">ลำดับ</th>
                                    <th className="px-2 py-2 border-r border-black text-center w-[30%]">ชื่อ-สกุล</th>
                                    <th className="px-2 py-2 border-r border-black text-center w-[20%]">ตำแหน่ง</th>
                                    <th className="px-2 py-2 border-r border-black text-center w-[10%]">จำนวนครั้ง</th>
                                    <th className="px-2 py-2 border-r border-black text-center w-[20%]">วันที่มาสาย</th>
                                    <th className="px-2 py-2 text-center w-[15%]">หมายเหตุ</th>
                                </>
                            ) : (
                                <>
                                    <th className="px-2 py-2 border-r border-black text-center w-[5%]">ลำดับ</th>
                                    <th className="px-2 py-2 border-r border-black text-center w-[30%]">ชื่อ-สกุล</th>
                                    <th className="px-2 py-2 border-r border-black text-center w-[20%]">ตำแหน่ง</th>
                                    <th className="px-2 py-2 border-r border-black text-center w-[10%]">เวลามา</th>
                                    <th className="px-2 py-2 border-r border-black text-center w-[10%]">เวลากลับ</th>
                                    <th className="px-2 py-2 text-center w-[25%]">หมายเหตุ</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="text-sm print:text-sm">
                        {activeTab === 'monthly' ? (
                            monthlyReportData.map((row, index) => (
                                <tr key={row.staffId} className="print:hover:bg-transparent transition-colors border-b border-gray-300">
                                    <td className="px-2 py-1.5 border-x border-gray-300 text-black text-center font-mono">{index + 1}</td>
                                    <td className="px-2 py-1.5 border-r border-gray-300 text-left pl-3">
                                        <div className="font-bold text-black">{row.name}</div>
                                    </td>
                                    <td className="px-2 py-1.5 border-r border-gray-300 text-black text-center">{row.role}</td>
                                    <td className={`px-2 py-1.5 border-r border-gray-300 text-center font-bold ${row.lateCount > 0 ? 'text-black' : 'text-gray-400'}`}>
                                        {row.lateCount > 0 ? row.lateCount : '-'}
                                    </td>
                                    <td className="px-2 py-1.5 border-r border-gray-300 text-black text-xs text-center">
                                        {row.dates || '-'}
                                    </td>
                                    <td className="px-2 py-1.5 border-r border-gray-300 text-black text-center">
                                        {row.note || ''}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            officialReportData.map((row, index) => (
                                <tr key={row.staffId} className="print:hover:bg-transparent transition-colors border-b border-gray-300">
                                    <td className="px-2 py-1.5 border-x border-gray-300 text-black text-center font-mono">{index + 1}</td>
                                    <td className="px-2 py-1.5 border-r border-gray-300 text-left pl-3">
                                        <div className="font-bold text-black">{row.name}</div>
                                    </td>
                                    <td className="px-2 py-1.5 border-r border-gray-300 text-black text-center">{row.role}</td>
                                    <td className={`px-2 py-1.5 border-r border-gray-300 text-center font-mono font-bold text-black`}>
                                        {row.arrivalTime}
                                        {row.arrivalStatus === 'Late' && <span className="print:hidden ml-1">⚠️</span>}
                                    </td>
                                    <td className={`px-2 py-1.5 border-r border-gray-300 text-center font-mono font-bold text-black`}>
                                        {row.departureTime}
                                    </td>
                                    <td className="px-2 py-1.5 border-r border-gray-300 text-black max-w-xs break-words text-center">
                                        {row.note || ''}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                
                {/* Print Footer / Signature Area */}
                <div className="hidden print:flex justify-between items-start mt-8 px-8 break-inside-avoid">
                    <div className="text-center w-48">
                        <p className="text-sm font-bold mb-8">ลงชื่อ..........................................................</p>
                        <p className="text-sm font-bold">เจ้าหน้าที่/หัวหน้าฝ่ายบุคคล</p>
                        <p className="text-xs text-black mt-1">ผู้ตรวจสอบ</p>
                    </div>
                    <div className="text-center w-48">
                         <p className="text-sm font-bold mb-8">ลงชื่อ..........................................................</p>
                        <p className="text-sm font-bold">ผู้อำนวยการโรงเรียน</p>
                        <p className="text-xs text-black mt-1">ผู้รับรอง</p>
                    </div>
                </div>

                <div className="hidden print:block text-[10px] text-gray-500 mt-4 text-center">
                    เอกสารนี้สร้างโดยระบบ SchoolCheckIn AI System | ข้อมูล ณ เวลา {new Date().toLocaleTimeString('th-TH')}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
