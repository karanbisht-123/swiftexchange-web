import React, { useEffect, useState } from 'react';

import { getStellarConfig } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useStellarBalances } from './GlobalAssets';

interface MyTestnetAssetsProps {
  userAddress?: string;
}

interface DisplayAsset {
  name: string;
  ticker: string;
  price: number | null;
  quantity: number;
  network: any;
  iconUrl: string;
  issuer?: string;
}

// Real asset metadata (no mock prices)
const KNOWN_ASSETS: Record<string, { name: string; ticker: string; iconUrl: string }> = {
  XLM: {
    name: 'Stellar Lumen',
    ticker: 'XLM',
    iconUrl:
      'https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
  },
  USDC: {
    name: 'USD Coin',
    ticker: 'USDC',
    iconUrl: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png',
  },
  AQUA: {
    name: 'Aqua',
    ticker: 'AQUA',
    iconUrl: 'https://aqua.network/assets/img/aqua-logo.png',
  },
  yXLM: {
    name: 'yXLM',
    ticker: 'yXLM',
    iconUrl: 'https://via.placeholder.com/40',
  },
  BTC: {
    name: 'Bitcoin (Stellar)',
    ticker: 'BTC',
    iconUrl: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
  },
  ETH: {
    name: 'Ethereum (Stellar)',
    ticker: 'ETH',
    iconUrl: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  },
};

const useMyAssets = (userAddress?: string) => {
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const address = stellarWallet?.address || userAddress || '';
  const currentNetwork = useWalletStore(state => state.network);
  const { balances, loading: balancesLoading } = useStellarBalances(address);

  const [assets, setAssets] = useState<DisplayAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const config = getStellarConfig(currentNetwork);

  useEffect(() => {
    const processAssets = () => {
      if (!balances.length || balancesLoading) return;

      const processedAssets = balances
        .filter(
          (balance: any) =>
            balance.asset_type === 'native' ||
            balance.asset_type === 'credit_alphanum4' ||
            balance.asset_type === 'credit_alphanum12'
        )
        .map((balance: any) => {
          const assetCode = balance.asset_type === 'native' ? 'XLM' : balance.asset_code;
          const assetIssuer = balance.asset_type === 'native' ? undefined : balance.asset_issuer;

          const assetConfig = KNOWN_ASSETS[assetCode] || {
            name: assetCode,
            ticker: assetCode,
            iconUrl: 'https://via.placeholder.com/40?text=' + assetCode.charAt(0),
          };

          return {
            name: assetConfig.name,
            ticker: assetConfig.ticker,
            price: null, // No mock prices - price will be null
            quantity: Number(balance.balance),
            network: config?.network || 'Stellar',
            iconUrl: assetConfig.iconUrl,
            issuer: assetIssuer,
          };
        });

      setAssets(processedAssets);
    };

    processAssets();
    setIsLoading(balancesLoading);
  }, [balances, balancesLoading, config]);

  useEffect(() => {
    if (!address) {
      setIsLoading(false);
    }
  }, [address]);

  return { assets, isLoading };
};

const UserAssets: React.FC<MyTestnetAssetsProps> = ({ userAddress }) => {
  const { assets, isLoading } = useMyAssets(userAddress);
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const isConnected = !!stellarWallet;

  return (
    <div className="bg-secondary max-w-[90vw] rounded-xl shadow-sm">
      {isLoading ? (
        <div className="text-center py-4 text-muted animate-pulse">Loading assets...</div>
      ) : !isConnected ? (
        <div className="text-center py-4 text-muted">Please connect your wallet to view assets</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-4 text-muted">No assets found in your account</div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          <div className="min-w-[500px]">
            {assets.map((asset, index) => (
              <div
                key={`${asset.ticker}-${asset.issuer || 'native'}-${index}`}
                className="flex items-center justify-between py-3 rounded-sm mt-0.5 transition-colors hover:bg-hover bg-primary px-2"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-tertiary">
                    <img
                      src={asset.iconUrl}
                      alt={asset.ticker}
                      className="w-full h-full object-cover"
                      onError={e => {
                        e.currentTarget.src = `https://via.placeholder.com/40?text=${asset.ticker.charAt(0)}`;
                      }}
                    />
                  </div>
                  <div>
                    <div className="font-medium">{asset.name}</div>
                    <div className="text-xs text-muted">
                      {asset.ticker} · {asset.network}
                    </div>
                    {asset.issuer && (
                      <div className="text-[10px] text-muted font-mono">
                        {asset.issuer.slice(0, 8)}...{asset.issuer.slice(-4)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold text-lg">
                    {asset.quantity.toLocaleString('en-US', {
                      maximumFractionDigits: 7,
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-sm text-muted">{asset.ticker}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAssets;
