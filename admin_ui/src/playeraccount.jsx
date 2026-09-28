import React, { useState } from 'react';
import { Search, UserX, UserCheck, ShieldAlert, AlertTriangle, Filter, MoreVertical } from 'lucide-react';
import { BanModal } from './banningprotocol';

const INITIAL_PLAYERS = [
  { id: 'usr_8821', username: 'ShadowNinja', email: 'alex.t@nexus.com', status: 'active', tier: 'Gold', registered: '2025-01-10', station: 'ST-04' },
  { id: 'usr_1092', username: 'ToxicViper', email: 'm.volkov@red.ru', status: 'banned', tier: 'Silver', registered: '2024-11-22', banReason: 'Repeated Verbal Abuse', banDate: '2026-05-15' },
  { id: 'usr_7734', username: 'NeonPulse', email: 's.lee@cyber.kr', status: 'active', tier: 'Diamond', registered: '2025-02-01', station: 'ST-11' },
  { id: 'usr_5561', username: 'WallHackz', email: 'anonymous@proton.me', status: 'banned', tier: 'Bronze', registered: '2026-03-03', banReason: 'Detected Third-Party Cheating Software', banDate: '2026-06-01' },
  { id: 'usr_9001', username: 'ZeroCool', email: 'g.maddison@uk.co', status: 'active', tier: 'Platinum', registered: '2024-09-19' },
  { id: 'usr_2231', username: 'LaggyLance', email: 'lance.r@isp.net', status: 'active', tier: 'Silver', registered: '2025-04-12', station: 'ST-21' },
];

export const PlayerManagement = () => {
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // State for managing the ban confirmation modal
  const [banModal, setBanModal] = useState({ isOpen: false, playerId: null, username: '' });

  // Handle Unbanning a player immediately
  const handleUnban = (playerId) => {
    setPlayers(players.map(p => p.id === playerId ? { ...p, status: 'active', banReason: null, banDate: null } : p));
  };

  // Open modal to gather reason before banning
  const openBanModal = (playerId, username) => {
    setBanModal({ isOpen: true, playerId, username });
  };

  // Callback when ban is confirmed in Modal
  const confirmBan = (playerId, reason) => {
    const today = new Date().toISOString().split('T')[0];
    setPlayers(players.map(p => p.id === playerId ? 
      { ...p, status: 'banned', banReason: reason, banDate: today, station: null } : p
    ));
    setBanModal({ isOpen: false, playerId: null, username: '' });
    // In a real app, you would also trigger a function to log the player out if they are active on a station
  };

  const filteredPlayers = players.filter(p => {
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      p.username.toLowerCase().includes(query) ||
      p.email.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-xs font-mono">{players.length} Accounts Total</span>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'active', 'banned'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
                filterStatus === status
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)]'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {status} Players
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by username, email, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-500/50 transition-colors font-mono"
          />
        </div>
      </div>

      {/* Players Table */}
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-2xl">
        <table className="w-full text-left text-xs font-mono">
          <thead className="border-b border-zinc-800 bg-zinc-950/50">
            <tr className="text-zinc-400 font-bold text-[11px] uppercase tracking-wider">
              <th className="p-4">User</th>
              <th className="p-4">ID</th>
              <th className="p-4">Status</th>
              <th className="p-4">Active Station</th>
              <th className="p-4">Registered</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-12 text-center text-zinc-600 font-semibold font-sans">
                  No accounts match your criteria.
                </td>
              </tr>
            ) : (
              filteredPlayers.map((player) => (
                <tr key={player.id} className="hover:bg-zinc-800/30 transition-colors group">
                  {/* User Column */}
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold font-sans text-sm ${player.status === 'banned' ? 'bg-red-500/10 text-red-400 border border-red-900' : 'bg-zinc-800 text-zinc-400'}`}>
                            {player.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-bold text-white font-sans text-sm">{player.username}</p>
                            <p className="text-zinc-500 text-[10px]">{player.email}</p>
                        </div>
                    </div>
                  </td>
                  
                  {/* ID Column */}
                  <td className="p-4 text-zinc-500">{player.id}</td>

                  {/* Status Column */}
                  <td className="p-4">
                    {player.status === 'banned' ? (
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-red-500/10 text-red-400 border border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.2)]">
                            <ShieldAlert className="w-3 h-3" /> BANNED
                        </span>
                        <span className="text-[9px] text-red-300/80 max-w-[180px] truncate" title={player.banReason}>
                            Reason: {player.banReason}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <UserCheck className="w-3 h-3" /> Active
                      </span>
                    )}
                  </td>

                  {/* Station Column */}
                  <td className="p-4 font-bold text-cyan-400">
                    {player.status === 'banned' ? '--' : player.station || <span className="text-zinc-600 font-normal">Offline</span>}
                  </td>

                  {/* Registered Column */}
                  <td className="p-4 text-zinc-500">{player.registered}</td>

                  {/* Actions Column */}
                  <td className="p-4 text-right">
                    {player.status === 'banned' ? (
                      <button 
                        onClick={() => handleUnban(player.id)}
                        className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        title="Lift Account Ban"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                    ) : (
                      <button 
                        onClick={() => openBanModal(player.id, player.username)}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Ban Account for Violation"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                    <button className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-700 transition-colors ml-1">
                        <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Ban Reason Input Modal */}
      <BanModal 
        isOpen={banModal.isOpen} 
        username={banModal.username}
        onClose={() => setBanModal({ isOpen: false, playerId: null, username: '' })}
        onConfirm={(reason) => confirmBan(banModal.playerId, reason)}
      />
    </div>
  );
};