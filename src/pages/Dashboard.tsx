import QuickActions from '../components/QuickActions';
import WalletAssetsSection from '../modules/walletconnect/components/WalletAssetsSection';

const Dashboard = () => {
  return (
    <div className="lg:bg-secondary py-1 md:p-6 lg:rounded-xl">
      <QuickActions />
      <WalletAssetsSection />
    </div>
  );
};

export default Dashboard;
