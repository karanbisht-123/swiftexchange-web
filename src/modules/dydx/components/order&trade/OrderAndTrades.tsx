import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { useState } from 'react';

import Orderbook from './Orderbook';
import TradesDisplay from './TradesDisplay';

type MobileView = 'split' | 'orderbook' | 'trades';

const OrderAndTrades = () => {
  const [activeTab, setActiveTab] = useState<'order' | 'trades'>('order');
  const [mobileView, setMobileView] = useState<MobileView>('split');

  return (
    <>
      <div
        className="hidden md:flex md:flex-col h-[500px] lg:h-[600px] card overflow-hidden"
        style={{ borderRadius: 0, padding: 0 }}
      >
        <div className="flex bg-tertiary border-b border-[#232027] flex-shrink-0">
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

        <div className="relative flex-1 overflow-hidden">
          <div
            className={`absolute inset-0 transition-opacity duration-200 overflow-auto hide-scrollbar ${
              activeTab === 'order' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            <Orderbook />
          </div>

          <div
            className={`absolute inset-0 transition-opacity duration-200 overflow-auto hide-scrollbar ${
              activeTab === 'trades' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            <TradesDisplay />
          </div>
        </div>
      </div>

      {/* Mobile View - App-like feel with 70vh */}
      <div className="md:hidden bottom-0 left-0 right-0 h-[75vh] flex overflow-hidden bg-[#0e0c15] z-50 shadow-2xl border-t border-[#232027]">
        <div
          className={`transition-all duration-300 ease-in-out border-r border-gray-800 overflow-hidden flex flex-col ${
            mobileView === 'split' ? 'w-1/2' : mobileView === 'orderbook' ? 'w-full' : 'w-0'
          }`}
        >
          <div className="bg-tertiary border-b border-gray-800 px-2 py-2 flex-shrink-0 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold text-primary truncate flex-1">Order Book</h3>
            <div className="flex items-center gap-1 ml-2">
              {mobileView !== 'orderbook' && (
                <button
                  onClick={() => setMobileView('orderbook')}
                  className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                  title="Expand Order Book"
                >
                  <Maximize2 className="w-3 h-3 text-gray-400" />
                </button>
              )}
              {mobileView === 'orderbook' && (
                <button
                  onClick={() => setMobileView('split')}
                  className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                  title="Split View"
                >
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto hide-scrollbar">
            <Orderbook />
          </div>
        </div>

        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${
            mobileView === 'split' ? 'w-1/2' : mobileView === 'trades' ? 'w-full' : 'w-0'
          }`}
        >
          <div className="bg-tertiary border-b border-gray-800 px-2 py-2 flex-shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-1 mr-2">
              {mobileView === 'trades' && (
                <button
                  onClick={() => setMobileView('split')}
                  className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                  title="Split View"
                >
                  <ChevronLeft className="w-3 h-3 text-gray-400" />
                </button>
              )}
              {mobileView !== 'trades' && (
                <button
                  onClick={() => setMobileView('trades')}
                  className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                  title="Expand Trades"
                >
                  <Maximize2 className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
            <h3 className="text-[10px] font-semibold text-primary truncate flex-1 text-right">
              Trades
            </h3>
          </div>
          <div className="flex-1 overflow-auto hide-scrollbar">
            <TradesDisplay />
          </div>
        </div>

        {mobileView === 'split' && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex gap-2 bg-gray-900/95 backdrop-blur-sm rounded-full px-3 py-2 shadow-lg border border-gray-700">
            <button
              onClick={() => setMobileView('orderbook')}
              className="p-1.5 hover:bg-gray-700 rounded-full transition-colors"
              title="Expand Order Book"
            >
              <ChevronLeft className="w-4 h-4 text-gray-300" />
            </button>
            <div className="w-px bg-gray-700" />
            <button
              onClick={() => setMobileView('trades')}
              className="p-1.5 hover:bg-gray-700 rounded-full transition-colors"
              title="Expand Trades"
            >
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>
          </div>
        )}
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

        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }

        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </>
  );
};

export default OrderAndTrades;
