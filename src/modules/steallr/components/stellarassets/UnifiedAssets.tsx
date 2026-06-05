import { AlertCircle, CheckCircle2, ChevronRight, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';
import { getStellarConfig } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { getAssetsForChain, getChainById } from '../../../evm/utils/Chainregistry';
import * as ChainUrlHelpers from '../../../evm/utils/ChainUrlHelpers';
import { useAssetSearch } from '../../hook/useAssetSearch';
import { useStellarBalances } from '../../hook/useStellarBalances';
import {
  buildTrustlineTransaction,
  formatAssetBalance,
  getAssetKey,
  signAndSubmitTrustline,
  truncateAddress,
} from '../../utils/assetUtils/assetUtils';
import { addLocalTransaction } from '../../../evm/service/localTransactionService';
import { useTransactionModalStore } from '../../../../store/transactionModalStore';

interface UnifiedAssetsProps {
  userAddress?: string;
  onAssetClick: (asset: AssetClickPayload) => void;
}

interface DisplayAsset {
  code: string;
  issuer: string;
  type: string;
  balance: string;
  isTrusted: boolean;
  iconUrl?: string;
  name?: string;
}

interface AssetClickPayload {
  ticker: string;
  quantity: number;
  network: string;
  code: string;
  issuer: string;
  iconUrl?: string;
  name?: string;
}

const AssetIcon: React.FC<{ asset: DisplayAsset }> = ({ asset }) => (
  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center overflow-hidden shrink-0 border-2 border-color">
    {asset.iconUrl ? (
      <img
        src={asset.iconUrl}
        alt={asset.code}
        className="w-full h-full object-cover"
        onError={e => {
          e.currentTarget.style.display = 'none';
          const parent = e.currentTarget.parentElement;
          if (parent) {
            parent.innerHTML = `<span class="font-bold text-lg text-primary">${asset.code[0]}</span>`;
          }
        }}
      />
    ) : (
      <span className="font-bold text-lg text-primary">{asset.code[0]}</span>
    )}
  </div>
);

const AssetInfo: React.FC<{ asset: DisplayAsset }> = ({ asset }) => (
  <div className="flex-1 min-w-0">
    <div className="font-semibold text-base mb-1 truncate">{asset.name || asset.code}</div>
    <div className="flex items-center gap-2 text-xs text-muted font-mono flex-wrap">
      <span className="font-medium">{asset.code}</span>
      {asset.issuer && (
        <>
          <span className="opacity-40">•</span>
          <span className="opacity-70 truncate max-w-[150px]">{truncateAddress(asset.issuer)}</span>
        </>
      )}
      {asset.isTrusted && (
        <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-medium border border-green-500/20 inline-flex items-center gap-1">
          <CheckCircle2 size={10} />
          Trusted
        </span>
      )}
    </div>
  </div>
);

const AssetBalance: React.FC<{ balance: string }> = ({ balance }) => (
  <div className="text-right">
    <div className="font-bold text-lg">{formatAssetBalance(balance)}</div>
    <div className="text-xs text-muted uppercase tracking-wide">Balance</div>
  </div>
);

const AddAssetButton: React.FC<{
  isProcessing: boolean;
  onClick: () => void;
}> = ({ isProcessing, onClick }) => (
  <button
    onClick={e => {
      e.stopPropagation();
      onClick();
    }}
    disabled={isProcessing}
    className="btn btn-sm gap-2 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border-2 border-primary/30 hover:border-primary/50 text-primary font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
  >
    {isProcessing ? (
      <>
        <Loader2 size={16} className="animate-spin" />
        Adding...
      </>
    ) : (
      <>
        <Plus size={16} />
        Add Asset
      </>
    )}
  </button>
);

const EmptyState: React.FC<{ isSearching: boolean }> = ({ isSearching }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-4">
    <AlertCircle className="w-12 h-12 text-muted opacity-50" />
    <div className="text-center">
      <p className="text-lg font-medium mb-2">
        {isSearching ? 'No results found' : 'No assets yet'}
      </p>
      <p className="text-sm text-muted">
        {isSearching
          ? 'Try a different search term like USDC or AQUA'
          : 'Connect your wallet to view your assets'}
      </p>
    </div>
  </div>
);

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-4">
    <Loader2 className="w-10 h-10 text-primary animate-spin" />
    <p className="text-muted">Loading your assets...</p>
  </div>
);

const UnifiedAssets: React.FC<UnifiedAssetsProps> = ({ userAddress, onAssetClick }) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const stellarAddress = connectedWallets[WalletType.STELLAR]?.address || userAddress || '';
  const provider = getProvider(WalletType.STELLAR);

  const { balances, loading, server, refetch } = useStellarBalances(stellarAddress);
  const [searchTerm, setSearchTerm] = useState('');
  const [trustlineProcessing, setTrustlineProcessing] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'add' | 'remove';
    asset: DisplayAsset | null;
  }>({ isOpen: false, type: 'add', asset: null });

  const allAssets = useMemo(() => {
    const assetsMap = new Map<string, DisplayAsset>();

    const stellarChain = getChainById('pubnet');

    balances.forEach((b: any) => {
      const code = b.asset_type === 'native' ? 'XLM' : b.asset_code;
      const issuer = b.asset_type === 'native' ? '' : b.asset_issuer;
      const key = getAssetKey(code, issuer);
      const registryAsset = stellarChain?.assets.find(a => a.symbol === code && (a.address === issuer || issuer === ''));

      assetsMap.set(key, {
        code,
        issuer,
        type: b.asset_type,
        balance: b.balance,
        isTrusted: true,
        iconUrl: registryAsset?.logoURI || ChainUrlHelpers.getTokenIcon(code, stellarChain, issuer),
        name: registryAsset?.name || code,
      });
    });

    getAssetsForChain('pubnet').forEach(asset => {
      const code = asset.symbol;
      const issuer = asset.address === 'native' ? '' : asset.address;
      const key = getAssetKey(code, issuer);

      if (!assetsMap.has(key)) {
        assetsMap.set(key, {
          code,
          issuer,
          type: asset.address === 'native' ? 'native' : 'credit_alphanum12',
          balance: '0.0000000',
          isTrusted: false,
          iconUrl: asset.logoURI,
          name: asset.name,
        });
      }
    });

    return Array.from(assetsMap.values()).sort((a, b) => {
      if (a.isTrusted !== b.isTrusted) return a.isTrusted ? -1 : 1;
      if (a.code !== b.code) return a.code.localeCompare(b.code);
      return a.issuer.localeCompare(b.issuer);
    });
  }, [balances]);

  const { displayedAssets, searchLoading } = useAssetSearch({
    allAssets,
    searchTerm,
    server,
  });

  const handleAddTrustline = async (asset: DisplayAsset) => {
    if (!server || !stellarAddress || !provider) return;

    setTrustlineProcessing(`${asset.code}-${asset.issuer}`);

    try {
      const xdr = await buildTrustlineTransaction({
        server,
        stellarAddress,
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        currentNetwork,
      });

      const config = getStellarConfig(currentNetwork);
      const networkPassphrase = config?.networkPassphrase || '';

      const result = await signAndSubmitTrustline(xdr, currentNetwork, networkPassphrase, provider);

      if (result.success) {
        addLocalTransaction({
          hash: result.transactionHash || '',
          chainId: 'pubnet',
          type: 'trustline',
          timestamp: Date.now(),
          description: `Added trustline for ${asset.code}`,
          status: 'success',
          from: stellarAddress,
          network: currentNetwork,
        });

        useTransactionModalStore.getState().openModal({
          status: 'success',
          type: 'Trustline',
          hash: result.transactionHash || undefined,
          isStellar: true,
        });

        refetch();
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      console.error('Trustline error:', err);
      useTransactionModalStore.getState().openModal({
        status: 'error',
        type: 'Trustline',
        error: err?.message || 'Failed to add trustline. Please try again.',
        isStellar: true,
      });
    } finally {
      setTrustlineProcessing(null);
    }
  };

  const handleRemoveTrustline = async (asset: DisplayAsset) => {
    if (!server || !stellarAddress || !provider) return;

    setTrustlineProcessing(`${asset.code}-${asset.issuer}`);

    try {
      const xdr = await buildTrustlineTransaction({
        server,
        stellarAddress,
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        currentNetwork,
      }, "0"); // Limit 0 means remove

      const config = getStellarConfig(currentNetwork);
      const networkPassphrase = config?.networkPassphrase || '';

      const result = await signAndSubmitTrustline(xdr, currentNetwork, networkPassphrase, provider);

      if (result.success) {
        addLocalTransaction({
          hash: result.transactionHash || '',
          chainId: 'pubnet',
          type: 'trustline',
          timestamp: Date.now(),
          description: `Removed trustline for ${asset.code}`,
          status: 'success',
          from: stellarAddress,
          network: currentNetwork,
        });

        useTransactionModalStore.getState().openModal({
          status: 'success',
          type: 'Trustline',
          hash: result.transactionHash || undefined,
          isStellar: true,
        });

        refetch();
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      console.error('Trustline removal error:', err);
      useTransactionModalStore.getState().openModal({
        status: 'error',
        type: 'Trustline',
        error: err?.message || 'Failed to remove trustline. Please try again.',
        isStellar: true,
      });
    } finally {
      setTrustlineProcessing(null);
    }
  };

  const openAddConfirmation = (asset: DisplayAsset) => {
    setConfirmModal({ isOpen: true, type: 'add', asset });
  };

  const openRemoveConfirmation = (asset: DisplayAsset) => {
    setConfirmModal({ isOpen: true, type: 'remove', asset });
  };

  const handleAssetClick = (asset: DisplayAsset) => {
    if (!asset.isTrusted) return;

    onAssetClick({
      ticker: asset.code,
      quantity: parseFloat(asset.balance),
      network: 'Stellar',
      code: asset.code,
      issuer: asset.issuer,
      iconUrl: asset.iconUrl,
      name: asset.name,
    });
  };

  return (
    <div className="bg-secondary w-full  flex flex-col  overflow-hidden ">
      <div className="bg-linear-to-br from-tertiary to-secondary sticky top-0 z-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search assets or discover new ones..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input input-md pl-12 pr-4 w-full bg-secondary border-2 border-color focus:border-primary transition-all rounded-xl"
          />
          {searchLoading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted animate-spin" />
          )}
        </div>
        {searchTerm && (
          <p className="text-xs text-muted mt-2 ml-1">
            {searchLoading
              ? 'Searching Stellar network...'
              : `Found ${displayedAssets.length} assets`}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading && !displayedAssets.length ? (
          <LoadingState />
        ) : displayedAssets.length === 0 ? (
          <EmptyState isSearching={!!searchTerm} />
        ) : (
          <div className="">
            {displayedAssets.map((asset, i) => {
              const uniqueKey = `${getAssetKey(asset.code, asset.issuer)}-${i}`;
              const isProcessing = trustlineProcessing === `${asset.code}-${asset.issuer}`;

              return (
                <div
                  key={uniqueKey}
                  onClick={() => handleAssetClick(asset)}
                  className={`
                                        flex items-center justify-between px-2 py-5 
                                        transition-all duration-200
                                        ${asset.isTrusted
                      ? 'hover:bg-hover hover:shadow-sm cursor-pointer active:scale-[0.99]'
                      : 'opacity-80'
                    }
                                    `}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <AssetIcon asset={asset} />
                    <AssetInfo asset={asset} />
                  </div>

                  <div className="flex items-center gap-4 ml-4">
                    {asset.isTrusted ? (
                      <>
                        <AssetBalance balance={asset.balance} />
                        {parseFloat(asset.balance) === 0 && asset.type !== 'native' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openRemoveConfirmation(asset);
                            }}
                            disabled={isProcessing}
                            className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors active:scale-95"
                            title="Remove Trustline"
                          >
                            {isProcessing ? (
                              <Loader2 size={18} className="animate-spin text-primary" />
                            ) : (
                              <Trash2 size={18} />
                            )}
                          </button>
                        )}
                        <ChevronRight size={20} className="text-muted shrink-0" />
                      </>
                    ) : (
                      <AddAssetButton
                        isProcessing={isProcessing}
                        onClick={() => openAddConfirmation(asset)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!stellarAddress && (
        <div className="p-4 bg-yellow-500/10 border-t border-yellow-500/20">
          <p className="text-sm text-yellow-700 dark:text-yellow-400 text-center">
            Connect your Stellar wallet to view and manage assets
          </p>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.type === 'add' ? 'Add Trustline' : 'Remove Trustline'}
        message={
          <div className="space-y-2">
            <p>
              {confirmModal.type === 'add'
                ? `You are about to add a trustline for ${confirmModal.asset?.code}. This will reserve 0.5 XLM in your account.`
                : `You are about to remove the trustline for ${confirmModal.asset?.code}. This will reclaim the 0.5 XLM reserve.`
              }
            </p>
            <p className="text-xs opacity-60">You'll need to sign a transaction in your wallet.</p>
          </div>
        }
        confirmText={confirmModal.type === 'add' ? 'Add Now' : 'Remove Now'}
        confirmButtonType={confirmModal.type === 'add' ? 'primary' : 'danger'}
        onConfirm={() => {
          if (confirmModal.asset) {
            if (confirmModal.type === 'add') {
              handleAddTrustline(confirmModal.asset);
            } else {
              handleRemoveTrustline(confirmModal.asset);
            }
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default UnifiedAssets;
