import { useRouteError } from 'react-router-dom';

import { ErrorScreen } from '../components/ErrorBoundary';

export const RouteErrorBoundary = () => {
  const error = useRouteError();
  const handleReload = () => window.location.reload();
  return <ErrorScreen error={error} onReload={handleReload} />;
};
