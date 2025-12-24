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

  // Handle redirect to dashboard only AFTER restoration is complete
  useEffect(() => {
    // if (isRestoringSession) return; // Still loading → wait

    if (isAnyWalletConnected && !hasRedirected.current) {
      hasRedirected.current = true;
      navigate(ROUTES.DASHBOARD);
    }
  }, [isAnyWalletConnected, navigate]);

  // Reset redirect flag when all wallets are disconnected
  const handleDisconnectAll = useCallback(async () => {
    await disconnectAll();
    hasRedirected.current = false;
    navigate(ROUTES.HOME);
  }, [disconnectAll, navigate]);

  return (
    <header className="h-16 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center justify-between px-2">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
        {/* Optional: Add your app logo/name here */}
      </h1>

      <div className="flex items-center gap-4">
        <NetworkSwitch />

        {/* Loading state during session restoration */}
        {isAnyWalletConnected ? (
          <div className="flex items-center gap-2">
            <ConnectWalletButton />
            <button
              onClick={handleDisconnectAll}
              className="hidden lg:block px-3 py-1.5 rounded-sm bg-[var(--color-danger)] text-white text-sm hover:opacity-90 transition"
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
