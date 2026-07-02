import { Bell } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';
import { ConnectWalletButton } from '../../modules/walletconnect/components/ConnectWalletButton';
import NetworkSwitch from '../../modules/walletconnect/components/NetworkSwitch';
import { useWalletConnect } from '../../modules/walletconnect/hooks/useWalletConnect';
import { useNotificationStore } from '../../store/notificationStore';
import ThemeToggle from '../../utils/ThemeToggle';

const Topbar: React.FC = () => {
  const { connectedWallets, isRestoringSession, disconnectAll } = useWalletConnect();
  const navigate = useNavigate();
  const loc = useLocation();
  const hasRedirected = useRef(false);

  const { notifications, setGlobalPanelOpen } = useNotificationStore();
  const unreadCount = notifications.filter(n => !n.read).length;

  const isAnyWalletConnected = Object.keys(connectedWallets).length > 0;

  useEffect(() => {
    if (isRestoringSession) return;

    if (isAnyWalletConnected && !hasRedirected.current && loc.pathname === ROUTES.HOME) {
      hasRedirected.current = true;
      navigate(ROUTES.DASHBOARD);
    }
  }, [isAnyWalletConnected, isRestoringSession, navigate, loc.pathname]);

  const handleDisconnectAll = useCallback(async () => {
    await disconnectAll();
    hasRedirected.current = false;
    navigate(ROUTES.HOME);
  }, [disconnectAll, navigate]);

  return (
    <header className="h-16 bg-(--color-bg-secondary) border-b border-(--color-border) flex items-center justify-between px-2">
      <div className="flex items-center gap-2.5 px-2 ml-14 lg:ml-2 select-none">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md  text-sm lg:text-md font-bold tracking-widest bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 dark:border-amber-500/30 transition-all duration-300 hover:scale-105 hover:bg-amber-500/20 hover:border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.12)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-md bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-sm h-1.5 w-1.5 bg-amber-500"></span>
          </span>
          BETA
        </span>
      </div>

      <div className="flex items-center gap-4">
        <NetworkSwitch />
        {isAnyWalletConnected ? (
          <div className="flex items-center gap-2">
            <ConnectWalletButton />
            <button
              onClick={handleDisconnectAll}
              className="hidden lg:block px-3 py-1.5 rounded-sm bg-(--color-danger) text-white text-sm hover:opacity-90 transition"
            >
              Disconnect All
            </button>
          </div>
        ) : (
          <ConnectWalletButton />
        )}

        <ThemeToggle />

        {isAnyWalletConnected && (
          <button
            onClick={() => setGlobalPanelOpen(true)}
            className="relative rounded-full p-2 text-(--color-text-secondary) hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary) transition-colors"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]">
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
