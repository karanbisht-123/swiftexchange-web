import { PortfolioRedirectCard } from '@/components/dashboard/PortfolioRedirectCard';
import QuickActions from '@/components/dashboard/QuickActions';
import WalletAssetsSection from '@/modules/walletconnect/components/WalletAssetsSection';

const Dashboard = () => {
  return (
    <div className="w-full px-3 sm:px-4 md:px-6 py-2 sm:py-4 lg:bg-bg-secondary/40 lg:backdrop-blur-xl lg:rounded-2xl lg:shadow-premium transition-all">
      <div className="flex flex-col lg:flex-row-reverse lg:items-stretch gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div className="w-full lg:w-[40%] shrink-0">
          <PortfolioRedirectCard />
        </div>
        <div className="flex-1 min-w-0">
          <QuickActions />
        </div>
      </div>
      <WalletAssetsSection />
    </div>
  );
};

export default Dashboard;
