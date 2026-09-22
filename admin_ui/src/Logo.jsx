import React from 'react';
import {Headset} from 'lucide-react';

export const Logo = () => {
  return (
    <div className="flex items-center gap-3 cursor-pointer group">
      <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-black group-hover:shadow-[0_0_20px_rgba(6,182,212,0.6)] transition-all duration-300">
        <Headset className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
      </div>
      <div>
        <span className="text-lg font-black tracking-wider text-white  font-">
          ninety<span className="text-cyan-400"></span>
        </span>
        <span className="block text-[10px] font-sans tracking-widest text-zinc-500 uppercase -mt-1">
          .GAMING HOUSE
        </span>
      </div>
    </div>
  );
};