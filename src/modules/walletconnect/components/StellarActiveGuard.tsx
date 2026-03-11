import React, { type ReactNode } from 'react';

import ActivateTrustStep from '../../evm/feature/one-tap-pay/ActivateTrustStep';
import { useWalletStore } from '../store/walletConnectStore';

interface StellarActiveGuardProps {
    children: ReactNode;
    onSkip?: () => void;
}

const StellarActiveGuard: React.FC<StellarActiveGuardProps> = ({ children, onSkip }) => {
    const stellarWallet = useWalletStore(state => state.connectedWallets.stellar);

    const isStellarActive = stellarWallet?.address;

    const handleComplete = () => { };

    const handleSkip = () => {
        onSkip?.();
    };

    if (!isStellarActive) {
        return <ActivateTrustStep onComplete={handleComplete} onSkip={handleSkip} />;
    }

    return <>{children}</>;
};

export default StellarActiveGuard;
