import React, { useState } from 'react';
import { StationCard } from './stationcard';
import { StationStats } from './stationstats';
import { Search, ShieldAlert } from 'lucide-react';

// Generates exactly 10 stations (ST-01 through ST-10)
const INITIAL_STATIONS = Array.from({ length: 10 }, (_, i) => {
  const idNum = i + 1;
  const isMaintenance = idNum === 7 || idNum === 9;
  const isOccupied = !isMaintenance && idNum !== 4 && idNum !== 8;

  const games = ['Valorant', 'CS2', 'League of Legends', 'Apex Legends', 'Rocket League', 'Dota 2'];
  const players = ['ShadowNinja', 'ViperX', 'Ghost_Rider', 'CyberAce', 'NeonPulse', 'K3llog', 'ZeroCool'];

  return {
    id: `ST-${idNum < 10 ? '0' + idNum : idNum}`,
    status: isMaintenance ? 'maintenance' : isOccupied ? 'occupied' : 'idle',
    player: isOccupied ? players[i % players.length] : null,
    playerIp: isOccupied ? `10.240.4.${100 + idNum}` : null, 
    stationIp: `192.168.1.${10 + idNum}`,                    
    game: isOccupied ? games[i % games.length] : null,
    timeRemaining: isOccupied ? `${Math.floor(Math.random() * 2) + 1}h ${Math.floor(Math.random() * 50)}m` : null,
    progress: isOccupied ? Math.floor(Math.random() * 60) + 20 : 0,
    gpu: idNum <= 5 ? 'RTX 4090 • 240Hz' : 'RTX 4080 • 240Hz',
    isVip: idNum <= 5,
    ping: Math.floor(Math.random() * 12) + 8,
    zone: idNum <= 5 ? 'VIP Zone' : 'Main Hall',
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
    <div className="space-y-6 max-w-[1600px] mx-auto font-mono">
      <StationStats stations={stations} />

      {/* Control Toolbar Container with Electric Blue/Purple Gradient Border */}
      <div className="rounded-2xl bg-gradient-to-r from-cyan-500/50 via-purple-500/50 to-blue-600/50 p-[1px] shadow-[0_0_15px_rgba(168,85,247,0.15)]">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0F141D]">
          
          {/* Status Filter Buttons */}
          <div className="flex  items-center gap-1  overflow-x-auto pb-2 lg:pb-0">
            {['all', 'occupied', 'idle', 'maintenance'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase font-sans tracking-wider transition-all whitespace-nowrap ${
                  filterStatus === status
                    ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {status === 'all' ? 'All Stations' : status}
              </button>
            ))}
          </div>

          {/* Search, Zone Dropdown & Lock Button */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search station, player, IP, game..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0A0D14] border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-purple-500/50 transition-colors"
              />
            </div>

            <select
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value)}
              className="bg-[#0A0D14] border border-zinc-800 text-zinc-300 rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-purple-500/50 transition-colors"
            >
              <option value="all">All Zones</option>
              <option value="VIP Zone">VIP Zone</option>
              <option value="Main Hall">Main Hall</option>
            </select>

            <button
              onClick={handleLockAllIdle}
              title="Lock All Idle PCs"
              className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-gradient-to-r hover:from-cyan-500 hover:to-purple-600 hover:text-white hover:border-transparent hover:shadow-[0_0_12px_rgba(168,85,247,0.5)] transition-all"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* Station Cards Grid */}
      {filteredStations.length === 0 ? (
        <div className="rounded-2xl bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-blue-600/30 p-[1px]">
          <div className="p-12 text-center rounded-2xl bg-[#0F141D] text-zinc-500">
            <p className="text-sm font-semibold">No stations match your search criteria.</p>
          </div>
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

export default StationGrid;