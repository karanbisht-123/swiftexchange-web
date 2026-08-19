import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkMonitor } from './components/NetworkMonitor';
import { initDynamicTokenLists } from './modules/evm/utils/Chainregistry';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import {
  initWalletListener,
  useWalletStore,
} from './modules/walletconnect/store/walletConnectStore';
import router from './routes';
import { registerDevice } from './service/deviceService';
import { useGeolocationStore } from './store/geolocationStore';

const printSecurityWarning = () => {
  if (import.meta.env.PROD) {
    console.log(
      '%cStop!',
      'color: red; font-size: 60px; font-weight: bold; text-shadow: 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000;'
    );
    console.log(
      "%cThis is a browser feature intended for developers.\nIf someone told you to copy-paste something here to enable a feature or 'hack' someone's account, it is a scam and will give them access to your SwiftEx wallet and funds.",
      'font-size: 18px; font-weight: bold; color: white;'
    );
    console.log(
      '%cSee https://en.wikipedia.org/wiki/Self-XSS for more information.',
      'font-size: 16px; color: #3b82f6;'
    );
  }
};

printSecurityWarning();

const isValidDevicePayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.uniqueId === 'string' &&
    p.uniqueId.trim() !== '' &&
    typeof p.fcmToken === 'string' &&
    p.fcmToken.trim() !== ''
  );
};

const App = () => {
  const session = useWalletStore(state => state.session);

  console.log(session?.peer?.metadata?.userDevice, '---------');
  const devicePayload = session?.peer?.metadata?.userDevice;

  useEffect(() => {
    initWalletListener();
    initDynamicTokenLists();
    useGeolocationStore.getState().fetchLocation();
  }, []);

  useEffect(() => {
    const storedTimestamp = localStorage.getItem('device_token_timestamp');
    if (storedTimestamp) {
      const elapsed = Date.now() - parseInt(storedTimestamp, 10);
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      if (elapsed > ONE_WEEK_MS) {
        localStorage.removeItem('device_token');
        localStorage.removeItem('device_token_timestamp');
      }
    }

    const storedToken = localStorage.getItem('device_token');
    if (storedToken) {
      return;
    }
    if (!isValidDevicePayload(devicePayload)) {
      return;
    }

    registerDevice(devicePayload)
      .then(res => {
        const token = res.token || res.data?.token || res.deviceToken;
        if (token) {
          localStorage.setItem('device_token', token);
          localStorage.setItem('device_token_timestamp', Date.now().toString());
        }
      })
      .catch(() => {});
  }, [devicePayload]);

  return (
    <ErrorBoundary>
      <NetworkMonitor />
      <WalletListModal />
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
};

export default App;
