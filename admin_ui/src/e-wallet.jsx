import React, { useState } from 'react';
import { 
  Wallet, ArrowUpRight, ArrowDownLeft, PlusCircle, CreditCard, 
  DollarSign, TrendingUp, RefreshCw, CheckCircle2, Clock, Search, Filter
} from 'lucide-react';

export default function WalletBilling() {
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Sample Wallet Metrics
  const stats = [
    { label: 'Total Revenue', value: '$12,450.00', change: '+14.2%', isPositive: true, icon: TrendingUp },
    { label: 'Available Balance', value: '$4,280.00', change: '+8.5%', isPositive: true, icon: Wallet },
    { label: 'Pending Payouts', value: '$850.00', change: '-2.1%', isPositive: false, icon: Clock },
    { label: 'Monthly Expenses', value: '$1,920.00', change: '+4.0%', isPositive: false, icon: CreditCard },
  ];

  // Transaction History Data
  const transactions = [
    { id: 'TXN-9041', user: 'KHALIL_VIP', type: 'Top-Up', amount: '+$50.00', method: 'Credit Card', status: 'Completed', date: '2026-09-29 18:42' },
    { id: 'TXN-9040', user: 'Station #04', type: 'Hourly Pass', amount: '+$12.50', method: 'Station Wallet', status: 'Completed', date: '2026-09-29 17:15' },
    { id: 'TXN-9039', user: 'SAYARI_ADMIN', type: 'Payout', amount: '-$300.00', method: 'Bank Transfer', status: 'Pending', date: '2026-09-28 22:04' },
    { id: 'TXN-9038', user: 'YOUSSEF_PRO', type: 'Tournament Fee', amount: '+$25.00', method: 'e-Dinar', status: 'Completed', date: '2026-09-28 14:30' },
    { id: 'TXN-9037', user: 'Hardware Refill', type: 'Expense', amount: '-$120.00', method: 'Business Card', status: 'Completed', date: '2026-09-27 11:20' },
  ];

  const filteredTransactions = transactions.filter((item) => {
    const matchesSearch = item.user.toLowerCase().includes(searchTerm.toLowerCase()) || item.id.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTab === 'TOP-UP') return matchesSearch && item.type === 'Top-Up';
    if (activeTab === 'PAYOUT') return matchesSearch && item.type === 'Payout';
    return matchesSearch;
  });

  return (
    <div className="space-y-6 font-mono text-zinc-300">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0A0D14] p-6 rounded-3xl border border-[#1F2937]">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-2xl text-purple-400">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white uppercase tracking-wider font-sans">
                Wallet & Billing Dashboard
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Manage gaming house revenues, top-ups, and payout logs
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <PlusCircle className="w-4 h-4" />
            <span>Add Funds / Top-Up</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-[#0F141D] hover:bg-[#1A2235] text-zinc-300 border border-[#1F2937] hover:border-zinc-700 font-bold text-xs rounded-xl transition-all">
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            <span>Request Payout</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-[#0A0D14] p-5 rounded-2xl border border-[#1F2937] space-y-3 relative overflow-hidden group hover:border-purple-500/30 transition-all">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-xs font-bold uppercase">{stat.label}</span>
                <Icon className="w-4 h-4 text-zinc-400 group-hover:text-purple-400 transition-colors" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-white font-sans">{stat.value}</span>
                <span className={`text-[11px] font-bold ${stat.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stat.change}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="bg-[#0A0D14] rounded-3xl border border-[#1F2937] p-6 space-y-5">
        
        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
          
          {/* Tabs */}
          <div className="flex items-center p-1 bg-[#0F141D] rounded-xl border border-[#1F2937] w-full sm:w-auto">
            {['ALL', 'TOP-UP', 'PAYOUT'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTab === tab
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'text-zinc-500 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search user or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0F141D] border border-[#1F2937] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>

        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 text-[11px] text-zinc-500 uppercase tracking-wider">
                <th className="pb-3 px-3">Transaction ID</th>
                <th className="pb-3 px-3">User / Station</th>
                <th className="pb-3 px-3">Type</th>
                <th className="pb-3 px-3">Method</th>
                <th className="pb-3 px-3">Amount</th>
                <th className="pb-3 px-3">Status</th>
                <th className="pb-3 px-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 text-xs">
              {filteredTransactions.map((tx) => {
                const isPositive = tx.amount.startsWith('+');
                return (
                  <tr key={tx.id} className="hover:bg-purple-900/10 transition-colors">
                    <td className="py-3.5 px-3 font-mono font-bold text-zinc-400">{tx.id}</td>
                    <td className="py-3.5 px-3 font-bold text-white font-sans">{tx.user}</td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-zinc-900 border border-zinc-800 text-zinc-300">
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-zinc-400">{tx.method}</td>
                    <td className={`py-3.5 px-3 font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.amount}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        tx.status === 'Completed' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {tx.status === 'Completed' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right text-zinc-500 text-[11px]">{tx.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}