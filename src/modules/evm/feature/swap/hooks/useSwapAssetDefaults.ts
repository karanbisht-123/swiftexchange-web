import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useSwapStore } from '../../../../../store/swapStore';
import { isStellar } from '../utils/swapAssetUtils';
import { getEvmSwapEnabledChains, isEvmChain } from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import { STELLAR_CHAIN_ID } from '../constants/swap.constants';

export function useSwapAssetDefaults(params: {
  connectedWallets: any;
  currentChainId: number | null;
  currentNetwork: 'mainnet' | 'testnet';
  isConnected: boolean;
  getProvider: (type: WalletType) => any;
}) {
  const { connectedWallets, currentChainId, currentNetwork, isConnected, getProvider } = params;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const locationState = location.state as { selectedAsset?: any; isPerp?: boolean };

  const {
    fromChainId, setFromChainId,
    toChainId, setToChainId,
    sellAssetSymbol, setSellAssetSymbol,
    sellAssetAddress, setSellAssetAddress,
    buyAssetSymbol, setBuyAssetSymbol,
    buyAssetAddress, setBuyAssetAddress,
    resetInputs
  } = useSwapStore();

  const [isChainSwitching, setIsChainSwitching] = useState<boolean>(false);
  const hasInitializedDefaults = useRef(false);

  useEffect(() => {
    let initialFromChainId: number | string | null = null;
    let initialToChainId: number | string | null = null;
    let initialSellSymbol = '';
    let initialSellAddr = '';
    let initialBuySymbol = '';
    let initialBuyAddr = '';

    if (locationState?.selectedAsset) {
      const asset = locationState.selectedAsset;
      initialFromChainId = asset.chainType === 'stellar' ? STELLAR_CHAIN_ID : (asset.chainId || 1);
      initialSellSymbol = asset.symbol;
      initialSellAddr = asset.address || '';
      if (locationState.isPerp) {
        initialToChainId = initialFromChainId;
      }
    } else {
      const fromParam = searchParams.get('fromChainId');
      const toParam = searchParams.get('toChainId');
      const sellAssetParam = searchParams.get('sellAsset');
      const sellAddressParam = searchParams.get('sellAddress');
      const buyAssetParam = searchParams.get('buyAsset');
      const buyAddressParam = searchParams.get('buyAddress');

      if (fromParam) {
        initialFromChainId = fromParam === 'stellar' ? STELLAR_CHAIN_ID : (isNaN(Number(fromParam)) ? fromParam : Number(fromParam));
      }
      if (toParam) {
        initialToChainId = toParam === 'stellar' ? STELLAR_CHAIN_ID : (isNaN(Number(toParam)) ? toParam : Number(toParam));
      }
      if (sellAssetParam) initialSellSymbol = sellAssetParam;
      if (sellAddressParam) initialSellAddr = sellAddressParam;
      if (buyAssetParam) initialBuySymbol = buyAssetParam;
      if (buyAddressParam) initialBuyAddr = buyAddressParam;
    }

    const storeFromChain = useSwapStore.getState().fromChainId;
    if (!initialFromChainId) {
      const defaultChainId = currentChainId || (connectedWallets[WalletType.STELLAR] ? STELLAR_CHAIN_ID : 1);
      if (storeFromChain === 1 && defaultChainId !== 1) {
        initialFromChainId = defaultChainId;
      }
    }

    if (initialFromChainId !== null) setFromChainId(initialFromChainId);
    if (initialToChainId !== null) setToChainId(initialToChainId);
    if (initialSellSymbol) setSellAssetSymbol(initialSellSymbol);
    if (initialSellAddr) setSellAssetAddress(initialSellAddr);
    if (initialBuySymbol) setBuyAssetSymbol(initialBuySymbol);
    if (initialBuyAddr) setBuyAssetAddress(initialBuyAddr);
  }, []);

  useEffect(() => {
    if (hasInitializedDefaults.current) return;
    const hasFromParam = !!searchParams.get('fromChainId');
    const hasToParam = !!searchParams.get('toChainId');
    const hasLocationAsset = !!locationState?.selectedAsset;

    if (!hasFromParam && !hasToParam && !hasLocationAsset) {
      const stored = useSwapStore.getState();
      const storedFrom = stored.fromChainId;
      const storedTo = stored.toChainId;
      const hasStoredPair =
        String(storedFrom) !== '1' ||
        String(storedTo) !== '1' ||
        isStellar(storedFrom) ||
        isStellar(storedTo);

      if (hasStoredPair) {
        hasInitializedDefaults.current = true;
        return;
      }

      const swapEnabledChains = getEvmSwapEnabledChains(currentNetwork);
      if (currentChainId && swapEnabledChains.some(c => c.chainId === currentChainId)) {
        setFromChainId(currentChainId);
        setToChainId(currentChainId);
        hasInitializedDefaults.current = true;
      } else if (!isConnected && connectedWallets[WalletType.STELLAR]) {
        setFromChainId(STELLAR_CHAIN_ID);
        setToChainId(STELLAR_CHAIN_ID);
        hasInitializedDefaults.current = true;
      }
    } else {
      hasInitializedDefaults.current = true;
    }
  }, [currentChainId, isConnected, connectedWallets, searchParams, currentNetwork, locationState]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('fromChainId', String(fromChainId));
    params.set('toChainId', String(toChainId));
    if (sellAssetSymbol) params.set('sellAsset', sellAssetSymbol);
    if (sellAssetAddress) params.set('sellAddress', sellAssetAddress);
    if (buyAssetSymbol) params.set('buyAsset', buyAssetSymbol);
    if (buyAssetAddress) params.set('buyAddress', buyAssetAddress);
    setSearchParams(params, { replace: true });
  }, [fromChainId, toChainId, sellAssetSymbol, sellAssetAddress, buyAssetSymbol, buyAssetAddress, setSearchParams]);

  const prevChainIds = useRef({ from: fromChainId, to: toChainId });
  useEffect(() => {
    if (prevChainIds.current.from !== fromChainId || prevChainIds.current.to !== toChainId) {
      resetInputs();
      prevChainIds.current = { from: fromChainId, to: toChainId };
    }
  }, [fromChainId, toChainId, resetInputs]);

  useEffect(() => {
    if (locationState?.selectedAsset) {
      const asset = locationState.selectedAsset;
      const targetChainId = asset.chainType === 'stellar' ? STELLAR_CHAIN_ID : (asset.chainId || 1);
      setFromChainId(targetChainId);
      setSellAssetSymbol(asset.symbol);
      setSellAssetAddress(asset.address || '');
      if (locationState.isPerp) {
        setToChainId(targetChainId);
      }
    }
  }, [locationState]);

  useEffect(() => {
    if (
      isConnected &&
      isEvmChain(fromChainId) &&
      currentChainId !== null &&
      String(currentChainId) !== String(fromChainId) &&
      !isChainSwitching
    ) {
      let active = true;
      const autoSwitchChain = async () => {
        setIsChainSwitching(true);
        try {
          const provider = getProvider(WalletType.EVM);
          await switchOrAddChain(provider, fromChainId);
        } catch (err) {
          console.error(err);
          if (active) {
            setFromChainId(currentChainId);
            if (fromChainId === toChainId) {
              setToChainId(currentChainId);
            }
          }
        } finally {
          if (active) {
            setIsChainSwitching(false);
          }
        }
      };
      autoSwitchChain();
      return () => {
        active = false;
      };
    }
  }, [fromChainId, currentChainId, isConnected, isChainSwitching, getProvider, setFromChainId, setToChainId, toChainId]);

  return {
    isChainSwitching,
    setIsChainSwitching,
    hasInitializedDefaults,
  };
}
