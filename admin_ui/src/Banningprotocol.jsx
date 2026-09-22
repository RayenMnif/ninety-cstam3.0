import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, X } from 'lucide-react';

export const BanModal = ({ isOpen, username, onClose, onConfirm }) => {
  const [reason, setReason] = useState('Terms of Service Violation');
  
  const PRESET_REASONS = [
    'Terms of Service Violation',
    'Detected Cheating Software',
    'Verbal Abuse / Harassment',
    'Griefing / Intentional Feeding',
    'Account Sharing',
    'Payment Fraud'
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-[0_0_40px_rgba(239,68,68,0.2)] animate-scaleIn">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-5 pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-3 text-red-400">
                <ShieldAlert className="w-6 h-6" />
                <h2 className="text-xl font-black text-white font-mono tracking-tight">Account Deactivation</h2>
            </div>
            <button onClick={onClose} className="p-1 text-zinc-600 hover:text-white transition-colors">
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Warning Body */}
        <div className="flex items-start gap-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 mb-5">
            <AlertTriangle className="w-10 h-10 shrink-0 mt-0.5" />
            <div>
                <p className="font-bold text-sm text-white">Action Confirmation Required</p>
                <p className="text-xs">You are about to place an <span className='font-bold text-red-200'>Immediate Ban</span> on the account <span className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-white">{username}</span>. This player will be disconnected from any active session.</p>
            </div>
        </div>

        {/* Reason Input */}
        <div className="space-y-3 mb-6">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest font-mono">Select Violation Reason</label>
            
            <select 
                value={reason} 
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-red-500/50"
            >
                {PRESET_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                ))}
                <option value="custom">-- Custom Reason --</option>
            </select>

            {reason === 'custom' && (
                 <textarea 
                    placeholder="Enter detailed ban justification..."
                    className="w-full h-20 bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl p-3 text-xs outline-none focus:border-red-500/50 resize-none font-mono"
                 />
            )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-all"
          >
            Confirm Permanent Ban
          </button>
        </div>
      </div>
    </div>
  );
};