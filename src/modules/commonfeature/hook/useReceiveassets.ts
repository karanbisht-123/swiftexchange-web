import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import QRCode from 'qrcode';

import { validateAddress } from '../../../validator/AddressValidator';
import {
  getCosmosChains,
  getEVMChains,
  getNetwork,
  getStellarConfig,
} from '../../walletconnect/config/chains';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import {
  type ReceiveAsset,
  assetFromCosmos,
  assetFromEVM,
  assetFromStellar,
} from '../../walletconnect/utils/assetFromChain';

export const useReceiveAssets = () => {
  const { connectedWallets } = useWalletConnect();
  const currentNetwork = getNetwork();
  const [selectedAssetValue, setSelectedAssetValue] = useState<string>('');

  const assets: ReceiveAsset[] = useMemo(() => {
    const evm = getEVMChains().map(assetFromEVM);
    const cosmos = getCosmosChains().map(assetFromCosmos);
    const stellar = [assetFromStellar(getStellarConfig())];
    return [...evm, ...cosmos, ...stellar];
  }, [currentNetwork]);

  useEffect(() => {
    if (assets.length && !selectedAssetValue) {
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
    if (!wallet) return '';

    if (currentAsset.walletType === 'evm') {
      return wallet.chainId.toString() === currentAsset.chainId.toString() ? wallet.address : '';
    }

    return wallet.address;
  }, [connectedWallets, currentAsset]);

  const isAddressValid = useMemo(() => {
    console.log('Debug: walletAddress:', walletAddress);
    console.log('Debug: currentAsset:', currentAsset);

    const hasWalletAddress = !!walletAddress;
    const hasCurrentAsset = !!currentAsset;
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
      QRCode.toCanvas(
        qrCanvasRef.current,
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
