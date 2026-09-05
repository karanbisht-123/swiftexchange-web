import React, { useState } from 'react';

import { getCoinIconUrl } from '../../services/coinIconService';

interface CoinIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export const CoinIcon: React.FC<CoinIconProps> = ({ symbol, size = 24, className = '' }) => {
  const [error, setError] = useState<boolean>(false);
  const iconUrl = getCoinIconUrl(symbol);

  const iconStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
  };

  const containerClasses = `flex items-center justify-center shrink-0 ${className}`;

  if (error || !iconUrl) {
    const initial = symbol
      ? (symbol.replace(/1000/, '').split('-')[0]?.[0] || 'A').toUpperCase()
      : 'A';
    return (
      <div
        className={`${containerClasses} bg-brand/10 text-brand font-bold border border-brand/20`}
        style={{ ...iconStyle, fontSize: size * 0.55 }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={iconUrl}
      alt={`${symbol} icon`}
      className={containerClasses}
      style={{ ...iconStyle, objectFit: 'contain' }}
      onError={() => setError(true)}
    />
  );
};
