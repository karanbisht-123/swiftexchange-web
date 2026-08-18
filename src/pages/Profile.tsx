import { Activity, Globe, RefreshCw, User, Wallet } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { StellarCostBasisModal } from '../components/StellarCostBasisModal';
import PageLayout from '../components/layout/PageLayout';
import LiquidationRiskBanner from '../modules/dydx/components/LiquidationRiskBanner';
import PositionsPanel from '../modules/dydx/components/orderHistory/PositionsPanel';
import { useDydxAutoConnect } from '../modules/dydx/hooks/useDydxAutoConnect';
import { useDydxData } from '../modules/dydx/hooks/useDydxData';
import {
  type Fill,
  type FundingPayment,
  type HistoricalPnl,
  type Order,
  dydxDataService,
  normalizeFill,
  normalizeOrder,
} from '../modules/dydx/service/dydxOrderService';
import { dydxWalletService } from '../modules/dydx/service/dydxWalletService';
import { useDateRangeStore } from '../modules/dydx/store/dateRangeStore';
import { selectPortfolioMetrics, useWebSocketStore } from '../modules/dydx/store/websocketStore';
import { useProfilePortfolio } from '../modules/walletconnect/hooks/useProfilePortfolio';
import {
  useWalletConnect,
  useWalletNetwork,
} from '../modules/walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../modules/walletconnect/store/walletConnectStore';
import { portfolioUtils } from '../modules/walletconnect/utils/portfolioUtils';
import { fetchStellarPnl } from '../service/apiService';
import { exportDydxReport, exportStellarReport } from '../utils/exportService';
import { AssetsTableSection } from './profile/components/AssetsTableSection';
import { DydxPerformanceCard } from './profile/components/DydxPerformanceCard';
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

  const {
    positions: dydxPositions,
    openOrderCount,
    orders: dydxOrders,
    fills: dydxFills,
    refreshPositions,
    refreshOrders,
    refreshFills,
  } = useDydxData();

  const { fromDate, toDate, setFromDate, setToDate, clearRange } = useDateRangeStore();
  const isDateRangeActive = !!(fromDate || toDate);

  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [historicalPnl, setHistoricalPnl] = useState<HistoricalPnl[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loadingPnl, setLoadingPnl] = useState(false);
  const [timeframe, setTimeframe] = useState<'1d' | '7d' | '30d' | '90d'>('7d');

  // Funding payments states
  const [fundingPayments, setFundingPayments] = useState<FundingPayment[]>([]);
  const [loadingFunding, setLoadingFunding] = useState(false);

  // Export progress modal states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStep, setExportStep] = useState(0); // 0 = config, 1+ = steps
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'dydx' | 'stellar'>('dydx');
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

  const [dateRangeOrders, setDateRangeOrders] = useState<any[]>([]);
  const [dateRangeFillCount, setDateRangeFillCount] = useState(0);
  const [dateRangeFills, setDateRangeFills] = useState<Fill[]>([]);
  const [loadingDateRange, setLoadingDateRange] = useState(false);

  useEffect(() => {
    if (!dydxDataService.isReady()) {
      setHistoricalPnl([]);
      return;
    }
    setLoadingPnl(true);
    if (isDateRangeActive && fromDate && toDate) {
      dydxDataService
        .getPnlByDateRange(fromDate, toDate)
        .then(data => setHistoricalPnl(data || []))
        .catch(err => console.warn('[Profile] Failed to fetch date-range PnL:', err))
        .finally(() => setLoadingPnl(false));
    } else {
      const days = timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
      const effectiveAtOrAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      dydxDataService
        .getHistoricalPnl(undefined, effectiveAtOrAfter, 100, true, timeframe !== '1d')
        .then(data => setHistoricalPnl(data || []))
        .catch(err => console.warn('[Profile] Failed to fetch historical PnL:', err))
        .finally(() => setLoadingPnl(false));
    }
  }, [connectedWallets, timeframe, dydxConnecting, isDateRangeActive, fromDate, toDate]);

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

  useEffect(() => {
    if (!dydxDataService.isReady()) {
      setTransfers([]);
      return;
    }
    if (isDateRangeActive && fromDate && toDate) {
      dydxDataService
        .getTransfersByDateRange(fromDate, toDate)
        .then(data => setTransfers(data))
        .catch(err => console.warn('[Profile] Failed to fetch date-range transfers:', err));
    } else {
      dydxDataService
        .getTransfers(100)
        .then(res => setTransfers(res?.transfers || []))
        .catch(err => console.warn('[Profile] Failed to fetch transfers:', err));
    }
  }, [connectedWallets, dydxConnecting, isDateRangeActive, fromDate, toDate]);

  useEffect(() => {
    if (!dydxDataService.isReady()) {
      setFundingPayments([]);
      return;
    }
    setLoadingFunding(true);
    const fetchFunding = async () => {
      try {
        let data: FundingPayment[] = [];
        if (isDateRangeActive && fromDate && toDate) {
          data = await dydxDataService.getFundingPaymentsByDateRange(fromDate, toDate);
        } else {
          const days =
            timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
          const fromISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
          const toISO = new Date().toISOString().slice(0, 10);
          data = await dydxDataService.getFundingPaymentsByDateRange(fromISO, toISO);
        }
        setFundingPayments(data || []);
      } catch (err) {
        console.warn('[Profile] Failed to fetch funding payments:', err);
        setFundingPayments([]);
      } finally {
        setLoadingFunding(false);
      }
    };
    fetchFunding();
  }, [connectedWallets, timeframe, dydxConnecting, isDateRangeActive, fromDate, toDate]);

  const fundingStats = useMemo(() => {
    let received = 0;
    let paid = 0;
    fundingPayments.forEach(p => {
      const val = parseFloat(p.payment || '0');
      if (val > 0) {
        received += val;
      } else {
        paid += Math.abs(val);
      }
    });
    return {
      received,
      paid,
      net: received - paid,
    };
  }, [fundingPayments]);

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

  const filteredFills = useMemo(() => {
    if (isDateRangeActive) {
      return dateRangeFills.map(normalizeFill);
    }
    const daysMap = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[timeframe] ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return (dydxFills || [])
      .map(normalizeFill)
      .filter(f => new Date(f.createdAt).getTime() >= cutoff);
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
      const orderTime = timeStr ? new Date(timeStr).getTime() : (o as any)._firstSeenAt || 0;
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

      const latestIndexerTime =
        indexerPoints.length > 0
          ? new Date(indexerPoints[indexerPoints.length - 1].createdAt).getTime()
          : 0;

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
        equity: currentVal.toString(),
      });

      // Walk backward subtraction-by-subtraction for recent events
      recentEvents.forEach(event => {
        currentVal = currentVal - event.impact;
        recentPoints.push({
          createdAt: event.createdAt,
          equity: currentVal.toString(),
        });
      });

      // Reverse recentPoints to be in chronological order
      recentPoints.reverse();

      // 3. Combine indexer history with the reconstructed recent points
      const mappedIndexerPoints = indexerPoints.map(p => ({
        createdAt: p.createdAt,
        equity: p.equity,
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
          { createdAt: today, equity: dydxTotal.toString() },
        ];
      }

      return uniquePoints;
    } catch (err) {
      console.error('[Profile] Failed to construct combined equity timeline:', err);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const today = new Date().toISOString();
      return [
        { createdAt: yesterday, equity: dydxTotal.toString() },
        { createdAt: today, equity: dydxTotal.toString() },
      ];
    }
  }, [
    historicalPnl,
    filteredTransfers,
    filteredFills,
    dydxTotal,
    timeframe,
    isDateRangeActive,
    fromDate,
  ]);

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
    const totalStart = stellarTotal + dydxTotal + evmTotal - totalPnL;
    const totalPct = totalStart > 0 ? (totalPnL / totalStart) * 100 : 0;

    return {
      total: { change: totalPnL, percent: totalPct },
      evm: { change: 0, percent: 0 },
      stellar: { change: stellarPnL, percent: stellarPct },
      dydx: { change: dydxPnL, percent: dydxPct },
    };
  }, [
    stellarPnlData?.totalPnL,
    stellarTotal,
    dydxTotal,
    evmTotal,
    pnlStats.change,
    pnlStats.percentChange,
  ]);

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

    const startEquity =
      visiblePnlPoints.length > 0 ? parseFloat(visiblePnlPoints[0].equity || '0') : 0;
    const endEquity =
      visiblePnlPoints.length > 0
        ? parseFloat(visiblePnlPoints[visiblePnlPoints.length - 1].equity || '0') || dydxTotal
        : dydxTotal;
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
        if (f.positionSideBefore === 'LONG' && f.side === 'SELL')
          cpnl = (fp - entry) * Math.min(sizeBefore, fs);
        if (f.positionSideBefore === 'SHORT' && f.side === 'BUY')
          cpnl = (entry - fp) * Math.min(sizeBefore, fs);
        if (cpnl !== null) {
          closedTradesCount++;
          totalClosedPnl += cpnl;
          if (cpnl > 0) profitableTradesCount++;
        }
      }
    });

    const netTradingGain = totalClosedPnl;
    const gainPercentage =
      startEquity + totalDeposits > 0 ? (netTradingGain / (startEquity + totalDeposits)) * 100 : 0;

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
      winRate,
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
      if (f.positionSideBefore === 'LONG' && f.side === 'SELL')
        cpnl = (fp - entry) * Math.min(sizeBefore, fs);
      if (f.positionSideBefore === 'SHORT' && f.side === 'BUY')
        cpnl = (entry - fp) * Math.min(sizeBefore, fs);

      runningPnl += cpnl;
      points.push({
        time: Math.floor(new Date(f.createdAt).getTime() / 1000) as any,
        value: runningPnl,
      });
    });
    return points;
  }, [filteredFills]);

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
        const parsed = saved ? parseFloat(saved) : 5.0;
        if (!isNaN(parsed) && parsed > 0) map[ticker] = parsed;
      });
    });
    return map;
  }, [parentData, wsUpdateTrigger]);

  const marginMetrics = useMemo(
    () => selectPortfolioMetrics(parentData, optimisticDelta, marketsMap, leveragesMap),
    [parentData, optimisticDelta, marketsMap, leveragesMap]
  );

  const displayedFillCount = isDateRangeActive ? dateRangeFillCount : filteredFills.length || 0;
  const displayedOrderCount = isDateRangeActive
    ? dateRangeOrders.length
    : filteredOrders.length || 0;

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

      if (exportType === 'dydx') {
        let fills: Fill[] = [];
        let orders: Order[] = [];
        let exportTransfers: any[] = [];
        let exportPnlHistory: HistoricalPnl[] = [];
        let exportFunding: FundingPayment[] = [];

        const periodLabel =
          isCustom && selFromDate && selToDate
            ? `${selFromDate} to ${selToDate}`
            : `Last ${selTimeframe}`;

        try {
          const daysMap = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
          const days = daysMap[selTimeframe as '1d' | '7d' | '30d' | '90d'] ?? 7;
          const cutoff = isCustom ? 0 : Date.now() - days * 86400000;

          let fromStr = '';
          let toStr = '';

          if (isCustom && selFromDate && selToDate) {
            fromStr = selFromDate;
            toStr = selToDate;
          } else {
            fromStr = new Date(cutoff).toISOString().slice(0, 10);
            toStr = new Date().toISOString().slice(0, 10);
          }

          await delay(500);

          // Step 2: Collecting funding payment data
          setExportStep(2);
          exportFunding = await dydxDataService.getFundingPaymentsByDateRange(fromStr, toStr);

          await delay(500);

          // Step 3: Processing transactions
          setExportStep(3);
          if (isCustom && selFromDate && selToDate) {
            const fromTime = new Date(selFromDate).getTime();
            const toTime = new Date(selToDate).getTime() + 86400000;

            [fills, orders] = await Promise.all([
              dydxDataService.getFillsByDateRange(selFromDate, selToDate),
              dydxDataService.getOrdersByDateRange(selFromDate, selToDate),
            ]);

            exportTransfers = transfers.filter(tx => {
              const t = new Date(tx.createdAt).getTime();
              return t >= fromTime && t <= toTime;
            });

            const pnlHist = visiblePnlPoints.map(p => ({
              id: p.createdAt,
              equity: p.equity,
              totalPnl: '0',
              netTransfers: '0',
              createdAt: p.createdAt,
              blockHeight: '0',
              blockTime: p.createdAt,
            }));
            exportPnlHistory = pnlHist.filter(p => {
              const t = new Date(p.createdAt).getTime();
              return t >= fromTime && t <= toTime;
            });
          } else {
            [fills, orders] = await Promise.all([
              dydxDataService.getFillsByDateRange(fromStr, toStr),
              dydxDataService.getOrdersByDateRange(fromStr, toStr),
            ]);

            exportTransfers = transfers.filter(tx => new Date(tx.createdAt).getTime() >= cutoff);

            const pnlHist = visiblePnlPoints.map(p => ({
              id: p.createdAt,
              equity: p.equity,
              totalPnl: '0',
              netTransfers: '0',
              createdAt: p.createdAt,
              blockHeight: '0',
              blockTime: p.createdAt,
            }));
            exportPnlHistory = pnlHist.filter(p => new Date(p.createdAt).getTime() >= cutoff);
          }

          await delay(500);

          // Step 4: Generating Excel statement
          setExportStep(4);
          exportDydxReport({
            pnlHistory: exportPnlHistory,
            fills,
            orders,
            transfers: exportTransfers,
            fundingPayments: exportFunding,
            period: periodLabel,
          });

          await delay(500);

          // Step 5: Statement is ready
          setExportStep(5);
        } catch (e: any) {
          console.error('[Profile] Export failed:', e);
          setExportError(
            e?.message || 'Failed to export dYdX report. Please check connection and try again.'
          );
        }
      } else {
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
      }
    },
    [
      exportType,
      isSwiftExUser,
      connectedWallets.stellar?.address,
      transfers,
      visiblePnlPoints,
      stellarCostBasis,
    ]
  );

  const handleSyncBalances = async () => {
    refetch();
    if (dydxDataService.isReady()) {
      refreshPositions().catch(() => {});
      refreshOrders().catch(() => {});
      refreshFills().catch(() => {});
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

      {dydxDataService.isReady() && <LiquidationRiskBanner />}

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
                    {dydxTotal > 0 && (
                      <span className="flex items-center gap-1.5 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        dYdX: {((dydxTotal / grandTotal) * 100).toFixed(0)}%
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
                  {dydxTotal > 0 && (
                    <div
                      style={{ width: `${(dydxTotal / grandTotal) * 100}%` }}
                      className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
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
              dydxTotal={dydxTotal}
              connectedWallets={connectedWallets}
              copiedStates={copiedStates}
              handleCopy={handleCopy}
              cardPnL={cardPnL}
              openModal={openModal}
            />

            {/* ========== PERFORMANCE SECTIONS (dYdX & Stellar) ========== */}
            {(activeTab === 'dydx' ||
              activeTab === 'stellar' ||
              (activeTab === 'total' &&
                (dydxDataService.isReady() ||
                  (connectWithSwiftEx && connectedWallets.stellar?.address)))) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                {(activeTab === 'dydx' || (activeTab === 'total' && dydxDataService.isReady())) && (
                  <DydxPerformanceCard
                    dydxTotal={dydxTotal}
                    openOrderCount={openOrderCount}
                    timeframe={timeframe}
                    setTimeframe={setTimeframe}
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
                    visiblePnlPoints={visiblePnlPoints}
                    tradePnlPoints={tradePnlPoints}
                    loadingPnl={loadingPnl}
                    loadingDateRange={loadingDateRange}
                    displayedFillCount={displayedFillCount}
                    displayedOrderCount={displayedOrderCount}
                    periodStats={periodStats}
                    pnlStats={pnlStats}
                    marginMetrics={marginMetrics}
                    dydxLeverage={dydxLeverage}
                    onExportReport={() => {
                      setExportType('dydx');
                      setExportStep(0);
                      setExportError(null);
                      setIsExportModalOpen(true);
                    }}
                    loadingFunding={loadingFunding}
                    fundingStats={fundingStats}
                  />
                )}
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

            {/* ========== POSITIONS PANEL (dYdX) ========== */}
            {((activeTab === 'dydx' && dydxDataService.isReady()) ||
              (activeTab === 'total' && dydxDataService.isReady())) && (
              <div
                id="open-margin-positions"
                className="w-full bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-4 shadow-md space-y-3"
              >
                <h4 className="text-sm font-bold">Open Margin Positions</h4>
                <div className="border border-(--color-border) rounded-xl overflow-hidden min-h-[180px] py-3 bg-primary">
                  <PositionsPanel />
                </div>
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
        defaultTimeframe={exportType === 'dydx' ? timeframe : stellarTimeframe}
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
