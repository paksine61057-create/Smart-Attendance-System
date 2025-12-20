
import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { getRecords, clearRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord } from '../services/storageService';
import { CheckInRecord, Staff } from '../types';
import { getAllStaff } from '../services/staffService';
import { getHoliday } from '../services/holidayService';

const Dashboard: React.FC = () => {
  const getLocalYYYYMMDD = (dInput: any) => {
      const d = new Date(dInput);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [activeTab, setActiveTab] = useState<'realtime' | 'official' | 'monthly'>('realtime');
  const [allRecords, setAllRecords] = useState<CheckInRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<CheckInRecord[]>([]);
  const [missingStaff, setMissingStaff] = useState<Staff[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getLocalYYYYMMDD(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<string>(getLocalYYYYMMDD(new Date()).slice(0, 7));
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const syncData = useCallback(async () => {
      setIsSyncing(true);
      try {
          await syncUnsyncedRecords();
          const cloudRecords = await fetchGlobalRecords();
          const localRecords = getRecords();
          const merged = [...cloudRecords];
          const cloudSigs = new Set(cloudRecords.map(r => `${r.timestamp}_${r.staffId}`));
          
          localRecords.forEach(local => {
              const sig = `${local.timestamp}_${local.staffId}`;
              if (!cloudSigs.has(sig)) merged.push(local);
              else {
                  // [SMART MERGE] ถ้ารูป Cloud เสีย (สั้นเกินไป) ให้ดึงรูปจากเครื่องมาทับทันที
                  const idx = merged.findIndex(r => `${r.timestamp}_${r.staffId}` === sig);
                  const cloudImg = merged[idx].imageUrl || '';
                  const localImg = local.imageUrl || '';
                  if (localImg.length > cloudImg.length || (localImg.length > 5000 && cloudImg.length < 1000)) {
                      merged[idx] = { ...merged[idx], imageUrl: localImg };
                  }
              }
          });
          setAllRecords(merged);
      } catch { setAllRecords(getRecords()); }
      finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { syncData(); }, [syncData]);

  useEffect(() => {
    const todayStr = selectedDate;
    const records = allRecords.filter(r => getLocalYYYYMMDD(r.timestamp) === todayStr).sort((a,b) => a.timestamp - b.timestamp);
    setFilteredRecords(records);
    if (todayStr === getLocalYYYYMMDD(new Date())) {
        const checkedIds = new Set(records.filter(r => r.type !== 'departure').map(r => r.staffId));
        setMissingStaff(getAllStaff().filter(s => !checkedIds.has(s.id)));
    } else setMissingStaff([]);

    // Official Daily Report Calculation
    const dailyData = getAllStaff().map(staff => {
        const sRecs = records.filter(r => r.staffId === staff.id);
        const leave = sRecs.find(r => ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(r.type));
        const arrival = sRecs.find(r => r.type === 'arrival' || r.type === 'authorized_late');
        const departure = sRecs.find(r => r.type === 'departure');
        
        return {
            name: staff.name, role: staff.role,
            arrivalTime: leave ? leave.status : (arrival ? new Date(arrival.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : '-'),
            departureTime: leave ? leave.status : (departure ? new Date(departure.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : '-'),
            note: (arrival?.status === 'Late' ? `สาย: ${arrival.reason || ''}` : '') + (departure?.status === 'Early Leave' ? ` กลับก่อน: ${departure.reason || ''}` : '')
        };
    });
    setOfficialReportData(dailyData);

    // Monthly Report Calculation
    const [y, m] = selectedMonth.split('-').map(Number);
    const mData = getAllStaff().map(staff => {
        const lateDays = allRecords.filter(r => r.staffId === staff.id && r.status === 'Late' && getLocalYYYYMMDD(r.timestamp).startsWith(selectedMonth));
        return { name: staff.name, role: staff.role, lateCount: lateDays.length, lateDates: lateDays.map(r => new Date(r.timestamp).getDate()).join(', ') };
    });
    setMonthlyReportData(mData);
  }, [selectedDate, selectedMonth, allRecords]);

  const [officialReportData, setOfficialReportData] = useState<any[]>([]);
  const [monthlyReportData, setMonthlyReportData] = useState<any[]>([]);

  const stats = [
    { name: 'มาปกติ', value: filteredRecords.filter(r => r.status === 'On Time' || r.status === 'Normal').length },
    { name: 'มาสาย', value: filteredRecords.filter(r => r.status === 'Late').length },
    { name: 'กลับก่อน', value: filteredRecords.filter(r => r.status === 'Early Leave').length },
    { name: 'ลา/ราชการ', value: filteredRecords.filter(r => ['Duty', 'Sick Leave', 'Personal Leave'].includes(r.status)).length },
  ];
  const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

  const openImage = (url?: string) => {
    if (url && url.length > 20) {
        setPreviewImage(url.startsWith('data:') ? url : `data:image/jpeg;base64,${url}`);
    }
  };

  return (
    <div className="w-full">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report { position: absolute; left: 0; top: 0; width: 100%; background: white !important; }
        }
      `}</style>

      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4 no-print" onClick={() => setPreviewImage(null)}>
            <div className="relative max-w-2xl w-full flex flex-col items-center animate-in zoom-in">
                <button className="absolute -top-14 right-0 text-white bg-white/10 p-3 rounded-full">✕</button>
                <div className="p-3 bg-white rounded-[2.5rem] shadow-2xl border-8 border-rose-100 overflow-hidden">
                    <img src={previewImage} className="w-full h-auto rounded-[1.8rem] max-h-[70vh]" onError={(e) => (e.target as any).src = 'https://via.placeholder.com/400?text=Data+Broken'} />
                </div>
                <p className="text-white font-black tracking-widest uppercase bg-rose-600 px-8 py-3 rounded-full mt-8 shadow-xl animate-pulse">Identity Verified ❄️</p>
                <p className="text-rose-200 text-[10px] mt-2 font-bold opacity-60">รหัสภาพ: {previewImage.length.toLocaleString()} ตัวอักษร</p>
            </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6 no-print">
        <div className="bg-white/10 backdrop-blur-xl p-6 rounded-[2rem] border border-white/20 shadow-2xl relative overflow-hidden group">
          <div className="absolute -top-4 -right-4 text-5xl opacity-20 group-hover:opacity-100 transition-all animate-sway">⛄</div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">Admin Dashboard 🎁</h2>
          <p className="text-amber-200 text-xs font-bold mt-1 pl-1 uppercase tracking-widest">Happy New Year 2026 Monitor</p>
        </div>
        <div className="flex gap-4 items-center">
             <button onClick={syncData} disabled={isSyncing} className="px-6 py-4 bg-white/15 text-white border-2 border-white/20 rounded-2xl font-black text-sm shadow-xl hover:bg-white/25 transition-all">
                {isSyncing ? 'Refreshing...' : 'Refresh & Sync ❄️'}
             </button>
             {activeTab === 'monthly' ? <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="px-5 py-3.5 bg-white border-4 border-rose-100 rounded-2xl text-rose-700 font-black text-sm shadow-xl" /> : <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3.5 bg-white border-4 border-rose-100 rounded-2xl text-rose-700 font-black text-sm shadow-xl" />}
        </div>
      </div>

      <div className="flex gap-3 mb-8 no-print bg-white/5 p-3 rounded-[2rem] backdrop-blur-md">
          {['realtime', 'official', 'monthly'].map(t => (
            <button key={t} onClick={() => setActiveTab(t as any)} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${activeTab === t ? 'bg-white text-rose-700 border-rose-100 shadow-xl' : 'text-white/60 border-transparent'}`}>{t === 'realtime' ? 'Realtime Log' : t === 'official' ? 'รายงานประจำวัน' : 'สรุปรายเดือน'}</button>
          ))}
      </div>

      {activeTab === 'realtime' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 no-print">
            <div className="lg:col-span-1 bg-white p-8 rounded-[3rem] shadow-2xl border-4 border-rose-50 h-fit">
                <h3 className="font-black text-stone-800 mb-6 flex items-center gap-3"><span className="w-2 h-8 bg-rose-500 rounded-full" />สถิติวันนี้</h3>
                <div className="h-64">
                    {filteredRecords.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart><Pie data={stats.filter(s => s.value > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" stroke="none">{stats.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-stone-300 font-black">NO RECORDS ❄️</div>}
                </div>
                {missingStaff.length > 0 && (
                    <div className="mt-8 pt-8 border-t-4 border-stone-50">
                        <h4 className="font-black text-xs uppercase tracking-widest text-amber-500 mb-4">ยังไม่ลงชื่อ ({missingStaff.length})</h4>
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {missingStaff.map(s => <div key={s.id} className="text-[11px] font-bold text-stone-600 bg-stone-50 p-3 rounded-xl">{s.name}</div>)}
                        </div>
                    </div>
                )}
            </div>
            <div className="lg:col-span-2 bg-white rounded-[3rem] shadow-2xl border-4 border-rose-50 overflow-hidden h-[700px] flex flex-col">
                <div className="p-8 border-b-4 border-stone-50 bg-white sticky top-0 z-10 flex justify-between">
                    <h3 className="font-black text-stone-800 text-xl">รายการล่าสุด 🎄</h3>
                    <button onClick={() => window.confirm('ล้างข้อมูลแคช?') && (clearRecords(), syncData())} className="text-[10px] font-black text-rose-500">Clear Local</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    <table className="w-full text-sm">
                        <thead className="text-[10px] font-black uppercase text-stone-400"><tr><th className="p-4 text-center">เวลา</th><th className="p-4">ชื่อ-ตำแหน่ง</th><th className="p-4 text-center">สถานะ</th><th className="p-4 text-center">หลักฐาน</th></tr></thead>
                        <tbody className="divide-y divide-stone-50">
                            {filteredRecords.map(r => (
                                <tr key={r.id} className="hover:bg-rose-50/30">
                                    <td className="p-5 text-center font-mono font-bold">{new Date(r.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</td>
                                    <td className="p-5"><div className="font-black text-stone-800">{r.name}</div><div className="text-[10px] text-stone-400">{r.role}</div></td>
                                    <td className="p-5 text-center"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${r.status === 'Late' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{r.status}</span></td>
                                    <td className="p-5 text-center">
                                        {r.imageUrl ? <div className="flex flex-col items-center gap-1"><button onClick={() => openImage(r.imageUrl)} className="px-5 py-2 bg-stone-900 text-white rounded-xl text-[9px] font-black">ดูรูปภาพ ❄️</button><span className={`text-[8px] ${r.imageUrl.length < 1000 ? 'text-rose-500' : 'text-stone-300'}`}>Len: {r.imageUrl.length.toLocaleString()}</span></div> : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      ) : (
        <div id="printable-report" className="bg-white p-12 rounded-[3rem] shadow-2xl min-h-[600px] border-4 border-rose-50">
            <div className="flex flex-col items-center mb-10">
                <img src="https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png" className="w-20 mb-4" alt="Logo" />
                <h1 className="text-2xl font-bold">โรงเรียนประจักษ์ศิลปาคม</h1>
                <p className="font-bold text-stone-600 mt-2">{activeTab === 'monthly' ? `รายงานสรุปรายเดือน ประจำเดือน ${selectedMonth}` : `รายงานการมาปฏิบัติราชการ ประจำวันที่ ${new Date(selectedDate).toLocaleDateString('th-TH', {day:'numeric', month:'long', year:'numeric'})}`}</p>
            </div>
            <table className="w-full border-collapse border-2 border-black">
                <thead><tr className="bg-stone-50 text-xs font-bold uppercase"><th className="p-3 border border-black">ลำดับ</th><th className="p-3 border border-black text-left">ชื่อ-สกุล</th><th className="p-3 border border-black">ตำแหน่ง</th>{activeTab === 'monthly' ? <><th className="p-3 border border-black">สาย (ครั้ง)</th><th className="p-3 border border-black">วันที่</th></> : <><th className="p-3 border border-black">เวลามา</th><th className="p-3 border border-black">เวลากลับ</th><th className="p-3 border border-black">หมายเหตุ</th></>}</tr></thead>
                <tbody>
                    {(activeTab === 'monthly' ? monthlyReportData : officialReportData).map((row, i) => (
                        <tr key={i} className="text-xs">
                            <td className="p-2 border border-black text-center">{i+1}</td>
                            <td className="p-2 border border-black font-bold">{row.name}</td>
                            <td className="p-2 border border-black text-center">{row.role}</td>
                            {activeTab === 'monthly' ? <><td className="p-2 border border-black text-center font-bold text-red-600">{row.lateCount || '-'}</td><td className="p-2 border border-black text-center">{row.lateDates}</td></> : <><td className="p-2 border border-black text-center font-mono">{row.arrivalTime}</td><td className="p-2 border border-black text-center font-mono">{row.departureTime}</td><td className="p-2 border border-black text-[10px]">{row.note}</td></>}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="flex justify-between mt-20 px-20">
                <div className="text-center w-64"><div className="border-b-2 border-dotted border-black mb-2" /><p className="font-bold">ผู้ตรวจสอบ</p></div>
                <div className="text-center w-64"><div className="border-b-2 border-dotted border-black mb-2" /><p className="font-bold">ผู้อำนวยการโรงเรียน</p></div>
            </div>
            <button onClick={() => window.print()} className="mt-20 w-full py-5 bg-stone-900 text-white rounded-2xl font-black no-print hover:bg-rose-600 transition-all">พิมพ์รายงาน (A4) 🎅</button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
