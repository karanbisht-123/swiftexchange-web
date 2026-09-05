import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  HelpCircle,
  Loader2,
  RefreshCw,
  Repeat,
  Wallet,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../constants/routes';
import { useSwapStore } from '../../../store/swapStore';
import { STELLAR_CHAIN_ID } from '../../evm/feature/swap/constants/swap.constants';
import {
  fetchNearIntentTokens,
  matchNearIntentToken,
} from '../../evm/feature/swap/services/oneClickApi';
import type { NearIntentToken } from '../../evm/feature/swap/services/oneClickApi';
import { getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { useStellarAccountStatus } from '../hooks/useStellarAccountStatus';
import { useWalletAssets } from '../hooks/useWalletAssets';
import type { Asset } from '../store/portfolioStore';
import { useWalletStore } from '../store/walletConnectStore';
import { portfolioUtils } from '../utils/portfolioUtils';

interface StellarActivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivated?: () => void;
  onSwitchToEVM?: () => void;
}

export const StellarActivationModal: React.FC<StellarActivationModalProps> = ({
  isOpen,
  onClose,
  onActivated,
  onSwitchToEVM,
}) => {
  const navigate = useNavigate();
  const stellarWallet = useWalletStore(state => state.connectedWallets.stellar);
  const address = stellarWallet?.address || '';
  const network = useWalletStore(state => state.network);

  const { isActive, isChecking, error, checkStatus } = useStellarAccountStatus(address);
  const [showWhyDetails, setShowWhyDetails] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(false);

  const { assets: userAssets, loading: assetsLoading } = useWalletAssets(network);
  const [nearIntentTokens, setNearIntentTokens] = useState<NearIntentToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  const {
    setFromChainId,
    setToChainId,
    setSellAssetSymbol,
    setSellAssetAddress,
    setBuyAssetSymbol,
    setBuyAssetAddress,
  } = useSwapStore();

  useEffect(() => {
    if (isActive === true) {
      setActivationSuccess(true);
      const timer = setTimeout(() => {
        if (onActivated) onActivated();
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isActive, onActivated, onClose]);

  useEffect(() => {
    if (isOpen) {
      let isMounted = true;
      const loadTokens = async () => {
        setLoadingTokens(true);
        try {
          const tokens = await fetchNearIntentTokens();
          if (isMounted) setNearIntentTokens(tokens);
        } catch (err) {
          console.error('Failed to fetch near intent tokens', err);
        } finally {
          if (isMounted) setLoadingTokens(false);
        }
      };
      loadTokens();
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen]);

  const swappableAssets = useMemo(() => {
    if (!userAssets || !nearIntentTokens.length) return [];
    return userAssets.filter(asset => {
      if (asset.chainType !== 'evm' || !asset.balance || asset.balance <= 0) return false;
      const match = matchNearIntentToken(
        nearIntentTokens,
        asset.symbol,
        asset.address,
        asset.chainId
      );
      return !!match;
    });
  }, [userAssets, nearIntentTokens]);

  const handleManualCheck = async () => {
    const active = await checkStatus(true);
    if (active) {
      setActivationSuccess(true);
      setTimeout(() => {
        if (onActivated) onActivated();
        onClose();
      }, 1200);
    }
  };

  const handleAssetClick = (asset: Asset) => {
    setFromChainId(asset.chainId || 1);
    setSellAssetSymbol(asset.symbol);
    setSellAssetAddress(asset.address || 'native');

    setToChainId(STELLAR_CHAIN_ID);
    setBuyAssetSymbol('XLM');
    setBuyAssetAddress('native');

    onClose();
    navigate(ROUTES.TRADING_EVM_SWAP);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg bg-secondary border border-color rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-color flex items-center justify-between bg-secondary z-10">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-primary tracking-tight">
                  Activate Stellar Wallet
                </h2>
                <span className="badge badge-warning text-[10px] uppercase font-bold tracking-widest">
                  1 XLM Req
                </span>
              </div>
              <p className="text-xs text-muted mt-1 font-medium">
                Fund ~1 XLM to initialize your self-custody wallet
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-tertiary text-muted hover:text-primary hover:bg-hover active:scale-95 transition-all shadow-sm border border-color/50"
            title="Close"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-left hide-scrollbar relative">
          {activationSuccess && (
            <div className="p-4 bg-success/10 border border-success/20 rounded-2xl flex items-center gap-4 animate-fade-in shadow-sm">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-success" strokeWidth={3} />
              </div>
              <div>
                <p className="font-bold text-sm text-success">Account Activated Successfully</p>
                <p className="text-xs text-success/80 font-medium mt-0.5">
                  Your Stellar account is now live and ready to trade.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                <Repeat size={14} className="text-brand" /> Cross-Chain Swap
              </h3>
            </div>

            <div className="bg-tertiary border border-color rounded-2xl p-2 min-h-[160px] max-h-[220px] overflow-y-auto hide-scrollbar shadow-inner relative">
              {loadingTokens || assetsLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-tertiary/50 backdrop-blur-sm z-10 rounded-2xl">
                  <Loader2 size={24} className="animate-spin text-brand" />
                  <span className="text-[11px] font-bold text-muted tracking-widest uppercase">
                    Loading Assets...
                  </span>
                </div>
              ) : swappableAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 gap-3 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-secondary border border-color flex items-center justify-center shadow-sm">
                    <Wallet size={20} className="text-muted opacity-50" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-primary block mb-1">
                      No Swappable Assets
                    </span>
                    <span className="text-xs text-muted max-w-xs block leading-relaxed">
                      You don't have any EVM balances supported for 1-click Stellar swaps.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {swappableAssets.map(asset => (
                    <button
                      key={`${asset.chainId}-${asset.symbol}-${asset.address}`}
                      onClick={() => handleAssetClick(asset)}
                      className="flex items-center gap-3 w-full bg-secondary hover:bg-hover active:scale-[0.98] border border-transparent hover:border-color rounded-xl p-3 transition-all text-left group shadow-sm"
                    >
                      <div className="relative shrink-0">
                        <img
                          src={asset.image}
                          className="w-10 h-10 rounded-full bg-tertiary shadow-sm"
                          alt={asset.symbol}
                          onError={e => {
                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${asset.symbol}&background=random`;
                          }}
                        />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-secondary border border-color flex items-center justify-center shadow-sm">
                          {getChainLogoUrl(asset.chainId || 0) ? (
                            <img
                              src={getChainLogoUrl(asset.chainId || 0)}
                              alt={asset.chainName}
                              className="w-2.5 h-2.5 rounded-full"
                            />
                          ) : (
                            <span className="text-[6px] font-bold text-muted">
                              {asset.chainName?.[0] || '?'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[15px] text-primary">{asset.symbol}</span>
                        </div>
                        <span className="text-[11px] font-medium text-muted truncate block mt-0.5">
                          on {asset.chainName}
                        </span>
                      </div>

                      <div className="text-right shrink-0 mr-2">
                        <div className="text-[13px] font-bold text-primary">
                          {portfolioUtils.formatBalance(asset.balance)}
                        </div>
                        <div className="text-[10px] font-medium text-muted mt-0.5">
                          {portfolioUtils.formatUSD(
                            (asset.balance || 0) * (asset.current_price || 0)
                          )}
                        </div>
                      </div>

                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-muted group-hover:bg-brand group-hover:text-white transition-colors shrink-0 shadow-sm border border-color/50">
                        <ArrowRight size={14} strokeWidth={2.5} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 my-2 opacity-60">
            <div className="h-px bg-color flex-1" />
            <span className="text-[10px] font-black text-muted uppercase tracking-widest">OR</span>
            <div className="h-px bg-color flex-1" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                <CreditCard size={14} className="text-brand" /> Buy with Fiat
              </h3>
            </div>
            <button
              onClick={() => {
                onClose();
                navigate(ROUTES.TRADING_EVM_FIAT, {
                  state: {
                    defaultCrypto: 'XLM',
                    defaultNetwork: 'XLM',
                    defaultAddress: address,
                  },
                });
              }}
              className="w-full bg-gradient-to-r from-brand/10 to-transparent hover:from-brand/15 border border-brand/30 active:scale-[0.98] rounded-2xl p-4 transition-all text-left group flex items-center justify-between shadow-sm relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-brand/5 to-transparent opacity-50 pointer-events-none" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-10 h-10 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand shrink-0">
                  <CreditCard size={20} strokeWidth={2} />
                </div>
                <div>
                  <h4 className="font-bold text-primary text-sm group-hover:text-brand transition-colors">
                    Buy XLM with Card
                  </h4>
                  <p className="text-xs text-muted font-medium mt-0.5 max-w-[200px]">
                    Use our fiat on-ramp to buy XLM instantly.
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand group-hover:bg-brand group-hover:text-white transition-colors shrink-0 shadow-sm relative z-10">
                <ArrowRight size={14} strokeWidth={2.5} />
              </div>
            </button>
          </div>

          <div className="bg-secondary border border-color rounded-2xl p-4 transition-all mt-6 shadow-sm">
            <button
              onClick={() => setShowWhyDetails(!showWhyDetails)}
              className="w-full flex items-center justify-between text-left group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-tertiary flex items-center justify-center border border-color shadow-sm">
                  <HelpCircle
                    size={12}
                    className="text-muted group-hover:text-primary transition-colors"
                  />
                </div>
                <span className="text-xs font-bold text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                  Why is this required?
                </span>
              </div>
              {showWhyDetails ? (
                <ChevronUp size={14} className="text-muted" />
              ) : (
                <ChevronDown size={14} className="text-muted" />
              )}
            </button>

            {showWhyDetails && (
              <div className="mt-4 pt-4 border-t border-color/50 space-y-3 text-[11px] text-muted font-medium leading-relaxed animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                  <div>
                    <span className="font-bold text-primary">Anti-Spam Reserve:</span> Stellar
                    requires a minimum 1 XLM reserve balance to prevent network ledger spam.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                  <div>
                    <span className="font-bold text-primary">Fully Retained:</span> The 1 XLM
                    remains yours and stays securely in your wallet. We take zero fees.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                  <div>
                    <span className="font-bold text-primary">One-Time Only:</span> Once funded, you
                    can freely hold and swap all tokens forever.
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/20 text-danger rounded-xl p-3 text-xs font-medium flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-color bg-tertiary flex items-center justify-between gap-3 z-10">
          {onSwitchToEVM ? (
            <button
              onClick={() => {
                onClose();
                onSwitchToEVM();
              }}
              className="text-xs font-bold text-muted hover:text-primary transition-colors underline underline-offset-4 decoration-color hover:decoration-primary"
            >
              Skip & Continue to EVM Swap
            </button>
          ) : (
            <button
              onClick={onClose}
              className="text-xs font-bold text-muted hover:text-primary transition-colors px-2"
            >
              Dismiss
            </button>
          )}

          <button
            onClick={handleManualCheck}
            disabled={isChecking}
            className="btn btn-primary btn-sm py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-2 rounded-xl shadow-sm"
          >
            {isChecking ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <RefreshCw size={13} />
                <span>Refresh Status</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
