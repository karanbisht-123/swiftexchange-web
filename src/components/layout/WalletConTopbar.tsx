import { Bell } from 'lucide-react';
import { useState } from 'react';

import ConnectWalletModal from '../../modules/wallet/ConnectWalletModal';
import ThemeToggle from '../../utils/ThemeToggle';

const WalletConTopbar: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <header className="py-4 bg-secondary flex items-center justify-between px-4">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]"></h1>

        <div className="flex items-center gap-4">
          <button className="relative hidden">
            <Bell className="w-5 h-5 text-[var(--color-text-primary)]" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-[var(--color-danger)] rounded-full"></span>
          </button>

          <ThemeToggle />

          {/* <WalletConnectButton /> */}
        </div>
      </header>

      <ConnectWalletModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

export default WalletConTopbar;
