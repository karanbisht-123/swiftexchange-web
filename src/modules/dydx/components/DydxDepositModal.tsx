import { X, Copy, } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

interface DydxDepositModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DydxDepositModal: React.FC<DydxDepositModalProps> = ({
    isOpen,
    onClose,
}) => {
    const evmWallet = useWalletStore(state => state.connectedWallets.evm);
    const evmAddress = evmWallet?.address || '0x0000000000000000000000000000000000000000';

    const [isCopied, setIsCopied] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState('');

    useEffect(() => {
        if (isOpen) {
            QRCode.toDataURL(evmAddress, {
                width: 200,
                margin: 2,
                color: {
                    dark: '#ffffff',
                    light: '#00000000'
                }
            })
                .then(url => setQrCodeUrl(url))
                .catch(err => console.error(err));
        }
    }, [isOpen, evmAddress]);

    const handleCopy = () => {
        if (!evmAddress) return;
        navigator.clipboard.writeText(evmAddress);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-secondary rounded-2xl border border-color w-full max-w-[400px] shadow-2xl overflow-hidden font-sans">
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-3">
                    <h3 className="text-xl font-medium text-primary flex items-center gap-2">
                        Deposit Funds
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-5 pb-6 pt-2 flex flex-col items-center text-center space-y-6">
                    <div className="p-4 bg-tertiary border border-color rounded-xl w-full flex flex-col items-center">
                        <p className="text-sm font-medium text-warning mb-4 break-words">
                            The Deposit feature is coming very soon. For now, you can use an already funded account.
                        </p>

                        <div className="bg-brand/10 p-2 rounded-xl mb-4">
                            {qrCodeUrl ? (
                                <img src={qrCodeUrl} alt="Deposit QR Code" className="w-40 h-40 opacity-90 mix-blend-screen" />
                            ) : (
                                <div className="w-40 h-40 flex items-center justify-center">
                                    <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>

                        <p className="text-xs text-muted mb-2 uppercase tracking-wide font-semibold">
                            Your EVM Address
                        </p>

                        <div className="flex items-center gap-2 bg-secondary border border-color px-3 py-2 rounded-lg w-full">
                            <span className="text-sm text-primary font-mono truncate flex-1 text-left">
                                {evmAddress}
                            </span>
                            <button
                                onClick={handleCopy}
                                className="p-1.5 text-muted hover:text-primary transition-colors bg-tertiary rounded shrink-0"
                                title="Copy Address"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                        {isCopied && <span className="text-[10px] text-success font-medium mt-1">Address Copied!</span>}
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full py-3 btn btn-primary rounded-xl font-medium text-[15px] transition-all bg-brand text-white hover:opacity-90 flex items-center justify-center gap-2"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
