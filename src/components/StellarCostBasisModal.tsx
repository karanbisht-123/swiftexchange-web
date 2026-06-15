import React from 'react';
import { Sliders, X as XIcon, Download, RefreshCw } from 'lucide-react';
import { portfolioUtils } from '../modules/walletconnect/utils/portfolioUtils';

interface StellarCostBasisModalProps {
  isOpen: boolean;
  onClose: () => void;
  stellarCostBasis: Record<string, { openingAmount: string; costPerUnit: string }>;
  stellarPnlData: any;
  handleCostBasisChange: (asset: string, field: 'openingAmount' | 'costPerUnit', value: string) => void;
  handleClearAllCostBasis: () => void;
  handleExportReport: () => void;
  isExporting: boolean;
}

export const StellarCostBasisModal: React.FC<StellarCostBasisModalProps> = ({
  isOpen,
  onClose,
  stellarCostBasis,
  stellarPnlData,
  handleCostBasisChange,
  handleClearAllCostBasis,
  handleExportReport,
  isExporting,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md animate-backdrop-fade-in"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl bg-secondary border border-(--color-border) rounded-3xl shadow-premium p-6 md:p-8 animate-modal-scale-in max-h-[90vh] flex flex-col z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-(--color-border) pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
              <Sliders size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-(--color-text-primary) tracking-tight">Adjust Cost Basis</h3>
              <p className="text-xs text-(--color-text-secondary) mt-0.5">Specify opening amounts and cost per unit for your Stellar assets held prior to this period.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-(--color-bg-tertiary) hover:bg-(--color-border) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6 max-h-[60vh] custom-scrollbar">
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 text-amber-400 text-xs flex gap-2">
            <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/10 font-bold select-none text-[11px]">!</span>
            <div>
              Calculations will update in real-time in the UI and inside any exported Excel report.
            </div>
          </div>

          {stellarPnlData?.positions && stellarPnlData.positions.length > 0 ? (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto border border-(--color-border) rounded-2xl bg-secondary shadow-inner">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-(--color-bg-tertiary) border-b border-(--color-border) text-(--color-text-secondary) font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-5 py-3">Asset</th>
                      <th className="px-5 py-3 text-right">Holdings</th>
                      <th className="px-5 py-3 text-right">Price (USD)</th>
                      <th className="px-5 py-3 text-center w-[160px]">← Opening Amount</th>
                      <th className="px-5 py-3 text-center w-[160px]">← Cost Per Unit</th>
                      <th className="px-5 py-3 text-right w-[140px]">Opening Cost ($)</th>
                      <th className="px-5 py-3 text-right w-[140px]">Unrealized P&L ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)/40">
                    {stellarPnlData.positions.map((pos: any, idx: number) => {
                      const config = stellarCostBasis[pos.asset] || { openingAmount: '', costPerUnit: '' };
                      const autoKey = `${pos.asset}::${pos.issuer || 'native'}`;
                      const autoVal = stellarPnlData?.autoCostBasis?.[autoKey];

                      const amtValText = config.openingAmount !== '' ? config.openingAmount : (autoVal?.amount?.toString() || '');
                      const cpuValText = config.costPerUnit !== '' ? config.costPerUnit : (autoVal?.price?.toString() || '');

                      const amtVal = parseFloat(amtValText) || 0;
                      const cpuVal = parseFloat(cpuValText) || 0;
                      const openCost = amtVal * cpuVal;
                      const currentPrice = pos.currentPrice ?? 0;

                      const unrealPnl = (amtValText !== '' && cpuValText !== '')
                        ? (pos.remaining * currentPrice) - openCost
                        : (pos.unrealized ?? 0);

                      const isAutoAmount = config.openingAmount === '' && autoVal?.amount !== undefined;
                      const isAutoPrice = config.costPerUnit === '' && autoVal?.price !== undefined;

                      return (
                        <tr key={pos.asset} className={`${idx % 2 === 0 ? '' : 'bg-(--color-bg-tertiary)/10'} hover:bg-(--color-bg-tertiary)/20 transition-colors`}>
                          <td className="px-5 py-4 font-bold text-(--color-text-primary)">{pos.asset}</td>
                          <td className="px-5 py-4 text-right font-semibold text-(--color-text-primary)">
                            {portfolioUtils.formatBalance(pos.remaining)}
                          </td>
                          <td className="px-5 py-4 text-right font-medium text-(--color-text-secondary)">
                            {portfolioUtils.formatUSD(currentPrice)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <div className="relative inline-block w-full max-w-[120px]">
                              <input
                                type="text"
                                value={amtValText}
                                onChange={(e) => handleCostBasisChange(pos.asset, 'openingAmount', e.target.value)}
                                placeholder="0.00"
                                className={`w-full text-center font-semibold font-mono text-xs px-2.5 py-1.5 rounded-lg border focus:ring-2 focus:ring-brand-primary/10 outline-none transition-all duration-200 ${isAutoAmount
                                    ? 'border-dashed border-purple-500/30 bg-purple-500/5 text-purple-400 hover:bg-purple-500/10'
                                    : 'border-(--color-border) bg-(--color-bg-tertiary)/40 hover:bg-(--color-bg-tertiary)/75 focus:bg-secondary focus:border-brand-primary'
                                  }`}
                                title={isAutoAmount ? 'Auto-filled from backend history. Edit to customize.' : 'Custom value'}
                              />
                            </div>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <div className="relative inline-block w-full max-w-[120px]">
                              <input
                                type="text"
                                value={cpuValText}
                                onChange={(e) => handleCostBasisChange(pos.asset, 'costPerUnit', e.target.value)}
                                placeholder="0.00"
                                className={`w-full text-center font-semibold font-mono text-xs px-2.5 py-1.5 rounded-lg border focus:ring-2 focus:ring-brand-primary/10 outline-none transition-all duration-200 ${isAutoPrice
                                    ? 'border-dashed border-purple-500/30 bg-purple-500/5 text-purple-400 hover:bg-purple-500/10'
                                    : 'border-(--color-border) bg-(--color-bg-tertiary)/40 hover:bg-(--color-bg-tertiary)/75 focus:bg-secondary focus:border-brand-primary'
                                  }`}
                                title={isAutoPrice ? 'Auto-filled from backend history. Edit to customize.' : 'Custom value'}
                              />
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right font-bold text-(--color-text-primary)">
                            {openCost > 0 ? portfolioUtils.formatUSD(openCost) : '—'}
                          </td>
                          <td className={`px-5 py-4 text-right font-black ${unrealPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {unrealPnl >= 0 ? '+' : ''}{portfolioUtils.formatUSD(unrealPnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {stellarPnlData.positions.map((pos: any) => {
                  const config = stellarCostBasis[pos.asset] || { openingAmount: '', costPerUnit: '' };
                  const autoKey = `${pos.asset}::${pos.issuer || 'native'}`;
                  const autoVal = stellarPnlData?.autoCostBasis?.[autoKey];

                  const amtValText = config.openingAmount !== '' ? config.openingAmount : (autoVal?.amount?.toString() || '');
                  const cpuValText = config.costPerUnit !== '' ? config.costPerUnit : (autoVal?.price?.toString() || '');

                  const amtVal = parseFloat(amtValText) || 0;
                  const cpuVal = parseFloat(cpuValText) || 0;
                  const openCost = amtVal * cpuVal;
                  const currentPrice = pos.currentPrice ?? 0;

                  const unrealPnl = (amtValText !== '' && cpuValText !== '')
                    ? (pos.remaining * currentPrice) - openCost
                    : (pos.unrealized ?? 0);

                  const isAutoAmount = config.openingAmount === '' && autoVal?.amount !== undefined;
                  const isAutoPrice = config.costPerUnit === '' && autoVal?.price !== undefined;

                  return (
                    <div key={pos.asset} className="p-4 bg-gradient-to-br from-(--color-bg-secondary) to-(--color-bg-tertiary)/30 border border-(--color-border) rounded-2xl space-y-4 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/[0.02] rounded-full blur-xl pointer-events-none group-hover:scale-150 transition-all duration-500" />
                      <div className="flex items-center justify-between border-b border-(--color-border)/40 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-(--color-text-primary)">{pos.asset}</span>
                          {(isAutoAmount || isAutoPrice) && (
                            <span className="text-[8px] font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1 py-0.2 rounded-full">Auto</span>
                          )}
                        </div>
                        <span className="text-[10px] uppercase font-bold text-(--color-text-secondary)">Position Data</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[9.5px] uppercase font-bold text-(--color-text-secondary) tracking-wider block">Wallet Balance</span>
                          <span className="font-semibold text-(--color-text-primary)">
                            {portfolioUtils.formatBalance(pos.remaining)} {pos.asset}
                          </span>
                        </div>
                        <div className="space-y-0.5 text-right">
                          <span className="text-[9.5px] uppercase font-bold text-(--color-text-secondary) tracking-wider block">Current Price</span>
                          <span className="font-semibold text-(--color-text-primary)">
                            {portfolioUtils.formatUSD(currentPrice)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-(--color-text-secondary) tracking-wider block">Opening Amount</label>
                          <input
                            type="text"
                            value={amtValText}
                            onChange={(e) => handleCostBasisChange(pos.asset, 'openingAmount', e.target.value)}
                            placeholder="0.00"
                            className={`w-full text-center font-semibold font-mono text-xs px-2.5 py-1.5 rounded-lg border outline-none transition-all duration-200 ${isAutoAmount
                                ? 'border-dashed border-purple-500/30 bg-purple-500/5 text-purple-400'
                                : 'border-(--color-border) bg-(--color-bg-tertiary)/40 hover:bg-(--color-bg-tertiary)/75 focus:bg-secondary focus:border-brand-primary'
                              }`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-(--color-text-secondary) tracking-wider block">Cost Per Unit ($)</label>
                          <input
                            type="text"
                            value={cpuValText}
                            onChange={(e) => handleCostBasisChange(pos.asset, 'costPerUnit', e.target.value)}
                            placeholder="0.00"
                            className={`w-full text-center font-semibold font-mono text-xs px-2.5 py-1.5 rounded-lg border outline-none transition-all duration-200 ${isAutoPrice
                                ? 'border-dashed border-purple-500/30 bg-purple-500/5 text-purple-400'
                                : 'border-(--color-border) bg-(--color-bg-tertiary)/40 hover:bg-(--color-bg-tertiary)/75 focus:bg-secondary focus:border-brand-primary'
                              }`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-(--color-border)/30 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase font-bold text-(--color-text-secondary) tracking-wider block">Opening Cost</span>
                          <span className="font-bold text-(--color-text-primary)">
                            {openCost > 0 ? portfolioUtils.formatUSD(openCost) : '—'}
                          </span>
                        </div>
                        <div className="space-y-0.5 text-right">
                          <span className="text-[9px] uppercase font-bold text-(--color-text-secondary) tracking-wider block">Adjusted P&L</span>
                          <span className={`font-black ${unrealPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {unrealPnl >= 0 ? '+' : ''}{portfolioUtils.formatUSD(unrealPnl)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-(--color-text-secondary) italic border border-dashed border-(--color-border) rounded-2xl bg-secondary">
              No active position data found. Enter dates or verify your Stellar wallet.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-(--color-border) pt-4 mt-6">
          <div className="flex items-center gap-3 self-start sm:self-auto">
            {Object.keys(stellarCostBasis).length > 0 && (
              <button
                onClick={handleClearAllCostBasis}
                className="px-4 py-2 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-bold transition-all duration-300"
              >
                Reset All
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={handleExportReport}
              disabled={isExporting || !stellarPnlData?.positions?.length}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 shadow-sm border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {isExporting ? (
                <RefreshCw size={13} className="animate-spin shrink-0" />
              ) : (
                <Download size={13} className="shrink-0" />
              )}
              {isExporting ? 'Generating Excel...' : 'Export Excel Report'}
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text font-bold text-xs shadow-md hover:shadow-lg transition-all active:scale-95 w-full sm:w-auto"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
