import { ArrowDown, ArrowUp, CreditCard, Repeat } from 'lucide-react';
// TrendingDown, TrendingUp
import type { FC, JSX } from 'react';
import { Link } from 'react-router-dom';

import { useThemeStore } from '../store/themeStore';

interface Action {
  name: string;
  icon: JSX.Element;
  to: string;
}

const QuickActions: FC = () => {
  const { theme } = useThemeStore();

  const actions: Action[] = [
    { name: 'Send', icon: <ArrowUp className="w-5 h-5" />, to: '/send' },
    { name: 'Receive', icon: <ArrowDown className="w-5 h-5" />, to: '/receive' },
    { name: 'Swap', icon: <Repeat className="w-5 h-5" />, to: '/trading/evm/swap' },
    { name: 'Buy', icon: <CreditCard className="w-5 h-5" />, to: '/trading/evm/fiat' },
  ];

  // const totalBalance = '124,567.89';
  // const percentageChange = 12.5;
  // const isPositive = percentageChange > 0;

  return (
    <div
      className="rounded-xl p-4 lg:p-6 transition-colors duration-200"
      style={{
        background:
          theme === 'dark'
            ? 'linear-gradient(135deg, #1a1f2e 0%, #242938 100%)'
            : 'linear-gradient(135deg, #020e46 0%, #0d1a6e 100%)',
        boxShadow:
          theme === 'dark'
            ? 'inset 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 -1px 2px rgba(255, 255, 255, 0.05)'
            : 'none',
        border:
          theme === 'dark'
            ? '1px solid rgba(255, 255, 255, 0.08)'
            : '1px solid rgba(255, 255, 255, 0.15)',
      }}
    >
      {/* Portfolio Balance Section */}
      {/* <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-white/70 text-sm mb-1">Total Balance</p>
          <h2 className="text-white text-3xl sm:text-4xl font-bold mb-2">${totalBalance}</h2>
          <p className="text-white/60 text-xs">USD</p>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
            isPositive ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-4 h-4 text-green-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-400" />
          )}
          <span
            className={`text-sm font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}
          >
            {isPositive ? '+' : ''}
            {percentageChange}%
          </span>
        </div>
      </div> */}

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-4 gap-2 lg:gap-3">
        {actions.map(action => (
          <Link
            key={action.name}
            to={action.to}
            className="group flex flex-col items-center justify-center p-2 sm:p-4 rounded-md
                      bg-white/10 hover:bg-white/15
                      transition-all duration-200 hover:scale-105"
          >
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-2
                        bg-white/20 backdrop-blur-sm
                        transition-transform duration-200 group-hover:scale-110"
            >
              <div className="text-white">{action.icon}</div>
            </div>

            <span className="text-xs sm:text-sm font-medium text-white">{action.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
