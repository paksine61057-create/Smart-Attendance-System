
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getRecords, fetchGlobalRecords, syncUnsyncedRecords, deleteRecord, saveRecord } from '../services/storageService';
import { getAllStaff } from '../services/staffService';
import { generateDailyReportSummary } from '../services/geminiService';
import { CheckInRecord, Staff, AttendanceType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

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

  // Filters
  const filteredToday = useMemo(() => {
    return allRecords.filter(r => {
      const d = new Date(r.timestamp);
      return d.toISOString().split('T')[0] === selectedDate;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [allRecords, selectedDate]);

  // Statistics Data
  const statsData = useMemo(() => {
    const counts = { onTime: 0, late: 0, early: 0, leave: 0 };
    filteredToday.forEach(r => {
      if (r.status === 'On Time') counts.onTime++;
      else if (r.status === 'Late') counts.late++;
      else if (r.status === 'Early Leave') counts.early++;
      else counts.leave++;
    });
    return [
      { name: 'ตรงเวลา', value: counts.onTime, color: '#10b981' },
      { name: 'สาย', value: counts.late, color: '#f43f5e' },
      { name: 'กลับก่อน', value: counts.early, color: '#f59e0b' },
      { name: 'อื่นๆ', value: counts.leave, color: '#6366f1' },
    ];
  }, [filteredToday]);

  // Monthly Report Data
  const monthlyData = useMemo(() => {
    const currentMonth = selectedDate.substring(0, 7); // YYYY-MM
    const monthlyRecords = allRecords.filter(r => new Date(r.timestamp).toISOString().startsWith(currentMonth));
    
    return staffList.map(staff => {
      const staffRecs = monthlyRecords.filter(r => r.staffId === staff.id);
      return {
        ...staff,
        total: staffRecs.length,
        onTime: staffRecs.filter(r => r.status === 'On Time').length,
        late: staffRecs.filter(r => r.status === 'Late').length,
        leave: staffRecs.filter(r => r.type.includes('leave')).length
      };
    }).sort((a, b) => b.total - a.total);
  }, [allRecords, selectedDate, staffList]);

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
    
    const now = new Date();
    const record: CheckInRecord = {
      id: crypto.randomUUID(),
      staffId: staff.id,
      name: staff.name,
      role: staff.role,
      timestamp: now.getTime(),
      type: manualType,
      status: 'Admin Assist',
      reason: manualReason || 'บันทึกโดยผู้ดูแลระบบ',
      location: { lat: 0, lng: 0 },
      distanceFromBase: 0,
      aiVerification: 'Manual Entry by Admin'
    };
    
    await saveRecord(record);
    setManualReason('');
    alert('บันทึกข้อมูลเรียบร้อย');
    syncData();
    setActiveTab('today');
  };

  const COLORS = ['#10b981', '#f43f5e', '#f59e0b', '#6366f1'];

  return (
    <div className="w-full max-w-6xl mx-auto pb-20">
      {/* Image Preview Overlay */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage.startsWith('data:') ? previewImage : `data:image/jpeg;base64,${previewImage}`} className="max-w-full max-h-[90vh] rounded-3xl border-4 border-white/20 shadow-2xl" alt="Preview" />
        </div>
      )}

      {/* Header & Main Info */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 no-print bg-white/10 backdrop-blur-md p-8 rounded-[3rem] border border-white/20">
        <div className="text-center md:text-left">
          <h2 className="text-4xl font-black text-white flex items-center gap-3 justify-center md:justify-start">
            Monitor Center <span className="animate-sway">❄️</span>
          </h2>
          <p className="text-amber-200 text-xs font-bold tracking-widest uppercase mt-2 opacity-80 italic">Prachaksinlapakhom School Management</p>
        </div>
        
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={syncData} disabled={isSyncing} className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl font-bold text-sm transition-all flex items-center gap-2">
            {isSyncing ? '...' : '🔄 รีเฟรช'}
          </button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-5 py-3 rounded-2xl bg-white border-none font-bold text-rose-700 shadow-lg text-sm" />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-print">
        {[
          { id: 'today', label: 'บันทึกวันนี้', emoji: '📅' },
          { id: 'monthly', label: 'รายงานรายเดือน', emoji: '📊' },
          { id: 'stats', label: 'สถิติภาพรวม', emoji: '📈' },
          { id: 'manual', label: 'บันทึกแทน', emoji: '✍️' }
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

      {/* Content Area */}
      <div className="bg-white rounded-[3.5rem] shadow-2xl border-4 border-rose-50 overflow-hidden min-h-[600px] animate-in fade-in slide-in-from-bottom-4">
        
        {activeTab === 'today' && (
          <div className="p-8">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-stone-800">รายการประจำวัน 🎁</h3>
              <button 
                onClick={handleAiSummary} 
                disabled={isGeneratingAi || filteredToday.length === 0}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isGeneratingAi ? 'กำลังวิเคราะห์...' : '✨ AI สรุปรายงาน'}
              </button>
            </div>

            {aiSummary && (
              <div className="mb-8 p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100 text-emerald-800 animate-in zoom-in">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2">Gemini Executive Summary</p>
                <p className="text-sm font-medium leading-relaxed">{aiSummary}</p>
                <button onClick={() => setAiSummary('')} className="mt-3 text-[10px] font-bold underline opacity-50">ปิดคำสรุป</button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black uppercase text-stone-400 border-b-2 border-stone-100">
                    <th className="p-4">เวลา</th>
                    <th className="p-4">บุคลากร</th>
                    <th className="p-4">ประเภท</th>
                    <th className="p-4 text-center">สถานะ</th>
                    <th className="p-4 text-center">หลักฐาน</th>
                    <th className="p-4 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {filteredToday.map(r => (
                    <tr key={r.id} className="hover:bg-rose-50/30 transition-colors">
                      <td className="p-4 font-mono font-black text-rose-500">{new Date(r.timestamp).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</td>
                      <td className="p-4">
                        <div className="font-bold text-stone-800">{r.name}</div>
                        <div className="text-[10px] text-stone-400 font-bold">{r.staffId} • {r.role}</div>
                      </td>
                      <td className="p-4">
                        <span className="text-[10px] font-black px-3 py-1 bg-stone-100 rounded-full text-stone-600">
                          {r.type === 'arrival' ? 'มาทำงาน' : r.type === 'departure' ? 'กลับบ้าน' : r.type}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black ${
                          r.status === 'On Time' ? 'bg-emerald-100 text-emerald-700' : 
                          r.status === 'Late' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>{r.status}</span>
                      </td>
                      <td className="p-4 text-center">
                        {r.imageUrl ? (
                          <button onClick={() => setPreviewImage(r.imageUrl!)} className="w-10 h-10 rounded-xl bg-stone-900 overflow-hidden border-2 border-white shadow-md active:scale-90 transition-all">
                            <img src={r.imageUrl.startsWith('data:') ? r.imageUrl : `data:image/jpeg;base64,${r.imageUrl}`} className="w-full h-full object-cover opacity-80" alt="Thumb" />
                          </button>
                        ) : <span className="text-[10px] text-stone-300 italic">No Photo</span>}
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => { if(confirm('ลบ?')) deleteRecord(r).then(syncData) }} className="text-stone-300 hover:text-rose-500 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredToday.length === 0 && (
                <div className="py-20 text-center text-stone-300 font-black flex flex-col items-center">
                  <span className="text-6xl mb-4">⛄</span>
                  <p>ไม่พบข้อมูลในวันนี้</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'monthly' && (
          <div className="p-8">
             <h3 className="text-2xl font-black text-stone-800 mb-8 flex items-center gap-2">รายงานสรุปรายเดือน <span className="text-sm font-bold text-rose-400 bg-rose-50 px-4 py-1 rounded-full">{selectedDate.substring(0,7)}</span></h3>
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase text-stone-400 border-b-2 border-stone-100">
                      <th className="p-4">บุคลากร</th>
                      <th className="p-4 text-center">ลงเวลารวม</th>
                      <th className="p-4 text-center">ตรงเวลา</th>
                      <th className="p-4 text-center">สาย</th>
                      <th className="p-4 text-center">ลา/ภารกิจ</th>
                      <th className="p-4 text-right">ความสม่ำเสมอ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {monthlyData.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-stone-800">{m.name}</div>
                          <div className="text-[10px] text-stone-400 font-bold">{m.role}</div>
                        </td>
                        <td className="p-4 text-center font-black">{m.total}</td>
                        <td className="p-4 text-center text-emerald-600 font-bold">{m.onTime}</td>
                        <td className="p-4 text-center text-rose-500 font-bold">{m.late}</td>
                        <td className="p-4 text-center text-blue-500 font-bold">{m.leave}</td>
                        <td className="p-4 text-right">
                          <div className="w-24 bg-stone-100 h-2 rounded-full inline-block overflow-hidden">
                             <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(100, (m.onTime / (m.total || 1)) * 100)}%` }}></div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="p-8">
            <h3 className="text-2xl font-black text-stone-800 mb-8">สถิติการมาทำงานสะสม 📈</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="h-[400px] bg-stone-50/50 p-6 rounded-3xl border border-stone-100 shadow-inner">
                <p className="text-center font-black text-stone-400 text-xs mb-4 uppercase">สัดส่วนวันนี้</p>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statsData} innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                      {statsData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[400px] bg-stone-50/50 p-6 rounded-3xl border border-stone-100 shadow-inner">
                 <p className="text-center font-black text-stone-400 text-xs mb-4 uppercase">กราฟแท่งเปรียบเทียบ</p>
                 <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold'}} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#f8fafc'}} />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                      {statsData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-8 p-8 bg-indigo-600 rounded-[2.5rem] text-white flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl">
               <div>
                  <h4 className="text-xl font-black mb-1">Total Attendance Growth</h4>
                  <p className="text-indigo-100 text-xs font-medium">สถิติข้อมูลสะสมทั้งหมดที่เชื่อมต่อกับระบบคลาวด์</p>
               </div>
               <div className="text-4xl font-black">{allRecords.length} <span className="text-xs uppercase opacity-60">Total Records</span></div>
            </div>
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="p-8 max-w-2xl mx-auto">
             <div className="text-center mb-10">
                <span className="text-5xl mb-4 inline-block">✍️</span>
                <h3 className="text-2xl font-black text-stone-800">บันทึกเวลาแทนบุคลากร</h3>
                <p className="text-stone-400 text-xs font-bold mt-2">สำหรับกรณีลืมเครื่องหรือเหตุสุดวิเศษ (Admin Override)</p>
             </div>
             
             <form onSubmit={handleManualCheckIn} className="space-y-6 bg-stone-50 p-10 rounded-[3rem] border-2 border-stone-100 shadow-xl">
                <div>
                   <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">เลือกบุคลากร</label>
                   <select 
                    value={manualStaffId} 
                    onChange={e => setManualStaffId(e.target.value)}
                    className="w-full p-4 bg-white border-2 border-stone-200 rounded-2xl font-bold text-stone-800 outline-none focus:ring-4 focus:ring-rose-100 transition-all"
                    required
                   >
                      <option value="">-- เลือกรายชื่อ --</option>
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.id} : {s.name}</option>)}
                   </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <button 
                    type="button"
                    onClick={() => setManualType('arrival')}
                    className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${manualType === 'arrival' ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg' : 'bg-white text-stone-400 border-stone-100'}`}
                   >มาทำงาน</button>
                   <button 
                    type="button"
                    onClick={() => setManualType('departure')}
                    className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${manualType === 'departure' ? 'bg-amber-500 text-white border-amber-400 shadow-lg' : 'bg-white text-stone-400 border-stone-100'}`}
                   >กลับบ้าน</button>
                </div>

                <div>
                   <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 ml-2">หมายเหตุ / เหตุผล</label>
                   <textarea 
                    value={manualReason} 
                    onChange={e => setManualReason(e.target.value)}
                    className="w-full p-4 bg-white border-2 border-stone-200 rounded-2xl font-bold text-stone-800 outline-none h-32"
                    placeholder="เช่น ลืมโทรศัพท์ไว้ที่บ้าน, มาลงชื่อแทนโดยแอดมิน..."
                   />
                </div>

                <button type="submit" className="w-full py-5 bg-rose-600 hover:bg-rose-700 text-white rounded-3xl font-black shadow-xl shadow-rose-200 active:scale-95 transition-all">
                  ยืนยันการบันทึกข้อมูล 🎉
                </button>
             </form>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
