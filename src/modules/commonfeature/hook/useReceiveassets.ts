import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateAddress } from '../../../validator/AddressValidator';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { CHAIN_REGISTRY } from '../../evm/utils/Chainregistry';

import { useTransactionRouter } from '../../transction/hook/useTransactionRouter';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { buildAddTrustlineTransaction, checkTrustlineExists } from '../../steallr/service/stellarService';
import { addLocalTransaction } from '../../evm/service/localTransactionService';

export const useReceiveAssets = () => {
  const { connectedWallets } = useWalletConnect();
  const { sendTransaction } = useTransactionRouter();
  const currentNetwork = useWalletStore(state => state.network);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [hasTrustline, setHasTrustline] = useState<boolean | null>(null);
  const [isAddingTrustline, setIsAddingTrustline] = useState(false);
  const [lastAutoEnbaledAsset, setLastAutoEnabledAsset] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const assets = useMemo(() => {
    const list: any[] = [];
    for (const config of CHAIN_REGISTRY) {
      if (config.receiveEnable) {
        const isStellar = config.chainId === 'pubnet';
        const isDydx = String(config.chainId).startsWith('dydx');
        const chainPrefix = isStellar ? 'stellar' : (isDydx ? 'cosmos' : 'evm');
        const walletType = isStellar ? WalletType.STELLAR : (isDydx ? WalletType.EVM : WalletType.EVM);
        const addressType = isStellar ? 'stellar' : (isDydx ? 'cosmos' : 'evm');

        const nativeId = `${chainPrefix}-${config.chainId}-native`;
        list.push({
          id: nativeId,
          value: nativeId,
          symbol: config.nativeCurrency.symbol,
          name: config.nativeCurrency.name,
          image: config.nativeCurrency.logoURI,
          label: `${config.nativeCurrency.symbol} (${config.name})`,
          network: config.name,
          chainId: config.chainId,
          chainType: addressType,
          walletType,
          decimals: config.nativeCurrency.decimals,
          tokenAddress: config.nativeCurrency.address,
          addressType,
          isNative: true
        });

        config.assets.forEach(asset => {
          if (asset.symbol === config.nativeCurrency.symbol) return;
          const assetId = `${chainPrefix}-${config.chainId}-${asset.symbol}`;
          list.push({
            id: assetId,
            value: assetId,
            symbol: asset.symbol,
            name: asset.name,
            image: asset.logoURI,
            label: `${asset.symbol} (${config.name})`,
            network: config.name,
            chainId: config.chainId,
            chainType: addressType,
            walletType,
            decimals: asset.decimals,
            tokenAddress: asset.address,
            addressType,
            isNative: false
          });
        });
      }
    }
    return list;
  }, []);

  const assetParam = searchParams.get('asset');
  const chainIdParam = searchParams.get('chainId');
  const addressParam = searchParams.get('address');

  const currentAsset = useMemo(() => {
    if (assetParam && chainIdParam) {
      // Normalize chainId for search
      const normalizedParam = chainIdParam === 'dydx' ? 'dydx-mainnet-1' : chainIdParam;

      return assets.find(a => {
        const aChainIdStr = String(a.chainId);
        const paramIdStr = normalizedParam === 'stellar' ? 'pubnet' : normalizedParam;
        if (a.symbol !== assetParam || aChainIdStr !== paramIdStr) return false;

        if (addressParam) {
          const aIsNative = !!a.isNative || !a.tokenAddress || a.tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000' || a.tokenAddress.toLowerCase() === 'native';
          const paramIsNative = addressParam.toLowerCase() === 'native' || addressParam.toLowerCase() === '0x0000000000000000000000000000000000000000';
          if (aIsNative !== paramIsNative) return false;
          if (!aIsNative && !paramIsNative) {
            return a.tokenAddress?.toLowerCase() === addressParam.toLowerCase();
          }
        }
        return true;
      });
    }
    return undefined;
  }, [assets, assetParam, chainIdParam, addressParam]);

  useEffect(() => {
    if (assets.length === 0) return;

    const connectedFirst = assets.find(a => {
      const isDydx = a.chainId && String(a.chainId).startsWith('dydx');
      if (isDydx) {
        return !!(connectedWallets.evm as any)?.dydxAddress || !!(connectedWallets.cosmos as any)?.dydxAddress || !!localStorage.getItem('sx_dkm_addr');
      }
      return !!connectedWallets[a.walletType as WalletType];
    });

    const fallback = connectedFirst ?? assets[0];
    const targetChainId = fallback.chainId === 'pubnet' ? 'stellar' : String(fallback.chainId);

    const isCurrentDydx = currentAsset?.chainId && String(currentAsset.chainId).startsWith('dydx');
    const isCurrentDydxAvailable = isCurrentDydx && (
      !!(connectedWallets.evm as any)?.dydxAddress ||
      !!(connectedWallets.cosmos as any)?.dydxAddress ||
      !!localStorage.getItem('sx_dkm_addr')
    );

    const selectedWalletMissing = currentAsset && (isCurrentDydx ? !isCurrentDydxAvailable : !connectedWallets[currentAsset.walletType as WalletType]);

    if (!currentAsset || selectedWalletMissing) {
      if (assetParam !== fallback.symbol || chainIdParam !== targetChainId) {
        setSearchParams({ asset: fallback.symbol, chainId: targetChainId }, { replace: true });
      }
    }
  }, [currentAsset, assets, assetParam, chainIdParam, setSearchParams, connectedWallets]);

  const walletAddress = useMemo(() => {
    if (!currentAsset) return '';
    const walletType = currentAsset.walletType as WalletType;
    if (currentAsset.chainId && String(currentAsset.chainId).startsWith('dydx')) {
      const addr = (connectedWallets.evm as any)?.dydxAddress || (connectedWallets.cosmos as any)?.dydxAddress;
      return addr || localStorage.getItem('sx_dkm_addr') || '';
    }
    return connectedWallets[walletType]?.address || '';
  }, [connectedWallets, currentAsset]);

  const isAddressValid = useMemo(() => {
    if (!walletAddress || !currentAsset) return false;
    return validateAddress(walletAddress, {
      addressType: currentAsset.addressType as any,
      network: currentAsset.network,
    });
  }, [walletAddress, currentAsset]);

  useEffect(() => {
    const checkTrust = async () => {
      if (currentAsset?.chainType === 'stellar' && !currentAsset.isNative && walletAddress) {
        setHasTrustline(null);
        try {
          const exists = await checkTrustlineExists(walletAddress, currentAsset.symbol, currentAsset.tokenAddress);
          setHasTrustline(exists);
        } catch (e) {
          console.error('Trustline check error:', e);
          setHasTrustline(false);
        }
      } else {
        setHasTrustline(true);
      }
    };
    checkTrust();
  }, [currentAsset, walletAddress]);

  const handleAddTrustline = useCallback(async () => {
    if (!currentAsset || !walletAddress || isAddingTrustline) return;
    setIsAddingTrustline(true);
    try {
      const xdr = await buildAddTrustlineTransaction(walletAddress, currentAsset.symbol, currentAsset.tokenAddress);
      const res = await sendTransaction({
        type: 'stellar',
        network: currentAsset.network,
        networkKey: currentNetwork === 'testnet' ? 'testnet' : 'pubnet',
        from: walletAddress,
        to: '',
        amount: '0',
        data: { xdr, network: currentNetwork === 'testnet' ? 'TESTNET' : 'PUBLIC' }
      });

      if (res.status === 'success') {
        addLocalTransaction({
          hash: res.hash || '',
          chainId: 'pubnet',
          type: 'trustline',
          timestamp: Date.now(),
          status: 'success',
          from: walletAddress,
          network: currentNetwork,
          description: `Add trustline for ${currentAsset.symbol}`
        });
        setHasTrustline(true);
      } else {
        throw new Error(res.error || 'Failed to add trustline');
      }
    } catch (e: any) {
      console.error('Add trustline error:', e);
      setCopyFeedback(`Error: ${e.message}`);
      setTimeout(() => setCopyFeedback(null), 3000);
    } finally {
      setIsAddingTrustline(false);
    }
  }, [currentAsset, walletAddress, isAddingTrustline, sendTransaction, currentNetwork]);

  useEffect(() => {
    // Auto-trigger trustline addition ONLY if it's missing AND we haven't tried for THIS asset in this session
    if (hasTrustline === false && currentAsset && walletAddress && !isAddingTrustline && lastAutoEnbaledAsset !== currentAsset.id) {
      setLastAutoEnabledAsset(currentAsset.id);
      // Wait a bit to avoid flashing when switching assets
      const timer = setTimeout(() => {
        handleAddTrustline();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [hasTrustline, currentAsset, walletAddress, isAddingTrustline, lastAutoEnbaledAsset, handleAddTrustline]);

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
    isWalletTypeConnected: !!currentAsset && (
      currentAsset.chainId && String(currentAsset.chainId).startsWith('dydx')
        ? (!!(connectedWallets.evm as any)?.dydxAddress || !!(connectedWallets.cosmos as any)?.dydxAddress || !!localStorage.getItem('sx_dkm_addr'))
        : !!connectedWallets[currentAsset.walletType as WalletType]
    ),
    handleCopy,
    handleShare,
    copyFeedback,
    hasTrustline,
    isAddingTrustline,
    handleAddTrustline,
  };
};