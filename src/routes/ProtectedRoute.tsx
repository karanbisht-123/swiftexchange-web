import { Navigate, Outlet } from 'react-router-dom';

import { ROUTES } from '../constants/routes';
import { useWalletConnect } from '../modules/walletconnect/hooks/useWalletConnect';

const ProtectedRoute = () => {
  const { connectedWallets } = useWalletConnect();
  const isConnected = Object.keys(connectedWallets).length > 0;

  if (!isConnected) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
