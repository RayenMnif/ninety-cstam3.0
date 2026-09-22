import React from 'react';
import { Monitor, Zap, Clock, ShieldAlert } from 'lucide-react';

export const StationStats = ({ stations }) => {
  const total = stations.length;
  const occupied = stations.filter(s => s.status === 'occupied').length;
  const idle = stations.filter(s => s.status === 'idle').length;
  const maintenance = stations.filter(s => s.status === 'maintenance').length;
  const occupancyRate = Math.round((occupied / total) * 100);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Active Stations */}
      <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Occupancy Rate</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-white font-mono">{occupancyRate}%</span>
            <span className="text-xs text-cyan-400 font-semibold">{occupied}/{total} active</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <Zap className="w-5 h-5" />
        </div>
      </div>

      {/* Live Gaming Sessions */}
      <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">In-Game Players</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-400 font-mono">{occupied}</span>
            <span className="text-xs text-zinc-500">Stations live</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <Clock className="w-5 h-5" />
        </div>
      </div>

      {/* Available Stations */}
      <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Ready to Book</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-zinc-200 font-mono">{idle}</span>
            <span className="text-xs text-zinc-500">Stations idle</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
          <Monitor className="w-5 h-5" />
        </div>
      </div>

      {/* Maintenance / Issues */}
      <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">System Maintenance</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-amber-400 font-mono">{maintenance}</span>
            <span className="text-xs text-zinc-500">Locked / Offline</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <ShieldAlert className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
     