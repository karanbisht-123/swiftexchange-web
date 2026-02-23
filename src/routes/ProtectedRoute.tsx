import { Navigate, Outlet } from 'react-router-dom';

import { ROUTES } from '../constants/routes';
import { useWalletConnect } from '../modules/walletconnect/hooks/useWalletConnect';

const hasSavedSessions = (): boolean => {
  try {
    const stored = localStorage.getItem('wallet_sessions');
    if (!stored) return false;
    const data = JSON.parse(stored);
    return Object.keys(data).length > 0;
  } catch {
    return false;
  }
};
const RouteLoadingFallback = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100%',
      background: 'var(--color-bg-primary, #0a0a0f)',
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: 'var(--color-accent, #6366f1)',
        borderRadius: '50%',
        animation: 'protectedRouteSpin 0.8s linear infinite',
      }}
    />
    <style>{`@keyframes protectedRouteSpin { to { transform: rotate(360deg) } }`}</style>
  </div>
);

const ProtectedRoute = () => {
  const { connectedWallets, isRestoringSession } = useWalletConnect();
  const isConnected = Object.keys(connectedWallets).length > 0;
  if (isConnected) {
    return <Outlet />;
  }
  if (isRestoringSession || hasSavedSessions()) {
    return <RouteLoadingFallback />;
  }
  return <Navigate to={ROUTES.HOME} replace />;
};

export default ProtectedRoute;
