import { createContext, useContext, useState, type ReactNode, type FC } from 'react';

type ActionType = 'SEND' | 'RECEIVE' | 'BRIDGE' | 'SWAP';

interface AssetSelectorContextType {
  isOpen: boolean;
  actionType: ActionType;
  defaultNetwork: string | number | null;
  pairedChainId: string | number | null;
  onSelect: ((asset: any) => void) | null;
  openAssetSelector: (type: ActionType, options?: { onSelect?: (asset: any) => void, defaultNetwork?: string | number, pairedChainId?: string | number }) => void;
  closeAssetSelector: () => void;
}

const AssetSelectorContext = createContext<AssetSelectorContextType | undefined>(undefined);

export const AssetSelectorProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [actionType, setActionType] = useState<ActionType>('SEND');
  const [defaultNetwork, setDefaultNetwork] = useState<string | number | null>(null);
  const [pairedChainId, setPairedChainId] = useState<string | number | null>(null);
  const [onSelect, setOnSelect] = useState<((asset: any) => void) | null>(null);

  const openAssetSelector = (type: ActionType, options?: { onSelect?: (asset: any) => void, defaultNetwork?: string | number, pairedChainId?: string | number }) => {
    setActionType(type);
    setOnSelect(() => options?.onSelect || null);
    setDefaultNetwork(options?.defaultNetwork ?? null);
    setPairedChainId(options?.pairedChainId ?? null);
    setIsOpen(true);
  };

  const closeAssetSelector = () => {
    setIsOpen(false);
    setOnSelect(null);
    setDefaultNetwork(null);
    setPairedChainId(null);
  };

  return (
    <AssetSelectorContext.Provider value={{ isOpen, actionType, defaultNetwork, pairedChainId, onSelect, openAssetSelector, closeAssetSelector }}>
      {children}
    </AssetSelectorContext.Provider>
  );
};

export const useAssetSelectorModal = () => {
  const context = useContext(AssetSelectorContext);
  if (context === undefined) {
    throw new Error('useAssetSelectorModal must be used within an AssetSelectorProvider');
  }
  return context;
};
