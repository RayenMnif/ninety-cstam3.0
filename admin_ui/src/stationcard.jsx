import React, { useState } from 'react';
import { Lock, Unlock, RotateCcw, Cpu, Gamepad2, User, MoreVertical, PlusCircle, Network } from 'lucide-react';

export const StationCard = ({ station, onToggleLock, onRestart }) => {
  const [showMenu, setShowMenu] = useState(false);

  const getStatusColor = () => {
    switch (station.status) {
      case 'occupied':
        return 'border-cyan-500/40 bg-zinc-900/90 shadow-[0_0_15px_rgba(6,182,212,0.15)]';
      case 'idle':
        return 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700';
      case 'maintenance':
        return 'border-amber-500/30 bg-amber-950/10';
      default:
        return 'border-zinc-800 bg-zinc-900';
    }
  };

  const getBadgeColor = () => {
    switch (station.status) {
      case 'occupied':
        return 'bg-cyan-400/10 text-cyan-400 border-cyan-500/30';
      case 'idle':
        return 'bg-emerald-400/10 text-emerald-400 border-emerald-500/30';
      case 'maintenance':
        return 'bg-amber-400/10 text-amber-400 border-amber-500/30';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  return (
    <div className={`relative flex flex-col justify-between p-4 rounded-2xl border transition-all duration-300 group ${getStatusColor()}`}>
      
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black font-mono text-white tracking-wide">
              {station.id}
            </span>
            {station.isVip && (
              <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded">
                VIP POD
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 mt-0.5">
            <Cpu className="w-3 h-3 text-zinc-400" /> {station.gpu}
          </p>
        </div>

        {/* Status Badge & Actions Dropdown */}
        <div className="flex items-center gap-1">
          <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${getBadgeColor()}`}>
            {station.status}
          </span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Quick Menu Popover */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1 z-30 text-xs font-semibold">
                <button
                  onClick={() => { onToggleLock(station.id); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-zinc-300 hover:text-cyan-400 hover:bg-zinc-800 transition-colors"
                >
                  {station.status === 'maintenance' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {station.status === 'maintenance' ? 'Unlock PC' : 'Lock PC'}
                </button>
                <button
                  onClick={() => { onRestart(station.id); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-zinc-300 hover:text-cyan-400 hover:bg-zinc-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reboot Rig
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle Body: Player, Player IP & Game Details */}
      <div className="my-4 py-3 px-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
        {station.status === 'occupied' ? (
          <div className="space-y-2">
            {/* Player Name + Player Assigned IP Badge */}
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-zinc-200 font-bold truncate">
                <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> 
                <span className="truncate">{station.player}</span>
              </span>
              <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded shadow-[0_0_6px_rgba(6,182,212,0.2)] shrink-0 ml-1">
                {station.playerIp}
              </span>
            </div>

            {/* Active Game + Remaining Time */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/80">
              <span className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                <Gamepad2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {station.game}
              </span>
              <span className="font-mono text-cyan-400 font-bold text-xs">
                {station.timeRemaining}
              </span>
            </div>

            {/* Time Bar Indicator */}
            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1">
              <div 
                className="bg-cyan-400 h-full rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)]" 
                style={{ width: `${station.progress}%` }} 
              />
            </div>
          </div>
        ) : station.status === 'idle' ? (
          <div className="flex flex-col items-center justify-center py-2 text-center">
            <span className="text-xs text-zinc-400 font-medium">Station Unassigned</span>
            <button className="mt-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
              <PlusCircle className="w-3.5 h-3.5" /> Start Session
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2 text-center text-amber-400/80">
            <Lock className="w-4 h-4 mb-1" />
            <span className="text-xs font-bold uppercase tracking-wider">Station Locked</span>
          </div>
        )}
      </div>

      {/* Card Footer: Station Network IP & Ping */}
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/40">
        <span className="flex items-center gap-1">
          <Network className="w-3 h-3 text-zinc-600" />
          Station: {station.stationIp}
        </span>
        <span className={station.ping < 20 ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
          {station.ping}ms
        </span>
      </div>
    </div>
  );
};