import React from 'react';
import { LayoutGrid, Users, Settings, Activity, Trophy } from 'lucide-react'; 
import { Logo } from './logo';
import { NavTab } from './navtab';
import { ConnectionStatus } from './ActiveSessions';
import { QuickActions } from './QuickActions';
import { AdminProfile } from './adminprofile';

export const Navbar = ({ activeTab, setActiveTab, isLockdown, setIsLockdown, onOpenSearch }) => {
  const navItems = [
    { id: 'stations', label: 'Station Grid', icon: LayoutGrid, badge: '24/30' },
    { id: 'players', label: 'Users', icon: Users, badge: '6' }, 
    { id: 'tournaments', label: 'Tournaments', icon: Trophy },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          <Logo />

          <nav className="hidden md:flex items-center gap-2 bg-zinc-900/90 px-3 py-1.5 rounded-2xl border border-zinc-800">
            {navItems.map((item) => (
              <NavTab
                key={item.id}
                {...item}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            ))}
          </nav>

          <div className="flex items-center gap-3 sm:gap-4">
            <ConnectionStatus />
            <QuickActions 
              isLockdown={isLockdown} 
              setIsLockdown={setIsLockdown} 
              onOpenSearch={onOpenSearch} 
            />
            <AdminProfile />
          </div>
        </div>
      </div>
    </header>
  );
};
