import React, { useState } from 'react';
import { Navbar } from './navbar';
import { StationGrid } from './stationgrid';
import { PlayerManagement } from './playeraccount';
import { ShieldAlert, Search, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('stations'); 
  const [isLockdown, setIsLockdown] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const renderActiveView = () => {
    switch (activeTab) {
      case 'stations':
        return <StationGrid />;
      case 'players': 
        return <PlayerManagement />;
      default:
        return (
          <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 backdrop-blur-sm shadow-2xl">
            <h1 className="text-2xl font-bold text-white capitalize flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)]" />
              {activeTab.replace('-', ' ')} Console
            </h1>
            <p className="mt-2 text-zinc-400 text-sm">
              View operational monitoring for <span className="text-cyan-400 font-mono">{activeTab}</span>.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500 selection:text-black">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderActiveView()}
      </main>

      {isSearchOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center pt-20 px-4">
          <div className="bg-zinc-900 border border-cyan-500/40 rounded-xl w-full max-w-lg p-4 shadow-[0_0_30px_rgba(6,182,212,0.3)]">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
              <Search className="w-5 h-5 text-cyan-400" />
              <input
                type="text"
                placeholder="Search stations, players, IPs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="bg-transparent text-white placeholder-zinc-500 outline-none w-full text-sm font-mono"
              />
              <button onClick={() => setIsSearchOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}