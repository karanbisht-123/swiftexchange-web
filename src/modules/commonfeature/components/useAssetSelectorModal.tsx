import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  type ReactNode,
  type FC,
} from 'react';

export type ActionType = 'SEND' | 'RECEIVE' | 'BRIDGE' | 'SWAP';

export interface AssetSelectorState {
  isOpen: boolean;
  actionType: ActionType;
  defaultNetwork: string | number | null;
  forceNetwork: string | number | null;
  pairedChainId: string | number | null;
  showAllStellarAssets: boolean;
  onSelect: ((asset: any) => void) | null;
}

interface OpenOptions {
  onSelect?: (asset: any) => void;
  defaultNetwork?: string | number;
  forceNetwork?: string | number;
  pairedChainId?: string | number;
  showAllStellarAssets?: boolean;
}

interface AssetSelectorDispatch {
  openAssetSelector: (type: ActionType, options?: OpenOptions) => void;
  closeAssetSelector: () => void;
}
const StateContext = createContext<AssetSelectorState | undefined>(undefined);
const DispatchContext = createContext<AssetSelectorDispatch | undefined>(undefined);

type Action =
  | { type: 'OPEN'; actionType: ActionType; options?: OpenOptions }
  | { type: 'CLOSE' };

const initialState: AssetSelectorState = {
  isOpen: false,
  actionType: 'SEND',
  defaultNetwork: null,
  forceNetwork: null,
  pairedChainId: null,
  showAllStellarAssets: false,
  onSelect: null,
};

function reducer(state: AssetSelectorState, action: Action): AssetSelectorState {
  switch (action.type) {
    case 'OPEN':
      return {
        isOpen: true,
        actionType: action.actionType,
        defaultNetwork: action.options?.defaultNetwork ?? null,
        forceNetwork: action.options?.forceNetwork ?? null,
        pairedChainId: action.options?.pairedChainId ?? null,
        showAllStellarAssets: !!action.options?.showAllStellarAssets,
        onSelect: action.options?.onSelect ?? null,
      };
    case 'CLOSE':
      return initialState;
    default:
      return state;
  }
}

export const AssetSelectorProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const actions = useMemo<AssetSelectorDispatch>(
    () => ({
      openAssetSelector: (type: ActionType, options?: OpenOptions) =>
        dispatch({ type: 'OPEN', actionType: type, options }),
      closeAssetSelector: () => dispatch({ type: 'CLOSE' }),
    }),
    []
  );

  return (
    <DispatchContext.Provider value={actions}>
      <StateContext.Provider value={state}>
        {children}
      </StateContext.Provider>
    </DispatchContext.Provider>
  );
};

export function useAssetSelectorModal(): AssetSelectorState & AssetSelectorDispatch {
  const state = useContext(StateContext);
  const dispatch = useContext(DispatchContext);
  if (!state || !dispatch) {
    throw new Error('useAssetSelectorModal must be used within AssetSelectorProvider');
  }
  return { ...state, ...dispatch };
}

export function useAssetSelectorDispatch(): AssetSelectorDispatch {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) {
    throw new Error('useAssetSelectorDispatch must be used within AssetSelectorProvider');
  }
  return dispatch;
}