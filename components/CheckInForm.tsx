
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppSettings, GeoLocation, CheckInRecord, AttendanceType, Staff } from '../types';
import { getCurrentPosition, getDistanceFromLatLonInMeters } from '../services/geoService';
import { saveRecord, getSettings, syncSettingsFromCloud } from '../services/storageService';
import { analyzeCheckInImage } from '../services/geminiService';
import { getStaffById } from '../services/staffService';
import { getHoliday } from '../services/holidayService';

interface CheckInFormProps {
  onSuccess: () => void;
}

const CAMERA_FILTERS = [
  { id: 'normal', name: 'ปกติ', css: 'none', color: '#9ca3af' },
  { id: 'beauty', name: 'ผิวเนียน', css: 'brightness(1.15) contrast(0.95) saturate(1.05) hue-rotate(-2deg)', color: '#f472b6' },
  { id: 'clear', name: 'หน้าใส', css: 'brightness(1.2) contrast(0.9) saturate(1.0)', color: '#fbcfe8' },
  { id: 'soft', name: 'ละมุน', css: 'brightness(1.1) contrast(0.85) saturate(0.9) sepia(0.1)', color: '#e5e7eb' },
  { id: 'fresh', name: 'สดใส', css: 'brightness(1.05) contrast(1.1) saturate(1.3)', color: '#fcd34d' },
  { id: 'chic', name: 'เท่', css: 'grayscale(1) contrast(1.2) brightness(1.1)', color: '#1f2937' },
];

const CheckInForm: React.FC<CheckInFormProps> = ({ onSuccess }) => {
  const [step, setStep] = useState<'info' | 'camera' | 'verifying' | 'result'>('info');
  const [attendanceType, setAttendanceType] = useState<AttendanceType>(() => {
    const currentHour = new Date().getHours();
    return currentHour < 12 ? 'arrival' : 'departure';
  });
  const [staffIdInput, setStaffIdInput] = useState('');
  const [currentUser, setCurrentUser] = useState<Staff | null>(null);
  const [reason, setReason] = useState(''); 
  const [locationError, setLocationError] = useState('');
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState('normal');
  const [todayHoliday, setTodayHoliday] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const init = async () => {
        await syncSettingsFromCloud();
        setSettings(getSettings());
        const holiday = getHoliday(new Date());
        setTodayHoliday(holiday);
        const savedId = localStorage.getItem('school_checkin_saved_staff_id');
        if (savedId) setStaffIdInput(savedId);
    };
    init();
  }, []);

  useEffect(() => {
    if (staffIdInput.length >= 5) {
        const staff = getStaffById(staffIdInput);
        setCurrentUser(staff || null);
    } else setCurrentUser(null);
  }, [staffIdInput]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (step === 'camera') {
      setIsCameraLoading(true);
      const startCamera = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => setIsCameraLoading(false);
          }
        } catch (err) {
          setLocationError("ไม่สามารถเปิดกล้องได้");
          setIsCameraLoading(false);
          setStep('info');
        }
      };
      startCamera();
    }
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [step]);

  const validateLocation = async () => {
    const currentSettings = getSettings();
    if (['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(attendanceType)) {
        try {
            const pos = await getCurrentPosition();
            return { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch { return { lat: 0, lng: 0 }; }
    }
    if (!currentSettings?.officeLocation) {
      setLocationError("ระบบยังไม่ได้ตั้งค่าพิกัดจุดลงเวลา");
      return false;
    }
    try {
      const pos = await getCurrentPosition();
      const dist = getDistanceFromLatLonInMeters(pos.coords.latitude, pos.coords.longitude, currentSettings.officeLocation.lat, currentSettings.officeLocation.lng);
      setCurrentDistance(dist);
      if (dist > currentSettings.maxDistanceMeters) {
        setLocationError(`ห่างจากจุดเช็คอิน ${Math.round(dist)} ม. (จำกัด ${currentSettings.maxDistanceMeters} ม.)`);
        return false;
      }
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      setLocationError("ไม่สามารถระบุตำแหน่ง GPS ได้");
      return false;
    }
  };

  const capturePhoto = useCallback(async () => {
    if (videoRef.current && canvasRef.current && currentUser) {
      const context = canvasRef.current.getContext('2d');
      const video = videoRef.current;
      if (context && video.videoWidth) {
        const TARGET_WIDTH = 180; // ปรับให้รหัสภาพยาวพอดี (13k-17k chars)
        const scale = TARGET_WIDTH / video.videoWidth;
        canvasRef.current.width = TARGET_WIDTH;
        canvasRef.current.height = video.videoHeight * scale;
        const filter = CAMERA_FILTERS.find(f => f.id === activeFilterId);
        context.filter = filter?.css || 'none';
        context.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        const imageBase64 = canvasRef.current.toDataURL('image/jpeg', 0.35); // คุณภาพ 0.35 สมดุลที่สุด
        setStep('verifying');
        
        const [aiResult, loc] = await Promise.all([analyzeCheckInImage(imageBase64), validateLocation()]);
        if (!loc && !['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(attendanceType)) {
            setStep('camera'); return;
        }

        const now = new Date();
        let status: any = 'Normal';
        if (attendanceType === 'arrival') {
            const limit = new Date(); limit.setHours(8, 1, 0, 0);
            status = now >= limit ? 'Late' : 'On Time';
        } else if (attendanceType === 'departure') {
            const limit = new Date(); limit.setHours(16, 0, 0, 0);
            status = now < limit ? 'Early Leave' : 'Normal';
        } else status = attendanceType.replace('_', ' ').split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

        const record: CheckInRecord = {
          id: crypto.randomUUID(), staffId: currentUser.id, name: currentUser.name, role: currentUser.role,
          type: attendanceType, timestamp: now.getTime(), location: (loc || { lat: 0, lng: 0 }) as GeoLocation,
          distanceFromBase: currentDistance || 0, status, imageUrl: imageBase64, aiVerification: aiResult,
          reason: reason || undefined
        };

        await saveRecord(record);
        setStep('result');
        localStorage.setItem('school_checkin_saved_staff_id', currentUser.id);
        setTimeout(() => onSuccess(), 2500);
      }
    }
  }, [currentUser, attendanceType, reason, currentDistance, activeFilterId, onSuccess]);

  if (step === 'info') {
    return (
      <div className="max-w-xl mx-auto relative mt-4">
        <div className="absolute -top-12 -left-12 text-7xl animate-float opacity-90 z-20 pointer-events-none">⛄</div>
        <div className="absolute -bottom-10 -right-10 text-7xl animate-sway opacity-90 z-20 pointer-events-none">🎅</div>
        <div className="relative overflow-hidden p-8 md:p-10 rounded-[2.5rem] shadow-[0_32px_80px_-20px_rgba(190,18,60,0.6)] border border-white/30 bg-gradient-to-br from-rose-800 via-red-700 to-amber-600 animate-shimmer-bg backdrop-blur-2xl">
          <div className="relative z-10 text-white">
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight drop-shadow-lg flex items-center justify-center gap-3">
                <span className="animate-sparkle text-amber-300 text-4xl">🎄</span> ยืนยันตัวตน
              </h2>
              <p className="text-rose-100 text-sm mt-2 font-bold opacity-90 tracking-wide">Season's Greetings 2026 ❄️</p>
            </div>

            {todayHoliday && (
                <div className="mb-8 p-4 bg-white/15 border border-white/20 rounded-3xl flex items-center justify-center gap-4 animate-pulse shadow-2xl backdrop-blur-md">
                     <span className="text-3xl">🎁</span>
                     <div className="text-center">
                         <p className="text-[10px] text-amber-200 uppercase tracking-widest font-black">Holiday Break</p>
                         <p className="text-xl font-black text-white drop-shadow-lg">{todayHoliday}</p>
                     </div>
                     <span className="text-3xl">🦌</span>
                </div>
            )}
            
            <div className="space-y-6">
              <div className="space-y-2">
                 <label className="block text-[10px] font-black text-amber-200 mb-1 ml-2 uppercase tracking-widest drop-shadow-md">รหัสบุคลากร (Staff ID)</label>
                 <div className="relative">
                    <input type="text" value={staffIdInput} onChange={(e) => setStaffIdInput(e.target.value.toUpperCase())}
                        className={`w-full px-4 py-5 rounded-3xl focus:ring-8 outline-none transition-all font-black text-2xl text-center tracking-[0.3em] shadow-2xl bg-white
                        ${currentUser ? 'text-emerald-700 border-4 border-emerald-400 focus:ring-emerald-400/30' : 'text-stone-700 border-4 border-amber-300 focus:border-amber-400 focus:ring-amber-400/50'}`}
                        placeholder="PJ..." maxLength={5} />
                    {currentUser && <div className="absolute right-5 top-1/2 -translate-y-1/2 text-emerald-500 animate-in zoom-in"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>}
                 </div>
              </div>

              {currentUser ? (
                <div className="animate-in slide-in-from-bottom-4 duration-700">
                    <div className="bg-white/10 p-5 rounded-3xl border border-white/20 backdrop-blur-xl mb-8 flex items-center gap-4 shadow-2xl">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 border-4 border-white flex items-center justify-center text-white font-black text-2xl shadow-lg relative overflow-hidden">
                            <div className="absolute -top-1 -right-1 text-xs">🎅</div>{currentUser.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl drop-shadow-md">{currentUser.name}</h3>
                            <p className="text-rose-100 text-sm font-bold opacity-90">{currentUser.role} 🎁</p>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-5">
                            <button onClick={() => { setAttendanceType('arrival'); setReason(''); }}
                                className={`relative p-5 rounded-[2rem] transition-all duration-300 flex flex-col items-center justify-center gap-2 border-4
                                ${attendanceType === 'arrival' ? 'bg-white border-emerald-400 text-emerald-800 shadow-[0_0_30px_rgba(52,211,153,0.5)] scale-110' : 'bg-black/30 border-white/10 text-white/80'}`}>
                                <div className={`p-4 rounded-2xl ${attendanceType === 'arrival' ? 'bg-emerald-100 text-emerald-600' : 'bg-white/10 text-white'}`}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.35 15.35l-3.3-3.3"/><path d="M9 12a3 3 0 1 0 6 0"/></svg></div>
                                <span className="font-black text-xl">มาทำงาน</span>
                            </button>
                            <button onClick={() => { setAttendanceType('departure'); setReason(''); }}
                                className={`relative p-5 rounded-[2rem] transition-all duration-300 flex flex-col items-center justify-center gap-2 border-4
                                ${attendanceType === 'departure' ? 'bg-white border-amber-400 text-amber-800 shadow-[0_0_30px_rgba(251,191,36,0.5)] scale-110' : 'bg-black/30 border-white/10 text-white/80'}`}>
                                <div className={`p-4 rounded-2xl ${attendanceType === 'departure' ? 'bg-amber-100 text-amber-600' : 'bg-white/10 text-white'}`}><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                                <span className="font-black text-xl">กลับบ้าน</span>
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                             <button onClick={() => { setAttendanceType('authorized_late'); setReason(''); }} className={`col-span-2 py-4 text-xs font-black rounded-2xl transition-all border-2 ${attendanceType === 'authorized_late' ? 'bg-white text-rose-700 border-white' : 'bg-white/10 text-white'}`}>⏰ ขออนุญาตเข้าสาย</button>
                             <button onClick={() => { setAttendanceType('duty'); setReason(''); }} className={`py-3 text-[11px] font-black rounded-2xl transition-all border-2 ${attendanceType === 'duty' ? 'bg-white text-emerald-700 border-white' : 'bg-white/10 text-white'}`}>🏛️ ไปราชการ</button>
                             <button onClick={() => { setAttendanceType('sick_leave'); setReason(''); }} className={`py-3 text-[11px] font-black rounded-2xl transition-all border-2 ${attendanceType === 'sick_leave' ? 'bg-white text-amber-700 border-white' : 'bg-white/10 text-white'}`}>🤒 ลาป่วย</button>
                        </div>
                        {((attendanceType === 'departure' && (new Date().getHours() < 16)) || (attendanceType === 'arrival' && (new Date().getHours() >= 8)) || ['duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(attendanceType)) && (
                            <div className="p-5 rounded-[2rem] bg-white border-4 border-amber-200"><label className="block text-[11px] font-black mb-3 uppercase tracking-widest text-rose-700">📝 รายละเอียดเพิ่มเติม</label>
                                <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full p-4 bg-rose-50 border-2 border-rose-100 rounded-2xl outline-none text-stone-800 font-bold text-sm" placeholder="ระบุเหตุผลหรือสถานที่..." rows={2} />
                            </div>
                        )}
                        {locationError && <div className="p-4 bg-white text-rose-600 rounded-[2rem] text-xs font-black flex items-center gap-3 border-4 border-rose-200 shadow-2xl"><span className="text-2xl animate-bounce">📍</span><span>{locationError}</span></div>}
                        <button onClick={() => { setLocationError(''); setIsValidating(true); validateLocation().then(l => { setIsValidating(false); if(l) setStep('camera'); }); }} disabled={isValidating} className="w-full py-5 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-[2rem] font-black text-lg shadow-xl hover:-translate-y-1 active:scale-95 transition-all">
                            {isValidating ? 'กำลังตรวจสอบพิกัด... ❄️' : 'ถ่ายภาพยืนยันตัวตน 🎄'}
                        </button>
                    </div>
                </div>
              ) : <div className="text-center p-8 border-4 border-dashed border-white/20 rounded-[2rem] bg-white/5 backdrop-blur-md"><p className="text-rose-100 font-black tracking-widest animate-pulse">Merry Christmas & Happy New Year 2026 🎁</p></div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'camera') {
    return (
      <div className="max-w-md mx-auto bg-stone-900 rounded-[3rem] overflow-hidden shadow-2xl relative border-[12px] border-white ring-4 ring-rose-100">
        <video ref={videoRef} autoPlay playsInline className="w-full h-[650px] object-cover" style={{ filter: CAMERA_FILTERS.find(f => f.id === activeFilterId)?.css || 'none' }} />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-x-0 bottom-0 p-10 bg-gradient-to-t from-black flex flex-col items-center z-20">
          <div className="flex gap-4 overflow-x-auto pb-8 justify-center w-full">
            {CAMERA_FILTERS.map(f => (
                <button key={f.id} onClick={() => setActiveFilterId(f.id)} className={`flex flex-col items-center gap-2 min-w-[60px] transition-all ${activeFilterId === f.id ? 'scale-110 opacity-100' : 'opacity-60'}`}>
                    <div className="w-12 h-12 rounded-full border-2 border-white" style={{ backgroundColor: f.color }} />
                    <span className="text-[10px] text-white font-black uppercase">{f.name}</span>
                </button>
            ))}
          </div>
          <button onClick={capturePhoto} className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 backdrop-blur-md flex items-center justify-center group active:scale-90 transition-all">
             <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center"><div className="w-6 h-6 rounded-full bg-rose-600" /></div>
          </button>
        </div>
        <div className="absolute top-10 left-0 right-0 flex justify-center z-10">
            <div className="bg-black/50 backdrop-blur-md px-6 py-2 rounded-full text-white text-[10px] font-black tracking-widest border border-white/20">DISTANCE: {currentDistance ? Math.round(currentDistance) : '...'} M ❄️</div>
        </div>
      </div>
    );
  }

  if (step === 'verifying') {
    return (
      <div className="max-w-md mx-auto p-12 bg-white rounded-[3.5rem] shadow-2xl text-center h-[450px] flex flex-col items-center justify-center border-8 border-rose-50">
          <div className="w-40 h-40 border-8 border-t-rose-600 rounded-full animate-spin mb-10" />
          <h3 className="text-3xl font-black text-slate-800">AI Santa Verifying</h3>
          <p className="text-slate-400 font-bold uppercase tracking-widest mt-2">Checking your festive face... ❄️</p>
      </div>
    );
  }

  if (step === 'result') {
    return (
      <div className="max-w-md mx-auto p-12 bg-white rounded-[3.5rem] shadow-2xl text-center h-[450px] flex flex-col items-center justify-center border-8 border-emerald-50 animate-in zoom-in">
          <div className="w-28 h-28 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-8"><svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h3 className="text-4xl font-black text-slate-800">DONE! 🎉</h3>
          <p className="text-slate-500 font-black text-lg mt-2">Identity Verified 🦌</p>
          <p className="text-xs text-emerald-400 font-bold mt-4 uppercase tracking-widest">Happy New Year 2026!</p>
      </div>
    );
  }
  return null;
};

export default CheckInForm;
