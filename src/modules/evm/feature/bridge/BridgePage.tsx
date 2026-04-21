import { useNavigate } from 'react-router-dom';
import PageLayout from '../../../../components/layout/PageLayout';
import Bridge from './Bridge';

const BridgePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageLayout
      title="Cross-Chain Bridge"
      maxWidth="lg"
      onBack={() => navigate(-1)}
    >
      <Bridge />
    </PageLayout>
  );
};

export default BridgePage;
