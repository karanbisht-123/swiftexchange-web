import { create } from 'zustand';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType =
  | 'LIMIT'
  | 'MARKET'
  | 'STOP'
  | 'STOP_MARKET'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TRAILING_STOP_MARKET';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTX';
export type WorkingType = 'MARK_PRICE' | 'CONTRACT_PRICE';

interface OrderEntryStoreState {
  side: OrderSide;
  orderType: OrderType;
  size: string;
  price: string;
  leverage: number;
  marginType: 'cross' | 'isolated';
  isReduceOnly: boolean;
  isPostOnly: boolean;
  
  // Advanced parameters
  timeInForce: TimeInForce;
  stopPrice: string;
  activationPrice: string;
  callbackRate: string;
  workingType: WorkingType;

  // Attached TP/SL (OTOCO) state
  slippageEnabled: boolean;
  slippageTolerance: string;
  attachedTpEnabled: boolean;
  attachedTpPrice: string;
  attachedTpTrigger: WorkingType;
  attachedSlEnabled: boolean;
  attachedSlPrice: string;
  attachedSlTrigger: WorkingType;

  // Simple TP/SL UI state
  tpEnabled: boolean;
  tp: string;
  slEnabled: boolean;
  sl: string;

  sizeAsset: 'base' | 'quote';
  setSide: (side: OrderSide) => void;
  setOrderType: (type: OrderType) => void;
  setSizeAsset: (asset: 'base' | 'quote') => void;
  setSize: (size: string) => void;
  setPrice: (price: string) => void;
  setLeverage: (leverage: number) => void;
  setMarginType: (type: 'cross' | 'isolated') => void;
  setReduceOnly: (val: boolean) => void;
  setPostOnly: (val: boolean) => void;
  
  setTimeInForce: (tif: TimeInForce) => void;
  setStopPrice: (price: string) => void;
  setActivationPrice: (price: string) => void;
  setCallbackRate: (rate: string) => void;
  setWorkingType: (wt: WorkingType) => void;

  setTpEnabled: (enabled: boolean) => void;
  setTp: (tp: string) => void;
  setSlEnabled: (enabled: boolean) => void;
  setSl: (sl: string) => void;

  setSlippageEnabled: (enabled: boolean) => void;
  setSlippageTolerance: (tol: string) => void;
  setAttachedTpEnabled: (enabled: boolean) => void;
  setAttachedTpPrice: (price: string) => void;
  setAttachedTpTrigger: (trigger: WorkingType) => void;
  setAttachedSlEnabled: (enabled: boolean) => void;
  setAttachedSlPrice: (price: string) => void;
  setAttachedSlTrigger: (trigger: WorkingType) => void;

  reset: () => void;
}

const initialState = {
  side: 'BUY' as OrderSide,
  orderType: 'LIMIT' as OrderType,
  size: '',
  price: '',
  leverage: 20,
  marginType: 'cross' as const,
  isReduceOnly: false,
  isPostOnly: false,
  
  timeInForce: 'GTC' as TimeInForce,
  stopPrice: '',
  activationPrice: '',
  callbackRate: '',
  workingType: 'CONTRACT_PRICE' as WorkingType,

  slippageEnabled: false,
  slippageTolerance: '0.1',
  attachedTpEnabled: false,
  attachedTpPrice: '',
  attachedTpTrigger: 'MARK_PRICE' as WorkingType,
  attachedSlEnabled: false,
  attachedSlPrice: '',
  attachedSlTrigger: 'MARK_PRICE' as WorkingType,

  tpEnabled: false,
  tp: '',
  slEnabled: false,
  sl: '',
  
  sizeAsset: 'quote' as const,
};

export const useOrderEntryStore = create<OrderEntryStoreState>((set) => ({
  ...initialState,
  
  setSide: (side) => set({ side }),
  setOrderType: (orderType) => set({ orderType }),
  setSizeAsset: (sizeAsset) => set({ sizeAsset }),
  setSize: (size) => set({ size }),
  setPrice: (price) => set({ price }),
  setLeverage: (leverage) => set({ leverage }),
  setMarginType: (marginType) => set({ marginType }),
  setReduceOnly: (isReduceOnly) => set({ isReduceOnly }),
  setPostOnly: (isPostOnly) => set({ isPostOnly }),
  
  setTimeInForce: (timeInForce) => set({ timeInForce }),
  setStopPrice: (stopPrice) => set({ stopPrice }),
  setActivationPrice: (activationPrice) => set({ activationPrice }),
  setCallbackRate: (callbackRate) => set({ callbackRate }),
  setWorkingType: (workingType) => set({ workingType }),

  setTpEnabled: (tpEnabled) => set({ tpEnabled }),
  setTp: (tp) => set({ tp }),
  setSlEnabled: (slEnabled) => set({ slEnabled }),
  setSl: (sl) => set({ sl }),

  setSlippageEnabled: (slippageEnabled) => set({ slippageEnabled }),
  setSlippageTolerance: (slippageTolerance) => set({ slippageTolerance }),
  setAttachedTpEnabled: (attachedTpEnabled) => set({ attachedTpEnabled }),
  setAttachedTpPrice: (attachedTpPrice) => set({ attachedTpPrice }),
  setAttachedTpTrigger: (attachedTpTrigger) => set({ attachedTpTrigger }),
  setAttachedSlEnabled: (attachedSlEnabled) => set({ attachedSlEnabled }),
  setAttachedSlPrice: (attachedSlPrice) => set({ attachedSlPrice }),
  setAttachedSlTrigger: (attachedSlTrigger) => set({ attachedSlTrigger }),

  reset: () => set(initialState),
}));
