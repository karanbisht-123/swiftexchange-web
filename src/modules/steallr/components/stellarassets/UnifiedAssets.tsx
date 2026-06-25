import { AlertCircle, CheckCircle2, ChevronRight, Loader2, Search, Trash2 } from 'lucide-react';
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
    const seenCodes = new Set<string>();
    const stellarChain = getChainById('pubnet');

    balances.forEach((b: any) => {
      const code = b.asset_type === 'native' ? 'XLM' : b.asset_code;
      const issuer = b.asset_type === 'native' ? '' : b.asset_issuer;
      const key = getAssetKey(code, issuer);
      const registryAsset = stellarChain?.assets.find(
        a => a.symbol === code && (a.address === issuer || issuer === '')
      );

      seenCodes.add(code);
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

      if (!assetsMap.has(key) && !seenCodes.has(code)) {
        seenCodes.add(code);
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

  const handleTrustlineAction = async (asset: DisplayAsset, action: 'add' | 'remove') => {
    if (!server || !stellarAddress || !provider) return;

    setTrustlineProcessing(`${asset.code}-${asset.issuer}`);

    try {
      const xdr = await buildTrustlineTransaction(
        {
          server,
          stellarAddress,
          assetCode: asset.code,
          assetIssuer: asset.issuer,
          currentNetwork,
        },
        action === 'remove' ? '0' : undefined
      );

      const config = getStellarConfig(currentNetwork);
      const networkPassphrase = config?.networkPassphrase || '';
      const result = await signAndSubmitTrustline(xdr, currentNetwork, networkPassphrase, provider);

      if (result.success) {
        addLocalTransaction({
          hash: result.transactionHash || '',
          chainId: 'pubnet',
          type: 'trustline',
          timestamp: Date.now(),
          description: `${action === 'add' ? 'Added' : 'Removed'} trustline for ${asset.code}`,
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
      useTransactionModalStore.getState().openModal({
        status: 'error',
        type: 'Trustline',
        error: err?.message || `Failed to ${action} trustline. Please try again.`,
        isStellar: true,
      });
    } finally {
      setTrustlineProcessing(null);
    }
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
    <div className="bg-secondary w-full flex flex-col overflow-hidden">
      <div className="sticky top-0 z-10 bg-secondary/80 backdrop-blur-lg border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50 pointer-events-none" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-10 py-2.5 lg:py-3 bg-transparent text-sm focus:outline-none placeholder:text-muted/50"
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted animate-spin" />
          )}
        </div>
        {searchTerm && (
          <p className="text-[10px] text-muted/60 px-3 pb-1.5">
            {searchLoading ? 'Searching...' : `${displayedAssets.length} found`}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading && !displayedAssets.length ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
            <p className="text-muted text-sm">Loading assets...</p>
          </div>
        ) : displayedAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <AlertCircle className="w-9 h-9 text-muted opacity-40" />
            <div className="text-center">
              <p className="text-sm font-medium mb-1">
                {searchTerm ? 'No results' : 'No assets yet'}
              </p>
              <p className="text-xs text-muted">
                {searchTerm ? 'Try USDC or AQUA' : 'Connect your wallet to view assets'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {displayedAssets.map((asset, i) => {
              const uniqueKey = `${getAssetKey(asset.code, asset.issuer)}-${i}`;
              const isProcessing = trustlineProcessing === `${asset.code}-${asset.issuer}`;

              return (
                <div
                  key={uniqueKey}
                  onClick={() => handleAssetClick(asset)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 lg:px-4 lg:py-3.5
                    transition-colors duration-100
                    ${asset.isTrusted
                      ? 'hover:bg-white/[0.03] cursor-pointer active:bg-white/[0.05]'
                      : ''
                    }
                  `}
                >
                  <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                    {asset.iconUrl ? (
                      <img
                        src={asset.iconUrl}
                        alt={asset.code}
                        className="w-full h-full object-cover"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = `<span class="font-bold text-xs text-primary">${asset.code[0]}</span>`;
                          }
                        }}
                      />
                    ) : (
                      <span className="font-bold text-xs text-primary">{asset.code[0]}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-px">
                      <span className="font-semibold text-[13px] text-text-primary truncate">
                        {asset.name || asset.code}
                      </span>
                      {asset.isTrusted && (
                        <CheckCircle2 size={10} className="text-green-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted/60 font-mono">
                      <span>{asset.code}</span>
                      {asset.issuer && (
                        <>
                          <span className="opacity-30">·</span>
                          <span className="truncate max-w-[90px] lg:max-w-[140px]">
                            {truncateAddress(asset.issuer)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {asset.isTrusted ? (
                      <>
                        <div className="text-right mr-0.5">
                          <div className="font-bold text-[13px] tabular-nums text-text-primary">
                            {formatAssetBalance(asset.balance)}
                          </div>
                        </div>
                        {parseFloat(asset.balance) === 0 && asset.type !== 'native' ? (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setConfirmModal({ isOpen: true, type: 'remove', asset });
                            }}
                            disabled={isProcessing}
                            className="p-1.5 text-muted/50 hover:text-danger hover:bg-danger/10 rounded-md transition-colors active:scale-95"
                          >
                            {isProcessing ? (
                              <Loader2 size={14} className="animate-spin text-primary" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        ) : (
                          <ChevronRight size={14} className="text-muted/30" />
                        )}
                      </>
                    ) : (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmModal({ isOpen: true, type: 'add', asset });
                        }}
                        disabled={isProcessing}
                        className="px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/15 text-primary text-[11px] font-semibold transition-colors disabled:opacity-50 active:scale-95"
                      >
                        {isProcessing ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          'Add'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!stellarAddress && (
        <div className="p-2.5 bg-yellow-500/10 border-t border-yellow-500/20">
          <p className="text-[11px] text-yellow-600 dark:text-yellow-400 text-center">
            Connect your Stellar wallet to manage assets
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
                ? `Add a trustline for ${confirmModal.asset?.code}? This reserves 0.5 XLM.`
                : `Remove the trustline for ${confirmModal.asset?.code}? This reclaims 0.5 XLM.`
              }
            </p>
            <p className="text-xs opacity-60">You'll need to sign in your wallet.</p>
          </div>
        }
        confirmText={confirmModal.type === 'add' ? 'Add Now' : 'Remove Now'}
        confirmButtonType={confirmModal.type === 'add' ? 'primary' : 'danger'}
        onConfirm={() => {
          if (confirmModal.asset) {
            handleTrustlineAction(confirmModal.asset, confirmModal.type);
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default UnifiedAssets;