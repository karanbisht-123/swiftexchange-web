import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';
import { ConnectWalletButton } from '../../modules/walletconnect/components/ConnectWalletButton';
import NetworkSwitch from '../../modules/walletconnect/components/NetworkSwitch';
import { useWalletConnect } from '../../modules/walletconnect/hooks/useWalletConnect';
import ThemeToggle from '../../utils/ThemeToggle';

const Topbar: React.FC = () => {
  const { connectedWallets, isRestoringSession, disconnectAll } = useWalletConnect();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirected = useRef(false);

  const isAnyWalletConnected = Object.keys(connectedWallets).length > 0;
  const evmWallet = connectedWallets.evm;
  const hasDydxDerived = !!evmWallet?.dydxAddress;
  const isReadyForDashboard =
    isAnyWalletConnected && (!evmWallet || hasDydxDerived);

  useEffect(() => {
    if (isRestoringSession) return;
    // Only redirect to dashboard on fresh connect from the home page.
    // If user is already on /markets, /send, etc., stay on their current page.
    if (isReadyForDashboard && !hasRedirected.current && location.pathname === ROUTES.HOME) {
      hasRedirected.current = true;
      navigate(ROUTES.DASHBOARD);
    }
  }, [isReadyForDashboard, isRestoringSession, navigate, location.pathname]);

  const handleDisconnectAll = useCallback(async () => {
    await disconnectAll();
    hasRedirected.current = false;
    navigate(ROUTES.HOME);
  }, [disconnectAll, navigate]);

  return (
    <header className="h-16 bg-(--color-bg-secondary) border-b border-(--color-border) flex items-center justify-between px-2">
      <h1 className="text-lg font-semibold text-(--color-text-primary)"></h1>

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
      </div>
    </header>
  );
};

export default Topbar;
