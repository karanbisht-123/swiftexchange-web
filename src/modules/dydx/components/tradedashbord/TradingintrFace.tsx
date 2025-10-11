import DyDxTradingChart from '../DyDxTradingChart';
import MarketSwitcher from '../market/MarketSwitcher';
import OrderAndTrades from '../order&trade/OrderAndTrades';

const TradingintrFace = () => {
  return (
    <div className="min-h-screen bg-primary text-primary font-body flex flex-col">
      {/* Header Section */}
      <div className="flex justify-between items-center ">
        <div className="flex items-center space-x-4 py-1">
          <MarketSwitcher />
        </div>
        {/* Header Right */}
        <div className="flex space-x-2"></div>
      </div>

      {/* Main Content */}
      <div className="flex max-h-[580px] overflow-hidden  flex-1">
        {/* Chart Section */}
        <div className="w-2/3 bg-secondary">
          <DyDxTradingChart />
        </div>
        {/* Trading Panel */}
        <div className="w-1/3 bg-secondary">
          <OrderAndTrades />
        </div>
      </div>

      {/* Footer Section */}
      <div className="p-4 border-t border-color"></div>
    </div>
  );
};

export default TradingintrFace;
