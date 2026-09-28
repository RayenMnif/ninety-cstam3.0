import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, AlertTriangle, Cpu, ShieldAlert, 
  HardDrive, CheckCheck, Trash2, ChevronRight, Zap
} from 'lucide-react';

export default function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Initial mock notifications tailored for Gaming House Ops
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: 'Unknown Peripheral Detected',
      desc: 'Unapproved USB Mass Storage connected to PC-08.',
      time: '2 mins ago',
      type: 'warning',
      icon: HardDrive,
      unread: true,
    },
    {
      id: 2,
      title: 'CRITICAL: Emergency Halt',
      desc: 'Manual power cutoff triggered for VIP Station 03.',
      time: '14 mins ago',
      type: 'danger',
      icon: ShieldAlert,
      unread: true,
    },
    {
      id: 3,
      title: 'Thermal Spike Warning',
      desc: 'PC-12 GPU temp exceeded threshold (89°C).',
      time: '45 mins ago',
      type: 'warning',
      icon: Cpu,
      unread: false,
    },
    {
      id: 4,
      title: 'High Network Latency',
      desc: 'Switch #2 packet loss spike detected (12%).',
      time: '1 hr ago',
      type: 'info',
      icon: Zap,
      unread: false,
    },
  ]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  // Auto-close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })));
  };

  const clearNotification = (id, e) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 transition-all rounded-xl ${
          isOpen 
            ? 'text-white bg-purple-500/10 border border-purple-500/30' 
            : 'text-[#8B949E] hover:text-white hover:bg-white/5'
        }`}
      >
        <Bell className={`w-5 h-5 transition-transform ${isOpen ? 'scale-110 text-purple-400' : ''}`} />
    
        {/* Dynamic Unread Indicator Ping */}
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500 border-2 border-[#0A0D14]"></span>
          </span>
        )}
      </button>

      {/* Dropdown Menu Container */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 z-50 rounded-2xl bg-gradient-to-br from-red-500/30 via-purple-500/40 to-blue-600/30 p-[1px] shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(168,85,247,0.2)]">
          <div className="bg-[#0F141D] rounded-2xl p-2 font-mono">
            
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-[#1F2937] mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">System Alerts</h4>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500 text-[#07090E]">
                    {unreadCount} NEW
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors font-sans"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark read</span>
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto space-y-1 pr-1 font-sans custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-[#8B949E] text-xs font-mono">
                  No active system notifications
                </div>
              ) : (
                notifications.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className={`w-full p-2.5 rounded-xl flex items-start gap-3 transition-all relative group ${
                        item.unread ? 'bg-[#1A2235]/80 border-l-2 border-purple-500' : 'hover:bg-[#1A2235]/40 opacity-75'
                      }`}
                    >
                      {/* Alert Icon Badge */}
                      <div className={`p-2 rounded-lg border shrink-0 ${
                        item.type === 'danger'
                          ? 'bg-red-500/10 border-red-500/30 text-red-400'
                          : item.type === 'warning'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Notification Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-white truncate">{item.title}</p>
                          <span className="text-[9px] text-[#8B949E] font-mono shrink-0 ml-2">{item.time}</span>
                        </div>
                        <p className="text-[11px] text-[#8B949E] mt-0.5 leading-snug">{item.desc}</p>
                      </div>

                      {/* Delete / Clear Action on Hover */}
                      <button
                        onClick={(e) => clearNotification(item.id, e)}
                        className="absolute right-2 top-2 p-1 text-[#8B949E] opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>



          </div>
        </div>
      )}
    </div>
  );
}