import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  subtitle?: string;
  isDarkMode?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showSubtitle = false,
  subtitle = 'E-commerce Marketplace',
  isDarkMode = true,
  className = '',
}) => {
  const logoHeights = {
    sm: 'h-8 sm:h-9',
    md: 'h-10 sm:h-11',
    lg: 'h-14 sm:h-16',
  };

  return (
    <div className={`flex items-center gap-2.5 bg-transparent ${className}`}>
      <img
        src="/logo.png"
        alt="Zid SaaS BD - E-commerce Marketplace"
        className={`${logoHeights[size]} w-auto object-contain rounded-md shadow-xs`}
      />
      {showSubtitle && subtitle && (
        <div
          className={`hidden sm:block pl-2 border-l ${
            isDarkMode ? 'border-slate-700/60 text-slate-400' : 'border-slate-300 text-slate-600'
          } text-[10.5px] uppercase tracking-widest font-bold`}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};

export default BrandLogo;
