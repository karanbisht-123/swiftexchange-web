import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalNotifications } from './components/GlobalNotifications';
import { NetworkMonitor } from './components/NetworkMonitor';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import { initWalletListener } from './modules/walletconnect/store/walletConnectStore';
import { fetchStellarCuratedAssets } from './modules/evm/utils/chains/stellar';
import router from './routes';

const App = () => {
  useEffect(() => {
    initWalletListener();
    fetchStellarCuratedAssets();
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
