import React, { useState } from 'react';
import CheckInForm from './components/CheckInForm';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [loginError, setLoginError] = useState('');

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

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans relative overflow-x-hidden text-stone-800">
      {/* Premium Light Gradient Background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-stone-50 to-stone-100 pointer-events-none z-0"></div>
      
      {/* Header - Blue-Cyan Acrylic - Reduced height for mobile */}
      <header className="relative z-40 bg-gradient-to-r from-blue-600/90 via-cyan-500/85 to-blue-600/90 backdrop-blur-md border-b border-white/20 sticky top-0 shadow-lg text-white">
        {/* Shimmer overlay for header */}
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)] bg-[length:250%_250%] animate-shimmer-bg pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 md:h-20 py-2 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative group cursor-pointer transition-transform hover:scale-105 duration-300">
              <div className="absolute -inset-2 bg-white/30 rounded-full blur-md opacity-40 group-hover:opacity-60 transition duration-500"></div>
              <div className="relative rounded-full bg-white/90 p-1 md:p-1.5 shadow-lg ring-1 ring-white/50">
                <img 
                  src="https://img5.pic.in.th/file/secure-sv1/5bc66fd0-c76e-41c4-87ed-46d11f4a36fa.png" 
                  alt="School Logo" 
                  className="w-8 h-8 md:w-10 md:h-10 object-contain"
                />
              </div>
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-white tracking-tight leading-tight drop-shadow-sm">
                โรงเรียนประจักษ์ศิลปาคม
              </h1>
              <div className="flex items-center gap-2">
                 <span className="h-px w-4 md:w-6 bg-cyan-200/50"></span>
                 <p className="text-[9px] md:text-xs text-cyan-50 font-medium tracking-widest uppercase">Smart Attendance System</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
                 <div className="hidden md:flex flex-col items-end mr-2">
                    <span className="text-xs font-bold text-white/90">Administrator</span>
                    <span className="text-[10px] text-cyan-200">Mode</span>
                 </div>
                 
                 <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2 md:p-2.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all shadow-sm ring-1 ring-white/20 active:scale-95 backdrop-blur-sm"
                  title="ตั้งค่าระบบ"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>

                 <button 
                  onClick={handleLogout}
                  className="px-3 py-1.5 md:px-4 md:py-2 bg-white/10 hover:bg-red-500/20 text-white rounded-full text-xs font-bold ring-1 ring-white/20 transition-all backdrop-blur-sm flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                  <span className="hidden md:inline">ออก</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAdminLogin(true)}
                className="p-2 md:p-2.5 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all active:scale-95"
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
        <div className="w-full max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          {isAdmin ? (
            <Dashboard />
          ) : (
            <CheckInForm onSuccess={() => {}} />
          )}
        </div>
      </main>

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full relative">
            <button 
              onClick={() => { setShowAdminLogin(false); setAdminPassword(''); setLoginError(''); }}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </div>
              <h3 className="text-xl font-bold text-stone-800">ผู้ดูแลระบบ</h3>
              <p className="text-sm text-stone-500 mt-1">กรุณากรอกรหัสผ่านเพื่อเข้าถึงข้อมูลสถิติ</p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <input 
                  type="password" 
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-center font-bold tracking-widest text-stone-800"
                  placeholder="Password"
                  autoFocus
                />
                {loginError && <p className="text-red-500 text-xs text-center mt-2 font-medium">{loginError}</p>}
              </div>
              <button 
                type="submit"
                className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold shadow-lg shadow-stone-900/10 transition-all"
              >
                เข้าสู่ระบบ
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