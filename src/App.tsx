import { RouterProvider } from 'react-router-dom';

import { NetworkMonitor } from './components/NetworkMonitor';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import { GlobalNotifications } from './components/GlobalNotifications';
import router from './routes';

const App = () => {
  return (
    <>
      <NetworkMonitor />
      <WalletListModal />
      <GlobalNotifications />
      <RouterProvider router={router} />
    </>
  );
};

export default App;
