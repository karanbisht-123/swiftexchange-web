import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { useSwapStore } from '../../../../../store/swapStore';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { getEvmSwapEnabledChains, isEvmChain } from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import { STELLAR_CHAIN_ID } from '../constants/swap.constants';
import { isStellar } from '../utils/swapAssetUtils';

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
    fromChainId,
    setFromChainId,
    toChainId,
    setToChainId,
    sellAssetSymbol,
    setSellAssetSymbol,
    sellAssetAddress,
    setSellAssetAddress,
    buyAssetSymbol,
    setBuyAssetSymbol,
    buyAssetAddress,
    setBuyAssetAddress,
    resetInputs,
  } = useSwapStore();

  const [isChainSwitching, setIsChainSwitching] = useState<boolean>(false);
  const hasInitializedDefaults = useRef(false);

  const urlParamsApplied = useRef(false);

  const parseChainId = (param: string): number | string => {
    if (param === 'stellar' || param === 'pubnet') return STELLAR_CHAIN_ID;
    const n = Number(param);
    return isNaN(n) ? param : n;
  };

  useEffect(() => {
    let initialFromChainId: number | string | null = null;
    let initialToChainId: number | string | null = null;
    let initialSellSymbol = '';
    let initialSellAddr = '';
    let initialBuySymbol = '';
    let initialBuyAddr = '';

    if (locationState?.selectedAsset) {
      const asset = locationState.selectedAsset;
      initialFromChainId = asset.chainType === 'stellar' ? STELLAR_CHAIN_ID : asset.chainId || 1;
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

      if (fromParam) initialFromChainId = parseChainId(fromParam);
      if (toParam) initialToChainId = parseChainId(toParam);
      if (sellAssetParam) initialSellSymbol = sellAssetParam;
      if (sellAddressParam) initialSellAddr = sellAddressParam;
      if (buyAssetParam) initialBuySymbol = buyAssetParam;
      if (buyAddressParam) initialBuyAddr = buyAddressParam;
    }

    if (!initialFromChainId) {
      let defaultChainId: number | string = STELLAR_CHAIN_ID;
      if (connectedWallets[WalletType.STELLAR]) {
        defaultChainId = STELLAR_CHAIN_ID;
      } else if (connectedWallets[WalletType.EVM] && currentChainId) {
        const swapEnabledChains = getEvmSwapEnabledChains(currentNetwork);
        if (swapEnabledChains.some(c => c.chainId === currentChainId)) {
          defaultChainId = currentChainId;
        }
      }

      initialFromChainId = defaultChainId;
      if (!initialToChainId) initialToChainId = defaultChainId;
    }

    if (initialFromChainId !== null) setFromChainId(initialFromChainId);
    if (initialToChainId !== null) setToChainId(initialToChainId);

    if (initialSellSymbol) {
      setSellAssetSymbol(initialSellSymbol);
      setSellAssetAddress(initialSellAddr);
    }
    if (initialBuySymbol) {
      setBuyAssetSymbol(initialBuySymbol);
      setBuyAssetAddress(initialBuyAddr);
    }

    urlParamsApplied.current = true;
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
    if (!urlParamsApplied.current) return;
    const params = new URLSearchParams();
    params.set('fromChainId', String(fromChainId));
    params.set('toChainId', String(toChainId));
    if (sellAssetSymbol) params.set('sellAsset', sellAssetSymbol);
    if (sellAssetAddress) params.set('sellAddress', sellAssetAddress);
    if (buyAssetSymbol) params.set('buyAsset', buyAssetSymbol);
    if (buyAssetAddress) params.set('buyAddress', buyAssetAddress);
    setSearchParams(params, { replace: true });
  }, [
    fromChainId,
    toChainId,
    sellAssetSymbol,
    sellAssetAddress,
    buyAssetSymbol,
    buyAssetAddress,
    setSearchParams,
  ]);

  const isInitialMount = useRef(true);
  const prevChainIds = useRef({ from: fromChainId, to: toChainId });
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevChainIds.current = { from: fromChainId, to: toChainId };
      return;
    }
    if (prevChainIds.current.from !== fromChainId || prevChainIds.current.to !== toChainId) {
      resetInputs();
      prevChainIds.current = { from: fromChainId, to: toChainId };
    }
  }, [fromChainId, toChainId, resetInputs]);

  useEffect(() => {
    if (locationState?.selectedAsset) {
      const asset = locationState.selectedAsset;
      const targetChainId = asset.chainType === 'stellar' ? STELLAR_CHAIN_ID : asset.chainId || 1;
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
  }, [
    fromChainId,
    currentChainId,
    isConnected,
    isChainSwitching,
    getProvider,
    setFromChainId,
    setToChainId,
    toChainId,
  ]);

  return {
    isChainSwitching,
    setIsChainSwitching,
    hasInitializedDefaults,
  };
}
