import { useState, useMemo, useEffect } from 'react';
import { useWalletConnect, useWalletNetwork } from './useWalletConnect';
import { useWalletAssets } from './useWalletAssets';
import { portfolioUtils } from '../utils/portfolioUtils';
import { type Asset } from '../store/portfolioStore';

export type PortfolioTab = 'total' | 'evm' | 'stellar' | 'dydx';

export interface ChainFilter {
  id: string | number;
  name: string;
}

export function useProfilePortfolio() {
  const { connectedWallets, isAnyWalletConnected } = useWalletConnect();
  const { network } = useWalletNetwork();
  const { assets, loading, isRefreshing, refetch, hasError } = useWalletAssets(network);

  // Group assets by chain type
  const evmAssets = useMemo(() => assets.filter(a => a.chainType === 'evm'), [assets]);
  const stellarAssets = useMemo(() => assets.filter(a => a.chainType === 'stellar'), [assets]);
  const dydxAssets = useMemo(() => assets.filter(a => a.chainType === 'dydx'), [assets]);

  // Calculate totals
  const evmTotal = useMemo(() => portfolioUtils.calculateTotalUSD(evmAssets), [evmAssets]);
  const stellarTotal = useMemo(() => portfolioUtils.calculateTotalUSD(stellarAssets), [stellarAssets]);
  const dydxTotal = useMemo(() => portfolioUtils.calculateTotalUSD(dydxAssets), [dydxAssets]);
  const grandTotal = useMemo(() => evmTotal + stellarTotal + dydxTotal, [evmTotal, stellarTotal, dydxTotal]);

  // Determine active cards based on connected wallets
  const activeTabs = useMemo(() => {
    const tabs: PortfolioTab[] = [];
    if (isAnyWalletConnected) {
      tabs.push('total');
      tabs.push('evm');
      tabs.push('stellar');
      tabs.push('dydx');
    }
    return tabs;
  }, [isAnyWalletConnected]);

  // State for active card selection - defaults to 'total'
  const [activeTab, setActiveTab] = useState<PortfolioTab>('total');

  // Sync activeTab when connections change (default to 'total')
  useEffect(() => {
    if (activeTabs.length > 0 && !activeTabs.includes(activeTab)) {
      setActiveTab('total');
    }
  }, [activeTabs, activeTab]);

  // State for search query and chain filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChainFilter, setSelectedChainFilter] = useState<string | number>('all');

  // Reset chain filter on tab switch
  useEffect(() => {
    setSelectedChainFilter('all');
  }, [activeTab]);

  // Retrieve unique chains present in the currently selected tab's assets
  const availableChains = useMemo<ChainFilter[]>(() => {
    const currentTabAssets =
      activeTab === 'total' ? assets :
        activeTab === 'evm' ? evmAssets :
          activeTab === 'stellar' ? stellarAssets : dydxAssets;

    const chainsMap = new Map<string | number, string>();
    currentTabAssets.forEach(asset => {
      if (asset.chainId !== undefined && asset.chainName) {
        chainsMap.set(asset.chainId, asset.chainName);
      }
    });

    return Array.from(chainsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [activeTab, assets, evmAssets, stellarAssets, dydxAssets]);

  // Filter assets based on activeTab, selected chain, and search query
  const filteredAssets = useMemo(() => {
    let baseAssets: Asset[] = [];
    if (activeTab === 'total') baseAssets = assets;
    else if (activeTab === 'evm') baseAssets = evmAssets;
    else if (activeTab === 'stellar') baseAssets = stellarAssets;
    else if (activeTab === 'dydx') baseAssets = dydxAssets;

    return baseAssets.filter(asset => {
      // Chain filter matching
      const matchesChain = selectedChainFilter === 'all' || asset.chainId === selectedChainFilter;

      // Search matching (symbol or name)
      const matchesSearch =
        asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.name.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesChain && matchesSearch;
    });
  }, [activeTab, assets, evmAssets, stellarAssets, dydxAssets, selectedChainFilter, searchQuery]);

  return {
    isAnyWalletConnected,
    connectedWallets,
    loading,
    isRefreshing,
    hasError,
    refetch,

    // Totals
    evmTotal,
    stellarTotal,
    dydxTotal,
    grandTotal,

    // Per-chain assets (for export)
    evmAssets,
    stellarAssets,
    dydxAssets,

    // Tabs & Filters
    activeTabs,
    activeTab,
    setActiveTab,
    availableChains,
    selectedChainFilter,
    setSelectedChainFilter,
    searchQuery,
    setSearchQuery,

    // Output
    filteredAssets,
  };

}
