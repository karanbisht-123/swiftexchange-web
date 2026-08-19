import { Activity, Globe, RefreshCw, User, Wallet } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { StellarCostBasisModal } from '../components/StellarCostBasisModal';
import PageLayout from '../components/layout/PageLayout';

import { useProfilePortfolio } from '../modules/walletconnect/hooks/useProfilePortfolio';
import {
  useWalletConnect,
  useWalletNetwork,
} from '../modules/walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../modules/walletconnect/store/walletConnectStore';
import { portfolioUtils } from '../modules/walletconnect/utils/portfolioUtils';
import { fetchStellarPnl } from '../service/apiService';
import { exportStellarReport } from '../utils/exportService';
import { AssetsTableSection } from './profile/components/AssetsTableSection';

import { ExportProgressModal } from './profile/components/ExportProgressModal';
import { PortfolioCardsGrid } from './profile/components/PortfolioCardsGrid';
import { StellarPerformanceCard } from './profile/components/StellarPerformanceCard';

const isValidDevicePayload = (payload: any): boolean => {
  if (!payload || typeof payload !== 'object') return false;
  return (
    typeof payload.uniqueId === 'string' &&
    payload.uniqueId.trim() !== '' &&
    typeof payload.fcmToken === 'string' &&
    payload.fcmToken.trim() !== ''
  );
};

const Profile: React.FC = () => {
  const connectWithSwiftEx = true;
  const { connectedWallets, openModal } = useWalletConnect();
  const { network } = useWalletNetwork();
  const session = useWalletStore(state => state.session);

  console.log(session, '================');

  const devicePayload = session?.peer?.metadata?.userDevice;
  const isSwiftExUser = isValidDevicePayload(devicePayload);

  const {
    isAnyWalletConnected,
    loading,
    isRefreshing,
    refetch,
    evmTotal,
    stellarTotal,

    grandTotal,
    activeTabs,
    activeTab,
    setActiveTab,
    availableChains,
    selectedChainFilter,
    setSelectedChainFilter,
    searchQuery,
    setSearchQuery,
    filteredAssets,
  } = useProfilePortfolio();



  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const isDateRangeActive = !!(fromDate || toDate);
  const clearRange = () => {
    setFromDate(null);
    setToDate(null);
  };


  // Export progress modal states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStep, setExportStep] = useState(0); // 0 = config, 1+ = steps
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'stellar'>('stellar');
  const [exportTimeframe, setExportTimeframe] = useState<string>('');
  const [exportFromDate, setExportFromDate] = useState<string | null>(null);
  const [exportToDate, setExportToDate] = useState<string | null>(null);
  const [exportIsCustom, setExportIsCustom] = useState<boolean>(false);

  const [stellarPnlData, setStellarPnlData] = useState<any>(null);
  const [loadingStellarPnl, setLoadingStellarPnl] = useState(true);
  const [stellarPnlError, setStellarPnlError] = useState<string | null>(null);
  const [stellarTimeframe, setStellarTimeframe] = useState<'1w' | '1m' | '2m' | '3m'>('1m');
  const [stellarSubTab, setStellarSubTab] = useState<'overview' | 'highlights' | 'stats'>(
    'overview'
  );

  const [isCostBasisModalOpen, setIsCostBasisModalOpen] = useState(false);
  const [loadingCostBasisDetails, setLoadingCostBasisDetails] = useState(false);
  const [stellarDetailedData, setStellarDetailedData] = useState<any>(null);

  const getStellarDateRange = useCallback(() => {
    const formatDateToDDMMYY = (date: Date) => {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yy = String(date.getFullYear()).slice(-2);
      return `${dd}/${mm}/${yy}`;
    };

    let fromStr: string;
    let toStr: string;

    if (isDateRangeActive && fromDate && toDate) {
      const parseCalendarDate = (dateStr: string) => {
        const parts = dateStr.split('-');
        const year = parts[0].slice(-2);
        const month = parts[1];
        const day = parts[2];
        return `${day}/${month}/${year}`;
      };
      fromStr = parseCalendarDate(fromDate);
      toStr = parseCalendarDate(toDate);
    } else {
      const toDateObj = new Date();
      const fromDateObj = new Date();

      const daysMap = { '1w': 7, '1m': 30, '2m': 60, '3m': 90 };
      const days = daysMap[stellarTimeframe] ?? 30;
      fromDateObj.setDate(fromDateObj.getDate() - days);

      fromStr = formatDateToDDMMYY(fromDateObj);
      toStr = formatDateToDDMMYY(toDateObj);
    }

    return { fromStr, toStr };
  }, [isDateRangeActive, fromDate, toDate, stellarTimeframe]);

  // Stellar Cost Basis State
  const [stellarCostBasis, setStellarCostBasis] = useState<
    Record<string, { openingAmount: string; costPerUnit: string }>
  >({});

  useEffect(() => {
    const addr = connectedWallets.stellar?.address;
    if (addr) {
      const stored = localStorage.getItem(`swiftex_stellar_cost_basis_${addr}`);
      if (stored) {
        try {
          setStellarCostBasis(JSON.parse(stored));
        } catch (e) {
          console.warn('[Profile] Failed to parse local cost basis:', e);
          setStellarCostBasis({});
        }
      } else {
        setStellarCostBasis({});
      }
    } else {
      setStellarCostBasis({});
    }
  }, [connectedWallets.stellar?.address]);

  const handleCostBasisChange = (
    asset: string,
    field: 'openingAmount' | 'costPerUnit',
    value: string
  ) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;

    const addr = connectedWallets.stellar?.address;
    if (!addr) return;

    setStellarCostBasis(prev => {
      const current = prev[asset] || { openingAmount: '', costPerUnit: '' };
      const updated = {
        ...prev,
        [asset]: {
          ...current,
          [field]: value,
        },
      };
      localStorage.setItem(`swiftex_stellar_cost_basis_${addr}`, JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearAllCostBasis = () => {
    const addr = connectedWallets.stellar?.address;
    if (!addr) return;
    if (window.confirm('Are you sure you want to clear all custom cost basis entries?')) {
      setStellarCostBasis({});
      localStorage.removeItem(`swiftex_stellar_cost_basis_${addr}`);
    }
  };

  const handleOpenCostBasis = async () => {
    if (!isSwiftExUser || !connectedWallets.stellar?.address || loadingCostBasisDetails) return;

    if (stellarDetailedData?.positions && stellarDetailedData.positions.length > 0) {
      setIsCostBasisModalOpen(true);
      return;
    }

    setLoadingCostBasisDetails(true);
    try {
      const { fromStr, toStr } = getStellarDateRange();
      const fullData: any = await fetchStellarPnl(
        connectedWallets.stellar.address,
        fromStr,
        toStr,
        true
      );
      if (fullData) {
        setStellarDetailedData(fullData);
        setIsCostBasisModalOpen(true);
      } else {
        throw new Error('No position data returned from server');
      }
    } catch (err) {
      console.error('[Stellar Cost Basis] Failed to fetch positions:', err);
      alert(
        err instanceof Error
          ? err.message
          : 'Failed to fetch position data for cost basis adjustment'
      );
    } finally {
      setLoadingCostBasisDetails(false);
    }
  };

  const totalOpeningCostBasis = useMemo(() => {
    let sum = 0;
    if (!stellarDetailedData?.positions) return 0;
    stellarDetailedData.positions.forEach((pos: any) => {
      const config = stellarCostBasis[pos.asset];
      const autoKey = `${pos.asset}::${pos.issuer || 'native'}`;
      const autoVal = stellarDetailedData.autoCostBasis?.[autoKey];

      const amt =
        config?.openingAmount !== undefined && config?.openingAmount !== ''
          ? parseFloat(config.openingAmount) || 0
          : autoVal?.amount || 0;

      const cpu =
        config?.costPerUnit !== undefined && config?.costPerUnit !== ''
          ? parseFloat(config.costPerUnit) || 0
          : autoVal?.price || 0;

      sum += amt * cpu;
    });
    return sum;
  }, [stellarDetailedData?.positions, stellarDetailedData?.autoCostBasis, stellarCostBasis]);

  const adjustedStellarPnl = useMemo(() => {
    return (stellarPnlData?.totalPnL || 0) + totalOpeningCostBasis;
  }, [stellarPnlData?.totalPnL, totalOpeningCostBasis]);

  // Date picker limit helpers (Max 90 days range, no future dates, timezone-safe local dates)
  const getLocalDateString = (d: Date = new Date()) => {
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - offset * 60 * 1000);
    return localDate.toISOString().split('T')[0];
  };

  const todayStr = getLocalDateString();

  const minFromDate = useMemo(() => {
    if (!toDate) return '';
    const d = new Date(toDate);
    d.setDate(d.getDate() - 90);
    return getLocalDateString(d);
  }, [toDate]);

  const maxFromDate = useMemo(() => {
    return toDate || todayStr;
  }, [toDate, todayStr]);

  const minToDate = useMemo(() => {
    return fromDate || '';
  }, [fromDate]);

  const maxToDate = useMemo(() => {
    if (!fromDate) return todayStr;
    const d = new Date(fromDate);
    d.setDate(d.getDate() + 90);
    const maxD = getLocalDateString(d);
    return maxD < todayStr ? maxD : todayStr;
  }, [fromDate, todayStr]);

  useEffect(() => {
    let isMounted = true;
    setStellarDetailedData(null);

    if (
      isSwiftExUser &&
      connectWithSwiftEx &&
      connectedWallets.stellar?.address &&
      (activeTab === 'stellar' || activeTab === 'total')
    ) {
      const { fromStr, toStr } = getStellarDateRange();

      setLoadingStellarPnl(true);
      setStellarPnlError(null);

      fetchStellarPnl(connectedWallets.stellar.address, fromStr, toStr, false)
        .then(data => {
          if (!isMounted) return;
          setStellarPnlData(data || null);
        })
        .catch(err => {
          if (!isMounted) return;
          setStellarPnlError(err instanceof Error ? err.message : 'Failed to fetch Stellar PNL');
        })
        .finally(() => {
          if (isMounted) {
            setLoadingStellarPnl(false);
          }
        });
    } else {
      setLoadingStellarPnl(false);
    }

    return () => {
      isMounted = false;
    };
  }, [
    connectWithSwiftEx,
    connectedWallets.stellar?.address,
    stellarTimeframe,
    activeTab,
    getStellarDateRange,
    isSwiftExUser,
  ]);





  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };



  // Cost Basis is handled entirely in the exported Excel file — no in-app input needed.


  const cardPnL = useMemo(() => {
    const stellarPnL = stellarPnlData?.totalPnL || 0;
    const stellarStart = stellarTotal - stellarPnL;
    const stellarPct = stellarStart > 0 ? (stellarPnL / stellarStart) * 100 : 0;

    const totalPnL = stellarPnL;
    const totalStart = stellarTotal + evmTotal - totalPnL;
    const totalPct = totalStart > 0 ? (totalPnL / totalStart) * 100 : 0;

    return {
      total: { change: totalPnL, percent: totalPct },
      evm: { change: 0, percent: 0 },
      stellar: { change: stellarPnL, percent: stellarPct },
    };
  }, [
    stellarPnlData?.totalPnL,
    stellarTotal,
    evmTotal,
  ]);



  const handleStartExport = useCallback(
    async (
      selTimeframe: any,
      selFromDate: string | null,
      selToDate: string | null,
      isCustom: boolean
    ) => {
      setExportTimeframe(selTimeframe);
      setExportFromDate(selFromDate);
      setExportToDate(selToDate);
      setExportIsCustom(isCustom);

      setExportStep(1);
      setExportError(null);
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Stellar Export Flow
        try {
          if (!isSwiftExUser || !connectedWallets.stellar?.address) {
            throw new Error('Stellar wallet is not connected.');
          }

          const periodLabel =
            isCustom && selFromDate && selToDate
              ? `${selFromDate} to ${selToDate}`
              : selTimeframe === '1w'
                ? 'Last 1 Week'
                : selTimeframe === '1m'
                  ? 'Last 1 Month'
                  : selTimeframe === '2m'
                    ? 'Last 2 Months'
                    : 'Last 3 Months';

          let fromStr = '';
          let toStr = '';

          if (isCustom && selFromDate && selToDate) {
            fromStr = selFromDate;
            toStr = selToDate;
          } else {
            const daysMap = { '1w': 7, '1m': 30, '2m': 60, '3m': 90 };
            const days = daysMap[selTimeframe as '1w' | '1m' | '2m' | '3m'] ?? 30;
            const cutoff = Date.now() - days * 86400000;
            fromStr = new Date(cutoff).toISOString().slice(0, 10);
            toStr = new Date().toISOString().slice(0, 10);
          }

          await delay(500);

          // Step 2: Fetching Stellar ledger history
          setExportStep(2);
          const fullData = (await fetchStellarPnl(
            connectedWallets.stellar.address,
            fromStr,
            toStr,
            true
          )) as any;
          if (!fullData) {
            throw new Error('No report data returned from server');
          }
          setStellarDetailedData(fullData);

          await delay(500);

          // Step 3: Generating Excel statement
          setExportStep(3);
          exportStellarReport({
            address: connectedWallets.stellar.address,
            period: periodLabel,
            totalPnL: fullData.totalPnL || 0,
            totalRealized: fullData.totalRealized || 0,
            totalUnrealized: fullData.totalUnrealized || 0,
            usdcSpent: fullData.usdcSpent || 0,
            usdcReceived: fullData.usdcReceived || 0,
            netUSDCFlow: fullData.netUSDCFlow || 0,
            tradeCount: fullData.rawCount || fullData.tradeCount || 0,
            collapsedCount: fullData.collapsedCount,
            rawCount: fullData.rawCount,
            skippedCount: fullData.skippedCount,
            noPriceCount: fullData.noPriceCount,
            positionCount: fullData.positionCount || 0,
            disposalCount: fullData.disposalCount || 0,
            winRate: fullData.winRate,
            bestTrade: fullData.bestTrade,
            worstTrade: fullData.worstTrade,
            firstTradeDate: fullData.firstTradeDate,
            lastTradeDate: fullData.lastTradeDate,
            activeDays: fullData.activeDays,
            mostTradedAsset: fullData.mostTradedAsset,
            totalPortfolioValue: fullData.totalPortfolioValue,
            largestPosition: fullData.largestPosition,
            trades: fullData.trades,
            positions: fullData.positions?.map((pos: any) => {
              const config = stellarCostBasis[pos.asset];
              const autoKey = `${pos.asset}::${pos.issuer || 'native'}`;
              const autoVal = fullData.autoCostBasis?.[autoKey];

              const openingAmount =
                config?.openingAmount !== undefined && config?.openingAmount !== ''
                  ? parseFloat(config.openingAmount)
                  : (autoVal?.amount ?? null);

              const openingCostPerUnit =
                config?.costPerUnit !== undefined && config?.costPerUnit !== ''
                  ? parseFloat(config.costPerUnit)
                  : (autoVal?.price ?? null);

              return {
                ...pos,
                openingAmount,
                openingCostPerUnit,
              };
            }),
          });

          await delay(500);

          // Step 4: Your statement is ready
          setExportStep(4);
        } catch (err: any) {
          console.error('[Stellar Export] Failed to export report:', err);
          setExportError(err?.message || 'Failed to export report');
        }
    },
    [
      exportType,
      isSwiftExUser,
      connectedWallets.stellar?.address,
      stellarCostBasis,
    ]
  );

  const handleSyncBalances = async () => {
    refetch();
  };

  if (loading && grandTotal === 0) {
    return (
      <div className="bg-secondary p-4 md:p-6 lg:rounded-xl lg:max-w-7xl w-full max-w-[100vw] mx-auto space-y-8 my-4 animate-pulse">
        {/* Header Member Card Skeleton */}
        <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-6 relative overflow-hidden shadow-md">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="w-24 h-24 rounded-full bg-(--color-bg-tertiary)" />
            <div className="flex-1 space-y-3 text-center md:text-left py-2">
              <div className="h-6 w-48 bg-(--color-bg-tertiary) rounded mx-auto md:mx-0" />
              <div className="h-4 w-96 bg-(--color-bg-tertiary) rounded max-w-full mx-auto md:mx-0" />
              <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2">
                <div className="h-6 w-32 bg-(--color-bg-tertiary) rounded-lg" />
                <div className="h-6 w-40 bg-(--color-bg-tertiary) rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        {/* Portfolio Cards Grid Skeleton */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="h-6 w-32 bg-(--color-bg-tertiary) rounded" />
            <div className="h-8 w-28 bg-(--color-bg-tertiary) rounded-lg" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl border border-(--color-border) bg-(--color-bg-secondary) space-y-4 shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-(--color-bg-tertiary)" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-24 bg-(--color-bg-tertiary) rounded" />
                    <div className="h-3 w-16 bg-(--color-bg-tertiary) rounded" />
                  </div>
                </div>
                <div className="space-y-1 mt-6">
                  <div className="h-3 w-28 bg-(--color-bg-tertiary) rounded" />
                  <div className="h-6 w-36 bg-(--color-bg-tertiary) rounded-lg" />
                </div>
                <div className="border-t border-(--color-border) pt-4 flex justify-between">
                  <div className="h-3.5 w-32 bg-(--color-bg-tertiary) rounded" />
                  <div className="h-3.5 w-6 bg-(--color-bg-tertiary) rounded" />
                </div>
              </div>
            ))}
          </div>

          {/* Performance & Analytics Container Skeleton */}
          <div className="w-full bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-5 shadow-md space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-(--color-bg-tertiary)" />
                <div className="h-4 w-48 bg-(--color-bg-tertiary) rounded" />
              </div>
              <div className="h-4 w-4 bg-(--color-bg-tertiary) rounded" />
            </div>
            <div className="h-[240px] w-full bg-(--color-bg-tertiary)/40 border border-(--color-border)/50 rounded-xl flex items-center justify-center">
              <RefreshCw size={24} className="animate-spin text-(--color-text-muted) opacity-30" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="p-3 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl space-y-2"
                >
                  <div className="h-3 w-16 bg-(--color-bg-tertiary) rounded" />
                  <div className="h-5 w-12 bg-(--color-bg-tertiary) rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Assets Table Container Skeleton */}
          <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl overflow-hidden shadow-md">
            <div className="p-4 border-b border-(--color-border) flex items-center justify-between gap-4">
              <div className="h-9 w-64 bg-(--color-bg-tertiary) rounded-xl" />
              <div className="h-6 w-32 bg-(--color-bg-tertiary) rounded" />
            </div>
            <div className="hidden md:grid grid-cols-4 px-6 py-3.5 bg-(--color-bg-tertiary)/50 border-b border-(--color-border)">
              <div className="h-3 w-16 bg-(--color-bg-tertiary) rounded" />
              <div className="h-3 w-16 bg-(--color-bg-tertiary) rounded ml-auto" />
              <div className="h-3 w-16 bg-(--color-bg-tertiary) rounded ml-auto" />
              <div className="h-3 w-16 bg-(--color-bg-tertiary) rounded ml-auto" />
            </div>
            <div className="divide-y divide-(--color-border)/50 p-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-(--color-bg-tertiary)" />
                    <div className="space-y-2">
                      <div className="h-4 w-20 bg-(--color-bg-tertiary) rounded" />
                      <div className="h-3 w-16 bg-(--color-bg-tertiary) rounded" />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <div className="h-4 w-16 bg-(--color-bg-tertiary) rounded ml-auto" />
                    <div className="h-3 w-12 bg-(--color-bg-tertiary) rounded ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compute number of connected wallets
  const connectedCount = Object.values(connectedWallets).filter(w => w?.address).length;

  return (
    <PageLayout title="Portfolio" maxWidth="7xl" isBeta>
      <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-4 relative overflow-hidden shadow-md">
        <div className="absolute top-0 right-0 w-48 h-48 bg-brand-primary/10 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand-primary to-emerald-500 p-0.5 shadow-inner flex-shrink-0 flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                <User size={24} className="text-brand-primary" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">
                  {isSwiftExUser ? 'SwiftEx Member' : 'Standard Member'}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    isAnyWalletConnected
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}
                >
                  {isAnyWalletConnected ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              <p className="text-xs text-(--color-text-secondary)">
                Manage your blockchain accounts & DEX profiles
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border)">
              <Globe size={14} className="text-brand-primary" />
              <span>
                Network:{' '}
                <span className="font-semibold capitalize text-brand-primary">{network}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border)">
              <Wallet size={14} className="text-brand-primary" />
              <span>
                {connectedCount} {connectedCount === 1 ? 'Wallet' : 'Wallets'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border)">
              <Activity size={14} className="text-brand-primary" />
              <span>
                Total Net Worth:{' '}
                <span className="font-bold text-brand-primary">
                  {portfolioUtils.formatUSD(grandTotal)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>



      {/* ========== PORTFOLIO CARDS ========== */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wallet className="text-brand-primary" size={20} />
            <h3 className="text-lg font-bold">My Portfolio</h3>
          </div>
          {isAnyWalletConnected && (
            <button
              onClick={handleSyncBalances}
              disabled={loading || isRefreshing}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-(--color-border) hover:bg-(--color-bg-tertiary) transition disabled:opacity-50 self-start md:self-auto"
            >
              <RefreshCw size={12} className={`${loading || isRefreshing ? 'animate-spin' : ''}`} />
              Sync Balances
            </button>
          )}
        </div>

        {!isAnyWalletConnected ? (
          <div className="bg-(--color-bg-secondary) border border-(--color-border) border-dashed rounded-2xl p-12 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 mx-auto rounded-full bg-(--color-bg-tertiary) flex items-center justify-center text-(--color-text-secondary)">
              <Wallet size={32} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-lg">No wallets connected</h4>
              <p className="text-sm text-(--color-text-secondary) max-w-sm mx-auto">
                Connect your EVM or Stellar wallet to start syncing your balances and performance.
              </p>
            </div>
            <button
              onClick={openModal}
              className="btn btn-primary px-6 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2"
            >
              <Wallet size={16} />
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            {/* Distribution bar */}
            {grandTotal > 0 && (
              <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-3 shadow-md space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-(--color-text-secondary) uppercase tracking-wider text-[10px]">
                    Portfolio Distribution
                  </span>
                  <div className="flex flex-wrap items-center gap-3 text-[10.5px] font-semibold text-(--color-text-secondary)">
                    {evmTotal > 0 && (
                      <span className="flex items-center gap-1.5 bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        EVM: {((evmTotal / grandTotal) * 100).toFixed(0)}%
                      </span>
                    )}
                    {stellarTotal > 0 && (
                      <span className="flex items-center gap-1.5 bg-purple-500/5 px-2 py-0.5 rounded border border-purple-500/10">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Stellar: {((stellarTotal / grandTotal) * 100).toFixed(0)}%
                      </span>
                    )}

                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-(--color-bg-tertiary) flex overflow-hidden">
                  {evmTotal > 0 && (
                    <div
                      style={{ width: `${(evmTotal / grandTotal) * 100}%` }}
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                    />
                  )}
                  {stellarTotal > 0 && (
                    <div
                      style={{ width: `${(stellarTotal / grandTotal) * 100}%` }}
                      className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
                    />
                  )}

                </div>
              </div>
            )}

            {/* Portfolio Cards */}
            <PortfolioCardsGrid
              activeTabs={activeTabs}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              grandTotal={grandTotal}
              evmTotal={evmTotal}
              stellarTotal={stellarTotal}

              connectedWallets={connectedWallets}
              copiedStates={copiedStates}
              handleCopy={handleCopy}
              cardPnL={cardPnL}
              openModal={openModal}
            />

            {/* ========== PERFORMANCE SECTIONS (Stellar) ========== */}
            {(activeTab === 'stellar' ||
              (activeTab === 'total' &&
                (connectWithSwiftEx && connectedWallets.stellar?.address))) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                {(activeTab === 'stellar' ||
                  (activeTab === 'total' &&
                    connectWithSwiftEx &&
                    connectedWallets.stellar?.address)) && (
                  <StellarPerformanceCard
                    stellarTotal={stellarTotal}
                    stellarPnlData={stellarPnlData}
                    loadingStellarPnl={loadingStellarPnl}
                    stellarPnlError={stellarPnlError}
                    stellarTimeframe={stellarTimeframe}
                    setStellarTimeframe={setStellarTimeframe}
                    stellarSubTab={stellarSubTab}
                    setStellarSubTab={setStellarSubTab}
                    fromDate={fromDate}
                    toDate={toDate}
                    setFromDate={setFromDate}
                    setToDate={setToDate}
                    clearRange={clearRange}
                    isDateRangeActive={isDateRangeActive}
                    minFromDate={minFromDate}
                    maxFromDate={maxFromDate}
                    minToDate={minToDate}
                    maxToDate={maxToDate}
                    isSwiftExUser={isSwiftExUser}
                    connectedWallets={connectedWallets}
                    openModal={openModal}
                    handleOpenCostBasis={handleOpenCostBasis}
                    loadingCostBasisDetails={loadingCostBasisDetails}
                    totalOpeningCostBasis={totalOpeningCostBasis}
                    adjustedStellarPnl={adjustedStellarPnl}
                    onExportReport={() => {
                      setExportType('stellar');
                      setExportStep(0);
                      setExportError(null);
                      setIsExportModalOpen(true);
                    }}
                  />
                )}
              </div>
            )}



            {/* ========== ASSET TABLE ========== */}
            <AssetsTableSection
              loading={loading}
              isRefreshing={isRefreshing}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              availableChains={availableChains}
              selectedChainFilter={selectedChainFilter}
              setSelectedChainFilter={setSelectedChainFilter}
              filteredAssets={filteredAssets}
            />
          </>
        )}
      </div>

      {/* ========== STELLAR COST BASIS MODAL ========== */}
      <StellarCostBasisModal
        isOpen={isCostBasisModalOpen}
        onClose={() => setIsCostBasisModalOpen(false)}
        stellarCostBasis={stellarCostBasis}
        stellarPnlData={stellarDetailedData}
        handleCostBasisChange={handleCostBasisChange}
        handleClearAllCostBasis={handleClearAllCostBasis}
        handleExportReport={() => {
          setIsCostBasisModalOpen(false);
          setExportType('stellar');
          setExportStep(0);
          setExportError(null);
          setIsExportModalOpen(true);
        }}
        isExporting={exportStep > 0 && exportStep < 4}
      />

      {/* ========== EXPORT PROGRESS MODAL ========== */}
      <ExportProgressModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        exportType={exportType}
        defaultTimeframe={stellarTimeframe}
        defaultFromDate={isDateRangeActive ? fromDate : null}
        defaultToDate={isDateRangeActive ? toDate : null}
        onStartExport={handleStartExport}
        currentStep={exportStep}
        error={exportError}
        onRetry={() =>
          handleStartExport(exportTimeframe, exportFromDate, exportToDate, exportIsCustom)
        }
      />
    </PageLayout>
  );
};

export default Profile;
