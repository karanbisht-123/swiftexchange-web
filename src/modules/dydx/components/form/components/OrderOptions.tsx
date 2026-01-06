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
        <div className="mt-3 space-y-3 pb-2">
          {/* Time In Force Selector - Only for Limit Orders */}
          {isLimit && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Time In Force</label>
              <select
                value={timeInForce}
                onChange={e => onTimeInForceChange(e.target.value as TimeInForceOption)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-600"
              >
                <option value="GTT">Good Til Time</option>
                <option value="IOC">Immediate or Cancel</option>
                <option value="FOK">Fill or Kill</option>
              </select>
            </div>
          )}

          {/* Good Til Time Input - For GTT Limit Orders and Conditional Orders */}
          {((isLimit && timeInForce === 'GTT') || isConditional) && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Good Til Time</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={goodTilValue}
                  onChange={e => onGoodTilValueChange(parseInt(e.target.value) || 1)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-600"
                />
                <select
                  value={goodTilUnit}
                  onChange={e => onGoodTilUnitChange(e.target.value as GoodTilUnit)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-600"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {isConditional ? 'Max: 94 days' : 'Max: 28 days'}
              </div>
            </div>
          )}

          {/* Order Execution Options */}
          <div className="flex flex-col gap-2">
            {/* Post-Only - Only for Limit Orders */}
            {isLimit && (
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={postOnly}
                  onChange={e => onPostOnlyChange(e.target.checked)}
                  className="rounded w-4 h-4"
                  disabled={reduceOnly}
                />
                <span className={reduceOnly ? 'opacity-50' : ''}>Post-Only</span>
                {reduceOnly && (
                  <span className="text-xs text-gray-500">(disabled with reduce-only)</span>
                )}
              </label>
            )}

            {/* Reduce-Only - Available for all order types */}
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={reduceOnly}
                onChange={e => onReduceOnlyChange(e.target.checked)}
                className="rounded w-4 h-4"
              />
              <span>Reduce-Only</span>
            </label>
          </div>

          {/* Info Text */}
          {reduceOnly && isLimit && timeInForce === 'GTT' && (
            <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded px-2 py-1">
              ⚠ Reduce-only orders will automatically use IOC time-in-force
            </div>
          )}
        </div>
      )}
    </div>
  );
};
