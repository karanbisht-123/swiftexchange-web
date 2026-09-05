import { create } from 'zustand';

export interface LeverageBracket {
  bracket: number;
  initialLeverage: number;
  notionalCap: number;
  notionalFloor: number;
  maintMarginRatio: number;
  cum: number;
}

interface LeverageStoreState {
  bracketsBySymbol: Record<string, LeverageBracket[]>;
  setBrackets: (symbol: string, brackets: LeverageBracket[]) => void;
  setAllBrackets: (data: Record<string, LeverageBracket[]>) => void;
}

export const useLeverageStore = create<LeverageStoreState>(set => ({
  bracketsBySymbol: {},

  setBrackets: (symbol, brackets) =>
    set(state => ({
      bracketsBySymbol: {
        ...state.bracketsBySymbol,
        [symbol]: brackets,
      },
    })),

  setAllBrackets: data => set({ bracketsBySymbol: data }),
}));

export const leverageStore = {
  getBrackets: (symbol: string) => useLeverageStore.getState().bracketsBySymbol[symbol] || [],
  getMaxLeverage: (symbol: string) => {
    const brackets = useLeverageStore.getState().bracketsBySymbol[symbol];
    if (!brackets || brackets.length === 0) return 20; // Default fallback
    return Math.max(...brackets.map(b => b.initialLeverage));
  },
};
