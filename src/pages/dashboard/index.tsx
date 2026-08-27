import { PortfolioRedirectCard } from '@/components/dashboard/PortfolioRedirectCard';
import QuickActions from '@/components/dashboard/QuickActions';
import WalletAssetsSection from '@/modules/walletconnect/components/WalletAssetsSection';

const Dashboard = () => {
  return (
    <div className="lg:bg-bg-secondary/40 lg:backdrop-blur-xl lg:border-none md:p-6 lg:rounded-2xl lg:shadow-premium">
      <div className="flex flex-col lg:flex-row-reverse lg:items-stretch gap-1 sm:gap-4 mb-1 sm:mb-4">
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
