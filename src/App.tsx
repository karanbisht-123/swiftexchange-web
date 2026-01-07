import { RouterProvider } from 'react-router-dom';

import { NetworkMonitor } from './components/NetworkMonitor';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import router from './routes';

const App = () => {
  return (
    <>
      <NetworkMonitor />
      <WalletListModal />
      <RouterProvider router={router} />
    </>
  );
};

export default App;
