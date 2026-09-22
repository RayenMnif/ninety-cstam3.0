import React, { useState, useEffect } from 'react';
import { Wifi, RefreshCw } from 'lucide-react';

export const ConnectionStatus = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [ping, setPing] = useState(14);
  const [selectedNode, setSelectedNode] = useState('EU-CENTRAL-1');

  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected) {
        setPing(Math.floor(Math.random() * (22 - 12 + 1)) + 12);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-3 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-cyan-500/40 transition-all group"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            isConnected ? 'bg-cyan-400' : 'bg-red-500'
          }`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
            isConnected ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)]' : 'bg-red-500'
          }`} />
        </span>

        <div className="flex flex-col text-left leading-none">
          <span className="text-[11px] font-extrabold text-white uppercase tracking-wider group-hover:text-cyan-400 transition-colors">
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className="text-[9px] font-mono text-zinc-400 mt-1">
            {isConnected ? `${ping}ms • ${selectedNode}` : 'Disconnected'}
          </span>
        </div>
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-2 w-64 p-3.5 rounded-xl bg-zinc-900 border border-cyan-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md z-50">
          <div className="text-xs font-semibold text-white mb-2.5 flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" /> Connection Diagnostics
            </span>
            <button 
              onClick={() => setPing(10)} 
              className="text-zinc-500 hover:text-cyan-400 transition-colors"
              title="Ping test"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2 text-[11px] font-mono">
            <div className="flex justify-between items-center text-zinc-400">
              <span>Region Node:</span>
              <select
                value={selectedNode}
                onChange={(e) => setSelectedNode(e.target.value)}
                className="bg-zinc-800 text-cyan-400 rounded px-1.5 py-0.5 text-[10px] border border-zinc-700 outline-none"
              >
                <option value="EU-CENTRAL-1">EU-CENTRAL-1</option>
                <option value="US-EAST-1">US-EAST-1</option>
                <option value="AP-SOUTH-1">AP-SOUTH-1</option>
              </select>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Latency:</span>
              <span className={ping < 30 ? 'text-emerald-400' : 'text-amber-400'}>{ping} ms</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Packet Loss:</span>
              <span className="text-emerald-400">0.00%</span>
            </div>
          </div>

          <button
            onClick={() => setIsConnected(!isConnected)}
            className={`mt-3 w-full py-1.5 rounded text-xs font-semibold transition-all ${
              isConnected 
                ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black'
            }`}
          >
            {isConnected ? 'Simulate Disconnect' : 'Reconnect Server'}
          </button>
        </div>
      )}
    </div>
  );
};