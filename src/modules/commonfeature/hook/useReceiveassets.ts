import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import QRCode from 'qrcode';

import { validateAddress } from '../../../validator/AddressValidator';
import { getCosmosChains, getEVMChains, getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import {
  type ReceiveAsset,
  assetFromCosmos,
  assetFromEVM,
  assetFromStellar,
} from '../../walletconnect/utils/assetFromChain';

export const useReceiveAssets = () => {
  const { connectedWallets } = useWalletConnect();

  const currentNetwork = useWalletStore(state => state.network);

  const [selectedAssetValue, setSelectedAssetValue] = useState<string>('');

  const assets: ReceiveAsset[] = useMemo(() => {
    const evm = getEVMChains(currentNetwork).map(assetFromEVM);
    const cosmos = getCosmosChains(currentNetwork).map(assetFromCosmos);
    const stellar = [assetFromStellar(getStellarConfig(currentNetwork))];
    return [...evm, ...cosmos, ...stellar];
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

  console.log('Current Asset:', currentAsset);
  const walletAddress = useMemo(() => {
    if (!currentAsset) return '';
    const wallet = connectedWallets[currentAsset.walletType];
    return wallet?.address || '';
  }, [connectedWallets, currentAsset]);

  const isAddressValid = useMemo(() => {
    console.log('Debug: walletAddress:', walletAddress);
    console.log('Debug: currentAsset:', currentAsset);

    const hasWalletAddress = !!walletAddress;
    const hasCurrentAsset = !!currentAsset;

    // Ensure currentAsset.network is passed to validation
    const addressValidationResult =
      hasWalletAddress && hasCurrentAsset
        ? validateAddress(walletAddress, currentAsset.network)
        : false;

    console.log('Debug: hasWalletAddress:', hasWalletAddress);
    console.log('Debug: hasCurrentAsset:', hasCurrentAsset);
    console.log('Debug: validateAddress result:', addressValidationResult);

    const valid = hasWalletAddress && hasCurrentAsset && addressValidationResult;
    console.log('Debug: final isAddressValid:', valid);

    return valid;
  }, [walletAddress, currentAsset]);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (walletAddress && qrCanvasRef.current && isAddressValid) {
      // It's good practice to clear the canvas on update, though QRCode.toCanvas overwrites it.
      // We explicitly clear the ref to ensure no stale data if the address changes.
      const canvas = qrCanvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }

      QRCode.toCanvas(
        canvas,
        walletAddress,
        { width: 192, margin: 2, color: { dark: '#000', light: '#fff' } },
        err => err && console.error(err)
      );
    }
  }, [walletAddress, isAddressValid]);

  const handleCopy = useCallback(async () => {
    if (!walletAddress || !isAddressValid) return;
    await navigator.clipboard.writeText(walletAddress);
    alert(`${currentAsset?.value} address copied!`);
  }, [walletAddress, isAddressValid, currentAsset]);

  const handleShare = useCallback(() => {
    if (!walletAddress || !isAddressValid) return;
    const text = `Send ${currentAsset?.value} to my wallet:

Address: ${walletAddress}
Network: ${currentAsset?.network}

Only send ${currentAsset?.value} on the ${currentAsset?.network} network!`;

    if (navigator.share) {
      navigator.share({ title: `My ${currentAsset?.value} address`, text });
    } else {
      navigator.clipboard.writeText(text);
      alert('Address + network copied to clipboard.');
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
    qrCanvasRef,
  };
};
