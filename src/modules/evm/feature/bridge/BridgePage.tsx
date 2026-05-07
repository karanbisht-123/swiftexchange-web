import { useNavigate } from 'react-router-dom';
import PageLayout from '../../../../components/layout/PageLayout';
// import Bridge from './Bridge';
import { StellarDydxOrchestrator } from './dydx-bridge/StellarDydxOrchestrator';

const BridgePage: React.FC = () => {
  const navigate = useNavigate();
  // const [mode, setMode] = useState<'standard' | 'dydx'>('standard');

  return (
    <PageLayout
      title="Cross-Chain Bridge"
      maxWidth="lg"
      onBack={() => navigate(-1)}
    >
      {/* <div className="flex justify-center mb-6">
        <div className="bg-secondary p-1 rounded-2xl flex items-center border border-color">
          <button 
            onClick={() => setMode('standard')} 
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${mode === 'standard' ? 'bg-brand text-white shadow-lg' : 'text-muted hover:text-primary'}`}
          >
            Standard Bridge
          </button>
          <button 
            onClick={() => setMode('dydx')} 
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${mode === 'dydx' ? 'bg-brand text-white shadow-lg' : 'text-muted hover:text-primary'}`}
          >
            Direct to dYdX
          </button>
        </div>
      </div> */}

      <StellarDydxOrchestrator />
    </PageLayout>
  );
};

export default BridgePage;
