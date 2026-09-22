import React from 'react';

export const NavTab = ({ id, label, icon: Icon, badge, activeTab, setActiveTab }) => {
  const isActive = activeTab === id;

  return (
    <div className="relative flex flex-col items-center justify-center py-1">
      <button
        onClick={() => setActiveTab(id)}
        className={`flex items-center gap-2.5 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
          isActive
            ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700/80'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border border-transparent'
        }`}
      >
        <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-cyan-400' : 'text-zinc-400'}`} />
        
        <span>{label}</span>

        {badge !== undefined && (
          <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
            isActive
              ? 'bg-cyan-400 text-black shadow-[0_0_10px_rgba(6,182,212,0.8)]'
              : 'bg-zinc-800 text-zinc-400'
          }`}>
            {badge}
          </span>
        )}
      </button>

      {isActive && (
        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-[80%] h-0.75 bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(6,182,212,1)]" />
      )}
    </div>
  );
};