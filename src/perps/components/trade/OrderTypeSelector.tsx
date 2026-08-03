import React, { useState, useRef, useEffect } from 'react';
import type { OrderType } from '../../core/stores/orderEntryStore';
import { ChevronDown } from 'lucide-react';

interface OrderTypeSelectorProps {
  activeType: OrderType;
  onChange: (type: OrderType) => void;
}

const ADVANCED_TYPES: { label: string; value: OrderType }[] = [
  { label: 'Stop Limit', value: 'STOP' },
  { label: 'Stop Market', value: 'STOP_MARKET' },
  { label: 'Trailing Stop', value: 'TRAILING_STOP_MARKET' },
  { label: 'Take Profit', value: 'TAKE_PROFIT' },
  { label: 'Take Profit Market', value: 'TAKE_PROFIT_MARKET' },
];

export const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({ activeType, onChange }) => {
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

  const isAdvancedActive = ADVANCED_TYPES.some((t) => t.value === activeType);
  const advancedLabel = isAdvancedActive 
    ? ADVANCED_TYPES.find((t) => t.value === activeType)?.label 
    : 'Stop Limit';

  return (
    <div className="flex border-b border-color text-[12px] font-medium shrink-0">
      <button 
        type="button"
        onClick={() => onChange('MARKET')}
        className={`flex-1 py-3 text-center transition-colors ${activeType === 'MARKET' ? 'text-primary border-b-2 border-brand' : 'text-secondary hover:text-primary'}`}
      >
        Market
      </button>
      <button 
        type="button"
        onClick={() => onChange('LIMIT')}
        className={`flex-1 py-3 text-center transition-colors ${activeType === 'LIMIT' ? 'text-primary border-b-2 border-brand' : 'text-secondary hover:text-primary'}`}
      >
        Limit
      </button>
      
      <div className="flex-1 relative" ref={dropdownRef}>
        <button 
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full py-3 text-center transition-colors flex items-center justify-center gap-1 ${isAdvancedActive ? 'text-primary border-b-2 border-brand' : 'text-secondary hover:text-primary'}`}
        >
          {advancedLabel}
          <ChevronDown size={12} strokeWidth={2.5} />
        </button>
        
        {isOpen && (
          <div className="absolute right-0 top-[100%] mt-1 w-[140px] bg-secondary border border-color rounded-md shadow-xl overflow-hidden z-50">
            {ADVANCED_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`block w-full text-left px-3 py-2 text-[11px] hover:bg-hover transition-colors ${activeType === type.value ? 'text-brand font-medium' : 'text-primary'}`}
                onClick={() => {
                  onChange(type.value);
                  setIsOpen(false);
                }}
              >
                {type.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
