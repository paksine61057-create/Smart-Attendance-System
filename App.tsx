
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
        <div className="min-h-screen bg-purple-950 flex items-center justify-center">
            <div className="text-white font-bold animate-pulse text-lg tracking-widest">PJ Attendance System... 🚀</div>
        </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans relative overflow-x-hidden text-purple-950 mesh-gradient">
      
      {/* Dynamic Background Accents */}
      <div className="fixed top-20 -left-20 w-80 h-80 bg-purple-400/20 rounded-full blur-[100px] pointer-events-none no-print"></div>
      <div className="fixed bottom-20 -right-20 w-80 h-80 bg-pink-400/20 rounded-full blur-[100px] pointer-events-none no-print"></div>

      {/* Modern Header - Purple/Pink Glassmorphism */}
      <header className="relative z-40 bg-white/70 backdrop-blur-xl border-b border-purple-100 sticky top-0 shadow-sm text-purple-900 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 md:h-20 py-2 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative group cursor-pointer transition-transform hover:scale-105 duration-300">
              <div className="absolute -inset-2 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full blur opacity-0 group-hover:opacity-40 transition duration-500"></div>
              <div className="relative rounded-full bg-white p-1 shadow-md ring-1 ring-purple-100">
                <img 
                  src="https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png" 
                  alt="School Logo" 
                  className="w-8 h-8 md:w-10 md:h-10 object-contain"
                />
              </div>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-purple-900 tracking-tight leading-tight">
                โรงเรียนประจักษ์ศิลปาคม
              </h1>
              <div className="flex items-center gap-2">
                 <span className="h-0.5 w-4 bg-pink-500 rounded-full"></span>
                 <p className="text-[10px] md:text-xs text-purple-600/70 font-bold tracking-widest uppercase">Smart Attendance Platform</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
                 <div className="hidden md:flex flex-col items-end mr-2">
                    <span className="text-[10px] font-black text-purple-400 uppercase tracking-tighter">Administrator</span>
                    <span className="text-xs font-bold text-purple-800">ระบบจัดการหลังบ้าน</span>
                 </div>
                 
                 <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2.5 text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 rounded-2xl transition-all shadow-sm ring-1 ring-purple-100 active:scale-95"
                  title="ตั้งค่าระบบ"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>

                 <button 
                  onClick={handleLogout}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-2xl text-xs font-black shadow-lg shadow-purple-200 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  <span className="hidden md:inline">ออกจากระบบ</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAdminLogin(true)}
                className="p-2.5 text-purple-400 hover:text-purple-700 bg-purple-50/50 hover:bg-purple-100 rounded-2xl transition-all active:scale-95 border border-purple-100/50"
                title="ผู้ดูแลระบบ"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 p-3 md:p-8 overflow-hidden flex flex-col items-center justify-start pt-6">
        <div className="w-full max-w-7xl animate-in fade-in slide-in-from-bottom-6 duration-1000">
          {isAdmin ? (
            <Dashboard />
          ) : (
            <CheckInForm onSuccess={() => {}} />
          )}
        </div>
      </main>

      {/* Admin Login Modal - Modern Style */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-purple-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-sm w-full relative border border-purple-100 overflow-hidden no-print">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600"></div>
            
            <button 
              onClick={() => { setShowAdminLogin(false); setAdminPassword(''); setLoginError(''); }}
              className="absolute top-6 right-6 text-purple-300 hover:text-pink-500 transition-colors z-10 p-1 rounded-full hover:bg-purple-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-purple-600 shadow-sm border border-purple-100 rotate-3 group-hover:rotate-0 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </div>
              <h3 className="text-2xl font-black text-purple-900 tracking-tight">เข้าสู่ระบบจัดการ</h3>
              <p className="text-sm text-purple-500/70 font-bold mt-1">Administrator Access Only</p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-5">
              <div>
                <input 
                  type="password" 
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-4 py-5 bg-purple-50/50 border-2 border-purple-100 rounded-2xl focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none text-center font-black tracking-[0.5em] text-purple-900 text-2xl transition-all"
                  placeholder="••••"
                  autoFocus
                />
                {loginError && <p className="text-pink-600 text-xs text-center mt-3 font-bold animate-bounce">❌ {loginError}</p>}
              </div>
              <button 
                type="submit"
                className="w-full py-5 bg-gradient-to-r from-purple-700 to-purple-900 text-white rounded-2xl font-black text-lg shadow-xl shadow-purple-200 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
              >
                <span>ยืนยันรหัสผ่าน</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
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
