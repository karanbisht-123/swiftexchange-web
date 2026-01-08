import { Search } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import {
  Asset,
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';

interface AssetItem {
  asset_code: string;
  asset_issuer: string;
  asset_type: string;
  balance: string;
  limit?: string;
  is_authorized: boolean;
  num_accounts?: number;
}

interface UserAsset {
  asset_code: string;
  asset_issuer: string;
  asset_type: string;
}

interface AllAssetsProps {
  userAddress?: string;
  onAddAsset: (assetId: string) => void;
}

export const useStellarBalances = (publicKey?: string) => {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const currentNetwork = useWalletStore(state => state.network);

  const server = useMemo(() => {
    const config = getStellarConfig(currentNetwork);
    if (!config) return null;
    return new Horizon.Server(config.horizonUrl, {
      allowHttp: config.horizonUrl.startsWith('http://'),
    });
  }, [currentNetwork]);

  useEffect(() => {
    if (!publicKey || !server) {
      setLoading(false);
      return;
    }

    const fetchBalances = async () => {
      setLoading(true);
      try {
        const account = await server.loadAccount(publicKey);
        setBalances(account.balances);
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
  }, [publicKey, server]);

  return { balances, loading, error, server };
};

const GlobalAssets: React.FC<AllAssetsProps> = ({ userAddress, onAddAsset }) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const stellarAddress = connectedWallets[WalletType.STELLAR]?.address || userAddress || '';
  const provider = getProvider(WalletType.STELLAR);

  const {
    balances: issuerBalances,
    loading: issuerLoading,
    server,
  } = useStellarBalances(stellarAddress);

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [userAssets, setUserAssets] = useState<UserAsset[]>([]);
  const [trustlineProcessing, setTrustlineProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [typeFilter, setTypeFilter] = useState('Any type');

  useEffect(() => {
    if (!stellarAddress || !server) return;
    const fetchUserTrustlines = async () => {
      try {
        const account = await server.loadAccount(stellarAddress);
        const processed = account.balances.map((b: any) => ({
          asset_code: b.asset_type === 'native' ? 'XLM' : b.asset_code,
          asset_issuer: b.asset_type === 'native' ? '' : b.asset_issuer,
          asset_type: b.asset_type,
        }));
        setUserAssets(processed);
      } catch (e) {
        console.error(e);
      }
    };
    fetchUserTrustlines();
  }, [stellarAddress, server]);

  useEffect(() => {
    if (!issuerBalances.length || !server) return;
    const processAssets = async () => {
      const processed = await Promise.all(
        issuerBalances.map(async (b: any) => {
          let numAccounts = 0;
          if (b.asset_type !== 'native') {
            try {
              const res = await server
                .assets()
                .forCode(b.asset_code)
                .forIssuer(b.asset_issuer)
                .call();
              numAccounts = res.records[0]?.accounts?.authorized || 0;
            } catch {}
          }
          return {
            asset_code: b.asset_type === 'native' ? 'XLM' : b.asset_code,
            asset_issuer: b.asset_type === 'native' ? '' : b.asset_issuer,
            asset_type: b.asset_type,
            balance: b.balance,
            limit: b.limit,
            is_authorized: b.is_authorized !== false,
            num_accounts: numAccounts,
          };
        })
      );
      setAssets(processed);
    };
    processAssets();
  }, [issuerBalances, server]);

  const isAssetTrusted = (asset: AssetItem) => {
    if (asset.asset_type === 'native') return true;
    return userAssets.some(
      u => u.asset_code === asset.asset_code && u.asset_issuer === asset.asset_issuer
    );
  };

  const handleAddAsset = async (assetItem: AssetItem) => {
    if (!server || !stellarAddress || !provider) return;
    setTrustlineProcessing(assetItem.asset_code);
    try {
      const sourceAccount = await server.loadAccount(stellarAddress);
      const config = getStellarConfig(currentNetwork);
      const networkPassphrase = config?.networkPassphrase || Networks.TESTNET;

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          Operation.changeTrust({
            asset: new Asset(assetItem.asset_code, assetItem.asset_issuer),
          })
        )
        .setTimeout(30)
        .build();

      const result = await provider.request({
        method: 'stellar_signAndSubmitXDR',
        params: {
          xdr: transaction.toXDR(),
          network: currentNetwork.toUpperCase(),
          networkPassphrase,
        },
      });

      if (result.status === 'success') {
        onAddAsset(`${assetItem.asset_code}:${assetItem.asset_issuer}`);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTrustlineProcessing(null);
    }
  };

  const filteredAssets = assets.filter(asset => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      !s ||
      asset.asset_code.toLowerCase().includes(s) ||
      asset.asset_issuer.toLowerCase().includes(s);
    const matchesType =
      typeFilter === 'Any type' ||
      (typeFilter === 'Native' ? asset.asset_type === 'native' : asset.asset_type !== 'native');
    return matchesSearch && matchesType;
  });

  return (
    <div className="bg-secondary max-w-[90vw] w-full rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="sticky top-0 z-10 bg-tertiary border-b border-color p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input input-md pl-10 w-full"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="input input-md"
        >
          <option>Any type</option>
          <option>Native</option>
          <option>Issued</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-6 text-sm font-medium bg-tertiary px-6 py-3 border-b border-color">
            <div>ASSET</div>
            <div>TYPE</div>
            <div className="text-right">BALANCE</div>
            <div className="text-center">AUTHORIZED</div>
            <div className="text-right">ACCOUNTS</div>
            <div className="text-right">ACTION</div>
          </div>
          {issuerLoading ? (
            <div className="py-12 text-center animate-pulse">Loading...</div>
          ) : (
            filteredAssets.map((asset, i) => (
              <div
                key={i}
                className="grid grid-cols-6 items-center px-6 py-4 border-b border-color hover:bg-hover transition-colors"
              >
                <div className="font-semibold">{asset.asset_code}</div>
                <div className="text-sm opacity-70 capitalize">
                  {asset.asset_type.replace('_', ' ')}
                </div>
                <div className="text-right font-mono">{parseFloat(asset.balance).toFixed(4)}</div>
                <div className="text-center">
                  <span
                    className={`badge ${asset.is_authorized ? 'badge-success' : 'badge-danger'}`}
                  >
                    {asset.is_authorized ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="text-right">{asset.num_accounts?.toLocaleString() || 'N/A'}</div>
                <div className="text-right">
                  {asset.asset_type === 'native' ? null : isAssetTrusted(asset) ? (
                    <span className="text-success text-sm font-medium">Trusted</span>
                  ) : (
                    <button
                      onClick={() => handleAddAsset(asset)}
                      disabled={trustlineProcessing === asset.asset_code}
                      className="btn-outline btn-sm px-4 py-1 rounded"
                    >
                      {trustlineProcessing === asset.asset_code ? '...' : 'Add Trust'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalAssets;
