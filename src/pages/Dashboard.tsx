import QuickActions from '../components/QuickActions';
import WalletAssetsSection from '../modules/walletconnect/components/WalletAssetsSection';

const Dashboard = () => {
  return (
    <div className="lg:bg-secondary  md:p-6 lg:rounded-xl">
      <div className="mb-1">
        <QuickActions />
      </div>
      <WalletAssetsSection />
    </div>
  );
};

export default Dashboard;
