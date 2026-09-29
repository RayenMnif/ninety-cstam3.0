import React, { useState, useRef, useEffect } from 'react';
import { 
  Settings, Wallet, Sliders, HardDrive, 
  ShieldCheck, FileText, Database, ChevronRight, Monitor, X
} from 'lucide-react';

// Import the Wallet component directly here
import WalletBilling from './e-wallet'; 

export default function SettingsDropdown({ onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
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
      id: 'wallet',
      label: 'Wallet & Billing',
      desc: 'Top-ups, revenue & payout options',
      icon: Wallet,
      badge: '$4,280.00',
      action: () => { 
        setIsOpen(false); 
        setIsWalletOpen(true); 
      },
    },
    {
      id: 'rates',
      label: 'Rates & Pricing Zones',
      desc: 'VIP & Standard hourly pricing',
      icon: Sliders,
      action: () => { setIsOpen(false); onNavigate && onNavigate('RATES'); },
    },
    {
      id: 'hardware',
      label: 'Hardware & Network',
      desc: 'IP allocations & PC profiles',
      icon: Monitor,
      action: () => { setIsOpen(false); onNavigate && onNavigate('HARDWARE'); },
    },
    {
      id: 'software',
      label: 'Station Software',
      desc: 'Game launchers & client updates',
      icon: HardDrive,
      action: () => { setIsOpen(false); onNavigate && onNavigate('SOFTWARE'); },
    },
    {
      id: 'staff',
      label: 'Staff & Roles',
      desc: 'Manage admin permissions',
      icon: ShieldCheck,
      action: () => { setIsOpen(false); onNavigate && onNavigate('STAFF'); },
    },
    {
      id: 'audit',
      label: 'Audit & System Logs',
      desc: 'Track session & lock events',
      icon: FileText,
      action: () => { setIsOpen(false); onNavigate && onNavigate('AUDIT'); },
    },
    {
      id: 'backup',
      label: 'Database Backup',
      desc: 'Cloud sync & manual export',
      icon: Database,
      action: () => { setIsOpen(false); onNavigate && onNavigate('BACKUP'); },
    },
  ];

  return (
    <>
      {/* Dropdown Container */}
      <div className="relative inline-block text-left" ref={dropdownRef}>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Settings Menu"
          className={`relative p-2.5 transition-all rounded-xl border ${
            isOpen 
              ? 'text-white bg-purple-500/10 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]' 
              : 'text-[#8B949E] bg-[#0F141D] border-[#1F2937] hover:text-white hover:border-gray-700'
          }`}
        >
          <Settings className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-90 text-purple-400' : ''}`} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_8px_rgba(168,85,247,1)] border border-[#0A0D14]"></span>
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-3 w-80 z-50 rounded-2xl bg-gradient-to-br from-cyan-500/40 via-purple-500/40 to-blue-600/40 p-[1px] shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(168,85,247,0.2)]">
            <div className="bg-[#0A0D14] rounded-2xl p-2 font-mono">
              <div className="px-3 py-2.5 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">System Settings</h4>
                  <p className="text-[10px] text-zinc-500">Ninety Gaming House Admin</p>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-purple-500/10 text-purple-400 border border-purple-500/30 uppercase">
                  v2.4
                </span>
              </div>

              <div className="space-y-0.5 font-sans">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => item.action()}
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
                        <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 group-hover:scale-105 transition-transform">
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

      {/* Wallet Modal Overlay */}
      {isWalletOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-[#0A0D14] rounded-3xl border border-[#1F2937] shadow-[0_0_50px_rgba(0,0,0,0.8)] custom-scrollbar">
            
            {/* Close Button */}
            <button 
              onClick={() => setIsWalletOpen(false)}
              className="absolute top-6 right-6 p-2 bg-[#0F141D] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 rounded-xl border border-[#1F2937] hover:border-rose-500/50 transition-all z-10"
              aria-label="Close Wallet"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* Embedded Wallet Component */}
            <div className="p-2 pt-8 sm:pt-2">
              <WalletBilling />
            </div>

          </div>
        </div>
      )}
    </>
  );
}