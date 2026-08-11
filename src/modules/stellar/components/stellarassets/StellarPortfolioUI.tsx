import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { StellarCostBasisModal } from '../../../../components/StellarCostBasisModal';
import { ExportProgressModal } from '../../../../pages/profile/components/ExportProgressModal';
import { useIsMobile } from '../../../../perps/components/chart/hooks/useIsMobile';
import { fetchStellarPnl } from '../../../../service/apiService';
import { exportStellarReport } from '../../../../utils/exportService';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useProfilePortfolio } from '../../../walletconnect/hooks/useProfilePortfolio';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import StellarPnlChart from './StellarPnlChart';
import UnifiedAssets from './UnifiedAssets';

const StellarPortfolioUI: React.FC = () => {
  const { stellarTotal } = useProfilePortfolio();
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';
  const navigate = useNavigate();

  const [stellarPnlData, setStellarPnlData] = useState<any>(null);
  const [loadingStellarPnl, setLoadingStellarPnl] = useState(false);
  const [stellarPnlError, setStellarPnlError] = useState<string | null>(null);

  const isMobile = useIsMobile();

  // States for Performance Card
  const [stellarTimeframe, setStellarTimeframe] = useState<'1w' | '1m' | '2m' | '3m'>('1m');

  const fromDate = null;
  const toDate = null;
  const isDateRangeActive = !!(fromDate || toDate);

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
        setStellarPnlError(err instanceof Error ? err.message : 'Failed to fetch Stellar PNL');
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
      isCustom: boolean
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

        setExportStep(2);
        const fullData = (await fetchStellarPnl(stellarAddress, fromStr, toStr, true)) as any;
        if (!fullData) {
          throw new Error('No report data returned from server');
        }
        setStellarDetailedData(fullData);

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

  if (!stellarAddress) {
    return (
      <div className="w-full flex items-center justify-center min-h-[600px] py-12 px-4">
        <div className="w-full max-w-md flex flex-col items-center justify-center bg-[var(--color-bg-secondary)] rounded-3xl border border-[var(--color-border)] p-10 text-center shadow-sm">
          <svg
            className="w-16 h-16 text-[var(--color-text-secondary)] mb-6 opacity-30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight mb-3">
            Wallet Not Connected
          </h2>
          <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
            Please connect your Stellar wallet to view your live portfolio balance, PnL performance,
            and trading history.
          </p>
        </div>
      </div>
    );
  }

  const headerControls = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-5 rounded-3xl shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Portfolio Dashboard
        </h2>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          Stellar network performance & metrics
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleOpenCostBasis}
          disabled={loadingCostBasisDetails}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
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
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          )}
          Cost Basis
        </button>
        <button
          onClick={handleExportReport}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 rounded-xl text-xs font-bold transition-all"
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
          Export Sheet
        </button>
        <div className="flex bg-[var(--color-bg-tertiary)] p-1 rounded-xl border border-[var(--color-border)]">
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
              onClick={() => setStellarTimeframe(tf.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                stellarTimeframe === tf.id
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const chartSection = (
    <>
      {loadingStellarPnl ? (
        <div className="h-64 flex flex-col items-center justify-center bg-[var(--color-bg-secondary)] rounded-3xl border border-[var(--color-border)] animate-pulse">
          <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
          <span className="text-[var(--color-text-secondary)] text-sm font-medium">
            Analyzing Portfolio...
          </span>
        </div>
      ) : stellarPnlError ? (
        <div className="h-64 flex flex-col items-center justify-center bg-red-500/5 rounded-3xl border border-red-500/10">
          <span className="text-red-500 font-medium">{stellarPnlError}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          <StellarPnlChart disposals={stellarPnlData?.disposals || []} />
        </div>
      )}
    </>
  );

  const tablesSection = (
    <>
      {!loadingStellarPnl && !stellarPnlError && (
        <div className="flex flex-col gap-4 sm:gap-6">
          {/* Recent Trades Table */}
          {stellarPnlData?.trades && stellarPnlData.trades.length > 0 && (
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight mb-4">
                Recent Trades
              </h3>
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="text-left border-b border-[var(--color-border)]">
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Date
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Action
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Value
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider text-right">
                        PnL
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-sm">
                    {stellarPnlData.trades.slice(0, 10).map((trade: any, idx: number) => {
                      const isProfit = (trade.pnlNum || 0) > 0;
                      const isLoss = (trade.pnlNum || 0) < 0;
                      const pnlColor = isProfit
                        ? 'text-emerald-500'
                        : isLoss
                          ? 'text-rose-500'
                          : 'text-[var(--color-text-primary)]';
                      return (
                        <tr
                          key={idx}
                          className="group hover:bg-[var(--color-bg-tertiary)]/50 transition-colors"
                        >
                          <td className="py-3 text-[11px] sm:text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                            {trade.date}
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                trade.type === 'BUY'
                                  ? 'bg-emerald-500/10 text-emerald-500'
                                  : 'bg-rose-500/10 text-rose-500'
                              }`}
                            >
                              {trade.action}
                            </span>
                          </td>
                          <td className="py-3 text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                            {trade.amount}
                          </td>
                          <td className="py-3 text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                            {trade.usdc}
                          </td>
                          <td
                            className={`py-3 text-[11px] sm:text-xs font-bold text-right whitespace-nowrap ${pnlColor}`}
                          >
                            {trade.pnl || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Open Positions Table */}
          {stellarPnlData?.positions && stellarPnlData.positions.length > 0 && (
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight mb-4">
                Open Positions
              </h3>
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="text-left border-b border-[var(--color-border)]">
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Asset
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Remaining
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Avg Cost
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Current Value
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider text-right">
                        Unrealized PnL
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-sm">
                    {stellarPnlData.positions.map((pos: any, idx: number) => {
                      const isProfit = (pos.unrealized || 0) > 0;
                      const isLoss = (pos.unrealized || 0) < 0;
                      const pnlColor = isProfit
                        ? 'text-emerald-500'
                        : isLoss
                          ? 'text-rose-500'
                          : 'text-[var(--color-text-primary)]';
                      return (
                        <tr
                          key={idx}
                          className="group hover:bg-[var(--color-bg-tertiary)]/50 transition-colors"
                        >
                          <td className="py-3 text-[11px] sm:text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                            {pos.asset}
                          </td>
                          <td className="py-3 text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                            {pos.remaining?.toFixed(4) || '0'}
                          </td>
                          <td className="py-3 text-[11px] sm:text-xs font-medium text-[var(--color-text-secondary)] whitespace-nowrap">
                            ${pos.avgCost?.toFixed(6) || '0'}
                          </td>
                          <td className="py-3 text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                            ${pos.currentValue?.toFixed(2) || '0'}
                          </td>
                          <td
                            className={`py-3 text-[11px] sm:text-xs font-bold text-right whitespace-nowrap ${pnlColor}`}
                          >
                            {pos.unrealized
                              ? (pos.unrealized > 0 ? '+' : '') +
                                pos.unrealized.toLocaleString('en-US', {
                                  style: 'currency',
                                  currency: 'USD',
                                })
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Disposals Table */}
          {stellarPnlData?.disposals && stellarPnlData.disposals.length > 0 && (
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight mb-4">
                Disposals
              </h3>
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="text-left border-b border-[var(--color-border)]">
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Date
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Asset
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Proceeds
                      </th>
                      <th className="pb-3 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider text-right">
                        Realized PnL
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-sm">
                    {stellarPnlData.disposals.slice(0, 10).map((disp: any, idx: number) => {
                      const isProfit = (disp.pnl || 0) > 0;
                      const isLoss = (disp.pnl || 0) < 0;
                      const pnlColor = isProfit
                        ? 'text-emerald-500'
                        : isLoss
                          ? 'text-rose-500'
                          : 'text-[var(--color-text-primary)]';
                      return (
                        <tr
                          key={idx}
                          className="group hover:bg-[var(--color-bg-tertiary)]/50 transition-colors"
                        >
                          <td className="py-3 text-[11px] sm:text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                            {disp.date}
                          </td>
                          <td className="py-3 text-[11px] sm:text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                            {disp.asset}
                          </td>
                          <td className="py-3 text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                            {disp.amount}
                          </td>
                          <td className="py-3 text-[11px] sm:text-xs font-medium text-[var(--color-text-primary)] whitespace-nowrap">
                            ${disp.proceeds?.toFixed(6) || '0'}
                          </td>
                          <td
                            className={`py-3 text-[11px] sm:text-xs font-bold text-right whitespace-nowrap ${pnlColor}`}
                          >
                            {disp.pnl
                              ? (disp.pnl > 0 ? '+' : '') +
                                disp.pnl.toLocaleString('en-US', {
                                  style: 'currency',
                                  currency: 'USD',
                                })
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
            <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Total Net Worth
            </span>
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
                {stellarTotal.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-sm text-brand-primary font-bold">USD</span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-2 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Live Sync from Network
            </p>
          </div>
        </div>
      </div>
    </>
  );

  const winRateAndMetricsSection = (
    <>
      {/* Combined Win Rate & Highlights Card (Moved to Right Column) */}
      {stellarPnlData && (
        <div className="rounded-3xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-4 sm:p-6 flex flex-col justify-between shadow-sm">
          <div className="flex flex-row items-center justify-between gap-4 w-full">
            <div className="flex flex-col text-left items-start flex-1 min-w-0">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
                Trade Win Rate
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                {stellarPnlData?.tradeCount ??
                  stellarPnlData?.collapsedCount ??
                  stellarPnlData?.trades?.length ??
                  0}{' '}
                Total Trades
              </p>
              <div className="mt-4 text-xs font-medium text-[var(--color-text-secondary)] space-y-1">
                <div>
                  <span className="text-emerald-500 font-bold">
                    {stellarPnlData?.winRate ?? 0}%
                  </span>{' '}
                  Profitable
                </div>
                <div>
                  <span className="text-[var(--color-text-primary)] font-bold">
                    {stellarPnlData?.disposalCount ?? stellarPnlData?.disposals?.length ?? 0}
                  </span>{' '}
                  Disposals
                </div>
              </div>
            </div>
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center shrink-0">
              <svg
                className="w-full h-full transform -rotate-90 drop-shadow-sm"
                viewBox="0 0 36 36"
              >
                <path
                  className="text-[var(--color-border)]"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-brand-primary"
                  strokeWidth="4"
                  strokeDasharray={`${stellarPnlData?.winRate ?? 0}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-lg sm:text-xl font-black text-[var(--color-text-primary)]">
                  {stellarPnlData?.winRate ?? 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Trading Highlights inside Win Rate Card */}
          <div className="mt-6 pt-5 border-t border-[var(--color-border)] grid grid-cols-3 gap-2 divide-x divide-[var(--color-border)]">
            <div className="flex flex-col items-start px-2 sm:px-0 first:pl-0 text-left">
              <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                Best Trade
              </span>
              <div className="text-xs sm:text-sm font-black text-emerald-500">
                {stellarPnlData?.bestTrade
                  ? `+${stellarPnlData.bestTrade.pnl?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
                  : '-'}
              </div>
              <span className="text-[9px] text-[var(--color-text-secondary)] mt-0.5">
                {stellarPnlData?.bestTrade?.asset || 'N/A'}
              </span>
            </div>

            <div className="flex flex-col items-start px-2 text-left">
              <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                Max Loss
              </span>
              <div className="text-xs sm:text-sm font-black text-rose-500">
                {stellarPnlData?.worstTrade
                  ? stellarPnlData.worstTrade.pnl?.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    })
                  : '-'}
              </div>
              <span className="text-[9px] text-[var(--color-text-secondary)] mt-0.5">
                {stellarPnlData?.worstTrade?.asset || 'N/A'}
              </span>
            </div>

            <div className="flex flex-col items-start px-2 pr-0 text-left">
              <span className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                Top Asset
              </span>
              <div className="text-xs sm:text-sm font-black text-[var(--color-text-primary)]">
                {stellarPnlData?.largestPosition
                  ? stellarPnlData.largestPosition.currentValue?.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    })
                  : '-'}
              </div>
              <span className="text-[9px] text-[var(--color-text-secondary)] mt-0.5">
                {stellarPnlData?.largestPosition?.asset || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Metrics Grid (Moved to Right Column) */}
      {stellarPnlData && (
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-3xl p-4 sm:p-6 shadow-sm">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] tracking-tight mb-4">
            Detailed Metrics
          </h3>
          <div className="grid grid-cols-2 gap-y-4 gap-x-3 sm:gap-y-6 sm:gap-x-4">
            {[
              {
                label: 'Total Trades',
                value:
                  stellarPnlData?.tradeCount ??
                  stellarPnlData?.collapsedCount ??
                  stellarPnlData?.trades?.length ??
                  0,
              },
              {
                label: 'Open Positions',
                value: stellarPnlData?.positionCount ?? stellarPnlData?.positions?.length ?? 0,
              },
              {
                label: 'Disposals',
                value: stellarPnlData?.disposalCount ?? stellarPnlData?.disposals?.length ?? 0,
              },
              {
                label: 'Realized PnL',
                value: stellarPnlData?.totalRealized ?? 0,
                isCurrency: true,
              },
              {
                label: 'Unrealized PnL',
                value: stellarPnlData?.totalUnrealized ?? 0,
                isCurrency: true,
              },
              {
                label: 'USDC Received',
                value: stellarPnlData?.usdcReceived ?? 0,
                isCurrency: true,
              },
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
      )}
    </>
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

  return (
    <>
      <div className="relative flex flex-col gap-4 lg:gap-6 w-full max-w-[1600px] mx-auto pb-24 pt-2 sm:pt-4 px-3 sm:px-4 lg:px-6 min-h-screen font-sans">
        {headerControls}

        {isMobile ? (
          <div className="flex flex-col gap-4 w-full">
            {netWorthSection}
            {chartSection}
            {winRateAndMetricsSection}
            {tablesSection}
            {assetsList}
          </div>
        ) : (
          <div className="flex flex-row gap-6 w-full">
            {/* Left Column */}
            <div className="w-2/3 xl:w-8/12 flex flex-col gap-6">
              {chartSection}
              {tablesSection}
            </div>
            {/* Right Column */}
            <div className="w-1/3 xl:w-4/12 flex flex-col gap-6">
              {netWorthSection}
              {winRateAndMetricsSection}
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
          handleExportReport();
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
