import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  User,
  Wallet,
  Copy,
  Check,
  LogOut,
  Compass,
  Activity,
  Globe,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Sparkles,
  Calendar,
  Download,
  X as XIcon,
  Sliders
} from 'lucide-react';
import { useWalletConnect, useWalletNetwork } from '../modules/walletconnect/hooks/useWalletConnect';
import { useProfilePortfolio, type PortfolioTab } from '../modules/walletconnect/hooks/useProfilePortfolio';
import { portfolioUtils } from '../modules/walletconnect/utils/portfolioUtils';
import { getChainLogoUrl } from '../modules/evm/utils/Chainregistry';
import { type Asset } from '../modules/walletconnect/store/portfolioStore';
import { useDydxData } from '../modules/dydx/hooks/useDydxData';
import { useDydxAutoConnect } from '../modules/dydx/hooks/useDydxAutoConnect';
import { dydxDataService, type HistoricalPnl, type Fill, type Order, normalizeFill, normalizeOrder } from '../modules/dydx/service/dydxOrderService';
import { dydxWalletService } from '../modules/dydx/service/dydxWalletService';
import { selectPortfolioMetrics, useWebSocketStore } from '../modules/dydx/store/websocketStore';
import { useDateRangeStore } from '../modules/dydx/store/dateRangeStore';
import PositionsPanel from '../modules/dydx/components/orderHistory/PositionsPanel';
import LiquidationRiskBanner from '../modules/dydx/components/LiquidationRiskBanner';
import { exportDydxReport, exportStellarReport } from '../utils/exportService';
import { createChart, ColorType, AreaSeries, type IChartApi, LineType } from 'lightweight-charts';
import { fetchStellarPnl } from '../service/apiService';
import { StellarCostBasisModal } from '../components/StellarCostBasisModal';



const Profile: React.FC = () => {
  const { connectedWallets, disconnect } = useWalletConnect();
  const { network } = useWalletNetwork();
  const { isConnecting: dydxConnecting } = useDydxAutoConnect();
  const {
    isAnyWalletConnected,
    loading,
    isRefreshing,
    refetch,
    evmTotal,
    stellarTotal,
    dydxTotal,
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

  const [isStellarCollapsed, setIsStellarCollapsed] = useState<boolean>(stellarTotal === 0);
  const [isDydxCollapsed, setIsDydxCollapsed] = useState<boolean>(dydxTotal === 0);

  useEffect(() => {
    setIsStellarCollapsed(stellarTotal === 0);
  }, [stellarTotal]);

  useEffect(() => {
    setIsDydxCollapsed(dydxTotal === 0);
  }, [dydxTotal]);

  const {
    positions: dydxPositions,
    openOrderCount,
    orders: dydxOrders,
    fills: dydxFills,
    refreshPositions,
    refreshOrders,
    refreshFills
  } = useDydxData();

  const { fromDate, toDate, setFromDate, setToDate, clearRange } = useDateRangeStore();
  const isDateRangeActive = !!(fromDate || toDate);

  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [historicalPnl, setHistoricalPnl] = useState<HistoricalPnl[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loadingPnl, setLoadingPnl] = useState(false);
  const [timeframe, setTimeframe] = useState<'1d' | '7d' | '30d' | '90d'>('7d');
  const [crosshairData, setCrosshairData] = useState<{ time: number; value: number } | null>(null);

  // Stellar PNL state variables
  const [stellarPnlData, setStellarPnlData] = useState<any>(null);
  const [loadingStellarPnl, setLoadingStellarPnl] = useState(false);
  const [stellarPnlError, setStellarPnlError] = useState<string | null>(null);
  const [stellarTimeframe, setStellarTimeframe] = useState<'1w' | '1m' | '2m' | '3m'>('1m');
  const [stellarSubTab, setStellarSubTab] = useState<'overview' | 'highlights' | 'stats'>('overview');

  const [isExportingStellar, setIsExportingStellar] = useState(false);
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
  const [stellarCostBasis, setStellarCostBasis] = useState<Record<string, { openingAmount: string; costPerUnit: string }>>({});

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

  const handleCostBasisChange = (asset: string, field: 'openingAmount' | 'costPerUnit', value: string) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;

    const addr = connectedWallets.stellar?.address;
    if (!addr) return;

    setStellarCostBasis(prev => {
      const current = prev[asset] || { openingAmount: '', costPerUnit: '' };
      const updated = {
        ...prev,
        [asset]: {
          ...current,
          [field]: value
        }
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
    if (!connectedWallets.stellar?.address || loadingCostBasisDetails) return;

    if (stellarDetailedData?.positions && stellarDetailedData.positions.length > 0) {
      setIsCostBasisModalOpen(true);
      return;
    }

    setLoadingCostBasisDetails(true);
    try {
      const { fromStr, toStr } = getStellarDateRange();
      console.log(`[Stellar Cost Basis] Fetching detailed positions for address ${connectedWallets.stellar.address} from ${fromStr} to ${toStr}...`);
      const fullData: any = await fetchStellarPnl(connectedWallets.stellar.address, fromStr, toStr, true);
      if (fullData) {
        setStellarDetailedData(fullData);
        setIsCostBasisModalOpen(true);
      } else {
        throw new Error('No position data returned from server');
      }
    } catch (err) {
      console.error('[Stellar Cost Basis] Failed to fetch positions:', err);
      alert(err instanceof Error ? err.message : 'Failed to fetch position data for cost basis adjustment');
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

      const amt = config?.openingAmount !== undefined && config?.openingAmount !== ''
        ? (parseFloat(config.openingAmount) || 0)
        : (autoVal?.amount || 0);

      const cpu = config?.costPerUnit !== undefined && config?.costPerUnit !== ''
        ? (parseFloat(config.costPerUnit) || 0)
        : (autoVal?.price || 0);

      sum += amt * cpu;
    });
    return sum;
  }, [stellarDetailedData?.positions, stellarDetailedData?.autoCostBasis, stellarCostBasis]);

  const adjustedStellarPnl = useMemo(() => {
    return (stellarPnlData?.totalPnL || 0) + totalOpeningCostBasis;
  }, [stellarPnlData?.totalPnL, totalOpeningCostBasis]);

  const [dateRangeOrders, setDateRangeOrders] = useState<any[]>([]);
  const [dateRangeFillCount, setDateRangeFillCount] = useState(0);
  const [dateRangeFills, setDateRangeFills] = useState<Fill[]>([]);
  const [loadingDateRange, setLoadingDateRange] = useState(false);
  const [chartType, setChartType] = useState<'equity' | 'trades'>('equity');


  useEffect(() => {
    if (!dydxDataService.isReady()) {
      setHistoricalPnl([]);
      return;
    }
    setLoadingPnl(true);
    if (isDateRangeActive && fromDate && toDate) {
      dydxDataService.getPnlByDateRange(fromDate, toDate)
        .then(data => setHistoricalPnl(data || []))
        .catch(err => console.warn('[Profile] Failed to fetch date-range PnL:', err))
        .finally(() => setLoadingPnl(false));
    } else {
      const days = timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
      const effectiveAtOrAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      dydxDataService.getHistoricalPnl(undefined, effectiveAtOrAfter, 100, true, timeframe !== '1d')
        .then(data => setHistoricalPnl(data || []))
        .catch(err => console.warn('[Profile] Failed to fetch historical PnL:', err))
        .finally(() => setLoadingPnl(false));
    }
  }, [connectedWallets, timeframe, dydxConnecting, isDateRangeActive, fromDate, toDate]);

  useEffect(() => {
    let isMounted = true;
    setStellarDetailedData(null);

    if (connectedWallets.stellar?.address && (activeTab === 'stellar' || activeTab === 'total')) {
      const { fromStr, toStr } = getStellarDateRange();

      setLoadingStellarPnl(true);
      setStellarPnlError(null);

      console.log(`[Stellar PNL] Fetching PNL for address ${connectedWallets.stellar.address} from ${fromStr} to ${toStr}...`);

      fetchStellarPnl(connectedWallets.stellar.address, fromStr, toStr, false)
        .then(data => {
          if (!isMounted) return;
          console.log('[Stellar PNL] Success response (light summary):', data);
          setStellarPnlData(data || null);
        })
        .catch(err => {
          if (!isMounted) return;
          console.error('[Stellar PNL] Error fetching PNL:', err);
          setStellarPnlError(err instanceof Error ? err.message : 'Failed to fetch Stellar PNL');
        })
        .finally(() => {
          if (isMounted) {
            setLoadingStellarPnl(false);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [connectedWallets.stellar?.address, stellarTimeframe, activeTab, getStellarDateRange]);

  useEffect(() => {
    if (!dydxDataService.isReady()) { setTransfers([]); return; }
    if (isDateRangeActive && fromDate && toDate) {
      dydxDataService.getTransfersByDateRange(fromDate, toDate)
        .then(data => setTransfers(data))
        .catch(err => console.warn('[Profile] Failed to fetch date-range transfers:', err));
    } else {
      dydxDataService.getTransfers(100)
        .then(res => setTransfers(res?.transfers || []))
        .catch(err => console.warn('[Profile] Failed to fetch transfers:', err));
    }
  }, [connectedWallets, dydxConnecting, isDateRangeActive, fromDate, toDate]);

  useEffect(() => {
    if (!isDateRangeActive || !fromDate || !toDate || !dydxDataService.isReady()) {
      setDateRangeOrders([]);
      setDateRangeFills([]);
      setDateRangeFillCount(0);
      return;
    }
    setLoadingDateRange(true);
    Promise.all([
      dydxDataService.getOrdersByDateRange(fromDate, toDate),
      dydxDataService.getFillsByDateRange(fromDate, toDate),
    ])
      .then(([orders, fills]) => {
        setDateRangeOrders(orders);
        setDateRangeFills(fills);
        setDateRangeFillCount(fills.length);
      })
      .catch(err => console.warn('[Profile] Failed to fetch date-range stats:', err))
      .finally(() => setLoadingDateRange(false));
  }, [isDateRangeActive, fromDate, toDate, connectedWallets]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const getChainIcon = (asset: Asset): string | undefined => {
    const chainId = asset.chainType === 'stellar'
      ? (asset.chainName?.toLowerCase().includes('testnet') ? 'testnet' : 'pubnet')
      : asset.chainId;
    return getChainLogoUrl(chainId || 0);
  };

  const filteredFills = useMemo(() => {
    if (isDateRangeActive) {
      return dateRangeFills.map(normalizeFill);
    }
    const daysMap = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[timeframe] ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return (dydxFills || []).map(normalizeFill).filter(f => new Date(f.createdAt).getTime() >= cutoff);
  }, [isDateRangeActive, dateRangeFills, dydxFills, timeframe]);

  const filteredOrders = useMemo(() => {
    if (isDateRangeActive) {
      return dateRangeOrders.map(normalizeOrder);
    }
    const daysMap = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[timeframe] ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return (dydxOrders || []).map(normalizeOrder).filter(o => {
      const timeStr = o.updatedAt || o.goodTilBlockTime;
      const orderTime = timeStr ? new Date(timeStr).getTime() : ((o as any)._firstSeenAt || 0);
      return orderTime >= cutoff;
    });
  }, [isDateRangeActive, dateRangeOrders, dydxOrders, timeframe]);

  const filteredTransfers = useMemo(() => {
    if (isDateRangeActive) {
      return transfers;
    }
    const daysMap = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[timeframe] ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return transfers.filter(tx => new Date(tx.createdAt).getTime() >= cutoff);
  }, [isDateRangeActive, transfers, timeframe]);

  const visiblePnlPoints = useMemo(() => {
    try {
      const indexerPoints = Array.isArray(historicalPnl)
        ? [...historicalPnl]
          .filter(p => p && p.createdAt && p.equity)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        : [];

      const latestIndexerTime = indexerPoints.length > 0
        ? new Date(indexerPoints[indexerPoints.length - 1].createdAt).getTime()
        : 0;

      // 2. Gather recent events (transfers and fills) that occurred AFTER the latest indexer point
      const recentEvents: { time: number; createdAt: string; impact: number }[] = [];

      if (Array.isArray(filteredTransfers)) {
        filteredTransfers.forEach(tx => {
          if (!tx) return;
          const time = new Date(tx.createdAt).getTime();
          if (isNaN(time) || time <= latestIndexerTime) return;

          const val = parseFloat(tx.size || '0');
          if (isNaN(val) || val === 0) return;

          const impact = tx.type === 'DEPOSIT' ? val : -val;
          recentEvents.push({ time, createdAt: tx.createdAt, impact });
        });
      }

      if (Array.isArray(filteredFills)) {
        filteredFills.forEach(f => {
          if (!f) return;
          const time = new Date(f.createdAt).getTime();
          if (isNaN(time) || time <= latestIndexerTime) return;

          if (f.positionSideBefore && f.positionSizeBefore && f.entryPriceBefore) {
            const sizeBefore = parseFloat(f.positionSizeBefore);
            const entry = parseFloat(f.entryPriceBefore);
            const fp = parseFloat(f.price);
            const fs = parseFloat(f.size);

            if (isNaN(sizeBefore) || isNaN(entry) || isNaN(fp) || isNaN(fs)) return;

            let cpnl: number | null = null;
            if (f.positionSideBefore === 'LONG' && f.side === 'SELL') {
              cpnl = (fp - entry) * Math.min(sizeBefore, fs);
            } else if (f.positionSideBefore === 'SHORT' && f.side === 'BUY') {
              cpnl = (entry - fp) * Math.min(sizeBefore, fs);
            }

            if (cpnl !== null && !isNaN(cpnl) && cpnl !== 0) {
              recentEvents.push({ time, createdAt: f.createdAt, impact: cpnl });
            }
          }
        });
      }

      // Sort recent events in reverse chronological order (latest first) to walk backward
      recentEvents.sort((a, b) => b.time - a.time);

      const recentPoints: { createdAt: string; equity: string }[] = [];
      let currentVal = dydxTotal;

      // Point 1: current time / live equity
      recentPoints.push({
        createdAt: new Date().toISOString(),
        equity: currentVal.toString()
      });

      // Walk backward subtraction-by-subtraction for recent events
      recentEvents.forEach(event => {
        currentVal = currentVal - event.impact;
        recentPoints.push({
          createdAt: event.createdAt,
          equity: currentVal.toString()
        });
      });

      // Reverse recentPoints to be in chronological order
      recentPoints.reverse();

      // 3. Combine indexer history with the reconstructed recent points
      const mappedIndexerPoints = indexerPoints.map(p => ({
        createdAt: p.createdAt,
        equity: p.equity
      }));

      const combinedPoints = [...mappedIndexerPoints, ...recentPoints];

      // Sort all combined points chronologically
      const sortedCombined = combinedPoints.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Deduplicate by timestamp (second precision) to satisfy lightweight-charts strictly ascending constraint
      const uniquePoints: { createdAt: string; equity: string }[] = [];
      const seenSeconds = new Set<number>();
      for (const p of sortedCombined) {
        const seconds = Math.floor(new Date(p.createdAt).getTime() / 1000);
        if (isNaN(seconds)) continue;

        if (!seenSeconds.has(seconds)) {
          seenSeconds.add(seconds);
          uniquePoints.push(p);
        } else {
          // If the timestamp matches, keep the later point's equity value
          uniquePoints[uniquePoints.length - 1] = p;
        }
      }

      // If we have less than 2 points, apply fallback
      if (uniquePoints.length < 2) {
        let startTimeStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        if (isDateRangeActive && fromDate) {
          startTimeStr = new Date(fromDate).toISOString();
        } else {
          const daysMap = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
          const days = daysMap[timeframe] ?? 7;
          startTimeStr = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        }
        const today = new Date().toISOString();
        return [
          { createdAt: startTimeStr, equity: dydxTotal.toString() },
          { createdAt: today, equity: dydxTotal.toString() }
        ];
      }

      return uniquePoints;
    } catch (err) {
      console.error('[Profile] Failed to construct combined equity timeline:', err);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const today = new Date().toISOString();
      return [
        { createdAt: yesterday, equity: dydxTotal.toString() },
        { createdAt: today, equity: dydxTotal.toString() }
      ];
    }
  }, [historicalPnl, filteredTransfers, filteredFills, dydxTotal, timeframe, isDateRangeActive, fromDate]);

  const pnlStats = useMemo(() => {
    if (visiblePnlPoints.length < 2) {
      return { change: 0, percentChange: 0, currentEquity: dydxTotal };
    }
    const firstPoint = visiblePnlPoints[0];
    const lastPoint = visiblePnlPoints[visiblePnlPoints.length - 1];
    const startEquity = parseFloat(firstPoint.equity || '0');
    const currentEquity = parseFloat(lastPoint.equity || '0') || dydxTotal;
    const change = currentEquity - startEquity;
    const percentChange = startEquity > 0 ? (change / startEquity) * 100 : 0;
    return { change, percentChange, currentEquity };
  }, [visiblePnlPoints, dydxTotal]);

  // Cost Basis is handled entirely in the exported Excel file — no in-app input needed.

  const cardPnL = useMemo(() => {
    const stellarPnL = stellarPnlData?.totalPnL || 0;
    const stellarStart = stellarTotal - stellarPnL;
    const stellarPct = stellarStart > 0 ? (stellarPnL / stellarStart) * 100 : 0;

    const dydxPnL = pnlStats.change || 0;
    const dydxPct = pnlStats.percentChange || 0;

    const totalPnL = stellarPnL + dydxPnL;
    const totalStart = (stellarTotal + dydxTotal + evmTotal) - totalPnL;
    const totalPct = totalStart > 0 ? (totalPnL / totalStart) * 100 : 0;

    return {
      total: { change: totalPnL, percent: totalPct },
      evm: { change: 0, percent: 0 },
      stellar: { change: stellarPnL, percent: stellarPct },
      dydx: { change: dydxPnL, percent: dydxPct },
    };
  }, [stellarPnlData?.totalPnL, stellarTotal, dydxTotal, evmTotal, pnlStats.change, pnlStats.percentChange]);

  const periodStats = useMemo(() => {
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    filteredTransfers.forEach(tx => {
      const val = parseFloat(tx.size || '0');
      if (tx.type === 'DEPOSIT') {
        totalDeposits += val;
      } else {
        totalWithdrawals += val;
      }
    });

    const netCapitalChange = totalDeposits - totalWithdrawals;

    const startEquity = visiblePnlPoints.length > 0 ? parseFloat(visiblePnlPoints[0].equity || '0') : 0;
    const endEquity = visiblePnlPoints.length > 0 ? (parseFloat(visiblePnlPoints[visiblePnlPoints.length - 1].equity || '0') || dydxTotal) : dydxTotal;
    let closedTradesCount = 0;
    let profitableTradesCount = 0;
    let totalClosedPnl = 0;

    filteredFills.forEach(f => {
      if (f.positionSideBefore && f.positionSizeBefore && f.entryPriceBefore) {
        const sizeBefore = parseFloat(f.positionSizeBefore);
        const entry = parseFloat(f.entryPriceBefore);
        const fp = parseFloat(f.price);
        const fs = parseFloat(f.size);
        let cpnl: number | null = null;
        if (f.positionSideBefore === 'LONG' && f.side === 'SELL') cpnl = (fp - entry) * Math.min(sizeBefore, fs);
        if (f.positionSideBefore === 'SHORT' && f.side === 'BUY') cpnl = (entry - fp) * Math.min(sizeBefore, fs);
        if (cpnl !== null) {
          closedTradesCount++;
          totalClosedPnl += cpnl;
          if (cpnl > 0) profitableTradesCount++;
        }
      }
    });

    const netTradingGain = totalClosedPnl;
    const gainPercentage = (startEquity + totalDeposits) > 0
      ? (netTradingGain / (startEquity + totalDeposits)) * 100
      : 0;

    const winRate = closedTradesCount > 0 ? (profitableTradesCount / closedTradesCount) * 100 : 0;

    return {
      startEquity,
      endEquity,
      totalDeposits,
      totalWithdrawals,
      netCapitalChange,
      netTradingGain,
      gainPercentage,
      closedTradesCount,
      profitableTradesCount,
      totalClosedPnl,
      winRate
    };
  }, [filteredTransfers, visiblePnlPoints, dydxTotal, filteredFills]);

  const tradePnlPoints = useMemo(() => {
    const sorted = [...filteredFills]
      .filter(f => f.positionSideBefore && f.positionSizeBefore && f.entryPriceBefore)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let runningPnl = 0;
    const points: { time: number; value: number }[] = [];

    if (sorted.length > 0) {
      const firstTime = Math.floor(new Date(sorted[0].createdAt).getTime() / 1000);
      points.push({ time: (firstTime - 1) as any, value: 0 });
    }

    sorted.forEach(f => {
      const sizeBefore = parseFloat(f.positionSizeBefore || '0');
      const entry = parseFloat(f.entryPriceBefore || '0');
      const fp = parseFloat(f.price);
      const fs = parseFloat(f.size);
      let cpnl = 0;
      if (f.positionSideBefore === 'LONG' && f.side === 'SELL') cpnl = (fp - entry) * Math.min(sizeBefore, fs);
      if (f.positionSideBefore === 'SHORT' && f.side === 'BUY') cpnl = (entry - fp) * Math.min(sizeBefore, fs);

      runningPnl += cpnl;
      points.push({
        time: Math.floor(new Date(f.createdAt).getTime() / 1000) as any,
        value: runningPnl
      });
    });
    return points;
  }, [filteredFills]);

  // Date picker limit helpers (Max 90 days range, no future dates, timezone-safe local dates)
  const getLocalDateString = (d: Date = new Date()) => {
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
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

  const displayStats = useMemo(() => {
    const isStellar = activeTab === 'stellar';

    if (isStellar) {
      const totalPnL = stellarPnlData?.totalPnL || 0;
      const startingValue = stellarTotal - totalPnL;
      const percentChange = startingValue > 0 ? (totalPnL / startingValue) * 100 : 0;

      return {
        currentEquity: stellarTotal,
        change: totalPnL,
        percentChange,
        timeLabel: 'Stellar Wallet Valuation'
      };
    }

    if (chartType === 'equity') {
      if (crosshairData && visiblePnlPoints.length > 0) {
        const firstEquity = parseFloat(visiblePnlPoints[0].equity || '0');
        const change = crosshairData.value - firstEquity;
        const percentChange = firstEquity > 0 ? (change / firstEquity) * 100 : 0;
        return {
          currentEquity: crosshairData.value,
          change,
          percentChange,
          timeLabel: new Date(crosshairData.time * 1000).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })
        };
      }
      return {
        currentEquity: pnlStats.currentEquity,
        change: pnlStats.change,
        percentChange: pnlStats.percentChange,
        timeLabel: 'Trading Account Value'
      };
    } else {
      if (crosshairData && tradePnlPoints.length > 0) {
        return {
          currentEquity: crosshairData.value,
          change: crosshairData.value,
          percentChange: 0,
          timeLabel: new Date(crosshairData.time * 1000).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })
        };
      }
      return {
        currentEquity: periodStats.totalClosedPnl,
        change: periodStats.totalClosedPnl,
        percentChange: 0,
        timeLabel: 'Cumulative Closed PnL'
      };
    }
  }, [crosshairData, pnlStats, visiblePnlPoints, chartType, tradePnlPoints, periodStats.totalClosedPnl, activeTab, stellarPnlData?.totalPnL, stellarTotal]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (activeTab === 'stellar') return;
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const container = chartContainerRef.current;
    const isDark = document.documentElement.classList.contains('dark');
    const isGreen = chartType === 'equity' ? pnlStats.change >= 0 : periodStats.totalClosedPnl >= 0;

    // Initialize with container size (fallback to default height)
    const initialWidth = container.clientWidth || 300;
    const initialHeight = container.clientHeight || 240;

    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#e8edf8' : '#0f1729',
      },
      grid: {
        vertLines: { color: isDark ? '#1e28405d' : '#dce3ed' },
        horzLines: { color: isDark ? '#1e28405d' : '#dce3ed' },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      crosshair: {
        horzLine: {
          labelBackgroundColor: isDark ? '#1e2840' : '#e4e8f0',
        },
        vertLine: {
          labelBackgroundColor: isDark ? '#1e2840' : '#e4e8f0',
        }
      }
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: isGreen ? '#10b981' : '#ef4444',
      topColor: isGreen ? '#10b98125' : '#ef444425',
      bottomColor: 'transparent',
      lineWidth: 2,
      lineType: chartType === 'trades' ? LineType.WithSteps : LineType.Simple,
    });

    seriesRef.current = series;

    const hasData = chartType === 'equity' ? visiblePnlPoints.length >= 2 : tradePnlPoints.length >= 1;

    if (hasData) {
      const data = chartType === 'equity'
        ? visiblePnlPoints.map(p => ({
          time: Math.floor(new Date(p.createdAt).getTime() / 1000) as any,
          value: parseFloat(p.equity || '0')
        }))
        : tradePnlPoints;

      const sortedData = [...data].sort((a, b) => a.time - b.time);
      const uniqueData: typeof data = [];
      const seenTimes = new Set<number>();
      for (const d of sortedData) {
        if (!seenTimes.has(d.time)) {
          seenTimes.add(d.time);
          uniqueData.push(d);
        } else {
          uniqueData[uniqueData.length - 1].value = d.value;
        }
      }

      series.setData(uniqueData);
      chart.timeScale().fitContent();
    }

    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        setCrosshairData(null);
        return;
      }
      const val = param.seriesData.get(series) as any;
      if (val !== undefined) {
        setCrosshairData({
          time: param.time as number,
          value: val.value !== undefined ? val.value : val,
        });
      }
    });

    chartRef.current = chart;

    // Use ResizeObserver for responsive container sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && chartRef.current) {
          chartRef.current.applyOptions({
            width,
            height: height || 240
          });
          chartRef.current.timeScale().fitContent();
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [visiblePnlPoints, tradePnlPoints, chartType, activeTab, loadingPnl]);

  useEffect(() => {
    if (activeTab === 'stellar') return;
    if (!seriesRef.current) return;
    const isGreen = chartType === 'equity' ? pnlStats.change >= 0 : periodStats.totalClosedPnl >= 0;
    seriesRef.current.applyOptions({
      lineColor: isGreen ? '#10b981' : '#ef4444',
      topColor: isGreen ? '#10b98125' : '#ef444425',
    });
  }, [pnlStats.change, periodStats.totalClosedPnl, chartType, activeTab]);

  const dydxLeverage = useMemo(() => {
    if (dydxPositions.length === 0 || dydxTotal <= 0) return 0;
    let totalNotional = 0;
    dydxPositions.forEach(pos => {
      const sizeVal = Math.abs(parseFloat(pos.size || '0'));
      const entryPriceVal = parseFloat(pos.entryPrice || '0');
      totalNotional += sizeVal * entryPriceVal;
    });
    return totalNotional / dydxTotal;
  }, [dydxPositions, dydxTotal]);

  const activeAddress = dydxWalletService.getAddress();
  const parentKey = activeAddress ? `parent_subaccount_${activeAddress}_0` : null;
  const wsUpdateTrigger = useWebSocketStore(s => s.updateTrigger);
  const optimisticDelta = useWebSocketStore(s => s.optimisticFreeCollateralDelta);
  const marketsMap = useWebSocketStore(s => s.markets);

  const parentData = useWebSocketStore(
    useCallback(
      s => (parentKey ? s.parentSubaccounts.get(parentKey) : undefined),
      [parentKey, wsUpdateTrigger]
    )
  );

  const leveragesMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!parentData?.childSubaccounts) return map;
    parentData.childSubaccounts.forEach(child => {
      const positions = Object.keys(child.openPerpetualPositions || {});
      positions.forEach(ticker => {
        const marketKey = `dydx_leverage_${ticker}`;
        const saved = localStorage.getItem(marketKey) ?? localStorage.getItem('dydx_leverage');
        if (saved) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed > 0) map[ticker] = parsed;
        }
      });
    });
    return map;
  }, [parentData, wsUpdateTrigger]);

  const marginMetrics = useMemo(
    () => selectPortfolioMetrics(parentData, optimisticDelta, marketsMap, leveragesMap),
    [parentData, optimisticDelta, marketsMap, leveragesMap]
  );

  const getCardDetails = (tab: PortfolioTab) => {
    switch (tab) {
      case 'total':
        return {
          title: 'Total Portfolio',
          icon: <Sparkles size={20} className="text-amber-400" />,
          total: grandTotal,
          walletId: 'Aggregate Asset View',
          address: '',
          color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
          glow: 'shadow-amber-500/10',
          activeBg: 'bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent border-amber-500 shadow-amber-500/10'
        };
      case 'evm':
        return {
          title: 'EVM Portfolio',
          icon: <Wallet size={20} className="text-blue-400" />,
          total: evmTotal,
          walletId: connectedWallets.evm?.walletId || 'Unknown',
          address: connectedWallets.evm?.address || '',
          color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-400',
          glow: 'shadow-blue-500/10',
          activeBg: 'bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-transparent border-blue-500 shadow-blue-500/10'
        };
      case 'stellar':
        return {
          title: 'Stellar Portfolio',
          icon: <Compass size={20} className="text-purple-400" />,
          total: stellarTotal,
          walletId: connectedWallets.stellar?.walletId || 'Unknown',
          address: connectedWallets.stellar?.address || '',
          color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30 text-purple-400',
          glow: 'shadow-purple-500/10',
          activeBg: 'bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent border-purple-500 shadow-purple-500/10'
        };
      case 'dydx':
        return {
          title: 'dYdX Account',
          icon: <Activity size={20} className="text-emerald-400" />,
          total: dydxTotal,
          walletId: connectedWallets.evm?.dydxAddress ? connectedWallets.evm.walletId : (connectedWallets.cosmos?.walletId || 'Derived'),
          address: connectedWallets.evm?.dydxAddress || connectedWallets.cosmos?.dydxAddress || '',
          color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
          glow: 'shadow-emerald-500/10',
          activeBg: 'bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-500 shadow-emerald-500/10'
        };
    }
  };

  const displayedFillCount = isDateRangeActive ? dateRangeFillCount : (filteredFills.length || 0);
  const displayedOrderCount = isDateRangeActive ? dateRangeOrders.length : (filteredOrders.length || 0);

  const getPeriodLabel = (): string => {
    if (isDateRangeActive && fromDate && toDate) return `${fromDate} to ${toDate}`;
    return `Last ${timeframe}`;
  };

  const exportDydxOnly = useCallback(async () => {
    const period = getPeriodLabel();
    let fills: Fill[] = [];
    let orders: Order[] = [];
    let exportTransfers = [...transfers];
    let exportPnlHistory: HistoricalPnl[] = visiblePnlPoints.map(p => ({
      id: p.createdAt,
      equity: p.equity,
      totalPnl: '0',
      netTransfers: '0',
      createdAt: p.createdAt,
      blockHeight: '0',
      blockTime: p.createdAt
    }));

    try {
      const daysMap = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[timeframe] ?? 7;
      const cutoff = isDateRangeActive ? 0 : Date.now() - days * 86400000;

      if (isDateRangeActive && fromDate && toDate) {
        const fromTime = new Date(fromDate).getTime();
        const toTime = new Date(toDate).getTime() + 86400000;

        [fills, orders] = await Promise.all([
          dydxDataService.getFillsByDateRange(fromDate, toDate),
          dydxDataService.getOrdersByDateRange(fromDate, toDate),
        ]);

        exportTransfers = transfers.filter(tx => {
          const t = new Date(tx.createdAt).getTime();
          return t >= fromTime && t <= toTime;
        });
        exportPnlHistory = exportPnlHistory.filter(p => {
          const t = new Date(p.createdAt).getTime();
          return t >= fromTime && t <= toTime;
        });
      } else {
        const from = new Date(cutoff).toISOString().slice(0, 10);
        const to = new Date().toISOString().slice(0, 10);

        [fills, orders] = await Promise.all([
          dydxDataService.getFillsByDateRange(from, to),
          dydxDataService.getOrdersByDateRange(from, to),
        ]);

        exportTransfers = transfers.filter(tx => new Date(tx.createdAt).getTime() >= cutoff);
        exportPnlHistory = exportPnlHistory.filter(p => new Date(p.createdAt).getTime() >= cutoff);
      }
    } catch (e) {
      console.warn('[Profile] Export fetch failed:', e);
    }

    exportDydxReport({
      pnlHistory: exportPnlHistory,
      fills,
      orders,
      transfers: exportTransfers,
      period,
    });
  }, [visiblePnlPoints, transfers, isDateRangeActive, fromDate, toDate, timeframe]);

  const handleExportStellarReport = async () => {
    if (!connectedWallets.stellar?.address || isExportingStellar) return;

    setIsExportingStellar(true);
    try {
      const { fromStr, toStr } = getStellarDateRange();
      console.log(`[Stellar Export] Fetching full excel report for address ${connectedWallets.stellar.address} from ${fromStr} to ${toStr}...`);

      let fullData = stellarDetailedData;
      if (!fullData || !fullData.positions) {
        fullData = await fetchStellarPnl(connectedWallets.stellar.address, fromStr, toStr, true);
        if (fullData) {
          setStellarDetailedData(fullData);
        }
      }

      if (!fullData) {
        throw new Error('No report data returned from server');
      }

      const periodLabel = isDateRangeActive && fromDate && toDate
        ? `${fromDate} to ${toDate}`
        : (stellarTimeframe === '1w' ? 'Last 1 Week' : stellarTimeframe === '1m' ? 'Last 1 Month' : stellarTimeframe === '2m' ? 'Last 2 Months' : 'Last 3 Months');

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

          const openingAmount = config?.openingAmount !== undefined && config?.openingAmount !== ''
            ? parseFloat(config.openingAmount)
            : (autoVal?.amount ?? null);

          const openingCostPerUnit = config?.costPerUnit !== undefined && config?.costPerUnit !== ''
            ? parseFloat(config.costPerUnit)
            : (autoVal?.price ?? null);

          return {
            ...pos,
            openingAmount,
            openingCostPerUnit
          };
        }),
      });
    } catch (err) {
      console.error('[Stellar Export] Failed to export report:', err);
      alert(err instanceof Error ? err.message : 'Failed to export report');
    } finally {
      setIsExportingStellar(false);
    }
  };

  const handleSyncBalances = async () => {
    refetch();
    if (dydxDataService.isReady()) {
      refreshPositions().catch(() => { });
      refreshOrders().catch(() => { });
      refreshFills().catch(() => { });
    }
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
              <div key={i} className="p-5 rounded-2xl border border-(--color-border) bg-(--color-bg-secondary) space-y-4 shadow-md">
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
                <div key={i} className="p-3 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl space-y-2">
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

  return (
    <div className="bg-secondary p-4 md:p-6 lg:rounded-xl lg:max-w-7xl w-full max-w-[100vw] mx-auto space-y-8 my-4">

      <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-6 relative overflow-hidden shadow-md ">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 relative z-10">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-brand-primary to-emerald-500 p-1 shadow-inner flex-shrink-0 flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
              <User size={48} className="text-brand-primary" />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              <h2 className="text-2xl font-bold tracking-tight">SwiftEx Member</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${isAnyWalletConnected
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                }`}>
                {isAnyWalletConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>

            <p className="text-sm text-(--color-text-secondary) max-w-lg">
              Manage your connected blockchain accounts, networks, and decentralized exchange profiles.
            </p>

            <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border)">
                <Globe size={14} className="text-brand-primary" />
                <span>Network: <span className="font-semibold capitalize text-brand-primary">{network}</span></span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border)">
                <Activity size={14} className="text-brand-primary" />
                <span>Total Net Worth: <span className="font-bold text-brand-primary">{portfolioUtils.formatUSD(grandTotal)}</span></span>
              </div>

            </div>

          </div>
        </div>
      </div>

      {dydxDataService.isReady() && <LiquidationRiskBanner />}

      <div className="space-y-6 ">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Wallet className="text-brand-primary" size={22} />
            <h3 className="text-xl font-bold">My Portfolio</h3>
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
                Connect your EVM, Stellar, or Cosmos wallet from the top right bar to start syncing your balances.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            {grandTotal > 0 && (
              <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-2">
                  <span className="font-bold text-(--color-text-secondary) uppercase tracking-wider text-[10px]">Portfolio Distribution</span>
                  <div className="flex flex-wrap items-center gap-3 text-[10.5px] font-semibold text-(--color-text-secondary)">
                    {evmTotal > 0 && (
                      <span className="flex items-center gap-1.5 bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        EVM: {portfolioUtils.formatUSD(evmTotal)} ({((evmTotal / grandTotal) * 100).toFixed(0)}%)
                      </span>
                    )}
                    {stellarTotal > 0 && (
                      <span className="flex items-center gap-1.5 bg-purple-500/5 px-2 py-0.5 rounded border border-purple-500/10">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Stellar: {portfolioUtils.formatUSD(stellarTotal)} ({((stellarTotal / grandTotal) * 100).toFixed(0)}%)
                      </span>
                    )}
                    {dydxTotal > 0 && (
                      <span className="flex items-center gap-1.5 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        dYdX: {portfolioUtils.formatUSD(dydxTotal)} ({((dydxTotal / grandTotal) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-(--color-bg-tertiary) flex overflow-hidden border border-(--color-border)/30">
                  {evmTotal > 0 && (
                    <div
                      style={{ width: `${(evmTotal / grandTotal) * 100}%` }}
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                      title={`EVM: ${((evmTotal / grandTotal) * 100).toFixed(1)}%`}
                    />
                  )}
                  {stellarTotal > 0 && (
                    <div
                      style={{ width: `${(stellarTotal / grandTotal) * 100}%` }}
                      className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
                      title={`Stellar: ${((stellarTotal / grandTotal) * 100).toFixed(1)}%`}
                    />
                  )}
                  {dydxTotal > 0 && (
                    <div
                      style={{ width: `${(dydxTotal / grandTotal) * 100}%` }}
                      className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                      title={`dYdX: ${((dydxTotal / grandTotal) * 100).toFixed(1)}%`}
                    />
                  )}
                </div>
              </div>
            )}

            <div className={`grid gap-4 ${activeTabs.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
              activeTabs.length === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              }`}>
              {activeTabs.map(tab => {
                const details = getCardDetails(tab);
                const isActive = activeTab === tab;
                const isCopied = copiedStates[tab];
                const pnl = cardPnL[tab];

                return (
                  <div
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer relative overflow-hidden group shadow-md hover:shadow-xl ${isActive
                      ? `${details.activeBg} border-brand-primary/50 shadow-inner`
                      : 'bg-(--color-bg-secondary) border-(--color-border) hover:border-brand-primary/30 hover:-translate-y-0.5'
                      }`}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 rounded-full blur-2xl pointer-events-none group-hover:scale-150 transition-all duration-500" />

                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-(--color-bg-tertiary) border border-(--color-border) flex items-center justify-center shadow-sm">
                          {details.icon}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-(--color-text-primary)">{details.title}</h4>
                          <span className="text-[10px] text-(--color-text-secondary)">
                            {details.walletId}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-brand-primary animate-ping" />
                        )}
                        <ChevronRight size={16} className={`text-(--color-text-secondary) group-hover:translate-x-0.5 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    <div className="mt-6 space-y-1">
                      <span className="text-xs text-(--color-text-secondary)">Total USD Balance</span>
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-2xl font-black tracking-tight text-(--color-text-primary)">
                          {portfolioUtils.formatUSD(details.total)}
                        </div>
                        {pnl.change !== 0 && (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 border ${pnl.change >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                            {pnl.change >= 0 ? '▲' : '▼'} {Math.abs(pnl.percent).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>


                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-4 pt-4 border-t border-(--color-border) flex items-center justify-between text-xs text-(--color-text-secondary)"
                    >
                      {tab === 'total' ? (
                        <span className="text-[10.5px] font-medium text-brand-primary/80">
                          Unified Multi-Chain View
                        </span>
                      ) : (
                        <span className="font-mono truncate max-w-[70%]">
                          {details.address ? `${details.address.slice(0, 6)}...${details.address.slice(-6)}` : 'No address'}
                        </span>
                      )}
                      {details.address && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(details.address, tab)}
                            className="hover:text-brand-primary transition-colors p-1"
                            title="Copy Address"
                          >
                            {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>
                          <button
                            onClick={() => disconnect(tab === 'stellar' ? 'stellar' : 'evm')}
                            className="hover:text-red-400 transition-colors p-1"
                            title="Disconnect Wallet"
                          >
                            <LogOut size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {(((activeTab === 'dydx' || activeTab === 'total') && (dydxTotal > 0 || dydxPositions.length > 0 || visiblePnlPoints.length > 0)) ||
              (activeTab === 'stellar' && connectedWallets.stellar?.address)) && (
                <div className="space-y-6 pt-2">

                  {/* dYdX Performance Container */}
                  {(activeTab === 'dydx' || (activeTab === 'total' && (dydxTotal > 0 || dydxPositions.length > 0 || visiblePnlPoints.length > 0))) && (
                    <div className="w-full bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-5 shadow-md flex flex-col justify-between space-y-4">
                      <div
                        onClick={() => setIsDydxCollapsed(!isDydxCollapsed)}
                        className="flex items-center justify-between cursor-pointer py-1 select-none"
                      >
                        <div className="flex items-center gap-2">
                          <Activity size={18} className="text-emerald-400" />
                          <h4 className="font-bold text-sm text-(--color-text-primary)">dYdX Performance & Analytics</h4>
                          {dydxTotal === 0 && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">Empty Account</span>
                          )}
                        </div>
                        <ChevronRight size={16} className={`text-(--color-text-secondary) transition-transform duration-300 ${!isDydxCollapsed ? 'rotate-90' : ''}`} />
                      </div>

                      {!isDydxCollapsed && (
                        <>
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div>
                                <span className="text-xs font-semibold text-(--color-text-secondary)">{chartType === 'equity' ? 'Trading Account Value' : 'Cumulative Closed PnL'}</span>
                                <div className="flex items-baseline gap-2 mt-0.5">
                                  <span className="text-2xl font-black text-(--color-text-primary)">
                                    {portfolioUtils.formatUSD(displayStats.currentEquity)}
                                  </span>
                                  {chartType === 'equity' ? (
                                    displayStats.change !== 0 && (
                                      <span className={`text-xs font-bold flex items-center ${displayStats.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {displayStats.change >= 0 ? '▲' : '▼'} {portfolioUtils.formatUSD(Math.abs(displayStats.change))} ({displayStats.percentChange.toFixed(2)}%)
                                      </span>
                                    )
                                  ) : (
                                    <span className={`text-xs font-bold flex items-center ${periodStats.totalClosedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {periodStats.closedTradesCount > 0 ? `${periodStats.winRate.toFixed(0)}% Profitable Trades (${periodStats.profitableTradesCount} of ${periodStats.closedTradesCount})` : 'No closed trades'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                                  <div className="flex items-center bg-(--color-bg-tertiary) border border-(--color-border) hover:border-brand-primary/40 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/10 rounded-xl px-3 py-1.5 transition-all duration-200 shadow-sm gap-2">
                                    <Calendar size={13} className="text-(--color-text-secondary) shrink-0" />
                                    <input
                                      type="date"
                                      value={fromDate || ''}
                                      min={minFromDate}
                                      max={maxFromDate}
                                      onKeyDown={e => e.preventDefault()}
                                      onChange={e => setFromDate(e.target.value || null)}
                                      className="bg-transparent text-[11.5px] font-semibold text-(--color-text-primary) outline-none w-[105px] cursor-pointer"
                                      placeholder="From"
                                    />
                                    <span className="text-(--color-text-secondary) text-[10px] font-bold px-0.5 select-none">TO</span>
                                    <input
                                      type="date"
                                      value={toDate || ''}
                                      min={minToDate}
                                      max={maxToDate}
                                      onKeyDown={e => e.preventDefault()}
                                      onChange={e => setToDate(e.target.value || null)}
                                      className="bg-transparent text-[11.5px] font-semibold text-(--color-text-primary) outline-none w-[105px] cursor-pointer"
                                      placeholder="To"
                                    />
                                  </div>
                                  {isDateRangeActive && (
                                    <button
                                      onClick={clearRange}
                                      className="p-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary) hover:text-red-400 transition"
                                      title="Clear date range"
                                    >
                                      <XIcon size={12} />
                                    </button>
                                  )}
                                  <button
                                    onClick={exportDydxOnly}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 shadow-sm border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 cursor-pointer"
                                    title={`Download dYdX trading report for ${getPeriodLabel()} (XLS)`}
                                  >
                                    <Download size={13} className="shrink-0 animate-pulse-subtle" />
                                    dYdX Report
                                  </button>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto sm:justify-end">
                                  <div className="flex gap-1 bg-(--color-bg-tertiary) p-1 rounded-xl border border-(--color-border)">
                                    <button
                                      onClick={() => setChartType('equity')}
                                      className={`px-3 py-1 rounded-lg text-[10.5px] font-bold transition-all ${chartType === 'equity'
                                        ? 'bg-brand-primary text-white shadow-sm'
                                        : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                                        }`}
                                    >
                                      Equity Chart
                                    </button>
                                    <button
                                      onClick={() => setChartType('trades')}
                                      className={`px-3 py-1 rounded-lg text-[10.5px] font-bold transition-all ${chartType === 'trades'
                                        ? 'bg-brand-primary text-white shadow-sm'
                                        : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                                        }`}
                                    >
                                      Trade PnL
                                    </button>
                                  </div>

                                  {!isDateRangeActive ? (
                                    <div className="flex gap-1 bg-(--color-bg-tertiary) p-1 rounded-xl border border-(--color-border)">
                                      {(['1d', '7d', '30d', '90d'] as const).map(tf => (
                                        <button
                                          key={tf}
                                          onClick={() => setTimeframe(tf)}
                                          className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all ${timeframe === tf
                                            ? 'bg-brand-primary text-white shadow-sm'
                                            : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                                            }`}
                                        >
                                          {tf}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 text-[10.5px] text-brand-primary font-semibold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse inline-block" />
                                      Custom range active
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="h-[240px] w-full relative flex items-center justify-center bg-(--color-bg-secondary) rounded-xl overflow-hidden border border-(--color-border)/50 p-2">
                            {loadingPnl ? (
                              <div className="flex flex-col items-center justify-center h-full w-full gap-2 text-xs text-(--color-text-secondary)">
                                <RefreshCw size={18} className="animate-spin text-brand-primary" />
                                <span>Loading metrics...</span>
                              </div>
                            ) : (chartType === 'equity' ? visiblePnlPoints.length < 2 : tradePnlPoints.length < 1) ? (
                              <div className="flex flex-col items-center justify-center h-full w-full gap-2 text-xs text-(--color-text-secondary) italic text-center px-4">
                                <span>
                                  {chartType === 'equity'
                                    ? "Syncing transaction indices for performance history..."
                                    : "No closed trades found for this period."}
                                </span>
                              </div>
                            ) : (
                              <div ref={chartContainerRef} className="w-full h-full" />
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-(--color-border)/60 text-xs">
                            <div className="p-3 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
                              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">Margin Usage</span>
                              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                                {marginMetrics ? `${marginMetrics.marginUsagePercent.toFixed(2)}%` : '0.00%'}
                              </span>
                            </div>
                            <div className="p-3 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
                              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">Account Leverage</span>
                              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                                {`${dydxLeverage.toFixed(2)}×`}
                              </span>
                            </div>
                            <div className="p-3 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
                              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">Open Orders</span>
                              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                                {openOrderCount || 0}
                              </span>
                            </div>
                            <div className="p-3 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
                              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">
                                {isDateRangeActive ? 'Fills (range)' : 'Filled Trades'}
                              </span>
                              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                                {loadingDateRange ? '…' : displayedFillCount}
                              </span>
                            </div>
                            <div className="p-3 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl">
                              <span className="text-(--color-text-secondary) block text-[10px] uppercase font-semibold tracking-wider">
                                {isDateRangeActive ? 'Orders (range)' : 'Order History'}
                              </span>
                              <span className="font-black text-sm text-(--color-text-primary) mt-0.5 block">
                                {loadingDateRange ? '…' : displayedOrderCount}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-(--color-bg-tertiary)/20 p-4 rounded-xl border border-(--color-border)/40 mt-1">
                            <div>
                              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-semibold tracking-wider">Total Deposited</span>
                              <span className="font-bold text-xs text-(--color-text-primary) mt-1 block">
                                {portfolioUtils.formatUSD(periodStats.totalDeposits)}
                              </span>
                              <span className="text-[9.5px] text-(--color-text-secondary) mt-0.5 block leading-normal">
                                Funds added to account
                              </span>
                            </div>
                            <div>
                              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-semibold tracking-wider">Total Withdrawn</span>
                              <span className="font-bold text-xs text-(--color-text-primary) mt-1 block">
                                {portfolioUtils.formatUSD(periodStats.totalWithdrawals)}
                              </span>
                              <span className="text-[9.5px] text-(--color-text-secondary) mt-0.5 block leading-normal">
                                Funds removed from account
                              </span>
                            </div>
                            <div>
                              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-semibold tracking-wider">Net Capital Funded</span>
                              <span className="font-bold text-xs text-(--color-text-primary) mt-1 block">
                                {portfolioUtils.formatUSD(periodStats.netCapitalChange)}
                              </span>
                              <span className="text-[9.5px] text-(--color-text-secondary) mt-0.5 block leading-normal">
                                Deposits minus withdrawals
                              </span>
                            </div>
                            <div>
                              <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-semibold tracking-wider font-bold">Net Period PnL</span>
                              <span className={`font-black text-xs mt-1 block ${periodStats.netTradingGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {periodStats.netTradingGain >= 0 ? '+' : ''}{portfolioUtils.formatUSD(periodStats.netTradingGain)}
                                {(periodStats.startEquity + periodStats.totalDeposits) > 0 && (
                                  <span className="text-[10px] ml-1 font-semibold opacity-90">
                                    ({periodStats.gainPercentage >= 0 ? '+' : ''}{periodStats.gainPercentage.toFixed(2)}%)
                                  </span>
                                )}
                              </span>
                              <span className="text-[9.5px] text-(--color-text-secondary) mt-0.5 block leading-normal">
                                Trading profit or loss
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Open Margin Positions panel */}
                  {(activeTab === 'dydx' || activeTab === 'total') && (
                    <div id="open-margin-positions" className="w-full bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-5 shadow-md space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text">Open Margin Positions</h4>
                      </div>
                      <div className="border border-(--color-border) rounded-xl overflow-hidden min-h-[200px] py-4 bg-primary">
                        <PositionsPanel />
                      </div>
                    </div>
                  )}

                  {(activeTab === 'stellar' || (activeTab === 'total' && connectedWallets.stellar?.address)) && (
                    <div className="w-full bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-5 shadow-md flex flex-col justify-between space-y-4">
                      <div
                        onClick={() => setIsStellarCollapsed(!isStellarCollapsed)}
                        className="flex items-center justify-between cursor-pointer py-1 select-none"
                      >
                        <div className="flex items-center gap-2">
                          <Compass size={18} className="text-purple-400" />
                          <h4 className="font-bold text-sm text-(--color-text-primary)">Stellar Performance & Analytics</h4>
                          {stellarTotal === 0 && (
                            <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-semibold">Empty Balance</span>
                          )}
                        </div>
                        <ChevronRight size={16} className={`text-(--color-text-secondary) transition-transform duration-300 ${!isStellarCollapsed ? 'rotate-90' : ''}`} />
                      </div>

                      {!isStellarCollapsed && (
                        <>
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div>
                                <span className="text-xs font-semibold text-(--color-text-secondary)">Stellar Wallet Valuation</span>
                                <div className="flex items-baseline gap-2 mt-0.5">
                                  <span className="text-2xl font-black text-(--color-text-primary)">
                                    {portfolioUtils.formatUSD(stellarTotal)}
                                  </span>
                                  {stellarPnlData && stellarPnlData.totalPnL !== 0 && (
                                    <span className={`text-xs font-bold flex items-center ${(stellarPnlData.totalPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {(stellarPnlData.totalPnL || 0) >= 0 ? '▲' : '▼'} {portfolioUtils.formatUSD(Math.abs(stellarPnlData.totalPnL || 0))}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                                  <div className="flex items-center bg-(--color-bg-tertiary) border border-(--color-border) hover:border-brand-primary/40 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/10 rounded-xl px-3 py-1.5 transition-all duration-200 shadow-sm gap-2">
                                    <Calendar size={13} className="text-(--color-text-secondary) shrink-0" />
                                    <input
                                      type="date"
                                      value={fromDate || ''}
                                      min={minFromDate}
                                      max={maxFromDate}
                                      onKeyDown={e => e.preventDefault()}
                                      onChange={e => setFromDate(e.target.value || null)}
                                      className="bg-transparent text-[11.5px] font-semibold text-(--color-text-primary) outline-none w-[105px] cursor-pointer"
                                      placeholder="From"
                                    />
                                    <span className="text-(--color-text-secondary) text-[10px] font-bold px-0.5 select-none">TO</span>
                                    <input
                                      type="date"
                                      value={toDate || ''}
                                      min={minToDate}
                                      max={maxToDate}
                                      onKeyDown={e => e.preventDefault()}
                                      onChange={e => setToDate(e.target.value || null)}
                                      className="bg-transparent text-[11.5px] font-semibold text-(--color-text-primary) outline-none w-[105px] cursor-pointer"
                                      placeholder="To"
                                    />
                                  </div>
                                  {isDateRangeActive && (
                                    <button
                                      onClick={clearRange}
                                      className="p-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary) hover:text-red-400 transition"
                                      title="Clear date range"
                                    >
                                      <XIcon size={12} />
                                    </button>
                                  )}
                                  <button
                                    onClick={handleOpenCostBasis}
                                    disabled={loadingCostBasisDetails}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 shadow-sm border border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    title="Adjust Stellar asset cost basis"
                                  >
                                    {loadingCostBasisDetails ? (
                                      <RefreshCw size={13} className="animate-spin shrink-0" />
                                    ) : (
                                      <Sliders size={13} className="shrink-0" />
                                    )}
                                    {loadingCostBasisDetails ? 'Loading...' : 'Adjust Cost Basis'}
                                  </button>
                                  <button
                                    onClick={handleExportStellarReport}
                                    disabled={isExportingStellar}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 shadow-sm border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    title="Download Stellar trading report (XLS)"
                                  >
                                    {isExportingStellar ? (
                                      <RefreshCw size={13} className="animate-spin shrink-0" />
                                    ) : (
                                      <Download size={13} className="shrink-0 animate-pulse-subtle" />
                                    )}
                                    {isExportingStellar ? 'Generating...' : 'Stellar Report'}
                                  </button>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto sm:justify-end">
                                  {!isDateRangeActive ? (
                                    <div className="flex gap-1 bg-(--color-bg-tertiary) p-1 rounded-xl border border-(--color-border)">
                                      {(['1w', '1m', '2m', '3m'] as const).map(tf => (
                                        <button
                                          key={tf}
                                          onClick={() => setStellarTimeframe(tf)}
                                          className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all ${stellarTimeframe === tf
                                            ? 'bg-brand-primary text-white shadow-sm'
                                            : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                                            }`}
                                        >
                                          {tf}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 text-[10.5px] text-brand-primary font-semibold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse inline-block" />
                                      Custom range active
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="min-h-[220px] md:h-[240px] w-full relative flex flex-col md:flex-row items-center justify-between bg-gradient-to-r from-purple-950/20 to-pink-950/10 border border-purple-500/20 rounded-2xl overflow-hidden p-6 gap-6">
                            {loadingStellarPnl ? (
                              <div className="flex flex-col items-center justify-center h-full w-full gap-2 text-xs text-(--color-text-secondary)">
                                <RefreshCw size={18} className="animate-spin text-brand-primary" />
                                <span>Loading Stellar metrics...</span>
                              </div>
                            ) : stellarPnlError ? (
                              <div className="flex flex-col items-center justify-center h-full w-full gap-2 text-xs text-red-400 italic text-center px-4">
                                <span>{stellarPnlError}</span>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 space-y-3">
                                  <div className="flex items-center gap-2">
                                    <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse">
                                      <Compass size={20} />
                                    </span>
                                    <div>
                                      <h4 className="text-sm font-bold text-(--color-text-primary)">Stellar Wallet Overview</h4>
                                      <p className="text-[11px] text-(--color-text-secondary)">Valuation & outcomes for this account</p>
                                    </div>
                                  </div>

                                  <div className="space-y-2 pt-2">
                                    <span className="text-[10px] uppercase font-bold text-(--color-text-secondary) tracking-wider">Stellar Wallet Balance</span>
                                    <div className="text-3xl font-black text-(--color-text-primary) tracking-tight">
                                      {portfolioUtils.formatUSD(stellarTotal)}
                                    </div>
                                    <span className="text-[10.5px] text-(--color-text-secondary) flex items-center gap-1.5">
                                      Address:
                                      <span className="font-mono text-purple-400/90 text-[10px] bg-purple-500/5 px-2 py-0.5 rounded-lg border border-purple-500/10">
                                        {connectedWallets.stellar?.address
                                          ? `${connectedWallets.stellar.address.slice(0, 8)}...${connectedWallets.stellar.address.slice(-8)}`
                                          : 'N/A'}
                                      </span>
                                    </span>
                                  </div>
                                </div>

                                <div className="flex-1 w-full md:w-auto h-full flex flex-col justify-center bg-purple-950/10 border border-purple-500/10 rounded-xl p-5 space-y-4">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs text-(--color-text-secondary) font-semibold">Net Outcomes</span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(stellarPnlData?.totalPnL ?? 0) >= 0
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                      }`}>
                                      {(stellarPnlData?.totalPnL ?? 0) >= 0 ? 'Profit' : 'Loss'}
                                    </span>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] uppercase font-bold text-(--color-text-secondary) tracking-wider">Trading Net PnL</span>
                                      {totalOpeningCostBasis > 0 && (
                                        <span className="text-[9px] uppercase font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded">Adjusted</span>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-1 mt-0.5">
                                      <span className={`text-3xl font-black ${(stellarPnlData?.totalPnL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {(stellarPnlData?.totalPnL ?? 0) >= 0 ? '+' : ''}{portfolioUtils.formatUSD(stellarPnlData?.totalPnL ?? 0)}
                                      </span>
                                      {totalOpeningCostBasis > 0 && (
                                        <span className={`text-sm font-bold opacity-90 ${adjustedStellarPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                          {adjustedStellarPnl >= 0 ? '+' : ''}{portfolioUtils.formatUSD(adjustedStellarPnl)} <span className="text-[10px] text-(--color-text-secondary) font-normal">(Adjusted)</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="w-full bg-(--color-bg-tertiary) h-1.5 rounded-full overflow-hidden flex">
                                    {stellarPnlData && (stellarPnlData.usdcSpent > 0 || stellarPnlData.usdcReceived > 0) ? (
                                      <>
                                        <div
                                          style={{ width: `${(stellarPnlData.usdcReceived / (stellarPnlData.usdcReceived + stellarPnlData.usdcSpent || 1)) * 100}%` }}
                                          className="bg-emerald-500 h-full"
                                          title={`Received: ${portfolioUtils.formatUSD(stellarPnlData.usdcReceived)}`}
                                        />
                                        <div
                                          style={{ width: `${(stellarPnlData.usdcSpent / (stellarPnlData.usdcReceived + stellarPnlData.usdcSpent || 1)) * 100}%` }}
                                          className="bg-rose-500 h-full"
                                          title={`Spent: ${portfolioUtils.formatUSD(stellarPnlData.usdcSpent)}`}
                                        />
                                      </>
                                    ) : (
                                      <div className="bg-slate-600 w-full h-full" />
                                    )}
                                  </div>
                                  <div className="flex justify-between text-[9.5px] text-(--color-text-secondary) font-bold uppercase">
                                    <span className="text-emerald-400">Inbound Flow ({((stellarPnlData?.usdcReceived / (stellarPnlData?.usdcReceived + stellarPnlData?.usdcSpent || 1)) * 100).toFixed(0)}%)</span>
                                    <span className="text-rose-400">Outbound Flow ({((stellarPnlData?.usdcSpent / (stellarPnlData?.usdcReceived + stellarPnlData?.usdcSpent || 1)) * 100).toFixed(0)}%)</span>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {!loadingStellarPnl && !stellarPnlError && stellarPnlData && (
                            <div className="flex border-b border-(--color-border)/50 pb-px mt-2 justify-start overflow-x-auto hide-scrollbar select-none gap-4">
                              {([
                                { id: 'overview', label: 'Overview' },
                                { id: 'highlights', label: 'Trading Highlights' },
                                { id: 'stats', label: 'Detailed Metrics' },
                              ] as const).map(({ id, label }) => {
                                const isActive = stellarSubTab === id;
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => setStellarSubTab(id)}
                                    className={`pb-2 px-1 text-xs font-bold transition-all relative shrink-0 ${isActive
                                        ? 'text-purple-400 font-extrabold'
                                        : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                                      }`}
                                  >
                                    {label}
                                    {isActive && (
                                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-purple-400" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {!loadingStellarPnl && !stellarPnlError && stellarPnlData && (
                            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 font-bold select-none text-[11px]">!</span>
                              <div>
                                <span className="font-bold">Cost Basis Warning:</span> Some asset prices were estimated or missing. Metrics might not be fully accurate.
                              </div>
                            </div>
                          )}

                          {!loadingStellarPnl && !stellarPnlError && stellarPnlData && (
                            <>
                              {/* Cost Basis tab removed — users fill cost basis directly in the exported Excel file */}
                              {stellarSubTab === 'overview' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                  {/* Left: Win Rate & outcomes circular gauge */}
                                  <div className="p-5 bg-gradient-to-br from-purple-950/5 to-pink-950/5 border border-purple-500/10 rounded-2xl flex flex-col sm:flex-row items-center gap-6">
                                    <div className="relative flex items-center justify-center">
                                      {/* Circle progress gauge */}
                                      <svg className="w-24 h-24 transform -rotate-90 select-none shrink-0" viewBox="0 0 36 36">
                                        <path
                                          className="text-purple-500/10"
                                          strokeWidth="3"
                                          stroke="currentColor"
                                          fill="none"
                                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        />
                                        <path
                                          className="text-purple-400"
                                          strokeWidth="3.2"
                                          strokeDasharray={`${stellarPnlData.winRate ?? 0}, 100`}
                                          strokeLinecap="round"
                                          stroke="currentColor"
                                          fill="none"
                                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        />
                                      </svg>
                                      <div className="absolute flex flex-col items-center justify-center">
                                        <span className="text-lg font-black text-(--color-text-primary)">{stellarPnlData.winRate ?? 0}%</span>
                                        <span className="text-[9px] uppercase font-bold text-(--color-text-secondary) tracking-wider">Win Rate</span>
                                      </div>
                                    </div>
                                    <div className="flex-1 text-center sm:text-left space-y-2">
                                      <h5 className="text-xs font-black text-(--color-text-primary) uppercase tracking-wider text-purple-400">Trade Outcome Analysis</h5>
                                      <p className="text-[11.5px] text-(--color-text-secondary) leading-relaxed">
                                        Out of <span className="text-(--color-text-primary) font-bold">{stellarPnlData.tradeCount ?? 0}</span> trades initiated in this period,
                                        the account closed with a win rate of <span className="text-(--color-text-primary) font-bold">{stellarPnlData.winRate ?? 0}%</span>.
                                        Disposals accounted for <span className="text-(--color-text-primary) font-bold">{stellarPnlData.disposalCount ?? 0}</span> transactions.
                                      </p>
                                    </div>
                                  </div>

                                  {/* Right: Timeline & Activity highlights */}
                                  <div className="p-5 bg-gradient-to-br from-purple-950/5 to-pink-950/5 border border-purple-500/10 rounded-2xl flex flex-col justify-between">
                                    <div className="space-y-3">
                                      <h5 className="text-xs font-black text-(--color-text-primary) uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                                        <Calendar size={13} />
                                        Trading Period Timeline
                                      </h5>

                                      <div className="relative pl-6 border-l-2 border-purple-500/10 space-y-4 py-1">
                                        <div className="relative">
                                          <span className="absolute -left-[30px] top-0.5 w-2 h-2 rounded-full bg-purple-400 border-4 border-secondary box-content" />
                                          <span className="text-[9.5px] uppercase font-bold text-(--color-text-secondary) block tracking-wider">First Trade Initiated</span>
                                          <span className="text-xs font-bold text-(--color-text-primary) mt-0.5 block">
                                            {stellarPnlData.firstTradeDate ? new Date(stellarPnlData.firstTradeDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                                          </span>
                                        </div>
                                        <div className="relative">
                                          <span className="absolute -left-[30px] top-0.5 w-2 h-2 rounded-full bg-pink-400 border-4 border-secondary box-content" />
                                          <span className="text-[9.5px] uppercase font-bold text-(--color-text-secondary) block tracking-wider">Last Trade Recorded</span>
                                          <span className="text-xs font-bold text-(--color-text-primary) mt-0.5 block">
                                            {stellarPnlData.lastTradeDate ? new Date(stellarPnlData.lastTradeDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-3 border-t border-(--color-border)/30 text-[11px] text-(--color-text-secondary)">
                                      <span>Active Trading Days: <span className="font-bold text-(--color-text-primary)">{stellarPnlData.activeDays ?? 0}</span></span>
                                      <span>Most Traded: <span className="font-bold text-(--color-text-primary)">{stellarPnlData.mostTradedAsset ?? '—'}</span></span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Trading Highlights Sub-view */}
                              {stellarSubTab === 'highlights' && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-2">
                                  {/* Best Trade Card */}
                                  <div className="p-5 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/10 hover:border-emerald-500/20 rounded-2xl transition duration-300 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:bg-emerald-500/10 transition" />
                                    <div className="flex items-center justify-between pb-3 border-b border-emerald-500/10">
                                      <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Best Trade</span>
                                      <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                                        <TrendingUp size={14} />
                                      </span>
                                    </div>
                                    <div className="pt-4 space-y-2">
                                      {stellarPnlData.bestTrade ? (
                                        <>
                                          <div className="text-2xl font-black text-emerald-400">
                                            +{portfolioUtils.formatUSD(stellarPnlData.bestTrade.pnl ?? 0)}
                                          </div>
                                          <div className="space-y-0.5 text-xs">
                                            <div className="text-(--color-text-secondary)">
                                              Asset Symbol: <span className="font-bold text-(--color-text-primary)">{stellarPnlData.bestTrade.asset ?? '—'}</span>
                                            </div>
                                            <div className="text-(--color-text-secondary)">
                                              Execution Date: <span className="font-bold text-(--color-text-primary)">{stellarPnlData.bestTrade.date ? new Date(stellarPnlData.bestTrade.date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</span>
                                            </div>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-xs text-(--color-text-secondary) italic pt-2">No trading data available</div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Worst Trade Card */}
                                  <div className="p-5 bg-gradient-to-br from-rose-500/5 to-red-500/5 border border-rose-500/10 hover:border-rose-500/20 rounded-2xl transition duration-300 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:bg-rose-500/10 transition" />
                                    <div className="flex items-center justify-between pb-3 border-b border-rose-500/10">
                                      <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Worst Trade</span>
                                      <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                                        <TrendingDown size={14} />
                                      </span>
                                    </div>
                                    <div className="pt-4 space-y-2">
                                      {stellarPnlData.worstTrade ? (
                                        <>
                                          <div className="text-2xl font-black text-rose-400">
                                            {portfolioUtils.formatUSD(stellarPnlData.worstTrade.pnl ?? 0)}
                                          </div>
                                          <div className="space-y-0.5 text-xs">
                                            <div className="text-(--color-text-secondary)">
                                              Asset Symbol: <span className="font-bold text-(--color-text-primary)">{stellarPnlData.worstTrade.asset ?? '—'}</span>
                                            </div>
                                            <div className="text-(--color-text-secondary)">
                                              Execution Date: <span className="font-bold text-(--color-text-primary)">{stellarPnlData.worstTrade.date ? new Date(stellarPnlData.worstTrade.date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</span>
                                            </div>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-xs text-(--color-text-secondary) italic pt-2">No trading data available</div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Largest Position Card */}
                                  <div className="p-5 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 border border-purple-500/10 hover:border-purple-500/20 rounded-2xl transition duration-300 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:bg-purple-500/10 transition" />
                                    <div className="flex items-center justify-between pb-3 border-b border-purple-500/10">
                                      <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">Largest Position</span>
                                      <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                                        <Sparkles size={14} />
                                      </span>
                                    </div>
                                    <div className="pt-4 space-y-2">
                                      {stellarPnlData.largestPosition ? (
                                        <>
                                          <div className="text-2xl font-black text-(--color-text-primary)">
                                            {portfolioUtils.formatUSD(stellarPnlData.largestPosition.currentValue ?? 0)}
                                          </div>
                                          <div className="space-y-1.5 text-xs">
                                            <div className="text-(--color-text-secondary)">
                                              Holding: <span className="font-bold text-(--color-text-primary)">{(stellarPnlData.largestPosition.remaining ?? 0).toFixed(4)} {stellarPnlData.largestPosition.asset ?? '—'}</span>
                                            </div>

                                            {/* Progress bar showing share of portfolio */}
                                            {stellarPnlData.totalPortfolioValue ? (
                                              <div className="space-y-1 pt-1.5">
                                                <div className="flex justify-between text-[10px] font-bold text-(--color-text-secondary)">
                                                  <span>PORTFOLIO SHARE</span>
                                                  <span>{((stellarPnlData.largestPosition.currentValue / (stellarPnlData.totalPortfolioValue || 1)) * 100).toFixed(1)}%</span>
                                                </div>
                                                <div className="w-full bg-(--color-bg-tertiary) h-1 rounded-full overflow-hidden">
                                                  <div
                                                    className="bg-purple-400 h-full rounded-full"
                                                    style={{ width: `${Math.min(100, (stellarPnlData.largestPosition.currentValue / (stellarPnlData.totalPortfolioValue || 1)) * 100)}%` }}
                                                  />
                                                </div>
                                              </div>
                                            ) : null}
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-xs text-(--color-text-secondary) italic pt-2">No positions open</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Detailed Metrics Sub-view */}
                              {stellarSubTab === 'stats' && (
                                <div className="space-y-4 mt-2">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
                                    <div className="p-3.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[75px]">
                                      <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">Total Trades</span>
                                      <span className="font-black text-sm text-(--color-text-primary) mt-1.5 block">
                                        {stellarPnlData.tradeCount ?? 0}
                                      </span>
                                    </div>
                                    <div className="p-3.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[75px]">
                                      <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">Open Positions</span>
                                      <span className="font-black text-sm text-(--color-text-primary) mt-1.5 block">
                                        {stellarPnlData.positionCount ?? 0}
                                      </span>
                                    </div>
                                    <div className="p-3.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[75px]">
                                      <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">Disposals</span>
                                      <span className="font-black text-sm text-(--color-text-primary) mt-1.5 block">
                                        {stellarPnlData.disposalCount ?? 0}
                                      </span>
                                    </div>
                                    <div className="p-3.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[75px]">
                                      <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">Realized PnL</span>
                                      <span className={`font-black text-sm mt-1.5 block ${(stellarPnlData.totalRealized ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {portfolioUtils.formatUSD(stellarPnlData.totalRealized ?? 0)}
                                      </span>
                                    </div>
                                    <div className="p-3.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[75px]">
                                      <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">Unrealized PnL</span>
                                      <span className={`font-black text-sm mt-1.5 block ${(stellarPnlData.totalUnrealized ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {portfolioUtils.formatUSD(stellarPnlData.totalUnrealized ?? 0)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-(--color-bg-tertiary)/25 p-4 rounded-2xl border border-(--color-border)/40">
                                    <div className="space-y-1">
                                      <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">USDC Received</span>
                                      <span className="font-bold text-xs text-(--color-text-primary) block">
                                        {portfolioUtils.formatUSD(stellarPnlData.usdcReceived ?? 0)}
                                      </span>
                                      <span className="text-[9.5px] text-(--color-text-secondary) block leading-normal pt-0.5">
                                        Funds received in wallet
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">USDC Spent</span>
                                      <span className="font-bold text-xs text-(--color-text-primary) block">
                                        {portfolioUtils.formatUSD(stellarPnlData.usdcSpent ?? 0)}
                                      </span>
                                      <span className="text-[9.5px] text-(--color-text-secondary) block leading-normal pt-0.5">
                                        Funds spent from wallet
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">Net USDC Flow</span>
                                      <span className={`font-bold text-xs block ${(stellarPnlData.netUSDCFlow ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {portfolioUtils.formatUSD(stellarPnlData.netUSDCFlow ?? 0)}
                                      </span>
                                      <span className="text-[9.5px] text-(--color-text-secondary) block leading-normal pt-0.5">
                                        Received minus spent
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider font-bold">Net Period PnL</span>
                                      <span className={`font-black text-xs block ${(stellarPnlData.totalPnL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {(stellarPnlData.totalPnL ?? 0) >= 0 ? '+' : ''}{portfolioUtils.formatUSD(stellarPnlData.totalPnL ?? 0)}
                                      </span>
                                      <span className="text-[9.5px] text-(--color-text-secondary) block leading-normal pt-0.5">
                                        Trading profit or loss
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}

                </div>
              )}

            <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl overflow-hidden shadow-md">
              <div className="p-4 border-b border-(--color-border) space-y-4 md:space-y-0 md:flex md:items-center md:justify-between gap-2">
                <div className="relative flex-1 max-w-lg">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-secondary)" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by token symbol or name..."
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-primary) placeholder:text-(--color-text-secondary) focus:border-brand-primary focus:outline-none transition-all"
                  />
                </div>
                {availableChains.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto py-1 hide-scrollbar">
                    <button
                      onClick={() => setSelectedChainFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${selectedChainFilter === 'all'
                        ? 'bg-tertiary text border-blue-400'
                        : 'bg-secondary text-(--color-text-secondary) hover:bg-(--color-bg-secondary) border border-(--color-border)'
                        }`}
                    >
                      All Chains
                    </button>
                    {availableChains.map(chain => (
                      <button
                        key={chain.id}
                        onClick={() => setSelectedChainFilter(chain.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${selectedChainFilter === chain.id
                          ? 'bg-tertiary text border-blue-400'
                          : 'bg-secondary text-(--color-text-secondary) hover:bg-(--color-bg-secondary) border border-(--color-border)'
                          }`}
                      >
                        {getChainLogoUrl(chain.id) && (
                          <img src={getChainLogoUrl(chain.id)} alt={chain.name} className="w-3.5 h-3.5 rounded-full shrink-0" />
                        )}
                        {chain.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="hidden md:grid grid-cols-4 px-6 py-3.5 bg-(--color-bg-tertiary) border-b border-(--color-border) text-[10px] font-bold text-(--color-text-secondary) uppercase tracking-wider">
                  <div>Asset</div>
                  <div className="text-right">Price (24h)</div>
                  <div className="text-right">Balance</div>
                  <div className="text-right">USD Value</div>
                </div>

                <div className="divide-y divide-(--color-border)/50 max-h-[480px] overflow-y-auto scrollbar-thin">
                  {loading || isRefreshing ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="p-5 flex items-center justify-between gap-4 animate-pulse">
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
                    ))
                  ) : filteredAssets.length === 0 ? (
                    <div className="p-12 text-center text-(--color-text-secondary) space-y-2">
                      <Search size={28} className="mx-auto text-(--color-text-secondary) opacity-50" />
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
                          <div className="hidden md:grid grid-cols-4 px-6 py-4 items-center gap-4 text-sm">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative shrink-0">
                                <img
                                  src={asset.image}
                                  className="w-10 h-10 rounded-full bg-(--color-bg-tertiary) border border-(--color-border) object-cover"
                                  alt={asset.symbol}
                                  onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`; }}
                                />
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-secondary border border-(--color-border) flex items-center justify-center shadow-sm">
                                  {getChainIcon(asset) ? (
                                    <img src={getChainIcon(asset)} alt={asset.chainName} className="w-3.5 h-3.5 rounded-full" />
                                  ) : (
                                    <span className="text-[8px] font-black text-(--color-text-secondary)">{asset.chainType?.[0]?.toUpperCase()}</span>
                                  )}
                                </div>
                              </div>
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-(--color-text-primary) truncate">{asset.symbol}</span>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary) font-medium">
                                    {asset.chainName}
                                  </span>
                                </div>
                                <div className="text-[11px] text-(--color-text-secondary) truncate">
                                  {asset.name || asset.symbol}
                                </div>
                              </div>
                            </div>

                            <div className="text-right flex flex-col items-end shrink-0">
                              <span className="font-semibold text-(--color-text-primary)">
                                ${asset.current_price?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </span>
                              {asset.price_change_percentage_24h !== 0 && (
                                <span className={`flex items-center text-[10px] font-bold ${isPriceDown ? 'text-red-400' : 'text-emerald-400'} mt-0.5`}>
                                  {isPriceDown ? <TrendingDown size={9} className="mr-0.5" /> : <TrendingUp size={9} className="mr-0.5" />}
                                  {isPriceDown ? '' : '+'}{asset.price_change_percentage_24h?.toFixed(2)}%
                                </span>
                              )}
                            </div>

                            <div className="text-right">
                              <span className="font-bold text-(--color-text-primary)">
                                {portfolioUtils.formatBalance(asset.balance)}
                              </span>
                              <span className="text-(--color-text-secondary) text-xs ml-1 font-semibold">{asset.symbol}</span>
                            </div>

                            <div className="text-right">
                              <span className="font-extrabold text-(--color-text-primary)">
                                {portfolioUtils.formatUSD(usdValue)}
                              </span>
                            </div>
                          </div>

                          <div className="md:hidden p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative shrink-0">
                                <img
                                  src={asset.image}
                                  className="w-10 h-10 rounded-full bg-(--color-bg-tertiary) border border-(--color-border) object-cover"
                                  alt={asset.symbol}
                                  onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`; }}
                                />
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-secondary border border-(--color-border) flex items-center justify-center shadow-sm">
                                  {getChainIcon(asset) ? (
                                    <img src={getChainIcon(asset)} alt={asset.chainName} className="w-3.5 h-3.5 rounded-full" />
                                  ) : (
                                    <span className="text-[8px] font-black text-(--color-text-secondary)">{asset.chainType?.[0]?.toUpperCase()}</span>
                                  )}
                                </div>
                              </div>

                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-(--color-text-primary) truncate">{asset.symbol}</span>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary) font-medium">
                                    {asset.chainName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-(--color-text-secondary)">
                                  <span>${asset.current_price?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                  {asset.price_change_percentage_24h !== 0 && (
                                    <span className={`flex items-center text-[10px] font-semibold ${isPriceDown ? 'text-red-400' : 'text-emerald-400'}`}>
                                      {isPriceDown ? <TrendingDown size={10} className="mr-0.5" /> : <TrendingUp size={10} className="mr-0.5" />}
                                      {isPriceDown ? '' : '+'}{asset.price_change_percentage_24h?.toFixed(2)}%
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
          </div>
        )}

        <StellarCostBasisModal
          isOpen={isCostBasisModalOpen}
          onClose={() => setIsCostBasisModalOpen(false)}
          stellarCostBasis={stellarCostBasis}
          stellarPnlData={stellarDetailedData}
          handleCostBasisChange={handleCostBasisChange}
          handleClearAllCostBasis={handleClearAllCostBasis}
          handleExportReport={handleExportStellarReport}
          isExporting={isExportingStellar}
        />
      </div>
    </div>
  );
};

export default Profile;