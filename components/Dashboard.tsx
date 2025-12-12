
import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { getRecords, clearRecords, exportToCSV, fetchGlobalRecords, syncUnsyncedRecords, updateRecord, saveRecord } from '../services/storageService';
import { CheckInRecord, Staff, GeoLocation, AttendanceType } from '../types';
import { getAllStaff } from '../services/staffService';
import { getHoliday } from '../services/holidayService';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'realtime' | 'official' | 'monthly'>('realtime');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<CheckInRecord[]>([]);
  const [missingStaff, setMissingStaff] = useState<Staff[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Date states
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM

  const [staffList, setStaffList] = useState<Staff[]>([]);

  // Consolidated Data for Reports
  const [officialReportData, setOfficialReportData] = useState<any[]>([]);
  const [monthlyReportData, setMonthlyReportData] = useState<any[]>([]);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CheckInRecord | null>(null);
  const [editNewTime, setEditNewTime] = useState('');

  // Admin Manual Check-in State
  const [showAdminCheckInModal, setShowAdminCheckInModal] = useState(false);
  const [adminForm, setAdminForm] = useState({
      staffId: '',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}),
      type: 'arrival' as AttendanceType,
      reason: ''
  });

  // Function to load data from Cloud and Merge with Local
  const syncData = useCallback(async () => {
      setIsSyncing(true);
      try {
          // 1. Attempt to retry syncing any pending local records
          await syncUnsyncedRecords();

          // 2. Fetch latest from Cloud
          const cloudRecords = await fetchGlobalRecords();
          
          // 3. Get Local records
          const localRecords = getRecords();

          // 4. SMART MERGE: 
          const mergedRecords = [...cloudRecords];
          const cloudSignatures = new Set(cloudRecords.map(r => `${r.timestamp}_${r.staffId}`));
          
          localRecords.forEach(local => {
              const signature = `${local.timestamp}_${local.staffId}`;
              if (!cloudSignatures.has(signature)) {
                  mergedRecords.push(local);
              }
          });

          if (mergedRecords.length > 0) {
              setAllRecords(mergedRecords);
          } else {
              setAllRecords([]);
          }
      } catch (e) {
          console.error("Sync error", e);
          const local = getRecords();
          setAllRecords(local);
      } finally {
          setIsSyncing(false);
      }
  }, []);

  useEffect(() => {
    syncData(); // Load data on mount
    setStaffList(getAllStaff());
  }, [syncData]);

  useEffect(() => {
    // 1. DAILY REPORT LOGIC & FILTERING
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

    const allStaff = getAllStaff();

    // CALCULATE MISSING STAFF (Who hasn't checked in for Arrival/Duty today?)
    if (selectedDate === new Date().toISOString().split('T')[0]) {
        const checkedInStaffIds = new Set(todaysRecords
            .filter(r => ['arrival', 'authorized_late', 'duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type))
            .map(r => r.staffId));
        
        const missing = allStaff.filter(s => !checkedInStaffIds.has(s.id));
        setMissingStaff(missing);
    } else {
        setMissingStaff([]); // Don't show missing for past dates to avoid confusion, or can enable if needed
    }

    const dailyStaffData = allStaff.map(staff => {
        const staffRecords = todaysRecords.filter(r => r.staffId === staff.id);
        
        // Check for special leave/duty first
        const dutyOrLeave = staffRecords.find(r => ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type));
        
        let arrivalTime = '-';
        let departureTime = '-';
        let note = '';
        let arrivalStatus = 'Absent';
        let departureStatus = '-';
        let hasImage = false;

        if (dutyOrLeave) {
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

        return {
            staffId: staff.id,
            name: staff.name,
            role: staff.role,
            arrivalTime,
            arrivalStatus,
            departureTime,
            departureStatus,
            note: note.trim(),
            hasImage
        };
    });
    setOfficialReportData(dailyStaffData);

    // 2. MONTHLY REPORT LOGIC
    const monthlyStaffData = allStaff.map(staff => {
        // *** SYSTEM START DATE: 11 Dec 2025 ***
        // Month is 0-indexed in JS Date (0=Jan, 11=Dec)
        const systemStartDate = new Date(2025, 11, 11); 
        systemStartDate.setHours(0,0,0,0);

        // Late Records
        const lateRecords = allRecords.filter(r => 
            r.staffId === staff.id &&
            r.status === 'Late' &&
            r.type === 'arrival' &&
            new Date(r.timestamp).toISOString().startsWith(selectedMonth) &&
            new Date(r.timestamp) >= systemStartDate // Filter out late records before system start
        );
        lateRecords.sort((a, b) => a.timestamp - b.timestamp);
        const lateDays = lateRecords.map(r => new Date(r.timestamp).getDate()).join(', ');

        // Not Signed In Calculation
        let notSignedInCount = 0;
        const [y, m] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();

        // Calculate up to today if current month, otherwise end of month
        let limitDay = daysInMonth;
        if (y === currentYear && m === currentMonth) {
            limitDay = currentDay;
        } else if (y > currentYear || (y === currentYear && m > currentMonth)) {
            limitDay = 0; // Future month
        }

        for (let d = 1; d <= limitDay; d++) {
            const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dateObj = new Date(dateStr);
            dateObj.setHours(0,0,0,0);
            
            // 0. CHECK SYSTEM START DATE
            if (dateObj < systemStartDate) continue;

            const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat

            // 1. Skip Weekend
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            // 2. Skip Holiday
            if (getHoliday(dateObj)) continue;

            // 3. Logic: "Missing Morning/Leave" Check
            // - Checks for: Arrival, Authorized Late, Duty, or any Leave.
            // - IGNORES: Departure (if you only signed out but didn't sign in, it counts as missing).
            const hasRecord = allRecords.some(r => 
                r.staffId === staff.id && 
                new Date(r.timestamp).toISOString().split('T')[0] === dateStr &&
                (r.type === 'arrival' || r.type === 'authorized_late' || r.type === 'duty' || r.type === 'sick_leave' || r.type === 'personal_leave' || r.type === 'other_leave')
            );

            if (!hasRecord) {
                notSignedInCount++;
            }
        }

        return {
            staffId: staff.id,
            name: staff.name,
            role: staff.role,
            lateCount: lateRecords.length,
            lateDates: lateDays,
            notSignedInCount: notSignedInCount,
            note: ''
        };
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
  const hasData = filteredRecords.length > 0;
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
        index + 1, `${row.staffId} ${row.name}`, row.role, row.arrivalTime, row.departureTime, row.note
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
    if(confirm("ยืนยันการลบข้อมูล (เฉพาะในเครื่องนี้)?\n(ข้อมูลบน Cloud จะไม่ถูกลบ)")) {
      clearRecords();
      setAllRecords([]);
      setFilteredRecords([]);
    }
  };

  const formatMonthYear = (ym: string) => {
    const [y, m] = ym.split('-');
    const date = new Date(parseInt(y), parseInt(m)-1, 1);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  };

  const openImage = (url?: string) => {
      if (!url || url === '-' || url === 'undefined') {
          alert("ไม่พบรูปภาพ หรือรูปภาพยังไม่ได้อัปโหลด");
          return;
      }
      if (url.startsWith("Error") || url.startsWith("Exception")) {
          alert("เกิดข้อผิดพลาดในการบันทึกรูปภาพที่ Server:\n" + url + "\n\n(กรุณาแจ้งแอดมินให้ตรวจสอบสิทธิ์ Google Drive ใน Apps Script)");
          return;
      }
      window.open(url, '_blank');
  };

  const openEditModal = (record: CheckInRecord) => {
    setEditingRecord(record);
    const date = new Date(record.timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    setEditNewTime(`${hours}:${minutes}`);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRecord || !editNewTime) return;
    const [hours, minutes] = editNewTime.split(':').map(Number);
    const newDate = new Date(editingRecord.timestamp);
    newDate.setHours(hours, minutes);
    const newTimestamp = newDate.getTime();

    let newStatus = editingRecord.status;
    if (editingRecord.type === 'arrival') {
        const threshold = new Date(newTimestamp);
        threshold.setHours(8, 1, 0, 0);
        // Changed to >= for strict 08:01 Late policy
        newStatus = newDate >= threshold ? 'Late' : 'On Time';
    } else if (editingRecord.type === 'departure') {
        const threshold = new Date(newTimestamp);
        threshold.setHours(16, 0, 0, 0);
        newStatus = newDate < threshold ? 'Early Leave' : 'Normal';
    }

    const success = await updateRecord(editingRecord.timestamp, editingRecord.staffId || '', {
        newTimestamp: newTimestamp,
        type: editingRecord.type,
        status: newStatus,
        reason: editingRecord.reason
    });

    if (success) {
        alert("แก้ไขข้อมูลเรียบร้อย (กรุณากด Sync เพื่อดูข้อมูลล่าสุด)");
        setShowEditModal(false);
        setEditingRecord(null);
        syncData(); 
    } else {
        alert("เกิดข้อผิดพลาดในการแก้ไขข้อมูล");
    }
  };

  // ADMIN ASSIST CHECK-IN
  const handleAdminAssistCheckIn = async (staff: Staff, type: 'duty' | 'sick' | 'personal') => {
      let typeLabel = '';
      let attType: any = 'duty';
      if(type === 'duty') { typeLabel = 'ไปราชการ'; attType = 'duty'; }
      if(type === 'sick') { typeLabel = 'ลาป่วย'; attType = 'sick_leave'; }
      if(type === 'personal') { typeLabel = 'ลากิจ'; attType = 'personal_leave'; }

      if (!confirm(`ยืนยันการบันทึก "${typeLabel}" ให้กับ ${staff.name}?`)) return;

      const now = new Date();
      now.setHours(8, 0, 0, 0); // Set to morning
      
      const record: CheckInRecord = {
          id: crypto.randomUUID(),
          staffId: staff.id,
          name: staff.name,
          role: staff.role,
          type: attType,
          status: type === 'duty' ? 'Duty' : type === 'sick' ? 'Sick Leave' : 'Personal Leave',
          reason: 'Admin บันทึกให้', 
          timestamp: now.getTime(),
          location: { lat: 0, lng: 0 } as GeoLocation,
          distanceFromBase: 0,
          aiVerification: 'Admin Override'
      };
      
      await saveRecord(record);
      alert(`บันทึกข้อมูลเรียบร้อย: ${staff.name}`);
      syncData();
  };

  const handleManualAdminCheckInSubmit = async () => {
    if (!adminForm.staffId || !adminForm.date || !adminForm.time) {
        alert("กรุณากรอกข้อมูลให้ครบถ้วน");
        return;
    }

    const staff = staffList.find(s => s.id === adminForm.staffId);
    if (!staff) return;

    // Construct Timestamp
    const dateTimeStr = `${adminForm.date}T${adminForm.time}`;
    const timestamp = new Date(dateTimeStr).getTime();
    const dateObj = new Date(timestamp);

    // Determine Status Logic
    let status: any = 'Normal';
    if (adminForm.type === 'arrival') {
        const threshold = new Date(dateObj);
        threshold.setHours(8, 1, 0, 0);
        // Changed to >= for strict 08:01 Late policy
        status = dateObj >= threshold ? 'Late' : 'On Time';
    } else if (adminForm.type === 'departure') {
        const threshold = new Date(dateObj);
        threshold.setHours(16, 0, 0, 0);
        status = dateObj < threshold ? 'Early Leave' : 'Normal';
    } else if (adminForm.type === 'duty') {
        status = 'Duty';
    } else if (adminForm.type === 'sick_leave') {
        status = 'Sick Leave';
    } else if (adminForm.type === 'personal_leave') {
        status = 'Personal Leave';
    } else if (adminForm.type === 'other_leave') {
        status = 'Other Leave';
    } else if (adminForm.type === 'authorized_late') {
        status = 'Authorized Late';
    }

    const record: CheckInRecord = {
        id: crypto.randomUUID(),
        staffId: staff.id,
        name: staff.name,
        role: staff.role,
        type: adminForm.type,
        status: status,
        reason: adminForm.reason || 'Admin Manual Entry',
        timestamp: timestamp,
        location: { lat: 0, lng: 0 } as GeoLocation,
        distanceFromBase: 0,
        aiVerification: 'Admin Manual Entry' // Flag to identify admin record
    };

    await saveRecord(record);
    alert(`บันทึกข้อมูลเรียบร้อย: ${staff.name}`);
    setShowAdminCheckInModal(false);
    syncData();
  };

  return (
    <div className="w-full">
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; }
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report { position: absolute; left: 0; top: 0; width: 210mm; min-height: 297mm; padding: 5mm 15mm; background: white; z-index: 9999; box-sizing: border-box; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Edit Modal */}
      {showEditModal && editingRecord && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 no-print">
              <div className="bg-white p-6 rounded-2xl shadow-xl w-80">
                  <h3 className="font-bold text-lg mb-4">แก้ไขเวลาลงชื่อ</h3>
                  <div className="mb-4">
                      <p className="text-sm text-stone-500 mb-1">ชื่อ: {editingRecord.name}</p>
                      <label className="block text-xs font-bold mb-1">เวลาใหม่</label>
                      <input type="time" value={editNewTime} onChange={(e) => setEditNewTime(e.target.value)} className="w-full p-2 border rounded-lg text-lg font-bold text-center" />
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => setShowEditModal(false)} className="flex-1 py-2 bg-stone-100 rounded-lg text-sm font-bold">ยกเลิก</button>
                      <button onClick={handleSaveEdit} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">บันทึก</button>
                  </div>
              </div>
          </div>
      )}

      {/* Admin Manual Check-in Modal */}
      {showAdminCheckInModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 no-print animate-in fade-in duration-200">
              <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-xl text-stone-800 flex items-center gap-2">
                          <span className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          </span>
                          ลงเวลาแทนบุคลากร
                      </h3>
                      <button onClick={() => setShowAdminCheckInModal(false)} className="text-stone-400 hover:text-stone-600">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">บุคลากร</label>
                          <select 
                            value={adminForm.staffId} 
                            onChange={e => setAdminForm({...adminForm, staffId: e.target.value})}
                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-200"
                          >
                              <option value="">-- เลือกรายชื่อ --</option>
                              {staffList.map(s => (
                                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                              ))}
                          </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">วันที่</label>
                                <input 
                                    type="date" 
                                    value={adminForm.date} 
                                    onChange={e => setAdminForm({...adminForm, date: e.target.value})}
                                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-center font-bold"
                                />
                          </div>
                          <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">เวลา</label>
                                <input 
                                    type="time" 
                                    value={adminForm.time} 
                                    onChange={e => setAdminForm({...adminForm, time: e.target.value})}
                                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-center font-bold"
                                />
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">ประเภทการลงเวลา</label>
                          <select 
                            value={adminForm.type} 
                            onChange={e => setAdminForm({...adminForm, type: e.target.value as AttendanceType})}
                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-200 font-medium"
                          >
                              <option value="arrival">🟢 มาทำงาน (Arrival)</option>
                              <option value="departure">🟠 กลับบ้าน (Departure)</option>
                              <option value="authorized_late">⏰ ขออนุญาตเข้าสาย</option>
                              <option value="duty">🏛️ ไปราชการ</option>
                              <option value="sick_leave">🤒 ลาป่วย</option>
                              <option value="personal_leave">📝 ลากิจ</option>
                              <option value="other_leave">🏳️ ลาอื่นๆ</option>
                          </select>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">เหตุผล / หมายเหตุ</label>
                          <input 
                              type="text" 
                              value={adminForm.reason} 
                              onChange={e => setAdminForm({...adminForm, reason: e.target.value})}
                              placeholder="ระบุเหตุผล (ถ้ามี)"
                              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-200"
                          />
                      </div>

                      <button 
                        onClick={handleManualAdminCheckInSubmit}
                        className="w-full py-3.5 mt-2 bg-stone-900 text-white rounded-xl font-bold shadow-lg hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                      >
                          <span>บันทึกข้อมูล</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 no-print">
        <div className="bg-white/60 backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm">
          <h2 className="text-3xl font-bold text-stone-800 tracking-tight flex items-center gap-2">
             <span className="w-2 h-8 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></span>
             Dashboard
          </h2>
          <p className="text-stone-500 text-sm font-medium mt-1 pl-4">ระบบบริหารจัดการข้อมูลการลงเวลา</p>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
             <button onClick={() => setShowAdminCheckInModal(true)} className="px-4 py-3 bg-indigo-600 text-white border border-indigo-500 rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                ลงเวลาแทน
             </button>
             <button onClick={syncData} disabled={isSyncing} className="px-4 py-3 bg-white text-blue-600 border border-blue-100 rounded-xl font-bold text-sm shadow-sm hover:bg-blue-50 transition-all flex items-center gap-2">
                <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                {isSyncing ? 'กำลังซิงค์...' : 'Sync ข้อมูลล่าสุด'}
             </button>
            <div className="relative">
                {activeTab === 'monthly' ? (
                    <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-700 font-bold text-sm shadow-sm outline-none" />
                ) : (
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-700 font-bold text-sm shadow-sm outline-none" />
                )}
            </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-stone-200/50 pb-2 no-print bg-white/40 p-2 rounded-2xl backdrop-blur-sm">
          <button onClick={() => setActiveTab('realtime')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${activeTab === 'realtime' ? 'bg-white text-purple-700 shadow-sm border-purple-100' : 'text-stone-500 hover:bg-white/50 border-transparent'}`}>Realtime Log</button>
          <button onClick={() => setActiveTab('official')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${activeTab === 'official' ? 'bg-white text-purple-700 shadow-sm border-purple-100' : 'text-stone-500 hover:bg-white/50 border-transparent'}`}>รายงานประจำวัน (Daily)</button>
          <button onClick={() => setActiveTab('monthly')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${activeTab === 'monthly' ? 'bg-white text-purple-700 shadow-sm border-purple-100' : 'text-stone-500 hover:bg-white/50 border-transparent'}`}>สรุปมาสายรายเดือน</button>
      </div>

      {activeTab === 'realtime' ? (
      <>
        <div className="flex justify-end mb-4 no-print">
             <button onClick={handleDownloadCSV} disabled={!hasData} className="px-6 py-2 bg-white text-stone-600 hover:text-green-600 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm ring-1 ring-stone-100 disabled:opacity-50">Download CSV</button>
        </div>

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10 no-print">
            {[
                { label: 'รายการวันนี้', count: filteredRecords.length, color: 'stone' },
                { label: 'มาสาย', count: lateCount, color: 'red' },
                { label: 'ลา/ราชการ', count: dutyCount, color: 'blue' },
                { label: 'กลับก่อน', count: earlyLeaveCount, color: 'amber' }
            ].map((stat, i) => (
                <div key={i} className={`bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 relative overflow-hidden group`}>
                   <div className={`absolute right-0 top-0 w-24 h-24 bg-${stat.color}-50 rounded-bl-[100px] -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>
                   <div className="relative z-10">
                       <span className={`inline-block px-3 py-1 bg-${stat.color}-100 text-${stat.color}-600 text-[10px] font-bold uppercase tracking-widest rounded-full mb-2`}>{stat.label}</span>
                       <p className={`text-4xl font-bold text-${stat.color}-500`}>{stat.count}</p>
                   </div>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 no-print">
            <div className="lg:col-span-1 flex flex-col gap-6">
                {/* CHART */}
                <div className="bg-white p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col h-[350px] border border-stone-100">
                    <h3 className="font-bold text-stone-800 mb-6 flex items-center gap-2"><span className="w-1.5 h-6 bg-purple-400 rounded-full"></span>Overview</h3>
                    <div className="flex-1 relative">
                        {hasData ? (
                        <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)' }} />
                            <Legend verticalAlign="bottom" height={36} iconType="circle"/>
                        </PieChart>
                        </ResponsiveContainer>
                        ) : <div className="h-full flex items-center justify-center text-stone-300 font-bold">NO DATA</div>}
                    </div>
                </div>

                {/* MISSING STAFF MONITOR */}
                {missingStaff.length > 0 && (
                    <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-100 overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-stone-50 bg-red-50/50">
                            <h3 className="font-bold text-stone-800 flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                ยังไม่ลงชื่อวันนี้ ({missingStaff.length} คน)
                            </h3>
                        </div>
                        <div className="overflow-y-auto max-h-[300px] p-2">
                             <table className="w-full text-xs">
                                 <tbody>
                                     {missingStaff.map(staff => (
                                         <tr key={staff.id} className="border-b border-stone-50 last:border-0">
                                             <td className="p-3 text-stone-600 font-medium">{staff.name}</td>
                                             <td className="p-3 text-right">
                                                 <div className="flex gap-1 justify-end">
                                                     <button 
                                                        onClick={() => handleAdminAssistCheckIn(staff, 'duty')}
                                                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-[10px] font-bold"
                                                        title="บันทึกไปราชการ"
                                                     >
                                                         + ราชการ
                                                     </button>
                                                     <button 
                                                        onClick={() => handleAdminAssistCheckIn(staff, 'sick')}
                                                        className="px-2 py-1 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 text-[10px] font-bold"
                                                        title="บันทึกลาป่วย"
                                                     >
                                                         + ลาป่วย
                                                     </button>
                                                     <button 
                                                        onClick={() => handleAdminAssistCheckIn(staff, 'personal')}
                                                        className="px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 text-[10px] font-bold"
                                                        title="บันทึกลากิจ"
                                                     >
                                                         + ลากิจ
                                                     </button>
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

            {/* REALTIME TABLE */}
            <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col h-[600px] border border-stone-100">
            <div className="p-6 flex justify-between items-center bg-white sticky top-0 z-10 border-b border-stone-50">
                <h3 className="font-bold text-stone-800 flex items-center gap-2"><span className="w-1.5 h-6 bg-emerald-400 rounded-full"></span>Records (ล่าสุด)</h3>
                <button onClick={handleClear} className="text-[10px] font-bold text-red-400 bg-red-50 px-3 py-1 rounded-full hover:bg-red-100 border border-red-100">CLEAR CACHE</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
                <table className="w-full text-sm text-left text-stone-600">
                <thead className="text-xs text-stone-400 uppercase tracking-widest bg-stone-50/50 rounded-lg">
                    <tr>
                        <th className="px-4 py-2 text-center">Time</th>
                        <th className="px-4 py-2 text-center">Name</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2 text-center">Note</th>
                        <th className="px-4 py-2 text-center w-[120px]">หลักฐาน</th>
                        <th className="px-4 py-2 text-center w-[60px]">Edit</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                    {filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-center">
                            {new Date(record.timestamp).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}
                            <div className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] uppercase ${record.type === 'arrival' ? 'bg-purple-100 text-purple-600' : record.type === 'departure' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                {record.type.substr(0,3)}
                            </div>
                            {!record.id.startsWith('sheet_') && <span title="Pending Sync" className="inline-block w-2 h-2 bg-orange-400 rounded-full ml-1 animate-pulse"></span>}
                        </td>
                        <td className="px-4 py-3 text-left">
                            <div className="font-bold text-stone-800 text-xs">{record.name}</div>
                            <div className="text-[10px] text-stone-400">{record.role}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold 
                                ${record.status === 'Late' ? 'bg-red-50 text-red-500' : 
                                  record.status === 'Early Leave' ? 'bg-amber-50 text-amber-500' : 
                                  record.status === 'Admin Assist' ? 'bg-gray-100 text-gray-600 border border-gray-200' :
                                  ['Duty', 'Sick Leave', 'Personal Leave', 'Other Leave'].includes(record.status) ? 'bg-blue-50 text-blue-600' :
                                  record.status === 'Authorized Late' ? 'bg-indigo-50 text-indigo-600' :
                                  'bg-emerald-50 text-emerald-600'}`}>
                                {record.status}
                            </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-400 text-center">{record.reason || '-'}</td>
                        <td className="px-4 py-3 text-center">
                            {(record.imageUrl && record.imageUrl.length > 20) ? (
                                <button onClick={() => openImage(record.imageUrl)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 w-full ${record.imageUrl?.startsWith('Error') || record.imageUrl?.startsWith('Exception') ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-600'}`}>
                                    {record.imageUrl?.startsWith('Error') ? '⚠️ มีปัญหา' : '📷 ดูรูปภาพ'}
                                </button>
                            ) : <span className="text-stone-300 text-[10px]">-</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                            <button onClick={() => openEditModal(record)} className="text-stone-400 hover:text-blue-500">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
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
        /* PRINTABLE REPORTS (Daily or Monthly) */
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden min-h-[600px] flex flex-col">
            <div className="p-8 border-b border-stone-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-stone-50/30 no-print">
                <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-sm">
                    <h3 className="text-xl font-bold text-stone-800 text-center md:text-left flex items-center gap-2"><span className="w-1.5 h-6 bg-stone-800 rounded-full"></span>{activeTab === 'monthly' ? 'รายงานสรุปการมาสายรายเดือน' : 'ตารางสรุปรายงานการมาปฏิบัติราชการ'}</h3>
                    <p className="text-stone-500 text-sm mt-1 text-center md:text-left pl-4">โรงเรียนประจักษ์ศิลปาคม • {activeTab === 'monthly' ? `ประจำเดือน ${formatMonthYear(selectedMonth)}` : `ประจำ${new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleBrowserPrint} className="px-6 py-3 bg-stone-900 text-white rounded-xl shadow-lg hover:shadow-xl hover:bg-stone-800 text-sm font-bold flex items-center gap-2 transition-all">พิมพ์ (A4)</button>
                    {activeTab === 'official' && <button onClick={handleOfficialPDF} className="px-4 py-3 bg-white text-stone-600 border border-stone-200 rounded-xl hover:bg-stone-50 text-sm font-bold flex items-center gap-2 transition-all">Save PDF</button>}
                </div>
            </div>
            
            {/* Printable Area */}
            <div id="printable-report" className="overflow-x-auto p-4 md:p-0">
                <div className="hidden print:flex flex-col items-center justify-center mb-4">
                     <img src="https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png" className="w-16 h-16 object-contain grayscale-0 mb-1" alt="Logo" />
                     <h1 className="text-xl font-bold text-black leading-tight">โรงเรียนประจักษ์ศิลปาคม</h1>
                     <p className="text-xs text-black font-medium tracking-wide mt-0">{activeTab === 'monthly' ? `รายงานสรุปการมาสายรายเดือน ประจำเดือน ${formatMonthYear(selectedMonth)}` : `รายงานการมาปฏิบัติราชการ ประจำ${new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}</p>
                </div>

                <table className="w-full text-left border-collapse border-b-2 border-t-2 border-black">
                    <thead>
                        <tr className="text-black text-xs uppercase tracking-wider border-b-2 border-black">
                            {activeTab === 'monthly' ? (
                                <>
                                    <th className="px-2 py-1 border-r border-black text-center w-[5%]">ลำดับ</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[25%]">ชื่อ-สกุล</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[15%]">ตำแหน่ง</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[10%]">มาสาย (ครั้ง)</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[10%]">ไม่ลงชื่อ (วัน)</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[20%]">วันที่มาสาย</th>
                                    <th className="px-2 py-1 text-center w-[15%]">หมายเหตุ</th>
                                </>
                            ) : (
                                <>
                                    <th className="px-2 py-1 border-r border-black text-center w-[5%]">ลำดับ</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[30%]">ชื่อ-สกุล</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[20%]">ตำแหน่ง</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[10%]">เวลามา</th>
                                    <th className="px-2 py-1 border-r border-black text-center w-[10%]">เวลากลับ</th>
                                    <th className="px-2 py-1 text-center w-[25%]">หมายเหตุ</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="text-xs print:text-[10px]">
                        {activeTab === 'monthly' ? (
                            monthlyReportData.map((row, index) => (
                                <tr key={row.staffId} className="print:hover:bg-transparent transition-colors border-b border-gray-300">
                                    <td className="px-2 py-0.5 border-x border-gray-300 text-black text-center font-mono">{index + 1}</td>
                                    <td className="px-2 py-0.5 border-r border-gray-300 text-left pl-2"><div className="font-bold text-black">{row.name}</div></td>
                                    <td className="px-2 py-0.5 border-r border-gray-300 text-black text-center">{row.role}</td>
                                    <td className={`px-2 py-0.5 border-r border-gray-300 text-center font-bold ${row.lateCount > 0 ? 'text-black' : 'text-gray-400'}`}>{row.lateCount > 0 ? row.lateCount : '-'}</td>
                                    <td className={`px-2 py-0.5 border-r border-gray-300 text-center font-bold ${row.notSignedInCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{row.notSignedInCount > 0 ? row.notSignedInCount : '-'}</td>
                                    <td className="px-2 py-0.5 border-r border-gray-300 text-black text-[9px] text-center leading-tight">{row.lateDates || '-'}</td>
                                    <td className="px-2 py-0.5 border-r border-gray-300 text-black text-center">{row.note || ''}</td>
                                </tr>
                            ))
                        ) : (
                            officialReportData.map((row, index) => (
                                <tr key={row.staffId} className="print:hover:bg-transparent transition-colors border-b border-gray-300">
                                    <td className="px-2 py-0.5 border-x border-gray-300 text-black text-center font-mono">{index + 1}</td>
                                    <td className="px-2 py-0.5 border-r border-gray-300 text-left pl-2"><div className="font-bold text-black">{row.name}</div></td>
                                    <td className="px-2 py-0.5 border-r border-gray-300 text-black text-center">{row.role}</td>
                                    <td className={`px-2 py-0.5 border-r border-gray-300 text-center font-mono font-bold text-black`}>{row.arrivalTime}{row.arrivalStatus === 'Late' && <span className="print:hidden ml-1">⚠️</span>}</td>
                                    <td className={`px-2 py-0.5 border-r border-gray-300 text-center font-mono font-bold text-black`}>{row.departureTime}</td>
                                    <td className="px-2 py-0.5 border-r border-gray-300 text-black max-w-xs break-words text-center text-[9px]">{row.note || ''}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                <div className="hidden print:flex justify-between items-start mt-4 px-8 break-inside-avoid">
                    <div className="text-center w-48">
                        <p className="text-xs font-bold mb-6">ลงชื่อ..........................................................</p>
                        <p className="text-xs font-bold">เจ้าหน้าที่/หัวหน้าฝ่ายบุคคล</p>
                        <p className="text-[10px] text-black mt-0.5">ผู้ตรวจสอบ</p>
                    </div>
                    <div className="text-center w-48">
                         <p className="text-xs font-bold mb-6">ลงชื่อ..........................................................</p>
                        <p className="text-xs font-bold">ผู้อำนวยการโรงเรียน</p>
                        <p className="text-[10px] text-black mt-0.5">ผู้รับรอง</p>
                    </div>
                </div>
                <div className="hidden print:block text-[9px] text-gray-400 mt-2 text-center">เอกสารนี้สร้างโดยระบบ SchoolCheckIn AI System | ข้อมูล ณ เวลา {new Date().toLocaleTimeString('th-TH')}</div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
