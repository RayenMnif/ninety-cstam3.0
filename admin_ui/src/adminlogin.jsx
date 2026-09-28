import React, { useState } from 'react';
import { Headphones, Shield, Lock, Mail, Eye, EyeOff, ArrowRight, KeyRound } from 'lucide-react';

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Please provide both credentials.');
      return;
    }

    setIsLoading(true);

    // Simulate authentication API call
    setTimeout(() => {
      setIsLoading(false);
      // Pass logged in admin data up to App.jsx
      onLogin({
        name: email.split('@')[0].replace('.', ' ') || 'Admin User',
        email: email,
        role: 'SUPER ADMIN',
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#07090E] font-mono selection:bg-cyan-500/30 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      
      {/* Background Subtle Ambient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-[#0A0D14] border border-[#1F2937] rounded-3xl p-8 shadow-2xl relative z-10">
        
        {/* Header & Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3 border border-cyan-900/50 rounded-2xl text-cyan-400 bg-cyan-950/30 mb-4 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
            <Headphones className="w-8 h-8" />
          </div>
          
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-black text-2xl font-sans tracking-tight">ninety</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#8B949E] border border-[#1F2937] px-2 py-0.5 rounded-md bg-[#0F141D]">
              Admin Portal
            </span>
          </div>
          <p className="text-xs text-[#8B949E] mt-1">Authenticate to access station telemetry and management</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-sans text-center">
              {error}
            </div>
          )}

          {/* Email / Admin ID Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#8B949E] uppercase tracking-wider flex items-center justify-between">
              <span>Admin Email</span>
              <Mail className="w-3.5 h-3.5 text-[#4B5563]" />
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ninety.gaminghouse"
                className="w-full bg-[#0F141D] border border-[#1F2937] rounded-xl px-4 py-3 text-xs text-white placeholder-[#4B5563] focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/60 transition-all font-sans"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[#8B949E] uppercase tracking-wider flex items-center justify-between">
              <span>Security Token / Password</span>
              <KeyRound className="w-3.5 h-3.5 text-[#4B5563]" />
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0F141D] border border-[#1F2937] rounded-xl pl-4 pr-10 py-3 text-xs text-white placeholder-[#4B5563] focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/60 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me & Quick Admin Info */}
          <div className="flex items-center justify-between text-[11px] text-[#8B949E] pt-1 font-sans">
            <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
              <input type="checkbox" className="rounded bg-[#0F141D] border-[#1F2937] text-cyan-500 focus:ring-0 focus:ring-offset-0" />
              <span>Remember session</span>
            </label>
            <span className="text-cyan-400 flex items-center gap-1 font-mono text-[10px]">
              <Shield className="w-3 h-3" /> 2FA ENFORCED
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 py-3.5 px-6 bg-cyan-500/10 border border-cyan-500/40 hover:bg-cyan-500/20 text-cyan-400 font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-[0_0_20px_rgba(6,182,212,0.15)] disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>AUTHENTICATE SYSTEM</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

        </form>

        {/* Footer info inside card */}
        <div className="mt-8 pt-4 border-t border-[#1F2937] text-center text-[10px] text-[#4B5563] flex items-center justify-between font-mono">
          <span>SYSTEM STATUS: <span className="text-emerald-400">ONLINE</span></span>
          <span>LAN IP: 192.168.10.1</span>
        </div>

      </div>

      {/* System Footer */}
      <div className="mt-8 text-center text-[10px] text-[#4B5563] space-y-1">
        <p>© 2026 Ninety Gaming House • Internal Administration Node</p>
        <p className="flex items-center justify-center gap-1 text-[9px]">
          <Lock className="w-3 h-3" /> Encrypted Endpoint Connection
        </p>
      </div>

    </div>
  );
}