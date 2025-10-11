import { Navigate, Outlet } from 'react-router-dom';

import { ROUTES } from '../constants/routes';
import { useWalletStore } from '../modules/wallet/store.ts/walletStore';

// import { useWalletConnectStore } from '../modules/walletconnect/store/walletConnectStore';

const ProtectedRoute = () => {
  const { isConnected } = useWalletStore();

  if (!isConnected) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
