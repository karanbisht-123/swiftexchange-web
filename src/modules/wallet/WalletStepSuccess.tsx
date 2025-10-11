import { Check } from 'lucide-react';

const WalletStepSuccess: React.FC = () => {
  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-2xl shadow-lg p-6 w-[320px] text-center border border-[var(--color-border)]">
      <Check className="w-8 h-8 mx-auto text-[var(--color-success)]" />
      <p className="mt-4 text-[var(--color-text-success)] font-medium">Wallet Connected!</p>
    </div>
  );
};

export default WalletStepSuccess;
