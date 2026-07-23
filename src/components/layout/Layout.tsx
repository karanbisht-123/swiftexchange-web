import { type FC, type ReactNode } from 'react';

import Sidebar from './Sidebar';
import Topbar from './Topbar';

interface LayoutProps {
  children: ReactNode;
  withSidebar?: boolean;
}

const Layout: FC<LayoutProps> = ({ children, withSidebar = true }) => {
  return (
    <div className="flex min-h-screen max-w-full overflow-x-hidden bg-primary">
      {withSidebar && <Sidebar />}
      <div className="flex-1 min-w-0 max-w-full flex flex-col transition-all duration-300 overflow-x-hidden">
        <Topbar />
        <main className="flex-1 min-w-0 max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
