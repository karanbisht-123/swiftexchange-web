import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';
import { ConnectWalletButton } from '../../modules/walletconnect/components/ConnectWalletButton';
import NetworkSwitch from '../../modules/walletconnect/components/NetworkSwitch';
import { WalletType } from '../../modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '../../modules/walletconnect/hooks/useWalletConnect';
import ThemeToggle from '../../utils/ThemeToggle';

interface TopbarProps {}

const Topbar: React.FC<TopbarProps> = () => {
  const { connectedWallets, disconnect, isAnyWalletConnected } = useWalletConnect();

  const [showInfoMessage, setShowInfoMessage] = useState(false);
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  const isConnected = isAnyWalletConnected();

  console.log('show message:', showInfoMessage);

  const disconnectAll = useCallback(async () => {
    const types = Object.keys(connectedWallets) as WalletType[];
    for (const type of types) {
      await disconnect(type);
    }
  }, [connectedWallets, disconnect]);

  useEffect(() => {
    if (isConnected && !hasRedirected.current) {
      hasRedirected.current = true;
      navigate(ROUTES.DASHBOARD);
    }
  }, [isConnected, navigate]);

  useEffect(() => {
    if (isConnected && Object.keys(connectedWallets).length === 1) {
      setShowInfoMessage(true);
    }
  }, [isConnected, connectedWallets]);

  const handleDisconnectAll = async () => {
    await disconnectAll();
    hasRedirected.current = false;
    setShowInfoMessage(false);
    navigate(ROUTES.HOME);
  };

  return (
    <>
      <header className="h-16 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center justify-between px-2">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]"></h1>

        <div className="flex items-center gap-4">
          <NetworkSwitch />
          {isConnected ? (
            <div className="flex items-center gap-2">
              <ConnectWalletButton />
              <button
                onClick={handleDisconnectAll}
                className="hidden lg:block px-3 py-1 rounded-sm bg-[var(--color-danger)] text-white text-sm hover:opacity-90 transition"
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
    </>
  );
};

export default Topbar;
