import type { FC, JSX } from 'react';
import { Link } from 'react-router-dom';
import { useAssetSelectorModal } from '../modules/commonfeature/components/useAssetSelectorModal';

interface Action {
  name: string;
  icon: string | JSX.Element;
  color: string;
  to?: string;
  onClick?: () => void;
}

const QuickActions: FC = () => {
  const { openAssetSelector } = useAssetSelectorModal();

  const actions: Action[] = [
    {
      name: 'Send',
      icon: '🚀',
      color: 'bg-purple-500/10',
      onClick: () => openAssetSelector('SEND')
    },
    {
      name: 'Receive',
      icon: '📥',
      color: 'bg-blue-500/10',
      onClick: () => openAssetSelector('RECEIVE')
    },
    {
      name: 'Swap',
      icon: '🔄',
      color: 'bg-green-500/10',
      to: '/trading/evm/swap'
    },
    {
      name: 'Buy',
      icon: '💳',
      color: 'bg-orange-500/10',
      to: '/trading/evm/fiat'
    },
    {
      name: 'Activity',
      icon: '🕒',
      color: 'bg-gray-500/10',
      to: '/transactions'
    },
  ];

  return (
    <div className="lg:rounded-2xl p-3 lg:p-6 transition-all duration-300 bg-secondary shadow-sm">
      <div className="grid grid-cols-5 gap-1 lg:gap-4">
        {actions.map(action => {
          const content = (
            <>
              <div
                className={`w-14 h-14 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center mb-2.5
                           ${action.color} shadow-sm border border-white/5
                          transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-md group-hover:brightness-110`}
              >
                <div className="text-2xl lg:text-3xl drop-shadow-sm transition-transform duration-300 group-hover:scale-110">{action.icon}</div>
              </div>
              <span className="text-[11px] sm:text-[13px] font-bold text-primary tracking-tight transition-colors duration-300 group-hover:text-brand">{action.name}</span>
            </>
          );

          const className = "group flex flex-col items-center justify-center p-1 sm:p-2 rounded-2xl transition-all duration-300 hover:bg-hover active:scale-95 cursor-pointer";

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


