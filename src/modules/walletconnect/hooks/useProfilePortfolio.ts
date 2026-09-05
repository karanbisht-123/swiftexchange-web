import { useEffect, useMemo, useState } from 'react';

import { type Asset } from '../store/portfolioStore';
import { portfolioUtils } from '../utils/portfolioUtils';
import { useWalletAssets } from './useWalletAssets';
import { useWalletConnect, useWalletNetwork } from './useWalletConnect';

export type PortfolioTab = 'total' | 'evm' | 'stellar';

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

  // Calculate totals
  const evmTotal = useMemo(() => portfolioUtils.calculateTotalUSD(evmAssets), [evmAssets]);
  const stellarTotal = useMemo(
    () => portfolioUtils.calculateTotalUSD(stellarAssets),
    [stellarAssets]
  );
  const grandTotal = useMemo(() => evmTotal + stellarTotal, [evmTotal, stellarTotal]);

  // Determine active cards based on connected wallets
  const activeTabs = useMemo(() => {
    const tabs: PortfolioTab[] = [];
    if (isAnyWalletConnected) {
      tabs.push('total');
      tabs.push('evm');
      tabs.push('stellar');
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
      activeTab === 'total' ? assets : activeTab === 'evm' ? evmAssets : stellarAssets;

    const chainsMap = new Map<string | number, string>();
    currentTabAssets.forEach(asset => {
      if (asset.chainId !== undefined && asset.chainName) {
        chainsMap.set(asset.chainId, asset.chainName);
      }
    });

    return Array.from(chainsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [activeTab, assets, evmAssets, stellarAssets]);

  // Filter assets based on activeTab, selected chain, and search query
  const filteredAssets = useMemo(() => {
    let baseAssets: Asset[] = [];
    if (activeTab === 'total') baseAssets = assets;
    else if (activeTab === 'evm') baseAssets = evmAssets;
    else if (activeTab === 'stellar') baseAssets = stellarAssets;

    return baseAssets.filter(asset => {
      // Chain filter matching
      const matchesChain = selectedChainFilter === 'all' || asset.chainId === selectedChainFilter;

      // Search matching (symbol or name)
      const matchesSearch =
        asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.name.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesChain && matchesSearch;
    });
  }, [activeTab, assets, evmAssets, stellarAssets, selectedChainFilter, searchQuery]);

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
    grandTotal,

    // Per-chain assets (for export)
    evmAssets,
    stellarAssets,

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
