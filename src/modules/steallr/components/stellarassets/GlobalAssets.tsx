import { Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import {
  Asset,
  BASE_FEE,
  Horizon,
  // Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from 'stellar-sdk';

import { getStellarConfig } from '../../../walletconnect/config/chains';
// import { isStellarNetwork } from '../../../utils/transactionUtils';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';

interface AssetItem {
  asset_code: string;
  asset_issuer: string;
  asset_type: string;
  balance: string;
  limit?: string;
  buying_liabilities: string;
  selling_liabilities: string;
  is_authorized: boolean;
  is_authorized_to_maintain_liabilities: boolean;
  last_modified_ledger: number;
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

export const useStellarBalances = (publicKey?: string, networkKey: string = 'testnet') => {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [server, setServer] = useState<Horizon.Server | null>(null);

  useEffect(() => {
    const initServer = () => {
      try {
        const config = getStellarConfig();
        if (!config) {
          throw new Error(`Unsupported Stellar network: ${networkKey}`);
        }

        const serverOptions: any = {};
        if (config.horizonUrl.startsWith('http://')) {
          serverOptions.allowHttp = true;
        }

        const stellarServer = new Horizon.Server(config.horizonUrl, serverOptions);
        setServer(stellarServer);
      } catch (err) {
        setError(err as Error);
        console.error('Error initializing Stellar server:', err);
      }
    };

    initServer();
  }, [networkKey]);

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
      } catch (err) {
        setError(err as Error);
        console.error('Error fetching balances:', err);
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
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || userAddress || '';
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
  const [assetFilter, setAssetFilter] = useState<string>('All assets');
  const [typeFilter, setTypeFilter] = useState<string>('Any type');

  useEffect(() => {
    const fetchUserAssets = async () => {
      if (!stellarAddress || !server) return;
      try {
        const account = await server.loadAccount(stellarAddress);
        const balances = account.balances;
        const processed = balances.map((b: any) => ({
          asset_code: b.asset_type === 'native' ? 'XLM' : b.asset_code,
          asset_issuer: b.asset_type === 'native' ? '' : b.asset_issuer,
          asset_type: b.asset_type,
        }));
        setUserAssets(processed);
      } catch (error) {
        console.error('Error fetching user assets:', error);
      }
    };
    fetchUserAssets();
  }, [stellarAddress, server]);

  useEffect(() => {
    const processAssets = async () => {
      if (!issuerBalances.length || !server) return;
      const processed = await Promise.all(
        issuerBalances.map(async (balance: any) => {
          const assetCode = balance.asset_type === 'native' ? 'XLM' : balance.asset_code;
          const assetIssuer = balance.asset_type === 'native' ? '' : balance.asset_issuer;
          let numAccounts = 0;

          if (balance.asset_type !== 'native') {
            try {
              const res = await server
                .assets()
                .forCode(balance.asset_code)
                .forIssuer(balance.asset_issuer)
                .call();
              numAccounts = res.records[0]?.accounts?.authorized || 0;
            } catch {
              numAccounts = 0;
            }
          }

          return {
            asset_code: assetCode,
            asset_issuer: assetIssuer,
            asset_type: balance.asset_type,
            balance: balance.balance,
            limit: balance.limit,
            buying_liabilities: balance.buying_liabilities,
            selling_liabilities: balance.selling_liabilities,
            is_authorized: balance.is_authorized !== undefined ? balance.is_authorized : true,
            is_authorized_to_maintain_liabilities:
              balance.is_authorized_to_maintain_liabilities !== undefined
                ? balance.is_authorized_to_maintain_liabilities
                : true,
            last_modified_ledger: balance.last_modified_ledger,
            num_accounts: numAccounts,
          };
        })
      );
      setAssets(processed);
    };

    processAssets();
  }, [issuerBalances, server]);

  const isAssetTrusted = (asset: AssetItem): boolean => {
    if (asset.asset_type === 'native') return true;
    return userAssets.some(
      u => u.asset_code === asset.asset_code && u.asset_issuer === asset.asset_issuer
    );
  };

  const buildTrustlineTransaction = async (assetItem: AssetItem) => {
    if (!server || !stellarAddress) {
      throw new Error('Server or address not available');
    }

    const sourceAccount = await server.loadAccount(stellarAddress);
    const txBuilder = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: getStellarConfig()?.networkPassphrase || Networks.TESTNET,
    });

    txBuilder.addOperation(
      Operation.changeTrust({
        asset: new Asset(assetItem.asset_code, assetItem.asset_issuer),
        limit: '1000000',
      })
    );

    txBuilder.setTimeout(30);

    const builtTx = txBuilder.build();
    const xdr = builtTx.toXDR();

    return {
      id: `trustline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'trustline',
      from: stellarAddress,
      asset: `${assetItem.asset_code}:${assetItem.asset_issuer}`,
      sequence: sourceAccount.sequence,
      fee: BASE_FEE,
      timestamp: Date.now(),
      status: 'pending',
      xdr,
      networkPassphrase: getStellarConfig()?.networkPassphrase || Networks.TESTNET,
    };
  };

  const executeTrustlineWithWalletConnect = async (transaction: any) => {
    if (!provider) {
      throw new Error('Wallet provider not available');
    }

    try {
      const isMainnet = transaction.networkPassphrase.includes('Public Global Stellar Network');
      const network = isMainnet ? 'MAINNET' : 'TESTNET';

      const signParams = {
        xdr: transaction.xdr,
        networkPassphrase: transaction.networkPassphrase,
        network,
      };

      const result = await provider.request({
        method: 'stellar_signAndSubmitXDR',
        params: signParams,
      });

      if (result.status === 'success') {
        return result.hash || result.transactionHash || 'stellar_submitted';
      }

      throw new Error('Stellar transaction failed');
    } catch (error: any) {
      console.error('Failed to execute trustline via WalletConnect:', error);
      throw new Error(
        `Trustline execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const handleAddAsset = async (assetItem: AssetItem) => {
    if (assetItem.asset_type === 'native') {
      alert('Native XLM does not require a trustline.');
      return;
    }

    if (isAssetTrusted(assetItem)) {
      alert('Asset already trusted.');
      return;
    }

    if (!stellarWallet || !provider) {
      alert('Please connect your Stellar wallet.');
      return;
    }

    setTrustlineProcessing(assetItem.asset_code);

    try {
      const tx = await buildTrustlineTransaction(assetItem);
      const txHash = await executeTrustlineWithWalletConnect(tx);
      alert(`Trustline created for ${assetItem.asset_code}. TX: ${txHash}`);
      onAddAsset(`${assetItem.asset_code}:${assetItem.asset_issuer}`);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to create trustline: ${err.message}`);
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
    const matchesAsset =
      assetFilter === 'All assets' ||
      (assetFilter === 'Stablecoins' && ['USDC', 'USDT', 'DAI'].includes(asset.asset_code)) ||
      (assetFilter === 'Cryptocurrencies' &&
        ['BTC', 'ETH', 'AQUA', 'XLM'].includes(asset.asset_code));
    const matchesType =
      typeFilter === 'Any type' ||
      (typeFilter === 'Native' && asset.asset_type === 'native') ||
      (typeFilter === 'Issued' && asset.asset_type !== 'native');

    return matchesSearch && matchesAsset && matchesType;
  });

  const formatBalance = (b: string) => {
    const num = parseFloat(b);
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
    return num.toFixed(7);
  };

  const formatNumber = (n: number) =>
    n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n.toLocaleString();

  return (
    <div className="bg-secondary  max-w-[90vw]  w-full  rounded-xl shadow-sm overflow-hidden flex flex-col animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tertiary border-b border-color p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Search by asset code or issuer"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input input-md pl-10 w-full"
            />
          </div>
          <select
            value={assetFilter}
            onChange={e => setAssetFilter(e.target.value)}
            className="input input-md flex-1 appearance-none"
          >
            <option>All assets</option>
            <option>Cryptocurrencies</option>
            <option>Stablecoins</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="input input-md flex-1 appearance-none"
          >
            <option>Any type</option>
            <option>Native</option>
            <option>Issued</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 text-sm font-medium bg-tertiary px-6 py-3 text-secondary border-b border-color">
            <div>ASSET</div>
            <div>TYPE</div>
            <div className="text-right">BALANCE</div>
            <div className="text-right">LIMIT</div>
            <div className="text-center">AUTHORIZED</div>
            <div className="text-right">ACCOUNTS</div>
            <div className="text-right">ACTION</div>
          </div>

          {issuerLoading ? (
            <div className="py-12 text-center text-muted animate-pulse">Loading assets...</div>
          ) : filteredAssets.length ? (
            filteredAssets.map((asset, i) => {
              const trusted = isAssetTrusted(asset);
              return (
                <div
                  key={`${asset.asset_code}-${asset.asset_issuer}-${i}`}
                  className="grid bg-primary mt-0.5 grid-cols-7 gap-4 items-center px-6 py-3 border-b border-color hover:bg-hover transition-colors duration-150"
                >
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{asset.asset_code}</span>
                      {trusted && <span className="badge badge-success">Trusted</span>}
                    </div>
                    {asset.asset_issuer && (
                      <div className="text-xs text-muted truncate">
                        {asset.asset_issuer.slice(0, 10)}...
                      </div>
                    )}
                  </div>

                  <div className="capitalize text-body">
                    {asset.asset_type.replace('credit_alphanum', 'Credit ')}
                  </div>

                  <div className="text-right font-mono">{formatBalance(asset.balance)}</div>

                  <div className="text-right text-secondary">
                    {asset.limit ? formatBalance(asset.limit) : 'N/A'}
                  </div>

                  <div className="text-center">
                    <span
                      className={`badge ${asset.is_authorized ? 'badge-success' : 'badge-danger'}`}
                    >
                      {asset.is_authorized ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="text-right text-secondary">
                    {asset.num_accounts ? formatNumber(asset.num_accounts) : 'N/A'}
                  </div>

                  <div className="text-right">
                    {asset.asset_type === 'native' ? (
                      <span className="text-muted text-xs">Native</span>
                    ) : trusted ? (
                      <span className="badge badge-success">Trusted</span>
                    ) : (
                      <button
                        onClick={() => handleAddAsset(asset)}
                        disabled={trustlineProcessing === asset.asset_code}
                        className=" py-1.5 rounded-md px-3 btn-outline btn-md"
                      >
                        {trustlineProcessing === asset.asset_code ? 'Adding...' : 'Add Trust'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-muted">
              <Search className="w-6 h-6 mx-auto mb-2 opacity-70" />
              No assets found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalAssets;
