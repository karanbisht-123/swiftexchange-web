import QuickActions from '../components/QuickActions';
import StellarTransactionUI from '../modules/steallr/components/StellarTransactionUI';
// import { DydxIntegrationExample } from '../modules/dydx/components/DydxIntegrationExample';
// import DemoWalletConnect from '../modules/dydx/demo/components/DemoWalletConnect';
import WalletAssetsSection from '../modules/wallet/components/WalletAssetsSection';

const Dashboard = () => {
  return (
    <div className="lg:bg-secondary p-2 md:p-6 rounded-xl">
      {/* <DemoWalletConnect /> */}
      {/* <DydxIntegrationExample /> */}
      <StellarTransactionUI />
      <QuickActions />
      <WalletAssetsSection />
    </div>
  );
};

export default Dashboard;
