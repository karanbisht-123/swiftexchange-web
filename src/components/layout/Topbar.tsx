import { Bell, Menu } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';
import { ConnectWalletButton } from '../../modules/walletconnect/components/ConnectWalletButton';
import NetworkSwitch from '../../modules/walletconnect/components/NetworkSwitch';
import { useWalletConnect } from '../../modules/walletconnect/hooks/useWalletConnect';
import { hasStoredAgentKey } from '../../modules/walletconnect/services/asterAgentKeyManager';
import { useWalletStore } from '../../modules/walletconnect/store/walletConnectStore';
import { useNotificationStore } from '../../store/notificationStore';
import ThemeToggle from '../../utils/ThemeToggle';

const Topbar: React.FC = () => {
  const { connectedWallets, isRestoringSession, disconnectAll } = useWalletConnect();
  const isDisconnecting = useWalletStore(state => state.isDisconnecting);
  const navigate = useNavigate();
  const loc = useLocation();
  const hasRedirected = useRef(false);

  const { notifications, setGlobalPanelOpen } = useNotificationStore();
  const unreadCount = notifications.filter(n => !n.read).length;

  const isAnyWalletConnected = Object.keys(connectedWallets).length > 0;

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cb = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) document.addEventListener('mousedown', cb);
    return () => document.removeEventListener('mousedown', cb);
  }, [isMoreOpen]);

  useEffect(() => {
    if (isRestoringSession) return;

    if (isAnyWalletConnected && !hasRedirected.current && loc.pathname === ROUTES.HOME) {
      hasRedirected.current = true;
      if (connectedWallets.evm && hasStoredAgentKey()) {
        navigate(ROUTES.TRADING_PERPS);
      } else {
        navigate(ROUTES.DASHBOARD);
      }
    }
  }, [isAnyWalletConnected, isRestoringSession, navigate, loc.pathname, connectedWallets]);

  const handleDisconnectAll = useCallback(async () => {
    await disconnectAll();
    hasRedirected.current = false;
    navigate(ROUTES.HOME);
  }, [disconnectAll, navigate]);

  return (
    <header className="sticky top-0 z-50 h-14 w-full bg-[var(--color-bg-primary)]/85 backdrop-blur-xl border-b border-[var(--color-border)]/50 flex items-center justify-between px-3 sm:px-5 select-none transition-colors">
      {/* Left side: Hamburger on mobile + Brand / Quick Navigation */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
        <button
          id="hamburger-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('sidebar:toggle'))}
          className="lg:hidden p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors shrink-0 cursor-pointer"
          aria-label="Toggle Navigation"
        >
          <Menu size={18} />
        </button>

        {/* Quick Exchange Nav Pills (Desktop) */}
        <div className="hidden md:flex items-center gap-1 bg-[var(--color-bg-tertiary)]/50 p-0.5 rounded-lg border border-[var(--color-border)]/30 text-xs font-medium">
          {[
            { label: 'Spot', href: ROUTES.TRADING_STELLAR },
            { label: 'Perps', href: ROUTES.TRADING_PERPS, badge: '20x' },
            { label: 'Swap', href: ROUTES.TRADING_EVM_SWAP },
            { label: 'Markets', href: ROUTES.MARKETS },
          ].map(tab => {
            const isActive = loc.pathname === tab.href;
            return (
              <button
                key={tab.href}
                onClick={() => navigate(tab.href)}
                className={`relative px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  isActive
                    ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-primary)]/40'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[8px] font-mono px-1 rounded bg-amber-500/20 text-amber-400 font-bold leading-tight">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right side: Network Switch, Connect Wallet, Disconnect, Notifications, Theme */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <NetworkSwitch />

        {isAnyWalletConnected ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ConnectWalletButton />
            <button
              onClick={handleDisconnectAll}
              disabled={isDisconnecting}
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
              title="Disconnect all wallets"
            >
              {isDisconnecting ? (
                <>
                  <span className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                  <span>Disconnecting</span>
                </>
              ) : (
                'Disconnect'
              )}
            </button>
          </div>
        ) : (
          <ConnectWalletButton />
        )}

        <ThemeToggle />

        {isAnyWalletConnected && (
          <button
            onClick={() => setGlobalPanelOpen(true)}
            className="relative rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer shrink-0"
            title="Notifications"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
};

export default Topbar;
