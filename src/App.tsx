import { RouterProvider } from 'react-router-dom';

import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import router from './routes';

const App = () => {
  return (
    <>
      <WalletListModal />
      <RouterProvider router={router} />
    </>
  );
};

export default App;
