import { AlertCircle, BarChart2, Check, Download, Loader2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface ExportStep {
  label: string;
  description: string;
}

interface ExportProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportType: 'dydx' | 'stellar';

  // Default values from dashboard
  defaultTimeframe: string;
  defaultFromDate: string | null;
  defaultToDate: string | null;

  // Callback when user confirms selection and starts export
  onStartExport: (
    timeframe: any,
    fromDate: string | null,
    toDate: string | null,
    isCustomRange: boolean
  ) => void;

  // Progress states driven by parent
  currentStep: number; // 0 for config, 1+ for progress steps
  error: string | null;
  onRetry?: () => void;
}

const DYDX_EXPORT_STEPS: ExportStep[] = [
  {
    label: 'Preparing your statement...',
    description: 'Setting up report filters and date scopes.',
  },
  {
    label: 'Collecting funding payment data...',
    description: 'Fetching paginated funding payments from indexer.',
  },
  {
    label: 'Processing your transactions...',
    description: 'Resolving trade log fills, transfers, and account histories.',
  },
  {
    label: 'Generating your Excel statement...',
    description: 'Packaging contents into compressed spreadsheet structure.',
  },
  { label: 'Your statement is ready.', description: 'Download will begin automatically.' },
];

const STELLAR_EXPORT_STEPS: ExportStep[] = [
  {
    label: 'Preparing your statement...',
    description: 'Setting up report filters and date scopes.',
  },
  {
    label: 'Fetching Stellar ledger history...',
    description: 'Retrieving trades, cost basis mappings, and wallet details.',
  },
  {
    label: 'Generating your Excel statement...',
    description: 'Formatting rows, formulas, and compressing to spreadsheet.',
  },
  { label: 'Your statement is ready.', description: 'Download will begin automatically.' },
];

export const ExportProgressModal: React.FC<ExportProgressModalProps> = ({
  isOpen,
  onClose,
  exportType,
  defaultTimeframe,
  defaultFromDate,
  defaultToDate,
  onStartExport,
  currentStep,
  error,
  onRetry,
}) => {
  const [selectedMode, setSelectedMode] = useState<'quick' | 'custom'>('quick');
  const [timeframe, setTimeframe] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const steps = exportType === 'dydx' ? DYDX_EXPORT_STEPS : STELLAR_EXPORT_STEPS;
  const maxSteps = steps.length;

  useEffect(() => {
    if (isOpen) {
      if (defaultFromDate || defaultToDate) {
        setSelectedMode('custom');
        setFromDate(defaultFromDate || '');
        setToDate(defaultToDate || '');
        setTimeframe(defaultTimeframe);
      } else {
        setSelectedMode('quick');
        setTimeframe(defaultTimeframe);
        setFromDate('');
        setToDate('');
      }
    }
  }, [isOpen, defaultTimeframe, defaultFromDate, defaultToDate]);

  if (!isOpen) return null;

  const handleStart = () => {
    const isCustom = selectedMode === 'custom';
    onStartExport(timeframe, isCustom ? fromDate : null, isCustom ? toDate : null, isCustom);
  };

  const isDydx = exportType === 'dydx';
  const quickOptions = isDydx ? ['1d', '7d', '30d', '90d'] : ['1w', '1m', '2m', '3m'];

  const getLocalDateString = (d: Date): string => {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateString(new Date());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-secondary border border-color rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-color">
          <h3 className="text-base font-bold text-primary">
            Export {isDydx ? 'dYdX' : 'Stellar'} Statement
          </h3>
          <button
            onClick={onClose}
            disabled={currentStep > 0 && currentStep < maxSteps && !error}
            className="text-muted hover:text-primary transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {currentStep === 0 && !error ? (
            /* Mode 1: Configuration Form */
            <div className="space-y-5">
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider">
                  Choose Period Scope
                </span>
                <div className="flex p-1 bg-primary border border-color rounded-xl">
                  <button
                    onClick={() => setSelectedMode('quick')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      selectedMode === 'quick'
                        ? 'bg-brand text-white shadow-sm'
                        : 'text-muted hover:text-primary'
                    }`}
                  >
                    Quick Selector
                  </button>
                  <button
                    onClick={() => setSelectedMode('custom')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      selectedMode === 'custom'
                        ? 'bg-brand text-white shadow-sm'
                        : 'text-muted hover:text-primary'
                    }`}
                  >
                    Custom Dates
                  </button>
                </div>
              </div>

              {selectedMode === 'quick' ? (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted tracking-wider">
                    Select Timeframe
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {quickOptions.map(opt => (
                      <button
                        key={opt}
                        onClick={() => setTimeframe(opt)}
                        className={`py-2 text-xs font-black rounded-xl border transition-all ${
                          timeframe === opt
                            ? 'bg-brand/10 border-brand text-brand'
                            : 'bg-primary border-color text-muted hover:text-primary hover:border-brand/40'
                        }`}
                      >
                        {opt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted tracking-wider">
                    Select Date Range
                  </span>
                  <div className="grid grid-cols-2 gap-3 p-3 bg-primary border border-color rounded-xl">
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-muted uppercase">From</label>
                      <input
                        type="date"
                        value={fromDate}
                        max={toDate || todayStr}
                        onChange={e => setFromDate(e.target.value)}
                        className="w-full bg-secondary border border-color rounded-lg px-2 py-1.5 text-xs text-primary font-semibold outline-none focus:border-brand"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-muted uppercase">To</label>
                      <input
                        type="date"
                        value={toDate}
                        min={fromDate}
                        max={todayStr}
                        onChange={e => setToDate(e.target.value)}
                        className="w-full bg-secondary border border-color rounded-lg px-2 py-1.5 text-xs text-primary font-semibold outline-none focus:border-brand"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3.5 bg-brand/5 border border-brand/10 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-brand font-bold text-xs">
                  <BarChart2 size={14} />
                  Included Sheet Sections
                </div>
                <p className="text-[10.5px] text-muted leading-relaxed">
                  {isDydx
                    ? 'Export packages Unified Balance Sheet, detailed Trade Logs, deposit & withdrawal histories, and hourly Funding Payments details.'
                    : 'Export packages Stellar ledger valuation summary, USDC inflows & outflows overview, trade logs history, and opening cost basis adjustments.'}
                </p>
              </div>

              <button
                onClick={handleStart}
                disabled={selectedMode === 'custom' && (!fromDate || !toDate)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand text-white font-bold text-xs rounded-xl shadow-md transition hover:brightness-110 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Download size={14} />
                Generate Excel Report
              </button>
            </div>
          ) : (
            /* Mode 2: Export Progress Stepper */
            <div className="space-y-6">
              {error ? (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                    <AlertCircle size={26} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-primary">Export Failed</h4>
                    <p className="text-xs text-muted max-w-xs">{error}</p>
                  </div>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="mt-2 px-4 py-2 bg-brand text-white font-bold text-xs rounded-xl shadow transition hover:brightness-110 active:scale-95 cursor-pointer"
                    >
                      Retry Statement Export
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {steps.map((step, index) => {
                    const stepNum = index + 1;
                    const isCompleted =
                      currentStep > stepNum || (currentStep === maxSteps && stepNum === maxSteps);
                    const isActive = currentStep === stepNum && currentStep !== maxSteps;

                    return (
                      <div
                        key={stepNum}
                        className={`flex items-start gap-4.5 p-3 rounded-xl border transition-all duration-300 ${
                          isActive
                            ? 'bg-brand/5 border-brand/20 shadow-sm'
                            : isCompleted
                              ? 'bg-emerald-500/5 border-emerald-500/10'
                              : 'border-transparent opacity-60'
                        }`}
                      >
                        {/* Step Icon Indicator */}
                        <div className="flex-shrink-0 mt-0.5">
                          {isCompleted ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                              <Check size={12} className="stroke-[3]" />
                            </div>
                          ) : isActive ? (
                            <div className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center shadow">
                              <Loader2 size={12} className="animate-spin" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-color flex items-center justify-center text-xs font-semibold text-muted bg-primary">
                              {stepNum}
                            </div>
                          )}
                        </div>

                        {/* Step Description */}
                        <div className="space-y-0.5">
                          <h4
                            className={`text-xs font-bold leading-tight ${
                              isActive
                                ? 'text-brand font-extrabold'
                                : isCompleted
                                  ? 'text-emerald-500'
                                  : 'text-primary'
                            }`}
                          >
                            {step.label}
                          </h4>
                          <p className="text-[10.5px] text-muted leading-relaxed">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-secondary px-6 py-4 border-t border-color flex justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={currentStep > 0 && currentStep < maxSteps && !error}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer ${
              currentStep === maxSteps
                ? 'bg-emerald-500 text-white shadow hover:brightness-110'
                : 'bg-primary border border-color text-muted hover:text-primary hover:bg-hover'
            }`}
          >
            {currentStep === maxSteps ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
