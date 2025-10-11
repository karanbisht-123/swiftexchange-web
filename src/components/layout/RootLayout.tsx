import { Outlet } from 'react-router-dom';

const RootLayout = () => {
  return (
    <div className="flex min-h-screen bg-primary">
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default RootLayout;
