import { Loader2 } from 'lucide-react';

const WalletStepConnect: React.FC = () => {
  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-2xl shadow-lg p-6 w-[320px] text-center border border-[var(--color-border)]">
      <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--color-brand-primary)]" />
      <p className="mt-4 text-[var(--color-text-primary)] font-medium">Connecting your wallet...</p>
    </div>
  );
};

export default WalletStepConnect;
