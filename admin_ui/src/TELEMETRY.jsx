import React, { useState } from 'react';
import { 
  Cpu, Activity, Thermometer, Wifi, Gauge, AlertTriangle, 
  Fan, HardDrive, Zap, Server, RefreshCw 
} from 'lucide-react';

const INITIAL_TELEMETRY = Array.from({ length: 10 }, (_, i) => {
  const idNum = i + 1;
  const cpuTemp = idNum === 3 ? 82 : idNum === 7 ? 79 : Math.floor(Math.random() * 18) + 52;
  const gpuTemp = idNum === 3 ? 78 : Math.floor(Math.random() * 15) + 50;
  
  const isHighTemp = cpuTemp >= 78 || gpuTemp >= 76;

  return {
    id: `ST-${idNum < 10 ? '0' + idNum : idNum}`,
    zone: idNum <= 5 ? 'VIP Zone' : 'Main Hall',
    status: isHighTemp ? 'warning' : 'healthy',
    
    cpuModel: idNum <= 5 ? 'Intel i9-14900K' : 'Intel i7-13700K',
    cpuUsage: Math.floor(Math.random() * 45) + 35,
    cpuTemp,
    cpuClock: (4.2 + Math.random() * 1.2).toFixed(2),

    gpuModel: idNum <= 5 ? 'NVIDIA RTX 4090' : 'NVIDIA RTX 4080',
    gpuUsage: Math.floor(Math.random() * 50) + 40,
    gpuTemp,
    vramUsage: Math.floor(Math.random() * 40) + 50,

    ramUsageGB: (14 + Math.random() * 12).toFixed(1),
    ramTotalGB: 32,
    ramPercent: Math.floor(Math.random() * 30) + 45,

    fanSpeedRPM: Math.floor(Math.random() * 500) + 1600,
    powerDrawWatts: Math.floor(Math.random() * 150) + 320,

    pingMs: Math.floor(Math.random() * 8) + 8,
    downloadMbps: (Math.random() * 180 + 120).toFixed(1),
    uploadMbps: (Math.random() * 60 + 40).toFixed(1),
  };
});

export const Telemetry = () => {
  const [telemetryData, setTelemetryData] = useState(INITIAL_TELEMETRY);
  const [filter, setFilter] = useState('all'); 

  const avgCpuTemp = Math.round(telemetryData.reduce((acc, curr) => acc + curr.cpuTemp, 0) / telemetryData.length);
  const avgGpuTemp = Math.round(telemetryData.reduce((acc, curr) => acc + curr.gpuTemp, 0) / telemetryData.length);
  const warningCount = telemetryData.filter(s => s.status === 'warning').length;

  const getTempColor = (temp) => {
    if (temp >= 80) return { text: 'text-red-400', bg: 'bg-red-500', badge: 'bg-red-500/10 text-red-400' };
    if (temp >= 74) return { text: 'text-amber-400', bg: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-400' };
    return { text: 'text-cyan-400', bg: 'bg-gradient-to-r from-cyan-400 to-blue-500', badge: 'bg-cyan-500/10 text-cyan-400' };
  };

  const filteredStations = telemetryData.filter(station => {
    if (filter === 'warning') return station.status === 'warning';
    if (filter === 'healthy') return station.status === 'healthy';
    return true;
  });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto font-mono">
      
      {/* Overview Stats Bar with Electric Blue/Purple Gradients */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Stat Card 1 */}
        <div className="rounded-2xl bg-gradient-to-br from-cyan-500/60 via-purple-500/60 to-blue-600/60 p-[1px] shadow-[0_0_15px_rgba(168,85,247,0.15)]">
          <div className="h-full p-4 rounded-2xl bg-[#0F141D] flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Monitored Nodes</p>
              <p className="text-2xl font-black text-white mt-1 font-sans">{telemetryData.length} PCs</p>
              <p className="text-[10px] text-cyan-400 mt-0.5">● 100% Online Telemetry</p>
            </div>
            <div className="p-3 bg-zinc-800/60 rounded-xl text-purple-400 border border-purple-500/30">
              <Server className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Stat Card 2 */}
        <div className="rounded-2xl bg-gradient-to-br from-cyan-500/60 via-purple-500/60 to-blue-600/60 p-[1px] shadow-[0_0_15px_rgba(168,85,247,0.15)]">
          <div className="h-full p-4 rounded-2xl bg-[#0F141D] flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Avg CPU Heat</p>
              <p className="text-2xl font-black text-white mt-1 font-sans">{avgCpuTemp}°C</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">Threshold: Max 85°C</p>
            </div>
            <div className={`p-3 rounded-xl border ${getTempColor(avgCpuTemp).badge} border-current/20`}>
              <Cpu className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Stat Card 3 */}
        <div className="rounded-2xl bg-gradient-to-br from-cyan-500/60 via-purple-500/60 to-blue-600/60 p-[1px] shadow-[0_0_15px_rgba(168,85,247,0.15)]">
          <div className="h-full p-4 rounded-2xl bg-[#0F141D] flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Avg GPU Heat</p>
              <p className="text-2xl font-black text-white mt-1 font-sans">{avgGpuTemp}°C</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">Threshold: Max 83°C</p>
            </div>
            <div className={`p-3 rounded-xl border ${getTempColor(avgGpuTemp).badge} border-current/20`}>
              <Gauge className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Stat Card 4 (Warning State dynamic) */}
        <div className={`rounded-2xl p-[1px] ${warningCount > 0 ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-gradient-to-br from-cyan-500/60 via-purple-500/60 to-blue-600/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]'}`}>
          <div className="h-full p-4 rounded-2xl bg-[#0F141D] flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Thermal Warnings</p>
              <p className={`text-2xl font-black mt-1 font-sans ${warningCount > 0 ? 'text-red-400' : 'text-cyan-400'}`}>
                {warningCount} {warningCount === 1 ? 'Station' : 'Stations'}
              </p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{warningCount > 0 ? 'Requires Inspection' : 'All Systems Nominal'}</p>
            </div>
            <div className={`p-3 rounded-xl border ${warningCount > 0 ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>

      </div>

      {/* Toolbar Filter */}
      <div className="rounded-2xl bg-gradient-to-r from-cyan-500/40 via-purple-500/40 to-blue-600/40 p-[1px]">
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-[#0F141D]">
          <div className="flex items-center gap-2">
            {['all', 'healthy', 'warning'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  filter === status
                    ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {status === 'warning' ? `High Heat (${warningCount})` : status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
            <span>Polling hardware sensor stream every 2s</span>
          </div>
        </div>
      </div>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {filteredStations.map((st) => {
          const cpuColor = getTempColor(st.cpuTemp);
          const gpuColor = getTempColor(st.gpuTemp);

          return (
            <div 
              key={st.id}
              className={`rounded-2xl p-[1px] transition-all duration-300 ${
                st.status === 'warning' 
                  ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.25)]' 
                  : 'bg-gradient-to-br from-cyan-500/40 via-purple-500/40 to-blue-600/40 hover:from-cyan-400 hover:via-purple-400 hover:to-blue-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]'
              }`}
            >
              <div className="h-full p-4 rounded-2xl bg-[#0A0D14]">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div>
                    <span className="text-base font-black text-white font-sans tracking-tight">{st.id}</span>
                    <p className="text-[10px] text-zinc-500">{st.zone}</p>
                  </div>
                  
                  {st.status === 'warning' ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> HIGH HEAT
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                      NOMINAL
                    </span>
                  )}
                </div>

                {/* Hardware Telemetry Specs */}
                <div className="space-y-3 pt-3 text-xs">
                  
                  {/* CPU Heat & Load */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                        <Cpu className="w-3.5 h-3.5 text-purple-400" /> CPU
                      </span>
                      <span className={`font-bold ${cpuColor.text}`}>{st.cpuTemp}°C</span>
                    </div>
                    <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${cpuColor.bg} transition-all duration-500`} 
                        style={{ width: `${(st.cpuTemp / 100) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-zinc-500 pt-0.5">
                      <span>Load: {st.cpuUsage}%</span>
                      <span>Clock: {st.cpuClock} GHz</span>
                    </div>
                  </div>

                  {/* GPU Heat & Load */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                        <Gauge className="w-3.5 h-3.5 text-purple-400" /> GPU
                      </span>
                      <span className={`font-bold ${gpuColor.text}`}>{st.gpuTemp}°C</span>
                    </div>
                    <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${gpuColor.bg} transition-all duration-500`} 
                        style={{ width: `${(st.gpuTemp / 100) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-zinc-500 pt-0.5">
                      <span>Load: {st.gpuUsage}%</span>
                      <span>VRAM: {st.vramUsage}%</span>
                    </div>
                  </div>

                  {/* RAM Usage */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                        <HardDrive className="w-3.5 h-3.5 text-blue-400" /> RAM
                      </span>
                      <span className="font-bold text-zinc-200">{st.ramUsageGB} GB</span>
                    </div>
                    <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500" 
                        style={{ width: `${st.ramPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Fans & Power */}
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
                    <div className="bg-[#0F141D] p-2 rounded-xl border border-zinc-800/60 flex items-center gap-2">
                      <Fan className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />
                      <div>
                        <p className="text-zinc-500 text-[8px] uppercase">Fan Speed</p>
                        <p className="font-bold text-zinc-200">{st.fanSpeedRPM} RPM</p>
                      </div>
                    </div>
                    <div className="bg-[#0F141D] p-2 rounded-xl border border-zinc-800/60 flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-purple-400" />
                      <div>
                        <p className="text-zinc-500 text-[8px] uppercase">Power Draw</p>
                        <p className="font-bold text-zinc-200">{st.powerDrawWatts} W</p>
                      </div>
                    </div>
                  </div>

                  {/* Network Metrics */}
                  <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
                    <div className="flex items-center gap-1 text-cyan-400">
                      <Wifi className="w-3 h-3" />
                      <span>{st.pingMs} ms</span>
                    </div>
                    <div>↓ {st.downloadMbps}</div>
                    <div>↑ {st.uploadMbps}</div>
                  </div>

                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Telemetry;