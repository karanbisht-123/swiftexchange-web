import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface OrderInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  currency: string;
  currencyOptions?: string[];
  onCurrencyChange?: (currency: string) => void;
  placeholder?: string;
  onQuickAction?: () => void;
  quickActionLabel?: string;
  error?: boolean;
}

export const OrderInput: React.FC<OrderInputProps> = ({
  label,
  value,
  onChange,
  currency,
  currencyOptions,
  onCurrencyChange,
  placeholder = '',
  onQuickAction,
  quickActionLabel,
  error = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative flex items-center bg-tertiary border rounded transition-colors h-10 px-3 mt-4 ${error ? 'border-danger' : 'border-color focus-within:border-brand'}`}>
      <span className="text-[11px] text-muted absolute left-3 z-10 pointer-events-none">{label}</span>
      <input 
        type="text" 
        className="flex-1 bg-transparent text-left pl-[70px] text-[13px] font-medium text-primary outline-none relative z-20 w-full h-full" 
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          // Allow empty string or numbers with optional single decimal point
          const val = e.target.value;
          if (val === '' || /^\d*\.?\d*$/.test(val)) {
            onChange(val);
          }
        }}
      />
      <div className="flex items-center gap-2 text-[11px] shrink-0 z-20">
        {currencyOptions && currencyOptions.length > 1 ? (
          <div className="relative" ref={dropdownRef}>
            <button 
              type="button" 
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-1 text-secondary hover:text-primary transition-colors font-medium cursor-pointer"
            >
              {currency} <ChevronDown size={12} strokeWidth={2.5} />
            </button>
            {isOpen && (
              <div className="absolute right-0 top-full mt-2 w-[80px] bg-secondary border border-color rounded-md shadow-xl overflow-hidden z-50">
                {currencyOptions.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`block w-full text-left px-3 py-2 text-[11px] hover:bg-hover transition-colors ${opt === currency ? 'text-brand font-medium' : 'text-primary'}`}
                    onClick={() => {
                      onCurrencyChange?.(opt);
                      setIsOpen(false);
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-secondary font-medium">{currency}</span>
        )}
        
        {quickActionLabel && onQuickAction && (
          <button 
            type="button"
            onClick={onQuickAction}
            className="bg-secondary border border-color rounded px-1.5 py-0.5 text-primary hover:bg-hover"
          >
            {quickActionLabel}
          </button>
        )}
      </div>
    </div>
  );
};
