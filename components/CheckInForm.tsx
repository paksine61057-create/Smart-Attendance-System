
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppSettings, GeoLocation, CheckInRecord, AttendanceType, Staff } from '../types';
import { getCurrentPosition, getDistanceFromLatLonInMeters, getAccuratePosition } from '../services/geoService';
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
  const [locationStatus, setLocationStatus] = useState<'idle' | 'checking' | 'found' | 'error'>('idle');
  const [locationError, setLocationError] = useState<React.ReactNode>(null);
  const [lastLocation, setLastLocation] = useState<GeoLocation | null>(null);
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState('normal');
  const [todayHoliday, setTodayHoliday] = useState<string | null>(null);
  const [isBypassMode, setIsBypassMode] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isRestrictedType = ['arrival', 'departure', 'authorized_late'].includes(attendanceType);

  useEffect(() => {
    const init = async () => {
        await syncSettingsFromCloud();
        const s = getSettings();
        setIsBypassMode(!!s.bypassLocation);
        
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

  const validateLocation = async () => {
    // หากเปิดโหมด Bypass ให้ถือว่าพิกัดข้ามไปเลย ไม่ต้องเรียกขอสิทธิ์ GPS
    if (isBypassMode) {
        setLocationStatus('found');
        return { lat: 0, lng: 0 };
    }

    setLocationStatus('checking');
    setLocationError(null);
    
    const s = getSettings();
    if (!s.officeLocation || !s.officeLocation.lat) {
        setLocationStatus('found');
        return { lat: 0, lng: 0 };
    }

    try {
      const pos = await getAccuratePosition(3); 
      const dist = getDistanceFromLatLonInMeters(
        pos.coords.latitude, pos.coords.longitude, 
        s.officeLocation.lat, s.officeLocation.lng
      );
      
      setLastLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setCurrentDistance(dist);
      setCurrentAccuracy(pos.coords.accuracy);

      const buffer = pos.coords.accuracy / 2;
      const adjustedDist = Math.max(0, dist - buffer);

      if (isRestrictedType && adjustedDist > s.maxDistanceMeters) {
          setLocationStatus('error');
          setLocationError(
            <div className="space-y-3">
                <p className="font-black text-rose-300">อยู่นอกเขตโรงเรียน!</p>
                <div className="bg-black/20 p-3 rounded-2xl space-y-1 text-left border border-white/10">
                    <p className="text-[10px] text-white/40 uppercase">ข้อมูลการตรวจสอบ:</p>
                    <p className="text-sm">ห่างจากจุดหมาย: <span className="text-rose-400 font-black">{Math.round(dist).toLocaleString()} เมตร</span></p>
                    <p className="text-xs">ค่าความแม่นยำ GPS: +/- {Math.round(pos.coords.accuracy)} ม.</p>
                </div>
            </div>
          );
          return null;
      }

      setLocationStatus('found');
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (err: any) {
      setLocationStatus('error');
      setLocationError(err.message || "ไม่สามารถดึงข้อมูลพิกัดได้");
      return null;
    }
  };

  const startCameraStep = async () => {
    if (isBypassMode) {
        // หากเป็นโหมด Bypass ให้ไปหน้ากล้องทันที
        setStep('camera');
    } else {
        const loc = await validateLocation();
        if (loc) {
            setStep('camera');
        }
    }
  };

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

  const capturePhoto = useCallback(async () => {
    if (videoRef.current && canvasRef.current && currentUser) {
      const context = canvasRef.current.getContext('2d');
      const video = videoRef.current;
      if (context && video.videoWidth) {
        const TARGET_WIDTH = 160; 
        const scale = TARGET_WIDTH / video.videoWidth;
        canvasRef.current.width = TARGET_WIDTH;
        canvasRef.current.height = video.videoHeight * scale;
        
        const filter = CAMERA_FILTERS.find(f => f.id === activeFilterId);
        context.filter = filter?.css || 'none';
        context.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        const imageBase64 = canvasRef.current.toDataURL('image/jpeg', 0.3); 
        setStep('verifying');
        
        const aiResult = await analyzeCheckInImage(imageBase64);
        
        const now = new Date();
        let status: any = 'Normal';
        
        if (attendanceType === 'arrival') {
            const limit = new Date(); limit.setHours(8, 1, 0, 0);
            status = now >= limit ? 'Late' : 'On Time';
        } else if (attendanceType === 'departure') {
            const limit = new Date(); limit.setHours(16, 0, 0, 0);
            status = now < limit ? 'Early Leave' : 'Normal';
        } else if (attendanceType === 'authorized_late') {
            status = 'Authorized Late';
        } else if (attendanceType === 'duty') {
            status = 'Duty';
        } else if (attendanceType === 'sick_leave') {
            status = 'Sick Leave';
        } else if (attendanceType === 'personal_leave') {
            status = 'Personal Leave';
        } else {
            status = attendanceType.replace('_', ' ').split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        }

        const record: CheckInRecord = {
          id: crypto.randomUUID(), 
          staffId: currentUser.id, 
          name: currentUser.name, 
          role: currentUser.role,
          type: attendanceType, 
          timestamp: now.getTime(), 
          location: (lastLocation || { lat: 0, lng: 0 }),
          distanceFromBase: currentDistance || 0, 
          status, 
          imageUrl: imageBase64, 
          aiVerification: aiResult,
          reason: reason || undefined
        };

        await saveRecord(record);
        setStep('result');
        localStorage.setItem('school_checkin_saved_staff_id', currentUser.id);
        setTimeout(() => onSuccess(), 2500);
      }
    }
  }, [currentUser, attendanceType, reason, lastLocation, currentDistance, activeFilterId, onSuccess]);

  if (step === 'info') {
    const isSpecialType = ['duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(attendanceType);

    return (
      <div className="max-w-xl mx-auto relative mt-4">
        <div className="absolute -top-12 -left-12 text-7xl animate-float opacity-90 z-20 pointer-events-none">⛄</div>
        <div className="absolute -bottom-10 -right-10 text-7xl animate-sway opacity-90 z-20 pointer-events-none">🎅</div>
        <div className="relative overflow-hidden p-8 md:p-10 rounded-[2.5rem] shadow-[0_32px_80px_-20px_rgba(190,18,60,0.6)] border border-white/30 bg-gradient-to-br from-rose-800 via-red-700 to-amber-600 animate-shimmer-bg backdrop-blur-2xl">
          <div className="relative z-10 text-white text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold flex items-center justify-center gap-3 drop-shadow-lg">
              <span className="animate-sparkle text-amber-300">🎄</span> ยืนยันตัวตน
            </h2>
            <p className="text-rose-100 text-sm mt-2 font-bold opacity-90 tracking-widest uppercase">Prachaksinlapakhom School ❄️</p>

            {todayHoliday && (
                <div className="my-8 p-6 bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 border-4 border-white/50 rounded-[2rem] flex items-center justify-center gap-5 animate-in zoom-in shadow-[0_20px_40px_-10px_rgba(251,191,36,0.5)]">
                     <span className="text-4xl animate-float">🏝️</span>
                     <div className="text-center">
                         <p className="text-[11px] text-white/90 uppercase font-black tracking-[0.2em] mb-1">ยินดีด้วย วันนี้คือวันหยุด</p>
                         <p className="text-2xl font-black text-white drop-shadow-md">{todayHoliday}</p>
                     </div>
                     <span className="text-4xl animate-sway">🍹</span>
                </div>
            )}
            
            <div className="mt-8 space-y-6">
              <div className="space-y-2">
                 <label className="block text-[10px] font-black text-amber-200 uppercase tracking-widest text-left ml-2">รหัสบุคลากร (Staff ID)</label>
                 <div className="relative">
                    <input type="text" value={staffIdInput} onChange={(e) => setStaffIdInput(e.target.value.toUpperCase())}
                        className={`w-full px-4 py-5 rounded-3xl focus:ring-8 outline-none transition-all font-black text-2xl text-center tracking-[0.3em] shadow-2xl bg-white
                        ${currentUser ? 'text-emerald-700 border-4 border-emerald-400' : 'text-stone-700 border-4 border-amber-300 focus:border-amber-400 focus:ring-amber-400/50'}`}
                        placeholder="PJ..." maxLength={5} />
                    {currentUser && <div className="absolute right-5 top-1/2 -translate-y-1/2 text-emerald-500 animate-in zoom-in"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>}
                 </div>
              </div>

              {currentUser && (
                <div className="animate-in slide-in-from-bottom-4 duration-700">
                    <div className="bg-white/10 p-5 rounded-3xl border border-white/20 backdrop-blur-xl mb-6 flex items-center gap-4 shadow-xl">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 border-4 border-white flex items-center justify-center font-black text-2xl shadow-lg relative overflow-hidden text-white">
                            {currentUser.name.charAt(0)}
                        </div>
                        <div className="text-left">
                            <h3 className="text-white font-black text-xl drop-shadow-md">{currentUser.name}</h3>
                            <p className="text-rose-100 text-sm font-bold opacity-90">{currentUser.role} 🎁</p>
                        </div>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="space-y-4">
                           <p className="text-[9px] font-black text-white/50 uppercase tracking-widest text-left ml-2">เลือกประเภทการลงเวลา (ลงชื่อได้ทุกที่)</p>
                           <div className="space-y-3">
                               <div className="grid grid-cols-2 gap-4">
                                   <button onClick={() => setAttendanceType('arrival')} className={`p-6 rounded-[2rem] border-4 transition-all duration-300 flex flex-col items-center justify-center gap-2 ${attendanceType === 'arrival' ? 'bg-white border-emerald-400 text-emerald-800 scale-105 shadow-2xl' : 'bg-black/20 border-white/10 text-white/60'}`}>
                                       <span className="text-2xl">🌅</span>
                                       <span className="font-black text-base">มาทำงาน</span>
                                   </button>
                                   <button onClick={() => setAttendanceType('departure')} className={`p-6 rounded-[2rem] border-4 transition-all duration-300 flex flex-col items-center justify-center gap-2 ${attendanceType === 'departure' ? 'bg-white border-rose-400 text-rose-800 scale-105 shadow-2xl' : 'bg-black/20 border-white/10 text-white/60'}`}>
                                       <span className="text-2xl">🏠</span>
                                       <span className="font-black text-base">กลับบ้าน</span>
                                   </button>
                               </div>
                               <button onClick={() => setAttendanceType('authorized_late')} className={`w-full p-5 rounded-[2rem] border-4 transition-all duration-300 flex items-center justify-center gap-4 ${attendanceType === 'authorized_late' ? 'bg-white border-amber-400 text-amber-800 scale-105 shadow-2xl' : 'bg-black/20 border-white/10 text-white/60'}`}>
                                   <span className="text-2xl">🕒</span>
                                   <div className="text-left">
                                      <span className="font-black text-base block">ขออนุญาตเข้าสาย</span>
                                      <span className="text-[9px] font-bold opacity-70 uppercase tracking-tighter">(กรณีได้รับอนุญาตจากผู้อำนวยการแล้ว)</span>
                                   </div>
                               </button>
                           </div>
                        </div>

                        <div className="space-y-3 pt-2">
                           <p className="text-[9px] font-black text-white/50 uppercase tracking-widest text-left ml-2">ลา / ไปราชการ</p>
                           <div className="grid grid-cols-3 gap-3">
                               <button onClick={() => setAttendanceType('duty')} className={`p-4 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center gap-1 ${attendanceType === 'duty' ? 'bg-white border-blue-400 text-blue-800 scale-105 shadow-xl' : 'bg-black/20 border-white/10 text-white/60'}`}>
                                   <span className="text-lg">🏛️</span>
                                   <span className="font-black text-[10px]">ไปราชการ</span>
                               </button>
                               <button onClick={() => setAttendanceType('sick_leave')} className={`p-4 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center gap-1 ${attendanceType === 'sick_leave' ? 'bg-white border-orange-400 text-orange-800 scale-105 shadow-xl' : 'bg-black/20 border-white/10 text-white/60'}`}>
                                   <span className="text-lg">🤒</span>
                                   <span className="font-black text-[10px]">ลาป่วย</span>
                               </button>
                               <button onClick={() => setAttendanceType('personal_leave')} className={`p-4 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center gap-1 ${attendanceType === 'personal_leave' ? 'bg-white border-red-400 text-red-800 scale-105 shadow-xl' : 'bg-black/20 border-white/10 text-white/60'}`}>
                                   <span className="text-lg">🙏</span>
                                   <span className="font-black text-[10px]">ลากิจ</span>
                               </button>
                           </div>
                        </div>

                        {(isSpecialType || (attendanceType === 'departure' && new Date().getHours() < 16) || (attendanceType === 'arrival' && new Date().getHours() >= 8)) && (
                            <div className="animate-in fade-in zoom-in">
                                <label className="block text-[9px] font-black text-amber-200 uppercase tracking-widest text-left ml-2 mb-2">โปรดระบุเหตุผล / รายละเอียด</label>
                                <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full p-4 bg-white border-4 border-amber-200 rounded-2xl outline-none text-stone-800 font-bold shadow-lg focus:ring-4 focus:ring-amber-400/30 transition-all" placeholder="พิมพ์เหตุผลที่นี่..." rows={2} />
                            </div>
                        )}

                        <div className="mt-4 p-4 bg-black/30 rounded-2xl border border-white/10 backdrop-blur-md">
                           {isBypassMode && (
                               <div className="flex items-center justify-center gap-2 text-blue-300 text-[10px] font-black uppercase bg-blue-900/40 p-3 rounded-xl border border-blue-500/30">
                                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                   โหมดลงเวลาพิเศษ: ถ่ายภาพเพื่อยืนยันตัวตน 📸
                               </div>
                           )}
                           
                           {!isBypassMode && locationStatus === 'checking' && (
                               <div className="flex items-center justify-center gap-3 text-white text-xs font-bold animate-pulse">
                                   <div className="w-4 h-4 border-2 border-t-amber-400 rounded-full animate-spin" />
                                   กำลังรอสัญญาณ GPS ที่แม่นยำ...
                               </div>
                           )}
                           {!isBypassMode && locationStatus === 'found' && (
                               <div className="flex items-center justify-between">
                                   <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase">
                                       <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                       พิกัดถูกต้อง
                                   </div>
                                   {currentDistance !== null && (
                                       <span className="text-white/60 text-[10px] font-bold tracking-widest">
                                           ห่าง {Math.round(currentDistance)} ม. (+/- {currentAccuracy ? Math.round(currentAccuracy) : 0})
                                       </span>
                                   )}
                               </div>
                           )}
                           {!isBypassMode && locationStatus === 'error' && (
                               <div className="text-rose-200 text-xs font-black text-center space-y-4">
                                   <div className="bg-rose-900/40 p-5 rounded-2xl border border-rose-400/30 text-left leading-relaxed">
                                       {locationError}
                                   </div>
                                   <button onClick={validateLocation} className="text-[10px] bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-full border border-white/20 transition-all uppercase tracking-widest font-black">ลองตรวจสอบพิกัดใหม่อีกครั้ง 🔄</button>
                               </div>
                           )}
                        </div>
                        
                        <button 
                            onClick={startCameraStep}
                            disabled={!isBypassMode && locationStatus === 'checking'}
                            className={`w-full py-5 rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all mt-4 flex items-center justify-center gap-3
                            ${!isBypassMode && locationStatus === 'error' && isRestrictedType ? 'bg-slate-500 opacity-50 cursor-not-allowed' : 'bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white animate-pulse-ring-festive'}`}
                        >
                            {(!isBypassMode && locationStatus === 'checking') ? 'กำลังค้นหาตำแหน่ง...' : 'ถ่ายรูปบันทึกเวลา 📸'}
                        </button>
                    </div>
                </div>
              )}
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
        <div className="absolute inset-x-0 bottom-0 p-10 bg-gradient-to-t from-black flex flex-col items-center">
          <div className="flex gap-4 overflow-x-auto pb-8 w-full justify-center">
            {CAMERA_FILTERS.map(f => (
                <button key={f.id} onClick={() => setActiveFilterId(f.id)} className={`flex flex-col items-center min-w-[60px] transition-all ${activeFilterId === f.id ? 'scale-110 opacity-100' : 'opacity-60'}`}>
                    <div className="w-10 h-10 rounded-full border-2 border-white shadow-lg" style={{ backgroundColor: f.color }} />
                    <span className="text-[9px] text-white font-bold mt-1 uppercase">{f.name}</span>
                </button>
            ))}
          </div>
          <button onClick={capturePhoto} className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 backdrop-blur-md flex items-center justify-center active:scale-90 transition-all shadow-2xl">
             <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-inner"><div className="w-6 h-6 rounded-full bg-rose-600 animate-pulse" /></div>
          </button>
        </div>
        <div className="absolute top-8 left-0 right-0 flex justify-center gap-3">
            <button onClick={() => setStep('info')} className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-white text-[10px] font-black border border-white/20 hover:bg-black/60 transition-all">ยกเลิก</button>
            {!isBypassMode && (
                <div className="bg-black/40 backdrop-blur-md px-6 py-2 rounded-full text-white text-[10px] font-black border border-white/20">
                    พิกัด: {currentDistance !== null ? `${Math.round(currentDistance)} ม.` : 'ตรวจแล้ว'} ❄️
                </div>
            )}
            {isBypassMode && (
                <div className="bg-blue-600/60 backdrop-blur-md px-6 py-2 rounded-full text-white text-[10px] font-black border border-white/20">
                    โหมดบันทึกภาพ 📸
                </div>
            )}
        </div>
      </div>
    );
  }

  if (step === 'verifying') return (
    <div className="max-w-md mx-auto p-20 bg-white/10 backdrop-blur-xl rounded-[3rem] text-white text-center flex flex-col items-center justify-center border-4 border-white/20 shadow-2xl">
        <div className="w-24 h-24 border-8 border-t-amber-400 rounded-full animate-spin mb-8" />
        <h3 className="text-3xl font-black text-amber-200">บันทึกข้อมูล...</h3>
        <p className="font-bold opacity-60 mt-2 uppercase tracking-widest text-xs">AI กำลังวิเคราะห์ภาพถ่ายของคุณ ❄️</p>
    </div>
  );
  
  if (step === 'result') return (
    <div className="max-w-md mx-auto p-20 bg-emerald-500 rounded-[3rem] text-white text-center flex flex-col items-center justify-center shadow-2xl animate-in zoom-in border-8 border-white">
        <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-8 animate-bounce"><svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
        <h3 className="text-5xl font-black">สำเร็จแล้ว!</h3>
        <p className="font-black text-xl mt-4 opacity-90 uppercase tracking-widest underline decoration-wavy">บันทึกข้อมูลเรียบร้อย 🦌</p>
    </div>
  );
  
  return null;
};

export default CheckInForm;
