import { X, Copy, Check } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useWalletStore } from '../store/walletConnectStore';
import { walletService } from '../services/walletService';

export const ExportDydxSecretPhraseModal: React.FC = () => {
  const isModalOpen = useWalletStore(state => state.isExportPhraseModalOpen);
  const closeModal = useWalletStore(state => state.closeExportPhraseModal);

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showPhrase, setShowPhrase] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [step, setStep] = useState<'consent' | 'display'>('consent');
  const [isCheckboxChecked, setIsCheckboxChecked] = useState(false);
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      handleLoadPhrase();
    } else {
      document.body.style.overflow = 'unset';
      setShowPhrase(false);
      setMnemonic(null);
      setError(null);
      setCopied(false);
      setStep('consent');
      setIsCheckboxChecked(false);
      setCountdown(8);
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isModalOpen]);

  useEffect(() => {
    if (isModalOpen && step === 'consent') {
      setCountdown(8);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isModalOpen, step]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleLoadPhrase = async () => {
    setIsDecrypting(true);
    setError(null);
    try {
      const phrase = await walletService.getOwnerSecretPhrase();
      if (!phrase) {
        throw new Error('No derived dYdX key found in storage. Please onboard first.');
      }
      setMnemonic(phrase);
    } catch (err: any) {
      setError(err.message || 'Failed to decrypt secret phrase.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleCopy = useCallback(async () => {
    if (!mnemonic) return;
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = mnemonic;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [mnemonic]);

  const handleBackdropClick = useCallback(() => {
    if (!isDecrypting) closeModal();
  }, [closeModal, isDecrypting]);

  if (!isModalOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)' }}
      onClick={handleBackdropClick}
    >
      <div
        style={{ background: 'var(--color-bg-secondary)' }}
        className={`w-full md:w-[520px] rounded-t-2xl md:rounded-xl shadow-2xl max-h-[88vh] flex flex-col ${isMobile ? 'animate-slide-up' : 'animate-fade-in'
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

        {step === 'consent' ? (
          <>
            <div
              style={{ borderColor: 'var(--color-border)' }}
              className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
            >
              <h2
                style={{ color: 'var(--color-text-primary)' }}
                className="text-lg font-bold"
              >
                Reveal secret phrase
              </h2>
              <button
                onClick={closeModal}
                style={{ color: 'var(--color-text-muted)' }}
                className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-6 space-y-6">
              <p style={{ color: 'var(--color-text-secondary)' }} className="text-sm leading-relaxed">
                Your secret phrase is a set of 12 or 24 words used to backup and access your account.
              </p>

              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  borderLeft: '4px solid #ef4444',
                }}
                className="p-4 rounded-r-lg border flex items-start gap-3"
              >
                <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-red-500 flex items-center justify-center text-red-500 font-bold text-xs mt-0.5 select-none">
                  !
                </div>
                <p style={{ color: 'var(--color-text-primary)' }} className="text-xs font-semibold leading-relaxed">
                  Anyone with your secret phrase has access to your wallet, putting your assets at risk.
                </p>
              </div>

              <label className="flex items-start gap-3.5 cursor-pointer py-3 px-1 hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors select-none">
                <input
                  type="checkbox"
                  checked={isCheckboxChecked}
                  onChange={e => setIsCheckboxChecked(e.target.checked)}
                  className="w-4.5 h-4.5 rounded border-color text-brand bg-secondary mt-0.5 cursor-pointer flex-shrink-0"
                />
                <span style={{ color: 'var(--color-text-secondary)' }} className="text-xs font-semibold leading-relaxed">
                  I understand the risks and I will never share my secret phrase with anyone.
                </span>
              </label>
            </div>

            <div
              style={{ borderColor: 'var(--color-border)' }}
              className="p-5 border-t flex-shrink-0"
            >
              {countdown > 0 ? (
                <button
                  disabled
                  style={{
                    background: 'var(--color-bg-tertiary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-muted)',
                  }}
                  className="w-full py-4 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center"
                >
                  Wait {countdown} seconds...
                </button>
              ) : (
                <button
                  onClick={() => setStep('display')}
                  disabled={!isCheckboxChecked}
                  style={{
                    background: isCheckboxChecked ? '#ef4444' : 'rgba(239, 68, 68, 0.4)',
                    color: isCheckboxChecked ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                  }}
                  className="w-full py-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center active:opacity-90 disabled:cursor-not-allowed"
                >
                  Reveal secret phrase
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              style={{ borderColor: 'var(--color-border)' }}
              className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
            >
              <h2
                style={{ color: 'var(--color-text-primary)' }}
                className="text-lg font-bold"
              >
                Export secret phrase
              </h2>
              <button
                onClick={closeModal}
                disabled={isDecrypting}
                style={{ color: 'var(--color-text-muted)' }}
                className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-5">
              <p style={{ color: 'var(--color-text-secondary)' }} className="text-sm leading-relaxed">
                Your secret phrase is a set of 12 or 24 words used to backup and access your account.
              </p>

              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  borderLeft: '4px solid #ef4444',
                }}
                className="px-4 py-2.5 rounded-r-lg border text-sm font-semibold text-white flex items-center gap-2"
              >
                <span>Never share your phrase with anyone!</span>
              </div>

              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--color-text-secondary)' }} className="text-sm font-semibold">
                  Ready to scan?
                </span>
                <button
                  onClick={() => setShowPhrase(!showPhrase)}
                  disabled={isDecrypting || !!error || !mnemonic}
                  style={{ color: 'var(--color-brand-primary)' }}
                  className="text-xs font-bold hover:opacity-85 active:opacity-75 transition-opacity disabled:opacity-50"
                >
                  {showPhrase ? 'Hide phrase' : 'Show phrase'}
                </button>
              </div>

              <div
                onClick={() => {
                  if (!showPhrase && !isDecrypting && !error && mnemonic) {
                    setShowPhrase(true);
                  }
                }}
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-bg-tertiary)',
                  minHeight: '160px',
                }}
                className={`rounded-lg border p-4 flex items-center justify-center relative overflow-hidden transition-all ${
                  !showPhrase && !isDecrypting && !error && mnemonic ? 'cursor-pointer hover:bg-[var(--color-bg-hover)]' : ''
                }`}
              >
                {isDecrypting ? (
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: 'var(--color-brand-primary) transparent var(--color-brand-primary) var(--color-brand-primary)' }}
                    />
                    <p style={{ color: 'var(--color-text-muted)' }} className="text-xs">Decrypting phrase...</p>
                  </div>
                ) : error ? (
                  <p style={{ color: 'var(--color-danger)' }} className="text-xs text-center font-medium px-4">
                    {error}
                  </p>
                ) : !showPhrase ? (
                  <div className="flex flex-col items-center justify-center h-full w-full select-none">
                    <div className="filter blur-[5px] grid grid-cols-3 gap-2 w-full opacity-35 px-2">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] h-8 rounded-lg" />
                      ))}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                      <span
                        style={{
                          backgroundColor: 'var(--color-bg-secondary)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-primary)',
                        }}
                        className="px-4 py-2 rounded-lg border text-xs font-bold shadow-md"
                      >
                        Click to show
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 w-full animate-fade-in">
                    {mnemonic?.split(' ').map((word, index) => (
                      <div
                        key={index}
                        style={{
                          background: 'var(--color-bg-secondary)',
                          borderColor: 'var(--color-border)',
                        }}
                        className="flex items-center px-3 py-2 rounded-lg border text-xs min-w-0"
                      >
                        <span style={{ color: 'var(--color-text-muted)' }} className="mr-1.5 font-mono select-none">
                          {index + 1}.
                        </span>
                        <span style={{ color: 'var(--color-text-primary)' }} className="font-semibold truncate">
                          {word}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{ borderColor: 'var(--color-border)' }}
              className="p-5 border-t flex-shrink-0"
            >
              <button
                onClick={handleCopy}
                disabled={isDecrypting || !!error || !mnemonic}
                style={{
                  background: 'var(--color-brand-primary)',
                  color: '#ffffff',
                }}
                className="w-full py-4 rounded-lg text-sm font-semibold hover:opacity-90 active:opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copied ? (
                  <div className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" />
                    <span>Copied!</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </div>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
