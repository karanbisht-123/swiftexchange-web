import { ChevronLeft, ChevronRight, Eye, EyeOff, Settings, X } from 'lucide-react';
import { memo } from 'react';

import { indicatorRegistry } from 'lightweight-charts-indicators';

import type { ActiveIndicator, LegendData, ThemeColors } from '../types';
import { findAt, formatNum } from '../utils/candles';

export interface LegendProps {
  legend: LegendData | null;
  market: string;
  timeframe: string;
  colors: ThemeColors;
  activeIndicators: ActiveIndicator[];
  indicatorResults: Map<string, any>;
  indicatorResultsVersion: number;
  showIndicatorPills: boolean;
  onTogglePills: () => void;
  onToggleVisibility: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  leftOffset: number;
}

const tfMap: Record<string, string> = {
  '1MIN': '1m',
  '5MINS': '5m',
  '15MINS': '15m',
  '30MINS': '30m',
  '1HOUR': '1H',
  '4HOURS': '4H',
  '1DAY': '1D',
};

export const Legend = memo(function Legend({
  legend,
  market,
  timeframe,
  colors,
  activeIndicators,
  indicatorResults,
  showIndicatorPills,
  onTogglePills,
  onToggleVisibility,
  onEdit,
  onRemove,
  leftOffset,
}: LegendProps) {
  if (!legend) return null;
  const changeColor = legend.change >= 0 ? colors.upColor : colors.downColor;
  const tfLabel = tfMap[timeframe] || timeframe;

  return (
    <div
      className="absolute z-10 top-2 pointer-events-none flex flex-col gap-y-0.5 items-start text-left select-none"
      style={{ left: leftOffset }}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 pointer-events-none leading-normal text-[10.5px] text-gray-300 font-medium">
        <span className="text-[11px] font-bold text-primary mr-0.5 shrink-0">{market}</span>
        <span className="text-[10px] text-gray-500 shrink-0 select-none opacity-50">•</span>
        <span className="text-[10.5px] font-semibold text-primary shrink-0">{tfLabel}</span>
        <span className="text-[10px] text-gray-500 shrink-0 select-none opacity-50">•</span>

        <div className="flex flex-wrap items-center gap-x-1.5 font-mono text-[10px]">
          <span className="flex items-center shrink-0">
            <span className="text-gray-400 font-sans mr-0.5 select-none">O</span>
            <span className="font-semibold text-primary">{formatNum(legend.open)}</span>
          </span>
          <span className="flex items-center shrink-0">
            <span className="text-gray-400 font-sans mr-0.5 select-none">H</span>
            <span className="font-semibold text-primary">{formatNum(legend.high)}</span>
          </span>
          <span className="flex items-center shrink-0">
            <span className="text-gray-400 font-sans mr-0.5 select-none">L</span>
            <span className="font-semibold text-primary">{formatNum(legend.low)}</span>
          </span>
          <span className="flex items-center shrink-0">
            <span className="text-gray-400 font-sans mr-0.5 select-none">C</span>
            <span className="font-semibold text-primary">{formatNum(legend.close)}</span>
          </span>
          <span style={{ color: changeColor }} className="font-bold ml-1 shrink-0 font-sans">
            {legend.change >= 0 ? '+' : ''}
            {formatNum(legend.change, 2)} ({legend.changePct >= 0 ? '+' : ''}
            {formatNum(legend.changePct, 2)}%)
          </span>
        </div>
      </div>

      {activeIndicators.length > 0 && (
        <button
          onClick={onTogglePills}
          className="flex items-center gap-0.5 hover:bg-hover/50 px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-bold text-muted hover:text-primary pointer-events-auto transition-colors shrink-0 mt-0.5 cursor-pointer"
          title={showIndicatorPills ? 'Collapse indicators legend' : 'Expand indicators legend'}
        >
          {showIndicatorPills ? (
            <>
              <ChevronLeft className="w-2.5 h-2.5" />
              <span>Hide ({activeIndicators.length})</span>
            </>
          ) : (
            <>
              <ChevronRight className="w-2.5 h-2.5" />
              <span>Show ({activeIndicators.length})</span>
            </>
          )}
        </button>
      )}

      {showIndicatorPills &&
        activeIndicators.map(active => {
          const entry = indicatorRegistry.find(ind => ind.id === active.indicatorId);
          if (!entry) return null;
          const result = indicatorResults.get(active.instanceId);
          const inputVals = Object.values(active.inputs).join(',');

          let valueText = '';
          if (result) {
            const lastTime = legend.time;
            const marker = (result.markers as any[])?.find(m => m.time === lastTime);

            if (entry.group === 'candlestick') {
              valueText = marker ? marker.text || 'Pattern' : '';
            } else {
              const vals = (entry.plotConfig || [])
                .map(plot => {
                  const arr = result.plots?.[plot.id] || [];
                  const pt = findAt(arr, lastTime);
                  return pt ? `${plot.title || plot.id}: ${formatNum(pt.value)}` : '';
                })
                .filter(v => v !== '');

              if (entry.plotCandleConfig && result.candles) {
                entry.plotCandleConfig.forEach(pc => {
                  const arr = result.candles[pc.id] || [];
                  const cd = arr.find((c: any) => c.time === lastTime);
                  if (cd) {
                    vals.push(
                      `${pc.title || pc.id} (O: ${formatNum(cd.open)} H: ${formatNum(
                        cd.high
                      )} L: ${formatNum(cd.low)} C: ${formatNum(cd.close)})`
                    );
                  }
                });
              }

              valueText = vals.join(' | ');
              if (marker && marker.text) {
                valueText = `${marker.text}${valueText ? ` | ${valueText}` : ''}`;
              }
            }
          }

          const isHidden = active.visible === false;
          return (
            <div
              key={active.instanceId}
              className={`flex items-center flex-nowrap gap-1 text-[8.5px] sm:text-[9.5px] font-semibold pointer-events-auto transition-opacity group w-[250px] sm:w-[400px] ${
                isHidden ? 'opacity-40' : 'opacity-80 hover:opacity-100'
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: active.color }}
              />
              <span className="text-muted/80 font-normal text-[8px] sm:text-[9px] shrink-0 whitespace-nowrap">
                {entry.shortName || entry.name}({inputVals}):
              </span>
              <span className="font-mono font-medium text-[8px] sm:text-[9px] text-primary truncate mr-1.5 drop-shadow-none dark:drop-shadow-md">
                {valueText || '-'}
              </span>

              {/* Eyeball, settings and delete buttons — visible on hover of group only */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
                <button
                  onClick={() => onToggleVisibility(active.instanceId)}
                  className="p-0.5 rounded transition-colors text-muted hover:text-primary hover:bg-hover/40 shrink-0"
                  title={isHidden ? `Show ${entry.name}` : `Hide ${entry.name}`}
                >
                  {isHidden ? (
                    <EyeOff className="w-2.5 h-2.5 text-red-400" />
                  ) : (
                    <Eye className="w-2.5 h-2.5" />
                  )}
                </button>
                <button
                  onClick={() => onEdit(active.instanceId)}
                  className="p-0.5 rounded transition-colors text-muted hover:text-primary hover:bg-hover/40 shrink-0"
                  title={`Configure ${entry.name}`}
                >
                  <Settings className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={() => onRemove(active.instanceId)}
                  className="p-0.5 rounded transition-colors text-muted hover:text-red-500 hover:bg-hover/40 shrink-0"
                  title={`Remove ${entry.name}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          );
        })}
    </div>
  );
});
