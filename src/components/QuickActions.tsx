import { ArrowDown, ArrowUp, ClockArrowDown, CreditCard, Repeat } from 'lucide-react';
import type { FC, JSX } from 'react';
import { Link } from 'react-router-dom';

interface Action {
  name: string;
  icon: JSX.Element;
  to: string;
}

const QuickActions: FC = () => {
  const actions: Action[] = [
    { name: 'Send', icon: <ArrowUp className="w-8 h-8" />, to: '/send' },
    { name: 'Receive', icon: <ArrowDown className="w-8 h-8" />, to: '/receive' },
    { name: 'Swap', icon: <Repeat className="w-8 h-8" />, to: '/trading/evm/swap' },
    { name: 'Buy', icon: <CreditCard className="w-8 h-8" />, to: '/trading/evm/fiat' },
    { name: 'Activty', icon: <ClockArrowDown className="w-8 h-8" />, to: '/trading/evm/fiat' },
  ];

  return (
    <div className="lg:rounded-xl p-2 lg:p-6 transition-colors duration-200 bg-secondary">
      <div className="grid grid-cols-5 gap-2 lg:gap-3">
        {actions.map(action => (
          <Link
            key={action.name}
            to={action.to}
            className="group flex flex-col items-center justify-center p-2 sm:p-4 rounded-md
                    
                      transition-all duration-200 hover:scale-105"
          >
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center mb-2
                         backdrop-blur-sm bg-primary
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
