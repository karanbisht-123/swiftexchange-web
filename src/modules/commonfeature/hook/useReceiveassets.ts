import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { validateAddress } from '../../../validator/AddressValidator';
import { getEVMChains, getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import {
  type ReceiveAsset,
  assetFromStellar,
} from '../../walletconnect/utils/assetFromChain';
import { getTokensForChain } from '../../evm/service/tokenListService';
import { WalletType } from '../../walletconnect/constants/Wallet';

export const useReceiveAssets = () => {
  const { connectedWallets } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const [selectedAssetValue, setSelectedAssetValue] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  const assets: ReceiveAsset[] = useMemo(() => {
    const evmChains = getEVMChains(currentNetwork);
    const evmAssets: ReceiveAsset[] = [];

    for (const chain of evmChains) {
      const tokens = getTokensForChain(chain.chainId);
      for (const token of tokens) {
        evmAssets.push({
          value: token.symbol + '-' + chain.chainId,
          symbol: token.symbol,
          label: `${token.symbol} (${chain.name})`,
          logo: token.logoURI || chain.logoUrl || '',
          network: chain.name,
          chainId: chain.chainId,
          addressType: 'evm',
          walletType: WalletType.EVM,
          tokenAddress: token.address,
          decimals: token.decimals,
          isNative: token.isNative,
        } as any);
      }
    }

    const stellar = [assetFromStellar(getStellarConfig(currentNetwork))];
    stellar[0].value = stellar[0].value + '-stellar';

    return [...evmAssets, ...stellar];
  }, [currentNetwork]);

  useEffect(() => {
    const assetParam = searchParams.get('asset');
    const chainIdParam = searchParams.get('chainId');

    if (assetParam && chainIdParam) {
      const match = assets.find(a => {
        const aChainId = a.walletType === WalletType.STELLAR ? 'stellar' : a.chainId?.toString();
        // Fallback to label split if symbol is missing (though we added it now)
        const aSymbol = (a as any).symbol || a.label.split(' ')[0];
        return aSymbol === assetParam && aChainId === chainIdParam;
      });
      
      if (match && match.value !== selectedAssetValue) {
        setSelectedAssetValue(match.value);
      }
    } else if (assets.length && !selectedAssetValue) {
      setSelectedAssetValue(assets[0].value);
    }
  }, [assets, searchParams, selectedAssetValue]);

  const currentAsset = useMemo(
    () => assets.find(a => a.value === selectedAssetValue),
    [assets, selectedAssetValue]
  );

  const walletAddress = useMemo(() => {
    if (!currentAsset) return '';
    const wallet = connectedWallets[currentAsset.walletType];
    return wallet?.address || '';
  }, [connectedWallets, currentAsset]);

  const isAddressValid = useMemo(() => {
    if (!walletAddress || !currentAsset) return false;
    return validateAddress(walletAddress, {
      addressType: currentAsset.addressType as any,
      network: currentAsset.network,
    });
  }, [walletAddress, currentAsset]);

  const handleCopy = useCallback(async () => {
    if (!walletAddress || !isAddressValid) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopyFeedback(`Address copied!`);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed to copy address');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [walletAddress, isAddressValid]);

  const handleShare = useCallback(async () => {
    if (!walletAddress || !isAddressValid) return;
    const symbol = currentAsset?.value.split('-')[0] || currentAsset?.value;
    const text = `Send ${symbol} to my wallet:\n\nAddress: ${walletAddress}\nNetwork: ${currentAsset?.network}\n\nOnly send ${symbol} on the ${currentAsset?.network} network!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `My ${symbol} address`, text });
      } catch { }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setCopyFeedback('Address + network copied!');
        setTimeout(() => setCopyFeedback(null), 2000);
      } catch {
        setCopyFeedback('Failed to share');
        setTimeout(() => setCopyFeedback(null), 2000);
      }
    }
  }, [walletAddress, isAddressValid, currentAsset]);

  return {
    assets,
    selectedAssetValue,
    setSelectedAssetValue,
    currentAsset,
    walletAddress,
    isAddressValid,
    isConnected: Object.keys(connectedWallets).length > 0,
    isWalletTypeConnected: !!currentAsset && !!connectedWallets[currentAsset.walletType],
    handleCopy,
    handleShare,
    copyFeedback,
  };
};