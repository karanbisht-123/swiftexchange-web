import { Rocket, ShieldAlert } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { ExchangeLayout } from '../../modules/perps/components/layout';
import { useDynamicExchange } from '../../modules/perps/hooks/useDynamicExchange';

const PerpetualsTradingPage: React.FC = () => {
  useDynamicExchange();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [tampered, setTampered] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.removedNodes.forEach(node => {
          if (node === overlayRef.current) {
            setTampered(true);
          }
        });
      });
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, []);

  if (tampered) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#0a0a0a] text-center">
        <ShieldAlert className="mb-6 h-20 w-20 text-red-500 animate-bounce" />
        <h1 className="mb-2 text-3xl font-bold text-white">Nice try! 😉</h1>
        <p className="text-gray-400 text-lg mb-6">
          You removed the overlay, but this feature is still not ready for use.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0a0a0a]">
      <div className="pointer-events-none flex-1 select-none opacity-90 blur-[1px] transition-all duration-1000">
        <ExchangeLayout />
      </div>

      <div
        ref={overlayRef}
        className="absolute inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-sm"
        onContextMenu={e => e.preventDefault()}
      >
        <div className="relative flex max-w-lg flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/60 p-12 text-center shadow-[0_0_80px_-20px_rgba(59,130,246,0.3)] backdrop-blur-2xl">
          <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-indigo-500/10 blur-[80px]" />
          <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-blue-500/10 blur-[80px]" />

          <div className="relative mb-8">
            <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-gradient-to-b from-white/5 to-transparent shadow-[0_0_30px_rgba(59,130,246,0.2)]">
              <Rocket className="h-10 w-10 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
            </div>
          </div>

          <h2 className="mb-4 bg-gradient-to-br from-white via-blue-100 to-blue-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent drop-shadow-sm">
            Perpetuals Are Coming
          </h2>

          <p className="text-md leading-relaxed text-gray-300">
            We are partnering with industry-leading decentralized exchanges to bring you a seamless,
            deep-liquidity perpetuals trading experience right in your wallet.
          </p>

          <div className="mt-8 flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-blue-200 shadow-inner">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500"></span>
            </span>
            Integration in progress
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerpetualsTradingPage;
