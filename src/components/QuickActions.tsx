import { ArrowDown, ArrowUp, ClockArrowDown, CreditCard, Repeat } from 'lucide-react';
import type { FC, JSX } from 'react';
import { Link } from 'react-router-dom';
import { useAssetSelectorModal } from '../modules/commonfeature/components/useAssetSelectorModal';

interface Action {
  name: string;
  icon: JSX.Element;
  to?: string;
  onClick?: () => void;
}

const QuickActions: FC = () => {
  const { openAssetSelector } = useAssetSelectorModal();

  const actions: Action[] = [
    { 
      name: 'Send', 
      icon: <ArrowUp className="w-8 h-8" />, 
      onClick: () => openAssetSelector('SEND') 
    },
    { 
      name: 'Receive', 
      icon: <ArrowDown className="w-8 h-8" />, 
      onClick: () => openAssetSelector('RECEIVE') 
    },
    { name: 'Swap', icon: <Repeat className="w-8 h-8" />, to: '/trading/evm/swap' },
    { name: 'Buy', icon: <CreditCard className="w-8 h-8" />, to: '/trading/evm/fiat' },
    { name: 'Activty', icon: <ClockArrowDown className="w-8 h-8" />, to: '/transactions' },
  ];

  return (
    <div className="lg:rounded-xl p-2 lg:p-6 transition-colors duration-200 bg-secondary">
      <div className="grid grid-cols-5 gap-2 lg:gap-3">
        {actions.map(action => {
          const content = (
            <>
              <div
                className="w-14 h-14 lg:w-16 lg:h-16 rounded-lg flex items-center justify-center mb-2
                           backdrop-blur-sm bg-primary
                          transition-transform duration-200 group-hover:scale-110"
              >
                <div className="text-primary">{action.icon}</div>
              </div>
              <span className="text-xs sm:text-sm font-medium text-primary">{action.name}</span>
            </>
          );

          const className = "group flex flex-col items-center justify-center p-2 sm:p-4 rounded-md transition-all duration-200 hover:scale-105 cursor-pointer";

          if (action.to) {
            return (
              <Link key={action.name} to={action.to} className={className}>
                {content}
              </Link>
            );
          }

          return (
            <button key={action.name} onClick={action.onClick} className={className}>
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickActions;
