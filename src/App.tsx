import { RouterProvider } from 'react-router-dom';

import { NetworkMonitor } from './components/NetworkMonitor';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import { GlobalNotifications } from './components/GlobalNotifications';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initWalletListener } from './modules/walletconnect/store/walletConnectStore';
import router from './routes';

import { useEffect } from 'react';

const App = () => {
  useEffect(() => {
    initWalletListener();
  }, []);

  return (
    <ErrorBoundary>
      <NetworkMonitor />
      <WalletListModal />
      <GlobalNotifications />
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
};

export default App;
