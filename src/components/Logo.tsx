import React from 'react';

export const Logo = ({ className = "w-full" }: { className?: string }) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <h1 className="text-3xl md:text-3xl font-black italic tracking-tighter flex items-center">
      <span className="text-[#138eff]">NINZ</span>
      <span className="text-white ml-2 relative">
        <span className="absolute -top-7 -left-10 w-20 h-20 pointer-events-none">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="50" cy="50" rx="35" ry="10" transform="rotate(-15 50 50)" stroke="currentColor" strokeWidth="3" className="text-white" />
            <path d="M40 20 L60 80 M20 50 L80 40" stroke="#138eff" strokeWidth="4" />
          </svg>
        </span>
        TRADER
      </span>
    </h1>
  </div>
);
