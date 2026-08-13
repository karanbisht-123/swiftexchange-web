import { Calendar, X } from 'lucide-react';
import React from 'react';

interface CustomDatePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  min?: string;
  max?: string;
  disabled?: boolean;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  label,
  value,
  onChange,
  onClear,
  min,
  max,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-[9px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider pl-1">
        {label}
      </label>
      <div className="relative group flex items-center">
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none z-10">
          <Calendar
            className={`w-3.5 h-3.5 ${disabled ? 'text-muted/50' : 'text-muted group-hover:text-brand-primary transition-colors'}`}
          />
        </div>
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className={`
            w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-xs font-medium
            pl-8 pr-8 py-1.5 rounded-lg border border-[var(--color-border)]
            focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary
            transition-all outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            [&::-webkit-calendar-picker-indicator]:opacity-0
            [&::-webkit-calendar-picker-indicator]:absolute
            [&::-webkit-calendar-picker-indicator]:inset-0
            [&::-webkit-calendar-picker-indicator]:w-full
            [&::-webkit-calendar-picker-indicator]:h-full
            [&::-webkit-calendar-picker-indicator]:cursor-pointer
            [&::-webkit-calendar-picker-indicator]:z-0
          `}
        />
        {value && onClear && (
          <button
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }}
            className="absolute right-1.5 p-1 text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors z-20 pointer-events-auto"
            title="Clear date"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
