
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

const ON_TIME_MESSAGES = [
  { title: "✅ ลงเวลาเรียบร้อย", body: "ขอบคุณที่มาตรงเวลา ความสม่ำเสมอของคุณช่วยให้วันทำงานราบรื่น 🌟" },
  { title: "⏰ คุณมาทันเวลา เยี่ยมมาก!", body: "เริ่มต้นวันด้วยวินัยเล็ก ๆ ที่สร้างผลลัพธ์ที่ดีในระยะยาว 👍" },
  { title: "🌱 เริ่มวันใหม่ได้อย่างดี", body: "การมาตรงเวลาคือก้าวแรกของความเป็นมืออาชีพ ขอบคุณที่รักษามาตรฐานนี้ไว้" },
  { title: "💜 ขอบคุณสำหรับการตรงเวลา", body: "สิ่งเล็ก ๆ นี้สร้างบรรยากาศการทำงานที่ดีให้กับทุกคน" },
  { title: "⭐ วันนี้คุณเริ่มต้นได้ยอดเยี่ยม", body: "มาตรงเวลา = พร้อมทำงาน = พร้อมสร้างคุณค่า" }
];

const LATE_MESSAGES = [
  { title: "🌤️ ลงเวลาเรียบร้อยแล้ว", body: "ไม่เป็นไรนะ วันนี้เริ่มใหม่ได้เสมอ ขอให้เป็นวันที่ดีในการทำงาน 😊" },
  { title: "💪 ถึงจะช้ากว่านิดหน่อย แต่คุณก็มาแล้ว", body: "ขอบคุณที่ตั้งใจมาทำงาน ขอให้วันนี้ผ่านไปอย่างราบรื่น" },
  { title: "🌈 ทุกวันคือโอกาสในการปรับปรุง", body: "วันนี้อาจเริ่มช้าหน่อย แต่คุณยังสามารถทำวันนี้ให้ดีที่สุดได้" },
  { title: "🤍 อย่ากังวลมากเกินไป", body: "ขอให้โฟกัสกับงานตรงหน้า แล้วทำวันนี้ให้มีคุณภาพนะครับ" },
  { title: "✨ การเริ่มต้นสำคัญเสมอ", body: "ขอบคุณที่มาลงเวลา และขอให้วันนี้เป็นวันที่ดีอีกวันหนึ่ง" }
];

const DEPARTURE_MESSAGES = [
  { title: "🏠 เดินทางปลอดภัยนะครับ", body: "ลงเวลากลับเรียบร้อย พักผ่อนให้เต็มที่เพื่อเช้าวันใหม่ที่สดใส 🌟" },
  { title: "🌙 พักให้หายเหนื่อยนะครับ", body: "วันนี้คุณเก่งมาก ขอบคุณที่เหนื่อยมาทั้งวันเพื่อลูกศิษย์ กลับบ้านพักผ่อนนะครับ ❄️" },
  { title: "🚗 เดินทางโดยสวัสดิภาพ", body: "ขอให้เป็นเย็นวันที่ผ่อนคลาย พรุ่งนี้เจอกันใหม่ด้วยพลังที่เต็มเปี่ยม ✨" },
  { title: "🛌 อย่าลืมพักผ่อนเยอะๆ", body: "ร่างกายที่ได้พักจะช่วยให้งานพรุ่งนี้ยอดเยี่ยมขึ้น เดินทางปลอดภัยครับ 🎁" },
  { title: "🌟 จบภารกิจวันนี้แล้ว", body: "ขอให้มีความสุขกับเวลาพักผ่อนที่บ้าน และกลับมาสู้ใหม่ในวันพรุ่งนี้ครับ" }
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

  const [resultTitle, setResultTitle] = useState('');
  const [resultBody, setResultBody] = useState('');
  const [resultTheme, setResultTheme] = useState<'success' | 'warning'>('success');
  const [isBirthdayToday, setIsBirthdayToday] = useState(false);

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

  const startCameraStep = async () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const isSpecialType = ['duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(attendanceType);
    
    const isLate = attendanceType === 'arrival' && (h > 8 || (h === 8 && m >= 1));
    const isEarly = attendanceType === 'departure' && h < 16;
    
    if ((isLate || isEarly || isSpecialType) && !reason.trim()) {
      alert('⚠️ กรุณาระบุเหตุผลก่อนบันทึกเวลา');
      return;
    }

    const settings = getSettings();
    const needsLocationCheck = ['arrival', 'departure', 'authorized_late'].includes(attendanceType);
    
    if (settings.locationMode === 'online' || !needsLocationCheck) {
        setStep('camera');
        return;
    }

    setIsLocating(true);
    
    try {
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
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
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
        
        context.save();
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        const filter = CAMERA_FILTERS.find(f => f.id === activeFilterId);
        context.filter = filter?.css || 'none';
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.restore();
        
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.6); 
        
        setStep('verifying');
        setGpsLoadingMsg('กำลังตรวจสอบใบหน้าด้วย AI...');

        const aiResult = await analyzeCheckInImage(imageBase64);
        const now = new Date();
        let status: any = 'Normal';
        
        // Check for Birthday
        const today = new Date();
        const currentD = today.getDate();
        const currentM = today.getMonth() + 1;
        
        if (currentUser.birthday) {
          const [bDay, bMonth] = currentUser.birthday.split('/').map(Number);
          if (currentD === bDay && currentM === bMonth && ['arrival', 'duty', 'authorized_late'].includes(attendanceType)) {
            setIsBirthdayToday(true);
          }
        }

        const isNewYearFirstDay = now.getFullYear() === 2026 && now.getMonth() === 0 && now.getDate() === 5;

        if (attendanceType === 'arrival') {
            const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 1, 0, 0);
            if (now.getTime() >= limit.getTime()) {
                status = 'Late';
                const msg = LATE_MESSAGES[Math.floor(Math.random() * LATE_MESSAGES.length)];
                setResultTitle(msg.title);
                setResultBody(msg.body);
                setResultTheme('warning');
            } else {
                status = 'On Time';
                const msg = ON_TIME_MESSAGES[Math.floor(Math.random() * ON_TIME_MESSAGES.length)];
                setResultTitle(msg.title);
                setResultBody(msg.body);
                setResultTheme('success');
            }

            if (isNewYearFirstDay) {
                let greetingName = `คุณครู${currentUser.name}`;
                let personalizedMsg = "ขอให้ปีนี้เป็นปีที่ยอดเยี่ยม มีแต่รอยยิ้มและความสุขในการทำงานตลอดปีนะครับ/คะ 🎁❄️";
                
                if (currentUser.id === 'PJ001') {
                    greetingName = "ผอ.ชัชตะวัน";
                    personalizedMsg = "ขอให้ท่านและครอบครัวมีความสุขยิ่งๆ ขึ้นไป เป็นร่มโพธิ์ร่มไทรให้พวกเราชาวประจักษ์ศิลปาคมตลอดปี ๒๕๖๙ นะครับ/คะ 🌟🎄";
                } else if (currentUser.id === 'PJ002') {
                    greetingName = "รองฯภราดร";
                    personalizedMsg = "ขอให้ท่านมีความสุข สุขภาพแข็งแรง และประสบความสำเร็จในทุกภารกิจตลอดปี ๒๕๖๙ นะครับ/คะ 🌟🎁";
                }

                setResultTitle(`สวัสดีปีใหม่ ๒๕๖๙ 🎉`);
                setResultBody(`สวัสดีปีใหม่ครับ/ค่ะ ${greetingName} ❄️ ${personalizedMsg}`);
                setResultTheme('success');
            }

        } else if (attendanceType === 'departure') {
            const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0, 0);
            status = now.getTime() < limit.getTime() ? 'Early Leave' : 'Normal';
            const msg = DEPARTURE_MESSAGES[Math.floor(Math.random() * DEPARTURE_MESSAGES.length)];
            setResultTitle(msg.title);
            setResultBody(msg.body);
            setResultTheme('success');
        } else {
            status = attendanceType.replace('_', ' ').split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
            setResultTitle("✅ บันทึกข้อมูลสำเร็จ");
            setResultBody("ระบบได้บันทึกข้อมูลการปฏิบัติหน้าที่ของคุณเรียบร้อยแล้ว");
            setResultTheme('success');
        }

        const record: CheckInRecord = {
          id: crypto.randomUUID(), staffId: currentUser.id, name: currentUser.name, role: currentUser.role,
          type: attendanceType, timestamp: now.getTime(), location: preFetchedLocation, 
          distanceFromBase: preFetchedDistance, status, imageUrl: imageBase64, aiVerification: aiResult,
          reason: reason || undefined
        };

        await saveRecord(record);
        setStep('result');
        localStorage.setItem('school_checkin_saved_staff_id', currentUser.id);
        
        // Extent success display time if it's birthday
        const timeout = isBirthdayToday ? 10000 : 3000;
        setTimeout(() => {
          onSuccess();
          setIsBirthdayToday(false);
        }, timeout);
      }
    }
  }, [currentUser, attendanceType, reason, activeFilterId, onSuccess, preFetchedLocation, preFetchedDistance, isBirthdayToday]);

  if (step === 'info') {
    const isSpecialType = ['duty', 'sick_leave', 'personal_leave', 'other_leave', 'authorized_late'].includes(attendanceType);

    return (
      <div className="max-w-xl mx-auto relative mt-4">
        <div className="relative overflow-hidden p-8 md:p-12 rounded-[3rem] shadow-2xl border border-white/40 bg-white/70 backdrop-blur-3xl animate-in slide-in-from-bottom-10 duration-700">
          <div className="absolute top-0 right-0 p-8 opacity-5"><svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>

          <div className="relative z-10 text-purple-900 text-center">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight flex items-center justify-center gap-3">
               ยืนยันตัวตน
            </h2>
            <p className="text-purple-500 text-xs mt-1 font-bold tracking-[0.2em] uppercase opacity-60">School Attendance AI</p>

            {todayHoliday && (
                <div className="my-8 p-6 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-100 rounded-[2.5rem] flex items-center justify-center gap-4 animate-in zoom-in shadow-sm">
                     <span className="text-3xl">🏖️</span>
                     <div className="text-left">
                         <p className="text-[10px] text-purple-400 uppercase font-black tracking-widest mb-0.5">วันนี้คือวันหยุด</p>
                         <p className="text-xl font-black text-purple-800 leading-none">{todayHoliday}</p>
                     </div>
                </div>
            )}
            
            <div className="mt-10 space-y-8">
              <div className="space-y-3 text-left">
                 <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest ml-3">ป้อนรหัสบุคลากร (Staff ID)</label>
                 <div className="relative group">
                    <input 
                        type="text" 
                        value={staffIdInput} 
                        onChange={(e) => setStaffIdInput(e.target.value.toUpperCase())}
                        className={`w-full px-6 py-5 rounded-[2rem] focus:ring-8 outline-none transition-all font-black text-3xl text-center tracking-[0.2em] shadow-inner
                        ${currentUser ? 'text-purple-700 bg-purple-50 border-4 border-purple-200' : 'text-purple-900 bg-purple-50/50 border-4 border-purple-100/50 focus:border-purple-300 focus:ring-purple-200/50'}`}
                        placeholder="PJ..." maxLength={5} 
                    />
                    {currentUser && <div className="absolute right-6 top-1/2 -translate-y-1/2 text-pink-500 animate-in zoom-in"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>}
                 </div>
              </div>

              {currentUser && (
                <div className="animate-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-6 rounded-[2.5rem] shadow-xl mb-8 flex items-center gap-5 text-left border border-white/20">
                        <div className="w-16 h-16 rounded-3xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center font-black text-3xl text-white shadow-lg">
                            {currentUser.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl tracking-tight leading-tight">{currentUser.name}</h3>
                            <p className="text-purple-100/80 text-xs font-bold uppercase tracking-widest">{currentUser.role}</p>
                        </div>
                    </div>
                    
                    <div className="space-y-8">
                        <div>
                           <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest text-left ml-3 mb-3">เลือกโหมดการลงเวลา</p>
                           <div className="grid grid-cols-2 gap-4">
                               <button onClick={() => setAttendanceType('arrival')} className={`p-8 rounded-[2.5rem] border-4 transition-all duration-300 flex flex-col items-center gap-3 ${attendanceType === 'arrival' ? 'bg-white border-purple-600 text-purple-900 scale-105 shadow-xl' : 'bg-purple-50/50 border-transparent text-purple-400 hover:bg-purple-50'}`}>
                                   <span className="text-3xl">🌅</span>
                                   <span className="font-black text-base">มาทำงาน</span>
                               </button>
                               <button onClick={() => setAttendanceType('departure')} className={`p-8 rounded-[2.5rem] border-4 transition-all duration-300 flex flex-col items-center gap-3 ${attendanceType === 'departure' ? 'bg-white border-pink-500 text-pink-900 scale-105 shadow-xl' : 'bg-purple-50/50 border-transparent text-purple-400 hover:bg-purple-50'}`}>
                                   <span className="text-3xl">🏠</span>
                                   <span className="font-black text-base">กลับบ้าน</span>
                               </button>
                           </div>
                        </div>

                        <div className="space-y-4">
                           <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest text-left ml-3">ลา / ไปราชการ</p>
                           <div className="grid grid-cols-3 gap-3">
                               <button onClick={() => setAttendanceType('duty')} className={`p-4 rounded-3xl border-2 transition-all duration-300 flex flex-col items-center gap-1 ${attendanceType === 'duty' ? 'bg-white border-purple-400 text-purple-800 shadow-md' : 'bg-purple-50/50 border-transparent text-purple-400'}`}>
                                   <span className="text-xl">🏛️</span>
                                   <span className="font-black text-[10px]">ไปราชการ</span>
                               </button>
                               <button onClick={() => setAttendanceType('sick_leave')} className={`p-4 rounded-3xl border-2 transition-all duration-300 flex flex-col items-center gap-1 ${attendanceType === 'sick_leave' ? 'bg-white border-purple-400 text-purple-800 shadow-md' : 'bg-purple-50/50 border-transparent text-purple-400'}`}>
                                   <span className="text-xl">🤒</span>
                                   <span className="font-black text-[10px]">ลาป่วย</span>
                               </button>
                               <button onClick={() => setAttendanceType('personal_leave')} className={`p-4 rounded-3xl border-2 transition-all duration-300 flex flex-col items-center gap-1 ${attendanceType === 'personal_leave' ? 'bg-white border-purple-400 text-purple-800 shadow-md' : 'bg-purple-50/50 border-transparent text-purple-400'}`}>
                                   <span className="text-xl">🙏</span>
                                   <span className="font-black text-[10px]">ลากิจ</span>
                               </button>
                           </div>
                           <button onClick={() => setAttendanceType('authorized_late')} className={`w-full p-4 rounded-3xl border-2 transition-all duration-300 flex items-center justify-center gap-3 ${attendanceType === 'authorized_late' ? 'bg-white border-purple-400 text-purple-800 shadow-md' : 'bg-purple-50/50 border-transparent text-purple-400'}`}>
                                <span className="text-xl">🕒</span>
                                <span className="font-black text-xs">ขออนุญาตเข้าสาย</span>
                           </button>
                        </div>

                        {(isSpecialType || (attendanceType === 'departure' && new Date().getHours() < 16) || (attendanceType === 'arrival' && (new Date().getHours() > 8 || (new Date().getHours() === 8 && new Date().getMinutes() >= 1)))) && (
                            <div className="animate-in fade-in zoom-in text-left space-y-2">
                                <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest ml-3">ระบุเหตุผล / รายละเอียด</label>
                                <textarea 
                                    value={reason} 
                                    onChange={(e) => setReason(e.target.value)} 
                                    className="w-full p-5 bg-purple-50/50 border-2 border-purple-100 rounded-3xl outline-none text-purple-900 font-bold focus:bg-white focus:border-purple-300 transition-all" 
                                    placeholder="พิมพ์เหตุผลที่นี่..." rows={2} 
                                />
                            </div>
                        )}

                        <div className="mt-4 p-4 bg-purple-100/50 rounded-2xl border border-purple-200/50 flex items-center justify-center gap-3">
                            <span className="text-purple-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                {getSettings().locationMode === 'gps' ? 'ระบบตรวจสอบพิกัดโรงเรียน 📍' : 'ระบบบันทึกตำแหน่งออนไลน์ 🌐'}
                            </span>
                        </div>
                        
                        <button 
                            onClick={startCameraStep}
                            disabled={isLocating}
                            className={`w-full py-6 rounded-[2.5rem] font-black text-xl shadow-2xl transition-all mt-4 flex items-center justify-center gap-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white animate-pulse-ring-modern hover:scale-[1.02] active:scale-95 disabled:opacity-50`}
                        >
                            {isLocating ? (
                              <div className="flex items-center gap-3">
                                <div className="w-5 h-5 border-3 border-t-white border-white/20 rounded-full animate-spin" />
                                กำลังตรวจสอบพื้นที่...
                              </div>
                            ) : (
                                <><span>บันทึกใบหน้า (AI Check-in)</span><span className="text-2xl">📸</span></>
                            )}
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
      <div className="max-w-md mx-auto bg-black rounded-[3rem] overflow-hidden shadow-2xl relative border-[12px] border-white ring-8 ring-purple-100">
        <div className="relative w-full h-[650px] bg-purple-900/10 overflow-hidden">
            {isCameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 bg-purple-950">
                    <div className="w-12 h-12 border-4 border-t-pink-500 border-white/20 rounded-full animate-spin mb-4" />
                    <p className="font-bold text-xs uppercase tracking-widest">เปิดกล้อง AI...</p>
                </div>
            )}
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ filter: CAMERA_FILTERS.find(f => f.id === activeFilterId)?.css || 'none', transform: 'scaleX(-1)' }} />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        
        <div className="absolute inset-x-0 bottom-0 p-10 bg-gradient-to-t from-purple-950 flex flex-col items-center z-20">
          <div className="flex gap-4 overflow-x-auto pb-8 w-full justify-center scrollbar-hide">
            {CAMERA_FILTERS.map(f => (
                <button key={f.id} onClick={() => setActiveFilterId(f.id)} className={`flex flex-col items-center min-w-[60px] transition-all ${activeFilterId === f.id ? 'scale-110 opacity-100' : 'opacity-60'}`}>
                    <div className="w-11 h-11 rounded-full border-2 border-white shadow-lg" style={{ backgroundColor: f.color }} />
                    <span className="text-[9px] text-white font-bold mt-1.5 uppercase tracking-tighter">{f.name}</span>
                </button>
            ))}
          </div>
          <button 
            onClick={capturePhoto} 
            disabled={isCameraLoading}
            className="w-22 h-22 rounded-full bg-white/10 border-4 border-white/30 backdrop-blur-md flex items-center justify-center active:scale-90 transition-all shadow-2xl disabled:opacity-50"
          >
             <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-inner group">
                <div className="w-8 h-8 rounded-full bg-purple-600 animate-pulse group-active:scale-150 transition-transform" />
             </div>
          </button>
        </div>
        
        <div className="absolute top-8 left-0 right-0 flex justify-center gap-3 z-20">
            <button onClick={() => setStep('info')} className="bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-2xl text-white text-[10px] font-black border border-white/20 hover:bg-black/80 transition-all uppercase tracking-widest">ยกเลิก</button>
            <div className="bg-purple-600/70 backdrop-blur-md px-6 py-2.5 rounded-2xl text-white text-[10px] font-black border border-white/20 uppercase tracking-widest">
                พิกัด: {preFetchedDistance}ม. ✅
            </div>
        </div>
      </div>
    );
  }

  if (step === 'verifying') return (
    <div className="max-w-md mx-auto p-24 bg-white/80 backdrop-blur-xl rounded-[4rem] text-purple-900 text-center flex flex-col items-center justify-center border-4 border-purple-100 shadow-2xl">
        <div className="w-24 h-24 border-8 border-t-pink-500 border-purple-100 rounded-full animate-spin mb-10" />
        <h3 className="text-3xl font-black tracking-tight">AI กำลังวิเคราะห์...</h3>
        <p className="font-bold opacity-40 mt-3 uppercase tracking-widest text-xs leading-relaxed">{gpsLoadingMsg || 'บันทึกข้อมูลเข้าสู่ระบบ 🚀'}</p>
    </div>
  );
  
  if (step === 'result') return (
    <div className="relative">
      <div className={`max-w-md mx-auto p-12 md:p-16 rounded-[4rem] text-white text-center flex flex-col items-center justify-center shadow-2xl animate-in zoom-in duration-500 border-8 border-white ${resultTheme === 'success' ? 'bg-gradient-to-br from-purple-600 to-purple-900' : 'bg-gradient-to-br from-pink-500 to-rose-700'}`}>
          <div className="w-24 h-24 bg-white/20 rounded-[2.5rem] flex items-center justify-center mb-10 animate-float shadow-xl rotate-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
          </div>
          <h3 className="text-4xl md:text-5xl font-black leading-tight tracking-tight drop-shadow-lg">{resultTitle}</h3>
          <p className="font-bold text-lg md:text-xl mt-8 opacity-90 tracking-tight leading-relaxed max-w-xs">
              {resultBody}
          </p>
          <div className="mt-12 flex items-center gap-3 px-8 py-3 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.3em] border border-white/20 shadow-sm">
            <span>PJ SMART SYSTEM</span>
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"></span>
            <span>SUCCESS</span>
          </div>
      </div>

      {/* Birthday Surprise Overlay */}
      {isBirthdayToday && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-purple-950/40 backdrop-blur-xl animate-in fade-in duration-700">
           {/* Confetti Emoji Elements */}
           <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <div 
                  key={i} 
                  className="absolute text-4xl animate-bounce" 
                  style={{ 
                    left: `${Math.random() * 100}%`, 
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 2}s`,
                    opacity: 0.6
                  }}
                >
                  {['🎉', '🎂', '🎈', '✨', '🎁'][Math.floor(Math.random() * 5)]}
                </div>
              ))}
           </div>

           <div className="bg-white/90 p-8 md:p-12 rounded-[4rem] shadow-[0_35px_60px_-15px_rgba(168,85,247,0.3)] max-w-lg w-full text-center border-4 border-white animate-in zoom-in slide-in-from-bottom-20 duration-1000">
              <div className="relative mb-10">
                <div className="w-32 h-32 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto shadow-inner border border-purple-50 animate-float">
                  <span className="text-6xl">🎂</span>
                </div>
                <div className="absolute -top-4 -right-4 text-4xl animate-sway">🎁</div>
                <div className="absolute -bottom-4 -left-4 text-4xl animate-sway" style={{animationDelay: '1s'}}>🎈</div>
              </div>

              <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 tracking-tight mb-4">
                สุขสันต์วันเกิดครับ/ค่ะ
              </h2>
              <h3 className="text-2xl font-black text-purple-900 mb-6">{currentUser?.name}</h3>
              
              <div className="space-y-4 text-purple-600/80 font-bold leading-relaxed">
                 <p className="text-lg">✨ ขอให้คุณครูมีความสุขกาย สบายใจ มีสุขภาพแข็งแรง</p>
                 <p className="text-lg">และเป็นแม่พิมพ์ที่สง่างามของลูกศิษย์ชาวประจักษ์ฯ ตลอดไปนะครับ/คะ 💜</p>
              </div>

              <div className="mt-12">
                 <button 
                  onClick={() => { setIsBirthdayToday(false); onSuccess(); }} 
                  className="px-12 py-5 bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-purple-200 hover:scale-105 active:scale-95 transition-all"
                >
                  ขอบคุณครับ/ค่ะ 🙏
                </button>
              </div>

              <div className="mt-8 flex items-center justify-center gap-3">
                 <span className="h-px w-8 bg-purple-100"></span>
                 <p className="text-[10px] font-black text-purple-300 uppercase tracking-[0.3em]">Prachaksinlapakhom School</p>
                 <span className="h-px w-8 bg-purple-100"></span>
              </div>
           </div>
        </div>
      )}
    </div>
  );
  
  return null;
};

export default CheckInForm;
