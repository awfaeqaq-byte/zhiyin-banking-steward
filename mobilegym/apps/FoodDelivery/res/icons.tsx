import type React from 'react';

export const IcLauncher: React.FC<{ size?: string | number; className?: string }> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
    <rect width="48" height="48" rx="13" fill="#FF4D72" />
    <path d="M12 20.5h24l-2 15H14l-2-15Z" fill="white" />
    <path d="M17 20.5a7 7 0 0 1 14 0" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
    <path d="M19 27h10M19 31h7" stroke="#FF4D72" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
