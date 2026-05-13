import React, { useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
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
  ShieldCheck,
  ExternalLink,
  ArrowLeft
} from 'lucide-react';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { AmmSwapService } from '../../../../steallr/service/ammSwapService';
import { signAndSubmitTransaction } from '../../../../steallr/utils/transactionService';
import {
  getSupportedTokens,
  getBridgeQuote as getStellarBridgeQuote,
  prepareStellarToEvmRawTransaction,
  STELLAR_NETWORK_PASSPHRASE
} from '../../../../steallr/service/allbridgeService';
import { parseSwapError } from '../../../utils/swapErrorHandler';
import { useDydxDeposit } from '../../../../dydx/hooks/useDydxDeposit';
import { ChainSymbol, FeePaymentMethod, Messenger } from '@allbridge/bridge-core-sdk';
import { useAssetSelectorModal } from '../../../../commonfeature/components/useAssetSelectorModal';
import { getChainById, getEvmChainsForNetwork, type ChainConfig } from '../../../utils/Chainregistry';
import * as ChainUrlHelpers from '../../../utils/ChainUrlHelpers';
import TransactionButton from '../../../../commonfeature/components/TransactionButton';
import { portfolioUtils } from '../../../../walletconnect/utils/portfolioUtils';
import * as StellarSDK from '@stellar/stellar-sdk';
import { addLocalTransaction } from '../../../../evm/service/localTransactionService';
import { storeSwapOrder, getTransactionStatus } from '../../../../evm/service/evmTransactionStatusService';
import { useNotificationStore } from '../../../../../store/notificationStore';
import { useTransactionTracker, useTransactionStore } from '../../../../dydx/hooks/useTransactionTracker';
import { ActionGuard } from '../../../../commonfeature/components/ActionGuard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STELLAR_CHAIN_ID = 'pubnet';
const BRIDGE_STEP_KEY = 'stellar_dydx_bridge_step';
const DEFAULT_SLIPPAGE = 1.0;
const ARBITRUM_CHAIN_ID = 42161;
const USDC_LOGO_URL =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png';
const DYDX_LOGO_URL =
  'https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sanitizeAmount = (val: any, decimals: number = 7): string => {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val);
  const parts = str.split('.');
  if (parts.length <= 1) return str;
  return `${parts[0]}.${parts[1].slice(0, decimals)}`;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Phase = 'SETUP' | 'SWAP' | 'BRIDGE' | 'DEPOSIT' | 'DONE';
type TxStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

interface StellarToken {
  id: string;
  symbol: string;
  name: string;
  logoURI?: string;
  balance: string;
  decimals: number;
  isNative: boolean;
  asset: StellarSDK.Asset;
  chainId: string;
  address: string;
  hasTrustline?: boolean;
}

interface SwapQuote {
  estimatedOutput: string;
  minimumOutput?: string;
  priceImpact?: number;
  inputAmount?: string;
  fromAsset?: { code: string };
  path?: { path: Array<{ code: string }> };
  [key: string]: unknown;
}

interface BridgeQuote {
  amountToBeReceived: string;
  exchangeRate?: string | number;
  transferTimeMs?: number;
  feeOptions: {
    stablecoin?: { float: string | number };
    native?: { float: string | number };
  };
  sourceToken?: { chainName?: string };
  destinationToken?: { chainName?: string; symbol?: string };
  [key: string]: unknown;
}

interface DepositQuote {
  receivedAmount?: number;
  estimatedDurationSeconds?: number;
  estimatedTime?: string;
  fee?: number;
  usd_amount_in?: number;
  usd_amount_out?: number;
  usdAmountOut?: string | number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Transaction state — grouped to avoid sync issues between hash + status
// ---------------------------------------------------------------------------
interface TxState {
  hash: string | null;
  status: TxStatus | null;
}

interface TxGroup {
  swap: TxState;
  bridge: TxState;
  deposit: TxState;
}

type TxAction =
  | { type: 'SET_SWAP'; hash: string }
  | { type: 'SET_SWAP_STATUS'; status: TxStatus | null }
  | { type: 'SET_BRIDGE'; hash: string }
  | { type: 'SET_BRIDGE_STATUS'; status: TxStatus | null }
  | { type: 'SET_DEPOSIT'; hash: string }
  | { type: 'SET_DEPOSIT_STATUS'; status: TxStatus | null }
  | { type: 'RESET' };

const initialTxState: TxGroup = {
  swap: { hash: null, status: null },
  bridge: { hash: null, status: null },
  deposit: { hash: null, status: null },
};

function txReducer(state: TxGroup, action: TxAction): TxGroup {
  switch (action.type) {
    case 'SET_SWAP':
      return { ...state, swap: { hash: action.hash, status: 'PENDING' } };
    case 'SET_SWAP_STATUS':
      return { ...state, swap: { ...state.swap, status: action.status } };
    case 'SET_BRIDGE':
      return { ...state, bridge: { hash: action.hash, status: 'PENDING' } };
    case 'SET_BRIDGE_STATUS':
      return { ...state, bridge: { ...state.bridge, status: action.status } };
    case 'SET_DEPOSIT':
      return { ...state, deposit: { hash: action.hash, status: 'PENDING' } };
    case 'SET_DEPOSIT_STATUS':
      return { ...state, deposit: { ...state.deposit, status: action.status } };
    case 'RESET':
      return initialTxState;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Shimmer
// ---------------------------------------------------------------------------
const Shimmer: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const StellarDydxOrchestrator: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const assetParam = searchParams.get('asset');

  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network) as 'mainnet' | 'testnet';

  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarAddress = stellarWallet?.address;
  const evmAddress = evmWallet?.address;

  // Flow state
  const [phase, setPhase] = useState<Phase>('SETUP');
  const [destinationChain, setDestinationChain] = useState<ChainConfig | null>(null);
  const [showNetworkSelector, setShowNetworkSelector] = useState(false);

  // Input state
  const [inputToken, setInputToken] = useState<StellarToken | null>(null);
  const [inputAmount, setInputAmount] = useState<string>('');
  const [stellarAssets, setStellarAssets] = useState<StellarToken[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);
  const [intermediateAmount, setIntermediateAmount] = useState<string | null>(null);

  // Quotes
  const [isQuoting, setIsQuoting] = useState(false);
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [bridgeQuote, setBridgeQuote] = useState<BridgeQuote | null>(null);
  const [depositQuote, setDepositQuote] = useState<DepositQuote | null>(null);
  const [rawQuotes, setRawQuotes] = useState<{ swap: SwapQuote | null; bridge: BridgeQuote | null; dydx: DepositQuote | null } | null>(null);

  // Restore helpers
  const [restoredTokenSymbol, setRestoredTokenSymbol] = useState<string | null>(null);
  const restoredTokenSymbolRef = useRef<string | null>(null);
  const [isRestored, setIsRestored] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(false);
  const [feePaymentMethod, setFeePaymentMethod] = useState<FeePaymentMethod>(FeePaymentMethod.WITH_STABLECOIN);
  const [nativeBalance, setNativeBalance] = useState<string>('0');
  const { showToast } = useNotificationStore();

  // hash + status always updated atomically
  const [txState, dispatchTx] = useReducer(txReducer, initialTxState);
  const { swap: swapTx, bridge: bridgeTx, deposit: depositTx } = txState;

  const { openAssetSelector } = useAssetSelectorModal();
  const { getRoute, deposit, isLoading: dydxLoading } = useDydxDeposit();
  const [showFullDetails, setShowFullDetails] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dydxTracker = useTransactionTracker('deposit');
  const setDepositTxInStore = useTransactionStore(state => state.setDepositTx);
  const isUsdc = inputToken?.symbol?.toUpperCase() === 'USDC';
  const assetMap = useMemo(
    () => Object.fromEntries(stellarAssets.map(a => [a.symbol, a])),
    [stellarAssets]
  );

  // ---------------------------------------------------------------------------
  // Restore from localStorage on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BRIDGE_STEP_KEY);
      let parsed: any = null;
      if (saved) {
        try {
          const sanitized = saved.trim().replace(/”|“/g, '"');
          parsed = JSON.parse(sanitized);
        } catch (err) {
          console.error('Failed to parse bridge step', err);
        }
      }

      if (parsed && parsed.phase && parsed.phase !== 'SETUP' && parsed.phase !== 'DONE') {
        setPhase(parsed.phase);
        if (parsed.inputAmount) setInputAmount(sanitizeAmount(parsed.inputAmount));
        if (parsed.destinationChainId) {
          const chain = getEvmChainsForNetwork(currentNetwork).find(
            c => String(c.chainId) === String(parsed.destinationChainId)
          );
          if (chain) setDestinationChain(chain);
        }
        if (parsed.swapTxHash)
          dispatchTx({ type: 'SET_SWAP', hash: parsed.swapTxHash });
        if (parsed.swapStatus)
          dispatchTx({ type: 'SET_SWAP_STATUS', status: parsed.swapStatus });
        if (parsed.bridgeTxHash)
          dispatchTx({ type: 'SET_BRIDGE', hash: parsed.bridgeTxHash });
        if (parsed.bridgeStatus)
          dispatchTx({ type: 'SET_BRIDGE_STATUS', status: parsed.bridgeStatus });
        if (parsed.depositTxHash)
          dispatchTx({ type: 'SET_DEPOSIT', hash: parsed.depositTxHash });
        if (parsed.depositStatus)
          dispatchTx({ type: 'SET_DEPOSIT_STATUS', status: parsed.depositStatus });
        if (parsed.intermediateAmount) setIntermediateAmount(parsed.intermediateAmount);
        if (parsed.inputTokenSymbol) {
          setRestoredTokenSymbol(parsed.inputTokenSymbol);
          restoredTokenSymbolRef.current = parsed.inputTokenSymbol;
        }
        if (parsed.depositTxHash && parsed.depositStatus === 'PENDING') {
          const targetChainId = String(parsed.destinationChainId || '1');
          setDepositTxInStore({
            txHash: parsed.depositTxHash,
            chainId: targetChainId,
            startedAt: Date.now(),
            status: 'pending',
            stepLabel: 'Resuming settlement...',
          });
        } else if (!parsed.depositTxHash && (parsed.phase === 'DEPOSIT' || (parsed.bridgeStatus === 'SUCCESS' && parsed.phase === 'BRIDGE'))) {
          const storeTx = useTransactionStore.getState().depositTx;
          if (storeTx && storeTx.txHash) {
            dispatchTx({ type: 'SET_DEPOSIT', hash: storeTx.txHash });
            dispatchTx({ type: 'SET_DEPOSIT_STATUS', status: storeTx.status === 'success' ? 'SUCCESS' : 'PENDING' });
          }
        }

        // QA Fix-up: If a previous step was successful but the phase wasn't advanced, advance it now
        if (parsed.swapStatus === 'SUCCESS' && parsed.phase === 'SWAP') setPhase('BRIDGE');
        if (parsed.bridgeStatus === 'SUCCESS' && parsed.phase === 'BRIDGE') setPhase('DEPOSIT');

        // QA Safety: Clear future step statuses if we are in an earlier phase
        if (parsed.phase === 'SWAP') {
          dispatchTx({ type: 'SET_BRIDGE_STATUS', status: null });
          dispatchTx({ type: 'SET_DEPOSIT_STATUS', status: null });
        }
        if (parsed.phase === 'BRIDGE') {
          dispatchTx({ type: 'SET_DEPOSIT_STATUS', status: null });
        }
      } else {
        const storeTx = useTransactionStore.getState().depositTx;
        if (storeTx && storeTx.status === 'pending' && storeTx.txHash) {
          setPhase('DEPOSIT');
          dispatchTx({ type: 'SET_DEPOSIT', hash: storeTx.txHash });
          dispatchTx({ type: 'SET_DEPOSIT_STATUS', status: 'PENDING' });
          if (storeTx.chainId) {
            const chain = getEvmChainsForNetwork(currentNetwork).find(
              c => String(c.chainId) === String(storeTx.chainId)
            );
            if (chain) setDestinationChain(chain);
          }
        }
      }
    } catch (err) {
      console.error('Fatal error restoring bridge state', err);
    } finally {
      setIsRestored(true);
    }
  }, [currentNetwork]);

  // ---------------------------------------------------------------------------
  // Sync with dYdX tracker for the final deposit step
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!depositTx.hash || phase !== 'DEPOSIT') return;

    const s = dydxTracker.overallState;
    console.debug('[Deposit] dYdX tracker state:', s);

    if (s === 'STATE_COMPLETED_SUCCESS') {
      dispatchTx({ type: 'SET_DEPOSIT_STATUS', status: 'SUCCESS' });
      setPhase('DONE');
    } else if (
      s === 'STATE_COMPLETED_ERROR' ||
      s === 'STATE_ABANDONED'
    ) {
      dispatchTx({ type: 'SET_DEPOSIT_STATUS', status: 'FAILED' });
    } else if (
      s === 'STATE_PENDING' ||
      s === 'STATE_SUBMITTED' ||
      dydxTracker.isLoading
    ) {
      dispatchTx({ type: 'SET_DEPOSIT_STATUS', status: 'PENDING' });
    }
  }, [dydxTracker.overallState, dydxTracker.isLoading, depositTx.hash, phase]);

  // ---------------------------------------------------------------------------
  // Restore token once asset list is ready
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (restoredTokenSymbol && stellarAssets.length > 0) {
      const found = stellarAssets.find(
        a => a.symbol.toUpperCase() === restoredTokenSymbol.toUpperCase()
      );
      if (found) {
        setInputToken(found);
        setRestoredTokenSymbol(null);
        restoredTokenSymbolRef.current = null;
      }
    }
  }, [restoredTokenSymbol, stellarAssets]);

  // ---------------------------------------------------------------------------
  // Persist step progress to localStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isRestored) return;

    const isFullyTerminal =
      phase === 'DONE' ||
      (swapTx.status === 'FAILED' && !bridgeTx.hash && !depositTx.hash) ||
      (bridgeTx.status === 'FAILED' && !depositTx.hash) ||
      depositTx.status === 'FAILED';

    if (isFullyTerminal && phase !== 'DONE') {
      console.debug('[Bridge] Terminal failure state — preserving localStorage for user review');
    }

    if (phase === 'DONE') {
      console.debug('[Bridge] DONE — clearing localStorage');
      localStorage.removeItem(BRIDGE_STEP_KEY);
    } else if (phase !== 'SETUP') {
      console.debug('[Bridge] Persisting bridge state', phase, { swapTx, bridgeTx, depositTx });
      try {
        localStorage.setItem(
          BRIDGE_STEP_KEY,
          JSON.stringify({
            phase,
            inputAmount,
            inputTokenSymbol: inputToken?.symbol,
            destinationChainId: destinationChain?.chainId,
            swapTxHash: swapTx.hash,
            swapStatus: swapTx.status,
            bridgeTxHash: bridgeTx.hash,
            bridgeStatus: bridgeTx.status,
            depositTxHash: depositTx.hash,
            depositStatus: depositTx.status,
            intermediateAmount,
          })
        );
      } catch (err) {
        console.error('[Bridge] Failed to persist state', err);
      }
    }
  }, [
    phase,
    inputAmount,
    inputToken,
    destinationChain,
    swapTx,
    bridgeTx,
    depositTx,
    intermediateAmount,
    isRestored,
  ]);

  // ---------------------------------------------------------------------------
  // Bridge status polling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!bridgeTx.hash || bridgeTx.status !== 'PENDING') return;

    let cancelled = false;

    const checkStatus = async () => {
      try {
        console.debug('[Bridge] Polling backend bridge status for hash', bridgeTx.hash);
        const res = await getTransactionStatus({
          walletType: 'SRB',
          txHash: bridgeTx.hash!,
          provider: 'ALLBRIDGE',
        });
        if (cancelled) return;

        console.debug('[Bridge] Backend status response', { receive: !!res.receive, isSuspended: res.isSuspended, signaturesCount: res.signaturesCount });

        if (res.receive && res.receive.txId) {
          const confirmedAmount = res.receive.amountFormatted?.toString();
          console.debug('[Bridge] Bridge confirmed — receive amount:', confirmedAmount);
          dispatchTx({ type: 'SET_BRIDGE_STATUS', status: 'SUCCESS' });
          if (confirmedAmount) {
            setIntermediateAmount(confirmedAmount);
          }
          if (phase === 'BRIDGE') setPhase('DEPOSIT');
        } else if (res.isSuspended) {
          console.debug('[Bridge] Bridge suspended — marking FAILED');
          dispatchTx({ type: 'SET_BRIDGE_STATUS', status: 'FAILED' });
        }
      } catch (err) {
        console.error('[Bridge] Backend status poll error', err);
        if (!cancelled) consecutiveBridgeErrors.current += 1;
        if (!cancelled && consecutiveBridgeErrors.current >= 3) {
          setError('Bridge status check failed repeatedly. Please refresh or check the explorer.');
        }
      }
    };

    consecutiveBridgeErrors.current = 0;
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bridgeTx.hash, bridgeTx.status, phase]);

  const consecutiveBridgeErrors = useRef(0);

  // ---------------------------------------------------------------------------
  // Set default destination chain
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isRestored && !destinationChain && phase === 'SETUP') {
      const evmChains = getEvmChainsForNetwork(currentNetwork);
      const arb = evmChains.find(c => c.chainId === ARBITRUM_CHAIN_ID || c.slug === 'arb');
      setDestinationChain(arb || evmChains[0] || null);
    }
  }, [currentNetwork, destinationChain, isRestored, phase]);

  // ---------------------------------------------------------------------------
  // Init AMM service
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const config = getStellarConfig(currentNetwork);
      const service = new AmmSwapService(
        config.horizonUrl,
        config.networkPassphrase,
        config.chainId
      );
      setAmmService(service);
    } catch (err) {
      console.error('Failed to init AmmSwapService:', err);
    }
  }, [currentNetwork]);

  // ---------------------------------------------------------------------------
  // Fetch Stellar assets
  // ---------------------------------------------------------------------------
  const isFetchingAssetsRef = useRef(false);

  const fetchStellarAssets = useCallback(async () => {
    if (!ammService || !stellarAddress || isFetchingAssetsRef.current) return;
    try {
      isFetchingAssetsRef.current = true;
      setLoadingAssets(true);
      const { tokens: balances, subentryCount } = await ammService.getAssetsWithBalances(
        stellarAddress
      );
      const reserve = 1 + subentryCount * 0.5;
      const mapped: StellarToken[] = balances
        .filter((b: any) => b && b.asset)
        .map((b: any) => {
          let balanceToUse = b.balance || '0';
          if (b.code === 'XLM') {
            balanceToUse = sanitizeAmount(Math.max(0, parseFloat(b.balance || '0') - reserve).toString());
          }
          const isNative =
            typeof b.asset.isNative === 'function' ? b.asset.isNative() : b.code === 'XLM';
          return {
            id: `stellar-${b.code}`,
            symbol: b.code,
            name: b.name || b.code,
            logoURI: b.icon,
            balance: balanceToUse,
            decimals: b.decimals || 7,
            isNative,
            asset: b.asset,
            chainId: STELLAR_CHAIN_ID,
            address: isNative
              ? 'native'
              : typeof b.asset.getIssuer === 'function'
                ? b.asset.getIssuer()
                : b.issuer,
            hasTrustline: b.hasTrustline,
          };
        });

      setStellarAssets(mapped);

      const xlm = mapped.find(m => m.symbol === 'XLM');
      if (xlm) setNativeBalance(xlm.balance);

      setInputToken(prev => {
        if (prev) {
          const updated = mapped.find(m => m.symbol === prev.symbol);
          return updated ?? prev;
        }
        if (restoredTokenSymbolRef.current) return null;
        return xlm ?? mapped[0] ?? null;
      });
    } catch (err) {
      console.error('Failed to fetch Stellar balances:', err);
    } finally {
      isFetchingAssetsRef.current = false;
      setLoadingAssets(false);
    }
  }, [ammService, stellarAddress]);

  useEffect(() => {
    fetchStellarAssets();
  }, [fetchStellarAssets]);

  // ---------------------------------------------------------------------------
  // Asset selection via URL params / location state
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'SETUP') return;

    const symbolToMatch =
      assetParam ||
      location.state?.selectedAsset?.symbol ||
      location.state?.selectedAsset?.code;
    if (symbolToMatch && stellarAssets.length > 0) {
      const found = stellarAssets.find(
        a => a.symbol.toUpperCase() === symbolToMatch.toUpperCase()
      );
      if (found && inputToken?.symbol !== found.symbol) setInputToken(found);
    }
  }, [assetParam, location.state, stellarAssets, inputToken, phase]);

  const tokenBalance = useMemo(() => {
    if (!inputToken) return '0';
    return sanitizeAmount(inputToken.balance || '0');
  }, [inputToken]);

  const getStellarAsset = (token: StellarToken | null): StellarSDK.Asset | null => {
    if (!token) return null;
    if (token.asset) return token.asset;
    if (token.isNative || token.symbol === 'XLM') return StellarSDK.Asset.native();
    if (token.address && token.address !== 'native') {
      return new StellarSDK.Asset(token.symbol, token.address);
    }
    return null;
  };
  const fetchAllQuotes = useCallback(
    async (amount: string, signal: AbortSignal) => {
      if (!amount || parseFloat(amount) <= 0 || !inputToken || !ammService || !destinationChain) {
        setSwapQuote(null);
        setBridgeQuote(null);
        setDepositQuote(null);
        setRawQuotes(null);
        return;
      }

      setIsQuoting(true);
      setError(null);

      try {
        let usdcAmountStellar = amount;
        let finalSwapQuote: SwapQuote | null = null;

        const inputAsset = getStellarAsset(inputToken);
        if (!inputAsset) throw new Error('Invalid input token');

        const shouldFetchSwapQuote = !isUsdc && (phase === 'SETUP' || phase === 'SWAP');
        const shouldFetchBridgeData = phase !== 'DEPOSIT';

        const [swapResult, allTokens] = await Promise.all([
          shouldFetchSwapQuote
            ? (async () => {
              const usdcAsset = stellarAssets.find(a => a.symbol === 'USDC');
              if (!usdcAsset) throw new Error('USDC asset not found on Stellar');
              const targetAsset = getStellarAsset(usdcAsset);
              if (!targetAsset) throw new Error('Invalid target token');
              return ammService.getSwapQuote(inputAsset, targetAsset, sanitizeAmount(amount), {
                slippageTolerance: DEFAULT_SLIPPAGE,
              });
            })()
            : Promise.resolve(null),
          shouldFetchBridgeData ? getSupportedTokens() : Promise.resolve(null),
        ]);

        if (signal.aborted) return;

        if (swapResult) {
          finalSwapQuote = swapResult as unknown as SwapQuote;
          usdcAmountStellar = sanitizeAmount(finalSwapQuote.estimatedOutput);
        } else if (isUsdc) {
          usdcAmountStellar = amount;
        } else if (intermediateAmount) {
          usdcAmountStellar = intermediateAmount;
        } else if (phase === 'BRIDGE' || phase === 'DEPOSIT') {
          const usdcAsset = stellarAssets.find(a => a.symbol === 'USDC');
          if (usdcAsset && parseFloat(usdcAsset.balance) > 0) {
            usdcAmountStellar = usdcAsset.balance;
          }
        }
        setSwapQuote(finalSwapQuote);

        let bq = bridgeQuote;
        if (shouldFetchBridgeData && allTokens) {
          const dstSymbol = (
            destinationChain.symbol === 'BNB' ? ChainSymbol.BSC : destinationChain.symbol
          ) as ChainSymbol;
          const srcUsdc = allTokens.find(
            t => t.chainSymbol === ChainSymbol.SRB && t.symbol === 'USDC'
          );
          const dstUsdc = allTokens.find(
            t => t.chainSymbol === dstSymbol && t.symbol === 'USDC'
          );
          if (!srcUsdc || !dstUsdc) throw new Error('Bridge tokens not found for selected chain');

          bq = (await getStellarBridgeQuote({
            amount: sanitizeAmount(usdcAmountStellar),
            sourceToken: srcUsdc,
            destinationToken: dstUsdc,
            slippageTolerance: DEFAULT_SLIPPAGE,
          })) as unknown as BridgeQuote;
          if (signal.aborted) return;
          setBridgeQuote(bq);
        }

        const dstUsdcAmount = bq?.amountToBeReceived || intermediateAmount;
        if (!dstUsdcAmount) throw new Error('Could not determine deposit amount');

        const dr = await getRoute(
          'USDC',
          parseFloat(dstUsdcAmount.toString()),
          destinationChain.chainId,
          false
        );
        if (signal.aborted) return;
        if (!dr) throw new Error('No deposit route to dYdX found. Try another chain.');
        setDepositQuote(dr as DepositQuote);

        setRawQuotes({ swap: finalSwapQuote, bridge: bq, dydx: dr as DepositQuote });
      } catch (err: any) {
        if (signal.aborted) return;
        console.error('Quote error:', err);
        setError(err.message || 'Failed to fetch quotes');
      } finally {
        setIsQuoting(false);
      }
    },
    [inputToken, isUsdc, ammService, stellarAssets, destinationChain, getRoute, phase, intermediateAmount]
  );

  // ---------------------------------------------------------------------------
  // Quote trigger on input change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isRestored || phase === 'DONE') return;
    if (phase === 'SETUP' && (!inputAmount || parseFloat(inputAmount) <= 0)) return;
    if (phase === 'SWAP' && swapTx.hash && swapTx.status !== 'FAILED') return;
    if (phase === 'BRIDGE' && bridgeTx.hash && bridgeTx.status !== 'FAILED') return;
    if (phase === 'DEPOSIT' && depositTx.hash && depositTx.status !== 'FAILED') return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!isQuoting && !loadingStep) {
        fetchAllQuotes(inputAmount, controller.signal);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    inputAmount,
    phase,
    inputToken,
    destinationChain,
    fetchAllQuotes,
    isRestored,
    swapTx.hash,
    bridgeTx.hash,
    depositTx.hash,
  ]);

  // ---------------------------------------------------------------------------
  // Background quote refresh every 30s
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (
      phase === 'DONE' ||
      (phase === 'SETUP' && (!inputAmount || parseFloat(inputAmount) <= 0))
    )
      return;

    const controller = new AbortController();
    const interval = setInterval(() => {
      if (!isQuoting && !loadingStep) {
        fetchAllQuotes(inputAmount, controller.signal);
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [phase, inputAmount, fetchAllQuotes, loadingStep]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleMaxAmount = () => {
    if (tokenBalance && parseFloat(tokenBalance) > 0) setInputAmount(sanitizeAmount(tokenBalance));
  };

  const executeSwap = async (): Promise<boolean> => {
    if (!ammService || !stellarAddress || !swapQuote || !inputToken) return false;
    try {
      const provider = getProvider(WalletType.STELLAR) as any;
      const inputAsset = getStellarAsset(inputToken);
      if (!inputAsset) throw new Error('Invalid input token');

      const tx = await ammService.buildSwapTransaction(stellarAddress, swapQuote as any, {
        slippageTolerance: DEFAULT_SLIPPAGE,
      });
      const hash = await ammService.executeSwapWithWalletConnect(tx, provider);

      addLocalTransaction({
        hash,
        chainId: STELLAR_CHAIN_ID,
        type: 'swap',
        timestamp: Date.now(),
        description: `Swap ${inputAmount} ${inputToken.symbol} to USDC`,
        status: 'pending',
        from: stellarAddress,
        network: currentNetwork,
      });

      dispatchTx({ type: 'SET_SWAP', hash });

      //actual confirmed USDC balance after swap
      await fetchStellarAssets();
      const freshUsdcBalance = isFetchingAssetsRef.current
        ? swapQuote.estimatedOutput
        : (assetMap['USDC']?.balance ?? swapQuote.estimatedOutput);
      setIntermediateAmount(freshUsdcBalance);

      dispatchTx({ type: 'SET_SWAP_STATUS', status: 'SUCCESS' });
      showToast({
        type: 'STELLAR',
        title: 'Swap Successful',
        message: `Exchanged ${inputAmount} ${inputToken.symbol} for USDC on Stellar.`,
      });
      return true;
    } catch (err: any) {
      setError(parseSwapError(err));
      return false;
    }
  };

  const executeBridge = async (): Promise<boolean> => {
    try {
      setLoadingStep(true);
      const allTokens = await getSupportedTokens();
      if (!destinationChain) throw new Error('Destination chain not selected');

      const dstSymbol = (
        destinationChain.symbol === 'BNB' ? ChainSymbol.BSC : destinationChain.symbol
      ) as ChainSymbol;
      const srcUsdc = allTokens.find(
        t => t.chainSymbol === ChainSymbol.SRB && t.symbol === 'USDC'
      );
      const dstUsdc = allTokens.find(
        t => t.chainSymbol === dstSymbol && t.symbol === 'USDC'
      );
      if (!srcUsdc || !dstUsdc) throw new Error('Bridge tokens not found');

      //confirmed on-chain USDC balance as bridge input to account for slippage
      const confirmedUsdcBalance = assetMap['USDC']?.balance;
      const bridgeInputAmount =
        isUsdc
          ? inputAmount
          : confirmedUsdcBalance || intermediateAmount || swapQuote?.estimatedOutput || inputAmount;

      const freshBridgeQuote = (await getStellarBridgeQuote({
        amount: sanitizeAmount(bridgeInputAmount),
        sourceToken: srcUsdc,
        destinationToken: dstUsdc,
        slippageTolerance: DEFAULT_SLIPPAGE,
      })) as unknown as BridgeQuote;
      setBridgeQuote(freshBridgeQuote);

      const xdr = await prepareStellarToEvmRawTransaction({
        amount: sanitizeAmount(bridgeInputAmount),
        sourceToken: freshBridgeQuote.sourceToken,
        destinationToken: freshBridgeQuote.destinationToken,
        fromAccountAddress: stellarAddress!,
        toAccountAddress: evmAddress!,
        network: currentNetwork,
        feePaymentMethod,
        messenger: Messenger.ALLBRIDGE,
        slippageTolerance: DEFAULT_SLIPPAGE,
      });

      const provider = getProvider(WalletType.STELLAR) as any;
      const result = await signAndSubmitTransaction({
        xdr,
        network: currentNetwork,
        networkPassphrase: STELLAR_NETWORK_PASSPHRASE[currentNetwork],
        provider,
        stellarAddress,
      });

      if (result.hash) {
        dispatchTx({ type: 'SET_BRIDGE', hash: result.hash });
        setIntermediateAmount(freshBridgeQuote.amountToBeReceived);

        const current = JSON.parse(localStorage.getItem(BRIDGE_STEP_KEY) || '{}');
        localStorage.setItem(BRIDGE_STEP_KEY, JSON.stringify({
          ...current,
          phase: 'BRIDGE',
          bridgeTxHash: result.hash,
          bridgeStatus: 'PENDING',
          intermediateAmount: freshBridgeQuote.amountToBeReceived,
          destinationChainId: destinationChain.chainId,
        }));
        console.debug('[Bridge] Hash saved to localStorage immediately:', result.hash);
      }

      if (!result.success) throw new Error(result.error || 'Transaction failed');

      addLocalTransaction({
        hash: result.hash!,
        chainId: STELLAR_CHAIN_ID,
        type: 'bridge',
        timestamp: Date.now(),
        description: `Bridge USDC to ${destinationChain.name}`,
        status: 'pending',
        from: stellarAddress,
        network: currentNetwork,
      });

      console.debug('[Bridge] Storing Allbridge bridge order to backend', result.hash);
      storeSwapOrder({
        txHash: result.hash!,
        walletAddress: evmAddress!,
        provider: 'ALLBRIDGE',
        fromChain: 'SRB',
        fromToken: 'USDC',
        toChain: destinationChain.symbol ?? '',
        toToken: 'USDC',
        amountIn: bridgeInputAmount,
        amountOut: freshBridgeQuote.amountToBeReceived,
      }).catch(err => console.error('[Bridge] Failed to store Allbridge order:', err));

      showToast({
        type: 'BRIDGE',
        title: 'Bridge Initiated',
        message: `Your USDC is crossing to ${destinationChain.name}. This usually takes ~2-15 minutes.`,
      });
      return true;
    } catch (err: any) {
      setError(parseSwapError(err));
      return false;
    } finally {
      setLoadingStep(false);
    }
  };

  const executeDeposit = async (): Promise<boolean> => {
    try {
      setError(null);

      const confirmedReceiveAmount = intermediateAmount
        ? parseFloat(intermediateAmount)
        : null;

      if (!confirmedReceiveAmount || confirmedReceiveAmount <= 0) {
        throw new Error(
          'Bridge has not confirmed the received amount yet. Please wait for bridge confirmation before depositing.'
        );
      }

      if (!destinationChain) {
        throw new Error('Destination chain not selected.');
      }

      console.debug('[Deposit] Using confirmed bridge receive amount:', confirmedReceiveAmount);

      const dr = await getRoute('USDC', confirmedReceiveAmount, destinationChain.chainId, true);
      if (!dr) throw new Error('Could not verify fresh deposit route. Please try again.');
      setDepositQuote(dr as DepositQuote);

      const res = await deposit('USDC', confirmedReceiveAmount, destinationChain.chainId, true, '1');
      if (res.success) {
        addLocalTransaction({
          hash: res.txHash!,
          chainId: destinationChain.chainId,
          type: 'bridge',
          timestamp: Date.now(),
          description: `Deposit USDC to dYdX from ${destinationChain.name}`,
          status: 'pending',
          from: evmAddress,
          network: currentNetwork,
        });
        dispatchTx({ type: 'SET_DEPOSIT', hash: res.txHash! });
        console.debug('[Deposit] Deposit tx submitted:', res.txHash);
        showToast({
          type: 'DYDX',
          title: 'Deposit Started',
          message: 'Settling funds to your dYdX trading account.',
        });
        return true;
      } else {
        setError(res.error || 'Deposit failed');
        return false;
      }
    } catch (err: any) {
      console.error('[Deposit] executeDeposit error:', err);
      setError(err.message || 'Deposit failed');
      return false;
    } finally {
      setLoadingStep(false);
    }
  };

  const handleBack = () => {
    if (phase === 'DONE') {
      handleReset();
      return;
    }

    // 1. Block navigation if a transaction is in-flight
    const isPending =
      swapTx.status === 'PENDING' ||
      bridgeTx.status === 'PENDING' ||
      depositTx.status === 'PENDING';

    if (isPending) {
      showToast({
        type: 'SYSTEM',
        title: 'Action Blocked',
        message: 'A transaction is currently in progress. Please wait for it to settle.',
      });
      return;
    }
    const fundsCommitted = swapTx.status === 'SUCCESS' || bridgeTx.status === 'SUCCESS' || depositTx.status === 'SUCCESS';

    if (phase === 'SWAP') {
      if (!swapTx.hash || swapTx.status === 'FAILED') {
        setPhase('SETUP');
      } else {
        showToast({ type: 'SYSTEM', title: 'Cannot Edit', message: 'Transaction already submitted. Use Reset if you are stuck.' });
      }
    } else if (phase === 'BRIDGE') {
      if (bridgeTx.status === 'SUCCESS') {
        setPhase('DEPOSIT');
      } else if (!bridgeTx.hash || bridgeTx.status === 'FAILED') {
        if (fundsCommitted && !isUsdc) {
          setPhase('SWAP');
          showToast({ type: 'SYSTEM', title: 'Funds Swapped', message: 'You have already swapped to USDC. You can retry the bridge step here.' });
        } else {
          setPhase(isUsdc ? 'SETUP' : 'SWAP');
        }
      }
    } else if (phase === 'DEPOSIT') {
      if (depositTx.status === 'SUCCESS') {
        setPhase('DONE');
      } else if (!depositTx.hash || depositTx.status === 'FAILED') {
        setPhase('BRIDGE');
      }
    }
  };

  const handleActionClick = async () => {
    if (!evmAddress || !stellarAddress) {
      setError('Please connect both Stellar and EVM wallets');
      return;
    }

    if (phase === 'SETUP') {
      const minXlmNeeded = feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY ? 5 : 1;
      if (parseFloat(nativeBalance) < minXlmNeeded) {
        setError(`Insufficient XLM for fees and gas. Please ensure you have at least ${minXlmNeeded} XLM available.`);
        return;
      }
      setPhase(isUsdc ? 'BRIDGE' : 'SWAP');
      return;
    }

    setLoadingStep(true);
    setError(null);

    try {
      if (phase === 'SWAP') {
        const ok = await executeSwap();
        if (ok) setPhase('BRIDGE');
      } else if (phase === 'BRIDGE') {
        await executeBridge();
      } else if (phase === 'DEPOSIT') {
        await executeDeposit();
      }
    } finally {
      setLoadingStep(false);
    }
  };

  const handleReset = () => {
    const hasActiveTx =
      (swapTx.status === 'PENDING') ||
      (bridgeTx.status === 'PENDING') ||
      (depositTx.status === 'PENDING');

    if (hasActiveTx) {
      showToast({
        type: 'SYSTEM',
        title: 'Cannot Reset',
        message: 'A transaction is in progress. Please wait for it to complete before resetting.',
      });
      return;
    }

    console.debug('[Bridge] User reset — clearing localStorage and all state');
    dydxTracker.acknowledge();
    setPhase('SETUP');
    setInputAmount('');
    setError(null);
    setRawQuotes(null);
    setSwapQuote(null);
    setBridgeQuote(null);
    setDepositQuote(null);
    setIntermediateAmount(null);
    dispatchTx({ type: 'RESET' });
    localStorage.removeItem(BRIDGE_STEP_KEY);
  };

  const isInsufficient = useMemo(() => {
    if (phase !== 'SETUP' && phase !== 'SWAP') return false;
    return parseFloat(inputAmount) > parseFloat(tokenBalance);
  }, [phase, inputAmount, tokenBalance]);

  const isInsufficientXlm = useMemo(() => {
    if (phase === 'DONE') return false;
    const minXlm = feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY ? 5 : 1;
    return parseFloat(nativeBalance) < minXlm;
  }, [phase, nativeBalance, feePaymentMethod]);

  // ---------------------------------------------------------------------------
  // Display state
  // ---------------------------------------------------------------------------
  const displayState = useMemo(() => {
    const stellarConfig = getStellarConfig(currentNetwork);

    if (phase === 'SETUP' || phase === 'SWAP') {
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
          amount: swapQuote?.estimatedOutput || (isUsdc ? inputAmount : '0.00'),
          logo: USDC_LOGO_URL,
        },
        title: 'Prepare USDC on Stellar',
      };
    }
    if (phase === 'BRIDGE') {
      const bridgeAmt = isUsdc ? inputAmount : intermediateAmount || swapQuote?.estimatedOutput || (assetMap['USDC']?.balance ?? '0.00');
      const isPending = bridgeTx.status !== 'SUCCESS';
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
          network: destinationChain?.name?.toUpperCase() || 'EVM',
          amount: bridgeQuote?.amountToBeReceived || bridgeAmt,
          logo: USDC_LOGO_URL,
          isPending,
        },
        title: isPending ? 'Funds Crossing Bridge...' : `Bridge to ${destinationChain?.name || 'EVM'}`,
      };
    }
    if (phase === 'DEPOSIT' || phase === 'DONE') {
      const depositAmt = bridgeQuote?.amountToBeReceived || intermediateAmount;
      return {
        top: {
          symbol: 'USDC',
          network: destinationChain?.name?.toUpperCase() || 'EVM',
          amount: depositAmt,
          logo: USDC_LOGO_URL,
          balance: depositAmt,
        },
        bottom: {
          symbol: 'USDC',
          network: 'DYDX',
          amount: depositQuote?.receivedAmount || depositAmt,
          logo: USDC_LOGO_URL,
        },
        title: phase === 'DONE' ? 'Transfer Successful' : 'Settle Funds to dYdX',
      };
    }
    return {
      top: {
        symbol: inputToken?.symbol,
        network: 'STELLAR',
        amount: inputAmount,
        logo: inputToken?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol || '', stellarConfig),
        balance: '0',
      },
      bottom: { symbol: 'USDC', network: 'DYDX', amount: depositQuote?.receivedAmount, logo: USDC_LOGO_URL },
      title: 'Transfer Complete',
    };
  }, [
    phase,
    isUsdc,
    inputAmount,
    inputToken,
    swapQuote,
    bridgeQuote,
    depositQuote,
    tokenBalance,
    destinationChain,
    currentNetwork,
    bridgeTx.status,
    intermediateAmount,
  ]);

  // ---------------------------------------------------------------------------
  // Button label
  // ---------------------------------------------------------------------------
  const buttonLabel = useMemo(() => {
    if (!evmAddress || !stellarAddress) return 'CONNECT WALLETS';
    if (!inputAmount || parseFloat(inputAmount) <= 0) return 'ENTER AMOUNT';
    if (isInsufficient) return 'INSUFFICIENT BALANCE';
    if (isInsufficientXlm) return 'INSUFFICIENT XLM FOR GAS';
    if (isQuoting) return 'FETCHING QUOTES...';

    const totalSteps = isUsdc ? 2 : 3;

    if (phase === 'SETUP') return 'START BRIDGE';
    if (phase === 'SWAP' && !isUsdc) return `SWAP TO USDC (1/${totalSteps})`;
    if (phase === 'BRIDGE') {
      if (bridgeTx.hash && bridgeTx.status === 'PENDING') return 'WAITING FOR BRIDGE CONFIRMATION...';
      if (bridgeTx.status === 'FAILED') return 'BRIDGE FAILED — RETRY';
      const step = isUsdc ? 1 : 2;
      return `BRIDGE TO ${destinationChain?.name?.toUpperCase() || 'EVM'} (${step}/${totalSteps})`;
    }
    if (phase === 'DEPOSIT') {
      if (bridgeTx.status !== 'SUCCESS') return 'WAITING FOR BRIDGE FUNDS...';
      if (depositTx.status === 'PENDING') return 'SETTLEMENT IN PROGRESS...';
      if (depositTx.status === 'FAILED') return 'DEPOSIT FAILED — RETRY';
      const step = isUsdc ? 2 : 3;
      return loadingStep ? 'REFRESHING ROUTE...' : `SETTLE TO DYDX (${step}/${totalSteps})`;
    }
    if (phase === 'DONE') return 'START NEW TRANSFER';

    return 'START';
  }, [
    evmAddress,
    stellarAddress,
    inputAmount,
    isInsufficient,
    isQuoting,
    phase,
    isUsdc,
    bridgeTx,
    depositTx.status,
    destinationChain,
    loadingStep,
  ]);

  const isButtonDisabled = useMemo(() => {
    if (!evmAddress || !stellarAddress) return true;
    if (parseFloat(inputAmount) <= 0) return true;
    if (isInsufficient || isInsufficientXlm) return true;
    if (isQuoting || loadingStep) return true;
    if (phase === 'BRIDGE' && bridgeTx.status === 'PENDING') return true;
    if (phase === 'BRIDGE' && !bridgeTx.hash && !bridgeTx.status) return false;
    if (phase === 'DEPOSIT' && bridgeTx.status !== 'SUCCESS') return true;
    if (phase === 'DEPOSIT' && depositTx.status === 'PENDING') return true;
    return false;
  }, [
    evmAddress,
    stellarAddress,
    inputAmount,
    isInsufficient,
    isInsufficientXlm,
    isQuoting,
    loadingStep,
    phase,
    bridgeTx.status,
    bridgeTx.hash,
    depositTx.status,
  ]);

  // ---------------------------------------------------------------------------
  // Route breakdown
  // ---------------------------------------------------------------------------
  const routeBreakdown = useMemo(() => {
    if (!bridgeQuote && !depositQuote && !swapQuote) return null;
    const stellarConfig = getStellarConfig(currentNetwork);

    const bridgeFee =
      bridgeQuote
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
      items.push({
        label: 'Swap',
        value: `${inputToken?.symbol} → USDC`,
        fee: 'Variable',
        amount: swapQuote.estimatedOutput ? portfolioUtils.formatBalance(swapQuote.estimatedOutput) : '',
        icon: inputToken?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol || '', stellarConfig),
        chainIcon: stellarConfig.logoUrl,
        status: phase === 'SETUP' ? 'pending' : phase === 'SWAP' ? 'active' : 'done',
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
        status: phase === 'BRIDGE' ? 'active' : ['SETUP', 'SWAP'].includes(phase) ? 'pending' : 'done',
      });
    }

    if (depositQuote) {
      const rawFee =
        ((depositQuote.usd_amount_in ?? 0) - (depositQuote.usd_amount_out ?? 0)) || 0.02;
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
        status:
          phase === 'DEPOSIT' ? 'active' : phase === 'DONE' ? 'done' : 'pending',
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
        status: phase === 'DONE' ? 'done' : 'pending',
      });
    }

    return { items, totalTime: bridgeTime + depositTime };
  }, [
    bridgeQuote,
    depositQuote,
    swapQuote,
    inputToken,
    destinationChain,
    currentNetwork,
    phase,
    feePaymentMethod,
  ]);

  const evmChains = useMemo(() => getEvmChainsForNetwork(currentNetwork), [currentNetwork]);

  // ---------------------------------------------------------------------------
  // Vertical execution roadmap
  // ---------------------------------------------------------------------------
  const renderVerticalPath = () => {
    const steps = isUsdc
      ? [
        {
          id: 'BRIDGE',
          label: 'Bridge to EVM',
          description: `Move USDC from Stellar to ${destinationChain?.name || 'EVM Chain'}. This involves a cross-chain protocol and typically takes 2-15 minutes.`,
          color: 'text-blue-400',
          bg: 'bg-blue-400/20',
          border: 'border-blue-400/30',
        },
        {
          id: 'DEPOSIT',
          label: 'Settle to dYdX',
          description:
            'Finalize the settlement from the EVM network to your dYdX trading account. This funds your dYdX position.',
          color: 'text-brand',
          bg: 'bg-brand/20',
          border: 'border-brand/30',
        },
      ]
      : [
        {
          id: 'SWAP',
          label: 'Prepare USDC on Stellar',
          description:
            'Convert tokens to USDC on Stellar. This ensures compatibility with the cross-chain bridge infrastructure.',
          color: 'text-emerald-400',
          bg: 'bg-emerald-400/20',
          border: 'border-emerald-400/30',
        },
        {
          id: 'BRIDGE',
          label: 'Bridge to EVM',
          description: `Cross-chain transfer to ${destinationChain?.name || 'EVM Chain'}. Assets are moved securely via Allbridge liquidity pools.`,
          color: 'text-blue-400',
          bg: 'bg-blue-400/20',
          border: 'border-blue-400/30',
        },
        {
          id: 'DEPOSIT',
          label: 'Settle to dYdX',
          description:
            'Depositing from EVM into the dYdX Protocol. Once confirmed, your balance will be available for trading.',
          color: 'text-brand',
          bg: 'bg-brand/20',
          border: 'border-brand/30',
        },
      ];

    const currentStepIndex =
      phase === 'SETUP'
        ? -1
        : phase === 'SWAP'
          ? 0
          : phase === 'BRIDGE'
            ? isUsdc ? 0 : 1
            : phase === 'DEPOSIT'
              ? isUsdc ? 1 : 2
              : 3;

    return (
      <div className="bg-tertiary/90 backdrop-blur-2xl rounded-b-[3rem] mx-1 -mt-10 pt-12 pb-12 px-6 mx-2 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)] animate-slide-up relative z-0 overflow-hidden">
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
              const stepTxStatus =
                s.id === 'SWAP'
                  ? swapTx.status
                  : s.id === 'BRIDGE'
                    ? bridgeTx.status
                    : depositTx.status;
              const isActive = i === currentStepIndex;
              const isCompleted = stepTxStatus === 'SUCCESS' || i < currentStepIndex;
              const isStepPending = stepTxStatus === 'PENDING';
              const isFailed = stepTxStatus === 'FAILED';
              const isLocked = i > currentStepIndex && !stepTxStatus;

              const stepTxHash =
                s.id === 'SWAP' ? swapTx.hash : s.id === 'BRIDGE' ? bridgeTx.hash : depositTx.hash;

              return (
                <div
                  key={s.id}
                  className={`flex gap-6 transition-all duration-700 ${isLocked ? 'opacity-20 blur-[0.5px]' : 'opacity-100'
                    }`}
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

                        {s.id === 'DEPOSIT' && dydxTracker.steps.length > 0 && (
                          <div className="pl-2 border-l border-divider/50 space-y-4 ml-0.5">
                            {dydxTracker.steps.map((step: any, idx: number) => {
                              const isStepSuccess =
                                step.state === 'TRANSFER_SUCCESS' ||
                                step.state === 'TRANSFER_RECEIVED';
                              const isStepFailure = step.state === 'TRANSFER_FAILURE';
                              const explorerLink =
                                step.packet_txs?.send_tx?.explorer_link ||
                                step.packet_txs?.receive_tx?.explorer_link;

                              return (
                                <div key={idx} className="flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between group/sub">
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`w-1.5 h-1.5 rounded-full ${isStepSuccess
                                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                                          : isStepFailure
                                            ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                                            : 'bg-brand animate-pulse'
                                          }`}
                                      />
                                      <span
                                        className={`text-[8px] font-black uppercase tracking-widest ${isStepSuccess
                                          ? 'text-emerald-400/80'
                                          : isStepFailure
                                            ? 'text-rose-500/80'
                                            : 'text-muted'
                                          }`}
                                      >
                                        {step.type
                                          .replace('_transfer', '')
                                          .replace('_', ' ')}
                                      </span>
                                    </div>
                                    {explorerLink && (
                                      <a
                                        href={explorerLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[7px] font-black text-brand/40 hover:text-brand flex items-center gap-1 transition-colors uppercase tracking-tighter"
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

                        {((s.id === 'SWAP' && swapTx.hash) ||
                          (s.id === 'BRIDGE' && bridgeTx.hash)) && (
                            <a
                              href={
                                s.id === 'SWAP'
                                  ? `https://stellar.expert/explorer/public/tx/${stepTxHash}`
                                  : `https://explorer.allbridge.io/tx/${stepTxHash}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-[8px] font-black text-brand/60 hover:text-brand transition-colors uppercase tracking-widest"
                            >
                              <ExternalLink size={10} />
                              <span>View on Explorer</span>
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

  const isBothConnected = !!evmAddress && !!stellarAddress;

  if (!isBothConnected && phase === 'SETUP') {
    return (
      <div className="w-full max-w-xl mx-auto lg:px-4 pb-4 animate-fade-in">
        <div className="bg-tertiary rounded-[2.5rem] border border-divider/50 p-12 text-center shadow-2xl relative overflow-hidden group">
          {/* Background decorative elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-brand/10" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand/5 rounded-full -ml-16 -mb-16 blur-3xl transition-all group-hover:bg-brand/10" />

          <div className="relative mb-8 flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-brand/10 flex items-center justify-center rotate-3 group-hover:rotate-6 transition-transform duration-500">
                <Layers className="w-12 h-12 text-brand" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-secondary border-4 border-bg-primary flex items-center justify-center shadow-xl">
                <ShieldCheck className="w-5 h-5 text-brand" />
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
              className="w-full bg-brand text-white font-black py-5 rounded-2xl tracking-[0.2em] hover:brightness-110 active:scale-[0.98] transition-all uppercase shadow-lg shadow-brand/20 flex items-center justify-center gap-3"
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

  return (
    <div className="w-full mx-auto lg:px-4 pb-4 animate-fade-in">
      {/* Header */}
      <div className={`-mb-1 flex px-2 items-center ${phase === 'SETUP' ? 'justify-end' : 'justify-between'}`}>
        {phase !== 'SETUP' && (
          <button
            onClick={handleBack}
            className="flex items-center gap-2 py-3 text-muted hover:text-brand transition-all bg-primary hover:bg-tertiary px-3 py-1.5 rounded-lg rounded-b-none border border-divider/50 group"
          >
            <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[9px] font-black uppercase tracking-widest">
              {phase === 'DONE' ? 'Start New' : 'Back to Edit'}
            </span>
          </button>
        )}
        {phase === 'SETUP' && (
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
                  <img src={destinationChain?.logoURI} className="w-4 h-4 rounded-full" alt="" />
                  <span className="text-xs font-black text-primary uppercase">
                    {destinationChain?.name}
                  </span>
                </div>
              </div>
              <ChevronDown
                size={14}
                className={`text-muted transition-transform duration-300 ml-2 ${showNetworkSelector ? 'rotate-180' : ''
                  }`}
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
          {/* You Pay */}
          <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-8  group transition-all duration-500 shadow-xl relative z-20 border border-divider/10">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">
                You Pay
              </span>
              {phase === 'SETUP' && (
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
                  phase === 'SETUP' &&
                  openAssetSelector('BRIDGE', {
                    forceNetwork: STELLAR_CHAIN_ID,
                    showAllStellarAssets: true,
                    onSelect: (a: StellarToken) => {
                      const found = stellarAssets.find(s => s.symbol === a.symbol);
                      setInputToken(found || a);
                    },
                  })
                }
                className={`flex items-center gap-4 bg-secondary hover:bg-hover rounded-2xl px-5 py-4 transition-all border border-divider/50 shadow-sm min-w-[190px] ${phase === 'SETUP' ? 'active:scale-95' : 'pointer-events-none opacity-80'
                  }`}
              >
                {loadingAssets ? (
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
                            phase === 'DEPOSIT' || phase === 'DONE'
                              ? destinationChain?.logoURI
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
                        {phase === 'DEPOSIT' || phase === 'DONE'
                          ? destinationChain?.name || 'EVM'
                          : 'Stellar'}
                      </span>
                    </div>
                    {phase === 'SETUP' && <ChevronDown size={14} className="text-muted ml-auto" />}
                  </>
                )}
              </button>

              <div className="flex-1 w-0 min-w-0 flex flex-col items-end">
                {phase === 'SETUP' ? (
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

          {/* Arrow divider */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
            <div className="w-11 h-11 bg-secondary rounded-2xl flex items-center justify-center shadow-2xl">
              <ArrowUpDown size={18} className="text-brand" />
            </div>
          </div>

          {/* You Receive */}
          <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-8   group transition-all duration-500 shadow-xl relative overflow-hidden border border-divider/20 z-20 w-full max-w-full">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">
                You Receive
              </span>
              {phase === 'SETUP' || phase === 'SWAP' || phase === 'BRIDGE' ? (
                <div className="flex items-center gap-1.5 bg-brand/5 px-3 py-1 rounded-full border border-brand/10">
                  <span className="text-[9px] font-black text-brand uppercase tracking-tighter italic">
                    Pending Final Settlement
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-brand/10 px-3 py-1 rounded-full border border-brand/20">
                  <CheckCircle2 size={10} className="text-brand" />
                  <span className="text-[9px] font-black text-brand uppercase tracking-tighter">
                    Settled on dYdX
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
                              : destinationChain?.chainId || ARBITRUM_CHAIN_ID
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

        {/* Execution Roadmap */}
        {phase !== 'SETUP' && phase !== 'DONE' && renderVerticalPath()}

        {/* Show full details toggle */}
        {phase === 'SETUP' && routeBreakdown && (
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

        {/* Route details */}
        {phase === 'SETUP' && routeBreakdown && (
          <div className="bg-tertiary rounded-xl border border-divider  p-4 py-6   lg:p-6 pb-0 animate-fade-in relative">
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
                          className={`text-[9px] font-black uppercase tracking-widest ${item.status === 'active' ? 'text-brand' : 'text-muted'
                            }`}
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

            {/* Full quote details */}
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
                          className={`font-black ${(rawQuotes.swap.priceImpact || 0) > 1
                            ? 'text-red-400'
                            : 'text-green-400'
                            }`}
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
                        Allbridge (Stellar →{' '}
                        {rawQuotes.bridge.destinationToken?.chainName || destinationChain?.name})
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
                              parseFloat(
                                String(rawQuotes.bridge.feeOptions?.stablecoin?.float || '0')
                              )
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
                          {rawQuotes.bridge.destinationToken?.chainName} (
                          {rawQuotes.bridge.destinationToken?.symbol})
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
                            `~${Math.round(
                              (rawQuotes.dydx.estimatedDurationSeconds || 0) / 60
                            )} min`}
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

            {/* Total row */}
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

        {/* Action section */}
        <div className="pt-2">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 mb-4 animate-shake">
              <AlertCircle size={18} className="text-red-500" />
              <p className="text-xs font-bold text-red-500">{error}</p>
            </div>
          )}

          {phase === 'BRIDGE' && (
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
                  setFeePaymentMethod(
                    feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                      ? FeePaymentMethod.WITH_NATIVE_CURRENCY
                      : FeePaymentMethod.WITH_STABLECOIN
                  )
                }
                className="flex items-center gap-2 bg-secondary p-1 rounded-xl border border-divider shadow-sm"
              >
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                    ? 'bg-brand text-white shadow-lg shadow-brand/20'
                    : 'text-muted opacity-50'
                    }`}
                >
                  <img src={USDC_LOGO_URL} className="w-3.5 h-3.5 rounded-full" alt="" />
                  <span className="text-[10px] font-black">USDC</span>
                </div>
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY
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

          {phase === 'DONE' ? (
            <div className="bg-success/5 rounded-[2rem] border border-success/20 p-8 text-center animate-bounce-in shadow-xl">
              <div className="w-16 h-16 bg-success rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-success/20">
                <CheckCircle2 size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-primary mb-2 uppercase">Success!</h3>
              <p className="text-xs text-muted mb-6">Transfer executed successfully.</p>
              <button
                onClick={handleReset}
                className="w-full bg-success text-white font-bold py-4 rounded-2xl tracking-widest hover:brightness-110 transition-all uppercase"
              >
                Back to Dashboard
              </button>
            </div>
          ) : (
            <div className="relative">
              {phase === 'DEPOSIT' && bridgeTx.status !== 'SUCCESS' && (
                <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 flex items-center gap-3">
                  <RefreshCw size={14} className="text-amber-400 animate-spin flex-shrink-0" />
                  <p className="text-[11px] font-bold text-amber-400">
                    Waiting for bridge funds to arrive on {destinationChain?.name}. You can proceed once the bridge confirms receipt.
                  </p>
                </div>
              )}
              <ActionGuard requiredWallets={[WalletType.EVM, WalletType.STELLAR]}>
                <TransactionButton
                  label={buttonLabel}
                  isLoading={isQuoting || loadingStep || dydxLoading || (phase === 'BRIDGE' && bridgeTx.status === 'PENDING') || (phase === 'DEPOSIT' && depositTx.status === 'PENDING')}
                  loadingLabel={
                    phase === 'BRIDGE' && bridgeTx.status === 'PENDING'
                      ? 'WAITING FOR BRIDGE...'
                      : phase === 'DEPOSIT' && depositTx.status === 'PENDING'
                        ? 'SETTLING TO DYDX...'
                        : isQuoting
                          ? 'FETCHING QUOTES...'
                          : 'PROCESSING...'
                  }
                  isDisabled={isButtonDisabled}
                  isError={!!error}
                  onClick={handleActionClick}
                  className="py-8 rounded-xl text-lg font-bold tracking-widest shadow-xl uppercase"
                />
              </ActionGuard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StellarDydxOrchestrator;