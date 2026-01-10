import React, { useEffect, useState } from 'react';

import { metadataService } from '../../hooks/useCoinGeckoMetadata';

interface MarketBadgeProps {
  market: string;
}

export const MarketBadge: React.FC<MarketBadgeProps> = ({ market }) => {
  const [iconUrl, setIconUrl] = useState<string>('');

  // Guard against undefined market
  if (!market) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">?</span>
        </div>
        <span className="text-gray-400 text-xs font-medium">Unknown</span>
      </div>
    );
  }

  const baseAsset = market.split('-')[0];

  useEffect(() => {
    let mounted = true;

    const loadIcon = async () => {
      const metadata = await metadataService.getMetadata(market);
      if (mounted) {
        if (metadata?.image) {
          setIconUrl(metadata.image);
        } else {
          // Fallback to cryptoicons
          setIconUrl(`https://cryptoicons.org/api/icon/${baseAsset.toLowerCase()}/200`);
        }
      }
    };

    loadIcon();

    return () => {
      mounted = false;
    };
  }, [market, baseAsset]);

  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={baseAsset}
            className="w-full h-full object-cover"
            onError={e => {
              // Fallback on error
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = `<span class="text-white text-xs font-bold">${baseAsset.slice(0, 3)}</span>`;
            }}
          />
        ) : (
          <span className="text-white text-xs font-bold">{baseAsset.slice(0, 3)}</span>
        )}
      </div>
      <span className="text-white text-xs font-medium">{baseAsset}</span>
    </div>
  );
};
