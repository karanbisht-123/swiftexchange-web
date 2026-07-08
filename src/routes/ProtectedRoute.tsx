import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { ConnectWalletPromptModal } from '../components/common/ConnectWalletPromptModal';
import { ROUTES } from '../constants/routes';
import { useWalletConnect } from '../modules/walletconnect/hooks/useWalletConnect';

const ProtectedRoute = () => {
  const { connectedWallets, openModal } = useWalletConnect();
  const navigate = useNavigate();
  const isConnected = Object.keys(connectedWallets).length > 0;
  const [isOpen, setIsOpen] = useState(true);

  if (isConnected) {
    return <Outlet />;
  }

  return (
    <div className="fixed inset-0 bg-primary z-[999] flex items-center justify-center">
      <ConnectWalletPromptModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          navigate(ROUTES.TRADING_DYDX_FUTURES, { replace: true });
        }}
        onConnect={() => {
          setIsOpen(false);
          openModal();
        }}
        message="To access this feature, first connect your wallet."
      />
    </div>
  );
};

export default ProtectedRoute;
