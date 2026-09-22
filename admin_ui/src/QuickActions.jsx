import React, { useState } from 'react';
import { Bell, Search, ShieldAlert, Check, AlertTriangle, X } from 'lucide-react';

export const QuickActions = ({onOpenSearch }) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Station #12 Disconnected', time: '2m ago', type: 'alert' },
    { id: 2, title: 'Tournament Bracket Updated', time: '15m ago', type: 'info' },
    { id: 3, title: 'Admin Session Approved', time: '1h ago', type: 'success' },
  ]);

  const clearNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  return (
    <div className="flex items-center gap-2">
      <button 
        onClick={onOpenSearch}
        className="p-2 rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800/80 border border-transparent hover:border-cyan-500/30 transition-all duration-300"
        title="Quick Search (Ctrl + K)"
      >
        <Search className="w-4 h-4" />
      </button>
      <div className="relative">
        <button 
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800/80 border border-transparent hover:border-cyan-500/30 transition-all duration-300"
        >
          <Bell className="w-4 h-4" />
          {notifications.length > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)]" />
          )}
        </button>

        {showNotifications && (
          <div className="absolute top-full right-0 mt-2 w-72 bg-zinc-900 border border-cyan-500/30 rounded-xl shadow-2xl p-3 z-50">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-xs font-semibold text-white">
              <span>Notifications ({notifications.length})</span>
              {notifications.length > 0 && (
                <button 
                  onClick={() => setNotifications([])} 
                  className="text-[10px] text-zinc-500 hover:text-cyan-400"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-center text-xs text-zinc-500 py-4">No new alerts</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="flex items-center justify-between p-2 rounded bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                    <div className="flex items-center gap-2">
                      {n.type === 'alert' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                      {n.type === 'info' && <Bell className="w-3.5 h-3.5 text-cyan-400" />}
                      {n.type === 'success' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      <div>
                        <p className="text-xs text-zinc-200">{n.title}</p>
                        <span className="text-[9px] text-zinc-500">{n.time}</span>
                      </div>
                    </div>
                    <button onClick={() => clearNotification(n.id)} className="text-zinc-600 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};