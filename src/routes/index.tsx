import { createBrowserRouter } from 'react-router-dom';

import Layout from '../components/layout/Layout';
import RootLayout from '../components/layout/RootLayout';
import { ROUTES } from '../constants/routes';
import AlchemyPayIntegration from '../modules/alchemyPay/components/AlchemyPayIntegration';
import ReceiveAssets from '../modules/commonfeature/reciveassets/ReceiveAssets';
import SendAssets from '../modules/commonfeature/sendassets/SendAssets';
// import MarketsDisplay from '../modules/dydx/components/MarketsDisplay';
import TradingintrFace from '../modules/dydx/components/tradedashbord/TradingintrFace';
import EvmTransactionHistory from '../modules/evm/components/EvmTransactionHistory';
// import WebSocketDebugger from '../modules/dydx/utils/WebSocketDebugger';
import SwapAssets from '../modules/evm/feature/swap/SwapAssets';
import CryptoMarket from '../modules/market/CryptoMarket';
import TradeTransactionUI from '../modules/steallr/components/TradeTransactionUI';
import AssetManager from '../modules/steallr/components/stellarassets/AssetManager';
import StallerTradescreen from '../modules/steallr/components/tradescreen/StallerTradescreen';
import Dashboard from '../pages/Dashboard';
import Home from '../pages/Home';
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
            path: ROUTES.MY_ASSETS,
            element: (
              <Layout>
                <AssetManager />
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
          {
            path: ROUTES.TRADING_DYDX_FUTURES,
            element: (
              <Layout>
                <TradingintrFace />
                {/* <WebSocketDebugger /> */}
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
        ],
      },
    ],
  },
]);

export default router;
