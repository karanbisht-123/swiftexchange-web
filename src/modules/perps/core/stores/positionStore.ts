import { create } from 'zustand';

import type { Position } from '../models';

interface PositionStoreState {
  positions: Record<string, Position>;
  setPositions: (positions: Position[]) => void;
  updatePosition: (position: Position) => void;
  removePosition: (symbol: string) => void;
  getPosition: (symbol: string) => Position | undefined;
}

export const usePositionStore = create<PositionStoreState>((set, get) => ({
  positions: {},
  setPositions: positions => {
    const nextPositions: Record<string, Position> = {};
    positions.forEach(p => {
      nextPositions[p.symbol] = p;
    });
    set({ positions: nextPositions });
  },
  updatePosition: position =>
    set(state => ({
      positions: {
        ...state.positions,
        [position.symbol]: position,
      },
    })),
  removePosition: symbol =>
    set(state => {
      const newPositions = { ...state.positions };
      delete newPositions[symbol];
      return { positions: newPositions };
    }),
  getPosition: symbol => get().positions[symbol],
}));
