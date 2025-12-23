
// Added React to the import to resolve namespace error
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppSettings, GeoLocation, CheckInRecord, AttendanceType, Staff } from '../types';
import { saveRecord, getSettings } from '../services/storageService';
import { analyzeCheckInImage } from '../services/geminiService';
import { getStaffById } from '../services/staffService';
import { getHoliday } from '../services/holidayService';
import { getAccuratePosition, getDistanceFromLatLonInMeters } from '../services/geoService';

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
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState('normal');
  const [todayHoliday, setTodayHoliday] = useState<string | null>(null);
  const [gpsLoadingMsg, setGpsLoadingMsg] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  // ข้อมูลพิกัดที่ดึงมาเตรียมไว้
  const [preFetchedLocation, setPreFetchedLocation] = useState<GeoLocation>({ lat: 0, lng: 0 });
  const [preFetchedDistance, setPreFetchedDistance] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const holiday = getHoliday(new Date());
    setTodayHoliday(holiday);
    const savedId = localStorage.getItem('school_checkin_saved_staff_id');
    if (savedId) setStaffIdInput(savedId);
  }, []);

  useEffect(() => {
    if (staffIdInput.length >= 5) {
        const staff = getStaffById(staffIdInput);
        setCurrentUser(staff || null);
    } else setCurrentUser(null);
  }, [staffIdInput]);

  // ฟังก์ชันเริ่มขั้นตอนถ่ายรูป (ตรวจสอบพิกัดก่อน)
  const startCameraStep = async () => {
    const settings = getSettings();
    const needsLocationCheck = ['arrival', 'departure', 'authorized_late'].includes(attendanceType);
    
    // หากเป็นโหมดออนไลน์ หรือประเภทงานที่ไม่ต้องการพิกัด ให้ข้ามไปหน้ากล้องทันที
    if (settings.locationMode === 'online' || !needsLocationCheck) {
        setStep('camera');
        return;
    }

    // หากเป็นโหมด GPS ให้เริ่มการดึงตำแหน่ง
    setIsLocating(true);
    
    try {
      // ดึงพิกัดที่แม่นยำที่สุดก่อนเปิดกล้อง
      const pos = await getAccuratePosition();
      const currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      
      const distance = getDistanceFromLatLonInMeters(
        currentPos.lat, currentPos.lng,
        settings.officeLocation.lat, settings.officeLocation.lng
      );
      
      if (distance > settings.maxDistanceMeters) {
        alert(`❌ อยู่นอกพื้นที่โรงเรียน!\nระยะห่างของคุณ: ${Math.round(distance)} เมตร\nระยะที่อนุญาต: ${settings.maxDistanceMeters} เมตร\n\nโปรดบันทึกเวลาภายในพื้นที่โรงเรียนเท่านั้น`);
        setIsLocating(false);
        return;
      }

      // เก็บค่าไว้ใช้ตอนบันทึกจริง
      setPreFetchedLocation(currentPos);
      setPreFetchedDistance(Math.round(distance));
      setStep('camera');
    } catch (e: any) {
      alert("❌ ไม่สามารถระบุพิกัดได้!\nโปรดตรวจสอบว่าเปิด GPS และอนุญาตสิทธิ์ตำแหน่งแล้ว");
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (step === 'camera') {
      setIsCameraLoading(true);
      const startCamera = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 }
            } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => setIsCameraLoading(false);
          }
        } catch (err) {
          alert("ไม่สามารถเปิดกล้องได้ โปรดอนุญาตสิทธิ์กล้องในเบราว์เซอร์");
          setIsCameraLoading(false);
          setStep('info');
        }
      };
      startCamera();
    }
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [step]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas && currentUser && video.videoWidth > 0) {
      const context = canvas.getContext('2d');
      if (context) {
        const TARGET_WIDTH = 320; 
        const scale = TARGET_WIDTH / video.videoWidth;
        canvas.width = TARGET_WIDTH;
        canvas.height = video.videoHeight * scale;
        
        const filter = CAMERA_FILTERS.find(f => f.id === activeFilterId);
        context.filter = filter?.css || 'none';
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.6); 
        
        setStep('verifying');
        setGpsLoadingMsg('กำลังวิเคราะห์ใบหน้าด้วย AI...');

        const aiResult = await analyzeCheckInImage(imageBase64);
        
        const now = new Date();
        let status: any = 'Normal';
        
        if (attendanceType === 'arrival') {
            const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 1, 0, 0);
            status = now.getTime() >= limit.getTime() ? 'Late' : 'On Time';
        } else if (attendanceType === 'departure') {
            const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0, 0);
            status = now.getTime() < limit.getTime() ? 'Early Leave' : 'Normal';
        } else if (attendanceType === 'authorized_late') {
            status = 'Authorized Late';
        } else if (['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(attendanceType)) {
            status = attendanceType.replace('_', ' ').split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        }

        const record: CheckInRecord = {
          id: crypto.randomUUID(), 
          staffId: currentUser.id, 
          name: currentUser.name, 
          role: currentUser.role,
          type: attendanceType, 
          timestamp: now.getTime(), 
          location: preFetchedLocation, 
          distanceFromBase: preFetchedDistance, 
          status, 
          imageUrl: imageBase64, 
          aiVerification: aiResult,
          reason: reason || undefined
        };

        await saveRecord(record);
        setStep('result');
        localStorage.setItem('school_checkin_saved_staff_id', currentUser.id);
        setTimeout(() => onSuccess(), 2000);
      }
    }
  }, [currentUser, attendanceType, reason, activeFilterId, onSuccess, preFetchedLocation, preFetchedDistance]);

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
              <div className="space-y-2 text-left">
                 <label className="block text-[10px] font-black text-amber-200 uppercase tracking-widest ml-2">รหัสบุคลากร (Staff ID)</label>
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
                           <p className="text-[9px] font-black text-white/50 uppercase tracking-widest text-left ml-2">เลือกประเภทการลงเวลา</p>
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
                                      <span className="text-[9px] font-bold opacity-70 uppercase tracking-tighter">(กรณีได้รับอนุญาตจากผู้บริหารแล้ว)</span>
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
                            <div className="animate-in fade-in zoom-in text-left">
                                <label className="block text-[9px] font-black text-amber-200 uppercase tracking-widest ml-2 mb-2">โปรดระบุเหตุผล / รายละเอียด</label>
                                <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full p-4 bg-white border-4 border-amber-200 rounded-2xl outline-none text-stone-800 font-bold shadow-lg focus:ring-4 focus:ring-amber-400/30 transition-all" placeholder="พิมพ์เหตุผลที่นี่..." rows={2} />
                            </div>
                        )}

                        <div className="mt-4 p-4 bg-blue-900/40 rounded-2xl border border-blue-500/30 backdrop-blur-md flex items-center justify-center gap-3">
                            <span className="text-blue-300 text-[11px] font-black uppercase tracking-widest flex items-center gap-2 text-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                {getSettings().locationMode === 'gps' ? 'ระบบจะตรวจสอบพิกัดโรงเรียนก่อนบันทึกเวลา 📍' : 'ระบบดึงพิกัดเพื่อบันทึกข้อมูลแบบออนไลน์ 🌐'}
                            </span>
                        </div>
                        
                        <button 
                            onClick={startCameraStep}
                            disabled={isLocating}
                            className={`w-full py-5 rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all mt-4 flex items-center justify-center gap-3 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white animate-pulse-ring-festive disabled:opacity-80`}
                        >
                            {isLocating ? (
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 border-3 border-t-white border-white/20 rounded-full animate-spin" />
                                กำลังตรวจสอบตำแหน่ง...
                              </div>
                            ) : 'ถ่ายรูปบันทึกเวลา 📸'}
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
        <div className="relative w-full h-[650px] bg-stone-800">
            {isCameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 bg-stone-900">
                    <div className="w-12 h-12 border-4 border-t-rose-500 border-white/20 rounded-full animate-spin mb-4" />
                    <p className="font-bold text-xs uppercase tracking-widest">กำลังเปิดกล้อง...</p>
                </div>
            )}
            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover" 
                style={{ filter: CAMERA_FILTERS.find(f => f.id === activeFilterId)?.css || 'none' }} 
            />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        
        <div className="absolute inset-x-0 bottom-0 p-10 bg-gradient-to-t from-black flex flex-col items-center z-20">
          <div className="flex gap-4 overflow-x-auto pb-8 w-full justify-center scrollbar-hide">
            {CAMERA_FILTERS.map(f => (
                <button key={f.id} onClick={() => setActiveFilterId(f.id)} className={`flex flex-col items-center min-w-[60px] transition-all ${activeFilterId === f.id ? 'scale-110 opacity-100' : 'opacity-60'}`}>
                    <div className="w-10 h-10 rounded-full border-2 border-white shadow-lg" style={{ backgroundColor: f.color }} />
                    <span className="text-[9px] text-white font-bold mt-1 uppercase">{f.name}</span>
                </button>
            ))}
          </div>
          <button 
            onClick={capturePhoto} 
            disabled={isCameraLoading}
            className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 backdrop-blur-md flex items-center justify-center active:scale-90 transition-all shadow-2xl disabled:opacity-50"
          >
             <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-inner"><div className="w-6 h-6 rounded-full bg-rose-600 animate-pulse" /></div>
          </button>
        </div>
        
        <div className="absolute top-8 left-0 right-0 flex justify-center gap-3 z-20">
            <button onClick={() => setStep('info')} className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-white text-[10px] font-black border border-white/20 hover:bg-black/60 transition-all">ยกเลิก</button>
            <div className="bg-blue-600/60 backdrop-blur-md px-6 py-2 rounded-full text-white text-[10px] font-black border border-white/20">
                พิกัดตรวจสอบแล้ว 📍
            </div>
        </div>
      </div>
    );
  }

  if (step === 'verifying') return (
    <div className="max-w-md mx-auto p-20 bg-white/10 backdrop-blur-xl rounded-[3rem] text-white text-center flex flex-col items-center justify-center border-4 border-white/20 shadow-2xl">
        <div className="w-24 h-24 border-8 border-t-amber-400 border-white/20 rounded-full animate-spin mb-8" />
        <h3 className="text-3xl font-black text-amber-200">บันทึกข้อมูล...</h3>
        <p className="font-bold opacity-60 mt-2 uppercase tracking-widest text-xs">{gpsLoadingMsg || 'กำลังบันทึก ❄️'}</p>
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
