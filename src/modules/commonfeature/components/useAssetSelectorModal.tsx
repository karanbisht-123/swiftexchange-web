import { createContext, useContext, useState, type ReactNode, type FC } from 'react';

type ActionType = 'SEND' | 'RECEIVE';

interface AssetSelectorContextType {
  isOpen: boolean;
  actionType: ActionType;
  openAssetSelector: (type: ActionType) => void;
  closeAssetSelector: () => void;
}

const AssetSelectorContext = createContext<AssetSelectorContextType | undefined>(undefined);

export const AssetSelectorProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [actionType, setActionType] = useState<ActionType>('SEND');

  const openAssetSelector = (type: ActionType) => {
    setActionType(type);
    setIsOpen(true);
  };

  const closeAssetSelector = () => setIsOpen(false);

  return (
    <AssetSelectorContext.Provider value={{ isOpen, actionType, openAssetSelector, closeAssetSelector }}>
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
