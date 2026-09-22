import React, { useState } from 'react';
import { Shield, ChevronDown, User, LogOut, Sliders } from 'lucide-react';

export const AdminProfile = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 pl-2 border-l border-zinc-800 hover:opacity-80 transition-opacity"
      >
        <div className="relative">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-cyan-500/40 p-0.5 overflow-hidden shadow-[0_0_10px_rgba(6,182,212,0.2)]">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150"
              alt="Admin Avatar"
              className="w-full h-full object-cover rounded"
            />
          </div>
          <span className="absolute -bottom-1 -right-1 p-0.5 rounded bg-zinc-900 border border-cyan-500/50 text-cyan-400">
            <Shield className="w-2.5 h-2.5" />
          </span>
        </div>

        <div className="hidden md:flex flex-col text-left">
          <span className="text-xs font-bold text-zinc-200 tracking-wide">
            Ahmed sayari
          </span>
          <span className="text-[10px] font-mono text-cyan-400 font-semibold uppercase">
            Super Admin
          </span>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 hover:text-cyan-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Admin Menu Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-cyan-500/30 rounded-xl shadow-2xl p-1.5 z-50">
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-xs font-bold text-white">Ahmed sayari </p>
            <p className="text-[10px] text-zinc-500 font-mono">ahmed.sayari@ninety.gaminghouse</p>
          </div>

          <div className="py-1 text-xs text-zinc-300">
            <button className="flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-zinc-800 hover:text-cyan-400 transition-colors">
              <User className="w-3.5 h-3.5" /> Admin Profile
            </button>
            <button className="flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-zinc-800 hover:text-cyan-400 transition-colors">
              <Sliders className="w-3.5 h-3.5" /> Security Preferences
            </button>
            <button 
              onClick={() => alert('Signing out Super Admin...')}
              className="flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors text-red-400 mt-1 border-t border-zinc-800/80"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};