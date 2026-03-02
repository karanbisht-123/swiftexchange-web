import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LayoutDashboard,
  SendHorizontal,
  QrCode,
  Repeat2,
  Landmark,
  BarChart2,
  History,
  CandlestickChart,
  Infinity,
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
  const [isCompressed, setIsCompressed] = useState(false);
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
      label: 'Spot Trade',
      icon: <CandlestickChart className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRADING_DYDX_FUTURES,
      label: 'Perpetual Trade',
      icon: <Infinity className="w-5 h-5" />,
      queryParam: '?view=trade',
    },
  ];

  const handleNavClick = (item: NavItem) => {
    setIsOpen(false);
    if (item.queryParam) {
      navigate(`${item.href}${item.queryParam}`);
    }
  };

  const toggleSidebarCompression = () => {
    setIsCompressed(!isCompressed);
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
          bg-secondary border-r border-color
          transition-all duration-200
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isCompressed ? 'w-16' : 'w-64'}
        `}
      >
        <div className="h-16 px-4 border-b border-color flex items-center justify-between">
          {!isCompressed ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold">
                <img src="/logo.avif" alt="swiftEx-logo" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">SwiftEx</h1>
                <p className="text-xs text-muted">Trading Platform</p>
              </div>
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold">
              <img src="/logo.avif" alt="swiftEx-logo" />
            </div>
          )}

          {/* Desktop Toggle Button */}
          <button
            onClick={toggleSidebarCompression}
            className="hidden lg:block btn-ghost p-1.5 rounded"
          >
            {isCompressed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

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
                    w-full flex items-center gap-4 px-3 py-3 rounded-md
                    transition-colors duration-150
                    ${isActive ? 'text-white' : 'text-primary hover:bg-tertiary'}
                    ${isCompressed ? 'justify-center' : ''}
                  `}
                  style={{
                    backgroundColor: isActive ? 'var(--color-brand-primary)' : 'transparent',
                  }}
                  title={isCompressed ? item.label : undefined}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!isCompressed && <span className="text-sm font-medium">{item.label}</span>}
                </button>
              ) : (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => handleNavClick(item)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg
                    transition-colors duration-150
                    ${isActive ? 'text-white' : 'text-primary hover:bg-tertiary'}
                    ${isCompressed ? 'justify-center' : ''}
                  `}
                  style={{
                    backgroundColor: isActive ? 'var(--color-brand-primary)' : 'transparent',
                  }}
                  title={isCompressed ? item.label : undefined}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!isCompressed && <span className="text-sm font-medium">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>
      <div
        className={`hidden lg:block flex-shrink-0 transition-all duration-200 ${isCompressed ? 'w-16' : 'w-64'
          }`}
      />
    </>
  );
};

export default Sidebar;