import React, { useState } from 'react';
import { StationCard } from './stationcard';
import { StationStats } from './stationstats';
import { Search, ShieldAlert } from 'lucide-react';

const INITIAL_STATIONS = Array.from({ length: 25 }, (_, i) => {
  const idNum = i + 1;
  const isOccupied = idNum % 4 !== 0 && idNum !== 7 && idNum !== 15;
  const isMaintenance = idNum === 7 || idNum === 15;

  const games = ['Valorant', 'CS2', 'League of Legends', 'Apex Legends', 'Rocket League', 'Dota 2'];
  const players = ['ShadowNinja', 'ViperX', 'Ghost_Rider', 'CyberAce', 'NeonPulse', 'K3llog', 'ZeroCool'];

  return {
    id: `ST-${idNum < 10 ? '0' + idNum : idNum}`,
    status: isMaintenance ? 'maintenance' : isOccupied ? 'occupied' : 'idle',
    player: isOccupied ? players[i % players.length] : null,
    playerIp: isOccupied ? `10.240.4.${100 + idNum}` : null, // Player Client IP
    stationIp: `192.168.1.${10 + idNum}`,                    // Station Hardware IP
    game: isOccupied ? games[i % games.length] : null,
    timeRemaining: isOccupied ? `${Math.floor(Math.random() * 2) + 1}h ${Math.floor(Math.random() * 50)}m` : null,
    progress: isOccupied ? Math.floor(Math.random() * 60) + 20 : 0,
    gpu: idNum <= 5 ? 'RTX 4090 • 240Hz' : 'RTX 4080 • 240Hz',
    isVip: idNum <= 5,
    ping: Math.floor(Math.random() * 12) + 8,
    zone: idNum <= 5 ? 'VIP Zone' : idNum <= 15 ? 'Main Hall' : 'Console Lounge',
  };
});

export const StationGrid = () => {
  const [stations, setStations] = useState(INITIAL_STATIONS);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterZone, setFilterZone] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleToggleLock = (id) => {
    setStations(stations.map(s => {
      if (s.id === id) {
        const nextStatus = s.status === 'maintenance' ? 'idle' : 'maintenance';
        return { ...s, status: nextStatus, player: null, playerIp: null, game: null };
      }
      return s;
    }));
  };

  const handleRestart = (id) => {
    alert(`Reboot command dispatched to ${id}`);
  };

  const handleLockAllIdle = () => {
    setStations(stations.map(s => s.status === 'idle' ? { ...s, status: 'maintenance' } : s));
  };

  const filteredStations = stations.filter(s => {
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
    const matchesZone = filterZone === 'all' || s.zone === filterZone;
    const query = searchQuery.toLowerCase();
    
    const matchesSearch = 
      s.id.toLowerCase().includes(query) ||
      (s.player && s.player.toLowerCase().includes(query)) ||
      (s.playerIp && s.playerIp.toLowerCase().includes(query)) ||
      (s.game && s.game.toLowerCase().includes(query));

    return matchesStatus && matchesZone && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <StationStats stations={stations} />

      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800">
        <div className="flex items-center gap-1 overflow-x-auto pb-2 lg:pb-0">
          {['all', 'occupied', 'idle', 'maintenance'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
                filterStatus === status
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)]'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {status === 'all' ? 'All Stations' : status}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search station, player, IP, game..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-500/50 transition-colors font-mono"
            />
          </div>

          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Zones</option>
            <option value="VIP Zone">VIP Zone</option>
            <option value="Main Hall">Main Hall</option>
            <option value="Console Lounge">Console Lounge</option>
          </select>

          <button
            onClick={handleLockAllIdle}
            title="Lock All Idle PCs"
            className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-black transition-all"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filteredStations.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800 text-zinc-500">
          <p className="text-sm font-semibold">No stations match your search criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredStations.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              onToggleLock={handleToggleLock}
              onRestart={handleRestart}
            />
          ))}
        </div>
      )}
    </div>
  );
};