import { ChevronDown } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface OrderInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  currency?: string;
  currencyOptions?: string[];
  onCurrencyChange?: (currency: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  onBboClick?: () => void;
  triggerOption?: string;
  onTriggerOptionChange?: (opt: string) => void;
  triggerOptions?: string[];
}

export const OrderInput: React.FC<OrderInputProps> = ({
  label,
  value,
  onChange,
  currency,
  currencyOptions,
  onCurrencyChange,
  placeholder = '0.00',
  error,
  disabled,
  onBboClick,
  triggerOption,
  onTriggerOptionChange,
  triggerOptions,
}) => {
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isTriggerOpen, setIsTriggerOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) {
        setIsCurrencyOpen(false);
      }
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsTriggerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      className={`relative flex items-center h-[38px] px-3 bg-tertiary border rounded-md transition-colors ${
        error
          ? 'border-danger/80 bg-danger/[0.04]'
          : 'border-color hover:border-border-dark focus-within:border-brand'
      }`}
    >
      <span className="text-[12px] text-secondary shrink-0 font-normal select-none mr-2">
        {label}
      </span>

      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => {
          const val = e.target.value;
          if (val === '' || /^\d*\.?\d*$/.test(val)) {
            onChange(val);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-transparent text-primary text-[13px] font-medium outline-none placeholder:text-muted disabled:cursor-not-allowed"
      />

      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        {onBboClick && (
          <button
            type="button"
            onClick={onBboClick}
            className="px-1.5 py-0.5 rounded bg-hover text-[10px] font-semibold text-secondary hover:text-primary transition-colors"
            title="Set to Best Bid/Offer"
          >
            BBO
          </button>
        )}

        {triggerOptions && triggerOptions.length > 0 && (
          <div className="relative" ref={triggerRef}>
            <button
              type="button"
              onClick={() => setIsTriggerOpen(!isTriggerOpen)}
              className="flex items-center gap-1 text-[12px] text-primary hover:text-white font-medium transition-colors"
            >
              <span>{triggerOption || triggerOptions[0]}</span>
              <ChevronDown size={12} className="text-secondary" />
            </button>
            {isTriggerOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-20 bg-secondary border border-color rounded shadow-xl overflow-hidden z-50 py-1">
                {triggerOptions.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onTriggerOptionChange?.(opt);
                      setIsTriggerOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-1 text-[11px] hover:bg-hover transition-colors ${
                      triggerOption === opt ? 'text-brand font-semibold' : 'text-secondary'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {currencyOptions && currencyOptions.length > 0 ? (
          <div className="relative" ref={currencyRef}>
            <button
              type="button"
              onClick={() => setIsCurrencyOpen(!isCurrencyOpen)}
              className="flex items-center gap-1 text-[12px] text-primary hover:text-white font-medium transition-colors"
            >
              <span>{currency || currencyOptions[0]}</span>
              <ChevronDown size={12} className="text-secondary" />
            </button>
            {isCurrencyOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-24 bg-secondary border border-color rounded shadow-xl overflow-hidden z-50 py-1">
                {currencyOptions.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onCurrencyChange?.(opt);
                      setIsCurrencyOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-1.5 text-[11px] hover:bg-hover transition-colors ${
                      currency === opt ? 'text-brand font-semibold' : 'text-primary'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          currency && (
            <span className="text-[12px] text-secondary font-medium select-none">{currency}</span>
          )
        )}
      </div>
    </div>
  );
};
