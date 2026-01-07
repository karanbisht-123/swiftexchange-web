import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutDashboard,
  LineChart,
  Menu,
  Send,
  Settings,
  TrendingUp,
  User,
  Wallet,
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
      icon: <Send className="w-5 h-5" />,
    },
    {
      href: ROUTES.RECEIVE,
      label: 'Receive',
      icon: <Download className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRADING_EVM_SWAP,
      label: 'Swap',
      icon: <ArrowLeftRight className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRADING_EVM_FIAT,
      label: 'Fiat On/Off Ramp',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      href: ROUTES.MARKETS,
      label: 'Markets',
      icon: <LineChart className="w-5 h-5" />,
      queryParam: '?view=markets',
    },
    {
      href: ROUTES.MY_ASSETS,
      label: 'My Assets',
      icon: <Wallet className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRANSACTIONS,
      label: 'Transactions',
      icon: <LineChart className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRADING_STEALLR,
      label: 'Trading',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      href: ROUTES.TRADING_DYDX_FUTURES,
      label: 'Futures',
      icon: <TrendingUp className="w-5 h-5" />,
      queryParam: '?view=trade',
    },
    {
      href: ROUTES.PROFILE,
      label: 'Profile',
      icon: <User className="w-5 h-5" />,
    },
    {
      href: ROUTES.SETTINGS,
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
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
      {/* Mobile Hamburger Button */}
      <button
        id="hamburger-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-3 left-4 z-50 btn-secondary p-2.5 rounded-lg"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
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
        {/* Logo Header */}
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

        {/* Navigation Items */}
        <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin">
          <div className="space-y-1">
            {navItems.map(item => {
              const isActive = activeItem === item.href;

              return item.queryParam ? (
                <button
                  key={item.href}
                  onClick={() => handleNavClick(item)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
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

      {/* Spacer for Desktop Layout */}
      <div
        className={`hidden lg:block flex-shrink-0 transition-all duration-200 ${
          isCompressed ? 'w-16' : 'w-64'
        }`}
      />
    </>
  );
};

export default Sidebar;
