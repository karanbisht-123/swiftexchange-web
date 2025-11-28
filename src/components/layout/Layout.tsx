import { type FC, type ReactNode } from 'react';

import Sidebar from './Sidebar';
import Topbar from './Topbar';

interface LayoutProps {
  children: ReactNode;
  withSidebar?: boolean;
}

const Layout: FC<LayoutProps> = ({ children, withSidebar = true }) => {
  return (
    <div className="flex min-h-screen bg-primary">
      {withSidebar && <Sidebar />}
      <div className={`flex-1 flex flex-col transition-all duration-300`}>
        <Topbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
