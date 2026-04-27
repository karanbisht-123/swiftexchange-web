import {
  Infinity as InfinityIcon,
  BarChart2,
  CandlestickChart,
  History,
  Landmark,
  LayoutDashboard,
  Menu,
  QrCode,
  Repeat2,
  SendHorizontal,
  X,
} from 'lucide-react';
import type { FC, JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';

interface NavItem {
  href: string;
  label: string;
  icon: JSX.Element;
  queryParam?: string;
}

const Sidebar: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const activeItem = location.pathname;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const sidebar = document.getElementById('sidebar');
      const hamburger = document.getElementById('hamburger-btn');

      if (
        isOpen &&
        sidebar &&
        hamburger &&
        !sidebar.contains(event.target as Node) &&
        !hamburger.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const navItems: NavItem[] = [
    {
      href: ROUTES.DASHBOARD,
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      href: ROUTES.SEND,
      label: 'Send',
      icon: <SendHorizontal className="w-5 h-5" />,
    },
    {
      href: ROUTES.RECEIVE,
      label: 'Receive',
      icon: <QrCode className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRADING_EVM_SWAP,
      label: 'Swap',
      icon: <Repeat2 className="w-5 h-5" />,
    },
    // {
    //   href: ROUTES.BRIDGE,
    //   label: 'Bridge',
    //   icon: <ArrowRightLeft className="w-5 h-5" />,
    // },
    {
      href: ROUTES.TRADING_EVM_FIAT,
      label: 'Fiat On/Off Ramp',
      icon: <Landmark className="w-5 h-5" />,
    },
    {
      href: ROUTES.MARKETS,
      label: 'Markets',
      icon: <BarChart2 className="w-5 h-5" />,
      queryParam: '?view=markets',
    },
    {
      href: ROUTES.TRANSACTIONS,
      label: 'Transactions',
      icon: <History className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRADING_STEALLR,
      label: 'Spot',
      icon: <CandlestickChart className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRADING_DYDX_FUTURES,
      label: 'Perps',
      icon: <InfinityIcon className="w-5 h-5" />,
      queryParam: '?view=trade',
    },
  ];

  const handleNavClick = (item: NavItem) => {
    setIsOpen(false);
    if (item.queryParam) {
      navigate(`${item.href}${item.queryParam}`);
    }
  };

  return (
    <>
      <button
        id="hamburger-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-3 left-4 z-50 btn-secondary p-2.5 rounded-lg"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        id="sidebar"
        className={`
          fixed left-0 top-0 h-screen z-40 
          bg-secondary 
          transition-all duration-200 w-20
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="h-16 px-2 flex items-center justify-center">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold">
            <img src="/logo.avif" alt="swiftEx-logo" className="w-full h-full object-contain" />
          </div>

          {/* Mobile Close Button */}
          <button onClick={() => setIsOpen(false)} className="lg:hidden btn-ghost p-1.5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto scrollbar-thin">
          <div className="space-y-1">
            {navItems.map(item => {
              const isActive = activeItem === item.href;

              return item.queryParam ? (
                <button
                  key={item.href}
                  onClick={() => handleNavClick(item)}
                  className={`
                    w-full flex flex-col items-center justify-center gap-1 px-1 py-3 rounded-md
                    transition-colors duration-150
                    ${isActive ? 'text-white' : 'text-primary hover:bg-tertiary'}
                  `}
                  style={{
                    backgroundColor: isActive ? 'var(--color-brand-primary)' : 'transparent',
                  }}
                  title={item.label}
                >
                  <span className="flex-shrink-0 mb-1">{item.icon}</span>
                  <span className="text-[10px] leading-tight font-medium text-center">
                    {item.label}
                  </span>
                </button>
              ) : (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => handleNavClick(item)}
                  className={`
                    flex flex-col items-center justify-center gap-1 px-1 py-3 rounded-lg
                    transition-colors duration-150 w-full
                    ${isActive ? 'text-white' : 'text-primary hover:bg-tertiary'}
                  `}
                  style={{
                    backgroundColor: isActive ? 'var(--color-brand-primary)' : 'transparent',
                  }}
                  title={item.label}
                >
                  <span className="shrink-0 mb-1">{item.icon}</span>
                  <span className="text-[10px] leading-tight font-medium text-center">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>
      <div className={`hidden lg:block flex-shrink-0 transition-all duration-200 w-20`} />
    </>
  );
};

export default Sidebar;
