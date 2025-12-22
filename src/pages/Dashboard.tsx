import QuickActions from '../components/QuickActions';
import WalletAssetsSection from '../modules/walletconnect/components/WalletAssetsSection';

const Dashboard = () => {
  return (
    <div className="lg:bg-secondary p-2 md:p-6 rounded-xl">
      <QuickActions />
      <WalletAssetsSection />
    </div>
  );
};

export default Dashboard;
