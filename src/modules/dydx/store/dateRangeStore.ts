import { create } from 'zustand';

interface DateRangeState {
  fromDate: string | null;
  toDate: string | null;
  setFromDate: (date: string | null) => void;
  setToDate: (date: string | null) => void;
  setRange: (from: string | null, to: string | null) => void;
  clearRange: () => void;
  isActive: () => boolean;
}

export const useDateRangeStore = create<DateRangeState>((set, get) => ({
  fromDate: null,
  toDate: null,
  setFromDate: (date) => set({ fromDate: date }),
  setToDate: (date) => set({ toDate: date }),
  setRange: (from, to) => set({ fromDate: from, toDate: to }),
  clearRange: () => set({ fromDate: null, toDate: null }),
  isActive: () => {
    const { fromDate, toDate } = get();
    return !!(fromDate || toDate);
  },
}));
