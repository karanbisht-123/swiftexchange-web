import { ArrowLeft, Check, KeyRound, ShieldCheck, Sparkles, Wallet, X, Zap } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ROUTES } from '../../../constants/routes';
import { useAsterAgent } from '../../../perps/adapters/aster/hooks/useAsterAgent';
import router from '../../../routes';
import { EVM_WALLETS, STELLAR_WALLETS, type WalletConfig } from '../constants/Wallet';
import { hasStoredAgentKey } from '../services/asterAgentKeyManager';
import { useWalletStore } from '../store/walletConnectStore';

type WalletType = 'evm' | 'stellar';

const WALLETCONNECT_ICON =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU';

export const WalletListModal: React.FC = () => {
  const {
    connectedWallets,
    isModalOpen,
    closeModal,
    connectWallet,
    connectUnified,
    disconnect,
    connectionStatus,
    isAuthenticated,
    isAuthenticating,
    authError,
    authenticateEvm,
    tradingAuthEnabled,
    setTradingAuthEnabled,
  } = useWalletStore();

  const asterAgent = useAsterAgent();

  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [disconnectingType, setDisconnectingType] = useState<WalletType | null>(null);
  const [viewMode, setViewMode] = useState<'onboarding' | 'wallets'>('wallets');
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [error, setError] = useState<string | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);

  const evmConnected = !!connectedWallets.evm;
  const stellarConnected = !!connectedWallets.stellar;
  const isSetupDone = isAuthenticated && (!tradingAuthEnabled || asterAgent.isReady);

  const handleComplete = useCallback(() => {
    closeModal();
    if (window.location.pathname !== ROUTES.TRADING_PERPS) {
      router.navigate(ROUTES.TRADING_PERPS);
    }
  }, [closeModal]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      setError(null);
      const needsOnboarding = evmConnected && !isSetupDone;
      setViewMode(needsOnboarding ? 'onboarding' : 'wallets');
    } else {
      document.body.style.overflow = 'unset';
      setConnectingWallet(null);
      setError(null);
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) return;
    if (evmConnected && !isSetupDone) {
      setViewMode('onboarding');
    }
  }, [isModalOpen, evmConnected, isSetupDone]);

  useEffect(() => {
    if (!isModalOpen || viewMode !== 'onboarding' || !isSetupDone) return;
    const timer = window.setTimeout(() => {
      handleComplete();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [isModalOpen, viewMode, isSetupDone, handleComplete]);

  useEffect(() => {
    return () => {
      if (connectTimeoutRef.current) window.clearTimeout(connectTimeoutRef.current);
    };
  }, []);

  const clearConnectTimeout = () => {
    if (connectTimeoutRef.current) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };

  const startConnectTimeout = () => {
    connectTimeoutRef.current = window.setTimeout(() => {
      setConnectingWallet(null);
      setError('Connection timed out. Please try again.');
    }, 125_000);
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const handleUnifiedConnect = useCallback(async () => {
    if (connectingWallet || disconnectingType) return;
    setConnectingWallet('unified-wc');
    setError(null);
    startConnectTimeout();
    try {
      await connectUnified('walletconnect');
      clearConnectTimeout();
      setConnectingWallet(null);
      setViewMode('onboarding');
    } catch (err: any) {
      clearConnectTimeout();
      setConnectingWallet(null);
      showError(err?.message || 'Connection failed. Please try again.');
    }
  }, [connectUnified, connectingWallet, disconnectingType]);

  const handleSwiftExUnifiedConnect = useCallback(async () => {
    if (connectingWallet || disconnectingType) return;
    setConnectingWallet('unified-swiftex');
    setError(null);
    startConnectTimeout();
    try {
      await connectUnified('swiftex');
      clearConnectTimeout();
      setConnectingWallet(null);
      setViewMode('onboarding');
    } catch (err: any) {
      clearConnectTimeout();
      setConnectingWallet(null);
      showError(err?.message || 'Connection failed. Please try again.');
    }
  }, [connectUnified, connectingWallet, disconnectingType]);

  const handleWalletClick = useCallback(
    async (wallet: WalletConfig) => {
      if (connectingWallet || disconnectingType) return;
      const key = `${wallet.type}-${wallet.id}`;
      setConnectingWallet(key);
      setError(null);
      startConnectTimeout();
      try {
        await connectWallet(wallet.type as WalletType, wallet.id);
        clearConnectTimeout();
        setConnectingWallet(null);
        if (wallet.type === 'evm') {
          setViewMode('onboarding');
        }
      } catch (err: any) {
        clearConnectTimeout();
        setConnectingWallet(null);
        showError(err?.message || 'Connection failed. Please try again.');
      }
    },
    [connectWallet, connectingWallet, disconnectingType]
  );

  const handleDisconnect = useCallback(
    async (type: WalletType) => {
      if (disconnectingType || connectingWallet) return;
      setDisconnectingType(type);
      setError(null);
      try {
        await disconnect(type);
        setDisconnectingType(null);
      } catch (err: any) {
        setDisconnectingType(null);
        showError(err?.message || 'Failed to disconnect. Please try again.');
      }
    },
    [disconnect, disconnectingType, connectingWallet]
  );

  const handleDeriveAster = useCallback(async () => {
    if (connectingWallet || disconnectingType || asterAgent.deriveState === 'signing') return;
    setError(null);
    try {
      await asterAgent.deriveAgentKey();
    } catch (err: any) {
      showError(
        err?.message?.includes('reject') ||
          err?.message?.includes('denied') ||
          err?.message?.includes('rejected')
          ? 'Trading signature rejected.'
          : err?.message || 'Failed to derive trading key.'
      );
    }
  }, [asterAgent, connectingWallet, disconnectingType]);

  const handleModalClose = useCallback(() => {
    if (
      disconnectingType ||
      connectionStatus.evm?.state === 'signing' ||
      asterAgent.deriveState === 'signing'
    )
      return;
    if (connectingWallet) {
      clearConnectTimeout();
      setConnectingWallet(null);
      setError(null);
    }
    closeModal();
    if (hasStoredAgentKey() || asterAgent.isReady) {
      if (window.location.pathname !== ROUTES.TRADING_PERPS) {
        router.navigate(ROUTES.TRADING_PERPS);
      }
    }
  }, [
    closeModal,
    connectingWallet,
    disconnectingType,
    connectionStatus,
    asterAgent.deriveState,
    asterAgent.isReady,
  ]);

  const formatAddress = useCallback(
    (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`,
    []
  );

  const getWalletConfig = useCallback(
    (type: WalletType, id: string): WalletConfig | undefined =>
      [...EVM_WALLETS, ...STELLAR_WALLETS].find(w => w.type === type && w.id === id),
    []
  );

  const isAnyActionInProgress = connectingWallet !== null || disconnectingType !== null;
  const isSigning =
    connectionStatus.evm?.state === 'signing' || asterAgent.deriveState === 'signing';

  useEffect(() => {
    if (!isModalOpen || !evmConnected) return;

    if (
      isAuthenticated &&
      tradingAuthEnabled &&
      !asterAgent.isReady &&
      asterAgent.deriveState === 'idle' &&
      !isAuthenticating
    ) {
      handleDeriveAster();
    }
  }, [
    isModalOpen,
    evmConnected,
    isAuthenticated,
    tradingAuthEnabled,
    asterAgent.isReady,
    asterAgent.deriveState,
    isAuthenticating,
    handleDeriveAster,
  ]);

  const renderConnectedCard = useCallback(
    (type: WalletType) => {
      const connected = connectedWallets[type];
      if (!connected) return null;

      const config = getWalletConfig(type, connected.walletId);
      const isDisconnecting = disconnectingType === type;

      return (
        <div
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-bg-tertiary)',
          }}
          className="flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all hover:border-[var(--color-brand-primary)]/40"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              style={{ background: 'var(--color-bg-secondary)' }}
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border border-[var(--color-border)] shadow-sm"
            >
              {config ? (
                <img
                  src={config.icon}
                  alt={config.name}
                  className="w-7 h-7 rounded-full object-contain"
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <Wallet className="w-5 h-5 text-[var(--color-brand-primary)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  style={{ color: 'var(--color-text-primary)' }}
                  className="text-xs font-semibold truncate"
                >
                  {config?.name ?? (type === 'evm' ? 'EVM Wallet' : 'Stellar Wallet')}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              <p
                style={{ color: 'var(--color-text-muted)' }}
                className="text-[11px] font-mono truncate mt-0.5"
              >
                {formatAddress(connected.address)}
              </p>
            </div>
          </div>

          <button
            onClick={() => handleDisconnect(type)}
            disabled={isDisconnecting || isAnyActionInProgress}
            style={{
              background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
              color: 'var(--color-danger)',
              borderColor: 'color-mix(in srgb, var(--color-danger) 25%, transparent)',
            }}
            className="px-3 py-1.5 rounded-xl border text-xs font-medium hover:opacity-80 transition-all disabled:opacity-50"
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      );
    },
    [
      connectedWallets,
      disconnectingType,
      isAnyActionInProgress,
      formatAddress,
      getWalletConfig,
      handleDisconnect,
    ]
  );

  const renderWalletCard = useCallback(
    ({
      id,
      name,
      icon,
      badge,
      isConnecting,
      onClick,
      disabled,
    }: {
      id: string;
      name: string;
      icon: string;
      badge?: string;
      isConnecting: boolean;
      onClick: () => void;
      disabled: boolean;
    }) => (
      <button
        key={id}
        onClick={onClick}
        disabled={disabled}
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-bg-tertiary)',
        }}
        className="flex flex-col items-center justify-center gap-2 p-2.5 rounded-2xl border hover:border-[var(--color-brand-primary)] hover:bg-[color-mix(in_srgb,var(--color-brand-primary)_8%,transparent)] hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative aspect-square"
      >
        {badge && (
          <span className="absolute top-1.5 right-1.5 text-[7px] px-1 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/25 uppercase tracking-wider leading-none">
            {badge}
          </span>
        )}

        {isConnecting && (
          <div
            style={{
              background: 'color-mix(in srgb, var(--color-bg-secondary) 85%, transparent)',
            }}
            className="absolute inset-0 flex items-center justify-center rounded-2xl backdrop-blur-sm z-10"
          >
            <div
              style={{
                borderColor: 'var(--color-brand-primary)',
                borderTopColor: 'transparent',
              }}
              className="w-5 h-5 border-2 rounded-full animate-spin"
            />
          </div>
        )}

        <div
          style={{ background: 'var(--color-bg-secondary)' }}
          className="w-10 h-10 rounded-2xl flex items-center justify-center p-1.5 border border-[var(--color-border)] shadow-sm group-hover:scale-105 transition-transform flex-shrink-0"
        >
          <img
            src={icon}
            alt={name}
            className="w-full h-full object-contain rounded-xl"
            onError={e => {
              e.currentTarget.style.display = 'none';
              const p = e.currentTarget.parentElement;
              if (p) {
                p.textContent = name[0];
                p.style.color = 'var(--color-text-muted)';
                p.style.fontWeight = '700';
                p.style.fontSize = '1rem';
              }
            }}
          />
        </div>

        <span
          style={{ color: 'var(--color-text-primary)' }}
          className="text-[11px] font-medium text-center leading-tight line-clamp-1 group-hover:text-[var(--color-brand-primary)] transition-colors px-1 w-full"
        >
          {name}
        </span>
      </button>
    ),
    []
  );

  const renderWalletGrid = useCallback(
    (wallets: WalletConfig[], disabled: boolean) => (
      <div className="grid grid-cols-4 gap-2.5">
        {wallets.map(wallet => {
          const key = `${wallet.type}-${wallet.id}`;
          return renderWalletCard({
            id: key,
            name: wallet.name,
            icon: wallet.icon,
            isConnecting: connectingWallet === key,
            onClick: () => handleWalletClick(wallet),
            disabled,
          });
        })}
      </div>
    ),
    [connectingWallet, handleWalletClick, renderWalletCard]
  );

  const renderOnboardingView = () => {
    const evm = connectedWallets.evm;
    const config = evm ? getWalletConfig('evm', evm.walletId) : undefined;
    const isDerivingAster = asterAgent.deriveState === 'signing';

    return (
      <div className="space-y-5 pt-1 animate-fade-in">
        <div className="text-center pb-1">
          <h3 style={{ color: 'var(--color-text-primary)' }} className="text-base font-semibold">
            {isSetupDone ? 'Account Ready' : 'Setting Up Your Trading Account'}
          </h3>
          <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-1">
            {isSetupDone
              ? 'Your wallet is connected and authorized for gas-free trading.'
              : 'Complete the steps below to authenticate and enable 1-Click trading.'}
          </p>
        </div>

        <div
          style={{
            background: 'var(--color-bg-tertiary)',
            borderColor: 'var(--color-border)',
          }}
          className="p-4 rounded-2xl border space-y-4 shadow-sm"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-black flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/20">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <div className="w-0.5 h-8 my-1 bg-emerald-500/40" />
            </div>

            <div className="flex-1 pb-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: '#10b981' }} className="text-xs font-semibold">
                  1. Wallet Connected
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Connected
                </span>
              </div>
              <p
                style={{ color: 'var(--color-text-muted)' }}
                className="text-xs font-mono mt-0.5 truncate"
              >
                {config?.name ?? 'EVM Wallet'} • {evm ? formatAddress(evm.address) : ''}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="flex flex-col items-center">
              <div
                style={{
                  borderColor: isAuthenticated
                    ? '#10b981'
                    : isAuthenticating
                      ? 'var(--color-brand-primary)'
                      : 'var(--color-border)',
                  background: isAuthenticated
                    ? '#10b981'
                    : isAuthenticating
                      ? 'color-mix(in srgb, var(--color-brand-primary) 15%, transparent)'
                      : 'transparent',
                }}
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
              >
                {isAuthenticated ? (
                  <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
                ) : isAuthenticating ? (
                  <div className="w-3 h-3 border-2 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ShieldCheck className="w-3 h-3 text-[var(--color-text-muted)]" />
                )}
              </div>
              <div
                style={{
                  background: isAuthenticated ? '#10b981' : 'var(--color-border)',
                }}
                className="w-0.5 h-8 my-1 transition-colors"
              />
            </div>

            <div className="flex-1 pb-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  style={{
                    color: isAuthenticated ? '#10b981' : 'var(--color-text-primary)',
                  }}
                  className="text-xs font-semibold"
                >
                  2. Sign In to SwiftEx
                </span>
                {!isAuthenticated && (
                  <div>
                    {isAuthenticating ? (
                      <span className="text-[11px] font-medium text-[var(--color-brand-primary)] animate-pulse flex items-center gap-1">
                        Signing in wallet...
                      </span>
                    ) : (
                      <button
                        onClick={() => authenticateEvm()}
                        disabled={isAnyActionInProgress}
                        style={{ color: 'var(--color-brand-primary)' }}
                        className="text-xs font-semibold hover:underline"
                      >
                        {authError ? 'Retry Sign' : 'Sign In'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
                {isAuthenticated
                  ? 'Wallet ownership verified.'
                  : 'Confirm the signature request in your wallet to verify ownership.'}
              </p>
              {authError && !isAuthenticated && (
                <div className="mt-1.5 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
                  {authError}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="flex flex-col items-center">
              <div
                style={{
                  borderColor: !tradingAuthEnabled
                    ? 'var(--color-border)'
                    : asterAgent.isReady
                      ? '#10b981'
                      : isDerivingAster
                        ? 'var(--color-brand-primary)'
                        : 'var(--color-border)',
                  background:
                    tradingAuthEnabled && asterAgent.isReady
                      ? '#10b981'
                      : isDerivingAster
                        ? 'color-mix(in srgb, var(--color-brand-primary) 15%, transparent)'
                        : 'transparent',
                }}
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
              >
                {tradingAuthEnabled && asterAgent.isReady ? (
                  <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
                ) : isDerivingAster ? (
                  <div className="w-3 h-3 border-2 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Zap className="w-3 h-3 text-[var(--color-text-muted)]" />
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  style={{
                    color: !tradingAuthEnabled
                      ? 'var(--color-text-muted)'
                      : asterAgent.isReady
                        ? '#10b981'
                        : 'var(--color-text-primary)',
                  }}
                  className="text-xs font-semibold"
                >
                  3. 1-Click Trading Session
                </span>

                <button
                  type="button"
                  role="switch"
                  aria-checked={tradingAuthEnabled}
                  onClick={() => setTradingAuthEnabled(!tradingAuthEnabled)}
                  style={{
                    background: tradingAuthEnabled
                      ? 'var(--color-brand-primary)'
                      : 'var(--color-bg-secondary)',
                    borderColor: tradingAuthEnabled
                      ? 'var(--color-brand-primary)'
                      : 'var(--color-border)',
                  }}
                  className="relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none"
                  title="Toggle 1-Click Trading"
                >
                  <span
                    style={{
                      transform: tradingAuthEnabled ? 'translateX(12px)' : 'translateX(0px)',
                      background: '#fff',
                    }}
                    className="pointer-events-none inline-block h-3 w-3 rounded-full shadow transform ring-0 transition duration-200 ease-in-out"
                  />
                </button>
              </div>

              <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
                {tradingAuthEnabled && asterAgent.isReady
                  ? 'Session key derived. Instant gas-free execution is active.'
                  : 'Delegates session key for frictionless, gas-free perpetuals trading.'}
              </p>

              {tradingAuthEnabled && isAuthenticated && !asterAgent.isReady && (
                <div className="mt-2">
                  {isDerivingAster ? (
                    <span className="text-[11px] font-medium text-[var(--color-brand-primary)] animate-pulse flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5" />
                      Awaiting trading key signature in wallet...
                    </span>
                  ) : (
                    <button
                      onClick={handleDeriveAster}
                      disabled={isAnyActionInProgress}
                      style={{ color: 'var(--color-brand-primary)' }}
                      className="text-xs font-semibold hover:underline"
                    >
                      Authorize Trading Key
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {isSetupDone ? (
          <div className="pt-2 text-center animate-fade-in">
            <p className="text-xs text-emerald-400 font-medium flex items-center justify-center gap-1.5 animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Setup complete • Redirecting to trading...</span>
            </p>
          </div>
        ) : (
          <div className="pt-2 text-center">
            <button
              onClick={handleModalClose}
              style={{ color: 'var(--color-text-muted)' }}
              className="text-xs hover:opacity-80 transition-opacity"
            >
              Cancel and finish later
            </button>
          </div>
        )}
      </div>
    );
  };

  if (!isModalOpen) return null;

  const isUnifiedConnecting = connectingWallet === 'unified-wc';
  const anyConnected = evmConnected || stellarConnected;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={handleModalClose}
    >
      <div
        style={{
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
        className={`w-full md:w-[440px] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col border ${
          isMobile ? 'animate-slide-up' : 'animate-fade-in'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {isMobile && (
          <div className="pt-2.5 pb-1 flex justify-center flex-shrink-0">
            <div
              style={{ background: 'var(--color-border-dark)' }}
              className="w-10 h-1 rounded-full"
            />
          </div>
        )}

        {/* Modal Header */}
        <div
          style={{ borderColor: 'var(--color-border)' }}
          className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        >
          <div className="flex items-center gap-2.5">
            {viewMode === 'onboarding' && (
              <button
                onClick={() => setViewMode('wallets')}
                style={{ color: 'var(--color-text-muted)' }}
                className="p-1 -ml-1 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                title="Wallet List"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2
                style={{ color: 'var(--color-text-primary)' }}
                className="text-base font-bold tracking-tight"
              >
                {viewMode === 'onboarding'
                  ? 'Account Setup'
                  : anyConnected
                    ? 'Connected Wallets'
                    : 'Connect Wallet'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleModalClose}
              disabled={isAnyActionInProgress || isSigning}
              style={{ color: 'var(--color-text-muted)' }}
              className="p-1.5 rounded-xl hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--color-danger-bg)',
              borderColor: 'var(--color-danger)',
              color: 'var(--color-danger)',
            }}
            className="mx-6 mt-3 p-3 rounded-xl border text-xs text-center animate-fade-in font-medium"
          >
            {error}
          </div>
        )}

        <div className="p-6 overflow-y-auto scrollbar-thin space-y-5 flex-1">
          {viewMode === 'onboarding' ? (
            renderOnboardingView()
          ) : (
            <>
              {anyConnected && (
                <div className="space-y-3">
                  {evmConnected && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                          EVM Wallet
                        </span>
                        {!isSetupDone && (
                          <button
                            onClick={() => setViewMode('onboarding')}
                            className="text-[11px] font-semibold text-amber-400 hover:underline"
                          >
                            Complete Setup →
                          </button>
                        )}
                      </div>
                      {renderConnectedCard('evm')}
                    </div>
                  )}

                  {stellarConnected && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Stellar Wallet
                      </span>
                      {renderConnectedCard('stellar')}
                    </div>
                  )}
                </div>
              )}

              {(!evmConnected || !stellarConnected) && (
                <div className="space-y-5">
                  {!evmConnected && !stellarConnected && (
                    <div className="space-y-2.5">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
                          Unified Multi-Chain
                        </h3>
                        <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
                          Connect EVM & Stellar simultaneously in a single session
                        </p>
                      </div>

                      <div className="grid grid-cols-4 gap-2.5">
                        {renderWalletCard({
                          id: 'unified-swiftex',
                          name: 'SwiftEx Wallet',
                          icon: '/logo.avif',
                          badge: 'REC',
                          isConnecting: connectingWallet === 'unified-swiftex',
                          onClick: handleSwiftExUnifiedConnect,
                          disabled: isAnyActionInProgress,
                        })}

                        {renderWalletCard({
                          id: 'unified-wc',
                          name: 'WalletConnect',
                          icon: WALLETCONNECT_ICON,
                          isConnecting: isUnifiedConnecting,
                          onClick: handleUnifiedConnect,
                          disabled: isAnyActionInProgress,
                        })}
                      </div>
                    </div>
                  )}

                  {!evmConnected && (
                    <div className="space-y-2.5">
                      <div>
                        <h3
                          style={{ color: 'var(--color-text-primary)' }}
                          className="text-xs font-bold uppercase tracking-wider"
                        >
                          EVM Wallets
                        </h3>
                        <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
                          MetaMask, Trust, Rainbow, or browser extension
                        </p>
                      </div>
                      {renderWalletGrid(EVM_WALLETS, isAnyActionInProgress)}
                    </div>
                  )}

                  {!stellarConnected && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3
                            style={{ color: 'var(--color-text-primary)' }}
                            className="text-xs font-bold uppercase tracking-wider"
                          >
                            {evmConnected ? 'Add Stellar Wallet' : 'Stellar Wallets'}
                          </h3>
                          <p
                            style={{ color: 'var(--color-text-muted)' }}
                            className="text-xs mt-0.5"
                          >
                            Freighter, LOBSTR, SwiftEx for Stellar network
                          </p>
                        </div>
                        {evmConnected && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Multi-Chain
                          </span>
                        )}
                      </div>
                      {renderWalletGrid(STELLAR_WALLETS, isAnyActionInProgress)}
                    </div>
                  )}
                </div>
              )}

              {anyConnected && isSetupDone && (
                <div className="pt-2">
                  <button
                    onClick={handleComplete}
                    style={{ background: 'var(--color-brand-primary)', color: '#fff' }}
                    className="w-full py-3 px-4 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-md"
                  >
                    Start Trading
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {connectingWallet && !isSigning && (
          <div
            style={{ background: 'color-mix(in srgb, var(--color-bg-secondary) 96%, transparent)' }}
            className="absolute inset-0 flex items-center justify-center rounded-t-3xl md:rounded-3xl backdrop-blur-sm z-20"
          >
            <div className="text-center px-6">
              <div
                style={{ borderColor: 'var(--color-brand-primary)', borderTopColor: 'transparent' }}
                className="inline-block w-8 h-8 border-3 rounded-full animate-spin mb-3"
              />
              <p
                style={{ color: 'var(--color-text-primary)' }}
                className="font-semibold text-sm mb-1"
              >
                Connecting...
              </p>
              <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mb-4">
                {isMobile ? 'Approve in your wallet app' : 'Scan QR code or approve in wallet'}
              </p>
              <button
                onClick={handleModalClose}
                style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)' }}
                className="px-3.5 py-1.5 rounded-xl text-xs hover:opacity-80 transition-opacity"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
