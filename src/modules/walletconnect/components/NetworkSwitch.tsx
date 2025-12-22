import React from 'react';

import { type NetworkType } from '../config/chains';
import { useWalletStore } from '../store/walletConnectStore';

const NetworkSwitch: React.FC = () => {
  const network = useWalletStore(state => state.network);
  const setNetwork = useWalletStore(state => state.setNetwork);

  console.log('[NetworkSwitch] Current network:', network);

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
        className="input input-lg w-full appearance-none py-2"
      >
        <option value="mainnet">Mainnet</option>
        <option value="testnet">Testnet</option>
      </select>
    </div>
  );
};

export default NetworkSwitch;
