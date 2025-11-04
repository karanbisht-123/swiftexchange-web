import React, { useEffect, useState } from 'react';

import { type NetworkType } from '../config/chains';
import { WalletType } from '../constants/Wallet';
import { walletService } from '../services/walletService';
import { useWalletStore } from '../store/walletConnectStore';

const NetworkSwitch: React.FC = () => {
  const [network, setNetwork] = useState<NetworkType>(walletService.getNetwork());
  const connectedWallets = useWalletStore(state => state.connectedWallets);

  useEffect(() => {
    const currentNetwork = walletService.getNetwork();
    setNetwork(currentNetwork);
  }, []);

  const handleNetworkChange = async (newNetwork: NetworkType) => {
    try {
      const disconnectPromises = Object.keys(connectedWallets).map(type =>
        walletService.disconnect(type as WalletType)
      );
      await Promise.all(disconnectPromises);

      await walletService.setNetwork(newNetwork);
      setNetwork(newNetwork);
    } catch (error) {
      console.error('[NetworkSwitch] Error switching network:', error);
      alert('Failed to switch network. Please try again.');
    }
  };

  return (
    <div className="card ">
      <select
        id="network-select"
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
