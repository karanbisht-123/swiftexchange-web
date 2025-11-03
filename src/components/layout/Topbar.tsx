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
  const { connectedWallets, openModal, disconnectType } = useWalletConnect();
  const [showInfoMessage, setShowInfoMessage] = useState(false);
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  const isConnected = Object.keys(connectedWallets).length > 0;
  // const walletAddresses = Object.values(connectedWallets).map(wallet => wallet.address);
  const firstWalletType = Object.keys(connectedWallets)[0] as WalletType | undefined;

  const disconnectAll = useCallback(async () => {
    const types = Object.keys(connectedWallets) as WalletType[];
    for (const type of types) {
      await disconnectType(type);
    }
  }, [connectedWallets, disconnectType]);

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
    if (isConnected) {
      navigate(ROUTES.HOME);
    }
  };

  const handleAddMoreWallets = () => {
    openModal();
    setShowInfoMessage(false);
  };

  const getWelcomeMessage = () => {
    if (!firstWalletType) return '';

    switch (firstWalletType) {
      case WalletType.EVM:
        return 'EVM wallet connected successfully! You can now use EVM and DYDX chain features. Connect to the DYDX chain for full access to DeFi tools and trading.';
      case WalletType.COSMOS:
        return 'Cosmos wallet connected! Explore Cosmos ecosystem features and IBC transfers. Add more wallets for cross-chain functionality.';
      case WalletType.STELLAR:
        return 'Stellar wallet connected! Use Stellar for fast, low-cost payments and asset transfers. Enhance your setup by adding EVM or Cosmos wallets.';
      default:
        return 'Wallet connected successfully! Manage your connections and add more wallets to unlock additional features.';
    }
  };

  const welcomeMessage = getWelcomeMessage();

  return (
    <>
      <header className="h-16 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center justify-between px-2">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]"></h1>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <NetworkSwitch />
          {isConnected ? (
            <div className="flex items-center gap-2">
              {/* <span className="text-sm font-mono text-[var(--color-text-primary)] hidden sm:block">
                {walletAddresses[0]?.slice(0, 6)}...
                {walletAddresses[0]?.slice(-4)}
              </span> */}
              <ConnectWalletButton />
              <button
                onClick={handleDisconnectAll}
                className="px-3 py-1 rounded-sm bg-[var(--color-danger)] text-white text-sm hover:opacity-90 transition"
              >
                Disconnect All
              </button>
            </div>
          ) : (
            <ConnectWalletButton />
          )}
        </div>
      </header>

      {showInfoMessage && welcomeMessage && (
        <div className="bg-blue-50 border-b border-blue-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2 flex-1">
            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-xs font-bold">i</span>
            </div>
            <span className="text-sm text-blue-800">{welcomeMessage}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleAddMoreWallets}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
            >
              Add More Wallets
            </button>
            <button
              onClick={() => setShowInfoMessage(false)}
              className="text-blue-600 text-sm hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Topbar;
