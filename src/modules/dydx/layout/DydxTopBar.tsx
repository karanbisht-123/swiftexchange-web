import { type FC } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface TabItem {
  key: string;
  label: string;
}

const DydxTopBar: FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('view') || 'trade';

  const tabs: TabItem[] = [
    {
      key: 'trade',
      label: 'Trade',
    },
    {
      key: 'markets',
      label: 'Markets',
    },
    {
      key: 'portfolio',
      label: 'Portfolio',
    },
  ];

  const handleTabClick = (tabKey: string) => {
    navigate(`/trading/dydx/futures?view=${tabKey}`);
  };

  return (
    <div className="w-full bg-secondary border-b border-color">
      <div className="flex items-center gap-1  ">
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              className={`
                flex items-center gap-2 px-4 py-1 
                transition-all duration-150 font-medium text-sm
                ${isActive ? 'text-white' : 'text-primary hover:bg-tertiary'}
              `}
              style={{
                backgroundColor: isActive ? 'var(--color-brand-primary)' : 'transparent',
              }}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DydxTopBar;
