import { PortfolioRedirectCard } from '@/components/dashboard/PortfolioRedirectCard';
import QuickActions from '@/components/dashboard/QuickActions';
import WalletAssetsSection from '@/modules/walletconnect/components/WalletAssetsSection';

const Dashboard = () => {
  return (
    <div className="lg:bg-secondary md:p-6 lg:rounded-xl">
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-0 sm:gap-4 mb-1 sm:mb-4">
        <div className="flex-1 min-w-0">
          <PortfolioRedirectCard />
        </div>
        <div className="lg:w-[500px] shrink-0">
          <QuickActions />
        </div>
      </div>
      <WalletAssetsSection />
    </div>
  );
};

export default Dashboard;
