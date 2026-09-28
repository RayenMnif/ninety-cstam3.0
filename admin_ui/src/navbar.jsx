import React, { useState } from 'react';
import { 
  Headphones, LayoutGrid, Users, Activity, 
  Bell, Shield, User as UserIcon, LogOut, LogIn, Sliders, ChevronDown
} from 'lucide-react';
import SettingsDropdown from './Settings';
import NotificationsDropdown from './notifications';
export default function Navbar({ activeTab, setActiveTab, user, onSignIn, onSignOut }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Tabs based on the provided reference image
  const navItems = [
    { id: 'GRID', label: 'STATION GRID', icon: LayoutGrid, count: '6/10' },
    { id: 'USERS', label: 'USERS', icon: Users, count: '6' },
    { id: 'TELEMETRY', label: 'TELEMETRY', icon: Activity },
  ];

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-[#0A0D14] border-b border-[#1F2937] text-xs text-[#8B949E] relative">
      
      {/* Logo Section */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 border border-purple-900/50 rounded-2xl text-purple-500 bg-[#0F141D]">
          <Headphones className="w-6 h-6" />
        </div>
        <div className="leading-tight">
          <div className="text-white font-black text-xl font-sans tracking-tight">ninety</div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-[#8B949E]">.GAMING HOUSE</div>
        </div>
      </div>

      {/* Main Navigation Container */}
      <div className="hidden lg:flex items-center p-1.5 bg-[#0F141D] rounded-full border border-[#1F2937]">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex items-center gap-2.5 px-6 py-2.5 rounded-full font-black tracking-wider uppercase transition-all duration-200 ${
                isActive 
                  ? 'bg-[#1A2235] text-white' 
                  : 'bg-transparent text-[#8B949E] hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#8B949E]'}`} />
              <span className="text-[11px] mt-0.5">{item.label}</span>
              
              {/* Dynamic Count Badge */}
              {item.count && (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono ${
                  isActive 
                    ? 'bg-purple-500 text-[#07090E] shadow-[0_0_12px_rgba(168,85,247,0.6)]' 
                    : 'bg-[#1F2937] text-[#8B949E]'
                }`}>
                  {item.count}
                </span>
              )}

              {/* Electric Purple Bottom Indicator Line */}
              {isActive && (
                <div className="absolute -bottom-[7px] left-6 right-6 h-[3px] bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,1)] rounded-t-md" />
              )}
            </button>
          );
        })}
      </div>

      {/* Right Controls & Profile */}
      <div className="flex items-center gap-4">

        {/* Notifications */}
        <NotificationsDropdown />
       

        {/* Standalone Settings Dropdown Menu Component */}
        <SettingsDropdown />

        {/* AUTHENTICATION CONTROL */}
        {user ? (
          <div className="relative pl-4 border-l border-[#1F2937]">
            {/* User Profile Trigger Badge */}
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-xl border border-purple-500/50 flex items-center justify-center text-purple-500 bg-[#0F141D] overflow-hidden shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-[#0A0D14] border border-purple-500 rounded-md flex items-center justify-center">
                  <Shield className="w-3 h-3 text-purple-500" />
                </div>
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <div className="text-white font-bold font-sans text-sm">{user.name}</div>
                <div className="text-purple-500 text-[10px] font-bold font-mono mt-0.5">
                  {user.role}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-[#8B949E] ml-1" />
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-4 w-64 bg-[#0F141D] border border-[#1F2937] rounded-2xl p-4 shadow-2xl z-50 space-y-3 font-sans">
                <div className="pb-3 border-b border-[#1F2937]">
                  <div className="text-white font-bold text-sm">{user.name}</div>
                  <div className="text-xs text-[#6B7280] truncate font-mono mt-0.5">{user.email}</div>
                </div>

                <div className="space-y-1 text-xs">
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-[#D1D5DB] hover:bg-[#1A2235] rounded-xl transition-colors">
                    <UserIcon className="w-4 h-4 text-[#8B949E]" />
                    <span>Admin Profile</span>
                  </button>
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-[#D1D5DB] hover:bg-[#1A2235] rounded-xl transition-colors">
                    <Sliders className="w-4 h-4 text-[#8B949E]" />
                    <span>Security Preferences</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-[#1F2937]">
                  <button 
                    onClick={() => {
                      setIsProfileOpen(false);
                      onSignOut();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-purple-400 hover:bg-purple-500/10 rounded-xl transition-colors font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="pl-4 border-l border-[#1F2937]">
            <button 
              onClick={onSignIn}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-500/10 border border-purple-500/40 hover:bg-purple-500/20 text-purple-500 font-bold rounded-full transition-all duration-200 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          </div>
        )}

      </div>
    </header>
  );
}