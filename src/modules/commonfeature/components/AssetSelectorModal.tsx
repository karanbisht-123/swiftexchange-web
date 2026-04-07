import { Search, X, ChevronRight } from 'lucide-react';
import { type FC, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useWalletAssets } from '../../walletconnect/hooks/useWalletAssets';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getEVMChains, getStellarConfig } from '../../walletconnect/config/chains';
import { CHAIN_REGISTRY } from '../../evm/utils/Chainregistry';
import { useAssetSelectorModal } from './useAssetSelectorModal';

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
      { id: 'stellar', name: 'Stellar', logo: stellarChain.logoUrl }
    ];
  }, [currentNetwork]);


  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  const filteredAssets = useMemo(() => {
    let result = assets;

    if (actionType === 'RECEIVE') {
      const registryAssets: any[] = [];
      const evmChains = getEVMChains(currentNetwork);

      const stellarConfig = getStellarConfig(currentNetwork);
      registryAssets.push({
        symbol: 'XLM',
        name: 'Stellar Lumens',
        image: stellarConfig.logoUrl,
        balance: 0,
        chainId: 'stellar',
        chainType: 'stellar',
        current_price: 0
      });

      for (const chain of evmChains) {
        const config = CHAIN_REGISTRY.find(c => c.chainId === chain.chainId);
        if (config) {

          registryAssets.push({
            symbol: config.nativeCurrency.symbol,
            name: config.nativeCurrency.name,
            image: config.nativeCurrency.logoURI,
            balance: 0,
            chainId: config.chainId,
            chainType: 'evm',
            current_price: 0
          });
          // Tokens
          config.assets.forEach(asset => {
            registryAssets.push({
              symbol: asset.symbol,
              name: asset.name,
              image: asset.logoURI,
              balance: 0,
              chainId: config.chainId,
              chainType: 'evm',
              current_price: 0
            });
          });
        }
      }

      const mergedMap = new Map();
      registryAssets.forEach(a => mergedMap.set(`${a.symbol}-${a.chainId}`, a));
      // Overwrite with wallet assets if they exist
      assets.forEach(a => mergedMap.set(`${a.symbol}-${a.chainId}`, a));

      result = Array.from(mergedMap.values());
    }

    // Filter by network tab
    if (selectedNetwork !== 'all') {
      result = result.filter(asset => {
        if (selectedNetwork === 'stellar') return asset.chainType === 'stellar';
        return asset.chainId === selectedNetwork;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(asset =>
        asset.symbol.toLowerCase().includes(query) ||
        asset.name?.toLowerCase().includes(query)
      );
    }

    // Filter by action type (SEND: balance > 0)
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      {/* Backdrop for closing */}
      <div className="absolute inset-0" onClick={closeAssetSelector} />

      <div className="relative w-full max-w-lg bg-secondary sm:rounded-2xl rounded-t-3xl shadow-premium overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-color flex items-center justify-between">
          <h2 className="heading-4">{actionType === 'SEND' ? 'Send Asset' : 'Receive Asset'}</h2>
          <button
            onClick={closeAssetSelector}
            className="p-2 hover:bg-hover rounded-full transition-colors"
          >
            <X size={20} className="text-muted" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input
              type="text"
              placeholder="Search by name or symbol"
              className="input pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Network Tabs */}
        <div className="px-6 pb-2 overflow-x-auto hide-scrollbar flex gap-2">
          {networks.map(net => (
            <button
              key={net.id}
              onClick={() => setSelectedNetwork(net.id)}
              title={net.name}
              className={`flex-shrink-0 rounded-full text-sm font-medium transition-all ${selectedNetwork === net.id
                  ? 'bg-brand-primary text-white shadow-md'
                  : 'bg-primary text-secondary hover:bg-hover'
                } ${net.id === 'all' ? 'px-4 py-2' : 'p-2'}`}
            >
              <div className="flex items-center justify-center min-w-[20px] min-h-[20px]">
                {net.id === 'all' ? (
                  <span>All</span>
                ) : net.logo ? (
                  <img src={net.logo} alt={net.name} className="w-5 h-5 rounded-full" />
                ) : (
                  <span className="px-2">{net.name.slice(0, 3)}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Asset List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-primary animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filteredAssets.length > 0 ? (
            <div className="flex flex-col">
              {filteredAssets.map(asset => (
                <button
                  key={`${asset.symbol}-${asset.chainId}`}
                  onClick={() => handleSelect(asset)}
                  className="flex items-center justify-between p-4 hover:bg-hover rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <img src={asset.image} alt={asset.symbol} className="w-10 h-10 rounded-full" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center border border-color">
                        <img
                          src={asset.chainType === 'stellar' ? networks.find(n => n.id === 'stellar')?.logo : networks.find(n => n.id === asset.chainId)?.logo}
                          alt=""
                          className="w-3.5 h-3.5 rounded-full"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-primary">{asset.symbol}</div>
                      <div className="text-xs text-muted">{asset.name || asset.symbol}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold text-primary">
                        {(asset.balance || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      </div>
                      {asset.current_price > 0 && (asset.balance || 0) > 0 && (
                        <div className="text-xs text-muted">
                          ${((asset.balance || 0) * asset.current_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={18} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted">
              <p>No assets found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetSelectorModal;
