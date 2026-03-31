import { useCallback, useEffect, useMemo, useState } from 'react';

import { validateAddress } from '../../../validator/AddressValidator';
import { getEVMChains, getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import {
  type ReceiveAsset,
  assetFromEVM,
  assetFromStellar,
} from '../../walletconnect/utils/assetFromChain';

export const useReceiveAssets = () => {
  const { connectedWallets } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const [selectedAssetValue, setSelectedAssetValue] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const assets: ReceiveAsset[] = useMemo(() => {
    const evm = getEVMChains(currentNetwork).map(assetFromEVM);
    const stellar = [assetFromStellar(getStellarConfig(currentNetwork))];
    return [...evm, ...stellar];
  }, [currentNetwork]);

  useEffect(() => {
    if (assets.length && !assets.some(a => a.value === selectedAssetValue)) {
      setSelectedAssetValue(assets[0].value);
    }
  }, [assets, selectedAssetValue]);

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
      setCopyFeedback(`${currentAsset?.value} address copied!`);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed to copy address');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [walletAddress, isAddressValid, currentAsset]);

  const handleShare = useCallback(async () => {
    if (!walletAddress || !isAddressValid) return;
    const text = `Send ${currentAsset?.value} to my wallet:\n\nAddress: ${walletAddress}\nNetwork: ${currentAsset?.network}\n\nOnly send ${currentAsset?.value} on the ${currentAsset?.network} network!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `My ${currentAsset?.value} address`, text });
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