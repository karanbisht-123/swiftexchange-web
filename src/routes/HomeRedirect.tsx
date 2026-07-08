import { Navigate } from 'react-router-dom';

import { ROUTES } from '../constants/routes';
import { useWalletConnect } from '../modules/walletconnect/hooks/useWalletConnect';

export const HomeRedirect = () => {
  const { connectedWallets } = useWalletConnect();
  const isConnected = Object.keys(connectedWallets).length > 0;

  if (isConnected) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <Navigate to={ROUTES.TRADING_DYDX_FUTURES} replace />;
};
