import { useState } from 'react';

import Orderbook from './Orderbook';
import TradesDisplay from './TradesDisplay';

const OrderAndTrades = () => {
  const [activeTab, setActiveTab] = useState<'order' | 'trades'>('order');

  return (
    <div className=" w-64 h-full card overflow-hidden" style={{ borderRadius: 0, padding: 0 }}>
      {/* Toggle Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('order')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'order'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Order Book
        </button>
        <button
          onClick={() => setActiveTab('trades')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'trades'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Trades
        </button>
      </div>

      {/* Content */}
      <div className="">
        {activeTab === 'order' && <Orderbook />}
        {activeTab === 'trades' && <TradesDisplay />}
      </div>
    </div>
  );
};

export default OrderAndTrades;
