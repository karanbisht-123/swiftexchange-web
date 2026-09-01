import {
  Infinity as InfinityIcon,
  BarChart2,
  CandlestickChart,
  History,
  Landmark,
  LayoutDashboard,
  QrCode,
  Repeat2,
  SendHorizontal,
  User,
  X,
} from 'lucide-react';
import type { FC, JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../constants/routes';
import { RESTRICTED_TRADING_LOCATIONS } from '../../modules/commonfeature/constants/compliance';
import { useGeolocationGuard } from '../../modules/commonfeature/hook/useGeolocationGuard';

interface NavItem {
  href: string;
  label: string;
  icon: JSX.Element;
  queryParam?: string;
  isRestricted?: boolean;
  badge?: string;
  badgeColor?: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const Sidebar: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const activeItem = location.pathname;

  const { isRestricted: isDydxRestricted } = useGeolocationGuard(RESTRICTED_TRADING_LOCATIONS);

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
    const handleToggle = () => setIsOpen(v => !v);
    window.addEventListener('sidebar:toggle', handleToggle);
    return () => window.removeEventListener('sidebar:toggle', handleToggle);
  }, []);

  const navSections: NavSection[] = [
    {
      items: [
        {
          href: ROUTES.DASHBOARD,
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-[17px] h-[17px]" />,
        },
        {
          href: ROUTES.SEND,
          label: 'Send',
          icon: <SendHorizontal className="w-[17px] h-[17px]" />,
        },
        {
          href: ROUTES.RECEIVE,
          label: 'Receive',
          icon: <QrCode className="w-[17px] h-[17px]" />,
        },
      ],
    },
    {
      items: [
        {
          href: ROUTES.TRADING_EVM_SWAP,
          label: 'Swap',
          icon: <Repeat2 className="w-[17px] h-[17px]" />,
        },
        {
          href: ROUTES.TRADING_STELLAR,
          label: 'Spot',
          icon: <CandlestickChart className="w-[17px] h-[17px]" />,
        },
        {
          href: ROUTES.TRADING_PERPS,
          label: 'Perps',
          icon: <InfinityIcon className="w-[17px] h-[17px]" />,
          isRestricted: isDydxRestricted,
          badge: '20x',
          badgeColor: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
        },
      ],
    },
    {
      items: [
        {
          href: ROUTES.MARKETS,
          label: 'Markets',
          icon: <BarChart2 className="w-[17px] h-[17px]" />,
          queryParam: '?view=markets',
        },
        {
          href: ROUTES.TRANSACTIONS,
          label: 'History',
          icon: <History className="w-[17px] h-[17px]" />,
        },
        {
          href: ROUTES.TRADING_EVM_FIAT,
          label: 'Fiat',
          icon: <Landmark className="w-[17px] h-[17px]" />,
        },
        {
          href: ROUTES.PORTFOLIO,
          label: 'Portfolio',
          icon: <User className="w-[17px] h-[17px]" />,
        },
      ],
    },
  ];

  const handleNavClick = (item: NavItem) => {
    if (item.isRestricted) return;
    setIsOpen(false);
    if (item.queryParam) {
      navigate(`${item.href}${item.queryParam}`);
    }
  };

  const renderItem = (item: NavItem) => {
    const isActive =
      activeItem === item.href ||
      (item.href !== ROUTES.HOME && activeItem.startsWith(`${item.href}/`));

    if (isActive) {
      const activeContent = (
        <div className="relative inline-flex p-[1.5px] rounded-lg overflow-hidden w-full shadow-[0_0_16px_rgba(6,182,212,0.35)] hover:shadow-[0_0_22px_rgba(59,130,246,0.5)] transition-all duration-300 group cursor-pointer">
          {/* Distinctive Cyber Neon Rotating Gradient Beam (Cyan -> Blue -> Violet) */}
          <div className="absolute -inset-[200%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg_at_50%_50%,transparent_0%,#06b6d4_20%,#3b82f6_45%,#a855f7_70%,transparent_85%)] will-change-transform opacity-100" />

          {/* Frosted Dark Core */}
          <div
            style={{ background: 'var(--color-bg-secondary)' }}
            className="relative w-full flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-[6.5px] bg-gradient-to-b from-[var(--color-bg-secondary)] to-[var(--color-bg-tertiary)]/90 backdrop-blur-sm select-none"
          >
            {item.badge && !item.isRestricted && (
              <span className="absolute top-1 right-1 text-[8px] font-mono font-bold px-1 py-0.5 rounded-full leading-none scale-90 bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-xs">
                {item.badge}
              </span>
            )}
            <span className="shrink-0 scale-110 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.7)] transition-transform">
              {item.icon}
            </span>
            <span className="text-[9.5px] leading-tight font-semibold text-center tracking-tight truncate max-w-full text-[var(--color-text-primary)]">
              {item.label}
            </span>
          </div>
        </div>
      );

      return item.queryParam ? (
        <button
          key={item.href}
          onClick={() => handleNavClick(item)}
          className="w-full block"
          title={item.isRestricted ? `${item.label} (Restricted in your region)` : item.label}
        >
          {activeContent}
        </button>
      ) : (
        <Link
          key={item.href}
          to={item.href}
          onClick={() => handleNavClick(item)}
          className="w-full block"
          title={item.isRestricted ? `${item.label} (Restricted in your region)` : item.label}
        >
          {activeContent}
        </Link>
      );
    }

    const itemClasses = `
      relative w-full flex flex-col items-center justify-center gap-1 py-2 px-1
      rounded-lg transition-all duration-200 group select-none text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/70
      ${item.isRestricted ? 'opacity-40 cursor-not-allowed grayscale pointer-events-none' : 'cursor-pointer'}
    `;

    const content = (
      <>
        {/* Restricted overlay icon */}
        {item.isRestricted && <X className="w-3.5 h-3.5 absolute top-1 right-1 text-rose-400" />}

        {/* Micro badge (e.g. 20x for Perps) */}
        {item.badge && !item.isRestricted && (
          <span
            className={`absolute top-1 right-1 text-[8px] font-mono font-bold px-1 py-0.5 rounded-full leading-none scale-90 ${
              item.badgeColor || 'bg-brand-primary/20 text-brand-primary'
            }`}
          >
            {item.badge}
          </span>
        )}

        <span className="shrink-0 transition-transform duration-200 group-hover:scale-105">
          {item.icon}
        </span>

        <span className="text-[9.5px] leading-tight font-medium text-center tracking-tight truncate max-w-full">
          {item.label}
        </span>
      </>
    );

    if (item.queryParam) {
      return (
        <button
          key={item.href}
          onClick={() => handleNavClick(item)}
          className={itemClasses}
          title={item.isRestricted ? `${item.label} (Restricted in your region)` : item.label}
        >
          {content}
        </button>
      );
    }

    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => handleNavClick(item)}
        className={itemClasses}
        title={item.isRestricted ? `${item.label} (Restricted in your region)` : item.label}
      >
        {content}
      </Link>
    );
  };

  return (
    <>
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-xs z-[99998] transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        id="sidebar"
        className={`
          fixed left-0 top-0 bottom-0 z-[99999] 
          bg-[var(--color-bg-primary)]
          transition-all duration-200 w-16
          flex flex-col border-r border-[var(--color-border)]/50 select-none
          ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Exchange Logo Branding */}
        <div className="h-14 shrink-0 flex flex-col items-center justify-center border-b border-[var(--color-border)]/40 relative">
          <Link
            to={ROUTES.DASHBOARD}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-transform hover:scale-105"
            title="SwiftEx Exchange"
          >
            <img src="/logo.png" alt="SwiftEx" className="w-full h-full object-contain" />
          </Link>
        </div>

        {/* Navigation list with clean exchange groupings */}
        <nav className="flex-1 px-1.5 py-2 space-y-1.5 overflow-y-auto hide-scrollbar">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-0.5">
              {idx > 0 && <div className="my-1.5 mx-1 border-t border-[var(--color-border)]/30" />}
              {section.items.map(renderItem)}
            </div>
          ))}
        </nav>
      </aside>

      {/* Desktop spacer */}
      <div className="hidden lg:block shrink-0 w-16" />
    </>
  );
};

export default Sidebar;
