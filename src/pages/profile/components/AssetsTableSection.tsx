import { Search, TrendingDown, TrendingUp } from 'lucide-react';
import React from 'react';

import { getChainLogoUrl } from '../../../modules/evm/utils/Chainregistry';
import { type ChainFilter } from '../../../modules/walletconnect/hooks/useProfilePortfolio';
import { type Asset } from '../../../modules/walletconnect/store/portfolioStore';
import { portfolioUtils } from '../../../modules/walletconnect/utils/portfolioUtils';

interface AssetsTableSectionProps {
  loading: boolean;
  isRefreshing: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  availableChains: ChainFilter[];
  selectedChainFilter: string | number;
  setSelectedChainFilter: (filter: string | number) => void;
  filteredAssets: Asset[];
}

export const AssetsTableSection: React.FC<AssetsTableSectionProps> = ({
  loading,
  isRefreshing,
  searchQuery,
  setSearchQuery,
  availableChains,
  selectedChainFilter,
  setSelectedChainFilter,
  filteredAssets,
}) => {
  const getChainIcon = (asset: Asset): string | undefined => {
    const chainId =
      asset.chainType === 'stellar'
        ? asset.chainName?.toLowerCase().includes('testnet')
          ? 'testnet'
          : 'pubnet'
        : asset.chainId;
    return getChainLogoUrl(chainId || 0);
  };

  return (
    <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl overflow-hidden shadow-sm">
      <div className="p-3 border-b border-(--color-border) space-y-3 md:space-y-0 md:flex md:items-center md:justify-between gap-2">
        <div className="relative flex-1 max-w-lg">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-secondary)"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by token symbol or name…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-xl bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-primary) placeholder:text-(--color-text-secondary) focus:border-brand-primary focus:outline-none transition-all"
          />
        </div>
        {availableChains.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 hide-scrollbar">
            <button
              onClick={() => setSelectedChainFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition shrink-0 ${
                selectedChainFilter === 'all'
                  ? 'bg-brand text-white'
                  : 'bg-secondary text-(--color-text-secondary) hover:bg-(--color-bg-secondary) border border-(--color-border)'
              }`}
            >
              All
            </button>
            {availableChains.map(chain => (
              <button
                key={chain.id}
                onClick={() => setSelectedChainFilter(chain.id)}
                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition shrink-0 flex items-center gap-1 ${
                  selectedChainFilter === chain.id
                    ? 'bg-brand text-white'
                    : 'bg-secondary text-(--color-text-secondary) hover:bg-(--color-bg-secondary) border border-(--color-border)'
                }`}
              >
                {getChainLogoUrl(chain.id) && (
                  <img
                    src={getChainLogoUrl(chain.id)}
                    alt={chain.name}
                    className="w-3 h-3 rounded-full shrink-0"
                  />
                )}
                {chain.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="hidden md:grid grid-cols-4 px-4 py-2.5 bg-(--color-bg-tertiary) border-b border-(--color-border) text-[10px] font-bold text-(--color-text-secondary) uppercase tracking-wider">
          <div>Asset</div>
          <div className="text-right">Price (24h)</div>
          <div className="text-right">Balance</div>
          <div className="text-right">USD Value</div>
        </div>

        <div className="divide-y divide-(--color-border)/50 max-h-[420px] overflow-y-auto scrollbar-thin">
          {loading || isRefreshing ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-(--color-bg-tertiary)" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-20 bg-(--color-bg-tertiary) rounded" />
                    <div className="h-2.5 w-14 bg-(--color-bg-tertiary) rounded" />
                  </div>
                </div>
                <div className="space-y-1.5 text-right">
                  <div className="h-3.5 w-16 bg-(--color-bg-tertiary) rounded ml-auto" />
                  <div className="h-2.5 w-12 bg-(--color-bg-tertiary) rounded ml-auto" />
                </div>
              </div>
            ))
          ) : filteredAssets.length === 0 ? (
            <div className="p-10 text-center text-(--color-text-secondary) space-y-1.5">
              <Search size={24} className="mx-auto text-(--color-text-secondary) opacity-50" />
              <p className="text-sm font-semibold">No assets found</p>
              <p className="text-xs">Try adjusting your filters or search keywords.</p>
            </div>
          ) : (
            filteredAssets.map(asset => {
              const usdValue = (asset.balance || 0) * (asset.current_price || 0);
              const isPriceDown = asset.price_change_percentage_24h < 0;

              return (
                <div
                  key={asset.id}
                  className="hover:bg-(--color-bg-tertiary)/30 transition-all border-b border-(--color-border)/40 last:border-b-0"
                >
                  <div className="hidden md:grid grid-cols-4 px-4 py-3 items-center gap-3 text-sm">
                    <div className="flex items-center gap-3 min-w-0 space-x-3">
                      <div className="relative shrink-0">
                        <img
                          src={asset.image}
                          className="w-9 h-9 rounded-full bg-(--color-bg-tertiary) border border-(--color-border) object-cover"
                          alt={asset.symbol}
                          onError={e => {
                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`;
                          }}
                        />
                        <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-secondary border border-(--color-border) flex items-center justify-center shadow-sm">
                          {getChainIcon(asset) ? (
                            <img
                              src={getChainIcon(asset)}
                              alt={asset.chainName}
                              className="w-3 h-3 rounded-full"
                            />
                          ) : (
                            <span className="text-[7px] font-black text-(--color-text-secondary)">
                              {asset.chainType?.[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-(--color-text-primary) truncate">
                            {asset.symbol}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary) font-medium">
                            {asset.chainName}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-(--color-text-secondary) truncate">
                          {asset.name || asset.symbol}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end shrink-0">
                      <span className="font-semibold text-(--color-text-primary)">
                        $
                        {asset.current_price?.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}
                      </span>
                      {asset.price_change_percentage_24h !== 0 && (
                        <span
                          className={`flex items-center text-[10px] font-bold ${
                            isPriceDown ? 'text-red-400' : 'text-emerald-400'
                          } mt-0.5`}
                        >
                          {isPriceDown ? (
                            <TrendingDown size={9} className="mr-0.5" />
                          ) : (
                            <TrendingUp size={9} className="mr-0.5" />
                          )}
                          {isPriceDown ? '' : '+'}
                          {asset.price_change_percentage_24h?.toFixed(2)}%
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-(--color-text-primary)">
                        {portfolioUtils.formatBalance(asset.balance)}
                      </span>
                      <span className="text-(--color-text-secondary) text-xs ml-1 font-semibold">
                        {asset.symbol}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-extrabold text-(--color-text-primary)">
                        {portfolioUtils.formatUSD(usdValue)}
                      </span>
                    </div>
                  </div>

                  {/* Mobile card view */}
                  <div className="md:hidden p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={asset.image}
                          className="w-9 h-9 rounded-full bg-(--color-bg-tertiary) border border-(--color-border) object-cover"
                          alt={asset.symbol}
                          onError={e => {
                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`;
                          }}
                        />
                        <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-secondary border border-(--color-border) flex items-center justify-center shadow-sm">
                          {getChainIcon(asset) ? (
                            <img
                              src={getChainIcon(asset)}
                              alt={asset.chainName}
                              className="w-3 h-3 rounded-full"
                            />
                          ) : (
                            <span className="text-[7px] font-black text-(--color-text-secondary)">
                              {asset.chainType?.[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-(--color-text-primary) truncate">
                            {asset.symbol}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary) font-medium">
                            {asset.chainName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-(--color-text-secondary)">
                          <span>
                            $
                            {asset.current_price?.toLocaleString(undefined, {
                              maximumFractionDigits: 4,
                            })}
                          </span>
                          {asset.price_change_percentage_24h !== 0 && (
                            <span
                              className={`flex items-center text-[10px] font-semibold ${
                                isPriceDown ? 'text-red-400' : 'text-emerald-400'
                              }`}
                            >
                              {isPriceDown ? (
                                <TrendingDown size={10} className="mr-0.5" />
                              ) : (
                                <TrendingUp size={10} className="mr-0.5" />
                              )}
                              {isPriceDown ? '' : '+'}
                              {asset.price_change_percentage_24h?.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-(--color-text-primary)">
                        {portfolioUtils.formatBalance(asset.balance)} {asset.symbol}
                      </div>
                      <div className="text-xs text-(--color-text-secondary) mt-0.5">
                        {portfolioUtils.formatUSD(usdValue)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
