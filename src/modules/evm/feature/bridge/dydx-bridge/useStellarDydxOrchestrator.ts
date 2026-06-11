import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { useDydxDeposit } from '../../../../dydx/hooks/useDydxDeposit';
import { ChainSymbol, FeePaymentMethod, Messenger } from '@allbridge/bridge-core-sdk';
import { getEvmChainsForNetwork, type ChainConfig } from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import * as StellarSDK from '@stellar/stellar-sdk';
import { addLocalTransaction } from '../../../../evm/service/localTransactionService';
import { storeSwapOrder, getTransactionStatus, getSwapOrdersByWallet, updateSwapOrderStatus } from '../../../../evm/service/evmTransactionStatusService';
import { useNotificationStore } from '../../../../../store/notificationStore';
import { isTxOwnedByCurrentUser } from '../../../../dydx/hooks/useTransactionTracker';

const STELLAR_CHAIN_ID = 'pubnet';
const BRIDGE_STEP_KEY = 'stellar_dydx_bridge_step';
const DEFAULT_SLIPPAGE = 1.0;
const RECOVERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type SDKAny = any;

export type Phase = 'SETUP' | 'SWAP' | 'BRIDGE' | 'DEPOSIT' | 'DONE';
export type TxStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface StellarToken {
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

export interface SwapQuote {
  estimatedOutput: string;
  minimumOutput?: string;
  priceImpact?: number;
  inputAmount?: string;
  fromAsset?: { code: string };
  path?: { path: Array<{ code: string }> };
  [key: string]: unknown;
}

export interface BridgeQuote {
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

export interface DepositQuote {
  receivedAmount?: number;
  estimatedDurationSeconds?: number;
  estimatedTime?: string;
  fee?: number;
  usd_amount_in?: number;
  usd_amount_out?: number;
  usdAmountOut?: string | number;
  [key: string]: unknown;
}

export interface BridgeSessionError {
  message: string;
  action: string;
}

export interface BridgeSession {
  id: string;
  groupId: string;
  createdAt: number;
  phase: Phase;
  inputAmount: string;
  inputTokenSymbol: string;
  destinationChainId: number;
  swapTx: { hash: string | null; status: TxStatus | null };
  bridgeTx: { hash: string | null; status: TxStatus | null };
  depositTx: { hash: string | null; status: TxStatus | null };
  intermediateAmount: string | null;
  feePaymentMethod: FeePaymentMethod;
  requiredWallets: {
    evm?: string;
    dydx?: string;
    stellar?: string;
  };
  error: BridgeSessionError | null;
  loadingStep: boolean;
  expectedSwapOutput?: string | null;
  expectedBridgeOutput?: string | null;
  dydxSteps?: SDKAny[];
  dydxOverallState?: string;
  bridgeStartedAt: number | null;
  expectedBridgeTimeMs: number | null;
}

interface BackendOrder {
  txHash: string;
  walletAddress: string;
  provider: string;
  fromChain: string;
  fromToken: string;
  toChain: string;
  toToken: string;
  amountIn: string | number;
  amountOut?: string | number;
  requestId?: string;
  status?: 'pending' | 'completed' | 'failed';
  txType?: string;
}

const sanitizeAmount = (val: string | number | null | undefined, decimals: number = 7): string => {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val);
  const parts = str.split('.');
  if (parts.length <= 1) return str;
  return `${parts[0]}.${parts[1].slice(0, decimals)}`;
};

const classifyBridgeError = (err: unknown): BridgeSessionError => {
  const rawMsg = err instanceof Error
    ? err.message
    : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err);
  return {
    message: rawMsg || 'An unexpected error occurred.',
    action: 'Tap Try Again to retry this step.',
  };
};

const mapBackendOrderToSession = (
  orders: BackendOrder[],
  wallets: any,
): BridgeSession | null => {
  if (!orders || orders.length === 0) return null;
  const groupId = orders[0].requestId;
  if (!groupId || groupId.startsWith('legacy-')) return null;

  const bridgeOrder = orders.find(o => o.provider === 'SRBTODYDX' || o.provider === 'ALLBRIDGE');
  const dydxOrder = orders.find(o => o.provider === 'DYDX');

  const inputTokenSymbol = bridgeOrder?.fromToken || 'USDC';
  const toChainSymbol = bridgeOrder?.toChain;
  let destinationChainId = 42161;
  if (toChainSymbol) {
    switch (toChainSymbol.toUpperCase()) {
      case 'ARB':
        destinationChainId = 42161;
        break;
      case 'POL':
        destinationChainId = 137;
        break;
      case 'BSC':
      case 'BNB':
        destinationChainId = 56;
        break;
      case 'ETH':
      case 'ETHEREUM':
        destinationChainId = 1;
        break;
      case 'OPT':
      case 'OP':
        destinationChainId = 10;
        break;
      case 'AVAX':
        destinationChainId = 43114;
        break;
      case 'BASE':
        destinationChainId = 8453;
        break;
    }
  }

  let phase: Phase = 'BRIDGE';
  let bridgeStatus: TxStatus = 'PENDING';
  let depositStatus: TxStatus = 'PENDING';

  if (bridgeOrder?.status === 'completed') {
    bridgeStatus = 'SUCCESS';
    phase = 'DEPOSIT';
  } else if (bridgeOrder?.status === 'failed') {
    bridgeStatus = 'FAILED';
  }

  if (dydxOrder) {
    if (dydxOrder.status === 'completed') {
      depositStatus = 'SUCCESS';
      phase = 'DONE';
    } else if (dydxOrder.status === 'failed') {
      depositStatus = 'FAILED';
    }
    if (phase === 'BRIDGE' && bridgeStatus === 'SUCCESS') phase = 'DEPOSIT';
  }

  if (phase === 'DONE' || Date.now() - (bridgeOrder ? Date.now() : 0) > RECOVERY_MAX_AGE_MS) {
    return null;
  }

  return {
    id: `recovered-${groupId}`,
    groupId,
    createdAt: Date.now() - 60000,
    phase,
    inputAmount: String(bridgeOrder?.amountIn || ''),
    inputTokenSymbol,
    destinationChainId,
    swapTx: { hash: null, status: null },
    bridgeTx: { hash: bridgeOrder?.txHash || null, status: bridgeStatus },
    depositTx: dydxOrder ? { hash: dydxOrder.txHash || null, status: depositStatus } : { hash: null, status: null },
    intermediateAmount: bridgeOrder?.amountOut ? String(bridgeOrder.amountOut) : null,
    feePaymentMethod: FeePaymentMethod.WITH_STABLECOIN,
    requiredWallets: {
      evm: wallets.evm?.address,
      stellar: wallets.stellar?.address,
      dydx: wallets.evm?.dydxAddress || wallets.cosmos?.dydxAddress,
    },
    error: null,
    loadingStep: false,
    expectedSwapOutput: null,
    expectedBridgeOutput: null,
    dydxSteps: [],
    dydxOverallState: '',
    bridgeStartedAt: null,
    expectedBridgeTimeMs: null,
  };
};

export const useStellarDydxOrchestrator = () => {
  const [searchParams] = useSearchParams();
  const assetParam = searchParams.get('asset');

  const { connectedWallets, getProvider } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network) as 'mainnet' | 'testnet';

  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarAddress = stellarWallet?.address;
  const evmAddress = evmWallet?.address;

  const [inputAmount, setInputAmount] = useState<string>('');
  const [inputToken, setInputToken] = useState<StellarToken | null>(null);
  const [destinationChain, setDestinationChain] = useState<ChainConfig | null>(null);
  const [feePaymentMethod, setFeePaymentMethod] = useState<FeePaymentMethod>(FeePaymentMethod.WITH_STABLECOIN);

  const [stellarAssets, setStellarAssets] = useState<StellarToken[]>([]);
  const [loadingAssets, setLoadingAssets] = useState<boolean>(true);
  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);

  const [isQuoting, setIsQuoting] = useState<boolean>(false);
  const isQuotingRef = useRef<boolean>(false);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [bridgeQuote, setBridgeQuote] = useState<BridgeQuote | null>(null);
  const [depositQuote, setDepositQuote] = useState<DepositQuote | null>(null);
  const [rawQuotes, setRawQuotes] = useState<{ swap: SwapQuote | null; bridge: BridgeQuote | null; dydx: DepositQuote | null } | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<BridgeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isRestored, setIsRestored] = useState<boolean>(false);
  const hasRestoredRef = useRef<boolean>(false);
  const [quoteTimestamp, setQuoteTimestamp] = useState<number | null>(null);

  const { showToast } = useNotificationStore();
  const { getRoute, deposit } = useDydxDeposit();

  const assetMap = useMemo(
    () => Object.fromEntries(stellarAssets.map(a => [a.symbol, a])),
    [stellarAssets]
  );

  const nativeBalance = useMemo(() => {
    const xlm = stellarAssets.find(m => m.symbol === 'XLM');
    return xlm ? xlm.balance : '0';
  }, [stellarAssets]);

  const isUsdc = useMemo(() => {
    return inputToken?.symbol?.toUpperCase() === 'USDC';
  }, [inputToken]);

  const saveSessions = useCallback((updated: BridgeSession[]) => {
    try {
      const sessionsToSave = updated
        .filter(s => s.phase !== 'SETUP')
        .map(s => ({
          id: s.id,
          groupId: s.groupId,
          createdAt: s.createdAt,
          phase: s.phase,
          inputAmount: s.inputAmount,
          inputTokenSymbol: s.inputTokenSymbol,
          destinationChainId: s.destinationChainId,
          swapTx: s.swapTx,
          bridgeTx: { hash: s.bridgeTx.hash, status: s.bridgeTx.status },
          depositTx: { hash: s.depositTx.hash, status: s.depositTx.status },
          intermediateAmount: s.intermediateAmount,
          feePaymentMethod: s.feePaymentMethod,
          requiredWallets: s.requiredWallets,
          bridgeStartedAt: s.bridgeStartedAt,
          expectedBridgeTimeMs: s.expectedBridgeTimeMs,
          expectedSwapOutput: s.expectedSwapOutput,
          expectedBridgeOutput: s.expectedBridgeOutput,
        }));
      localStorage.setItem(BRIDGE_STEP_KEY, JSON.stringify(sessionsToSave));
    } catch (err) {
      console.error('Failed to save sessions to localStorage', err);
    }
  }, []);

  const updateSession = useCallback((id: string, updates: Partial<BridgeSession>) => {
    setSessions(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...updates } : s);
      saveSessions(next);
      return next;
    });
  }, [saveSessions]);

  const getStellarAsset = useCallback((symbol: string): StellarSDK.Asset | null => {
    if (symbol === 'XLM') return StellarSDK.Asset.native();

    const token = stellarAssets.find(t => t.symbol === symbol);
    if (token) {
      if (token.isNative) return StellarSDK.Asset.native();
      return new StellarSDK.Asset(symbol, token.address);
    }
    if (symbol === 'USDC') {
      const issuer = currentNetwork === 'mainnet'
        ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
        : 'GAHPYWLK6YRN7CVYZOO4H3VDRZ7PVF5UJGLZCSPAEIKJE2XSWF5LAGER';
      return new StellarSDK.Asset('USDC', issuer);
    }

    return null;
  }, [stellarAssets, currentNetwork]);

  const fetchStellarAssets = useCallback(async () => {
    if (!ammService || !stellarAddress) return;
    try {
      setLoadingAssets(true);
      const { tokens: balances, subentryCount } = await ammService.getAssetsWithBalances(stellarAddress);
      const reserve = 1 + subentryCount * 0.5;
      const mapped: StellarToken[] = balances
        .filter((b: SDKAny) => b && b.asset)
        .map((b: SDKAny) => {
          let balanceToUse = b.balance || '0';
          if (b.code === 'XLM') {
            balanceToUse = sanitizeAmount(Math.max(0, parseFloat(b.balance || '0') - reserve).toString());
          }
          const isNative = typeof b.asset.isNative === 'function' ? b.asset.isNative() : b.code === 'XLM';
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
            address: isNative ? 'native' : (typeof b.asset.getIssuer === 'function' ? b.asset.getIssuer() : b.issuer),
            hasTrustline: b.hasTrustline,
          };
        });

      setStellarAssets(mapped);

      setInputToken(prev => {
        if (prev) {
          const updated = mapped.find(m => m.symbol === prev.symbol);
          return updated ?? prev;
        }
        const xlm = mapped.find(m => m.symbol === 'XLM');
        return xlm ?? mapped[0] ?? null;
      });
    } catch (err) {
      console.error('Failed to fetch Stellar balances:', err);
    } finally {
      setLoadingAssets(false);
    }
  }, [ammService, stellarAddress]);

  const fetchAllQuotes = useCallback(async (amount: string, signal: AbortSignal) => {
    if (!amount || parseFloat(amount) <= 0 || !inputToken || !ammService || !destinationChain) {
      setSwapQuote(null);
      setBridgeQuote(null);
      setDepositQuote(null);
      setRawQuotes(null);
      return;
    }

    setIsQuoting(true);
    isQuotingRef.current = true;
    setSetupError(null);

    try {
      let usdcAmountStellar = amount;
      let finalSwapQuote: SwapQuote | null = null;

      const inputAsset = getStellarAsset(inputToken.symbol);
      if (!inputAsset) throw new Error('Invalid input token');

      const shouldFetchSwapQuote = inputToken.symbol !== 'USDC';

      const [swapResult, allTokens] = await Promise.all([
        shouldFetchSwapQuote
          ? (async () => {
            const usdcAsset = stellarAssets.find(a => a.symbol === 'USDC');
            if (!usdcAsset) throw new Error('USDC asset not found on Stellar');
            const targetAsset = getStellarAsset(usdcAsset.symbol);
            if (!targetAsset) throw new Error('Invalid target token');
            return ammService.getSwapQuote(inputAsset, targetAsset, sanitizeAmount(amount), {
              slippageTolerance: DEFAULT_SLIPPAGE,
            });
          })()
          : Promise.resolve(null),
        getSupportedTokens(),
      ]);

      if (signal.aborted) return;

      if (swapResult) {
        finalSwapQuote = swapResult as unknown as SwapQuote;
        usdcAmountStellar = sanitizeAmount(finalSwapQuote.estimatedOutput);
      }

      setSwapQuote(finalSwapQuote);

      const dstSymbol = (destinationChain.symbol === 'BNB' ? ChainSymbol.BSC : destinationChain.symbol) as ChainSymbol;
      const srcUsdc = allTokens.find(t => t.chainSymbol === ChainSymbol.SRB && t.symbol === 'USDC');
      const dstUsdc = allTokens.find(t => t.chainSymbol === dstSymbol && t.symbol === 'USDC');
      if (!srcUsdc || !dstUsdc) throw new Error('Bridge tokens not found for selected chain');

      const bq = (await getStellarBridgeQuote({
        amount: sanitizeAmount(usdcAmountStellar),
        sourceToken: srcUsdc,
        destinationToken: dstUsdc,
        slippageTolerance: DEFAULT_SLIPPAGE,
      })) as unknown as BridgeQuote;

      if (signal.aborted) return;
      setBridgeQuote(bq);

      if (!bq.feeOptions?.stablecoin) {
        setFeePaymentMethod(FeePaymentMethod.WITH_NATIVE_CURRENCY);
      }

      const dstUsdcAmount = bq.amountToBeReceived;
      if (!dstUsdcAmount) throw new Error('Could not determine deposit amount');

      const dr = await getRoute('USDC', parseFloat(dstUsdcAmount.toString()), destinationChain.chainId, false);
      if (signal.aborted) return;
      if (!dr) throw new Error('No deposit route to dYdX found. Try another chain.');
      setDepositQuote(dr as DepositQuote);

      setRawQuotes({ swap: finalSwapQuote, bridge: bq, dydx: dr as DepositQuote });
      setQuoteTimestamp(Date.now());
    } catch (err: any) {
      if (signal.aborted) return;
      console.error('Quote error:', err);
      setSetupError(err.message || 'Failed to fetch quotes');
    } finally {
      setIsQuoting(false);
      isQuotingRef.current = false;
    }
  }, [inputToken, ammService, stellarAssets, destinationChain, getRoute, getStellarAsset]);

  const clearSetupForm = useCallback(() => {
    setInputAmount('');
    setSwapQuote(null);
    setBridgeQuote(null);
    setDepositQuote(null);
    setRawQuotes(null);
    setSetupError(null);
  }, []);

  const executeSwap = useCallback(async (session: BridgeSession): Promise<boolean> => {
    if (!ammService || !stellarAddress) return false;
    try {
      const provider = getProvider(WalletType.STELLAR) as SDKAny;
      const inputAsset = getStellarAsset(session.inputTokenSymbol);
      if (!inputAsset) throw new Error('Invalid input token');

      const usdcAsset = stellarAssets.find(a => a.symbol === 'USDC');
      if (!usdcAsset) throw new Error('USDC asset not found on Stellar');
      const targetAsset = getStellarAsset(usdcAsset.symbol);
      if (!targetAsset) throw new Error('Invalid target token');

      const freshSwapQuote = await ammService.getSwapQuote(inputAsset, targetAsset, sanitizeAmount(session.inputAmount), {
        slippageTolerance: DEFAULT_SLIPPAGE,
      });
      if (!freshSwapQuote) throw new Error('Failed to fetch a fresh swap quote.');

      const tx = await ammService.buildSwapTransaction(stellarAddress, freshSwapQuote as SDKAny, {
        slippageTolerance: DEFAULT_SLIPPAGE,
      });
      const hash = await ammService.executeSwapWithWalletConnect(tx, provider);

      addLocalTransaction({
        hash,
        chainId: STELLAR_CHAIN_ID,
        type: 'swap',
        timestamp: Date.now(),
        description: `Swap ${session.inputAmount} ${session.inputTokenSymbol} to USDC`,
        status: 'pending',
        from: stellarAddress,
        network: currentNetwork,
      });

      updateSession(session.id, {
        swapTx: { hash, status: 'SUCCESS' },
        intermediateAmount: freshSwapQuote.estimatedOutput,
      });

      showToast({
        type: 'STELLAR',
        title: 'Swap Successful',
        message: `Exchanged ${session.inputAmount} ${session.inputTokenSymbol} for USDC on Stellar.`,
      });
      return true;
    } catch (err: unknown) {
      updateSession(session.id, { error: classifyBridgeError(err) });
      return false;
    }
  }, [ammService, stellarAddress, getProvider, currentNetwork, updateSession, showToast, stellarAssets, getStellarAsset]);

  const executeBridge = useCallback(async (session: BridgeSession): Promise<boolean> => {
    try {
      const allTokens = await getSupportedTokens();
      const sessionChain = getEvmChainsForNetwork(currentNetwork).find(c => c.chainId === session.destinationChainId);
      if (!sessionChain) throw new Error('Destination chain not found');

      const dstSymbol = (sessionChain.symbol === 'BNB' ? ChainSymbol.BSC : sessionChain.symbol) as ChainSymbol;
      const srcUsdc = allTokens.find(t => t.chainSymbol === ChainSymbol.SRB && t.symbol === 'USDC');
      const dstUsdc = allTokens.find(t => t.chainSymbol === dstSymbol && t.symbol === 'USDC');
      if (!srcUsdc || !dstUsdc) throw new Error('Bridge tokens not found');

      let targetBridgeAmount = session.inputTokenSymbol === 'USDC' ? session.inputAmount : (session.intermediateAmount || session.expectedSwapOutput || session.inputAmount);

      const confirmedUsdcBalance = assetMap['USDC']?.balance || '0';
      const bridgeInputAmount = session.inputTokenSymbol === 'USDC'
        ? targetBridgeAmount
        : Math.min(parseFloat(targetBridgeAmount), parseFloat(confirmedUsdcBalance)).toString();

      const freshBridgeQuote = (await getStellarBridgeQuote({
        amount: sanitizeAmount(bridgeInputAmount),
        sourceToken: srcUsdc,
        destinationToken: dstUsdc,
        slippageTolerance: DEFAULT_SLIPPAGE,
      })) as unknown as BridgeQuote;

      const xdr = await prepareStellarToEvmRawTransaction({
        amount: sanitizeAmount(bridgeInputAmount),
        sourceToken: freshBridgeQuote.sourceToken,
        destinationToken: freshBridgeQuote.destinationToken,
        fromAccountAddress: stellarAddress!,
        toAccountAddress: evmAddress!,
        network: currentNetwork,
        feePaymentMethod: session.feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN && freshBridgeQuote.feeOptions?.stablecoin ? FeePaymentMethod.WITH_STABLECOIN : FeePaymentMethod.WITH_NATIVE_CURRENCY,
        messenger: Messenger.ALLBRIDGE,
        slippageTolerance: DEFAULT_SLIPPAGE,
      });

      const provider = getProvider(WalletType.STELLAR) as SDKAny;
      const result = await signAndSubmitTransaction({
        xdr,
        network: currentNetwork,
        networkPassphrase: STELLAR_NETWORK_PASSPHRASE[currentNetwork],
        provider,
        stellarAddress,
      });

      if (result.hash) {
        updateSession(session.id, {
          bridgeTx: { hash: result.hash, status: 'PENDING' },
          intermediateAmount: freshBridgeQuote.amountToBeReceived,
          bridgeStartedAt: Date.now(),
          expectedBridgeTimeMs: freshBridgeQuote.transferTimeMs ? Number(freshBridgeQuote.transferTimeMs) : null,
        });

        addLocalTransaction({
          hash: result.hash,
          chainId: STELLAR_CHAIN_ID,
          type: 'bridge',
          timestamp: Date.now(),
          description: `Bridge USDC to ${sessionChain.name}`,
          status: 'pending',
          from: stellarAddress,
          network: currentNetwork,
        });

        storeSwapOrder({
          txHash: result.hash,
          walletAddress: stellarAddress!,
          provider: 'SRBTODYDX',
          fromChain: 'SRB',
          fromToken: 'USDC',
          toChain: sessionChain.symbol ?? '',
          toToken: 'USDC',
          amountIn: bridgeInputAmount,
          amountOut: freshBridgeQuote.amountToBeReceived,
          requestId: session.groupId,
          txType: 'Bridge',
        }).catch(err => console.error('Failed to store Allbridge order:', err));

        showToast({
          type: 'BRIDGE',
          title: 'Bridge Initiated',
          message: `Your USDC is crossing to ${sessionChain.name}. This usually takes ~2-15 minutes.`,
        });
      }

      if (!result.success) throw new Error(result.error || 'Transaction failed');
      return true;
    } catch (err: unknown) {
      updateSession(session.id, { error: classifyBridgeError(err) });
      return false;
    }
  }, [stellarAddress, evmAddress, currentNetwork, getProvider, updateSession, showToast, assetMap]);

  const executeDeposit = useCallback(async (session: BridgeSession): Promise<boolean> => {
    try {
      const confirmedReceiveAmount = session.intermediateAmount ? parseFloat(session.intermediateAmount) : null;
      if (!confirmedReceiveAmount || confirmedReceiveAmount <= 0) {
        throw new Error('Bridge has not confirmed the received amount yet. Please wait for bridge confirmation before depositing.');
      }

      const sessionChain = getEvmChainsForNetwork(currentNetwork).find(c => c.chainId === session.destinationChainId);
      if (!sessionChain) throw new Error('Destination chain not selected.');

      const provider = getProvider(WalletType.EVM);
      if (!provider) {
        throw new Error('EVM wallet provider is not available. Please reconnect your wallet.');
      }

      try {
        await switchOrAddChain(provider, sessionChain.chainId);
      } catch {
        throw new Error(`Please switch your wallet network to ${sessionChain.name} before depositing.`);
      }

      const dr = await getRoute('USDC', confirmedReceiveAmount, sessionChain.chainId, true);
      if (!dr) throw new Error('Could not verify fresh deposit route. Please try again.');

      const res = await deposit(
        'USDC',
        confirmedReceiveAmount,
        sessionChain.chainId,
        true,
        '1',
        undefined,
        undefined,
        undefined,
        (hash) => {
          addLocalTransaction({
            hash,
            chainId: sessionChain.chainId,
            type: 'bridge',
            provider: 'SKIP',
            timestamp: Date.now(),
            description: `Deposit USDC to dYdX from ${sessionChain.name}`,
            status: 'pending',
            from: evmAddress,
            to: 'dydx',
            network: currentNetwork,
          });

          storeSwapOrder({
            txHash: hash,
            walletAddress: evmAddress!,
            provider: 'DYDX',
            fromChain: sessionChain.symbol ?? '',
            fromToken: 'USDC',
            toChain: 'SRB',
            toToken: 'USDC',
            amountIn: confirmedReceiveAmount.toString(),
            amountOut: confirmedReceiveAmount.toString(),
            requestId: session.groupId,
            txType: 'Bridge',
          }).catch(err => console.error('Failed to store dYdX deposit order:', err));

          updateSession(session.id, {
            depositTx: { hash, status: 'PENDING' },
          });

          showToast({
            type: 'DYDX',
            title: 'Deposit Started',
            message: 'Settling funds to your dYdX trading account.',
          });
        }
      );
      if (res.success) {
        return true;
      } else {
        throw new Error(res.error || 'Deposit failed');
      }
    } catch (err: unknown) {
      updateSession(session.id, { error: classifyBridgeError(err) });
      return false;
    }
  }, [evmAddress, currentNetwork, deposit, getRoute, updateSession, showToast, getProvider]);

  const executeSessionStep = useCallback(async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    updateSession(sessionId, { loadingStep: true, error: null });

    try {
      if (session.phase === 'SWAP') {
        const ok = await executeSwap(session);
        updateSession(sessionId, {
          ...(ok ? { phase: 'BRIDGE' } : {}),
          loadingStep: false,
        });
      } else if (session.phase === 'BRIDGE') {
        await executeBridge(session);
        updateSession(sessionId, { loadingStep: false });
      } else if (session.phase === 'DEPOSIT') {
        await executeDeposit(session);
        updateSession(sessionId, { loadingStep: false });
      }
    } catch (err: unknown) {
      updateSession(sessionId, { error: classifyBridgeError(err), loadingStep: false });
    }
  }, [sessions, executeSwap, executeBridge, executeDeposit, updateSession]);

  const createSession = useCallback(async () => {
    if (!inputToken || !destinationChain || !inputAmount) return;

    if (quoteTimestamp !== null && Date.now() - quoteTimestamp > 60000) {
      setSetupError('Quotes have expired. Please wait for fresh quotes before proceeding.');
      throw new Error('Quotes have expired. Please wait for fresh quotes before proceeding.');
    }

    const wallets = useWalletStore.getState().connectedWallets;
    const sessionId = `bridge-${Date.now()}`;
    const groupId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `grp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const initialPhase: Phase = inputToken.symbol === 'USDC' ? 'BRIDGE' : 'SWAP';

    const newSession: BridgeSession = {
      id: sessionId,
      groupId,
      createdAt: Date.now(),
      phase: initialPhase,
      inputAmount,
      inputTokenSymbol: inputToken.symbol,
      destinationChainId: Number(destinationChain.chainId),
      swapTx: { hash: null, status: null },
      bridgeTx: { hash: null, status: null },
      depositTx: { hash: null, status: null },
      intermediateAmount: null,
      feePaymentMethod,
      requiredWallets: {
        evm: wallets.evm?.address,
        stellar: wallets.stellar?.address,
        dydx: wallets.evm?.dydxAddress || wallets.cosmos?.dydxAddress
      },
      error: null,
      loadingStep: true,
      expectedSwapOutput: swapQuote?.estimatedOutput || null,
      expectedBridgeOutput: bridgeQuote?.amountToBeReceived || null,
      expectedBridgeTimeMs: bridgeQuote?.transferTimeMs ? Number(bridgeQuote.transferTimeMs) : null,
      bridgeStartedAt: null,
    };

    setSessions(prev => {
      const next = [...prev, newSession];
      saveSessions(next);
      return next;
    });

    setActiveSessionId(sessionId);
    clearSetupForm();

    if (initialPhase === 'SWAP') {
      executeSwap(newSession)
        .then(ok => {
          updateSession(sessionId, {
            ...(ok ? { phase: 'BRIDGE' } : {}),
            loadingStep: false,
          });
        })
        .catch(err => {
          updateSession(sessionId, { error: classifyBridgeError(err), loadingStep: false });
        });
    } else {
      executeBridge(newSession)
        .then(() => {
          updateSession(sessionId, { loadingStep: false });
        })
        .catch(err => {
          updateSession(sessionId, { error: classifyBridgeError(err), loadingStep: false });
        });
    }
  }, [
    inputToken,
    destinationChain,
    inputAmount,
    feePaymentMethod,
    swapQuote,
    bridgeQuote,
    saveSessions,
    clearSetupForm,
    executeSwap,
    executeBridge,
    updateSession,
    quoteTimestamp,
  ]);

  const dismissSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== sessionId);
      saveSessions(next);
      return next;
    });
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
    }
  }, [activeSessionId, saveSessions]);

  const recoverBackendSessions = useCallback(async () => {
    if (!evmAddress && !stellarAddress) return;
    try {
      const wallets = useWalletStore.getState().connectedWallets;
      const [evmOrdersRaw, stellarOrdersRaw] = await Promise.all([
        evmAddress ? getSwapOrdersByWallet(evmAddress, 1, 10) : Promise.resolve({ data: [] }),
        stellarAddress ? getSwapOrdersByWallet(stellarAddress, 1, 10) : Promise.resolve({ data: [] }),
      ]);

      const allBackendOrders = [
        ...(evmOrdersRaw?.data || []),
        ...(stellarOrdersRaw?.data || []),
      ] as BackendOrder[];

      const ordersByGroup = new Map<string, BackendOrder[]>();
      allBackendOrders.forEach(order => {
        if (order.requestId) {
          if (!ordersByGroup.has(order.requestId)) ordersByGroup.set(order.requestId, []);
          ordersByGroup.get(order.requestId)!.push(order);
        }
      });

      setSessions(prev => {
        const existingGroupIds = new Set(prev.map(s => s.groupId).filter(Boolean));
        const newSessions: BridgeSession[] = [];

        for (const [groupId, orders] of ordersByGroup) {
          if (existingGroupIds.has(groupId)) continue;
          const recovered = mapBackendOrderToSession(orders, wallets);
          if (recovered) newSessions.push(recovered);
        }

        if (newSessions.length === 0) return prev;
        const merged = [...prev, ...newSessions];
        saveSessions(merged);
        return merged;
      });

      setSessions(current => {
        const pending = current
          .filter(s => s.phase !== 'DONE' && s.phase !== 'SETUP')
          .sort((a, b) => b.createdAt - a.createdAt);
        if (pending.length > 0 && !activeSessionId) {
          setActiveSessionId(pending[0].id);
        }
        return current;
      });
    } catch (err) {
      console.error('Backend session recovery failed:', err);
    }
  }, [evmAddress, stellarAddress, currentNetwork, saveSessions, activeSessionId]);

  const reconcileWithBackend = useCallback(async (currentSessions: BridgeSession[]) => {
    if (!evmAddress) return;

    const sessionsToCheck = currentSessions.filter(s =>
      s.phase !== 'DONE' &&
      s.groupId &&
      !s.groupId.startsWith('legacy-') &&
      (s.bridgeTx.hash || s.depositTx.hash)
    );

    if (sessionsToCheck.length === 0) return;

    try {
      const fetchOrders = async (address: string) => {
        const [p1, p2] = await Promise.allSettled([
          getSwapOrdersByWallet(address, 1, 10),
          getSwapOrdersByWallet(address, 2, 10),
        ]);
        const orders: SDKAny[] = [];
        if (p1.status === 'fulfilled' && Array.isArray(p1.value?.data)) orders.push(...p1.value.data);
        if (p2.status === 'fulfilled' && Array.isArray(p2.value?.data)) orders.push(...p2.value.data);
        return orders;
      };

      const [evmOrders, stellarOrders] = await Promise.all([
        fetchOrders(evmAddress),
        stellarAddress ? fetchOrders(stellarAddress) : Promise.resolve([] as SDKAny[]),
      ]);

      const seenHashes = new Set<string>();
      const allOrders: SDKAny[] = [];
      for (const o of [...evmOrders, ...stellarOrders]) {
        if (o?.txHash && !seenHashes.has(o.txHash.toLowerCase())) {
          seenHashes.add(o.txHash.toLowerCase());
          allOrders.push(o);
        }
      }

      const ordersByGroupId = new Map<string, SDKAny[]>();
      for (const o of allOrders) {
        if (o?.requestId) {
          if (!ordersByGroupId.has(o.requestId)) ordersByGroupId.set(o.requestId, []);
          ordersByGroupId.get(o.requestId)!.push(o);
        }
      }

      for (const session of sessionsToCheck) {
        const groupOrders = ordersByGroupId.get(session.groupId);
        if (!groupOrders || groupOrders.length === 0) continue;

        const srbOrder = groupOrders.find(o => o.provider === 'SRBTODYDX' || o.provider === 'ALLBRIDGE');
        const dydxOrder = groupOrders.find(o => o.provider === 'DYDX');

        if (srbOrder && session.phase === 'BRIDGE' && session.bridgeTx.hash) {
          const backendStatus: TxStatus =
            srbOrder.status === 'completed' ? 'SUCCESS' :
              srbOrder.status === 'failed' ? 'FAILED' : 'PENDING';

          if (session.bridgeTx.status !== backendStatus) {
            updateSession(session.id, {
              bridgeTx: { ...session.bridgeTx, status: backendStatus },
              ...(backendStatus === 'SUCCESS' ? {
                phase: 'DEPOSIT',
                intermediateAmount: srbOrder.amountOut ? String(srbOrder.amountOut) : session.intermediateAmount,
              } : {}),
            });
          }
        }
        if (dydxOrder && (session.phase === 'DEPOSIT' || session.phase === 'BRIDGE')) {
          const backendDydxStatus: TxStatus =
            dydxOrder.status === 'completed' ? 'SUCCESS' :
              dydxOrder.status === 'failed' ? 'FAILED' : 'PENDING';

          const currentDepositHash = session.depositTx?.hash;
          const backendHash = dydxOrder.txHash?.trim();

          if (!currentDepositHash && backendHash) {
            updateSession(session.id, {
              bridgeTx: { ...session.bridgeTx, status: 'SUCCESS' },
              phase: backendDydxStatus === 'SUCCESS' ? 'DONE' : 'DEPOSIT',
              depositTx: { hash: backendHash, status: backendDydxStatus },
              intermediateAmount: dydxOrder.amountIn ? String(dydxOrder.amountIn) : session.intermediateAmount,
            });
          } else if (currentDepositHash && session.depositTx.status !== backendDydxStatus) {
            updateSession(session.id, {
              depositTx: { hash: currentDepositHash, status: backendDydxStatus },
              ...(backendDydxStatus === 'SUCCESS' ? { phase: 'DONE' } : {}),
            });
          }
        }
      }
    } catch (err) {
      console.error('Backend reconciliation error:', err);
    }
  }, [evmAddress, stellarAddress, updateSession]);

  useEffect(() => {
    try {
      const config = getStellarConfig(currentNetwork);
      setAmmService(new AmmSwapService(config.horizonUrl, config.networkPassphrase, config.chainId));
    } catch (err) {
      console.error('Failed to init AmmSwapService:', err);
    }
  }, [currentNetwork]);

  useEffect(() => {
    fetchStellarAssets();
  }, [fetchStellarAssets]);

  useEffect(() => {
    if (assetParam && stellarAssets.length > 0) {
      const found = stellarAssets.find(a => a.symbol.toUpperCase() === assetParam.toUpperCase());
      if (found) setInputToken(found);
    }
  }, [assetParam, stellarAssets]);

  useEffect(() => {
    if (isRestored && !destinationChain) {
      const evmChains = getEvmChainsForNetwork(currentNetwork);
      const arb = evmChains.find(c => c.chainId === 42161 || c.slug === 'arb');
      setDestinationChain(arb || evmChains[0] || null);
    }
  }, [currentNetwork, destinationChain, isRestored]);

  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    try {
      const saved = localStorage.getItem(BRIDGE_STEP_KEY);
      const wallets = connectedWallets;

      if (!saved || Object.keys(wallets).length === 0) {
        setSessions([]);
        setActiveSessionId(null);
        return;
      }

      const parsed = JSON.parse(saved.trim().replace(/\u201c|\u201d/g, '"'));
      if (!Array.isArray(parsed)) {
        setSessions([]);
        setActiveSessionId(null);
        return;
      }

      const userSessions = (parsed.filter(p =>
        isTxOwnedByCurrentUser(p, wallets)
      ) as SDKAny[]).map(p => ({
        id: p.id || `session-${Date.now()}`,
        groupId: p.groupId || `legacy-${p.id || Date.now()}`,
        createdAt: p.createdAt || Date.now(),
        phase: p.phase || 'SETUP',
        inputAmount: p.inputAmount || '',
        inputTokenSymbol: p.inputTokenSymbol || 'USDC',
        destinationChainId: Number(p.destinationChainId || 42161),
        swapTx: p.swapTx || { hash: null, status: null },
        bridgeTx: p.bridgeTx || { hash: null, status: null },
        depositTx: p.depositTx || { hash: null, status: null },
        intermediateAmount: p.intermediateAmount || null,
        feePaymentMethod: p.feePaymentMethod || FeePaymentMethod.WITH_STABLECOIN,
        requiredWallets: p.requiredWallets || {
          evm: wallets.evm?.address,
          stellar: wallets.stellar?.address,
          dydx: wallets.evm?.dydxAddress || wallets.cosmos?.dydxAddress,
        },
        error: p.error
          ? (typeof p.error === 'string' ? { message: p.error, action: 'Tap Try Again to retry this step.' } : p.error)
          : null,
        loadingStep: false,
        expectedSwapOutput: p.expectedSwapOutput || null,
        expectedBridgeOutput: p.expectedBridgeOutput || null,
        dydxSteps: p.dydxSteps || [],
        dydxOverallState: p.dydxOverallState || '',
        bridgeStartedAt: p.bridgeStartedAt || null,
        expectedBridgeTimeMs: p.expectedBridgeTimeMs || null,
      })) as BridgeSession[];

      setSessions(userSessions);

      const needsAction = userSessions
        .filter(s => s.phase !== 'DONE' && s.phase !== 'SETUP')
        .filter(s => {
          if (s.phase === 'SWAP') return true;
          if (s.phase === 'BRIDGE' && !s.bridgeTx?.hash) return true;
          if (s.phase === 'DEPOSIT' && s.bridgeTx?.status === 'SUCCESS' && !s.depositTx?.hash) return true;
          if (s.error) return true;
          return false;
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      setActiveSessionId(needsAction.length > 0 ? needsAction[0].id : null);
    } catch (err) {
      console.error('Failed to restore bridge sessions', err);
      setSessions([]);
      setActiveSessionId(null);
    } finally {
      setIsRestored(true);
      recoverBackendSessions();
    }
  }, [connectedWallets]);

  // useEffect(() => {
  //   if (!isRestored) return;
  //   recoverBackendSessions();
  // }, [isRestored, recoverBackendSessions]);

  useEffect(() => {
    if (!isRestored) return;

    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      setSwapQuote(null);
      setBridgeQuote(null);
      setDepositQuote(null);
      setRawQuotes(null);
      setSetupError(null);
      setQuoteTimestamp(null);
      return;
    }

    if (activeSessionId) return;

    // Clear quotes immediately when inputAmount changes
    setSwapQuote(null);
    setBridgeQuote(null);
    setDepositQuote(null);
    setRawQuotes(null);
    setSetupError(null);
    setQuoteTimestamp(null);

    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;

    const timer = setTimeout(() => {
      if (!isQuotingRef.current) {
        fetchAllQuotes(inputAmount, controller.signal);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [inputAmount, inputToken, destinationChain, fetchAllQuotes, isRestored, activeSessionId]);

  useEffect(() => {
    if (activeSessionId || !inputAmount || parseFloat(inputAmount) <= 0) return;

    let localController: AbortController | null = null;
    const interval = setInterval(() => {
      if (!isQuotingRef.current) {
        quoteAbortRef.current?.abort();
        localController = new AbortController();
        quoteAbortRef.current = localController;
        fetchAllQuotes(inputAmount, localController.signal);
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      localController?.abort();
    };
  }, [inputAmount, fetchAllQuotes, activeSessionId]);

  const sessionsRef = useRef<BridgeSession[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!evmAddress || !isRestored) return;

    const pollAllSessions = async () => {
      const currentSessions = sessionsRef.current;
      if (currentSessions.length === 0) return;

      const activeSessions = currentSessions.filter(s => {
        if (s.phase === 'DONE') return false;
        return (
          (s.phase === 'BRIDGE' && s.bridgeTx.hash && s.bridgeTx.status === 'PENDING') ||
          (s.phase === 'DEPOSIT' && s.depositTx.hash && s.depositTx.status === 'PENDING')
        );
      });

      const pendingBridges = activeSessions.filter(
        s => s.phase === 'BRIDGE' && s.bridgeTx.hash && s.bridgeTx.status === 'PENDING'
      );

      for (const session of pendingBridges) {
        try {
          const res = await getTransactionStatus({
            walletType: 'SRB',
            txHash: session.bridgeTx.hash!,
            provider: 'ALLBRIDGE',
          });

          if (res.receive && res.receive.txId) {
            updateSession(session.id, {
              bridgeTx: { ...session.bridgeTx, status: 'SUCCESS' },
              phase: 'DEPOSIT',
              intermediateAmount: res.receive.amountFormatted?.toString() || session.intermediateAmount,
            });
            updateSwapOrderStatus({ txHash: session.bridgeTx.hash!, orderStatus: 'completed' }).catch(console.error);
            showToast({
              type: 'BRIDGE',
              title: 'Bridge Funds Arrived',
              message: 'Funds have successfully crossed the bridge. You can now settle them to dYdX.',
            });
          } else if (res.isSuspended) {
            updateSession(session.id, { bridgeTx: { ...session.bridgeTx, status: 'FAILED' } });
            updateSwapOrderStatus({ txHash: session.bridgeTx.hash!, orderStatus: 'failed' }).catch(console.error);
          } else {
            const elapsed = Date.now() - (session.bridgeStartedAt || session.createdAt);
            if (elapsed > 60 * 60 * 1000) {
              updateSession(session.id, { bridgeTx: { ...session.bridgeTx, status: 'FAILED' } });
              updateSwapOrderStatus({ txHash: session.bridgeTx.hash!, orderStatus: 'failed' }).catch(console.error);
            }
          }
        } catch (err: any) {
          console.error('Allbridge poll error:', err);
          const elapsed = Date.now() - (session.bridgeStartedAt || session.createdAt);
          if (err?.message?.toLowerCase().includes('not found') && elapsed > 60 * 60 * 1000) {
            updateSession(session.id, { bridgeTx: { ...session.bridgeTx, status: 'FAILED' } });
            updateSwapOrderStatus({ txHash: session.bridgeTx.hash!, orderStatus: 'failed' }).catch(console.error);
          }
        }
      }
      const pendingDeposits = activeSessions.filter(
        s => s.phase === 'DEPOSIT' && s.depositTx.hash && s.depositTx.status === 'PENDING'
      );

      for (const session of pendingDeposits) {
        try {
          const url = `https://api.skip.build/v2/tx/status?chain_id=${session.destinationChainId}&tx_hash=${session.depositTx.hash}`;
          const skipRes = await fetch(url);

          if (!skipRes.ok) {
            const errorText = await skipRes.text();
            const elapsed = Date.now() - (session.bridgeStartedAt || session.createdAt);
            if (errorText.includes('tx not found') && elapsed > 60 * 60 * 1000) {
              updateSession(session.id, { depositTx: { ...session.depositTx, status: 'FAILED' } });
              updateSwapOrderStatus({ txHash: session.depositTx.hash!, orderStatus: 'failed' }).catch(console.error);
            }
            continue;
          }

          const skipData = await skipRes.json();
          const state: string = skipData.state ?? 'STATE_UNKNOWN';
          const isSuccess = state === 'STATE_COMPLETED_SUCCESS';
          const isError = state === 'STATE_COMPLETED_ERROR' || state === 'STATE_ABANDONED';

          const parsedSteps = (skipData.transfer_sequence || []).map((step: SDKAny, idx: number) => {
            const opKey = Object.keys(step).find(k => k.endsWith('_transfer')) ?? 'unknown';
            const inner = step[opKey] ?? step;
            const txs = inner.packet_txs ?? inner.txs ?? {};
            return {
              index: idx,
              state: inner.state === 'CCTP_TRANSFER_RECEIVED' ? 'TRANSFER_RECEIVED' : (inner.state ?? 'TRANSFER_UNKNOWN'),
              packet_txs: {
                send_tx: txs.send_tx ? { explorer_link: txs.send_tx.explorer_link } : null,
                receive_tx: txs.receive_tx ? { explorer_link: txs.receive_tx.explorer_link } : null,
              },
              type: opKey,
            };
          });

          if (isSuccess) {
            updateSession(session.id, {
              depositTx: { ...session.depositTx, status: 'SUCCESS' },
              phase: 'DONE',
              dydxSteps: parsedSteps,
              dydxOverallState: state,
            });
            updateSwapOrderStatus({ txHash: session.depositTx.hash!, orderStatus: 'completed' }).catch(console.error);
            showToast({
              type: 'DYDX',
              title: 'Deposit Completed',
              message: 'Funds are fully deposited into your dYdX subaccount.',
            });
            setTimeout(() => dismissSession(session.id), 4000);
          } else if (isError) {
            updateSession(session.id, {
              depositTx: { ...session.depositTx, status: 'FAILED' },
              dydxSteps: parsedSteps,
              dydxOverallState: state,
            });
            updateSwapOrderStatus({ txHash: session.depositTx.hash!, orderStatus: 'failed' }).catch(console.error);
          } else {
            updateSession(session.id, { dydxSteps: parsedSteps, dydxOverallState: state });
          }
        } catch (err: any) {
          console.error('Skip poll error:', err);
          const elapsed = Date.now() - (session.bridgeStartedAt || session.createdAt);
          if (err?.message?.toLowerCase().includes('not found') && elapsed > 60 * 60 * 1000) {
            updateSession(session.id, { depositTx: { ...session.depositTx, status: 'FAILED' } });
            updateSwapOrderStatus({ txHash: session.depositTx.hash!, orderStatus: 'failed' }).catch(console.error);
          }
        }
      }
      await reconcileWithBackend(currentSessions);
    };

    pollAllSessions();
    const interval = setInterval(pollAllSessions, 20000);
    return () => clearInterval(interval);
  }, [evmAddress, isRestored, updateSession, showToast, dismissSession, currentNetwork]);

  return {
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
    quoteTimestamp,
  };
};
