import { useState } from 'react';

import type { OrderTypeEnum } from '../../../types/trading.types';

export type TimeInForceOption = 'GTT' | 'IOC' | 'FOK';
export type GoodTilUnit = 'minutes' | 'hours' | 'days' | 'weeks';

interface AdvancedOptionsProps {
  orderType: OrderTypeEnum;
  timeInForce: TimeInForceOption;
  goodTilValue: number;
  goodTilUnit: GoodTilUnit;
  postOnly: boolean;
  reduceOnly: boolean;
  onTimeInForceChange: (tif: TimeInForceOption) => void;
  onGoodTilValueChange: (value: number) => void;
  onGoodTilUnitChange: (unit: GoodTilUnit) => void;
  onPostOnlyChange: (checked: boolean) => void;
  onReduceOnlyChange: (checked: boolean) => void;
}

// Define as constants for runtime checks
const CONDITIONAL_TYPES = [
  'STOP_MARKET',
  'STOP_LIMIT',
  'TAKE_PROFIT_MARKET',
  'TAKE_PROFIT_LIMIT',
] as const;

export const AdvancedOptions: React.FC<AdvancedOptionsProps> = ({
  orderType,
  timeInForce,
  goodTilValue,
  goodTilUnit,
  postOnly,
  reduceOnly,
  onTimeInForceChange,
  onGoodTilValueChange,
  onGoodTilUnitChange,
  onPostOnlyChange,
  onReduceOnlyChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isLimit = orderType === 'LIMIT';
  const isConditional = CONDITIONAL_TYPES.includes(orderType as any);

  return (
    <div className="px-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-xs text-gray-400 hover:text-white transition-colors"
      >
        <span>Advanced</span>
        <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3 pb-2 px-1">
          {/* Time In Force Selector */}
          {isLimit && (
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Time In Force</label>
              <div className="relative">
                <select
                  value={timeInForce}
                  onChange={e => onTimeInForceChange(e.target.value as TimeInForceOption)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white appearance-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all cursor-pointer"
                >
                  <option value="GTT">Good Til Time (GTT)</option>
                  <option value="IOC">Immediate or Cancel (IOC)</option>
                  <option value="FOK">Fill or Kill (FOK)</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Good Til Time Input */}
          {((isLimit && timeInForce === 'GTT') || isConditional) && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Good Til Time</label>
                <span className="text-[10px] text-gray-600 font-medium">Max: {isConditional ? '94d' : '28d'}</span>
              </div>
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <div className="relative group">
                  <input
                    type="number"
                    min="1"
                    value={goodTilValue}
                    onChange={e => onGoodTilValueChange(parseInt(e.target.value) || 1)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-3 pr-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder-gray-600"
                    placeholder="Duration"
                  />
                </div>
                <div className="relative">
                  <select
                    value={goodTilUnit}
                    onChange={e => onGoodTilUnitChange(e.target.value as GoodTilUnit)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-3 pr-8 py-2 text-xs text-white appearance-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all cursor-pointer"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1L5 5L9 1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Execution Options */}
          <div className="pt-1 space-y-2">
            {/* Post-Only */}
            {isLimit && (
              <label
                className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${postOnly
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-gray-900/30 border-gray-800 hover:border-gray-700'
                  } ${reduceOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={postOnly}
                    onChange={e => onPostOnlyChange(e.target.checked)}
                    className="peer appearance-none w-4 h-4 rounded border border-gray-600 bg-gray-800 checked:bg-blue-500 checked:border-blue-500 transition-colors"
                    disabled={reduceOnly}
                  />
                  <svg className="absolute w-2.5 h-2.5 text-white left-[3px] top-[3.5px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" viewBox="0 0 12 12" fill="none"><path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-medium ${postOnly ? 'text-blue-200' : 'text-gray-300'}`}>Post-Only</span>
                  {reduceOnly && <span className="text-[10px] text-gray-500">Disabled with reduce-only</span>}
                </div>
              </label>
            )}

            {/* Reduce-Only - Hidden for Market Orders */}
            {orderType !== 'MARKET' && (
              <label
                className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${reduceOnly
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-gray-900/30 border-gray-800 hover:border-gray-700'
                  }`}
              >
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={reduceOnly}
                    onChange={(e) => onReduceOnlyChange(e.target.checked)}
                    className="peer appearance-none w-4 h-4 rounded border border-gray-600 bg-gray-800 checked:bg-blue-500 checked:border-blue-500 transition-colors"
                  />
                  <svg className="absolute w-2.5 h-2.5 text-white left-[3px] top-[3.5px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" viewBox="0 0 12 12" fill="none"><path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <span className={`text-xs font-medium ${reduceOnly ? 'text-blue-200' : 'text-gray-300'}`}>Reduce-Only</span>
              </label>
            )}
          </div>

          {/* Info Text */}
          {reduceOnly && isLimit && timeInForce === 'GTT' && (
            <div className="flex items-center gap-2 text-[10px] text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
              <span>⚠</span>
              <span>Reduce-only orders will use IOC</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
