import { Bell, ChevronDown, Menu } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';
import { ConnectWalletButton } from '../../modules/walletconnect/components/ConnectWalletButton';
import NetworkSwitch from '../../modules/walletconnect/components/NetworkSwitch';
import {
  useApiTradingKeys,
  useWalletConnect,
} from '../../modules/walletconnect/hooks/useWalletConnect';
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

  const hasDydx = useWalletStore(
    state =>
      !!(state.connectedWallets.evm?.dydxAddress || state.connectedWallets.cosmos?.dydxAddress)
  );
  const { openModal } = useApiTradingKeys();
  const openExportPhraseModal = useWalletStore(state => state.openExportPhraseModal);

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

  const isPerpsView = loc.pathname === ROUTES.TRADING_PERPS;

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
    <header className="sticky top-0 z-50 h-[60px] mb-1 w-full max-w-full bg-(--color-bg-secondary)/95 backdrop-blur-md flex items-center justify-between px-2 sm:px-4 overflow-x-clip">
      <div className="flex items-center gap-1.5 sm:gap-2 select-none h-full min-w-0 shrink">
        <button
          id="hamburger-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('sidebar:toggle'))}
          className="lg:hidden p-1.5 sm:p-2 rounded-xl text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-tertiary) transition-colors shrink-0 cursor-pointer"
        >
          <Menu size={20} />
        </button>

        {/* {isPerpsView && (
          <div className="hidden lg:flex items-center gap-4 ml-4 h-full">
            {[
              { key: 'trade', label: 'Trade' },
              { key: 'markets', label: 'Markets' },
              { key: 'portfolio', label: 'Portfolio' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => navigate(`${ROUTES.TRADING_PERPS}?view=${tab.key}`)}
                className="relative flex items-center h-full px-2 font-medium text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {tab.label}
              </button>
            ))}
          </div>
        )} */}

        {isPerpsView && hasDydx && (
          <div
            className="relative ml-1 sm:ml-2 lg:ml-4 flex items-center shrink-0"
            ref={moreMenuRef}
          >
            <button
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-md transition-all duration-150 font-medium text-xs sm:text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] ${
                isMoreOpen ? 'bg-[var(--color-bg-tertiary)]' : ''
              }`}
            >
              More
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${isMoreOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isMoreOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.1)] z-50 flex flex-col py-1 animate-slide-up origin-top-left">
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    openModal();
                  }}
                  className="px-4 py-2.5 text-left text-sm font-medium hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-tertiary)] transition-colors text-[var(--color-text-primary)]"
                >
                  API Trading Keys
                </button>
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    openExportPhraseModal();
                  }}
                  className="px-4 py-2.5 text-left text-sm font-medium hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-tertiary)] transition-colors text-[var(--color-text-primary)]"
                >
                  Export Phrase
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-4 shrink-0 min-w-0">
        <NetworkSwitch />
        {isAnyWalletConnected ? (
          <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2">
            <ConnectWalletButton />
            <button
              onClick={handleDisconnectAll}
              disabled={isDisconnecting}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-(--color-danger) text-white text-sm hover:opacity-90 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDisconnecting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect All'
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
            className="relative rounded-full p-1.5 sm:p-2 text-(--color-text-secondary) hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary) transition-colors cursor-pointer shrink-0"
          >
            <Bell size={18} className="sm:w-5 sm:h-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
};

export default Topbar;
