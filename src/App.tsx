import { RouterProvider } from 'react-router-dom';

import { NetworkMonitor } from './components/NetworkMonitor';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import { GlobalNotifications } from './components/GlobalNotifications';
import { ErrorBoundary } from './components/ErrorBoundary';
import router from './routes';

const App = () => {
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
