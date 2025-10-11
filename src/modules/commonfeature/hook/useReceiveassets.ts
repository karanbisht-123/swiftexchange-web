import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import QRCode from 'qrcode';

import { validateAddress } from '../../../validator/AddressValidator';
import { useWalletStore } from '../../wallet/store.ts/walletStore';

const assets = [
  {
    value: 'XLM',
    label: 'Stellar (XLM)',
    logo: 'https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350',
    network: 'Stellar',
    chainId: 'stellar:testnet',
    addressType: 'stellar',
  },
  {
    value: 'ETH',
    label: 'Ethereum (ETH)',
    logo: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
    network: 'Ethereum Sepolia',
    chainId: '11155111',
    addressType: 'evm',
  },
  {
    value: 'BNB',
    label: 'BNB Smart Chain (BNB)',
    logo: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
    network: 'BSC Testnet',
    chainId: '97',
    addressType: 'evm',
  },
];

export const useReceiveAssets = () => {
  const { walletAddresses, isConnected } = useWalletStore();
  const [selectedAssetValue, setSelectedAssetValue] = useState('XLM');
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const currentAsset = useMemo(
    () => assets.find(a => a.value === selectedAssetValue),
    [selectedAssetValue]
  );

  const walletAddress = useMemo(() => {
    if (!isConnected || !currentAsset) return '';
    if (!walletAddresses.length) return '';

    if (currentAsset.addressType === 'stellar') {
      return walletAddresses.find(addr => validateAddress(addr, 'Stellar')) || '';
    }
    return walletAddresses.find(addr => validateAddress(addr, currentAsset.network)) || '';
  }, [walletAddresses, isConnected, currentAsset]);

  const isAddressValid = useMemo(() => {
    if (!walletAddress || !currentAsset) return false;
    return validateAddress(walletAddress, currentAsset.network);
  }, [walletAddress, currentAsset]);

  useEffect(() => {
    if (walletAddress && qrCanvasRef.current && isAddressValid) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        walletAddress,
        {
          width: 192,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        },
        error => {
          if (error) {
            console.error('QR Code generation failed:', error);
            alert('Failed to generate QR code.');
          }
        }
      );
    }
  }, [walletAddress, isAddressValid]);

  const handleCopy = useCallback(
    async (textToCopy: string) => {
      if (!textToCopy || !isAddressValid) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        alert(`${currentAsset?.value} address copied to clipboard.`);
      } catch (err) {
        console.error('Failed to copy address:', err);
        alert('Failed to copy wallet address.');
      }
    },
    [currentAsset, isAddressValid]
  );

  const handleShare = useCallback(() => {
    if (!walletAddress || !isAddressValid) return;

    const shareText = `Send ${currentAsset?.value} to my wallet:
    
Address: ${walletAddress}

Network: ${currentAsset?.network}

⚠️ IMPORTANT: Only send ${currentAsset?.value} tokens on ${currentAsset?.network} network to this address. Sending other tokens or using wrong network may result in permanent loss.`;

    if (navigator.share) {
      navigator
        .share({
          title: `My ${currentAsset?.value} Wallet Address`,
          text: shareText,
        })
        .then(() => {
          alert('Wallet address shared successfully.');
        })
        .catch(error => {
          console.error('Share failed', error);
          alert('Failed to share wallet address.');
        });
    } else {
      navigator.clipboard
        .writeText(shareText)
        .then(() => {
          alert('Wallet details copied to clipboard.');
        })
        .catch(err => {
          console.error('Fallback copy failed:', err);
          alert('Please manually copy the address.');
        });
    }
  }, [currentAsset, walletAddress, isAddressValid]);

  return {
    selectedAssetValue,
    setSelectedAssetValue,
    currentAsset,
    walletAddress,
    isAddressValid,
    isConnected,
    assets,
    handleCopy,
    handleShare,
    qrCanvasRef,
  };
};
