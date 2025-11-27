import { useState } from 'react';

import Orderbook from './Orderbook';
import TradesDisplay from './TradesDisplay';

const OrderAndTrades = () => {
  const [activeTab, setActiveTab] = useState<'order' | 'trades'>('order');

  return (
    <div className="h-full card overflow-hidden" style={{ borderRadius: 0, padding: 0 }}>
      <div className="flex bg-tertiary border-b border-[#232027]">
        <button
          onClick={() => setActiveTab('order')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 relative ${
            activeTab === 'order' ? 'text-primary' : 'text-secondary hover:text-primary'
          }`}
        >
          Order Book
          {activeTab === 'order' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0066ff] animate-slide-in" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('trades')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 relative ${
            activeTab === 'trades' ? 'text-primary' : 'text-secondary hover:text-primary'
          }`}
        >
          Trades
          {activeTab === 'trades' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0066ff] animate-slide-in" />
          )}
        </button>
      </div>

      <div className="relative h-full overflow-hidden">
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            activeTab === 'order' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          <Orderbook />
        </div>

        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            activeTab === 'trades' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          <TradesDisplay />
        </div>
      </div>

      <style>{`
        @keyframes slide-in {
          from {
            transform: scaleX(0);
            opacity: 0;
          }
          to {
            transform: scaleX(1);
            opacity: 1;
          }
        }

        .animate-slide-in {
          animation: slide-in 200ms ease-out;
          transform-origin: left;
        }
      `}</style>
    </div>
  );
};

export default OrderAndTrades;
