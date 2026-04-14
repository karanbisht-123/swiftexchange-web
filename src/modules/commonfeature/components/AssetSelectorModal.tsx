import { Search, X, ChevronRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { type FC, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useWalletAssets } from '../../walletconnect/hooks/useWalletAssets';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getEVMChains, getStellarConfig } from '../../walletconnect/config/chains';
import { CHAIN_REGISTRY } from '../../evm/utils/Chainregistry';
import { useAssetSelectorModal } from './useAssetSelectorModal';
import { portfolioUtils } from '../../walletconnect/utils/portfolioUtils';

const AssetSelectorModal: FC = () => {
  const navigate = useNavigate();
  const { isOpen, actionType, closeAssetSelector } = useAssetSelectorModal();
  const { network: currentNetwork } = useWalletStore();
  const { assets, loading } = useWalletAssets(currentNetwork);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<string | number>('all');

  const networks = useMemo(() => {
    const evmChains = getEVMChains(currentNetwork);
    const stellarChain = getStellarConfig(currentNetwork);
    return [
      { id: 'all', name: 'All Networks' },
      ...evmChains.map(c => ({ id: c.chainId, name: c.name, logo: c.logoUrl })),
      { id: 'stellar', name: 'Stellar', logo: stellarChain.logoUrl },
    ];
  }, [currentNetwork]);

  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = originalStyle; };
    }
  }, [isOpen]);

  const filteredAssets = useMemo(() => {
    let result = assets;

    if (actionType === 'RECEIVE') {
      const registryAssets: any[] = [];
      const evmChains = getEVMChains(currentNetwork);
      const stellarConfig = getStellarConfig(currentNetwork);

      registryAssets.push({
        symbol: 'XLM', name: 'Stellar Lumens',
        image: stellarConfig.logoUrl, balance: 0,
        chainId: 'stellar', chainType: 'stellar', current_price: 0,
      });

      for (const chain of evmChains) {
        const config = CHAIN_REGISTRY.find(c => c.chainId === chain.chainId);
        if (config) {
          registryAssets.push({
            symbol: config.nativeCurrency.symbol, name: config.nativeCurrency.name,
            image: config.nativeCurrency.logoURI, balance: 0,
            chainId: config.chainId, chainType: 'evm', current_price: 0,
          });
          config.assets.forEach(asset => {
            registryAssets.push({
              symbol: asset.symbol, name: asset.name,
              image: asset.logoURI, balance: 0,
              chainId: config.chainId, chainType: 'evm', current_price: 0,
            });
          });
        }
      }

      const mergedMap = new Map();
      registryAssets.forEach(a => mergedMap.set(`${a.symbol}-${a.chainId}`, a));
      assets.forEach(a => mergedMap.set(`${a.symbol}-${a.chainId}`, a));
      result = Array.from(mergedMap.values());
    }

    if (selectedNetwork !== 'all') {
      result = result.filter(asset =>
        selectedNetwork === 'stellar' ? asset.chainType === 'stellar' : asset.chainId === selectedNetwork
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(asset =>
        asset.symbol.toLowerCase().includes(query) || asset.name?.toLowerCase().includes(query)
      );
    }

    if (actionType === 'SEND') {
      result = result.filter(asset => (asset.balance || 0) > 0);
    }

    return result;
  }, [assets, selectedNetwork, searchQuery, actionType, currentNetwork]);

  const handleSelect = (asset: any) => {
    const chainId = asset.chainType === 'stellar' ? 'stellar' : asset.chainId;
    const path = actionType === 'SEND' ? '/send' : '/receive';
    navigate(`${path}?asset=${asset.symbol}&chainId=${chainId}`);
    closeAssetSelector();
  };

  if (!isOpen) return null;

  const isSend = actionType === 'SEND';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={closeAssetSelector} />

      <div className="relative w-full max-w-md bg-secondary sm:rounded-2xl rounded-t-2xl shadow-premium flex flex-col h-[88vh] sm:h-[600px] overflow-hidden">

        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border opacity-60" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 sm:pt-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isSend ? 'bg-orange-500/10' : 'bg-green-500/10'}`}>
              {isSend
                ? <ArrowUpRight size={15} className="text-orange-500" />
                : <ArrowDownLeft size={15} className="text-green-500" />
              }
            </div>
            <h2 className="heading-4 text-primary">
              {isSend ? 'Send' : 'Receive'}
            </h2>
          </div>
          <button
            onClick={closeAssetSelector}
            className="w-8 h-8 flex items-center justify-center hover:bg-hover rounded-full transition-colors"
          >
            <X size={16} className="text-muted" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Search assets…"
              className="input w-full pl-9 pr-4 text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Network filter pills */}
        <div className="px-5 pb-3 flex gap-1.5 overflow-x-auto hide-scrollbar">
          {networks.map(net => {
            const active = selectedNetwork === net.id;
            return (
              <button
                key={net.id}
                onClick={() => setSelectedNetwork(net.id)}
                title={net.name}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-full border transition-all text-xs font-medium
                  ${active
                    ? 'bg-brand-primary border-brand-primary text-white shadow-sm'
                    : 'bg-primary border-color text-secondary hover:border-muted'
                  }
                  ${net.id === 'all' ? 'px-3 py-1.5' : net.logo ? 'p-1.5' : 'px-3 py-1.5'}
                `}
              >
                {net.id === 'all' ? (
                  <span>All</span>
                ) : net.logo ? (
                  <img src={net.logo} alt={net.name} className="w-5 h-5 rounded-full" />
                ) : (
                  <span>{net.name.slice(0, 3)}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-color mx-5" />

        {/* Asset list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex flex-col gap-1 px-3 py-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-[60px] bg-primary animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filteredAssets.length > 0 ? (
            <div className="flex flex-col px-3">
              {filteredAssets.map(asset => {
                const chainLogo = asset.chainType === 'stellar'
                  ? networks.find(n => n.id === 'stellar')?.logo
                  : networks.find(n => n.id === asset.chainId)?.logo;
                const hasBalance = (asset.balance || 0) > 0;
                const usdValue = hasBalance && asset.current_price > 0
                  ? portfolioUtils.formatUSD((asset.balance || 0) * asset.current_price)
                  : null;

                return (
                  <button
                    key={`${asset.symbol}-${asset.chainId}`}
                    onClick={() => handleSelect(asset)}
                    className="group flex items-center justify-between px-3 py-3 hover:bg-hover rounded-xl transition-colors text-left"
                  >
                    {/* Left: icon + name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        <img
                          src={asset.image}
                          alt={asset.symbol}
                          className="w-9 h-9 rounded-full bg-primary"
                        />
                        {chainLogo && (
                          <img
                            src={chainLogo}
                            alt=""
                            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-secondary bg-secondary"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-primary leading-tight">{asset.symbol}</div>
                        <div className="text-xs text-muted leading-tight truncate">{asset.name || asset.symbol}</div>
                      </div>
                    </div>

                    {/* Right: balance + chevron */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasBalance ? (
                        <div className="text-right">
                          <div className="text-sm font-semibold text-primary leading-tight">
                            {portfolioUtils.formatBalance(asset.balance)}
                          </div>
                          {usdValue && (
                            <div className="text-xs text-muted leading-tight">{usdValue}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted/50">—</span>
                      )}
                      <ChevronRight
                        size={15}
                        className="text-muted opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-16 text-muted">
              <Search size={28} className="mb-3 opacity-30" />
              <p className="text-sm">No assets found</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs text-brand-primary hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetSelectorModal;