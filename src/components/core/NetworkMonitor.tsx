import { RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { IS_TESTNET_ENABLED } from '../../modules/walletconnect/config/chains';
import { useWalletStore } from '../../modules/walletconnect/store/walletConnectStore';
import { API_CONFIG } from '../../service/apiConfig';

type ConnectionQuality = 'optimal' | 'good' | 'fair' | 'poor' | 'offline';

interface PingStats {
  latency: number | null;
  quality: ConnectionQuality;
  lastChecked: Date | null;
  isChecking: boolean;
}

const truncateAddress = (addr?: string) => {
  if (!addr) return '';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
};

export const NetworkMonitor: React.FC = () => {
  const network = useWalletStore(state => state.network);
  const connectedWallets = useWalletStore(state => state.connectedWallets);

  const evmWallet = connectedWallets.evm;
  const stellarWallet = connectedWallets.stellar;
  const isAnyConnected = Boolean(evmWallet || stellarWallet);

  const [stats, setStats] = useState<PingStats>({
    latency: null,
    quality: 'optimal',
    lastChecked: null,
    isChecking: false,
  });

  const [utcTime, setUtcTime] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  // Live UTC Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().substring(11, 19) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const getQuality = (rtt: number | null, isOnline: boolean): ConnectionQuality => {
    if (!isOnline || rtt === null) return 'offline';
    if (rtt < 120) return 'optimal';
    if (rtt < 300) return 'good';
    if (rtt < 700) return 'fair';
    return 'poor';
  };

  const measureLatency = useCallback(async () => {
    if (!navigator.onLine) {
      if (isMountedRef.current) {
        setStats(prev => ({
          ...prev,
          latency: null,
          quality: 'offline',
          lastChecked: new Date(),
          isChecking: false,
        }));
      }
      return;
    }

    setStats(prev => ({ ...prev, isChecking: true }));
    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const targetUrl = API_CONFIG.serverUrl
        ? `${API_CONFIG.serverUrl.replace(/\/api\/v1\/?$/, '')}/?_t=${Date.now()}`
        : `${window.location.origin}/?_t=${Date.now()}`;

      await fetch(targetUrl, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const rtt = Math.round(endTime - startTime);

      if (isMountedRef.current) {
        setStats({
          latency: rtt,
          quality: getQuality(rtt, true),
          lastChecked: new Date(),
          isChecking: false,
        });
      }
    } catch {
      try {
        const localStart = performance.now();
        const localController = new AbortController();
        const localTimeout = setTimeout(() => localController.abort(), 3000);

        await fetch(`${window.location.origin}/favicon.ico?_t=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-store',
          signal: localController.signal,
        });

        clearTimeout(localTimeout);
        const localRtt = Math.round(performance.now() - localStart);

        if (isMountedRef.current) {
          setStats({
            latency: localRtt,
            quality: getQuality(localRtt, true),
            lastChecked: new Date(),
            isChecking: false,
          });
        }
      } catch {
        if (isMountedRef.current) {
          setStats({
            latency: null,
            quality: 'poor',
            lastChecked: new Date(),
            isChecking: false,
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    measureLatency();

    const interval = setInterval(measureLatency, 15000);

    const handleOnline = () => measureLatency();
    const handleOffline = () => {
      setStats({
        latency: null,
        quality: 'offline',
        lastChecked: new Date(),
        isChecking: false,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [measureLatency]);

  const qualityColor = {
    optimal: 'text-emerald-400',
    good: 'text-emerald-400',
    fair: 'text-amber-400',
    poor: 'text-rose-400',
    offline: 'text-rose-500',
  }[stats.quality];

  const qualityDot = {
    optimal: 'bg-emerald-400',
    good: 'bg-emerald-400',
    fair: 'bg-amber-400',
    poor: 'bg-rose-500',
    offline: 'bg-rose-500 animate-ping',
  }[stats.quality];

  const qualityLabel = {
    optimal: 'Operational',
    good: 'Operational',
    fair: 'Moderate',
    poor: 'High Latency',
    offline: 'Offline',
  }[stats.quality];

  return (
    <div
      ref={dropdownRef}
      className="fixed bottom-0 lg:left-16 left-0 right-0 z-30 h-6 bg-[var(--color-bg-primary)] border-t border-[var(--color-border)]/40 text-[10px] sm:text-[10.5px] font-mono text-[var(--color-text-muted)] select-none px-2 sm:px-3 flex items-center justify-between"
    >
      {/* Left side: System status & UTC clock & Wallet info */}
      <div className="flex items-center gap-2 sm:gap-2.5 truncate min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${qualityDot}`} />
          <span className="font-medium text-[var(--color-text-secondary)]">
            {stats.quality === 'offline' ? 'Offline' : 'Operational'}
          </span>
        </div>

        <span className="text-[var(--color-border)] opacity-40">/</span>

        <span className="text-[var(--color-text-muted)] shrink-0">{utcTime || '--:--:-- UTC'}</span>

        {/* Connected Wallet info (tablet/desktop) */}
        {isAnyConnected && (
          <>
            <span className="text-[var(--color-border)] opacity-40 hidden md:inline">/</span>
            <span className="hidden md:inline text-[var(--color-text-secondary)] truncate">
              {evmWallet
                ? `EVM: ${truncateAddress(evmWallet.address)}`
                : `Stellar: ${truncateAddress(stellarWallet?.address)}`}
            </span>
          </>
        )}
      </div>

      {/* Right side: Network & Latency Button */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:inline text-[var(--color-text-muted)]">
          {IS_TESTNET_ENABLED && network === 'testnet' ? 'Testnet' : 'Mainnet'}
        </span>

        <span className="text-[var(--color-border)] opacity-40 hidden sm:inline">/</span>

        <button
          onClick={() => setIsOpen(prev => !prev)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] ${
            isOpen ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]' : ''
          }`}
          title="Network Details"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${qualityDot}`} />
          <span
            className={`font-semibold ${
              stats.quality === 'offline' ? 'text-rose-400' : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {stats.quality === 'offline'
              ? 'Offline'
              : stats.latency !== null
                ? `${stats.latency}ms`
                : '-- ms'}
          </span>
        </button>
      </div>

      {/* Minimalist Native Diagnostics Popover */}
      {isOpen && (
        <div className="absolute bottom-7 right-2 sm:right-3 w-64 max-w-[calc(100vw-1rem)] rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border)] shadow-xl p-2.5 text-[11px] font-mono animate-in fade-in duration-100 z-50">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-border)] text-xs font-sans font-semibold text-[var(--color-text-primary)]">
            <span>Network Status</span>
            <button
              onClick={() => measureLatency()}
              disabled={stats.isChecking}
              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={11} className={stats.isChecking ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[var(--color-text-muted)]">
              <span>Status</span>
              <span className={`font-medium ${qualityColor}`}>{qualityLabel}</span>
            </div>

            <div className="flex items-center justify-between text-[var(--color-text-muted)]">
              <span>Latency</span>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {stats.latency !== null ? `${stats.latency} ms` : 'N/A'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[var(--color-text-muted)]">
              <span>Gateway</span>
              <span className="text-emerald-400">Connected</span>
            </div>

            <div className="flex items-center justify-between text-[var(--color-text-muted)]">
              <span>Network</span>
              <span className="text-[var(--color-text-secondary)]">
                {IS_TESTNET_ENABLED && network === 'testnet' ? 'Testnet' : 'Mainnet'}
              </span>
            </div>

            {isAnyConnected && (
              <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                <span>Wallet</span>
                <span className="text-[var(--color-text-secondary)]">
                  {evmWallet
                    ? `EVM: ${truncateAddress(evmWallet.address)}`
                    : `Stellar: ${truncateAddress(stellarWallet?.address)}`}
                </span>
              </div>
            )}

            {stats.lastChecked && (
              <div className="pt-1.5 text-center text-[9px] text-[var(--color-text-muted)] border-t border-[var(--color-border)]/40">
                Updated {stats.lastChecked.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
