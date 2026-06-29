import { X, Copy, Check, ShieldCheck } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useApiTradingKeys } from '../hooks/useWalletConnect';
import { useWalletStore } from '../store/walletConnectStore';
import type { ApiTradingKey } from '../services/apiTradingKeyService';

function truncateAddress(addr: string, head = 8, tail = 6): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const CopyButton: React.FC<{ text: string; id: string }> = ({ text, id }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      id={id}
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}
      className="p-1 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors flex-shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

const KeyRow: React.FC<{
  apiKey: ApiTradingKey;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
  anyActionInProgress: boolean;
}> = ({ apiKey, onRevoke, isRevoking, anyActionInProgress }) => (
  <div
    style={{
      borderColor: apiKey.revoked
        ? 'var(--color-border)'
        : 'color-mix(in srgb, var(--color-brand-primary) 15%, var(--color-border))',
      background: apiKey.revoked
        ? 'var(--color-bg-tertiary)'
        : 'color-mix(in srgb, var(--color-brand-primary) 3%, var(--color-bg-tertiary))',
      opacity: apiKey.revoked ? 0.6 : 1,
    }}
    className="rounded-xl border p-4 flex items-center justify-between gap-4 transition-all"
  >
    {/* Left Side: Metadata */}
    <div className="min-w-0 flex-1 space-y-1">
      <span
        style={{ color: 'var(--color-text-primary)' }}
        className="text-sm font-semibold truncate block"
      >
        {apiKey.label}
      </span>
      <div className="flex items-center gap-1.5">
        <span
          style={{ color: 'var(--color-text-secondary)' }}
          className="text-xs font-mono select-all"
        >
          {truncateAddress(apiKey.address, 10, 8)}
        </span>
        <CopyButton
          text={apiKey.address}
          id={`copy-api-key-address-${apiKey.id}`}
        />
      </div>
      <p style={{ color: 'var(--color-text-muted)' }} className="text-[11px]">
        Created {formatDate(apiKey.createdAt)}
      </p>
    </div>


    <div className="flex-shrink-0">
      {!apiKey.revoked ? (
        <button
          id={`revoke-api-key-${apiKey.id}`}
          onClick={() => onRevoke(apiKey.id)}
          disabled={anyActionInProgress}
          style={{
            color: isRevoking ? 'var(--color-text-muted)' : 'var(--color-danger)',
            borderColor: isRevoking ? 'var(--color-border)' : 'var(--color-danger)',
            background: 'transparent',
          }}
          className="flex items-center justify-center px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:opacity-85 active:opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRevoking ? (
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Deleting...</span>
            </div>
          ) : (
            <span>Delete</span>
          )}


        </button>
      ) : (
        <span
          style={{
            color: 'var(--color-text-muted)',
            borderColor: 'var(--color-border)',
          }}
          className="text-xs font-semibold px-2.5 py-1 rounded border bg-[var(--color-bg-secondary)]"
        >
          Revoked
        </span>
      )}
    </div>
  </div>
);

export const ApiTradingKeyModal: React.FC = () => {
  const {
    keys,
    generate,
    revoke,
    isGenerating,
    revokingKeyId,
    error,
    isModalOpen,
    closeModal,
  } = useApiTradingKeys();

  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const dydxAddress =
    connectedWallets.evm?.dydxAddress ?? connectedWallets.cosmos?.dydxAddress ?? '';

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [labelInput, setLabelInput] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setShowLabelInput(false);
      setLabelInput('');
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isModalOpen]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (showLabelInput) labelRef.current?.focus();
  }, [showLabelInput]);

  const handleGenerate = useCallback(async () => {
    const label = labelInput.trim() || undefined;
    await generate(label);
    setLabelInput('');
    setShowLabelInput(false);
  }, [generate, labelInput]);

  const handleRevoke = useCallback((id: string) => {
    revoke(id);
  }, [revoke]);

  const handleBackdropClick = useCallback(() => {
    if (!isGenerating && !revokingKeyId) closeModal();
  }, [closeModal, isGenerating, revokingKeyId]);

  const anyActionInProgress = isGenerating || revokingKeyId !== null;

  const activeKeys = keys.filter(k => !k.revoked);
  const revokedKeys = keys.filter(k => k.revoked);

  if (!isModalOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)' }}
      onClick={handleBackdropClick}
    >
      <div
        style={{ background: 'var(--color-bg-secondary)' }}
        className={`w-full md:w-[520px] rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col ${isMobile ? 'animate-slide-up' : 'animate-fade-in'
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


        <div
          style={{ borderColor: 'var(--color-border)' }}
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
        >
          <h2
            style={{ color: 'var(--color-text-primary)' }}
            className="text-lg font-bold"
          >
            API Trading Keys
          </h2>
          <button
            id="api-key-modal-close"
            onClick={closeModal}
            disabled={anyActionInProgress}
            style={{ color: 'var(--color-text-muted)' }}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">

          <p style={{ color: 'var(--color-text-secondary)' }} className="text-sm leading-relaxed">
            API wallets perform actions on behalf of your account without withdrawal
            permissions. You must still use your account&apos;s public address for info
            requests.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            <div
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-bg-tertiary)',
              }}
              className="flex-1 rounded-xl border p-3 flex items-center justify-between min-w-0"
            >
              <div className="min-w-0 flex-1">
                <p style={{ color: 'var(--color-text-muted)' }} className="text-[10px] uppercase tracking-wider font-semibold mb-0.5">
                  Your dYdX Address
                </p>
                <p
                  style={{ color: 'var(--color-brand-primary)' }}
                  className="text-xs font-mono font-semibold truncate"
                >
                  {dydxAddress
                    ? dydxAddress
                    : <span style={{ color: 'var(--color-text-muted)' }}>Not connected</span>}
                </p>
              </div>
              {dydxAddress && (
                <CopyButton
                  text={dydxAddress}
                  id="copy-owner-dydx-address"
                />
              )}
            </div>

            <button
              id="generate-api-key-btn"
              onClick={showLabelInput ? handleGenerate : () => setShowLabelInput(true)}
              disabled={anyActionInProgress || !dydxAddress}
              style={{
                background: 'var(--color-brand-primary)',
                color: '#fff',
                opacity: anyActionInProgress || !dydxAddress ? 0.55 : 1,
              }}
              className="px-5 py-3 rounded-xl text-xs font-bold transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating...</span>
                </>
              ) : showLabelInput ? (
                <span>Generate Key</span>
              ) : (
                <span>Generate New API Key</span>
              )}
            </button>
          </div>

          <div className="space-y-2">
            {showLabelInput && (
              <div
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-tertiary)' }}
                className="flex items-center gap-2 p-2 rounded-xl border animate-fade-in"
              >
                <input
                  ref={labelRef}
                  id="api-key-label-input"
                  type="text"
                  placeholder='Label (e.g. "My trading bot")'
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); if (e.key === 'Escape') setShowLabelInput(false); }}
                  maxLength={40}
                  style={{
                    background: 'transparent',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                  className="flex-1 text-sm px-2 py-1 placeholder:text-[var(--color-text-muted)]"
                />
                <button
                  onClick={() => setShowLabelInput(false)}
                  style={{ color: 'var(--color-text-muted)' }}
                  className="p-1 rounded hover:opacity-70"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {error && (
              <div
                style={{
                  background: 'var(--color-danger-bg)',
                  borderColor: 'var(--color-danger)',
                  color: 'var(--color-danger)',
                }}
                className="p-3 rounded-xl border text-xs leading-relaxed animate-fade-in"
              >
                {error}
              </div>
            )}
          </div>

          <div style={{ borderColor: 'var(--color-border)' }} className="border-t" />

          {keys.length === 0 ? (
            <div
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-bg-tertiary)',
              }}
              className="flex items-center justify-center py-16 rounded-xl border"
            >
              <p style={{ color: 'var(--color-text-muted)' }} className="text-sm font-semibold">
                No API trading keys found.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeKeys.length > 0 && (
                <div className="space-y-2">
                  {activeKeys.map(k => (
                    <KeyRow
                      key={k.id}
                      apiKey={k}
                      onRevoke={handleRevoke}
                      isRevoking={revokingKeyId === k.id}
                      anyActionInProgress={anyActionInProgress}
                    />
                  ))}
                </div>
              )}

              {revokedKeys.length > 0 && (
                <details className="group">
                  <summary
                    style={{ color: 'var(--color-text-muted)' }}
                    className="text-xs font-semibold cursor-pointer list-none flex items-center gap-1.5 py-1 select-none hover:opacity-80"
                  >
                    <svg
                      className="w-3 h-3 transition-transform group-open:rotate-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    {revokedKeys.length} revoked key{revokedKeys.length > 1 ? 's' : ''} (history)
                  </summary>
                  <div className="mt-2 space-y-2">
                    {revokedKeys.map(k => (
                      <KeyRow
                        key={k.id}
                        apiKey={k}
                        onRevoke={handleRevoke}
                        isRevoking={false}
                        anyActionInProgress={anyActionInProgress}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-bg-tertiary)',
          }}
          className="flex items-start gap-2 px-5 py-3 border-t rounded-b-2xl flex-shrink-0"
        >
          <ShieldCheck
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            style={{ color: 'var(--color-brand-primary)', opacity: 0.7 }}
          />
          <p style={{ color: 'var(--color-text-muted)' }} className="text-xs leading-relaxed">
            API keys are scoped to order placement and cancellation only. Withdrawal
            transactions require your owner wallet, which never leaves this browser session.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
