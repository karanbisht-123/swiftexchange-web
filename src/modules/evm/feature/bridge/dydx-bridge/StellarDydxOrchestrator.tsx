import React, { useState, useMemo, useRef } from 'react';
import {
  ArrowUpDown,
  Clock,
  Layers,
  ChevronDown,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Info,
  RefreshCw,
  Wallet,
  ExternalLink,
  ArrowLeft,
  Lock,
  ArrowUpRight
} from 'lucide-react';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { FeePaymentMethod } from '@allbridge/bridge-core-sdk';
import { getChainById, getEvmChainsForNetwork, getExplorerUrl } from '../../../utils/Chainregistry';
import * as ChainUrlHelpers from '../../../utils/ChainUrlHelpers';
import TransactionButton from '../../../../commonfeature/components/TransactionButton';
import { portfolioUtils } from '../../../../walletconnect/utils/portfolioUtils';
import { ActionGuard } from '../../../../commonfeature/components/ActionGuard';
import { useAssetSelectorModal } from '../../../../commonfeature/components/useAssetSelectorModal';
import {
  useStellarDydxOrchestrator,
  type StellarToken
} from './useStellarDydxOrchestrator';
import { ConfirmationModal } from '../../../../../components/common/ConfirmationModal';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STELLAR_CHAIN_ID = 'pubnet';
const DEFAULT_SLIPPAGE = 1.0;
const USDC_LOGO_URL =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png';
const DYDX_LOGO_URL =
  'https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png';

// ---------------------------------------------------------------------------
// Shimmer
// ---------------------------------------------------------------------------
const Shimmer: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />
);

export const StellarDydxOrchestrator: React.FC = () => {
  const { connectedWallets, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network) as 'mainnet' | 'testnet';

  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarAddress = stellarWallet?.address;
  const evmAddress = evmWallet?.address;

  const { openAssetSelector } = useAssetSelectorModal();
  const inputRef = useRef<HTMLInputElement>(null);

  // Consume hook
  const {
    inputAmount,
    setInputAmount,
    inputToken,
    setInputToken,
    destinationChain,
    setDestinationChain,
    feePaymentMethod,
    setFeePaymentMethod,
    stellarAssets,
    loadingAssets,
    nativeBalance,
    isUsdc,
    isQuoting,
    swapQuote,
    bridgeQuote,
    depositQuote,
    rawQuotes,
    setupError,
    clearSetupForm,

    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    dismissSession,
    executeSessionStep,
    updateSession,
  } = useStellarDydxOrchestrator();

  const [showNetworkSelector, setShowNetworkSelector] = useState(false);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [sessionToClear, setSessionToClear] = useState<string | null>(null);
  const [restoreInputsOnClear, setRestoreInputsOnClear] = useState(false);

  const evmChains = useMemo(() => getEvmChainsForNetwork(currentNetwork), [currentNetwork]);
  const isBothConnected = !!evmAddress && !!stellarAddress;

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const hasPendingSession = useMemo(() => {
    return sessions.some(s => s.loadingStep);
  }, [sessions]);



  const tokenBalance = useMemo(() => {
    if (!inputToken) return '0';
    return inputToken.balance || '0';
  }, [inputToken]);

  const handleMaxAmount = () => {
    if (tokenBalance && parseFloat(tokenBalance) > 0) {
      setInputAmount(sanitizeAmount(tokenBalance));
    }
  };

  const sanitizeAmount = (val: any, decimals: number = 7): string => {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val);
    const parts = str.split('.');
    if (parts.length <= 1) return str;
    return `${parts[0]}.${parts[1].slice(0, decimals)}`;
  };

  // ---------------------------------------------------------------------------
  // Display States
  // ---------------------------------------------------------------------------
  const displayState = useMemo(() => {
    const stellarConfig = getStellarConfig(currentNetwork);

    // If viewing active roadmap details
    if (activeSession) {
      const activeChain = evmChains.find(c => c.chainId === activeSession.destinationChainId);
      const isSessionUsdc = activeSession.inputTokenSymbol === 'USDC';

      if (activeSession.phase === 'SWAP') {
        return {
          top: {
            symbol: activeSession.inputTokenSymbol,
            network: 'STELLAR',
            amount: activeSession.inputAmount,
            logo: stellarAssets.find(a => a.symbol === activeSession.inputTokenSymbol)?.logoURI || ChainUrlHelpers.getTokenIcon(activeSession.inputTokenSymbol, stellarConfig),
            balance: activeSession.inputAmount,
          },
          bottom: {
            symbol: 'USDC',
            network: 'STELLAR',
            amount: activeSession.expectedSwapOutput || '0.00',
            logo: USDC_LOGO_URL,
          },
          title: 'Prepare USDC on Stellar',
        };
      }

      if (activeSession.phase === 'BRIDGE') {
        const bridgeAmt = isSessionUsdc ? activeSession.inputAmount : activeSession.intermediateAmount || activeSession.expectedSwapOutput || '0.00';
        const isPending = activeSession.bridgeTx.status !== 'SUCCESS';
        return {
          top: {
            symbol: 'USDC',
            network: 'STELLAR',
            amount: bridgeAmt,
            logo: USDC_LOGO_URL,
            balance: bridgeAmt,
          },
          bottom: {
            symbol: 'USDC',
            network: activeChain?.name?.toUpperCase() || 'EVM',
            amount: activeSession.expectedBridgeOutput || bridgeAmt,
            logo: USDC_LOGO_URL,
            isPending,
          },
          title: isPending ? 'Funds Crossing Bridge...' : `Bridge to ${activeChain?.name || 'EVM'}`,
        };
      }

      if (activeSession.phase === 'DEPOSIT' || activeSession.phase === 'DONE') {
        const depositAmt = activeSession.expectedBridgeOutput || activeSession.intermediateAmount || '0.00';
        return {
          top: {
            symbol: 'USDC',
            network: activeChain?.name?.toUpperCase() || 'EVM',
            amount: depositAmt,
            logo: USDC_LOGO_URL,
            balance: depositAmt,
          },
          bottom: {
            symbol: 'USDC',
            network: 'DYDX',
            amount: depositAmt,
            logo: USDC_LOGO_URL,
          },
          title: activeSession.phase === 'DONE' ? 'Transfer Successful' : 'Settle Funds to dYdX',
        };
      }
    }

    // Default: Setup Form Display State
    if (isUsdc) {
      return {
        top: {
          symbol: 'USDC',
          network: 'STELLAR',
          amount: inputAmount,
          logo: USDC_LOGO_URL,
          balance: tokenBalance,
        },
        bottom: {
          symbol: 'USDC',
          network: destinationChain?.name?.toUpperCase() || 'EVM',
          amount: bridgeQuote?.amountToBeReceived,
          logo: USDC_LOGO_URL,
        },
        title: `Move Assets to ${destinationChain?.name || 'EVM'}`,
      };
    }

    return {
      top: {
        symbol: inputToken?.symbol || 'Select',
        network: 'STELLAR',
        amount: inputAmount,
        logo: inputToken?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol || '', stellarConfig),
        balance: tokenBalance,
      },
      bottom: {
        symbol: 'USDC',
        network: 'STELLAR',
        amount: swapQuote?.estimatedOutput || '0.00',
        logo: USDC_LOGO_URL,
      },
      title: 'Prepare USDC on Stellar',
    };
  }, [
    activeSession,
    inputAmount,
    inputToken,
    swapQuote,
    bridgeQuote,
    depositQuote,
    tokenBalance,
    destinationChain,
    currentNetwork,
    stellarAssets,
    isUsdc,
    evmChains,
  ]);

  // ---------------------------------------------------------------------------
  // Button State Calculation
  // ---------------------------------------------------------------------------
  const buttonLabel = useMemo(() => {
    if (!evmAddress || !stellarAddress) return 'CONNECT WALLETS';

    // Active session details buttons
    if (activeSession) {
      const activeChain = evmChains.find(c => c.chainId === activeSession.destinationChainId);
      const isSessionUsdc = activeSession.inputTokenSymbol === 'USDC';
      const totalSteps = isSessionUsdc ? 2 : 3;

      // If there's an error on any active step, always show TRY AGAIN
      if (activeSession.error) return 'TRY AGAIN';

      if (activeSession.phase === 'SWAP') return `SWAP TO USDC (1/${totalSteps})`;
      if (activeSession.phase === 'BRIDGE') {
        if (activeSession.bridgeTx.status === 'PENDING') return 'WAITING FOR BRIDGE CONFIRMATION...';
        if (activeSession.bridgeTx.status === 'FAILED') return 'TRY AGAIN';
        const step = isSessionUsdc ? 1 : 2;
        return `BRIDGE TO ${activeChain?.name?.toUpperCase() || 'EVM'} (${step}/${totalSteps})`;
      }
      if (activeSession.phase === 'DEPOSIT') {
        if (activeSession.bridgeTx.status !== 'SUCCESS') return 'WAITING FOR BRIDGE FUNDS...';
        if (activeSession.depositTx.status === 'PENDING') return 'SETTLEMENT IN PROGRESS...';
        if (activeSession.depositTx.status === 'FAILED') return 'TRY AGAIN';
        const step = isSessionUsdc ? 2 : 3;
        return activeSession.loadingStep ? 'REFRESHING ROUTE...' : `SETTLE TO DYDX (${step}/${totalSteps})`;
      }
      if (activeSession.phase === 'DONE') return 'START NEW TRANSFER';
    }

    // Setup Form Buttons
    if (setupError) return 'TRY AGAIN';
    if (hasPendingSession) return 'TRANSFER IN PROGRESS...';
    if (!inputAmount || parseFloat(inputAmount) <= 0) return 'ENTER AMOUNT';
    const isInsufficient = parseFloat(inputAmount) > parseFloat(tokenBalance);
    if (isInsufficient) return 'INSUFFICIENT BALANCE';

    const minXlm = feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY ? 5 : 1;
    const isInsufficientXlm = parseFloat(nativeBalance) < minXlm;
    if (isInsufficientXlm) return 'INSUFFICIENT XLM FOR GAS';
    if (isQuoting) return 'FETCHING QUOTES...';

    return 'START BRIDGE';
  }, [
    evmAddress,
    stellarAddress,
    activeSession,
    setupError,
    inputAmount,
    tokenBalance,
    nativeBalance,
    feePaymentMethod,
    isQuoting,
    evmChains,
    hasPendingSession,
  ]);

  const isButtonDisabled = useMemo(() => {
    if (!evmAddress || !stellarAddress) return true;

    // Active session details checks
    if (activeSession) {
      if (activeSession.loadingStep) return true;
      if (activeSession.phase === 'BRIDGE' && activeSession.bridgeTx.status === 'PENDING') return true;
      if (activeSession.phase === 'DEPOSIT' && activeSession.bridgeTx.status !== 'SUCCESS') return true;
      if (activeSession.phase === 'DEPOSIT' && activeSession.depositTx.status === 'PENDING') return true;
      return false;
    }

    // Setup Form checks
    if (hasPendingSession) return true;
    if (parseFloat(inputAmount) <= 0) return true;
    const isInsufficient = parseFloat(inputAmount) > parseFloat(tokenBalance);
    const minXlm = feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY ? 5 : 1;
    const isInsufficientXlm = parseFloat(nativeBalance) < minXlm;

    if (isInsufficient || isInsufficientXlm) return true;
    if (isQuoting) return true;

    return false;
  }, [
    evmAddress,
    stellarAddress,
    activeSession,
    inputAmount,
    tokenBalance,
    nativeBalance,
    feePaymentMethod,
    isQuoting,
    hasPendingSession,
  ]);

  const customButtonClass = useMemo(() => {
    if (hasPendingSession && !activeSession) {
      return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-none cursor-not-allowed opacity-60';
    }
    if (buttonLabel === 'START BRIDGE' && !activeSession) {
      return 'bg-gradient-to-r from-brand to-brand/80 hover:brightness-110 shadow-lg shadow-brand/20 text-white border-0';
    }
    return '';
  }, [hasPendingSession, activeSession, buttonLabel]);

  // ---------------------------------------------------------------------------
  // Action Click Trigger
  // ---------------------------------------------------------------------------
  const handleActionClick = async () => {
    if (!evmAddress || !stellarAddress) {
      openModal();
      return;
    }

    // Roadmap detailed view execution
    if (activeSession) {
      if (activeSession.phase === 'DONE') {
        dismissSession(activeSession.id);
        setActiveSessionId(null);
        return;
      }
      await executeSessionStep(activeSession.id);
      return;
    }

    // Setup Form initiation
    await createSession();
  };

  const handleBack = () => {
    if (activeSession) {
      const hasTx = activeSession.swapTx?.hash || activeSession.bridgeTx?.hash || activeSession.depositTx?.hash;
      if (!hasTx) {
        // Restore form inputs from the draft session before discarding it
        setInputAmount(activeSession.inputAmount);
        const token = stellarAssets.find(a => a.symbol === activeSession.inputTokenSymbol);
        if (token) setInputToken(token);
        const chain = evmChains.find(c => c.chainId === activeSession.destinationChainId);
        if (chain) setDestinationChain(chain);
        setFeePaymentMethod(activeSession.feePaymentMethod);

        // Dismiss the draft session
        dismissSession(activeSession.id);
      }
      setActiveSessionId(null);
      return;
    }
  };

  // ---------------------------------------------------------------------------
  // Route breakdown helper
  // ---------------------------------------------------------------------------
  const routeBreakdown = useMemo(() => {
    if (activeSession) return null; // Only for setup form view

    if (!bridgeQuote && !depositQuote && !swapQuote) return null;
    const stellarConfig = getStellarConfig(currentNetwork);

    const bridgeFee = bridgeQuote
      ? feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
        ? bridgeQuote.feeOptions.stablecoin?.float
        : bridgeQuote.feeOptions.native?.float
      : 0;
    const bridgeTime = Math.round((bridgeQuote?.transferTimeMs || 0) / 60000);
    const depositTime = Math.round((depositQuote?.estimatedDurationSeconds || 0) / 60);

    const items: Array<{
      label: string;
      value: string;
      fee: string;
      amount: string;
      time?: string;
      icon: string;
      chainIcon: string | undefined;
      status: 'pending' | 'active' | 'done';
    }> = [];

    if (swapQuote) {
      const inputLogo = stellarAssets.find(t => t.symbol === inputToken?.symbol)?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol || '', stellarConfig);
      items.push({
        label: 'Swap',
        value: `${inputToken?.symbol} → USDC`,
        fee: 'Variable',
        amount: swapQuote.estimatedOutput ? portfolioUtils.formatBalance(swapQuote.estimatedOutput) : '',
        icon: inputLogo,
        chainIcon: stellarConfig.logoUrl,
        status: 'pending',
      });
    }

    if (bridgeQuote) {
      items.push({
        label: 'Bridge',
        value: `Stellar → ${destinationChain?.name}`,
        fee: `${bridgeFee} ${feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN ? 'USDC' : 'XLM'}`,
        amount: bridgeQuote.amountToBeReceived
          ? portfolioUtils.formatBalance(bridgeQuote.amountToBeReceived)
          : '',
        time: `${bridgeTime}m`,
        icon: USDC_LOGO_URL,
        chainIcon: stellarConfig.logoUrl,
        status: 'pending',
      });
    }

    if (depositQuote) {
      const rawFee = ((depositQuote.usd_amount_in ?? 0) - (depositQuote.usd_amount_out ?? 0)) || 0.02;
      items.push({
        label: 'Bridge',
        value: `${destinationChain?.name} → dYdX`,
        fee: `$${rawFee.toFixed(4)}`,
        amount: depositQuote.receivedAmount
          ? portfolioUtils.formatBalance(depositQuote.receivedAmount.toString())
          : '',
        time: `${depositTime}m`,
        icon: USDC_LOGO_URL,
        chainIcon: destinationChain?.logoURI,
        status: 'pending',
      });
      items.push({
        label: 'Settled',
        value: 'dYdX Account',
        fee: '---',
        amount: depositQuote.receivedAmount
          ? portfolioUtils.formatBalance(depositQuote.receivedAmount.toString())
          : '',
        icon: USDC_LOGO_URL,
        chainIcon: DYDX_LOGO_URL,
        status: 'pending',
      });
    }

    return { items, totalTime: bridgeTime + depositTime };
  }, [
    activeSession,
    bridgeQuote,
    depositQuote,
    swapQuote,
    inputToken,
    destinationChain,
    currentNetwork,
    stellarAssets,
    feePaymentMethod,
  ]);

  // ---------------------------------------------------------------------------
  // Roadmap Progression Steps Visuals
  // ---------------------------------------------------------------------------
  const renderVerticalPath = () => {
    if (!activeSession) return null;

    const getSubStepLabel = (type: string): string => {
      const map: Record<string, string> = {
        ibc_transfer: 'IBC Transfer',
        cctp_transfer: 'CCTP Bridge',
        go_fast_transfer: '⚡ Go Fast',
        axelar_transfer: 'Axelar Bridge',
        hyperlane_transfer: 'Hyperlane Bridge',
        evm_swap: 'EVM Swap',
        swap: 'Swap',
        unknown: 'Hop',
      };
      return map[type] ?? type.replace(/_/g, ' ').replace('transfer', 'Transfer').trim();
    };

    const getSubStepStatePill = (state: string) => {
      switch (state) {
        case 'TRANSFER_SUCCESS':
          return {
            label: 'Success',
            className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          };
        case 'TRANSFER_RECEIVED':
          return {
            label: 'Finalizing',
            className: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse',
          };
        case 'TRANSFER_PENDING':
          return {
            label: 'Pending',
            className: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse',
          };
        case 'TRANSFER_FAILURE':
          return {
            label: 'Failed',
            className: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
          };
        default:
          return {
            label: 'Waiting',
            className: 'bg-white/5 text-muted border-divider',
          };
      }
    };

    const isSessionUsdc = activeSession.inputTokenSymbol === 'USDC';
    const activeChain = evmChains.find(c => c.chainId === activeSession.destinationChainId);

    const steps = isSessionUsdc
      ? [
        {
          id: 'BRIDGE',
          label: 'Bridge to EVM',
          description: `Move USDC from Stellar to ${activeChain?.name || 'EVM Chain'}. This involves a cross-chain protocol and typically takes 2-15 minutes.`,
          color: 'text-blue-400',
          bg: 'bg-blue-400/20',
          border: 'border-blue-400/30',
        },
        {
          id: 'DEPOSIT',
          label: 'Settle to dYdX',
          description: 'Finalize the settlement from the EVM network to your dYdX trading account. This funds your dYdX position.',
          color: 'text-brand',
          bg: 'bg-brand/20',
          border: 'border-brand/30',
        },
      ]
      : [
        {
          id: 'SWAP',
          label: 'Prepare USDC on Stellar',
          description: 'Convert tokens to USDC on Stellar. This ensures compatibility with the cross-chain bridge infrastructure.',
          color: 'text-emerald-400',
          bg: 'bg-emerald-400/20',
          border: 'border-emerald-400/30',
        },
        {
          id: 'BRIDGE',
          label: 'Bridge to EVM',
          description: `Cross-chain transfer to ${activeChain?.name || 'EVM Chain'}. Assets are moved securely via Allbridge liquidity pools.`,
          color: 'text-blue-400',
          bg: 'bg-blue-400/20',
          border: 'border-blue-400/30',
        },
        {
          id: 'DEPOSIT',
          label: 'Settle to dYdX',
          description: 'Depositing from EVM into the dYdX Protocol. Once confirmed, your balance will be available for trading.',
          color: 'text-brand',
          bg: 'bg-brand/20',
          border: 'border-brand/30',
        },
      ];

    const currentStepIndex = activeSession.phase === 'SETUP'
      ? -1
      : activeSession.phase === 'SWAP'
        ? 0
        : activeSession.phase === 'BRIDGE'
          ? isSessionUsdc ? 0 : 1
          : activeSession.phase === 'DEPOSIT'
            ? isSessionUsdc ? 1 : 2
            : 3;

    return (
      <div className="bg-tertiary/90 backdrop-blur-2xl rounded-b-[3rem] mx-1 -mt-10 pt-12 pb-12 px-6 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)] animate-slide-up relative z-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-64 bg-brand/5 blur-[120px] pointer-events-none opacity-60" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-10 opacity-80">
            <Info size={12} className="text-brand" />
            <h3 className="text-[10px] font-black text-brand uppercase tracking-[0.4em]">
              Execution Roadmap
            </h3>
          </div>

          <div className="relative space-y-12 ml-2">
            <div className="absolute top-4 left-[15px] bottom-4 w-0 border-l-2 border-dotted border-divider" />

            {steps.map((s, i) => {
              const stepTxStatus = s.id === 'SWAP'
                ? activeSession.swapTx.status
                : s.id === 'BRIDGE'
                  ? activeSession.bridgeTx.status
                  : activeSession.depositTx.status;
              const isActive = i === currentStepIndex;
              const isCompleted = stepTxStatus === 'SUCCESS' || i < currentStepIndex;
              const isStepPending = stepTxStatus === 'PENDING';
              const isFailed = stepTxStatus === 'FAILED';
              const isLocked = i > currentStepIndex && !stepTxStatus;


              return (
                <div
                  key={s.id}
                  className={`flex gap-6 transition-all duration-700 ${isLocked ? 'opacity-20 blur-[0.5px]' : 'opacity-100'}`}
                >
                  <div className="relative z-10">
                    <div
                      className={`w-8 h-8 rounded-full z-20 flex items-center justify-center border-2 transition-all duration-700 ${isActive
                        ? `${s.bg} ${s.border} ${s.color} shadow-[0_0_20px_rgba(var(--brand-rgb),0.1)] scale-110`
                        : isCompleted
                          ? 'bg-brand border-brand text-white shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)]'
                          : isFailed
                            ? 'bg-rose-500/20 border-rose-500 text-rose-500'
                            : 'bg-bg-primary border-divider text-muted'
                        }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 size={16} />
                      ) : isFailed ? (
                        <AlertCircle size={16} />
                      ) : isStepPending ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <span className="text-[10px] font-black">{i + 1}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4
                        className={`text-xs font-black uppercase tracking-widest transition-colors ${isActive
                          ? s.color
                          : isCompleted
                            ? 'text-primary'
                            : isFailed
                              ? 'text-rose-500'
                              : 'text-muted'
                          }`}
                      >
                        {s.label}
                      </h4>
                      {isStepPending && (
                        <span className="text-[8px] font-black bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 animate-pulse uppercase tracking-tighter">
                          Pending
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-[8px] font-black bg-rose-500/10 text-rose-500 px-2 py-0.5 rounded-full border border-rose-500/20 uppercase tracking-tighter">
                          Failed
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-muted leading-relaxed max-w-[280px]">
                      {s.description}
                    </p>

                    {isActive && !isFailed && (
                      <div className="mt-4 space-y-4">
                        <div className="flex items-center gap-2 text-[9px] font-black text-brand uppercase tracking-widest animate-pulse">
                          <div className="flex gap-1">
                            <div className="w-1 h-1 rounded-full bg-brand animate-bounce" />
                            <div className="w-1 h-1 rounded-full bg-brand animate-bounce delay-100" />
                            <div className="w-1 h-1 rounded-full bg-brand animate-bounce delay-200" />
                          </div>
                          <span>Active Step</span>
                        </div>

                        {s.id === 'DEPOSIT' && activeSession.dydxSteps && activeSession.dydxSteps.length > 0 && (
                          <div className="pl-3 border-l border-divider/40 space-y-3.5 ml-1 mt-2 mb-2">
                            {activeSession.dydxSteps.map((step: any, idx: number) => {
                              const isStepSuccess = step.state === 'TRANSFER_SUCCESS';
                              const isStepFailure = step.state === 'TRANSFER_FAILURE';
                              const explorerLink = step.packet_txs?.send_tx?.explorer_link || step.packet_txs?.receive_tx?.explorer_link;
                              const pill = getSubStepStatePill(step.state);

                              return (
                                <div key={idx} className="flex flex-col gap-1.5 animate-fade-in">
                                  <div className="flex items-center justify-between gap-4 group/sub">
                                    <div className="flex items-center gap-2.5">
                                      <div
                                        className={`w-2 h-2 rounded-full ${isStepSuccess
                                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                                          : isStepFailure
                                            ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                                            : 'bg-brand animate-pulse'
                                          }`}
                                      />
                                      <span className="text-[10px] font-black text-primary tracking-wide uppercase">
                                        {getSubStepLabel(step.type)}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-widest ${pill.className}`}>
                                        {pill.label}
                                      </span>
                                    </div>
                                    {explorerLink && (
                                      <a
                                        href={explorerLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[8px] font-black text-brand/60 hover:text-brand flex items-center gap-1 transition-colors uppercase tracking-widest"
                                      >
                                        Explorer <ExternalLink size={8} />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {((s.id === 'SWAP' && activeSession.swapTx.hash) ||
                          (s.id === 'BRIDGE' && activeSession.bridgeTx.hash) ||
                          (s.id === 'DEPOSIT' && activeSession.depositTx.hash)) && (
                            <a
                              href={
                                s.id === 'SWAP'
                                  ? `https://stellar.expert/explorer/public/tx/${activeSession.swapTx.hash}`
                                  : s.id === 'BRIDGE'
                                    ? `https://explorer.allbridge.io/tx/${activeSession.bridgeTx.hash}`
                                    : getExplorerUrl(activeSession.destinationChainId, 'tx', activeSession.depositTx.hash || '')
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-[8px] font-black text-brand/60 hover:text-brand transition-colors uppercase tracking-widest mt-2"
                            >
                              <ExternalLink size={10} />
                              <span>View on {s.id === 'DEPOSIT' ? 'EVM ' : ''}Explorer</span>
                            </a>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };



  // ---------------------------------------------------------------------------
  // Wallet Connection Required View
  // ---------------------------------------------------------------------------
  if (!isBothConnected && !activeSession) {
    return (
      <div className="w-full max-w-xl mx-auto lg:px-4 pb-4 animate-fade-in">
        <div className="bg-tertiary rounded-[2.5rem] border border-divider/50 p-12 text-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-brand/10" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand/5 rounded-full -ml-16 -mb-16 blur-3xl transition-all group-hover:bg-brand/10" />

          <div className="relative mb-8 flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-brand/10 flex items-center justify-center rotate-3 group-hover:rotate-6 transition-transform duration-500">
                <Layers className="w-12 h-12 text-brand" />
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-black text-primary mb-4 uppercase tracking-tighter">
            Dual Connection Required
          </h2>

          <p className="text-muted text-sm leading-relaxed mb-10 max-w-[320px] mx-auto font-medium">
            To use the Stellar-dYdX bridge, you need to connect both your
            <span className="text-brand font-bold mx-1">Stellar</span>
            and
            <span className="text-brand font-bold mx-1">EVM</span>
            wallets simultaneously.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => openModal()}
              className="w-full btn btn-primary text font-black py-5 rounded-2xl tracking-[0.2em] hover:brightness-110 active:scale-[0.98] transition-all uppercase shadow-lg shadow-brand/20 flex items-center justify-center gap-3"
            >
              <Wallet size={20} />
              Connect Wallets
            </button>

            <p className="text-[10px] font-black text-muted/40 uppercase tracking-[0.3em]">
              Secure Multi-Chain Settlement
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeChain = activeSession
    ? evmChains.find(c => c.chainId === activeSession.destinationChainId)
    : destinationChain;

  return (
    <div className="w-full mx-auto lg:px-4 pb-4 animate-fade-in">
      <div className={`-mb-1 flex px-2 items-center ${!activeSession ? 'justify-end' : 'justify-between'}`}>
        {activeSession && (
          <button
            onClick={handleBack}
            className="flex items-center gap-2 bg-brand hover:brightness-110 px-5 py-2.5 rounded-xl rounded-b-none pb-5 border border-brand/20 shadow-lg shadow-brand/20 text-white transition-all group animate-fade-in"
          >
            <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform text-white" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white">
              Setup New Transfer
            </span>
          </button>
        )}
        {!activeSession && (
          <div className="relative">
            <button
              onClick={() => setShowNetworkSelector(!showNetworkSelector)}
              className="flex items-center gap-3 bg-tertiary hover:bg-hover px-5 py-2.5 rounded-xl rounded-b-none pb-5 border border-divider transition-all group"
            >
              <div className="flex flex-col items-start leading-none">
                <span className="text-[8px] font-black text-brand uppercase tracking-widest mb-1">
                  Bridge Conduit
                </span>
                <div className="flex items-center gap-2">
                  <img src={activeChain?.logoURI} className="w-4 h-4 rounded-full" alt="" />
                  <span className="text-xs font-black text-primary uppercase">
                    {activeChain?.name}
                  </span>
                </div>
              </div>
              <ChevronDown
                size={14}
                className={`text-muted transition-transform duration-300 ml-2 ${showNetworkSelector ? 'rotate-180' : ''}`}
              />
            </button>

            {showNetworkSelector && (
              <div className="absolute top-full right-0 mt-3 w-64 bg-tertiary border border-divider rounded-[2rem] p-3 z-[100] shadow-2xl animate-slide-up backdrop-blur-xl">
                <div className="px-3 py-2 mb-2 border-b border-divider/50">
                  <span className="text-[10px] font-black text-muted uppercase tracking-widest">
                    Select Bridge Pathway
                  </span>
                  <p className="text-[8px] font-bold text-muted/60 uppercase mt-1">
                    Funds will pass through here to dYdX
                  </p>
                </div>
                {evmChains.map(c => (
                  <button
                    key={c.chainId}
                    onClick={() => {
                      setDestinationChain(c);
                      setShowNetworkSelector(false);
                    }}
                    className={`flex items-center gap-4 w-full px-4 py-3.5 rounded-xl transition-all ${destinationChain?.chainId === c.chainId
                      ? 'bg-brand/10 text-brand'
                      : 'hover:bg-hover text-secondary'
                      }`}
                  >
                    <img src={c.logoURI} className="w-6 h-6 rounded-full shadow-md" alt="" />
                    <span className="text-sm font-black uppercase tracking-tight">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4 relative">
        <div className="space-y-1 relative z-10">
          {/* You Pay Panel */}
          <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-8 group transition-all duration-500 shadow-xl relative z-20 border border-divider/10">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">
                You Pay
              </span>
              {!activeSession && (
                <button
                  onClick={handleMaxAmount}
                  className="text-[10px] font-black text-brand bg-brand/10 px-4 py-1.5 rounded-full hover:bg-brand hover:text-white transition-all tracking-widest min-h-[24px] min-w-[100px] flex items-center justify-center"
                >
                  {loadingAssets ? (
                    <Shimmer className="h-2 w-16" />
                  ) : (
                    `MAX: ${parseFloat(parseFloat(tokenBalance).toFixed(7)).toString()}`
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={() =>
                  !activeSession &&
                  openAssetSelector('BRIDGE', {
                    forceNetwork: STELLAR_CHAIN_ID,
                    showAllStellarAssets: true,
                    onSelect: (a: StellarToken) => {
                      const found = stellarAssets.find(s => s.symbol === a.symbol);
                      setInputToken(found || a);
                    },
                  })
                }
                className={`flex items-center gap-4 bg-secondary hover:bg-hover rounded-2xl px-5 py-4 transition-all border border-divider/50 shadow-sm min-w-[190px] ${!activeSession ? 'active:scale-95' : 'pointer-events-none opacity-80'}`}
              >
                {loadingAssets && !activeSession ? (
                  <div className="flex items-center gap-4">
                    <Shimmer className="w-10 h-10 rounded-full" />
                    <div className="flex flex-col gap-2">
                      <Shimmer className="h-4 w-12" />
                      <Shimmer className="h-2 w-8" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <img
                        src={displayState.top.logo}
                        className="w-10 h-10 rounded-full object-cover shadow-md"
                        alt=""
                      />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-secondary bg-primary flex items-center justify-center p-0.5 shadow-sm">
                        <img
                          src={
                            activeSession && (activeSession.phase === 'DEPOSIT' || activeSession.phase === 'DONE')
                              ? activeChain?.logoURI
                              : getStellarConfig(currentNetwork).logoUrl
                          }
                          className="w-full h-full object-contain rounded-full"
                          alt=""
                        />
                      </div>
                    </div>
                    <div className="flex flex-col items-start leading-tight">
                      <span className="font-black text-lg text-primary uppercase tracking-tight">
                        {displayState.top.symbol}
                      </span>
                      <span className="text-[9px] font-black text-muted uppercase tracking-tighter">
                        {activeSession && (activeSession.phase === 'DEPOSIT' || activeSession.phase === 'DONE')
                          ? activeChain?.name || 'EVM'
                          : 'Stellar'}
                      </span>
                    </div>
                    {!activeSession && <ChevronDown size={14} className="text-muted ml-auto" />}
                  </>
                )}
              </button>

              <div className="flex-1 w-0 min-w-0 flex flex-col items-end">
                {!activeSession ? (
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="w-full bg-transparent border-none text-right text-5xl font-black focus:ring-0 p-0 placeholder:text-muted/10 outline-none text-primary tracking-tighter min-w-0"
                    value={inputAmount}
                    onChange={e => setInputAmount(sanitizeAmount(e.target.value.replace(/[^0-9.]/g, '')))}
                  />
                ) : (
                  <div className="max-w-full overflow-x-auto whitespace-nowrap scrollbar-hide text-5xl font-black text-primary tracking-tighter">
                    {displayState.top.amount
                      ? parseFloat(parseFloat(displayState.top.amount).toFixed(7)).toString()
                      : '0.00'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Arrow Divider */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
            <div className="w-11 h-11 bg-secondary rounded-2xl flex items-center justify-center shadow-2xl">
              <ArrowUpDown size={18} className="text-brand" />
            </div>
          </div>

          {/* You Receive Panel */}
          <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-8 group transition-all duration-500 shadow-xl relative overflow-hidden border border-divider/20 z-20 w-full max-w-full">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">
                You Receive
              </span>
              {(!activeSession || activeSession.phase === 'SETUP' || activeSession.phase === 'SWAP' || activeSession.phase === 'BRIDGE') ? (
                <div className="flex items-center gap-1.5 bg-brand/5 px-3 py-1 rounded-full border border-brand/10">
                  <span className="text-[9px] font-black text-brand uppercase tracking-tighter italic">
                    Pending Final Settlement
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-brand/10 px-3 py-1 rounded-full border border-brand/20">
                  <CheckCircle2 size={10} className="text-brand" />
                  <span className="text-[9px] font-black text-brand uppercase tracking-tighter">
                    {activeSession?.phase === 'DONE' ? 'Settled on dYdX' : 'Crossing to dYdX'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 bg-secondary rounded-2xl px-5 py-4 border border-divider/50 shadow-sm min-w-[190px] opacity-90">
                <div className="relative">
                  <img
                    src={displayState.bottom.logo}
                    className="w-10 h-10 rounded-full object-cover shadow-md"
                    alt=""
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-secondary bg-bg-primary flex items-center justify-center p-0.5 shadow-sm">
                    {displayState.bottom.network === 'DYDX' ? (
                      <div className="w-full h-full bg-black rounded-full flex items-center justify-center p-1">
                        <img
                          src={DYDX_LOGO_URL}
                          className="w-full h-full object-contain"
                          alt=""
                        />
                      </div>
                    ) : (
                      <img
                        src={
                          getChainById(
                            displayState.bottom.network === 'STELLAR'
                              ? STELLAR_CHAIN_ID
                              : activeChain?.chainId || 42161
                          )?.logoURI
                        }
                        className="w-full h-full object-contain"
                        alt=""
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="font-black text-lg text-primary uppercase tracking-tight">
                    {displayState.bottom.symbol}
                  </span>
                  <span className="text-[9px] font-black text-muted uppercase tracking-tighter">
                    {displayState.bottom.network}
                  </span>
                </div>
              </div>

              <div className="flex-1 w-0 min-w-0 flex flex-col items-end">
                {isQuoting ? (
                  <Shimmer className="h-10 w-full mb-1" />
                ) : (
                  <div className="max-w-full overflow-x-auto whitespace-nowrap scrollbar-hide text-5xl font-black text-primary tracking-tighter">
                    {displayState.bottom.amount
                      ? portfolioUtils.formatBalance(displayState.bottom.amount)
                      : '0.00'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Vertical Progress Roadmap (Active Session view only) */}
        {activeSession && renderVerticalPath()}



        {/* View Full Quote Details toggle */}
        {!activeSession && routeBreakdown && (
          <div className="flex justify-center -mt-2 -mb-1">
            <button
              onClick={() => setShowFullDetails(!showFullDetails)}
              className="text-[10px] bg-primary p-3 px-5 rounded-t-lg font-black text-muted hover:text-brand uppercase tracking-widest flex items-center gap-1.5 transition-colors"
            >
              {showFullDetails ? <EyeOff size={12} /> : <Eye size={12} />}
              {showFullDetails ? 'Hide Full Quote' : 'View Full Route Details'}
            </button>
          </div>
        )}

        {/* Quote / Route breakdown details panel */}
        {!activeSession && routeBreakdown && (
          <div className="bg-tertiary rounded-xl border border-divider p-4 py-6 lg:p-6 pb-0 animate-fade-in relative">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-brand" />
                <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">
                  Route Details
                </h4>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 bg-secondary/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-divider shadow-inner">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-muted uppercase tracking-tighter">
                      XLM Balance
                    </span>
                    <span className="text-[10px] font-black text-primary tracking-tight">
                      {portfolioUtils.formatBalance(nativeBalance)} XLM
                    </span>
                  </div>
                  <div className="w-[1px] h-6 bg-divider/30" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-black text-muted uppercase tracking-tighter">
                      Pay Fee In
                    </span>
                    <button
                      onClick={() =>
                        setFeePaymentMethod(
                          feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                            ? FeePaymentMethod.WITH_NATIVE_CURRENCY
                            : FeePaymentMethod.WITH_STABLECOIN
                        )
                      }
                      className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                    >
                      <div
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border transition-all ${feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                          ? 'bg-brand text-white border-brand shadow-lg shadow-brand/20'
                          : 'bg-tertiary border-divider text-muted opacity-50'
                          }`}
                      >
                        <img src={USDC_LOGO_URL} className="w-2.5 h-2.5 rounded-full" alt="" />
                        <span className="text-[7px] font-black">USDC</span>
                      </div>
                      <div
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border transition-all ${feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY
                          ? 'bg-brand text-white border-brand shadow-lg shadow-brand/20'
                          : 'bg-tertiary border-divider text-muted opacity-50'
                          }`}
                      >
                        <img
                          src={getStellarConfig(currentNetwork).logoUrl}
                          className="w-2.5 h-2.5 rounded-full"
                          alt=""
                        />
                        <span className="text-[7px] font-black">XLM</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-2 mb-10 relative overflow-x-auto scrollbar-hide py-4 min-w-0 w-full">
              {isQuoting ? (
                <div className="flex justify-between w-full px-4">
                  {[1, 2, 3].map(i => (
                    <Shimmer key={i} className="w-16 h-16 rounded-2xl" />
                  ))}
                </div>
              ) : (
                routeBreakdown.items.map((item, idx) => (
                  <React.Fragment key={idx}>
                    <div className="flex flex-col items-center gap-3 relative z-10 flex-shrink-0">
                      <div
                        className={`w-14 h-14 relative rounded-2xl bg-tertiary flex items-center justify-center border transition-all duration-500 shadow-sm ${item.status === 'done'
                          ? 'border-success/50'
                          : item.status === 'active'
                            ? 'border-brand shadow-lg shadow-brand/10'
                            : 'border-divider'
                          }`}
                      >
                        <img src={item.icon} className="w-8 h-8 rounded-full shadow-sm" alt="" />
                        <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full border-2 border-secondary bg-bg-primary flex items-center justify-center p-0.5 shadow-sm">
                          <img
                            src={item.chainIcon}
                            className="w-full h-full object-contain"
                            alt=""
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest ${item.status === 'active' ? 'text-brand' : 'text-muted'}`}
                        >
                          {item.label}
                        </span>
                        <span className="text-[8px] font-bold text-white/40 mt-0.5">
                          {item.amount ? `${item.amount} USDC` : '---'}
                        </span>
                        {item.time && (
                          <div className="flex items-center gap-1 mt-0.5 opacity-80">
                            <Clock size={8} className="text-brand" />
                            <span className="text-[10px] font-black text-brand uppercase tracking-tighter">
                              {item.time}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {idx < routeBreakdown.items.length - 1 && (
                      <div
                        className="flex-1 h-0 border-t-2 border-dotted mx-2 mb-12 transition-all duration-500 opacity-30 min-w-[30px]"
                        style={{
                          borderColor:
                            item.status === 'done' ? 'var(--success)' : 'var(--divider)',
                        }}
                      />
                    )}
                  </React.Fragment>
                ))
              )}
            </div>

            {/* Per-step fee breakdown */}
            <div className="space-y-2 py-4 border-t border-divider/50">
              {routeBreakdown.items.map(
                (item, idx) =>
                  item.fee !== '---' && (
                    <div key={idx} className="flex justify-between items-center text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <img src={item.icon} className="w-4 h-4 rounded-full" alt="" />
                        <span className="text-muted font-bold">{item.label}</span>
                        {item.time && (
                          <div className="flex items-center gap-0.5 opacity-40">
                            <Clock size={8} />
                            <span className="text-[8px] font-black uppercase">{item.time}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-primary font-black">{item.fee}</span>
                    </div>
                  )
              )}
            </div>

            {/* Full quote details breakdown */}
            {showFullDetails && rawQuotes && (
              <div className="space-y-3 py-4 border-t border-divider/50 animate-fade-in">
                <p className="text-[9px] font-black text-brand uppercase tracking-[0.2em] mb-2">
                  Full Quote Breakdown
                </p>

                {rawQuotes.swap && (
                  <details className="group" open>
                    <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                      <span className="group-open:text-brand transition-colors">Stellar Swap</span>
                      <ChevronDown
                        size={10}
                        className="group-open:rotate-180 group-open:text-brand transition-all duration-300"
                      />
                    </summary>
                    <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                      <div className="flex justify-between">
                        <span className="text-muted">You Pay</span>
                        <span className="text-primary font-black">
                          {rawQuotes.swap.inputAmount}{' '}
                          {rawQuotes.swap.fromAsset?.code || inputToken?.symbol}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">You Get (USDC)</span>
                        <span className="text-brand font-black">
                          {parseFloat(rawQuotes.swap.estimatedOutput || '0').toFixed(6)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Min. Received</span>
                        <span className="text-primary">
                          {parseFloat(rawQuotes.swap.minimumOutput as string || '0').toFixed(6)} USDC
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Price Impact</span>
                        <span
                          className={`font-black ${(rawQuotes.swap.priceImpact || 0) > 1 ? 'text-red-400' : 'text-green-400'}`}
                        >
                          {(rawQuotes.swap.priceImpact || 0).toFixed(3)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Route</span>
                        <span className="text-primary text-right max-w-[140px] truncate">
                          {Array.isArray(rawQuotes.swap.path?.path)
                            ? (rawQuotes.swap.path!.path as Array<{ code: string }>)
                              .map(p => p.code)
                              .join(' → ')
                            : 'AMM Pool'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Slippage</span>
                        <span>{DEFAULT_SLIPPAGE}%</span>
                      </div>
                    </div>
                  </details>
                )}

                {rawQuotes.bridge && (
                  <details className="group" open={!rawQuotes.swap}>
                    <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                      <span className="group-open:text-brand transition-colors">
                        Allbridge (Stellar → {rawQuotes.bridge.destinationToken?.chainName || destinationChain?.name})
                      </span>
                      <ChevronDown
                        size={10}
                        className="group-open:rotate-180 group-open:text-brand transition-all duration-300"
                      />
                    </summary>
                    <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                      <div className="flex justify-between">
                        <span className="text-muted">Bridge Amount In</span>
                        <span className="text-primary font-black">
                          {rawQuotes.bridge.amountToBeReceived
                            ? (
                              parseFloat(rawQuotes.bridge.amountToBeReceived) +
                              parseFloat(String(rawQuotes.bridge.feeOptions?.stablecoin?.float || '0'))
                            ).toFixed(4)
                            : '—'}{' '}
                          USDC
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Amount Out</span>
                        <span className="text-brand font-black">
                          {parseFloat(rawQuotes.bridge.amountToBeReceived || '0').toFixed(4)} USDC
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Exchange Rate</span>
                        <span>{rawQuotes.bridge.exchangeRate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Transfer Time</span>
                        <span>
                          {Math.round((rawQuotes.bridge.transferTimeMs || 0) / 60000)} min
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Fee (pay in USDC)</span>
                        <span className="text-yellow-400 font-black">
                          {rawQuotes.bridge.feeOptions?.stablecoin?.float} USDC
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Fee (pay in XLM)</span>
                        <span className="text-yellow-400">
                          {rawQuotes.bridge.feeOptions?.native?.float} XLM
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Source</span>
                        <span className="text-primary">
                          Stellar ({rawQuotes.bridge.sourceToken?.chainName})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Destination</span>
                        <span className="text-primary">
                          {rawQuotes.bridge.destinationToken?.chainName} ({rawQuotes.bridge.destinationToken?.symbol})
                        </span>
                      </div>
                    </div>
                  </details>
                )}

                {rawQuotes.dydx && (
                  <details className="group">
                    <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                      <span className="group-open:text-brand transition-colors">
                        dYdX Settlement (Skip / CCTP)
                      </span>
                      <ChevronDown
                        size={10}
                        className="group-open:rotate-180 group-open:text-brand transition-all duration-300"
                      />
                    </summary>
                    <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                      <div className="flex justify-between">
                        <span className="text-muted">Bridge</span>
                        <span className="text-brand font-black">CCTP</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Est. Time</span>
                        <span>
                          {rawQuotes.dydx.estimatedTime ||
                            `~${Math.round((rawQuotes.dydx.estimatedDurationSeconds || 0) / 60)} min`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Bridge Fee</span>
                        <span className="text-yellow-400 font-black">
                          ${(rawQuotes.dydx.fee || 0.02).toFixed(4)} USD
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Settled (USDC)</span>
                        <span className="text-brand font-black">
                          {(rawQuotes.dydx.receivedAmount || 0).toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">USD Value Out</span>
                        <span className="text-primary">${rawQuotes.dydx.usdAmountOut}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Settled On</span>
                        <span className="text-brand">dYdX Chain</span>
                      </div>
                    </div>
                  </details>
                )}

                <p className="text-[10px] font-bold text-muted/30 uppercase text-center mt-2">
                  * Quotes refresh every 30s. All fees included in final amount.
                </p>
              </div>
            )}

            {/* Total estimated received row */}
            <div className="mt-4 p-4 bg-brand rounded-2xl rounded-b-none bg-secondary flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">
                  Total Estimated Received
                </p>
                <div className="flex items-center gap-2.5">
                  <div className="flex -space-x-1.5">
                    <div className="w-5.5 h-5.5 rounded-full bg-black flex items-center justify-center p-1 border border-secondary shadow-sm">
                      <img src={DYDX_LOGO_URL} className="w-full h-full object-contain" alt="" />
                    </div>
                    <div className="w-5 h-5 rounded-full bg-bg-primary flex items-center justify-center p-0.5 border border-secondary shadow-sm">
                      <img
                        src={USDC_LOGO_URL}
                        className="w-full h-full object-contain rounded-full"
                        alt=""
                      />
                    </div>
                  </div>
                  {isQuoting ? (
                    <Shimmer className="h-6 w-24" />
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-brand tracking-tighter leading-none">
                        {routeBreakdown.items[routeBreakdown.items.length - 1]?.amount || '0.00'}
                      </span>
                      <span className="text-brand text-[10px] font-black uppercase opacity-60">
                        USDC
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {isQuoting ? (
                <div className="animate-spin text-brand/30">
                  <RefreshCw size={16} />
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 text-[9px] font-black text-brand uppercase tracking-widest">
                    <Clock size={10} className="text-brand" />
                    <span>~{routeBreakdown.totalTime} MINS</span>
                  </div>
                  <span className="text-[8px] font-bold text-white/20 uppercase">
                    Total EST. TIME
                  </span>
                </div>
              )}
            </div>
          </div>
        )}



        {/* Action Panel */}
        <div className="pt-2">


          {activeSession?.loadingStep && (
            <div className="bg-brand/10 border border-brand/20 rounded-2xl p-4 flex items-center gap-3 mb-4 animate-pulse">
              <Wallet size={18} className="text-brand flex-shrink-0" />
              <p className="text-xs font-bold text-brand">
                Please check your connected wallet extension to approve the transaction signature request.
              </p>
            </div>
          )}

          {/* Errors display */}
          {(activeSession?.error || setupError) && (() => {
            // Determine if it's safe to discard — no funds irreversibly committed on-chain yet.
            // A tx is only "committed" if it has a hash (submitted to chain) AND is not just pending cancel.
            // Cases where it's safe to discard:
            //  1. Setup form error — no session even started
            //  2. SWAP phase with no hash — wallet was never prompted / user cancelled before submit
            //  3. BRIDGE phase with no bridge hash — swap is done (USDC in Stellar wallet) but bridge
            //     was cancelled before submission. User still controls their USDC on Stellar.
            //  4. DEPOSIT phase with no deposit hash — bridge done but deposit cancelled before submit
            const isSafeToDiscard =
              !!setupError ||
              (activeSession?.phase === 'SWAP' && !activeSession?.swapTx?.hash) ||
              (activeSession?.phase === 'BRIDGE' && !activeSession?.bridgeTx?.hash) ||
              (activeSession?.phase === 'DEPOSIT' && !activeSession?.depositTx?.hash);

            return (
              <div
                className="rounded-2xl p-4 mb-4 animate-fade-in space-y-3"
                style={{
                  background: 'var(--color-danger-bg)',
                  border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
                }}
              >
                {/* Error header */}
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'color-mix(in srgb, var(--color-danger) 20%, transparent)' }}
                  >
                    <AlertCircle size={16} style={{ color: 'var(--color-danger)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[10px] font-black uppercase tracking-widest mb-1"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      Transaction Failed
                    </p>
                    <p
                      className="text-xs font-bold leading-relaxed break-words"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {activeSession?.error || setupError}
                    </p>
                  </div>
                </div>

                {/* Cancel & Reset — only when safe (no funds on-chain yet) */}
                {isSafeToDiscard && (
                  <button
                    onClick={() => {
                      if (activeSession) {
                        setRestoreInputsOnClear(true);
                        setSessionToClear(activeSession.id);
                      } else {
                        // setupError case — just clear the error and return to form
                        clearSetupForm();
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98] hover:opacity-80"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    Cancel &amp; Start Over
                  </button>
                )}

                {/* Safety warning when funds are already on-chain */}
                {!isSafeToDiscard && (
                  <p
                    className="text-[9px] font-bold uppercase tracking-wider text-center"
                    style={{ color: 'color-mix(in srgb, var(--color-danger) 60%, transparent)' }}
                  >
                    ⚠ Funds are on-chain — tap "Try Again" below to retry safely.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Bridge fee payment selector in detailed session bridge phase */}
          {activeSession && activeSession.phase === 'BRIDGE' && (
            <div className="mb-4 bg-secondary/50 p-4 rounded-2xl border border-divider flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-muted uppercase tracking-widest">
                  Bridge Fee Currency
                </span>
                <span className="text-[11px] font-bold text-primary mt-1">
                  Select how you want to pay network fees:
                </span>
              </div>
              <button
                onClick={() =>
                  updateSession(activeSession.id, {
                    feePaymentMethod: activeSession.feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                      ? FeePaymentMethod.WITH_NATIVE_CURRENCY
                      : FeePaymentMethod.WITH_STABLECOIN
                  })
                }
                className="flex items-center gap-2 bg-secondary p-1 rounded-xl border border-divider shadow-sm"
              >
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${activeSession.feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                    ? 'bg-brand text-white shadow-lg shadow-brand/20'
                    : 'text-muted opacity-50'
                    }`}
                >
                  <img src={USDC_LOGO_URL} className="w-3.5 h-3.5 rounded-full" alt="" />
                  <span className="text-[10px] font-black">USDC</span>
                </div>
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${activeSession.feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY
                    ? 'bg-brand text-white shadow-lg shadow-brand/20'
                    : 'text-muted opacity-50'
                    }`}
                >
                  <img
                    src={getStellarConfig(currentNetwork).logoUrl}
                    className="w-3.5 h-3.5 rounded-full"
                    alt=""
                  />
                  <span className="text-[10px] font-black">XLM</span>
                </div>
              </button>
            </div>
          )}

          {activeSession?.phase === 'DONE' ? (
            <div className="bg-success/5 rounded-[2rem] border border-success/20 p-8 text-center animate-bounce-in shadow-xl">
              <div className="w-16 h-16 bg-success rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-success/20">
                <CheckCircle2 size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary mb-2 uppercase">Success!</h3>
              <p className="text-xs text-muted mb-6">Transfer executed successfully.</p>
              <button
                onClick={handleActionClick}
                className="w-full bg-success text-white font-bold py-4 rounded-2xl tracking-widest hover:brightness-110 transition-all uppercase"
              >
                Back to Dashboard
              </button>
            </div>
          ) : (
            <div className="relative">
              {activeSession && activeSession.phase === 'DEPOSIT' && activeSession.bridgeTx.status !== 'SUCCESS' && (
                <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 flex items-center gap-3">
                  <RefreshCw size={14} className="text-amber-400 animate-spin flex-shrink-0" />
                  <p className="text-[11px] font-bold text-amber-400">
                    Waiting for bridge funds to arrive on {activeChain?.name}. You can proceed once the bridge confirms receipt.
                  </p>
                </div>
              )}
              <ActionGuard requiredWallets={[WalletType.EVM, WalletType.STELLAR]}>
                <TransactionButton
                  label={buttonLabel}
                  isLoading={
                    isQuoting ||
                    activeSession?.loadingStep ||
                    (activeSession?.phase === 'BRIDGE' && activeSession?.bridgeTx.status === 'PENDING') ||
                    (activeSession?.phase === 'DEPOSIT' && activeSession?.depositTx.status === 'PENDING')
                  }
                  loadingLabel={
                    activeSession?.loadingStep
                      ? 'CHECK CONNECTED WALLET FOR PROMPTS...'
                      : activeSession?.phase === 'BRIDGE' && activeSession?.bridgeTx.status === 'PENDING'
                        ? 'WAITING FOR BRIDGE...'
                        : activeSession?.phase === 'DEPOSIT' && activeSession?.depositTx.status === 'PENDING'
                          ? 'SETTLING TO DYDX...'
                          : isQuoting
                            ? 'FETCHING QUOTES...'
                            : 'PROCESSING...'
                  }
                  isDisabled={isButtonDisabled}
                  isError={!!(activeSession?.error || setupError)}
                  icon={
                    !activeSession ? (
                      hasPendingSession ? (
                        <Lock size={18} className="animate-pulse" />
                      ) : buttonLabel === 'START BRIDGE' ? (
                        <ArrowUpRight size={18} />
                      ) : undefined
                    ) : undefined
                  }
                  onClick={handleActionClick}
                  className={`py-4 rounded-xl text-md font-bold tracking-widest shadow-xl uppercase ${customButtonClass}`}
                />
              </ActionGuard>
            </div>
          )}
      </div>

      {/* ── Inline Pending Sessions List (shown on setup form when previous sessions exist) ── */}
      {!activeSession && sessions.filter(s => s.phase !== 'DONE').length > 0 && (
        <div className="space-y-3 mt-4 border-t border-divider/40 pt-4">
          {(() => {
            const pendingSessions = sessions.filter(s => s.phase !== 'DONE');
            const displayedSessions = showAllSessions ? pendingSessions : pendingSessions.slice(0, 2);
            
            return (
              <>
                {displayedSessions.map(s => {
                  const chain = evmChains.find(c => c.chainId === s.destinationChainId);
                  const isPendingOnChain =
                    (s.swapTx?.hash && s.swapTx?.status === 'PENDING') ||
                    (s.bridgeTx?.hash && s.bridgeTx?.status === 'PENDING') ||
                    (s.depositTx?.hash && s.depositTx?.status === 'PENDING');
                  const isSafeToClear = !isPendingOnChain;
                  
                  const getStepLabel = () => {
                    if (s.phase === 'SWAP') return 'Swapping';
                    if (s.phase === 'BRIDGE') {
                      return s.bridgeTx?.status === 'PENDING' ? 'Crossing Bridge' : 'Ready to Bridge';
                    }
                    if (s.phase === 'DEPOSIT') {
                      return s.depositTx?.status === 'PENDING' ? 'Settling' : 'Ready to Settle';
                    }
                    return s.phase;
                  };

                  return (
                    <div 
                      key={s.id}
                      className="rounded-2xl border animate-fade-in p-3" 
                      style={{ 
                        borderColor: 'var(--color-border)', 
                        background: 'var(--color-bg-tertiary)'
                      }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Left Column: Title, Transfer Details, Started Time, Micro Step Dots */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          {/* Active Transfer Title */}
                          <div className="flex items-center gap-1.5">
                            {isPendingOnChain ? (
                              <RefreshCw size={11} className="text-brand animate-spin" style={{ animationDuration: '2s' }} />
                            ) : (
                              <Clock size={11} className="text-brand" />
                            )}
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--color-text-primary)' }}>
                              Active Transfer
                            </span>
                          </div>

                          {/* Transfer Description */}
                          <div className="flex items-center gap-2 min-w-0 mt-0.5">
                            <div className="relative flex-shrink-0">
                              <img src={USDC_LOGO_URL} className="w-5 h-5 rounded-full" alt="USDC" />
                              {chain?.logoURI && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border flex items-center justify-center p-0.5"
                                  style={{ borderColor: 'var(--color-bg-secondary)', background: 'var(--color-bg-primary)' }}>
                                  <img src={chain.logoURI} className="w-full h-full object-contain rounded-full" alt="" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] font-black truncate" style={{ color: 'var(--color-text-primary)' }}>
                              {s.inputAmount} {s.inputTokenSymbol} → {chain?.name || 'EVM'} → dYdX
                            </span>
                          </div>

                          {/* Started Time and Micro Step Dots */}
                          <div className="flex items-center gap-2.5 mt-0.5">
                            <span className="text-[8px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                              Started {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            
                            {/* Micro step dots */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {s.inputTokenSymbol !== 'USDC' && (
                                <>
                                  <div
                                    className="w-1.2 h-1.2 rounded-full transition-colors"
                                    style={{
                                      background: s.swapTx?.status === 'SUCCESS'
                                        ? 'var(--color-success)'
                                        : s.phase === 'SWAP'
                                          ? 'var(--color-brand)'
                                          : 'var(--color-text-muted)',
                                      opacity: s.phase === 'SWAP' ? 1 : 0.4,
                                    }}
                                  />
                                  <div className="w-2 h-0" style={{ borderTop: '1px dashed var(--color-border)' }} />
                                </>
                              )}
                              <div
                                className="w-1.2 h-1.2 rounded-full transition-colors"
                                style={{
                                  background: s.bridgeTx?.status === 'SUCCESS'
                                    ? 'var(--color-success)'
                                    : s.phase === 'BRIDGE'
                                      ? 'var(--color-brand)'
                                      : 'var(--color-text-muted)',
                                  opacity: s.phase === 'BRIDGE' ? 1 : (s.bridgeTx?.status === 'SUCCESS' ? 1 : 0.3),
                                }}
                              />
                              <div className="w-2 h-0" style={{ borderTop: '1px dashed var(--color-border)' }} />
                              <div
                                className="w-1.2 h-1.2 rounded-full transition-colors"
                                style={{
                                  background: s.depositTx?.status === 'SUCCESS'
                                    ? 'var(--color-success)'
                                    : s.phase === 'DEPOSIT'
                                      ? 'var(--color-brand)'
                                      : 'var(--color-text-muted)',
                                  opacity: s.phase === 'DEPOSIT' ? 1 : (s.depositTx?.status === 'SUCCESS' ? 1 : 0.3),
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Status pill, Buttons, and Warning if pending */}
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {/* Status Pill */}
                          <span
                            className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{
                              background: 'color-mix(in srgb, var(--color-brand) 12%, transparent)',
                              color: 'var(--color-brand)',
                            }}
                          >
                            {getStepLabel()}
                          </span>

                          {/* Inline Action Buttons */}
                          <div className="flex items-center gap-1.5 mt-1">
                            <button
                              onClick={() => {
                                if (isSafeToClear) {
                                  setRestoreInputsOnClear(false);
                                  setSessionToClear(s.id);
                                }
                              }}
                              disabled={!isSafeToClear}
                              className="w-[72px] h-[28px] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.98]"
                              style={{
                                background: 'transparent',
                                color: isSafeToClear ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                                border: '1px solid var(--color-border)',
                                cursor: isSafeToClear ? 'pointer' : 'not-allowed',
                                opacity: isSafeToClear ? 1 : 0.5,
                              }}
                            >
                              Clear
                            </button>
                            <button
                              onClick={() => {
                                updateSession(s.id, { error: null });
                                setActiveSessionId(s.id);
                              }}
                              className="w-[72px] h-[28px] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.98] hover:brightness-110"
                              style={{
                                background: 'var(--color-brand)',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              Resume
                            </button>
                          </div>

                          {!isSafeToClear && (
                            <span className="text-[7px] font-black uppercase tracking-wider text-right block mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, transparent)' }}>
                              ⚠ Pending on-chain
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {pendingSessions.length > 2 && (
                  <div className="flex justify-center mt-1">
                    <button
                      onClick={() => setShowAllSessions(prev => !prev)}
                      className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all active:scale-[0.98] hover:brightness-110 flex items-center justify-center gap-1"
                      style={{
                        background: 'transparent',
                        color: 'var(--color-brand)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{showAllSessions ? 'Show Less' : `See All (${pendingSessions.length})`}</span>
                      <ChevronDown 
                        size={12} 
                        className={`transition-transform duration-200 ${showAllSessions ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>

      <ConfirmationModal
        isOpen={sessionToClear !== null}
        title="Clear Active Transfer"
        message="Are you sure you want to clear this active transfer? This action cannot be undone."
        confirmText="Clear"
        cancelText="Cancel"
        confirmButtonType="danger"
        onConfirm={() => {
          if (sessionToClear) {
            const targetSession = sessions.find(s => s.id === sessionToClear);
            if (targetSession && restoreInputsOnClear) {
              setInputAmount(targetSession.inputAmount);
              const token = stellarAssets.find(a => a.symbol === targetSession.inputTokenSymbol);
              if (token) setInputToken(token);
              const chain = evmChains.find(c => c.chainId === targetSession.destinationChainId);
              if (chain) setDestinationChain(chain);
              setFeePaymentMethod(targetSession.feePaymentMethod);
            }
            dismissSession(sessionToClear);
            setSessionToClear(null);
            setRestoreInputsOnClear(false);
          }
        }}
        onCancel={() => {
          setSessionToClear(null);
          setRestoreInputsOnClear(false);
        }}
      />
    </div>
  );
};

export default StellarDydxOrchestrator;