import { AlertCircle, HelpCircle, Info, Lock, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface XlmReserveInfoProps {
  xlmBalance: string;
  trustlineCount: number;
  isOpen: boolean;
  onClose: () => void;
}

const BASE_RESERVE = 1;
const SUBENTRY_RESERVE = 0.5;

export const calculateReserve = (trustlineCount: number): number => {
  return BASE_RESERVE + trustlineCount * SUBENTRY_RESERVE;
};

export const calculateAvailableBalance = (balance: number, trustlineCount: number): number => {
  const reserve = calculateReserve(trustlineCount);
  return Math.max(0, balance - reserve);
};

export const XlmReserveInfoModal = ({
  xlmBalance,
  trustlineCount,
  isOpen,
  onClose,
}: XlmReserveInfoProps) => {
  const balance = parseFloat(xlmBalance) || 0;
  const reserveRequired = calculateReserve(trustlineCount);
  const availableBalance = calculateAvailableBalance(balance, trustlineCount);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[400px] bg-secondary rounded-xl shadow-2xl z-50 animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-color">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-primary">XLM Reserve Info</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-hover transition-colors">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-primary rounded-lg">
            <Lock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-primary">Base Reserve</span>
                <span className="text-sm text-amber-500 font-medium">{BASE_RESERVE} XLM</span>
              </div>
              <p className="text-xs text-muted mt-1">
                Required to keep your Stellar account active on the network
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-primary rounded-lg">
            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-primary">Subentry Reserve</span>
                <span className="text-sm text-blue-500 font-medium">
                  {SUBENTRY_RESERVE} XLM each
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                Additional reserve for each trustline, open offer, signer, or data entry
              </p>
            </div>
          </div>

          <div className="border-t border-color" />

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted uppercase tracking-wide">
              Your Account
            </h4>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-secondary">Total Balance</span>
                <span className="text-sm font-medium text-primary">{balance.toFixed(7)} XLM</span>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-secondary">Reserved</span>
                  <span className="text-xs text-muted">({trustlineCount} subentries)</span>
                </div>
                <span className="text-sm font-medium text-amber-500">
                  {reserveRequired.toFixed(1)} XLM
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-color">
                <span className="text-sm font-semibold text-primary">Available to Spend</span>
                <span className="text-sm font-bold text-green-500">
                  {availableBalance.toFixed(7)} XLM
                </span>
              </div>
            </div>
          </div>

          {availableBalance < 1 && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-500">
                Your available balance is low. Keep enough XLM for transaction fees (typically
                0.00001 XLM per operation).
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-color">
          <a
            href="https://developers.stellar.org/docs/learn/fundamentals/lumens#minimum-balance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            Learn more about Stellar reserves
            <span>→</span>
          </a>
        </div>
      </div>
    </>
  );
};

interface XlmReserveButtonProps {
  xlmBalance: string;
  trustlineCount: number;
}

export const XlmReserveButton = ({ xlmBalance, trustlineCount }: XlmReserveButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const reserveRequired = calculateReserve(trustlineCount);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition-colors"
      >
        <HelpCircle className="w-3 h-3" />
        <span>Reserve: {reserveRequired.toFixed(1)} XLM</span>
      </button>

      <XlmReserveInfoModal
        xlmBalance={xlmBalance}
        trustlineCount={trustlineCount}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export const useTrustlineCount = (availableTokens: any[]): number => {
  const [trustlineCount, setTrustlineCount] = useState(0);

  useEffect(() => {
    const count = availableTokens.filter(token => token.code !== 'XLM').length;
    setTrustlineCount(count);
  }, [availableTokens]);

  return trustlineCount;
};

export default XlmReserveInfoModal;
