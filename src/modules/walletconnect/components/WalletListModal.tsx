import { X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { EVM_WALLETS, STELLAR_WALLETS, type WalletConfig } from '../constants/Wallet';
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
    deriveDydx,
    connectionStatus,
  } = useWalletStore();


  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [disconnectingType, setDisconnectingType] = useState<WalletType | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [error, setError] = useState<string | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      setError(null);
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

  const handleDeriveDydx = useCallback(async () => {
    if (connectingWallet || disconnectingType) return;
    setError(null);
    try {
      await deriveDydx();
    } catch (err: any) {
      showError(
        err.message === 'Signature rejected by user'
          ? 'Signature rejected. You can try again anytime.'
          : err?.message || 'Failed to derive wallet. Please try again.'
      );
    }
  }, [deriveDydx, connectingWallet, disconnectingType]);

  const handleModalClose = useCallback(() => {
    if (disconnectingType || connectionStatus.evm?.state === 'signing') return;
    if (connectingWallet) {
      clearConnectTimeout();
      setConnectingWallet(null);
      setError(null);
    }
    closeModal();
  }, [closeModal, connectingWallet, disconnectingType, connectionStatus]);

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
  const isSigning = connectionStatus.evm?.state === 'signing';
  const evmConnected = !!connectedWallets.evm;
  const stellarConnected = !!connectedWallets.stellar;
  const bothConnected = evmConnected && stellarConnected;

  const renderConnectedCard = useCallback(
    (type: WalletType) => {
      const connected = connectedWallets[type];
      if (!connected) return null;

      const config = getWalletConfig(type, connected.walletId);
      const isDisconnecting = disconnectingType === type;
      const hasDydx = type === 'evm' && connected.dydxAddress;
      const isSigningNow = type === 'evm' && isSigning;

      return (
        <div className="space-y-2">
          <div
            style={{
              borderColor: 'color-mix(in srgb, var(--color-success) 35%, var(--color-border))',
              background: 'var(--color-bg-tertiary)',
            }}
            className="flex items-center justify-between gap-3 p-3 md:p-4 rounded-xl border"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                style={{ background: 'var(--color-bg-tertiary)' }}
                className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0"
              >
                {config ? (
                  <img
                    src={config.icon}
                    alt={config.name}
                    className="w-7 h-7 md:w-8 md:h-8 rounded-full object-contain"
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                      const p = e.currentTarget.parentElement;
                      if (p) {
                        p.textContent = (config?.name?.[0] ?? type[0]).toUpperCase();
                        p.style.color = 'var(--color-text-muted)';
                        p.style.fontWeight = '600';
                        p.style.fontSize = '0.875rem';
                      }
                    }}
                  />
                ) : (
                  <span
                    style={{ color: 'var(--color-text-muted)' }}
                    className="font-semibold text-sm"
                  >
                    {type[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span
                  style={{ color: 'var(--color-text-primary)' }}
                  className="text-sm font-semibold truncate"
                >
                  {config?.name ?? connected.walletId}
                </span>
                <span
                  style={{ color: 'var(--color-text-secondary)' }}
                  className="text-xs font-mono truncate"
                >
                  {formatAddress(connected.address)}
                </span>
              </div>
            </div>

            <button
              onClick={() => handleDisconnect(type)}
              disabled={isDisconnecting || isAnyActionInProgress || isSigningNow}
              style={{ background: 'var(--color-danger)', color: '#fff' }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isDisconnecting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="hidden sm:inline">Disconnecting</span>
                </>
              ) : (
                'Disconnect'
              )}
            </button>
          </div>

          {type === 'evm' && (
            <div
              style={{
                borderColor: 'var(--color-brand-primary)',
                background: 'color-mix(in srgb, var(--color-brand-primary) 8%, transparent)',
              }}
              className="p-3 md:p-4 rounded-xl border"
            >
              {hasDydx ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      style={{ background: 'var(--color-brand-primary)' }}
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                    >
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <span
                      style={{ color: 'var(--color-brand-primary)' }}
                      className="text-sm font-semibold"
                    >
                      dYdX Wallet Derived
                    </span>
                  </div>
                  <span
                    style={{ color: 'var(--color-text-secondary)' }}
                    className="text-xs block mb-1"
                  >
                    dYdX Address
                  </span>
                  <span
                    style={{ color: 'var(--color-brand-primary)' }}
                    className="text-xs font-mono break-all"
                  >
                    {connected.dydxAddress}
                  </span>
                </div>
              ) : isSigningNow ? (
                <div className="flex items-center gap-3">
                  <div
                    style={{ background: 'var(--color-brand-primary)' }}
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  >
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div>
                    <p
                      style={{ color: 'var(--color-brand-primary)' }}
                      className="text-sm font-semibold"
                    >
                      Sign in Wallet
                    </p>
                    <p style={{ color: 'var(--color-text-muted)' }} className="text-xs">
                      Approve the signature to generate your dYdX address
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p
                      style={{ color: 'var(--color-brand-primary)' }}
                      className="text-sm font-semibold"
                    >
                      Derive dYdX Wallet
                    </p>
                    <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
                      One-time signature to enable trading
                    </p>
                  </div>
                  <button
                    onClick={handleDeriveDydx}
                    disabled={isAnyActionInProgress}
                    style={{ background: 'var(--color-brand-primary)', color: '#fff' }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    Derive
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [
      connectedWallets,
      getWalletConfig,
      formatAddress,
      handleDisconnect,
      handleDeriveDydx,
      disconnectingType,
      isAnyActionInProgress,
      isSigning,
    ]
  );

  const renderWalletGrid = useCallback(
    (wallets: WalletConfig[], disabled: boolean) => (
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
        {wallets.map(wallet => {
          const key = `${wallet.type}-${wallet.id}`;
          const isThisConnecting = connectingWallet === key;
          return (
            <button
              key={key}
              onClick={() => handleWalletClick(wallet)}
              disabled={disabled}
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-tertiary)' }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border hover:border-[var(--color-brand-primary)] hover:bg-[color-mix(in_srgb,var(--color-brand-primary)_8%,transparent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative"
            >
              {isThisConnecting && (
                <div
                  style={{
                    background: 'color-mix(in srgb, var(--color-bg-secondary) 85%, transparent)',
                  }}
                  className="absolute inset-0 flex items-center justify-center rounded-xl backdrop-blur-sm z-10"
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
                className="w-10 h-10 rounded-full flex items-center justify-center"
              >
                <img
                  src={wallet.icon}
                  alt={wallet.name}
                  className="w-8 h-8 rounded-full object-contain"
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                    const p = e.currentTarget.parentElement;
                    if (p) {
                      p.textContent = wallet.name[0];
                      p.style.color = 'var(--color-text-muted)';
                      p.style.fontWeight = '700';
                      p.style.fontSize = '1.125rem';
                    }
                  }}
                />
              </div>
              <span
                style={{ color: 'var(--color-text-primary)' }}
                className="text-xs font-medium text-center leading-tight line-clamp-2"
              >
                {wallet.name}
              </span>
            </button>
          );
        })}
      </div>
    ),
    [connectingWallet, handleWalletClick]
  );

  if (!isModalOpen) return null;

  const isUnifiedConnecting = connectingWallet === 'unified-wc';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={handleModalClose}
    >
      <div
        style={{ background: 'var(--color-bg-secondary)' }}
        className={`w-full md:w-[560px] rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col ${isMobile ? 'animate-slide-up' : 'animate-fade-in'}`}
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

        <div
          style={{ borderColor: 'var(--color-border)' }}
          className="flex items-center justify-between px-4 md:px-6 py-4 border-b flex-shrink-0"
        >
          <h2
            style={{ color: 'var(--color-text-primary)' }}
            className="text-lg md:text-xl font-bold"
          >
            {bothConnected ? 'Connected Wallets' : 'Connect Wallet'}
          </h2>
          <button
            onClick={handleModalClose}
            disabled={isAnyActionInProgress || isSigning}
            style={{ color: 'var(--color-text-muted)' }}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>



        {error && (
          <div
            style={{
              background: 'var(--color-danger-bg)',
              borderColor: 'var(--color-danger)',
              color: 'var(--color-danger)',
            }}
            className="mx-4 mt-3 p-3 rounded-lg border text-sm text-center animate-fade-in"
          >
            {error}
          </div>
        )}

        <div className="p-4 md:p-6 overflow-y-auto scrollbar-thin space-y-5 flex-1">
          {evmConnected && (
            <div className="space-y-2">
              <h3
                style={{ color: 'var(--color-text-primary)' }}
                className="text-sm font-semibold uppercase tracking-wide opacity-60"
              >
                EVM Wallet
              </h3>
              {renderConnectedCard('evm')}
            </div>
          )}

          {stellarConnected && (
            <div className="space-y-2">
              <h3
                style={{ color: 'var(--color-text-primary)' }}
                className="text-sm font-semibold uppercase tracking-wide opacity-60"
              >
                Stellar Wallet
              </h3>
              {renderConnectedCard('stellar')}
            </div>
          )}

          {evmConnected && !stellarConnected && (
            <div
              style={{
                borderColor: 'color-mix(in srgb, var(--color-brand-primary) 30%, transparent)',
                background: 'color-mix(in srgb, var(--color-brand-primary) 6%, transparent)',
              }}
              className="p-3 rounded-lg border"
            >
              <p style={{ color: 'var(--color-text-secondary)' }} className="text-xs">
                Your wallet did not provide a Stellar account. Connect a Stellar wallet below.
              </p>
            </div>
          )}

          {!bothConnected && (
            <div className="space-y-5">
              {!evmConnected && !stellarConnected && (
                <div className="space-y-2">
                  <div>
                    <h3

                      className="text-sm font-semibold uppercase tracking-wider "
                    >
                      Unified Connection
                    </h3>
                    <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
                      Connect both EVM & Stellar in a single step
                    </p>
                  </div>

                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">

                    <button
                      onClick={handleUnifiedConnect}
                      disabled={isAnyActionInProgress}
                      style={{
                        borderColor: 'var(--color-brand-primary)',
                        background: 'color-mix(in srgb, var(--color-brand-primary) 6%, var(--color-bg-tertiary))',
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border hover:border-[var(--color-brand-primary)] hover:bg-[color-mix(in_srgb,var(--color-brand-primary)_12%,var(--color-bg-tertiary))] transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative w-full"
                    >
                      {isUnifiedConnecting && (
                        <div
                          style={{
                            background:
                              'color-mix(in srgb, var(--color-bg-secondary) 85%, transparent)',
                          }}
                          className="absolute inset-0 flex items-center justify-center rounded-xl backdrop-blur-sm z-10"
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

                      <span className="absolute top-1 right-1.5 text-[6.5px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 whitespace-nowrap uppercase tracking-wider scale-95">
                        REC
                      </span>

                      <div
                        style={{ background: 'var(--color-bg-secondary)' }}
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                      >
                        <img
                          src="/logo.avif"
                          alt="SwiftEx"
                          className="w-12 h-12 rounded-full object-contain"
                        />
                      </div>

                      <span
                        style={{ color: 'var(--color-text-primary)' }}
                        className="text-xs font-semibold text-center leading-tight line-clamp-2 mt-0.5"
                      >
                        SwiftEx Wallet
                      </span>
                    </button>

                    <button
                      onClick={handleUnifiedConnect}
                      disabled={isAnyActionInProgress}
                      style={{
                        borderColor: 'var(--color-border)',
                        background: 'var(--color-bg-tertiary)',
                      }}
                      className="flex flex-col items-center gap-2 p-3  rounded-xl border hover:border-[var(--color-brand-primary)] hover:bg-[color-mix(in_srgb,var(--color-brand-primary)_8%,transparent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative w-full"
                    >
                      {isUnifiedConnecting && (
                        <div
                          style={{
                            background:
                              'color-mix(in srgb, var(--color-bg-secondary) 85%, transparent)',
                          }}
                          className="absolute inset-0 flex items-center justify-center rounded-xl backdrop-blur-sm z-10"
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

                      {/* Circular wallet icon wrapper like we give for other */}
                      <div
                        style={{ background: 'var(--color-bg-secondary)' }}
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                      >
                        <img
                          src={WALLETCONNECT_ICON}
                          alt="WalletConnect"
                          className="w-8 h-8 rounded-full object-contain"
                        />
                      </div>

                      <span
                        style={{ color: 'var(--color-text-primary)' }}
                        className="text-xs font-semibold text-center leading-tight line-clamp-2 mt-0.5"
                      >
                        WalletConnect
                      </span>
                    </button>
                  </div>
                </div>
              )}
              {!evmConnected && (
                <div className="space-y-3">
                  <div>
                    <h3
                      style={{ color: 'var(--color-text-primary)' }}
                      className="text-sm font-semibold"
                    >
                      EVM Wallets
                    </h3>
                    <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
                      Browser extension or EVM-only WalletConnect
                    </p>
                  </div>
                  {renderWalletGrid(EVM_WALLETS, isAnyActionInProgress)}
                </div>
              )}

              {!stellarConnected && (
                <div className="space-y-3">
                  <div>
                    <h3
                      style={{ color: 'var(--color-text-primary)' }}
                      className="text-sm font-semibold"
                    >
                      Stellar Wallets
                    </h3>
                    <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
                      Browser extension or Stellar-only WalletConnect
                    </p>
                  </div>
                  {renderWalletGrid(STELLAR_WALLETS, isAnyActionInProgress)}
                </div>
              )}
            </div>
          )}
        </div>

        {connectingWallet && !isSigning && (
          <div
            style={{ background: 'color-mix(in srgb, var(--color-bg-secondary) 96%, transparent)' }}
            className="absolute inset-0 flex items-center justify-center rounded-t-3xl md:rounded-2xl backdrop-blur-sm z-20"
          >
            <div className="text-center px-6">
              <div
                style={{ borderColor: 'var(--color-brand-primary)', borderTopColor: 'transparent' }}
                className="inline-block w-10 h-10 border-4 rounded-full animate-spin mb-4"
              />
              <p
                style={{ color: 'var(--color-text-primary)' }}
                className="font-semibold text-base mb-1"
              >
                Connecting...
              </p>
              <p style={{ color: 'var(--color-text-muted)' }} className="text-sm mb-4">
                {isMobile
                  ? 'Approve in your wallet app'
                  : 'Scan the QR code or approve in your wallet'}
              </p>
              <button
                onClick={handleModalClose}
                style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)' }}
                className="px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-opacity"
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
