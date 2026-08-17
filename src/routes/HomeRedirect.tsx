import { Navigate } from 'react-router-dom';

import { ROUTES } from '../constants/routes';
import { useWalletStore } from '../modules/walletconnect/store/walletConnectStore';

export const HomeRedirect = () => {
  const connectedWallets = useWalletStore(s => s.connectedWallets);
  const isConnected = Object.keys(connectedWallets).length > 0;

  if (isConnected) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <Navigate to={ROUTES.TRADING_EVM_SWAP} replace />;
};
