import { create } from 'zustand';

interface OrderPreviewState {
    pendingMarginRequired: number;
    setPendingMargin: (margin: number) => void;
    clearPendingMargin: () => void;
}

const useOrderPreviewStore = create<OrderPreviewState>((set) => ({
    pendingMarginRequired: 0,
    setPendingMargin: (margin) => set({ pendingMarginRequired: margin }),
    clearPendingMargin: () => set({ pendingMarginRequired: 0 }),
}));

export default useOrderPreviewStore;
