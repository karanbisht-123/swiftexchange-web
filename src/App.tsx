import { RouterProvider } from 'react-router-dom';

// import SessionDebugger from './modules/walletconnect/components/SessionDebugger';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import router from './routes';

const App = () => {
  return (
    <>
      <WalletListModal />
      {/* <SessionDebugger /> */}
      <RouterProvider router={router} />
    </>
  );
};

export default App;
