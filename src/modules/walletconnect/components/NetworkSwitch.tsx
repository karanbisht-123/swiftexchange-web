import { type NetworkType } from '../config/chains';
import { useWalletStore } from '../store/walletConnectStore';

const NetworkSwitch: React.FC = () => {
  const network = useWalletStore(state => state.network);
  const setNetwork = useWalletStore(state => state.setNetwork);

  // console.log('[NetworkSwitch] Current network:', network);

  const handleNetworkChange = async (newNetwork: NetworkType) => {
    if (newNetwork === network) return;
    try {
      await setNetwork(newNetwork);
    } catch (error) {
      console.error('[NetworkSwitch] Error switching network:', error);
      alert('Failed to switch network. Please try again.');
    }
  };

  return (
    <div>
      <select
        value={network}
        onChange={e => handleNetworkChange(e.target.value as NetworkType)}
        className="bg-transparent text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) cursor-pointer outline-none appearance-none pr-2"
      >
        <option value="mainnet" className="bg-(--color-bg-primary) text-(--color-text-primary)">Mainnet</option>
        <option value="testnet" className="bg-(--color-bg-primary) text-(--color-text-primary)">Testnet</option>
      </select>
    </div>
  );
};

export default NetworkSwitch;
