import {
  BarChart3,
  CandlestickChart,
  Check,
  ChevronDown,
  Download,
  Maximize2,
  Minimize2,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { indicatorRegistry } from 'lightweight-charts-indicators';

import { TIMEFRAMES } from '../constants/toolCategories';
import type { ActiveIndicator, ChartType } from '../types';
import { type CandleResolution } from '../types';

interface TimeframeSelectorProps {
  value: CandleResolution;
  onChange: (v: CandleResolution) => void;
}

const TimeframeSelector = memo(function TimeframeSelector({
  value,
  onChange,
}: TimeframeSelectorProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = TIMEFRAMES.find(t => t.value === value)?.label || value;

  return (
    <div className="relative flex-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 hover:bg-hover rounded-md transition-colors min-h-[40px] text-primary font-medium text-xs sm:text-[13px]"
      >
        {selectedLabel}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : 'text-gray-400'}`}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[140px] z-50">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.value}
                onClick={() => {
                  onChange(tf.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-hover transition-colors flex items-center justify-between ${
                  value === tf.value ? 'bg-hover text-brand font-medium' : 'text-primary'
                }`}
              >
                <span>{tf.label}</span>
                {value === tf.value && <Check className="w-3.5 h-3.5 text-brand" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// Chart type dropdown
const CHART_TYPES: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  { value: 'candlestick', label: 'Candles', icon: <CandlestickChart className="w-4 h-4" /> },
  { value: 'line', label: 'Line', icon: <TrendingUp className="w-4 h-4" /> },
  { value: 'area', label: 'Area', icon: <BarChart3 className="w-4 h-4" /> },
];

interface ChartTypeDropdownProps {
  value: ChartType;
  open: boolean;
  onToggle: () => void;
  onSelect: (v: ChartType) => void;
}

const ChartTypeDropdown = memo(function ChartTypeDropdown({
  value,
  open,
  onToggle,
  onSelect,
}: ChartTypeDropdownProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-1.5 py-1 hover:bg-hover rounded-md transition-colors min-w-[36px] min-h-[40px] justify-center text-gray-400 hover:text-primary"
        title={`Chart Type: ${value}`}
      >
        {CHART_TYPES.find(c => c.value === value)?.icon}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute top-full left-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[140px] z-50">
            {CHART_TYPES.map(ct => (
              <button
                key={ct.value}
                onClick={() => onSelect(ct.value)}
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-hover transition-colors flex items-center gap-2 ${
                  value === ct.value ? 'bg-hover text-brand font-medium' : 'text-primary'
                }`}
              >
                {ct.icon}
                <span>{ct.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// ---- Indicator picker ----
interface IndicatorPickerProps {
  open: boolean;
  onToggle: () => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  activeIndicators: ActiveIndicator[];
  onToggleIndicator: (registryId: string, instanceId: string | null) => void;
}

const IndicatorPicker = memo(function IndicatorPicker({
  open,
  onToggle,
  searchQuery,
  onSearchChange,
  activeIndicators,
  onToggleIndicator,
}: IndicatorPickerProps) {
  const sortedIndicators = useMemo(
    () => [...indicatorRegistry].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );
  const filteredIndicators = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return sortedIndicators;
    return sortedIndicators.filter(
      ind =>
        ind.name.toLowerCase().includes(query) ||
        ind.shortName.toLowerCase().includes(query) ||
        (ind.description && ind.description.toLowerCase().includes(query))
    );
  }, [sortedIndicators, searchQuery]);

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center justify-center px-1.5 py-1 hover:bg-hover rounded-md transition-colors min-h-[40px] min-w-[36px] text-gray-400 hover:text-primary"
        title="Indicators"
      >
        <span className="text-xs font-semibold flex items-center">
          <span className="italic font-serif text-[15px] select-none">ƒ</span>x
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-20 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm pointer-events-auto select-none animate-fade-in">
          <div className="fixed inset-0 cursor-default" onClick={onToggle} />
          <div className="bg-secondary w-full sm:max-w-[460px] shadow-2xl pt-5 pb-8 sm:pb-5 relative text-primary flex flex-col h-[85vh] sm:h-[520px] sm:max-h-[85vh] z-10 pointer-events-auto rounded-t-3xl sm:rounded-xl">
            <div className="flex items-center justify-between pb-3 px-4 mb-2">
              <span className="text-sm font-bold uppercase tracking-wider text-primary">
                Indicators
              </span>
              <button
                onClick={onToggle}
                className="p-1 hover:bg-hover rounded-md text-gray-400 hover:text-primary transition-colors"
                title="Close Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 relative w-full">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search indicators..."
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                className="w-full bg-primary text-sm border border-gray-600 border-l-0 border-r-0 pl-10 pr-3.5 py-3 focus:outline-none focus:border-gray-600 placeholder-gray-500 text-primary"
                autoFocus
              />
            </div>
            <div className="text-sm uppercase tracking-wider text-muted/60 font-bold mb-2 px-4">
              Script Name
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-0.5 px-4">
              {filteredIndicators.map(ind => {
                const firstActive = activeIndicators.find(a => a.indicatorId === ind.id);
                const isActive = !!firstActive;
                return (
                  <button
                    key={ind.id}
                    onClick={() => onToggleIndicator(ind.id, firstActive?.instanceId ?? null)}
                    className={`w-full px-3.5 py-2 hover:bg-hover text-left text-xs transition-colors flex items-center justify-between rounded-md group ${
                      isActive ? 'bg-brand/5' : ''
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 max-w-[85%]">
                      <span
                        className={`truncate text-left font-semibold ${
                          isActive ? 'text-brand' : 'text-primary group-hover:text-brand'
                        }`}
                      >
                        {ind.name}
                      </span>
                      {ind.description && (
                        <span className="text-[10px] text-muted/50 font-normal line-clamp-1 truncate text-left">
                          {ind.description}
                        </span>
                      )}
                    </div>
                    {isActive && <Check className="w-4 h-4 text-brand shrink-0" />}
                  </button>
                );
              })}

              {filteredIndicators.length === 0 && (
                <div className="text-center py-12 text-xs text-muted/50">
                  No indicators match your search.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ---- Settings dropdown ----
interface SettingsDropdownProps {
  open: boolean;
  onToggle: () => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showCrosshair: boolean;
  onToggleCrosshair: () => void;
}

const SettingsDropdown = memo(function SettingsDropdown({
  open,
  onToggle,
  showVolume,
  onToggleVolume,
  showGrid,
  onToggleGrid,
  showCrosshair,
  onToggleCrosshair,
}: SettingsDropdownProps) {
  const renderToggleRow = (
    label: string,
    value: boolean,
    onToggleFn: () => void,
    dotColor: string
  ) => (
    <div className="w-full px-4 py-2.5 hover:bg-hover transition-colors flex items-center justify-between group">
      <button
        onClick={onToggleFn}
        className="flex-1 text-left text-xs flex items-center justify-between text-primary pr-2"
      >
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          {label}
        </span>
        <div
          className={`w-9 h-5 rounded-full transition-colors ${
            value ? 'bg-brand' : 'bg-gray-600'
          } relative shrink-0`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
              value ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </div>
      </button>
    </div>
  );

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center justify-center px-1.5 py-1 hover:bg-hover rounded-md transition-colors min-h-[40px] min-w-[36px] text-gray-400 hover:text-primary"
        title="Display Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute top-full right-0 mt-1 bg-secondary rounded-lg shadow-xl border border-color py-1 min-w-[160px] z-50">
            {renderToggleRow('Volume', showVolume, onToggleVolume, 'bg-gray-400')}
            {renderToggleRow('Grid', showGrid, onToggleGrid, 'bg-gray-400')}
            {renderToggleRow('Crosshair', showCrosshair, onToggleCrosshair, 'bg-gray-400')}
          </div>
        </>
      )}
    </div>
  );
});

//  Main ChartHeader
export interface ChartHeaderProps {
  timeframe: CandleResolution;
  onTimeframeChange: (v: CandleResolution) => void;
  chartType: ChartType;
  showChartTypeMenu: boolean;
  onToggleChartTypeMenu: () => void;
  onSelectChartType: (v: ChartType) => void;
  showIndicatorMenu: boolean;
  onToggleIndicatorMenu: () => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  activeIndicators: ActiveIndicator[];
  onToggleIndicator: (registryId: string, instanceId: string | null) => void;
  showSettingsMenu: boolean;
  onToggleSettingsMenu: () => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showCrosshair: boolean;
  onToggleCrosshair: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onDownload: () => void;
  isMobile: boolean;
  activeChartTab?: 'price' | 'depth' | 'details';
  onChartTabChange?: (tab: 'price' | 'depth' | 'details') => void;
}

export const ChartHeader = memo(function ChartHeader(props: ChartHeaderProps) {
  const {
    timeframe,
    onTimeframeChange,
    chartType,
    showChartTypeMenu,
    onToggleChartTypeMenu,
    onSelectChartType,
    showIndicatorMenu,
    onToggleIndicatorMenu,
    searchQuery,
    onSearchChange,
    activeIndicators,
    onToggleIndicator,
    showSettingsMenu,
    onToggleSettingsMenu,
    showVolume,
    onToggleVolume,
    showGrid,
    onToggleGrid,
    showCrosshair,
    onToggleCrosshair,
    isFullscreen,
    onToggleFullscreen,
    onDownload,
    isMobile,
    activeChartTab,
    onChartTabChange,
  } = props;

  return (
    <div
      className={`relative z-50 bg-secondary  flex-shrink-0 ${isFullscreen ? 'safe-area-top' : ''}`}
    >
      <div className="flex items-center justify-between px-2 ">
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
        <div className="flex items-center gap-0.5 sm:gap-1 px-1 shrink-0">
          <div className="w-px h-3.5 bg-color opacity-60 mx-1.5" />
          <ChartTypeDropdown
            value={chartType}
            open={showChartTypeMenu}
            onToggle={onToggleChartTypeMenu}
            onSelect={onSelectChartType}
          />
          <div className="w-px h-3.5 bg-color opacity-60 mx-1.5" />
          <IndicatorPicker
            open={showIndicatorMenu}
            onToggle={onToggleIndicatorMenu}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            activeIndicators={activeIndicators}
            onToggleIndicator={onToggleIndicator}
          />
          <div className="w-px h-3.5 bg-color opacity-60 mx-1.5" />
          <SettingsDropdown
            open={showSettingsMenu}
            onToggle={onToggleSettingsMenu}
            showVolume={showVolume}
            onToggleVolume={onToggleVolume}
            showGrid={showGrid}
            onToggleGrid={onToggleGrid}
            showCrosshair={showCrosshair}
            onToggleCrosshair={onToggleCrosshair}
          />
          <div className="w-px h-3.5 bg-color opacity-60 mx-1.5" />

          {activeChartTab && onChartTabChange && (
            <div className="flex items-center gap-3 mr-2 ml-2 text-[11px] text-muted">
              <button
                onClick={() => onChartTabChange('price')}
                className={`transition-colors hover:text-primary ${activeChartTab === 'price' ? 'text-primary font-medium' : ''}`}
              >
                Chart
              </button>
              <button
                onClick={() => onChartTabChange('depth')}
                className={`transition-colors hover:text-primary ${activeChartTab === 'depth' ? 'text-primary font-medium' : ''}`}
              >
                Depth
              </button>
              <button
                onClick={() => onChartTabChange('details')}
                className={`transition-colors hover:text-primary ${activeChartTab === 'details' ? 'text-primary font-medium' : ''}`}
              >
                Details
              </button>
            </div>
          )}

          {!isMobile && (
            <>
              <button
                onClick={onDownload}
                className="p-1.5 hover:bg-hover rounded-md transition-colors hidden sm:flex items-center justify-center min-w-[36px] min-h-[40px]"
                title="Download Chart"
              >
                <Download className="w-4 h-4 text-gray-400" />
              </button>
              <div className="w-px h-3.5 bg-color opacity-60 mx-1.5" />
            </>
          )}
          <button
            onClick={onToggleFullscreen}
            className="p-1 sm:p-1.5 hover:bg-hover rounded-md transition-colors flex items-center justify-center min-w-[36px] min-h-[40px]"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              isMobile ? (
                <X className="w-4 h-4 text-gray-400" />
              ) : (
                <Minimize2 className="w-4 h-4 text-gray-400" />
              )
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
