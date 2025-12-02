
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppSettings, GeoLocation, CheckInRecord, AttendanceType, Staff } from '../types';
import { getCurrentPosition, getDistanceFromLatLonInMeters } from '../services/geoService';
import { saveRecord, getSettings, syncSettingsFromCloud } from '../services/storageService';
import { analyzeCheckInImage } from '../services/geminiService';
import { getStaffById } from '../services/staffService';

interface CheckInFormProps {
  onSuccess: () => void;
}

const CheckInForm: React.FC<CheckInFormProps> = ({ onSuccess }) => {
  const [step, setStep] = useState<'info' | 'camera' | 'verifying' | 'result'>('info');
  const [attendanceType, setAttendanceType] = useState<AttendanceType>('arrival');
  
  // Login State
  const [staffIdInput, setStaffIdInput] = useState('');
  const [currentUser, setCurrentUser] = useState<Staff | null>(null);

  const [reason, setReason] = useState(''); 
  const [locationError, setLocationError] = useState('');
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  
  const isEarlyDeparture = useCallback(() => {
    if (attendanceType !== 'departure') return false;
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(16, 30, 0, 0); 
    return now < targetTime;
  }, [attendanceType]);

  const isLateArrival = useCallback(() => {
    if (attendanceType !== 'arrival') return false;
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(8, 0, 0, 0); 
    return now > targetTime;
  }, [attendanceType]);

  // Check if type allows remote check-in
  const isSpecialRequest = useCallback(() => {
      return ['duty', 'sick_leave', 'personal_leave', 'other_leave'].includes(attendanceType);
  }, [attendanceType]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Force sync on mount to ensure we have the absolute latest coordinates from Admin
    const initSettings = async () => {
        await syncSettingsFromCloud();
        setSettings(getSettings());
    };
    initSettings();
  }, []);

  // Auto-login check when typing ID
  useEffect(() => {
    if (staffIdInput.length >= 5) {
        const staff = getStaffById(staffIdInput);
        if (staff) {
            setCurrentUser(staff);
        } else {
            setCurrentUser(null);
        }
    } else {
        setCurrentUser(null);
    }
  }, [staffIdInput]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (step === 'camera') {
      const startCamera = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Camera error", err);
          setLocationError("ไม่สามารถเปิดกล้องได้");
        }
      };
      startCamera();
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [step]);

  const validateLocation = async () => {
    // 1. Force Sync again to be super safe
    await syncSettingsFromCloud();
    
    // 2. Get fresh settings
    const currentSettings = getSettings();
    setSettings(currentSettings);

    if (!currentSettings?.officeLocation) {
      if (isSpecialRequest()) {
          // Special request can proceed without office location set, but warn
          return await getCurrentPosition().then(pos => ({ lat: pos.coords.latitude, lng: pos.coords.longitude })).catch(() => ({ lat: 0, lng: 0 }));
      }
      setLocationError("ระบบยังไม่ได้รับการตั้งค่าพิกัดห้องบุคคล กรุณาติดต่อผู้ดูแล");
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
      
      // If special request (duty/leave), we ignore the max distance check
      if (dist > currentSettings.maxDistanceMeters && !isSpecialRequest()) {
        setLocationError(`คุณอยู่ห่างจากจุดเช็คอิน ${Math.round(dist)} เมตร (ต้องไม่เกิน ${currentSettings.maxDistanceMeters} เมตร)`);
        return false;
      }
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch (err) {
      if (isSpecialRequest()) {
          // Special request allows failure of GPS if needed, or we just put 0,0
          return { lat: 0, lng: 0 };
      }
      setLocationError("ไม่สามารถระบุตำแหน่ง GPS ได้");
      return false;
    }
  };

  const handleStartCheckIn = async () => {
    setLocationError('');
    if (!currentUser) {
      alert("กรุณาระบุรหัสบุคลากรที่ถูกต้อง");
      return;
    }
    if (isEarlyDeparture() && !reason.trim()) {
      alert("กรุณาระบุเหตุผลที่กลับก่อนเวลา 16.30 น.");
      return;
    }
    if (isLateArrival() && !reason.trim()) {
      alert("กรุณาระบุเหตุผลที่มาสาย (หลัง 08.00 น.)");
      return;
    }
    if (isSpecialRequest() && !reason.trim()) {
        alert("กรุณาระบุรายละเอียด/สถานที่ สำหรับการลาหรือไปราชการ");
        return;
    }
    const loc = await validateLocation();
    if (loc) {
      setStep('camera');
    }
  };

  const capturePhoto = useCallback(async () => {
    if (videoRef.current && canvasRef.current && currentUser) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const imageBase64 = canvasRef.current.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageBase64);
        setStep('verifying');
        
        const aiResult = await analyzeCheckInImage(imageBase64);
        const loc = await validateLocation(); 
        if (!loc && !isSpecialRequest()) return; 
        
        const now = new Date();
        let status: any = 'Normal';

        if (attendanceType === 'arrival') {
            const startOfWork = new Date();
            startOfWork.setHours(8, 0, 0, 0); 
            status = now > startOfWork ? 'Late' : 'On Time';
        } else if (attendanceType === 'departure') {
            const endOfWork = new Date();
            endOfWork.setHours(16, 30, 0, 0); 
            status = now < endOfWork ? 'Early Leave' : 'Normal';
        } else if (attendanceType === 'duty') {
            status = 'Duty';
        } else if (attendanceType === 'sick_leave') {
            status = 'Sick Leave';
        } else if (attendanceType === 'personal_leave') {
            status = 'Personal Leave';
        } else if (attendanceType === 'other_leave') {
            status = 'Other Leave';
        }

        const record: CheckInRecord = {
          id: crypto.randomUUID(),
          staffId: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          type: attendanceType,
          reason: (isEarlyDeparture() || isLateArrival() || isSpecialRequest()) ? reason : undefined,
          timestamp: now.getTime(),
          location: (loc || { lat: 0, lng: 0 }) as GeoLocation,
          distanceFromBase: currentDistance || 0,
          status,
          imageUrl: imageBase64,
          aiVerification: aiResult
        };

        saveRecord(record);
        setStep('result');
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    }
  }, [currentUser, attendanceType, reason, currentDistance, isEarlyDeparture, isLateArrival, isSpecialRequest, validateLocation, onSuccess]);

  if (step === 'info') {
    return (
      <div className="max-w-xl mx-auto relative mt-0 md:mt-4">
        {/* Luxury Blue-Purple Gradient Acrylic Card (Left-to-Right) */}
        <div className="relative overflow-hidden p-6 md:p-8 rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(79,70,229,0.5)] border border-white/40 bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600 animate-shimmer-bg backdrop-blur-xl">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none"></div>
          
          <div className="relative z-10 text-white">
            <div className="text-center mb-4 md:mb-6">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight drop-shadow-md flex items-center justify-center gap-2">
                <span className="animate-sparkle text-yellow-300">✨</span> ยืนยันตัวตน
              </h2>
              <p className="text-indigo-100 text-xs md:text-sm mt-1 font-medium opacity-90">ระบบลงเวลาบุคลากร โรงเรียนประจักษ์ศิลปาคม</p>
            </div>
            
            {!settings?.officeLocation && (
              <div className="bg-white text-amber-600 p-3 rounded-2xl mb-6 text-xs md:text-sm border-l-4 border-amber-500 flex items-center gap-2 shadow-lg animate-pulse">
                <span className="text-lg">⚠️</span>
                <strong>แจ้งเตือน:</strong> ยังไม่ได้ตั้งค่าพิกัดจุดลงเวลา
              </div>
            )}

            <div className="space-y-4 md:space-y-6">
              {/* Staff Login Section */}
              <div className="space-y-1">
                 <label className="block text-[10px] md:text-xs font-bold text-white mb-1 ml-1 uppercase tracking-widest opacity-90 shadow-sm">รหัสบุคลากร (Staff ID)</label>
                 <div className="relative">
                    <input 
                        type="text" 
                        value={staffIdInput}
                        onChange={(e) => setStaffIdInput(e.target.value.toUpperCase())}
                        className={`w-full px-4 py-3 md:py-4 rounded-2xl focus:ring-4 outline-none transition-all font-bold text-lg text-center tracking-wider shadow-lg
                        ${currentUser 
                            ? 'bg-white text-emerald-700 border-2 border-emerald-400 focus:ring-emerald-400/30' 
                            : 'bg-white text-stone-700 border-4 border-amber-400 focus:border-amber-500 focus:ring-amber-400/50 placeholder-stone-400'}`}
                        placeholder="เช่น PJ001"
                        maxLength={5}
                    />
                    {currentUser && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-600 animate-in zoom-in drop-shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                    )}
                 </div>
              </div>

              {currentUser ? (
                <div className="animate-in slide-in-from-bottom-2 fade-in duration-500">
                    {/* User Profile Card */}
                    <div className="bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-md mb-6 flex items-center gap-3 shadow-lg">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white to-indigo-100 border-2 border-white/50 flex items-center justify-center text-indigo-700 font-bold text-lg shadow-sm">
                            {currentUser.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base md:text-lg drop-shadow-sm">{currentUser.name}</h3>
                            <p className="text-indigo-100 text-xs md:text-sm font-medium opacity-90">{currentUser.role}</p>
                        </div>
                    </div>

                    {/* Main Actions */}
                    <div className="space-y-4">
                        <div className="flex bg-black/20 p-1.5 rounded-2xl border border-white/10 shadow-inner gap-1">
                            <button
                            onClick={() => { setAttendanceType('arrival'); setReason(''); }}
                            className={`flex-1 py-3 text-sm font-bold tracking-wide rounded-xl transition-all duration-300 ${
                                attendanceType === 'arrival' 
                                ? 'bg-white text-emerald-600 shadow-lg scale-[1.02] ring-2 ring-emerald-200' 
                                : 'text-indigo-100 hover:text-white hover:bg-white/10'
                            }`}
                            >
                            ลงเวลามา
                            </button>
                            <button
                            onClick={() => { setAttendanceType('departure'); setReason(''); }}
                            className={`flex-1 py-3 text-sm font-bold tracking-wide rounded-xl transition-all duration-300 ${
                                attendanceType === 'departure' 
                                ? 'bg-white text-rose-600 shadow-lg scale-[1.02] ring-2 ring-rose-200' 
                                : 'text-indigo-100 hover:text-white hover:bg-white/10'
                            }`}
                            >
                            ลงเวลากลับ
                            </button>
                        </div>
                        
                        {/* Leave / Duty Options (No GPS) */}
                        <div className="grid grid-cols-2 gap-2">
                             <button
                                onClick={() => { setAttendanceType('duty'); setReason(''); }}
                                className={`py-2 text-[10px] md:text-xs font-bold rounded-xl transition-all border ${
                                    attendanceType === 'duty' 
                                    ? 'bg-white text-blue-600 border-white shadow-md transform scale-105' 
                                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                                }`}
                             >
                                 🏛️ ไปราชการ
                             </button>
                             <button
                                onClick={() => { setAttendanceType('sick_leave'); setReason(''); }}
                                className={`py-2 text-[10px] md:text-xs font-bold rounded-xl transition-all border ${
                                    attendanceType === 'sick_leave' 
                                    ? 'bg-white text-amber-600 border-white shadow-md transform scale-105' 
                                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                                }`}
                             >
                                 🤒 ลาป่วย
                             </button>
                             <button
                                onClick={() => { setAttendanceType('personal_leave'); setReason(''); }}
                                className={`py-2 text-[10px] md:text-xs font-bold rounded-xl transition-all border ${
                                    attendanceType === 'personal_leave' 
                                    ? 'bg-white text-orange-500 border-white shadow-md transform scale-105' 
                                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                                }`}
                             >
                                 📝 ลากิจ
                             </button>
                             <button
                                onClick={() => { setAttendanceType('other_leave'); setReason(''); }}
                                className={`py-2 text-[10px] md:text-xs font-bold rounded-xl transition-all border ${
                                    attendanceType === 'other_leave' 
                                    ? 'bg-white text-stone-600 border-white shadow-md transform scale-105' 
                                    : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                                }`}
                             >
                                 🏳️ ลาอื่นๆ
                             </button>
                        </div>

                        {/* Reason / Details Field */}
                        {((attendanceType === 'departure' && isEarlyDeparture()) || 
                          (attendanceType === 'arrival' && isLateArrival()) ||
                          isSpecialRequest()) && (
                            <div className={`animate-in fade-in slide-in-from-top-2 p-4 rounded-2xl shadow-lg border-2 ${
                                isSpecialRequest() ? 'bg-white text-blue-800 border-blue-200' : 
                                attendanceType === 'arrival' ? 'bg-white text-amber-700 border-amber-200' : 'bg-white text-red-700 border-red-200'
                            }`}>
                            <label className="block text-[10px] font-bold mb-2 uppercase tracking-wider flex items-center gap-2 drop-shadow-none">
                                {isSpecialRequest() ? '📝 รายละเอียด / สถานที่' : 
                                 attendanceType === 'arrival' ? '⚠️ ระบุสาเหตุที่มาสาย' : '⚠️ ระบุสาเหตุที่กลับก่อนเวลา'}
                            </label>
                            <textarea 
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-300 text-stone-800 placeholder-stone-400 transition-all text-sm font-medium"
                                placeholder={isSpecialRequest() ? "ระบุสถานที่ราชการ หรือรายละเอียดการลา..." : "กรุณาระบุเหตุผล..."}
                                rows={2}
                            />
                            </div>
                        )}

                        {locationError && (
                            <div className="p-3 bg-white text-red-600 rounded-2xl text-xs flex items-start gap-2 border border-red-100 shadow-lg animate-in slide-in-from-bottom-2">
                            <span className="mt-0.5 text-base">📍</span>
                            <span className="font-bold">{locationError}</span>
                            </div>
                        )}

                        <button 
                            onClick={handleStartCheckIn}
                            className="w-full py-4 bg-white text-indigo-700 rounded-2xl font-bold tracking-wide shadow-[0_10px_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_15px_30px_-5px_rgba(255,255,255,0.4)] hover:-translate-y-1 active:translate-y-0 active:scale-[0.99] transition-all duration-300 mt-2 text-base border border-white/50"
                        >
                            <span className="flex items-center justify-center gap-2">
                            ถ่ายภาพยืนยัน
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                            </span>
                        </button>
                    </div>
                </div>
              ) : (
                <div className="text-center p-6 border-2 border-dashed border-amber-300/70 rounded-2xl bg-amber-900/20 backdrop-blur-md">
                    <p className="text-amber-100 font-bold text-sm drop-shadow-md tracking-wide">กรุณากรอกรหัสบุคลากรเพื่อเข้าสู่ระบบ</p>
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
      <div className="max-w-md mx-auto bg-stone-900 rounded-[2.5rem] overflow-hidden shadow-2xl relative border-8 border-stone-100 ring-1 ring-stone-200">
        <video ref={videoRef} autoPlay playsInline className="w-full h-[600px] object-cover opacity-90" />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Modern HUD Overlay */}
        <div className="absolute inset-0 pointer-events-none">
             {/* Simple Frame */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-80 border border-white/20 rounded-3xl"></div>
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-76 border border-white/10 rounded-2xl"></div>
        </div>

        <div className="absolute top-8 left-0 right-0 flex justify-center flex-col items-center gap-2">
           <div className="bg-black/40 backdrop-blur-md px-5 py-2 rounded-full text-white/90 text-xs font-bold shadow-sm border border-white/10 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full animate-pulse ${attendanceType === 'arrival' ? 'bg-emerald-400' : attendanceType === 'departure' ? 'bg-rose-400' : 'bg-blue-400'}`}></span>
              Status: {attendanceType.replace('_', ' ').toUpperCase()}
           </div>
           {currentUser && (
               <div className="text-white/80 text-xs font-medium bg-black/40 px-3 py-1 rounded-full">{currentUser.name}</div>
           )}
        </div>

        <div className="absolute bottom-0 inset-x-0 p-8 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col items-center pb-12">
          {!isSpecialRequest() && (
              <p className="text-white/80 mb-8 text-xs font-medium tracking-wider bg-white/10 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/5">
                Distance: <span className="font-bold text-white text-sm">{currentDistance ? Math.round(currentDistance) : '...'}</span> m
              </p>
          )}
          <button 
            onClick={capturePhoto}
            className="w-20 h-20 rounded-full bg-white/10 border border-white/30 backdrop-blur-sm flex items-center justify-center group hover:bg-white/20 transition-all duration-300"
          >
             <div className="w-16 h-16 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.3)] group-hover:scale-95 transition-transform duration-300"></div>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'verifying') {
    return (
      <div className="max-w-md mx-auto p-1 bg-gradient-to-br from-indigo-200 to-purple-200 rounded-[2.5rem] shadow-xl">
        <div className="bg-white p-12 rounded-[2.3rem] text-center relative overflow-hidden h-[400px] flex flex-col items-center justify-center">
            <div className="relative w-32 h-32 mx-auto mb-10">
               <div className="absolute inset-0 border-4 border-indigo-50 rounded-full"></div>
               <div className="absolute inset-0 border-4 border-t-indigo-600 border-r-purple-400 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
               <div className="absolute inset-4 bg-indigo-50 rounded-full flex items-center justify-center">
                   <div className="w-3 h-3 bg-indigo-600 rounded-full animate-pulse"></div>
               </div>
            </div>
            <h3 className="text-2xl font-bold text-stone-800 mb-2 tracking-tight">AI Analysis</h3>
            <p className="text-stone-400 font-medium text-sm">กำลังตรวจสอบความถูกต้องของภาพ...</p>
        </div>
      </div>
    );
  }

  if (step === 'result') {
    return (
      <div className="max-w-md mx-auto p-1 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-[2.5rem] shadow-xl animate-in zoom-in duration-300">
        <div className="bg-white p-12 rounded-[2.3rem] text-center h-[400px] flex flex-col items-center justify-center">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h3 className="text-3xl font-bold text-stone-800 mb-3 tracking-tight">
              เรียบร้อย
          </h3>
          <p className="text-stone-500 font-medium">บันทึกข้อมูลเข้าสู่ระบบแล้ว</p>
          {currentUser && <p className="text-emerald-600 font-bold mt-2">{currentUser.name}</p>}
        </div>
      </div>
    );
  }

  return null;
};

export default CheckInForm;
