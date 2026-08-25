import { Info } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { FixedSizeList as List } from 'react-window';

import { Tooltip } from '@/components/common/Tooltip';
import { StellarCostBasisModal } from '@/components/modals/StellarCostBasisModal';
import { ExportProgressModal } from '@/pages/profile/components/ExportProgressModal';
import { fetchStellarPnl } from '@/service/apiService';
import { exportStellarReport } from '@/utils/exportService';

import * as ChainUrlHelpers from '../../../evm/utils/ChainUrlHelpers';
import { useIsMobile } from '../../../perps/components/chart/hooks/useIsMobile';
import { getStellarConfig } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useProfilePortfolio } from '../../../walletconnect/hooks/useProfilePortfolio';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { CustomDatePicker } from '../CustomDatePicker';
import StellarPnlChart from './StellarPnlChart';
import UnifiedAssets from './UnifiedAssets';

const getStellarAssetIcon = (assetStr: string) => {
  if (!assetStr) return undefined;
  if (assetStr === 'XLM') return ChainUrlHelpers.getTokenIcon('XLM', getStellarConfig('mainnet'));
  const [code, issuer] = assetStr.split('-');
  return ChainUrlHelpers.getTokenIcon(code, getStellarConfig('mainnet'), issuer);
};

const StellarPortfolioUI: React.FC = () => {
  const { stellarTotal } = useProfilePortfolio();
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const connectedAddress = stellarWallet?.address || '';
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlAddress = searchParams.get('address') || '';
  const [manualAddress, setManualAddress] = useState(urlAddress);

  const stellarAddress = manualAddress || connectedAddress;
  const isViewingPublicAddress = !!manualAddress && manualAddress !== connectedAddress;

  const handleSetManualAddress = (addr: string) => {
    setManualAddress(addr);
    if (addr) {
      searchParams.set('address', addr);
    } else {
      searchParams.delete('address');
    }
    setSearchParams(searchParams, { replace: true });
  };

  const [stellarPnlData, setStellarPnlData] = useState<any>(null);
  const [loadingStellarPnl, setLoadingStellarPnl] = useState(false);
  const [stellarPnlError, setStellarPnlError] = useState<string | null>(null);

  const isMobile = useIsMobile();

  // States for Performance Card
  const [stellarTimeframe, setStellarTimeframe] = useState<'1w' | '1m' | '2m' | '3m' | 'custom'>(
    '1w'
  );

  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const isDateRangeActive = stellarTimeframe === 'custom' && !!(fromDate && toDate);

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

      const daysMap: Record<string, number> = { '1w': 7, '1m': 30, '2m': 60, '3m': 90 };
      const days = daysMap[stellarTimeframe] ?? 30; // fallback to 30 if custom but dates not set yet
      fromDateObj.setDate(fromDateObj.getDate() - days);

      fromStr = formatDateToDDMMYY(fromDateObj);
      toStr = formatDateToDDMMYY(toDateObj);
    }

    return { fromStr, toStr };
  }, [isDateRangeActive, fromDate, toDate, stellarTimeframe]);

  useEffect(() => {
    if (!stellarAddress) return;

    let isMounted = true;
    setLoadingStellarPnl(true);
    setStellarPnlError(null);

    const { fromStr, toStr } = getStellarDateRange();

    fetchStellarPnl(stellarAddress, fromStr, toStr, true)
      .then(data => {
        if (!isMounted) return;
        setStellarPnlData(data || null);
      })
      .catch(err => {
        if (!isMounted) return;
        setStellarPnlError(
          err instanceof Error ? (err as any).error || err.message : 'Failed to fetch Stellar PNL'
        );
        setStellarPnlData(null);
      })
      .finally(() => {
        if (isMounted) setLoadingStellarPnl(false);
      });

    return () => {
      isMounted = false;
    };
  }, [stellarAddress, getStellarDateRange]);

  const handleAssetClick = (asset: any) => {
    navigate(`/send?asset=${asset.ticker}&chainId=stellar`);
  };

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStep, setExportStep] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportTimeframe, setExportTimeframe] = useState<string>('1m');
  const [exportFromDate, setExportFromDate] = useState<string | null>(null);
  const [exportToDate, setExportToDate] = useState<string | null>(null);
  const [exportIsCustom, setExportIsCustom] = useState(false);

  const [isCostBasisModalOpen, setIsCostBasisModalOpen] = useState(false);
  const [loadingCostBasisDetails, setLoadingCostBasisDetails] = useState(false);
  const [stellarDetailedData, setStellarDetailedData] = useState<any>(null);
  const [stellarCostBasis, setStellarCostBasis] = useState<
    Record<string, { openingAmount: string; costPerUnit: string }>
  >({});

  useEffect(() => {
    if (stellarAddress) {
      const stored = localStorage.getItem(`swiftex_stellar_cost_basis_${stellarAddress}`);
      if (stored) {
        try {
          setStellarCostBasis(JSON.parse(stored));
        } catch (e) {
          console.warn('Failed to parse local cost basis:', e);
          setStellarCostBasis({});
        }
      } else {
        setStellarCostBasis({});
      }
    } else {
      setStellarCostBasis({});
    }
  }, [stellarAddress]);

  const handleCostBasisChange = (
    asset: string,
    field: 'openingAmount' | 'costPerUnit',
    value: string
  ) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    if (!stellarAddress) return;

    setStellarCostBasis(prev => {
      const current = prev[asset] || { openingAmount: '', costPerUnit: '' };
      const updated = { ...prev, [asset]: { ...current, [field]: value } };
      localStorage.setItem(`swiftex_stellar_cost_basis_${stellarAddress}`, JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearAllCostBasis = () => {
    if (!stellarAddress) return;
    if (window.confirm('Are you sure you want to clear all custom cost basis entries?')) {
      setStellarCostBasis({});
      localStorage.removeItem(`swiftex_stellar_cost_basis_${stellarAddress}`);
    }
  };

  const handleOpenCostBasis = async () => {
    if (!stellarAddress || loadingCostBasisDetails) return;

    if (stellarDetailedData?.positions && stellarDetailedData.positions.length > 0) {
      setIsCostBasisModalOpen(true);
      return;
    }

    setLoadingCostBasisDetails(true);
    try {
      const { fromStr, toStr } = getStellarDateRange();
      const fullData: any = await fetchStellarPnl(stellarAddress, fromStr, toStr, true);
      if (fullData) {
        setStellarDetailedData(fullData);
        setIsCostBasisModalOpen(true);
      } else {
        throw new Error('No position data returned from server');
      }
    } catch (err) {
      console.error('Failed to fetch positions:', err);
      alert(
        err instanceof Error
          ? err.message
          : 'Failed to fetch position data for cost basis adjustment'
      );
    } finally {
      setLoadingCostBasisDetails(false);
    }
  };

  const handleExportReport = () => {
    setExportTimeframe(stellarTimeframe);
    setExportFromDate(fromDate);
    setExportToDate(toDate);
    setExportStep(0);
    setExportError(null);
    setIsExportModalOpen(true);
  };

  const handleStartExport = useCallback(
    async (
      selTimeframe: any,
      selFromDate: string | null,
      selToDate: string | null,
      isCustom: boolean,
      preloadedData?: any
    ) => {
      setExportTimeframe(selTimeframe);
      setExportFromDate(selFromDate);
      setExportToDate(selToDate);
      setExportIsCustom(isCustom);

      setExportStep(1);
      setExportError(null);
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      try {
        if (!stellarAddress) {
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

        const formatDateToDDMMYY = (dateObj: Date) => {
          const y = dateObj.getFullYear().toString().slice(-2);
          const m = String(dateObj.getMonth() + 1).padStart(2, '0');
          const d = String(dateObj.getDate()).padStart(2, '0');
          return `${d}/${m}/${y}`;
        };

        if (isCustom && selFromDate && selToDate) {
          const parseCalendarDate = (dateStr: string) => {
            const parts = dateStr.split('-');
            const year = parts[0].slice(-2);
            const month = parts[1];
            const day = parts[2];
            return `${day}/${month}/${year}`;
          };
          fromStr = parseCalendarDate(selFromDate);
          toStr = parseCalendarDate(selToDate);
        } else {
          const daysMap = { '1w': 7, '1m': 30, '2m': 60, '3m': 90 };
          const days = daysMap[selTimeframe as '1w' | '1m' | '2m' | '3m'] ?? 30;
          const cutoff = new Date(Date.now() - days * 86400000);
          fromStr = formatDateToDDMMYY(cutoff);
          toStr = formatDateToDDMMYY(new Date());
        }

        await delay(500);

        setExportStep(2);
        let fullData = preloadedData;
        if (!fullData) {
          fullData = (await fetchStellarPnl(stellarAddress, fromStr, toStr, true)) as any;
        }
        if (!fullData) {
          throw new Error('No report data returned from server');
        }
        if (!preloadedData) {
          setStellarDetailedData(fullData);
        }

        await delay(500);

        setExportStep(3);
        exportStellarReport({
          address: stellarAddress,
          period: periodLabel,
          ...fullData,
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

            return { ...pos, openingAmount, openingCostPerUnit };
          }),
        });

        await delay(500);
        setExportStep(4);
      } catch (err: any) {
        console.error('[Stellar Export] Failed to export report:', err);
        setExportError(err?.message || 'Failed to export report');
      }
    },
    [stellarAddress, stellarCostBasis]
  );

  const reversedTrades = useMemo(() => {
    return stellarPnlData?.trades ? [...stellarPnlData.trades].reverse() : [];
  }, [stellarPnlData?.trades]);

  if (!stellarAddress) {
    return (
      <div className="w-full max-w-[100vw] flex items-center justify-center min-h-[600px] py-12 px-4">
        <div className="w-full max-w-[600px] min-h-[400px] flex flex-col items-center justify-center bg-[var(--color-bg-secondary)] rounded-[2rem] p-8 sm:p-12 text-center relative overflow-hidden shadow-lg border border-white/5">
          <div className="absolute top-0 left-0 right-0 h-48 w-full overflow-hidden z-0">
            <img
              src="/5ed91b71e3c44c41b4e5274b67ba6ba6.png"
              alt="Stellar Portfolio"
              className="w-full h-full object-cover object-center opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--color-bg-secondary)]/80 to-[var(--color-bg-secondary)] z-10" />
          </div>

          <div className="relative z-20 mt-20 flex flex-col items-center w-full">
            <h2 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight mb-3">
              Stellar Portfolio Tracker
            </h2>
            <p className="text-[var(--color-text-secondary)] text-[13px] sm:text-sm leading-relaxed mb-10 max-w-sm">
              It seems you're not connected with us, but no worries! You can still explore your
              portfolio by entering a Stellar address below.
            </p>
            <form
              onSubmit={e => {
                e.preventDefault();
                const val = new FormData(e.currentTarget).get('address') as string;
                if (val) handleSetManualAddress(val.trim());
              }}
              className="w-full max-w-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4"
            >
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-[var(--color-text-secondary)]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <input
                  name="address"
                  type="text"
                  placeholder="Enter Stellar address (G...)"
                  className="w-full h-full bg-[var(--color-bg-primary)] border border-white/5 rounded-2xl py-4 pl-12 pr-5 text-base text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-white/10 transition-all"
                />
              </div>
              <button
                type="submit"
                className="px-8 py-4 bg-brand text-white rounded-2xl text-base font-bold hover:bg-brand-primary/90 transition-all shadow-sm w-full sm:w-auto flex-shrink-0"
              >
                Track Portfolio
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const headerControls = (
    <div className="flex flex-wrap items-center justify-between gap-4 w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-4 sm:p-5 rounded-3xl shadow-sm">
      {/* Identity (Left) */}
      <div className="flex-shrink-0 mr-auto pr-2 flex flex-col justify-center">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
            Portfolio Dashboard
          </h2>
          {stellarPnlData && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 shadow-sm ml-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Fresh: {stellarPnlData?.freshnessTime || '15 mins'}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Stellar network performance & metrics
          </p>
          {stellarPnlData && (
            <div className="flex sm:hidden items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 ml-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Fresh: {stellarPnlData?.freshnessTime || '15 mins'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Controls (Right side container) */}
      <div className="flex flex-wrap items-center gap-3 xl:gap-4">
        {/* Search */}
        <form
          onSubmit={e => {
            e.preventDefault();
            const val = new FormData(e.currentTarget).get('address') as string;
            if (val !== null) handleSetManualAddress(val.trim());
          }}
          className="relative flex items-center w-full sm:w-[220px]"
        >
          <div className="absolute left-3 text-[var(--color-text-secondary)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <input
            key={manualAddress}
            name="address"
            type="text"
            disabled={loadingStellarPnl}
            defaultValue={manualAddress || ''}
            placeholder="Search address (G...)"
            className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl py-2 pl-9 pr-8 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/20 transition-all disabled:opacity-50 h-[34px]"
          />
          {manualAddress && (
            <button
              type="button"
              disabled={loadingStellarPnl}
              onClick={() => handleSetManualAddress('')}
              className="absolute right-2.5 text-[var(--color-text-secondary)] hover:text-rose-500 transition-colors bg-[var(--color-bg-tertiary)] p-0.5 rounded-md disabled:opacity-50"
              title="Clear and return to connected wallet"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </form>

        <div className="hidden xl:block w-[1px] h-8 bg-[var(--color-border)] mx-1"></div>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-[var(--color-bg-tertiary)] p-0.5 rounded-xl border border-[var(--color-border)] h-[34px] shrink-0">
            {(
              [
                { id: '1w', label: '1W' },
                { id: '1m', label: '1M' },
                { id: '2m', label: '2M' },
                { id: '3m', label: '3M' },
              ] as const
            ).map(tf => (
              <button
                key={tf.id}
                onClick={() => {
                  setStellarTimeframe(tf.id as any);
                  setFromDate('');
                  setToDate('');
                }}
                disabled={loadingStellarPnl}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                  stellarTimeframe === tf.id
                    ? 'bg-brand text-white  shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="w-[105px] sm:w-[125px]">
              <CustomDatePicker
                label="From"
                value={fromDate}
                onChange={val => {
                  setFromDate(val);
                  setStellarTimeframe('custom');
                }}
                onClear={() => {
                  setFromDate('');
                  if (!toDate) setStellarTimeframe('1w');
                }}
                disabled={loadingStellarPnl}
                max={toDate || undefined}
              />
            </div>
            <div className="w-[105px] sm:w-[125px]">
              <CustomDatePicker
                label="To"
                value={toDate}
                onChange={val => {
                  setToDate(val);
                  setStellarTimeframe('custom');
                }}
                onClear={() => {
                  setToDate('');
                  if (!fromDate) setStellarTimeframe('1w');
                }}
                disabled={loadingStellarPnl}
                min={fromDate || undefined}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
        </div>

        <div className="hidden xl:block w-[1px] h-8 bg-[var(--color-border)] mx-1"></div>

        {/* Action Buttons */}
        {stellarPnlData && !stellarPnlError && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenCostBasis}
              disabled={loadingCostBasisDetails || loadingStellarPnl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all font-bold text-xs border border-emerald-500/20 disabled:opacity-50 h-[34px]"
            >
              {loadingCostBasisDetails ? (
                <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 8v4l3 3"></path>
                </svg>
              )}
              Cost Basis
            </button>
            <button
              onClick={handleExportReport}
              disabled={loadingCostBasisDetails || loadingStellarPnl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all font-bold text-xs border border-purple-500/20 disabled:opacity-50 h-[34px]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Export
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const chartSection = (
    <>
      <div className="flex flex-col gap-4 sm:gap-6">
        <StellarPnlChart
          disposals={[...(stellarPnlData?.disposals || [])].reverse()}
          totalUnrealized={stellarPnlData?.totalUnrealized ?? 0}
        />
      </div>
    </>
  );

  const tablesSection = (
    <>
      {!loadingStellarPnl && !stellarPnlError && (
        <div className="flex flex-col gap-4 sm:gap-6">
          {/* Recent Trades Table */}
          {reversedTrades.length > 0 && (
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden flex flex-col h-[400px]">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight mb-4 shrink-0">
                Recent Trades
              </h3>
              <div className="flex text-left border-b border-[var(--color-border)] pb-3 px-4 sm:px-0 sm:pr-4 shrink-0 min-w-[500px]">
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Date
                </div>
                <div className="w-[15%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Action
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Amount
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Value
                </div>
                <div className="w-[25%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider text-right">
                  PnL
                </div>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden mt-1 -mx-4 sm:mx-0">
                <div className="min-w-[500px] h-full">
                  <AutoSizer
                    renderProp={({ height, width }) => (
                      <List
                        height={height || 0}
                        width={width || 0}
                        itemCount={reversedTrades.length}
                        itemSize={48}
                        itemData={reversedTrades}
                      >
                        {({ index, style, data }: any) => {
                          const trade = data[index];
                          const isProfit = (trade.pnlNum || 0) > 0;
                          const isLoss = (trade.pnlNum || 0) < 0;
                          const pnlColor = isProfit
                            ? 'text-emerald-500'
                            : isLoss
                              ? 'text-rose-500'
                              : 'text-[var(--color-text-primary)]';
                          return (
                            <div
                              style={style}
                              className="flex items-center group hover:bg-[var(--color-bg-tertiary)]/50 transition-colors border-b border-[var(--color-border)] px-4 sm:px-0"
                            >
                              <div className="w-[20%] text-[11px] sm:text-xs text-[var(--color-text-secondary)] whitespace-nowrap truncate pr-2">
                                {trade.date}
                              </div>
                              <div className="w-[15%] truncate pr-2">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                    trade.type === 'BUY'
                                      ? 'bg-emerald-500/10 text-emerald-500'
                                      : 'bg-rose-500/10 text-rose-500'
                                  }`}
                                >
                                  {trade.action}
                                </span>
                              </div>
                              <div className="w-[20%] text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap truncate pr-2">
                                {trade.amount}
                              </div>
                              <div className="w-[20%] text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap truncate pr-2">
                                {trade.usdc}
                              </div>
                              <div
                                className={`w-[25%] text-[11px] sm:text-xs font-bold text-right whitespace-nowrap truncate ${pnlColor}`}
                              >
                                {trade.pnl || '-'}
                              </div>
                            </div>
                          );
                        }}
                      </List>
                    )}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Open Positions Table */}
          {stellarPnlData?.positions && stellarPnlData.positions.length > 0 && (
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden flex flex-col h-[400px]">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight mb-4 shrink-0">
                Open Positions
              </h3>
              <div className="flex text-left border-b border-[var(--color-border)] pb-3 px-4 sm:px-0 sm:pr-4 shrink-0 min-w-[500px]">
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Asset
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Remaining
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Avg Cost
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Current Value
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider text-right">
                  Unrealized PnL
                </div>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden mt-1 -mx-4 sm:mx-0">
                <div className="min-w-[500px] h-full">
                  <AutoSizer
                    renderProp={({ height, width }) => (
                      <List
                        height={height || 0}
                        width={width || 0}
                        itemCount={stellarPnlData.positions.length}
                        itemSize={48}
                        itemData={stellarPnlData.positions}
                      >
                        {({ index, style, data }: any) => {
                          const pos = data[index];
                          const isProfit = (pos.unrealized || 0) > 0;
                          const isLoss = (pos.unrealized || 0) < 0;
                          const pnlColor = isProfit
                            ? 'text-emerald-500'
                            : isLoss
                              ? 'text-rose-500'
                              : 'text-[var(--color-text-primary)]';
                          return (
                            <div
                              style={style}
                              className="flex items-center group hover:bg-[var(--color-bg-tertiary)]/50 transition-colors border-b border-[var(--color-border)] px-4 sm:px-0"
                            >
                              <div className="w-[20%] text-[11px] sm:text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap truncate pr-2 flex items-center gap-1.5">
                                {getStellarAssetIcon(pos.asset) ? (
                                  <img
                                    src={getStellarAssetIcon(pos.asset) || ''}
                                    alt={pos.asset}
                                    className="w-4 h-4 rounded-full"
                                  />
                                ) : (
                                  <div className="w-4 h-4 rounded-full bg-secondary border border-[var(--color-border)]" />
                                )}
                                {pos.asset}
                              </div>
                              <div className="w-[20%] text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap truncate pr-2">
                                {pos.remaining?.toFixed(4) || '0'}
                              </div>
                              <div className="w-[20%] text-[11px] sm:text-xs font-medium text-[var(--color-text-secondary)] whitespace-nowrap truncate pr-2">
                                ${pos.avgCost?.toFixed(6) || '0'}
                              </div>
                              <div className="w-[20%] text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap truncate pr-2">
                                ${pos.currentValue?.toFixed(2) || '0'}
                              </div>
                              <div
                                className={`w-[20%] text-[11px] sm:text-xs font-bold text-right whitespace-nowrap truncate ${pnlColor}`}
                              >
                                {pos.unrealized
                                  ? (pos.unrealized > 0 ? '+' : '') +
                                    pos.unrealized.toLocaleString('en-US', {
                                      style: 'currency',
                                      currency: 'USD',
                                    })
                                  : '-'}
                              </div>
                            </div>
                          );
                        }}
                      </List>
                    )}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Disposals Table */}
          {stellarPnlData?.disposals && stellarPnlData.disposals.length > 0 && (
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden flex flex-col h-[400px]">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight mb-4 shrink-0">
                Disposals
              </h3>
              <div className="flex text-left border-b border-[var(--color-border)] pb-3 px-4 sm:px-0 sm:pr-4 shrink-0 min-w-[500px]">
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Date
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Asset
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Amount
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Proceeds
                </div>
                <div className="w-[20%] text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider text-right">
                  Realized PnL
                </div>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden mt-1 -mx-4 sm:mx-0">
                <div className="min-w-[500px] h-full">
                  <AutoSizer
                    renderProp={({ height, width }) => (
                      <List
                        height={height || 0}
                        width={width || 0}
                        itemCount={stellarPnlData?.disposals?.length || 0}
                        itemSize={48}
                        itemData={[...(stellarPnlData?.disposals || [])].reverse()}
                      >
                        {({ index, style, data }: any) => {
                          const disp = data[index];
                          const isProfit = (disp.pnl || 0) > 0;
                          const isLoss = (disp.pnl || 0) < 0;
                          const pnlColor = isProfit
                            ? 'text-emerald-500'
                            : isLoss
                              ? 'text-rose-500'
                              : 'text-[var(--color-text-primary)]';
                          return (
                            <div
                              style={style}
                              className="flex items-center group hover:bg-[var(--color-bg-tertiary)]/50 transition-colors border-b border-[var(--color-border)] px-4 sm:px-0"
                            >
                              <div className="w-[20%] text-[11px] sm:text-xs text-[var(--color-text-secondary)] whitespace-nowrap truncate pr-2">
                                {disp.date}
                              </div>
                              <div className="w-[20%] text-[11px] sm:text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap truncate pr-2">
                                {disp.asset}
                              </div>
                              <div className="w-[20%] text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap truncate pr-2">
                                {disp.amount}
                              </div>
                              <div className="w-[20%] text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap truncate pr-2">
                                ${disp.proceeds?.toFixed(6) || '0'}
                              </div>
                              <div
                                className={`w-[20%] text-[11px] sm:text-xs font-bold text-right whitespace-nowrap truncate ${pnlColor}`}
                              >
                                {disp.pnl
                                  ? (disp.pnl > 0 ? '+' : '') +
                                    disp.pnl.toLocaleString('en-US', {
                                      style: 'currency',
                                      currency: 'USD',
                                    })
                                  : '-'}
                              </div>
                            </div>
                          );
                        }}
                      </List>
                    )}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  const netWorthSection = (
    <>
      {/* Combined Balance & Allocation Card */}
      <div className="rounded-3xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-4 sm:p-6 relative overflow-hidden shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5">
              <Tooltip
                content={
                  isViewingPublicAddress
                    ? 'Combined value of tracked positions.'
                    : 'Total value of all assets combined with net PnL impact.'
                }
                position="top"
                unstyled
              >
                <Info className="w-3.5 h-3.5 text-muted hover:text-[var(--color-text-primary)] transition-colors" />
              </Tooltip>
              <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                {isViewingPublicAddress ? 'Tracked Portfolio Value' : 'Total Net Worth'}
              </span>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                (stellarPnlData?.totalPnL || 0) >= 0
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              }`}
            >
              {(stellarPnlData?.totalPnL || 0) >= 0 ? '+' : ''}$
              {Math.abs(stellarPnlData?.totalPnL || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              Net PnL
            </span>
          </div>
          <div className="mt-6">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-black text-[var(--color-text-primary)] tracking-tighter">
                $
                {(isViewingPublicAddress
                  ? stellarPnlData?.positions?.reduce(
                      (sum: number, pos: any) => sum + (pos.currentValue || 0),
                      0
                    ) || 0
                  : stellarTotal
                ).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-sm text-brand-primary font-bold">USD</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const tradeOutcomeAnalysisSection = (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-5 shadow-sm flex flex-col justify-center h-full">
      <div className="flex items-center gap-6">
        <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
            <path
              className="text-[var(--color-border)]"
              strokeWidth="3"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-purple-500"
              strokeWidth="3"
              strokeDasharray={`${stellarPnlData?.winRate ?? 0}, 100`}
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-xl font-black text-[var(--color-text-primary)]">
              {stellarPnlData?.winRate ?? 0}%
            </span>
            <span className="text-[8px] font-bold text-[var(--color-text-secondary)] uppercase mt-0.5">
              Win Rate
            </span>
          </div>
        </div>
        <div className="flex flex-col">
          <h3 className="text-sm font-black text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Tooltip
              content="Breakdown of win rate, best/worst trades, and total transactions."
              position="top"
              unstyled
            >
              <Info className="w-3.5 h-3.5 text-purple-400/70 hover:text-purple-400 transition-colors" />
            </Tooltip>
            Trade Outcome Analysis
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Out of{' '}
            <strong className="text-[var(--color-text-primary)]">
              {stellarPnlData?.tradeCount ??
                stellarPnlData?.collapsedCount ??
                stellarPnlData?.trades?.length ??
                0}
            </strong>{' '}
            trades, win rate
            <strong className="text-[var(--color-text-primary)]">
              {' '}
              {stellarPnlData?.winRate ?? 0}%
            </strong>
            . Disposals:{' '}
            <strong className="text-[var(--color-text-primary)]">
              {stellarPnlData?.disposalCount ?? stellarPnlData?.disposals?.length ?? 0}
            </strong>
            .
          </p>
          <div className="mt-4 pt-4 border-t border-[var(--color-border)] grid grid-cols-2 gap-4">
            <div>
              <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider block mb-1">
                Best Trade
              </span>
              <span className="text-xs font-bold text-emerald-500">
                {stellarPnlData?.bestTrade?.pnl
                  ? `+${stellarPnlData.bestTrade.pnl.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                  : '-'}
              </span>
              <span className="text-[9px] text-[var(--color-text-secondary)] ml-1 flex items-center gap-1 mt-1">
                {getStellarAssetIcon(stellarPnlData?.bestTrade?.asset) ? (
                  <img
                    src={getStellarAssetIcon(stellarPnlData.bestTrade.asset) || ''}
                    alt={stellarPnlData.bestTrade.asset}
                    className="w-3 h-3 rounded-full"
                  />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-secondary border border-[var(--color-border)]" />
                )}
                {stellarPnlData?.bestTrade?.asset}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider block mb-1">
                Worst Trade
              </span>
              <span className="text-xs font-bold text-rose-500">
                {stellarPnlData?.worstTrade?.pnl
                  ? `${stellarPnlData.worstTrade.pnl.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                  : '-'}
              </span>
              <span className="text-[9px] text-[var(--color-text-secondary)] ml-1 flex items-center gap-1 mt-1">
                {getStellarAssetIcon(stellarPnlData?.worstTrade?.asset) ? (
                  <img
                    src={getStellarAssetIcon(stellarPnlData.worstTrade.asset) || ''}
                    alt={stellarPnlData.worstTrade.asset}
                    className="w-3 h-3 rounded-full"
                  />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-secondary border border-[var(--color-border)]" />
                )}
                {stellarPnlData?.worstTrade?.asset}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const tradingTimelineSection = (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-5 shadow-sm flex flex-col justify-between h-full relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/20 via-purple-500/10 to-transparent"></div>
      <div className="flex items-center justify-start mb-4">
        <h3 className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
          <Tooltip
            content="Overview of your trading activity span and active days."
            position="top"
            unstyled
          >
            <Info className="w-3.5 h-3.5 text-purple-400/70 hover:text-purple-400 transition-colors" />
          </Tooltip>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Trading Timeline
        </h3>
      </div>

      <div className="relative pl-4 mb-6 border-l-2 border-[var(--color-border)] ml-2 space-y-4">
        <div className="relative">
          <div className="absolute -left-[23px] top-1 w-3 h-3 bg-white rounded-full border-2 border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
          <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider block mb-0.5">
            First Trade
          </span>
          <span className="text-xs font-bold text-[var(--color-text-primary)]">
            {stellarPnlData?.firstTradeDate
              ? new Date(stellarPnlData.firstTradeDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'N/A'}
          </span>
        </div>
        <div className="relative">
          <div className="absolute -left-[23px] top-1 w-3 h-3 bg-purple-400 rounded-full border-2 border-purple-600 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
          <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider block mb-0.5">
            Last Trade
          </span>
          <span className="text-xs font-bold text-[var(--color-text-primary)]">
            {stellarPnlData?.lastTradeDate
              ? new Date(stellarPnlData.lastTradeDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'N/A'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
        <div className="text-[10px] text-[var(--color-text-secondary)]">
          Active Days:{' '}
          <strong className="text-[var(--color-text-primary)]">
            {stellarPnlData?.activeDays || 0}
          </strong>
        </div>
        <div className="text-[10px] text-[var(--color-text-secondary)]">
          Most Traded:{' '}
          <strong className="text-[var(--color-text-primary)]">
            {stellarPnlData?.mostTradedAsset || 'N/A'}
          </strong>
        </div>
      </div>
    </div>
  );

  // Parse positions for PnL Distribution (Top 5 by absolute PnL impact)
  const topAssets = stellarPnlData?.positions
    ? [...stellarPnlData.positions]
        .map(p => ({ ...p, totalAssetPnl: (p.realizedPnL || 0) + (p.unrealized || 0) }))
        .sort((a: any, b: any) => Math.abs(b.totalAssetPnl) - Math.abs(a.totalAssetPnl))
    : // .slice(0, 5)
      [];
  const totalAbsPnl =
    topAssets.reduce((sum: number, p: any) => sum + Math.abs(p.totalAssetPnl), 0) || 1;

  const assetAllocationSection = (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col">
      <div className="flex items-center justify-start mb-1 gap-1.5">
        <Tooltip
          content="Visual breakdown of assets contributing to your total PnL."
          position="top"
          unstyled
        >
          <Info className="w-3.5 h-3.5 text-muted hover:text-[var(--color-text-primary)] transition-colors" />
        </Tooltip>
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">
          PnL Distribution
        </h3>
      </div>
      <p className="text-[11px] text-[var(--color-text-secondary)] font-medium mb-5">
        Top assets by total PnL impact
      </p>

      <div className="flex flex-col gap-4">
        {topAssets.length > 0 ? (
          topAssets.map((asset: any) => {
            const pct = Math.min(
              100,
              Math.max(0, (Math.abs(asset.totalAssetPnl) / totalAbsPnl) * 100)
            );
            const isPositive = asset.totalAssetPnl >= 0;
            const colorClass = isPositive ? 'bg-emerald-500' : 'bg-rose-500';
            return (
              <div key={asset.asset} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    {getStellarAssetIcon(asset.asset) ? (
                      <img
                        src={getStellarAssetIcon(asset.asset) || ''}
                        alt={asset.asset}
                        className="w-4 h-4 rounded-full"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-secondary border border-[var(--color-border)]" />
                    )}
                    {asset.asset}
                  </span>
                  <span
                    className={`font-medium ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {isPositive ? '+' : ''}
                    {(asset.totalAssetPnl || 0).toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}
                  </span>
                </div>
                <div className="w-full h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${colorClass} rounded-full transition-all duration-1000`}
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-[var(--color-text-secondary)] text-center py-4">
            No PnL data found
          </div>
        )}
      </div>
    </div>
  );

  const detailedMetricsSection = (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-start mb-4 gap-1.5">
        <Tooltip
          content="Key performance indicators including realized and unrealized gains."
          position="top"
          unstyled
        >
          <Info className="w-3.5 h-3.5 text-muted hover:text-[var(--color-text-primary)] transition-colors" />
        </Tooltip>
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">
          Performance Metrics
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[
          { label: 'Total PnL', value: stellarPnlData?.totalPnL ?? 0, isCurrency: true },
          {
            label: 'Unrealized PnL',
            value: stellarPnlData?.totalUnrealized ?? 0,
            isCurrency: true,
          },
          { label: 'Realized PnL', value: stellarPnlData?.totalRealized ?? 0, isCurrency: true },
          { label: 'USDC Spent', value: stellarPnlData?.usdcSpent ?? 0, isCurrency: true },
          { label: 'Net USDC Flow', value: stellarPnlData?.netUSDCFlow ?? 0, isCurrency: true },
        ].map((metric, idx) => (
          <div key={idx} className="flex flex-col">
            <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
              {metric.label}
            </span>
            <span
              className={`text-sm font-bold ${
                metric.isCurrency
                  ? Number(metric.value) > 0
                    ? 'text-emerald-500'
                    : Number(metric.value) < 0
                      ? 'text-rose-500'
                      : 'text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-primary)]'
              }`}
            >
              {metric.isCurrency
                ? Number(metric.value).toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  })
                : metric.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const portfolioDiagnosticsSection = (
    <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-start gap-1.5">
        <Tooltip
          content="Automated checks for low liquidity, estimated cost basis, and data health."
          position="top"
          unstyled
        >
          <Info className="w-3.5 h-3.5 text-muted hover:text-[var(--color-text-primary)] transition-colors" />
        </Tooltip>
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight">
          Portfolio Diagnostics
        </h3>
      </div>

      {stellarPnlData?.lowLiquidityAssets && stellarPnlData.lowLiquidityAssets.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-500"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span className="text-xs font-bold text-amber-500">Low Liquidity Warning</span>
          </div>
          <p className="text-[10px] text-amber-500/80 mb-2">
            The following assets have very low trading volume. Values may be inaccurate.
          </p>
          <div className="flex flex-wrap gap-2">
            {stellarPnlData.lowLiquidityAssets.map((asset: any, idx: number) => (
              <span
                key={idx}
                className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] px-2 py-1 rounded-md font-bold"
              >
                {asset.asset}
              </span>
            ))}
          </div>
        </div>
      )}

      {stellarPnlData?.autoCostBasis && Object.keys(stellarPnlData.autoCostBasis).length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-500"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span className="text-xs font-bold text-blue-500">Auto Cost Basis</span>
          </div>
          <p className="text-[10px] text-blue-500/80 mb-2">
            Cost basis was auto-estimated for some assets due to missing historical data.
          </p>
          <div className="text-[10px] text-blue-500 font-medium">
            {Object.keys(stellarPnlData.autoCostBasis).length} assets estimated
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-2 pt-4 border-t border-[var(--color-border)]">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-0.5">
            Raw Tx Count
          </span>
          <span className="text-xs font-bold text-[var(--color-text-primary)]">
            {stellarPnlData?.rawCount || 0}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-0.5">
            Collapsed Trades
          </span>
          <span className="text-xs font-bold text-[var(--color-text-primary)]">
            {stellarPnlData?.collapsedCount || 0}
          </span>
        </div>
      </div>
    </div>
  );

  const assetsList = (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex flex-col shadow-sm flex-1 min-h-[500px] overflow-hidden">
      <div className="p-5 border-b border-[var(--color-border)] bg-[var(--color-bg-tertiary)]/50">
        <h3 className="text-base font-bold text-[var(--color-text-primary)] tracking-tight">
          Your Assets
        </h3>
        <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 font-medium">
          Trusted network assets
        </p>
      </div>
      <div className="flex-1 relative">
        <UnifiedAssets
          userAddress={stellarAddress}
          onAssetClick={handleAssetClick}
          onlyTrusted={true}
        />
      </div>
    </div>
  );

  if (loadingStellarPnl) {
    return (
      <div className="relative flex flex-col gap-4 lg:gap-6 w-full max-w-[1600px] mx-auto pb-24 pt-2 sm:pt-4 px-3 sm:px-4 lg:px-6 min-h-screen font-sans">
        {headerControls}

        <div className="absolute inset-0 top-40 z-10 flex flex-col items-center justify-start pointer-events-none mt-16">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 relative mb-6">
              <div className="absolute inset-0 border-4 border-[var(--color-border)] rounded-full"></div>
              <div className="absolute inset-0 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--color-text-primary)] mb-2 tracking-tight">
              Analyzing Portfolio...
            </h2>
            <p className="text-[var(--color-text-secondary)] font-medium max-w-[320px] text-sm leading-relaxed">
              We are collecting heavy data and crunching the numbers for your trades. This could
              take a moment.
            </p>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6 w-full opacity-30 animate-pulse pointer-events-none blur-[2px] select-none">
          <div className="w-full xl:w-8/12 flex flex-col gap-6">
            <div className="h-[400px] bg-[var(--color-bg-secondary)] rounded-3xl border border-[var(--color-border)] shadow-sm"></div>
            <div className="h-[300px] bg-[var(--color-bg-secondary)] rounded-3xl border border-[var(--color-border)] shadow-sm"></div>
          </div>
          <div className="w-full xl:w-4/12 flex flex-col gap-6">
            <div className="h-[160px] bg-[var(--color-bg-secondary)] rounded-3xl border border-[var(--color-border)] shadow-sm"></div>
            <div className="h-[220px] bg-[var(--color-bg-secondary)] rounded-3xl border border-[var(--color-border)] shadow-sm"></div>
            <div className="h-[400px] bg-[var(--color-bg-secondary)] rounded-3xl border border-[var(--color-border)] shadow-sm"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative flex flex-col gap-4 lg:gap-6 w-full max-w-[1600px] mx-auto pb-24 pt-2 sm:pt-4 px-3 sm:px-4 lg:px-6 min-h-screen font-sans">
        {headerControls}

        {stellarPnlError || (!stellarPnlData && !loadingStellarPnl) ? (
          <div className="flex flex-col flex-1 items-center justify-center p-4 mt-8 sm:mt-12">
            <div className="w-full max-w-2xl flex flex-col items-center justify-center bg-rose-500/5 rounded-[2.5rem] border border-rose-500/20 p-8 sm:p-12 text-center min-h-[300px] shadow-sm">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mb-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-rose-500"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <h2 className="text-rose-500 font-black mb-3 text-xl sm:text-2xl tracking-tight">
                Portfolio Analysis Unavailable
              </h2>
              <p className="text-rose-500/80 text-sm sm:text-base font-medium max-w-md leading-relaxed">
                {stellarPnlError ||
                  'Sorry, we are not able to fetch data. It seems your wallet is not active or another error occurred.'}
              </p>
            </div>
          </div>
        ) : isMobile ? (
          <div className="flex flex-col gap-4 w-full">
            {netWorthSection}
            {tradeOutcomeAnalysisSection}
            {tradingTimelineSection}
            {chartSection}
            {assetAllocationSection}
            {detailedMetricsSection}
            {portfolioDiagnosticsSection}
            {tablesSection}
            {assetsList}
          </div>
        ) : (
          <div className="flex flex-row gap-4 w-full">
            <div className="w-2/3 xl:w-8/12 flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {tradeOutcomeAnalysisSection}
                {tradingTimelineSection}
              </div>
              {chartSection}
              {tablesSection}
            </div>

            <div className="w-1/3 xl:w-4/12 flex flex-col gap-4">
              {netWorthSection}
              {assetAllocationSection}
              {detailedMetricsSection}
              {portfolioDiagnosticsSection}
              {assetsList}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <StellarCostBasisModal
        isOpen={isCostBasisModalOpen}
        onClose={() => setIsCostBasisModalOpen(false)}
        stellarCostBasis={stellarCostBasis}
        stellarPnlData={stellarDetailedData}
        handleCostBasisChange={handleCostBasisChange}
        handleClearAllCostBasis={handleClearAllCostBasis}
        handleExportReport={() => {
          setIsCostBasisModalOpen(false);
          setIsExportModalOpen(true);
          handleStartExport(
            stellarTimeframe,
            fromDate,
            toDate,
            stellarTimeframe === 'custom',
            stellarDetailedData
          );
        }}
        isExporting={exportStep > 0 && exportStep < 4}
      />

      <ExportProgressModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        exportType="stellar"
        defaultTimeframe={stellarTimeframe}
        defaultFromDate={fromDate}
        defaultToDate={toDate}
        onStartExport={handleStartExport}
        currentStep={exportStep}
        error={exportError}
        onRetry={() =>
          handleStartExport(exportTimeframe, exportFromDate, exportToDate, exportIsCustom)
        }
      />
    </>
  );
};

export default StellarPortfolioUI;
