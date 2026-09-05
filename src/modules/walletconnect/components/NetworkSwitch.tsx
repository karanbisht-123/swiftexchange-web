import React, { useEffect } from 'react';

import { IS_TESTNET_ENABLED, type NetworkType } from '../config/chains';
import { useWalletStore } from '../store/walletConnectStore';

const NetworkSwitch: React.FC = () => {
  const network = useWalletStore(state => state.network);
  const setNetwork = useWalletStore(state => state.setNetwork);

  useEffect(() => {
    if (!IS_TESTNET_ENABLED) {
      if (network !== 'mainnet') {
        setNetwork('mainnet');
      }
      localStorage.setItem('network', 'mainnet');
      return;
    }

    const storedNetwork = localStorage.getItem('network');
    if (!storedNetwork) {
      localStorage.setItem('network', network);
    }
  }, [network, setNetwork]);

  const handleNetworkChange = async (newNetwork: NetworkType) => {
    if (newNetwork === network) return;
    try {
      await setNetwork(newNetwork);
    } catch (error) {
      console.error('[NetworkSwitch] Error switching network:', error);
      alert('Failed to switch network. Please try again.');
    }
  };

  if (!IS_TESTNET_ENABLED) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-(--color-bg-secondary)/60 border border-(--color-border-subtle) text-xs font-medium text-(--color-text-secondary) select-none">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
        <span>Mainnet</span>
      </div>
    );
  }

  return (
    <div>
      <select
        value={network}
        onChange={e => handleNetworkChange(e.target.value as NetworkType)}
        className="bg-transparent text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) cursor-pointer outline-none appearance-none pr-2"
      >
        <option value="mainnet" className="bg-(--color-bg-primary) text-(--color-text-primary)">
          Mainnet
        </option>
        <option value="testnet" className="bg-(--color-bg-primary) text-(--color-text-primary)">
          Testnet
        </option>
      </select>
    </div>
  );
};

export default NetworkSwitch;
