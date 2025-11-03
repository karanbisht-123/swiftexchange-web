import QuickActions from '../components/QuickActions';
import WalletAssetsSection from '../modules/wallet/components/WalletAssetsSection';

// import SessionDebugger from '../modules/walletconnect/components/SessionDebugger';

const Dashboard = () => {
  return (
    <div className="lg:bg-secondary p-2 md:p-6 rounded-xl">
      <QuickActions />
      <WalletAssetsSection />
      {/* <SessionDebugger /> */}
    </div>
  );
};

export default Dashboard;
