import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateAddress } from '../../../validator/AddressValidator';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { CHAIN_REGISTRY } from '../../evm/utils/Chainregistry';

export const useReceiveAssets = () => {
  const { connectedWallets } = useWalletConnect();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const assets = useMemo(() => {
    const list: any[] = [];
    for (const config of CHAIN_REGISTRY) {
      if (config.receiveEnable) {
        const nativeId = `${config.chainId === 9000000 ? 'stellar' : 'evm'}-${config.chainId}-native`;
        list.push({
          id: nativeId,
          value: nativeId,
          symbol: config.nativeCurrency.symbol,
          name: config.nativeCurrency.name,
          image: config.nativeCurrency.logoURI,
          label: `${config.nativeCurrency.symbol} (${config.name})`,
          network: config.name,
          chainId: config.chainId,
          chainType: config.chainId === 9000000 ? 'stellar' : 'evm',
          walletType: config.chainId === 9000000 ? WalletType.STELLAR : WalletType.EVM,
          decimals: config.nativeCurrency.decimals,
          tokenAddress: '0x0000000000000000000000000000000000000000',
          addressType: config.chainId === 9000000 ? 'stellar' : 'evm',
          isNative: true
        });

        config.assets.forEach(asset => {
          if (asset.symbol === config.nativeCurrency.symbol) return;
          const assetId = `${config.chainId === 9000000 ? 'stellar' : 'evm'}-${config.chainId}-${asset.symbol}`;
          list.push({
            id: assetId,
            value: assetId,
            symbol: asset.symbol,
            name: asset.name,
            image: asset.logoURI,
            label: `${asset.symbol} (${config.name})`,
            network: config.name,
            chainId: config.chainId,
            chainType: config.chainId === 9000000 ? 'stellar' : 'evm',
            walletType: config.chainId === 9000000 ? WalletType.STELLAR : WalletType.EVM,
            decimals: asset.decimals,
            tokenAddress: asset.address,
            addressType: config.chainId === 9000000 ? 'stellar' : 'evm',
            isNative: false
          });
        });
      }
    }
    return list;
  }, []);

  const assetParam = searchParams.get('asset');
  const chainIdParam = searchParams.get('chainId');

  const currentAsset = useMemo(() => {
    if (assetParam && chainIdParam) {
      return assets.find(a => {
        const aChainIdStr = String(a.chainId);
        const paramIdStr = chainIdParam === 'stellar' ? '9000000' : chainIdParam;
        return a.symbol === assetParam && aChainIdStr === paramIdStr;
      });
    }
    return undefined;
  }, [assets, assetParam, chainIdParam]);

  useEffect(() => {
    // Only update search params if no valid asset is selected from URL AND we have assets
    if (!currentAsset && assets.length > 0) {
      const first = assets[0];
      const targetChainId = first.chainId === 9000000 ? 'stellar' : String(first.chainId);
      if (assetParam !== first.symbol || chainIdParam !== targetChainId) {
        setSearchParams({ asset: first.symbol, chainId: targetChainId }, { replace: true });
      }
    }
  }, [currentAsset, assets, assetParam, chainIdParam, setSearchParams]);

  const walletAddress = useMemo(() => {
    if (!currentAsset) return '';
    const walletType = currentAsset.walletType as WalletType;
    return connectedWallets[walletType]?.address || '';
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
      setCopyFeedback('Failed to copy');
    }
  }, [walletAddress, isAddressValid]);

  const handleShare = useCallback(async () => {
    if (!walletAddress || !isAddressValid) return;
    const symbol = currentAsset?.symbol || 'asset';
    const text = `Send ${symbol} to my wallet:\n\nAddress: ${walletAddress}\nNetwork: ${currentAsset?.network}`;
    if (navigator.share) {
      try { await navigator.share({ title: `My ${symbol} address`, text }); } catch { }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setCopyFeedback('Copied!');
        setTimeout(() => setCopyFeedback(null), 2000);
      } catch { }
    }
  }, [walletAddress, isAddressValid, currentAsset]);

  return {
    assets,
    currentAsset,
    walletAddress,
    isAddressValid,
    isConnected: Object.keys(connectedWallets).length > 0,
    isWalletTypeConnected: !!currentAsset && !!connectedWallets[currentAsset.walletType as WalletType],
    handleCopy,
    handleShare,
    copyFeedback,
  };
};