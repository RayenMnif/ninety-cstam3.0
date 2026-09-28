import React, { useState, useRef, useEffect } from 'react';
import { 
  Settings, Wallet, Sliders, HardDrive, 
  ShieldCheck, FileText, Database, ChevronRight, Monitor
} from 'lucide-react';

export const SettingsDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    {
      label: 'Wallet & Billing',
      desc: 'Top-ups, revenue & payout options',
      icon: Wallet,
      badge: '$4,280.00',
      action: () => alert('Navigating to Wallet & Billing'),
    },
    {
      label: 'Rates & Pricing Zones',
      desc: 'VIP & Standard hourly pricing',
      icon: Sliders,
      action: () => alert('Opening Rates Configuration'),
    },
    {
      label: 'Hardware & Network',
      desc: 'IP allocations & PC profiles',
      icon: Monitor,
      action: () => alert('Opening Hardware & Network Specs'),
    },
    {
      label: 'Station Software',
      desc: 'Game launchers & client updates',
      icon: HardDrive,
      action: () => alert('Opening Station Software'),
    },
    {
      label: 'Staff & Roles',
      desc: 'Manage admin permissions',
      icon: ShieldCheck,
      action: () => alert('Opening Staff Management'),
    },
    {
      label: 'Audit & System Logs',
      desc: 'Track session & lock events',
      icon: FileText,
      action: () => alert('Opening Audit Logs'),
    },
    {
      label: 'Database Backup',
      desc: 'Cloud sync & manual export',
      icon: Database,
      action: () => alert('Initiating System Backup'),
    },
  ];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Settings Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 transition-all rounded-xl ${
          isOpen 
            ? 'text-white bg-purple-500/10 border border-purple-500/30' 
            : 'text-[#8B949E] hover:text-white hover:bg-white/5'
        }`}
      >
        <Settings className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-90 text-purple-400' : ''}`} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_8px_rgba(168,85,247,1)] border-2 border-[#0A0D14]"></span>
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 z-50 rounded-2xl bg-gradient-to-br from-cyan-500/50 via-purple-500/50 to-blue-600/50 p-[1px] shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(168,85,247,0.2)]">
          <div className="bg-[#0A0D14] rounded-2xl p-2 font-mono">
            
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">System Settings</h4>
                <p className="text-[10px] text-zinc-500">Ninety Gaming House Admin</p>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-purple-500/10 text-purple-400 border border-purple-500/30 uppercase">
                v2.4
              </span>
            </div>

            {/* Menu Items List */}
            <div className="space-y-0.5">
              {menuItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      item.action();
                      setIsOpen(false);
                    }}
                    className="w-full p-2.5 rounded-xl flex items-center justify-between text-left hover:bg-gradient-to-r hover:from-purple-900/20 hover:to-cyan-900/20 group transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-200 group-hover:text-white transition-colors">
                          {item.label}
                        </p>
                        <p className="text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors">
                          {item.desc}
                        </p>
                      </div>
                    </div>

                    {item.badge ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                        {item.badge}
                      </span>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                    )}
                  </button>
                );
              })}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsDropdown;