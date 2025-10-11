import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';
import ConnectWalletModal from '../../modules/wallet/ConnectWalletModal';
import { useWalletStore } from '../../modules/wallet/store.ts/walletStore';
import ThemeToggle from '../../utils/ThemeToggle';

// Interface for component props (empty as Topbar accepts no props)
interface TopbarProps {}

/**
 * Topbar component for navigation and wallet connection management.
 * Provides a toggle between Demo Wallet and WalletConnect options.
 */
const Topbar: React.FC<TopbarProps> = () => {
  const { isConnected, walletAddresses, disconnectWallet } = useWalletStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [isDemoWallet, setIsDemoWallet] = useState(true); // Toggle state for wallet type
  const navigate = useNavigate();
  const hasRedirected = useRef(false); // Track if redirect has occurred

  // Redirect to dashboard on successful connection
  useEffect(() => {
    if (isConnected && !hasRedirected.current) {
      hasRedirected.current = true;
      navigate(ROUTES.DASHBOARD);
    }
  }, [isConnected, navigate]);

  // Handle wallet disconnection
  const handleDisconnect = () => {
    disconnectWallet();
    hasRedirected.current = false;
    navigate(ROUTES.HOME);
  };

  // Toggle between Demo Wallet and WalletConnect
  const toggleWalletType = () => {
    setIsDemoWallet(prev => !prev);
  };

  return (
    <>
      <header className="h-16 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex items-center justify-between px-2">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]"></h1>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          {isConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-[var(--color-text-primary)] hidden sm:block">
                {walletAddresses[0]?.slice(0, 6)}...
                {walletAddresses[0]?.slice(-4)}
              </span>
              <button
                onClick={handleDisconnect}
                className="px-3 py-1 rounded-sm bg-[var(--color-danger)] text-white text-sm hover:opacity-90 transition"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleWalletType}
                className="px-3 py-1 rounded-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-sm hover:opacity-90 transition"
              >
                {isDemoWallet ? 'Use WalletConnect' : 'Use Demo Wallet'}
              </button>
              {isDemoWallet ? (
                <button
                  onClick={() => setModalOpen(true)}
                  className="px-3 py-1 rounded-sm bg-[var(--color-brand-primary)] text-white text-sm hover:opacity-90 transition"
                >
                  Demo Wallet
                </button>
              ) : (
                <></>
              )}
            </div>
          )}
        </div>
      </header>
      <ConnectWalletModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

export default Topbar;
