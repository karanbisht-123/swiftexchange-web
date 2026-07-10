import { Check, ChevronDown, Copy, Plus, X } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { COSMOS_WALLETS, EVM_WALLETS, STELLAR_WALLETS, WalletType } from '../constants/Wallet';
import { useWalletConnect } from '../hooks/useWalletConnect';

const ALL_WALLETS = [...EVM_WALLETS, ...COSMOS_WALLETS, ...STELLAR_WALLETS];

const WALLETCONNECT_ICON =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU';

function getWalletIcon(walletId: string, type: string, peerIcon?: string): string {
  if (peerIcon) return peerIcon;
  const match = ALL_WALLETS.find(w => w.id === walletId && w.type === type);
  if (match) return match.icon;
  if (walletId === 'walletconnect') return WALLETCONNECT_ICON;
  return WALLETCONNECT_ICON;
}

export const ConnectWalletButton: React.FC = () => {
  const { connectedWallets, openModal, disconnect, disconnectAll } = useWalletConnect();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleDisconnectAll = async () => {
    await disconnectAll();
    setShowDropdown(false);
  };

  const handleDisconnect = async (type: WalletType) => {
    await disconnect(type);
    if (Object.keys(connectedWallets).length <= 1) setShowDropdown(false);
  };

  const validConnectedWallets = Object.entries(connectedWallets).filter(
    ([type, conn]) =>
      type &&
      type !== 'undefined' &&
      conn?.address &&
      Object.values(WalletType).includes(type as WalletType)
  ) as [WalletType, NonNullable<(typeof connectedWallets)[WalletType]>][];

  const hasConnections = validConnectedWallets.length > 0;

  if (!hasConnections) {
    return (
      <button
        onClick={openModal}
        className="flex items-center text-white gap-2 shadow bg-brand rounded-md px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(v => !v)}

        className="flex items-center bg-tertiary shadow rounded-lg gap-2 pl-1.5 pr-3 py-1.5 transition-colors cursor-pointer"
      >
        <div className="flex items-center -space-x-2">
          {validConnectedWallets.slice(0, 3).map(([type, conn]) => (
            <div
              key={type}
              style={{
                background: 'var(--color-bg-secondary)',
                border: '2px solid var(--color-bg-tertiary)',
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              title={conn.peerName || conn.walletId}
            >
              <img
                src={getWalletIcon(conn.walletId, type, conn.peerIcon)}
                alt={conn.peerName || conn.walletId}
                className="w-full h-full object-contain rounded-full"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  const p = e.currentTarget.parentElement;
                  if (p) {
                    p.textContent = type[0].toUpperCase();
                    p.style.color = 'var(--color-text-muted)';
                    p.style.fontWeight = '700';
                    p.style.fontSize = '0.75rem';
                  }
                }}
              />
            </div>
          ))}
          {validConnectedWallets.length > 3 && (
            <div
              style={{
                background: 'var(--color-brand-primary)',
                border: '2px solid var(--color-bg-tertiary)',
                color: '#fff',
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            >
              +{validConnectedWallets.length - 3}
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1">
          <div
            style={{ background: 'var(--color-success)' }}
            className="w-1.5 h-1.5 rounded-full animate-pulse"
          />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {validConnectedWallets.length === 1
              ? formatAddress(validConnectedWallets[0][1].address)
              : `${validConnectedWallets.length} wallets`}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          style={{ color: 'var(--color-text-muted)' }}
        />
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:bg-black/5 backdrop-blur-[2px] lg:backdrop-blur-none transition-all duration-300"
            onClick={() => setShowDropdown(false)}
          />

          <div
            style={{
              background: 'var(--color-bg-secondary)',
            }}
            className="fixed lg:absolute bottom-0 lg:bottom-auto lg:top-full left-0 lg:left-auto lg:right-0 w-full lg:w-80 z-50 overflow-hidden border-t lg:border border-color rounded-t-[2.5rem] lg:rounded-xl shadow-premium animate-slide-up lg:animate-fade-in pb-[env(safe-area-inset-bottom)] lg:pb-0"
          >
            <div className="lg:hidden flex justify-center pt-4 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-divider/20" />
            </div>

            <div
              style={{ borderBottom: '1px solid var(--color-border)' }}
              className="flex items-center justify-between px-6 py-4"
            >
              <span
                style={{ color: 'var(--color-text-primary)' }}
                className="text-sm font-semibold"
              >
                Connected Wallets
              </span>
              <button
                onClick={() => setShowDropdown(false)}
                style={{ color: 'var(--color-text-muted)' }}
                className="p-1 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-72 scrollbar-thin">
              {validConnectedWallets.map(([type, conn]) => {
                const icon = getWalletIcon(conn.walletId, type, conn.peerIcon);
                const typeLabel = type === 'evm' ? 'EVM' : type === 'cosmos' ? 'Cosmos' : 'Stellar';

                return (
                  <div
                    key={type}
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                    className="flex items-center gap-4 px-6 py-4 last:border-b-0 hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    <div
                      style={{ background: 'var(--color-bg-tertiary)', flexShrink: 0 }}
                      className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden"
                    >
                      <img
                        src={icon}
                        alt={conn.peerName || conn.walletId}
                        className="w-7 h-7 object-contain rounded-full"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          const p = e.currentTarget.parentElement;
                          if (p) {
                            p.textContent = type[0].toUpperCase();
                            p.style.color = 'var(--color-text-muted)';
                            p.style.fontWeight = '700';
                          }
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div
                          style={{ background: 'var(--color-success)' }}
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        />
                        <span
                          style={{ color: 'var(--color-text-primary)' }}
                          className="text-xs font-semibold"
                        >
                          {typeLabel}
                        </span>
                        <span style={{ color: 'var(--color-text-muted)' }} className="text-xs">
                          · {conn.peerName || conn.walletId}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          style={{ color: 'var(--color-text-secondary)' }}
                          className="text-xs font-mono truncate"
                        >
                          {formatAddress(conn.address)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(conn.address)}
                          style={{ color: 'var(--color-text-muted)' }}
                          className="p-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors flex-shrink-0"
                          title="Copy"
                        >
                          {copiedAddress === conn.address ? (
                            <Check className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      {conn.dydxAddress && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span style={{ color: 'var(--color-text-muted)' }} className="text-xs">
                            dYdX:
                          </span>
                          <span
                            style={{ color: 'var(--color-brand-primary)' }}
                            className="text-xs font-mono truncate"
                          >
                            {formatAddress(conn.dydxAddress)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(conn.dydxAddress!)}
                            style={{ color: 'var(--color-text-muted)' }}
                            className="p-0.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors flex-shrink-0"
                            title="Copy dYdX"
                          >
                            {copiedAddress === conn.dydxAddress ? (
                              <Check
                                className="w-3 h-3"
                                style={{ color: 'var(--color-success)' }}
                              />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}
                      {type === 'evm' && !conn.dydxAddress && (
                        <span
                          style={{
                            background: 'var(--color-warning-bg)',
                            color: 'var(--color-warning)',
                            fontSize: '0.65rem',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                          className="inline-block mt-0.5"
                        >
                          dYdX not derived
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleDisconnect(type)}
                      style={{
                        background: 'var(--color-danger-bg)',
                        color: 'var(--color-danger)',
                        borderRadius: '0.5rem',
                        flexShrink: 0,
                      }}
                      className="p-1.5 hover:opacity-80 transition-opacity"
                      title="Disconnect"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)' }} className="flex gap-2 p-3">
              <button
                onClick={() => {
                  openModal();
                  setShowDropdown(false);
                }}
                style={{
                  background: 'var(--color-brand-primary)',
                  color: '#fff',
                  borderRadius: '0.5rem',
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Wallet
              </button>
              <button
                onClick={handleDisconnectAll}
                style={{
                  background: 'var(--color-danger-bg)',
                  color: 'var(--color-danger)',
                  borderRadius: '0.5rem',
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                Disconnect All
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
