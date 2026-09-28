import React, { useState } from 'react';
import Navbar from './navbar';
import StationGrid from './stationgrid';
import { PlayerManagement } from './playeraccount';
import { Telemetry } from './TELEMETRY';
import AdminLogin from './adminlogin';

export default function App() {
  const [activeTab, setActiveTab] = useState('GRID');

  const [user, setUser] = useState({
    name: 'Ahmed sayari',
    email: 'ahmed.sayari@ninety.gaminghouse',
    role: 'SUPER ADMIN',
  });

  const handleSignOut = () => setUser(null);
  const handleSignIn = (userData) => setUser(userData);

  if (!user) {
    return <AdminLogin onLogin={handleSignIn} />;
  }

  return (
    <div className="min-h-screen bg-[#07090E] font-mono selection:bg-purple-500/30">
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        user={user}
        onSignIn={() => handleSignIn({ name: 'Ahmed sayari', email: 'ahmed.sayari@ninety.gaminghouse', role: 'SUPER ADMIN' })}
        onSignOut={handleSignOut}
      />
      
      <main className="p-8">
        {activeTab === 'GRID' && <StationGrid />}
        {activeTab === 'USERS' && <PlayerManagement />}
        {activeTab === 'TELEMETRY' && <Telemetry />}
      </main>
    </div>
  );
}