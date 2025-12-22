
import React, { useState, useEffect } from 'react';
import CheckInForm from './components/CheckInForm';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import { syncSettingsFromCloud } from './services/storageService';

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isReady, setIsReady] = useState(false);

  // Sync settings on load and setup periodic sync
  useEffect(() => {
    const initConfig = async () => {
        try {
            await syncSettingsFromCloud();
        } catch (e) {
            console.error("Initial sync failed", e);
        } finally {
            setIsReady(true);
        }
    };
    initConfig();

    // Background Sync ทุก 30 วินาที เพื่อรับคำสั่ง Bypass จากแอดมิน
    const interval = setInterval(() => {
      syncSettingsFromCloud();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin4444') {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setAdminPassword('');
      setLoginError('');
    } else {
      setLoginError('รหัสผ่านไม่ถูกต้อง');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    setShowSettings(false);
  };

  if (!isReady) {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="text-white font-bold animate-pulse">กำลังโหลดข้อมูลปี 2026... ❄️</div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans relative overflow-x-hidden text-slate-800">
      {/* Festive Winter Night Background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900 via-slate-800 to-stone-900 pointer-events-none z-0 opacity-100 no-print"></div>
      
      {/* Floating Festive Elements */}
      <div className="fixed top-24 -left-8 text-7xl md:text-8xl animate-float z-0 pointer-events-none opacity-40 select-none no-print">🎅</div>
      <div className="fixed bottom-10 -right-8 text-7xl md:text-8xl animate-sway z-0 pointer-events-none opacity-40 select-none no-print">⛄</div>
      <div className="fixed bottom-20 left-10 text-4xl animate-sparkle z-0 pointer-events-none opacity-30 select-none no-print">🎁</div>

      {/* Christmas Header - Red/Gold Acrylic */}
      <header className="relative z-40 bg-gradient-to-r from-rose-700/90 via-red-600/85 to-rose-700/90 backdrop-blur-md border-b border-white/20 sticky top-0 shadow-xl text-white no-print">
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.15)_50%,transparent_75%)] bg-[length:250%_250%] animate-shimmer-bg pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 md:h-20 py-2 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative group cursor-pointer transition-transform hover:scale-110 duration-500">
              <div className="absolute -inset-3 bg-amber-400/30 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
              <div className="relative rounded-full bg-white/95 p-1 md:p-1.5 shadow-lg ring-2 ring-amber-400/50">
                <img 
                  src="https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png" 
                  alt="School Logo" 
                  className="w-8 h-8 md:w-10 md:h-10 object-contain"
                />
              </div>
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-white tracking-tight leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                โรงเรียนประจักษ์ศิลปาคม <span className="animate-sparkle inline-block">🎄</span>
              </h1>
              <div className="flex items-center gap-2">
                 <span className="h-px w-4 md:w-6 bg-amber-300/50"></span>
                 <p className="text-[9px] md:text-xs text-amber-100 font-bold tracking-widest uppercase">Merry Christmas & Happy New Year 2026</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
                 <div className="hidden md:flex flex-col items-end mr-2">
                    <span className="text-xs font-bold text-white/90">Administrator</span>
                    <span className="text-[10px] text-amber-200">Holiday Mode 🎁</span>
                 </div>
                 
                 <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2 md:p-2.5 text-white/80 hover:text-white bg-white/10 hover:bg-amber-400/20 rounded-full transition-all shadow-sm ring-1 ring-white/20 active:scale-95 backdrop-blur-sm"
                  title="ตั้งค่าระบบ"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>

                 <button 
                  onClick={handleLogout}
                  className="px-3 py-1.5 md:px-4 md:py-2 bg-white/20 hover:bg-white/30 text-white rounded-full text-xs font-bold ring-1 ring-white/30 transition-all backdrop-blur-sm flex items-center gap-2"
                >
                  <span className="hidden md:inline">Logout</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAdminLogin(true)}
                className="p-2 md:p-2.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all active:scale-95"
                title="สำหรับผู้ดูแลระบบ"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 p-2 md:p-8 overflow-hidden flex flex-col items-center justify-start pt-4 md:pt-8">
        <div className="w-full max-w-7xl animate-in fade-in slide-in-from-bottom-6 duration-1000">
          {isAdmin ? (
            <Dashboard />
          ) : (
            <CheckInForm onSuccess={() => {}} />
          )}
        </div>
      </main>

      {/* Admin Login Modal - Festive Style */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-[0_32px_64px_-16px_rgba(225,29,72,0.4)] p-8 max-w-sm w-full relative border border-rose-100 overflow-hidden no-print">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-600 to-amber-400"></div>
            <div className="absolute -top-6 -right-6 text-5xl opacity-20 animate-sway pointer-events-none">🎅</div>
            
            <button 
              onClick={() => { setShowAdminLogin(false); setAdminPassword(''); setLoginError(''); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors z-10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            
            <div className="text-center mb-6 pt-4">
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15.2 16.9-.8-1"/><path d="m15.2 7.1-.8 1"/><path d="m16.9 15.2-1-.8"/><path d="m16.9 8.8-1 .8"/><path d="m7.1 15.2 1-.8"/><path d="m7.1 8.8 1 .8"/><path d="m8.8 16.9.8-1"/><path d="m8.8 7.1.8 1"/><path d="M12 12h.01"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M20 12h2"/><path d="M2 12h2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/></svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 tracking-tight">สำหรับผู้ดูแลระบบ</h3>
              <p className="text-sm text-slate-500 mt-2">ยืนยันตัวตนด้วยรหัสผ่าน ❄️</p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <input 
                  type="password" 
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none text-center font-bold tracking-[0.5em] text-slate-800 text-xl"
                  placeholder="••••"
                  autoFocus
                />
                {loginError && <p className="text-rose-500 text-xs text-center mt-3 font-bold">{loginError}</p>}
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-rose-900/20 transition-all flex items-center justify-center gap-2"
              >
                <span>เข้าสู่ระบบ</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
              </button>
            </form>
          </div>
        </div>
      )}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
