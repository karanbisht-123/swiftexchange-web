import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';

import Layout from '../components/layout/Layout';
import RootLayout from '../components/layout/RootLayout';
import { ROUTES } from '../constants/routes';
import { GeolocationGuard } from '../modules/commonfeature/components/GeolocationGuard';
import { RESTRICTED_TRADING_LOCATIONS } from '../modules/commonfeature/constants/compliance';
import { HomeRedirect } from './HomeRedirect';
import ProtectedRoute from './ProtectedRoute';

const AlchemyPayIntegration = lazy(
  () => import('../modules/alchemyPay/components/AlchemyPayIntegration')
);
const ReceiveAssets = lazy(() => import('../modules/commonfeature/receiveassets/ReceiveAssets'));
const SendAssets = lazy(() => import('../modules/commonfeature/sendassets/SendAssets'));
const PerpetualsTradingPage = lazy(() => import('../pages/perps'));
const EvmTransactionHistory = lazy(() => import('../modules/evm/components/EvmTransactionHistory'));
const SwapAssets = lazy(() => import('../modules/evm/feature/swap/components/SwapAssets'));

const CryptoMarket = lazy(() => import('../modules/market/CryptoMarket'));
const StellarTradescreen = lazy(
  () => import('../modules/stellar/components/tradescreen/StellarTradescreen')
);
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Profile = lazy(() => import('../pages/Profile'));

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        path: ROUTES.HOME,
        element: <HomeRedirect />,
      },
      {
        path: ROUTES.TRADING_PERPS,
        element: (
          <Layout>
            <GeolocationGuard restrictedLocations={RESTRICTED_TRADING_LOCATIONS} blocking={true}>
              <PerpetualsTradingPage />
            </GeolocationGuard>
          </Layout>
        ),
      },
      {
        path: '/trade/v2/perpetuals',
        element: <Navigate to={ROUTES.TRADING_PERPS} replace />,
      },
      {
        path: ROUTES.TRADING_STELLAR,
        element: (
          <Layout>
            <StellarTradescreen />
          </Layout>
        ),
      },
      {
        path: '/trading/stellar/portfolio',
        element: <Navigate to={`${ROUTES.TRADING_STELLAR}?tab=portfolio`} replace />,
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: ROUTES.DASHBOARD,
            element: (
              <Layout>
                <Dashboard />
              </Layout>
            ),
          },
          {
            path: ROUTES.SEND,
            element: (
              <Layout>
                <SendAssets />
              </Layout>
            ),
          },
          {
            path: ROUTES.RECEIVE,
            element: (
              <Layout>
                <ReceiveAssets />
              </Layout>
            ),
          },
          {
            path: ROUTES.TRANSACTIONS,
            element: (
              <Layout>
                <EvmTransactionHistory />
              </Layout>
            ),
          },
          {
            path: ROUTES.TRADING_EVM_SWAP,
            element: (
              <Layout>
                <SwapAssets />
              </Layout>
            ),
          },
          {
            path: ROUTES.TRADING_EVM_FIAT,
            element: (
              <Layout>
                <AlchemyPayIntegration />
              </Layout>
            ),
          },
          {
            path: ROUTES.MARKETS,
            element: (
              <Layout>
                <CryptoMarket />
              </Layout>
            ),
          },
          {
            path: ROUTES.PORTFOLIO,
            element: (
              <Layout>
                <Profile />
              </Layout>
            ),
          },
          {
            path: ROUTES.MY_ASSETS,
            element: (
              <Layout>
                <Profile />
              </Layout>
            ),
          },
        ],
      },
      {
        path: '*',
        element: <Navigate to={ROUTES.HOME} replace />,
      },
    ],
  },
]);

export default router;
