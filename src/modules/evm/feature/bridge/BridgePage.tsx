import { useNavigate } from 'react-router-dom';
import PageLayout from '../../../../components/layout/PageLayout';
import { StellarDydxOrchestrator } from './dydx-bridge/StellarDydxOrchestrator';

const BridgePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageLayout
      title="Cross-Chain Bridge"
      maxWidth="lg"
      onBack={() => navigate(-1)}
    >
      <StellarDydxOrchestrator />
    </PageLayout>
  );
};

export default BridgePage;
