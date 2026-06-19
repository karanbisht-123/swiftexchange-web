import { createBrowserRouter } from 'react-router-dom';

import Layout from '../components/layout/Layout';
import RootLayout from '../components/layout/RootLayout';
import { ROUTES } from '../constants/routes';
import AlchemyPayIntegration from '../modules/alchemyPay/components/AlchemyPayIntegration';
import { GeolocationGuard } from '../modules/commonfeature/components/GeolocationGuard';
import { RESTRICTED_TRADING_LOCATIONS } from '../modules/commonfeature/constants/compliance';
import ReceiveAssets from '../modules/commonfeature/reciveassets/ReceiveAssets';
import SendAssets from '../modules/commonfeature/sendassets/SendAssets';
// import MarketsDisplay from '../modules/dydx/components/MarketsDisplay';
import TradingintrFace from '../modules/dydx/components/tradedashbord/TradingintrFace';
import EvmTransactionHistory from '../modules/evm/components/EvmTransactionHistory';
// import BridgePage from '../modules/evm/feature/bridge/BridgePage';
// import WebSocketDebugger from '../modules/dydx/utils/WebSocketDebugger';
import SwapAssets from '../modules/evm/feature/swap/SwapAssets';
import CryptoMarket from '../modules/market/CryptoMarket';
// import TradeTransactionUI from '../modules/steallr/components/TradeTransactionUI';
import StallerTradescreen from '../modules/steallr/components/tradescreen/StallerTradescreen';
import Dashboard from '../pages/Dashboard';
import Home from '../pages/Home';
import Profile from '../pages/Profile';
import ProtectedRoute from './ProtectedRoute';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        path: ROUTES.HOME,
        element: <Home />,
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
            path: ROUTES.TRADING_STEALLR,
            element: (
              <Layout>
                <StallerTradescreen />
              </Layout>
            ),
          },
          {
            path: ROUTES.TRANSACTIONS,
            element: (
              <Layout>
                {/* <TradeTransactionUI /> */}
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
          // {
          //   path: ROUTES.BRIDGE,
          //   element: (
          //     <Layout>
          //       <BridgePage />
          //     </Layout>
          //   ),
          // },
          {
            path: ROUTES.TRADING_DYDX_FUTURES,
            element: (
              <Layout>
                <GeolocationGuard
                  restrictedLocations={RESTRICTED_TRADING_LOCATIONS}
                  blocking={true}
                >
                  <TradingintrFace />
                </GeolocationGuard>
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
    ],
  },
]);

export default router;
