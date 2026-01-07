import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';
import { ConnectWalletButton } from '../../modules/walletconnect/components/ConnectWalletButton';
import NetworkSwitch from '../../modules/walletconnect/components/NetworkSwitch';
import { useWalletConnect } from '../../modules/walletconnect/hooks/useWalletConnect';
import ThemeToggle from '../../utils/ThemeToggle';

interface TopbarProps {}

const Topbar: React.FC<TopbarProps> = () => {
  const { isAnyWalletConnected, isRestoringSession, disconnectAll } = useWalletConnect();

  console.log(isRestoringSession, 'restore seeion ');
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (isAnyWalletConnected && !hasRedirected.current) {
      hasRedirected.current = true;
      navigate(ROUTES.DASHBOARD);
    }
  }, [isAnyWalletConnected, navigate]);

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
