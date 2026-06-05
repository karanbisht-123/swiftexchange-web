import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkMonitor } from './components/NetworkMonitor';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import { initWalletListener } from './modules/walletconnect/store/walletConnectStore';
import { initDynamicTokenLists } from './modules/evm/utils/Chainregistry';
import { useGeolocationStore } from './store/geolocationStore';
import router from './routes';

const App = () => {
  useEffect(() => {
    initWalletListener();
    initDynamicTokenLists();
    useGeolocationStore.getState().fetchLocation();
  }, []);

  return (
    <ErrorBoundary>
      <NetworkMonitor />
      <WalletListModal />
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
};

export default App;
