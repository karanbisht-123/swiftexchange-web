import { useNavigate } from 'react-router-dom';
import PageLayout from '../../../../components/layout/PageLayout';
import { StellarDydxOrchestrator } from './dydx-bridge/StellarDydxOrchestrator';

const BridgePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageLayout
      title="Bridge to dYdX"
      subtitle="Fund your dYdX account with Stellar assets"
      maxWidth="lg"
      onBack={() => navigate(-1)}
    >
      <StellarDydxOrchestrator />
    </PageLayout>
  );
};

export default BridgePage;
