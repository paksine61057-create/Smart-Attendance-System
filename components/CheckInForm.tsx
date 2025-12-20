
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
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [isValidating, setIsValidating] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState('normal');
  const [todayHoliday, setTodayHoliday] = useState<string | null>(null);
  
  const isEarlyDeparture = useCallback(() => {
    if (attendanceType !== 'departure') return false;
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(16, 0, 0, 0);
    return now < targetTime;
  }, [attendanceType]);

  const isLateArrival = useCallback(() => {
    if (attendanceType !== 'arrival') return false;
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(8, 1, 0, 0);
    return now >= targetTime;
  }, [attendanceType]);

  const isSpecialRequest = useCallback(() => {
      return ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(attendanceType);
  }, [attendanceType]);
  
  const isAuthorizedLate = useCallback(() => {
      return attendanceType === 'authorized_late';
  }, [attendanceType]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const initSettings = async () => {
        await syncSettingsFromCloud();
        setSettings(getSettings());
    };
    initSettings();

    const savedId = localStorage.getItem('school_checkin_saved_staff_id');
    if (savedId) setStaffIdInput(savedId);

    const holiday = getHoliday(new Date());
    setTodayHoliday(holiday);
  }, []);

  useEffect(() => {
    if (staffIdInput.length >= 5) {
        const staff = getStaffById(staffIdInput);
        if (staff) setCurrentUser(staff);
        else setCurrentUser(null);
    } else {
        setCurrentUser(null);
    }
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
    return () => stream?.getTracks().forEach(track => track.stop());
  }, [step]);

  const validateLocation = async () => {
    await syncSettingsFromCloud();
    const currentSettings = getSettings();
    setSettings(currentSettings);

    if (isSpecialRequest()) {
         try {
             const positionPromise = getCurrentPosition();
             const timeoutPromise = new Promise<GeolocationPosition>((_, reject) => setTimeout(() => reject(new Error("GPS Timeout")), 3000));
             const position = await Promise.race([positionPromise, timeoutPromise]);
             return { lat: position.coords.latitude, lng: position.coords.longitude };
         } catch (e) {
             return { lat: 0, lng: 0 };
         }
    }

    if (!currentSettings?.officeLocation) {
      setLocationError("ระบบยังไม่ได้รับการตั้งค่าพิกัดห้องบุคคล");
      return false;
    }
    
    try {
      const position = await getCurrentPosition();
      const dist = getDistanceFromLatLonInMeters(
        position.coords.latitude,
        position.coords.longitude,
        currentSettings.officeLocation.lat,
        currentSettings.officeLocation.lng
      );
      setCurrentDistance(dist);
      
      if (dist > currentSettings.maxDistanceMeters) {
        setLocationError(`ห่างจากจุดเช็คอิน ${Math.round(dist)} ม. (จำกัด ${currentSettings.maxDistanceMeters} ม.)`);
        return false;
      }
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch (err) {
      setLocationError("ไม่สามารถระบุตำแหน่ง GPS ได้");
      return false;
    }
  };

  const handleStartCheckIn = async () => {
    setLocationError('');
    if (!currentUser) {
      alert("กรุณาระบุรหัสบุคลากร");
      return;
    }
    
    localStorage.setItem('school_checkin_saved_staff_id', currentUser.id);

    if ((isEarlyDeparture() || isLateArrival() || isSpecialRequest() || isAuthorizedLate()) && !reason.trim()) {
      alert("กรุณาระบุเหตุผลหรือรายละเอียด");
      return;
    }

    setIsValidating(true);
    try {
        const loc = await validateLocation();
        if (loc) setStep('camera');
    } finally {
        setIsValidating(false);
    }
  };

  const capturePhoto = useCallback(async () => {
    if (videoRef.current && canvasRef.current && currentUser) {
      const context = canvasRef.current.getContext('2d');
      const video = videoRef.current;
      
      if (context && video.videoWidth) {
        // [IMPORTANT] ปรับปรุงขนาดภาพให้เป็น "Safe-Resolution" (280px)
        // เพื่อให้รหัส Base64 มีความยาวไม่เกิน 50,000 อักขระ ป้องกัน Google Sheets ตัดทอนข้อมูล
        const TARGET_WIDTH = 280;
        const scale = TARGET_WIDTH / video.videoWidth;
        const width = TARGET_WIDTH;
        const height = video.videoHeight * scale;

        canvasRef.current.width = width;
        canvasRef.current.height = height;
        
        // ล้างค่าฟิลเตอร์ก่อนวาดใหม่
        context.filter = 'none';
        const activeFilter = CAMERA_FILTERS.find(f => f.id === activeFilterId);
        if (activeFilter && activeFilter.id !== 'normal') {
          context.filter = activeFilter.css;
        }
        
        context.drawImage(video, 0, 0, width, height);
        
        // ใช้คุณภาพ 0.35 เพื่อให้ภาพยังดูดีแต่ขนาดไฟล์เล็กมากพอที่จะบันทึกได้อย่างปลอดภัย
        const imageBase64 = canvasRef.current.toDataURL('image/jpeg', 0.35);
        
        setCapturedImage(imageBase64);
        setStep('verifying');
        
        const aiPromise = analyzeCheckInImage(imageBase64);
        const locPromise = validateLocation(); 
        const [aiResult, loc] = await Promise.all([aiPromise, locPromise]);
        
        if (!loc && !isSpecialRequest()) {
            setStep('camera');
            return; 
        }
        
        const now = new Date();
        let status: any = 'Normal';

        if (attendanceType === 'arrival') {
            const startOfWork = new Date();
            startOfWork.setHours(8, 1, 0, 0);
            status = now >= startOfWork ? 'Late' : 'On Time';
        } else if (attendanceType === 'departure') {
            const endOfWork = new Date();
            endOfWork.setHours(16, 0, 0, 0);
            status = now < endOfWork ? 'Early Leave' : 'Normal';
        } else if (attendanceType === 'duty') status = 'Duty';
        else if (attendanceType === 'sick_leave') status = 'Sick Leave';
        else if (attendanceType === 'personal_leave') status = 'Personal Leave';
        else if (attendanceType === 'other_leave') status = 'Other Leave';
        else if (attendanceType === 'authorized_late') status = 'Authorized Late';

        const record: CheckInRecord = {
          id: crypto.randomUUID(),
          staffId: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          type: attendanceType,
          reason: (isEarlyDeparture() || isLateArrival() || isSpecialRequest() || isAuthorizedLate()) ? reason : undefined,
          timestamp: now.getTime(),
          location: (loc || { lat: 0, lng: 0 }) as GeoLocation,
          distanceFromBase: currentDistance || 0,
          status,
          imageUrl: imageBase64,
          aiVerification: aiResult
        };

        await saveRecord(record);
        setStep('result');
        setTimeout(() => onSuccess(), 2500);
      }
    }
  }, [currentUser, attendanceType, reason, currentDistance, isEarlyDeparture, isLateArrival, isSpecialRequest, isAuthorizedLate, validateLocation, onSuccess, activeFilterId]);

  if (step === 'info') {
    return (
      <div className="max-w-xl mx-auto relative mt-0 md:mt-4">
        {/* Decorative Elements */}
        <div className="absolute -top-10 -left-6 md:-top-12 md:-left-12 text-5xl md:text-7xl animate-float opacity-90 z-20 pointer-events-none">⛄</div>
        <div className="absolute -bottom-8 -right-6 md:-bottom-10 md:-right-10 text-5xl md:text-7xl animate-sway opacity-90 z-20 pointer-events-none">🎅</div>

        {/* Festive Gift Card Style */}
        <div className="relative overflow-hidden p-6 md:p-10 rounded-[2.5rem] shadow-[0_32px_80px_-20px_rgba(190,18,60,0.6)] border border-white/30 bg-gradient-to-br from-rose-800 via-red-700 to-amber-600 animate-shimmer-bg backdrop-blur-2xl">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-400/10 rounded-full -ml-24 -mb-24 blur-3xl"></div>
          
          <div className="relative z-10 text-white">
            <div className="text-center mb-6 md:mb-8">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight drop-shadow-lg flex items-center justify-center gap-3">
                <span className="animate-sparkle text-amber-300 text-4xl">🎄</span> ยืนยันตัวตน
              </h2>
              <p className="text-rose-100 text-sm md:text-base mt-2 font-bold opacity-90 tracking-wide">Season's Greetings 2026 ❄️</p>
            </div>

            {todayHoliday && (
                <div className="mb-8 p-4 bg-white/15 border border-white/20 rounded-3xl flex items-center justify-center gap-4 animate-pulse shadow-2xl backdrop-blur-md">
                     <span className="text-3xl">🎁</span>
                     <div className="text-center">
                         <p className="text-[10px] text-amber-200 uppercase tracking-[0.2em] font-black">Holiday Break</p>
                         <p className="text-lg md:text-xl font-black text-white drop-shadow-lg">{todayHoliday}</p>
                     </div>
                     <span className="text-3xl">🦌</span>
                </div>
            )}
            
            <div className="space-y-6">
              <div className="space-y-2">
                 <label className="block text-[10px] md:text-xs font-black text-amber-200 mb-1 ml-2 uppercase tracking-[0.25em] drop-shadow-md">รหัสบุคลากร (Staff ID)</label>
                 <div className="relative">
                    <input 
                        type="text" 
                        value={staffIdInput}
                        onChange={(e) => setStaffIdInput(e.target.value.toUpperCase())}
                        className={`w-full px-4 py-4 md:py-5 rounded-3xl focus:ring-8 outline-none transition-all font-black text-2xl text-center tracking-[0.3em] shadow-2xl bg-white
                        ${currentUser 
                            ? 'text-emerald-700 border-4 border-emerald-400 focus:ring-emerald-400/30' 
                            : 'text-stone-700 border-4 border-amber-300 focus:border-amber-400 focus:ring-amber-400/50 placeholder-stone-300'}`}
                        placeholder="PJ..."
                        maxLength={5}
                    />
                    {currentUser && (
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 text-emerald-500 animate-in zoom-in drop-shadow-md">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                    )}
                 </div>
              </div>

              {currentUser ? (
                <div className="animate-in slide-in-from-bottom-4 fade-in duration-700">
                    <div className="bg-white/10 p-5 rounded-3xl border border-white/20 backdrop-blur-xl mb-8 flex items-center gap-4 shadow-2xl ring-1 ring-white/10">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 border-4 border-white flex items-center justify-center text-white font-black text-2xl shadow-lg relative overflow-hidden">
                            <div className="absolute -top-1 -right-1 text-xs">🎅</div>
                            {currentUser.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl md:text-2xl drop-shadow-md tracking-tight">{currentUser.name}</h3>
                            <p className="text-rose-100 text-sm font-bold opacity-90">{currentUser.role} 🎁</p>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-5">
                            <button
                                onClick={() => { setAttendanceType('arrival'); setReason(''); }}
                                className={`relative p-5 rounded-[2rem] transition-all duration-300 flex flex-col items-center justify-center gap-2 group overflow-hidden border-4
                                ${attendanceType === 'arrival' 
                                    ? 'bg-white border-emerald-400 text-emerald-800 shadow-[0_0_30px_rgba(52,211,153,0.5)] scale-110 z-10' 
                                    : 'bg-black/30 border-white/10 text-white/80 hover:bg-black/40 hover:text-white hover:border-white/30'
                                }`}
                            >
                                <div className={`p-4 rounded-2xl ${attendanceType === 'arrival' ? 'bg-emerald-100 text-emerald-600' : 'bg-white/10 text-white'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.35 15.35l-3.3-3.3"/><path d="M9 12a3 3 0 1 0 6 0"/></svg>
                                </div>
                                <span className="font-black text-xl">มาทำงาน</span>
                            </button>

                            <button
                                onClick={() => { setAttendanceType('departure'); setReason(''); }}
                                className={`relative p-5 rounded-[2rem] transition-all duration-300 flex flex-col items-center justify-center gap-2 group overflow-hidden border-4
                                ${attendanceType === 'departure' 
                                    ? 'bg-white border-amber-400 text-amber-800 shadow-[0_0_30px_rgba(251,191,36,0.5)] scale-110 z-10 animate-pulse-ring-festive' 
                                    : 'bg-black/30 border-white/10 text-white/80 hover:bg-black/40 hover:text-white hover:border-white/30'
                                }`}
                            >
                                <div className={`p-4 rounded-2xl ${attendanceType === 'departure' ? 'bg-amber-100 text-amber-600' : 'bg-white/10 text-white'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                </div>
                                <span className="font-black text-xl">กลับบ้าน</span>
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                             <button
                                onClick={() => { setAttendanceType('authorized_late'); setReason(''); }}
                                className={`col-span-2 py-4 text-xs font-black rounded-2xl transition-all border-2 flex items-center justify-center gap-2 ${
                                    attendanceType === 'authorized_late' 
                                    ? 'bg-white text-rose-700 border-white shadow-xl transform scale-105' 
                                    : 'bg-white/10 text-white/90 border-white/10 hover:bg-white/20'
                                }`}
                             >
                                 ⏰ ขออนุญาตเข้าสาย
                             </button>
                             <button
                                onClick={() => { setAttendanceType('duty'); setReason(''); }}
                                className={`py-3 text-[11px] font-black rounded-2xl transition-all border-2 ${
                                    attendanceType === 'duty' ? 'bg-white text-emerald-700 border-white' : 'bg-white/10 text-white/80 border-white/10'
                                }`}
                             >
                                 🏛️ ไปราชการ
                             </button>
                             <button
                                onClick={() => { setAttendanceType('sick_leave'); setReason(''); }}
                                className={`py-3 text-[11px] font-black rounded-2xl transition-all border-2 ${
                                    attendanceType === 'sick_leave' ? 'bg-white text-amber-700 border-white' : 'bg-white/10 text-white/80 border-white/10'
                                }`}
                             >
                                 🤒 ลาป่วย
                             </button>
                        </div>

                        {((attendanceType === 'departure' && isEarlyDeparture()) || 
                          (attendanceType === 'arrival' && isLateArrival()) ||
                          isSpecialRequest() || 
                          isAuthorizedLate()) && (
                            <div className="animate-in fade-in slide-in-from-top-4 p-5 rounded-[2rem] bg-white shadow-2xl border-4 border-amber-200">
                                <label className="block text-[11px] font-black mb-3 uppercase tracking-widest text-rose-700">
                                    {isSpecialRequest() ? '📝 รายละเอียดการลา / ราชการ' : '⚠️ ระบุเหตุผล'}
                                </label>
                                <textarea 
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="w-full p-4 bg-rose-50 border-2 border-rose-100 rounded-2xl outline-none focus:ring-4 focus:ring-rose-200 text-stone-800 font-bold text-sm"
                                    placeholder="ระบุที่นี่..."
                                    rows={2}
                                />
                            </div>
                        )}

                        {locationError && (
                            <div className="p-4 bg-white text-rose-600 rounded-[2rem] text-xs font-black flex items-center gap-3 border-4 border-rose-200 shadow-2xl">
                                <span className="text-2xl animate-bounce">📍</span>
                                <span>{locationError}</span>
                            </div>
                        )}

                        <button 
                            onClick={handleStartCheckIn}
                            disabled={isValidating}
                            className="w-full py-5 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-[2rem] font-black text-lg tracking-wider shadow-[0_15px_40px_-10px_rgba(245,158,11,0.6)] hover:shadow-[0_20px_50px_-10px_rgba(245,158,11,0.8)] hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all duration-300 mt-4 border-4 border-white/50 disabled:opacity-80"
                        >
                            {isValidating ? (
                                <span className="flex items-center justify-center gap-3 animate-pulse">
                                    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    กำลังนำทางขั้วโลกเหนือ...
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-3">
                                    ถ่ายภาพยืนยันตัวตน ❄️
                                </span>
                            )}
                        </button>
                    </div>
                </div>
              ) : (
                <div className="text-center p-8 border-4 border-dashed border-white/20 rounded-[2rem] bg-white/5 backdrop-blur-md">
                    <p className="text-rose-100 font-black text-base drop-shadow-md tracking-widest animate-pulse">Merry Christmas & Happy New Year 🎁</p>
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
      <div className="max-w-md mx-auto bg-stone-900 rounded-[3rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] relative border-[12px] border-white ring-4 ring-rose-100">
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-[650px] object-cover opacity-95 transition-all duration-300" 
            style={{ filter: CAMERA_FILTERS.find(f => f.id === activeFilterId)?.css || 'none' }}
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {isCameraLoading && (
            <div className="absolute inset-0 bg-stone-900 flex flex-col items-center justify-center text-white z-20">
                <div className="w-16 h-16 border-8 border-white/20 border-t-rose-500 rounded-full animate-spin mb-6"></div>
                <p className="font-black text-lg tracking-widest animate-pulse">READY FOR HOLIDAY? 🎄</p>
            </div>
        )}
        
        <div className="absolute inset-0 pointer-events-none z-10">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-88 border-4 border-white/30 rounded-[3rem] shadow-[0_0_50px_rgba(255,255,255,0.2)]"></div>
        </div>

        <div className="absolute top-10 left-0 right-0 flex justify-center flex-col items-center gap-3 z-10">
           <div className="bg-rose-600/60 backdrop-blur-xl px-6 py-2.5 rounded-full text-white text-xs font-black shadow-2xl border-2 border-white/30 flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full animate-pulse ${attendanceType === 'arrival' ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              {attendanceType.toUpperCase()} MODE ❄️
           </div>
           {currentUser && (
               <div className="text-white font-black text-sm bg-black/50 px-5 py-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-lg">{currentUser.name} 🎅</div>
           )}
        </div>

        <div className="absolute bottom-40 left-0 right-0 z-30 px-4">
             <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide justify-center px-4">
                 {CAMERA_FILTERS.map((filter) => (
                     <button
                        key={filter.id}
                        type="button"
                        onClick={() => setActiveFilterId(filter.id)}
                        className={`flex flex-col items-center gap-2 min-w-[60px] transition-all duration-300 cursor-pointer ${activeFilterId === filter.id ? 'scale-125' : 'opacity-60 hover:opacity-100'}`}
                     >
                        <div className={`w-14 h-14 rounded-full border-4 overflow-hidden shadow-2xl relative ${activeFilterId === filter.id ? 'border-amber-400 ring-4 ring-amber-400/30' : 'border-white'}`} style={{ backgroundColor: filter.color }}>
                             {activeFilterId === filter.id && filter.id !== 'normal' && (
                                 <span className="absolute inset-0 flex items-center justify-center text-lg animate-sparkle">✨</span>
                             )}
                        </div>
                        <span className="text-[10px] text-white font-black bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-md uppercase tracking-widest">{filter.name}</span>
                     </button>
                 ))}
             </div>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-10 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col items-center pb-14 z-20">
          {!isSpecialRequest() && (
              <p className="text-white/80 mb-8 text-xs font-black tracking-[0.2em] bg-white/10 px-6 py-2 rounded-full backdrop-blur-xl border-2 border-white/10">
                DIST: <span className="font-black text-amber-300 text-lg">{currentDistance ? Math.round(currentDistance) : '...'}</span> M
              </p>
          )}
          <button 
            onClick={capturePhoto}
            className="w-24 h-24 rounded-full bg-white/20 border-4 border-white/40 backdrop-blur-md flex items-center justify-center group active:scale-90 transition-all duration-100"
          >
             <div className="w-18 h-18 rounded-full bg-white shadow-[0_0_40px_rgba(255,255,255,0.4)] group-hover:scale-95 transition-transform duration-300 flex items-center justify-center">
                 <div className="w-8 h-8 rounded-full bg-rose-600 animate-pulse"></div>
             </div>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'verifying') {
    return (
      <div className="max-w-md mx-auto p-1.5 bg-gradient-to-br from-rose-300 via-white to-amber-200 rounded-[3.5rem] shadow-2xl overflow-hidden relative">
        <div className="bg-white p-12 rounded-[3.3rem] text-center h-[450px] flex flex-col items-center justify-center border-8 border-rose-50 relative">
            <div className="absolute -top-4 -right-4 text-6xl animate-sway">🎅</div>
            <div className="relative w-40 h-40 mx-auto mb-12">
               <div className="absolute inset-0 border-8 border-rose-50 rounded-full"></div>
               <div className="absolute inset-0 border-8 border-t-rose-600 border-r-amber-400 border-b-emerald-400 border-l-transparent rounded-full animate-spin"></div>
               <div className="absolute inset-6 bg-rose-50 rounded-full flex items-center justify-center">
                   <span className="text-4xl animate-bounce">🎁</span>
               </div>
            </div>
            <h3 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">AI Santa Verifying</h3>
            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Checking your festive face... ❄️</p>
        </div>
      </div>
    );
  }

  if (step === 'result') {
    return (
      <div className="max-w-md mx-auto p-2 bg-gradient-to-br from-emerald-200 via-white to-teal-200 rounded-[3.5rem] shadow-2xl animate-in zoom-in duration-500 overflow-hidden relative">
        <div className="bg-white p-12 rounded-[3.3rem] text-center h-[450px] flex flex-col items-center justify-center border-8 border-emerald-50 relative">
          <div className="absolute -bottom-4 -left-4 text-7xl animate-float">⛄</div>
          <div className="absolute -top-4 -right-4 text-5xl animate-sparkle">🎁</div>
          <div className="w-28 h-28 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h3 className="text-4xl font-black text-slate-800 mb-3 tracking-tight">DONE! 🎉</h3>
          <p className="text-slate-500 font-black text-lg">Happy New Year 2026!</p>
          {currentUser && (
            <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm">
                <p className="text-emerald-600 font-black text-2xl drop-shadow-sm">{currentUser.name} 🦌</p>
                <p className="text-xs text-emerald-400 font-bold mt-1 uppercase tracking-widest">Successfully Verified ❄️</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default CheckInForm;
