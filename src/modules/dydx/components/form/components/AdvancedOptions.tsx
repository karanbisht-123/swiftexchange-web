import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { Tooltip } from '../../../../../components/common/Tooltip';
import type { OrderTypeEnum } from '../../../types/trading.types';
import { validateNumberInput } from '../../../utils/inputValidation';

export type TimeInForceOption = 'GTT' | 'IOC';
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
  const isConditional = CONDITIONAL_TYPES.includes(orderType as (typeof CONDITIONAL_TYPES)[number]);
  const isLimitLike =
    orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'TAKE_PROFIT_LIMIT';
  const isMarketConditional = orderType === 'STOP_MARKET' || orderType === 'TAKE_PROFIT_MARKET';

  return (
    <div className="px-1 lg:px-3 mt-4">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 w-full cursor-pointer group mb-2"
      >
        <span className="text-xs font-semibold text-muted group-hover:text-primary transition-colors">
          Advanced
        </span>
        <div className="flex-1 h-px bg-color" />
        <span className="text-muted group-hover:text-primary transition-colors">
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3 pb-2 ">
          <div className="flex gap-2 animate-fade-in w-full">
            {(isLimit || isConditional) && (
              <div className="flex-1 bg-primary border border-color rounded-xl p-2.5 relative">
                <label className="block text-[10px] font-medium text-muted mb-0.5 ml-0.5">
                  Time In Force
                </label>
                <div className="relative flex items-center">
                  <select
                    value={timeInForce}
                    onChange={e => onTimeInForceChange(e.target.value as TimeInForceOption)}
                    className="w-full bg-transparent text-sm text-primary font-medium focus:outline-none appearance-none cursor-pointer pl-0.5 pr-6"
                  >
                    {!isMarketConditional && <option value="GTT">Good Til Time</option>}
                    <option value="IOC">Immediate or Cancel</option>
                  </select>
                  <div className="absolute right-1 pointer-events-none">
                    <svg
                      width="8"
                      height="5"
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

            {(isLimit || isConditional) && timeInForce === 'GTT' && (
              <div className="flex-1 bg-primary border border-color rounded-xl p-2.5 relative">
                <label className="block text-[10px] font-medium text-muted mb-0.5 ml-0.5">
                  Time
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={goodTilValue}
                    onChange={e =>
                      onGoodTilValueChange(parseInt(validateNumberInput(e.target.value)) || 1)
                    }
                    className="flex-1 min-w-[30px] w-full bg-transparent text-sm text-primary font-medium focus:outline-none pl-0.5 pr-1"
                  />
                  <div className="relative shrink-0 bg-tertiary rounded-md px-2 py-1 flex items-center border border-color ml-1">
                    <select
                      value={goodTilUnit}
                      onChange={e => onGoodTilUnitChange(e.target.value as GoodTilUnit)}
                      className="bg-transparent text-xs text-primary font-medium focus:outline-none appearance-none cursor-pointer pr-4"
                    >
                      <option value="minutes">Mins</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                    </select>
                    <div className="absolute right-1.5 pointer-events-none">
                      <svg
                        width="6"
                        height="4"
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
          </div>

          <div className="pt-2 flex flex-col gap-3">
            {orderType !== 'MARKET' && (
              <label className={`flex items-center gap-2 cursor-pointer group w-fit`}>
                <div className="relative flex items-center justify-center w-5 h-5 rounded-md border border-color bg-primary group-hover:border-brand-primary transition-colors">
                  <input
                    type="checkbox"
                    checked={reduceOnly}
                    onChange={e => onReduceOnlyChange(e.target.checked)}
                    className="peer absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="absolute inset-0 bg-brand-primary rounded-md opacity-0 peer-checked:opacity-100 transition-opacity" />
                  <svg
                    className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity z-10"
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
                <Tooltip
                  content="Reduce-Only is only available if Time in Force is set to IOC."
                  position="top"
                >
                  <span
                    className={`text-xs ml-0.5 transition-colors ${reduceOnly ? 'text-primary font-semibold text-[13px]' : 'text-muted group-hover:text-primary font-medium'}`}
                  >
                    Reduce-Only
                  </span>
                </Tooltip>
              </label>
            )}

            {isLimitLike && (
              <label className="flex items-center gap-2 cursor-pointer group w-fit">
                <div
                  className={`relative flex items-center justify-center w-5 h-5 rounded-md border border-color bg-primary group-hover:border-brand-primary transition-colors ${reduceOnly || timeInForce === 'IOC' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={postOnly}
                    onChange={e => onPostOnlyChange(e.target.checked)}
                    disabled={reduceOnly || timeInForce === 'IOC'}
                    className="peer absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="absolute inset-0 bg-brand-primary rounded-md opacity-0 peer-checked:opacity-100 transition-opacity" />
                  <svg
                    className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity z-10"
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
                <Tooltip
                  content={
                    reduceOnly
                      ? 'Post-Only cannot be combined with Reduce-Only.'
                      : timeInForce === 'IOC'
                        ? 'Post-Only is not available with IOC execution.'
                        : 'Post-Only ensures your order is placed as a maker order only.'
                  }
                  position="top"
                >
                  <span
                    className={`text-xs ml-0.5 transition-colors ${postOnly ? 'text-primary font-semibold text-[13px]' : 'text-muted group-hover:text-primary font-medium'} ${reduceOnly || timeInForce === 'IOC' ? 'opacity-50' : ''}`}
                  >
                    Post-Only
                  </span>
                </Tooltip>
              </label>
            )}
          </div>

          {reduceOnly && (isLimit || isConditional) && timeInForce === 'GTT' && (
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
