import { useState } from 'react';

import type { OrderTypeEnum } from '../../../types/trading.types';
import { validateNumberInput } from '../../../utils/inputValidation';

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
          {isLimit && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2 ml-1">
                Time In Force
              </label>
              <div className="relative">
                <select
                  value={timeInForce}
                  onChange={e => onTimeInForceChange(e.target.value as TimeInForceOption)}
                  className="w-full bg-primary border border-color rounded-xl px-4 py-3 text-sm text-primary placeholder-muted focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm appearance-none cursor-pointer"
                >
                  <option value="GTT">Good Til Time (GTT)</option>
                  <option value="IOC">Immediate or Cancel (IOC)</option>
                  <option value="FOK">Fill or Kill (FOK)</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 1L5 5L9 1"
                      stroke="#6B7280"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {((isLimit && timeInForce === 'GTT') || isConditional) && (
            <div className="space-y-1.5 animate-fade-in">
              <div className="flex justify-between items-center mb-2 ml-1">
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider">
                  Good Til Time
                </label>
                <span className="text-[10px] text-gray-600 font-medium">
                  Max: 95d
                </span>
              </div>
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <div className="relative group">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={goodTilValue}
                    onChange={e => onGoodTilValueChange(parseInt(validateNumberInput(e.target.value)) || 1)}
                    className="w-full bg-primary border border-color rounded-xl pl-4 pr-2 py-3 text-sm text-primary placeholder-muted focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm"
                    placeholder="Duration"
                  />
                </div>
                <div className="relative">
                  <select
                    value={goodTilUnit}
                    onChange={e => onGoodTilUnitChange(e.target.value as GoodTilUnit)}
                    className="w-full bg-primary border border-color rounded-xl pl-4 pr-8 py-3 text-sm text-primary placeholder-muted focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm appearance-none cursor-pointer"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg
                      width="10"
                      height="6"
                      viewBox="0 0 10 6"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1 1L5 5L9 1"
                        stroke="#6B7280"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="pt-1 space-y-2">
            {isLimit && (
              <label
                className={`flex items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer ${postOnly
                  ? 'bg-brand-primary/10 border-brand-primary/30'
                  : 'bg-primary border-color hover:border-brand-primary/50 text-secondary'
                  } ${reduceOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={postOnly}
                    onChange={e => onPostOnlyChange(e.target.checked)}
                    className="peer appearance-none w-4 h-4 rounded border border-color bg-tertiary checked:bg-brand-primary checked:border-brand-primary transition-colors"
                    disabled={reduceOnly}
                  />
                  <svg
                    className="absolute w-2.5 h-2.5 text-white left-[3px] top-[3.5px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M10 3L4.5 8.5L2 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-sm font-medium ${postOnly ? 'text-brand-primary' : 'text-primary'}`}
                  >
                    Post-Only
                  </span>
                  {reduceOnly && (
                    <span className="text-[10px] text-gray-500">Disabled with reduce-only</span>
                  )}
                </div>
              </label>
            )}

            {orderType !== 'MARKET' && (
              <label
                className={`flex items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer ${reduceOnly
                  ? 'bg-brand-primary/10 border-brand-primary/30'
                  : 'bg-primary border-color hover:border-brand-primary/50 text-secondary'
                  }`}
              >
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={reduceOnly}
                    onChange={e => onReduceOnlyChange(e.target.checked)}
                    className="peer appearance-none w-4 h-4 rounded border border-color bg-tertiary checked:bg-brand-primary checked:border-brand-primary transition-colors"
                  />
                  <svg
                    className="absolute w-2.5 h-2.5 text-white left-[3px] top-[3.5px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M10 3L4.5 8.5L2 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span
                  className={`text-sm font-medium ${reduceOnly ? 'text-brand-primary' : 'text-primary'}`}
                >
                  Reduce-Only
                </span>
              </label>
            )}
          </div>

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
