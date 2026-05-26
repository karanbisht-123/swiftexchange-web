import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { parseSwapError } from '../../../utils/swapErrorHandler';
import { useDydxDeposit } from '../../../../dydx/hooks/useDydxDeposit';
import { ChainSymbol, FeePaymentMethod, Messenger } from '@allbridge/bridge-core-sdk';
import { getEvmChainsForNetwork, type ChainConfig } from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import * as StellarSDK from '@stellar/stellar-sdk';
import { addLocalTransaction } from '../../../../evm/service/localTransactionService';
import { storeSwapOrder, getTransactionStatus } from '../../../../evm/service/evmTransactionStatusService';
import { useNotificationStore } from '../../../../../store/notificationStore';
import { isTxOwnedByCurrentUser } from '../../../../dydx/hooks/useTransactionTracker';

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------
const STELLAR_CHAIN_ID = 'pubnet';
const BRIDGE_STEP_KEY = 'stellar_dydx_bridge_step';
const DEFAULT_SLIPPAGE = 1.0;

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

export interface BridgeSession {
  id: string;
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
  error: string | null;
  loadingStep: boolean;
  expectedSwapOutput?: string | null;
  expectedBridgeOutput?: string | null;
  dydxSteps?: any[];
  dydxOverallState?: string;
}

const sanitizeAmount = (val: any, decimals: number = 7): string => {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val);
  const parts = str.split('.');
  if (parts.length <= 1) return str;
  return `${parts[0]}.${parts[1].slice(0, decimals)}`;
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

  // Ephemeral Setup Form State
  const [inputAmount, setInputAmount] = useState<string>('');
  const [inputToken, setInputToken] = useState<StellarToken | null>(null);
  const [destinationChain, setDestinationChain] = useState<ChainConfig | null>(null);
  const [feePaymentMethod, setFeePaymentMethod] = useState<FeePaymentMethod>(FeePaymentMethod.WITH_STABLECOIN);

  const [stellarAssets, setStellarAssets] = useState<StellarToken[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);

  // Setup Quotes
  const [isQuoting, setIsQuoting] = useState(false);
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [bridgeQuote, setBridgeQuote] = useState<BridgeQuote | null>(null);
  const [depositQuote, setDepositQuote] = useState<DepositQuote | null>(null);
  const [rawQuotes, setRawQuotes] = useState<{ swap: SwapQuote | null; bridge: BridgeQuote | null; dydx: DepositQuote | null } | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Session Management State
  const [sessions, setSessions] = useState<BridgeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isRestored, setIsRestored] = useState(false);

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

  const isUsdc = inputToken?.symbol?.toUpperCase() === 'USDC';

  // ---------------------------------------------------------------------------
  // Load & Sync sessions from localStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BRIDGE_STEP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved.trim().replace(/”|“/g, '"'));
        const wallets = useWalletStore.getState().connectedWallets;
        if (Array.isArray(parsed)) {
          // Keep only current user's sessions that have at least one transaction hash
          const userSessions = (parsed.filter(p => isTxOwnedByCurrentUser(p, wallets) && (p.swapTx?.hash || p.bridgeTx?.hash || p.depositTx?.hash || p.swapTxHash || p.bridgeTxHash || p.depositTxHash)) as any[]).map(p => ({
            id: p.id || `session-${Date.now()}`,
            createdAt: p.createdAt || Date.now(),
            phase: p.phase || 'SETUP',
            inputAmount: p.inputAmount || '',
            inputTokenSymbol: p.inputTokenSymbol || 'USDC',
            destinationChainId: Number(p.destinationChainId || 42161),
            swapTx: p.swapTx || { hash: p.swapTxHash || null, status: p.swapStatus || null },
            bridgeTx: p.bridgeTx || { hash: p.bridgeTxHash || null, status: p.bridgeStatus || null },
            depositTx: p.depositTx || { hash: p.depositTxHash || null, status: p.depositStatus || null },
            intermediateAmount: p.intermediateAmount || null,
            feePaymentMethod: p.feePaymentMethod || FeePaymentMethod.WITH_STABLECOIN,
            requiredWallets: p.requiredWallets || {
              evm: wallets.evm?.address,
              stellar: wallets.stellar?.address,
              dydx: wallets.evm?.dydxAddress || wallets.cosmos?.dydxAddress
            },
            error: p.error || null,
            loadingStep: false,
            expectedSwapOutput: p.expectedSwapOutput || p.swapQuote?.estimatedOutput || null,
            expectedBridgeOutput: p.expectedBridgeOutput || p.bridgeQuote?.amountToBeReceived || null,
            dydxSteps: p.dydxSteps || [],
            dydxOverallState: p.dydxOverallState || '',
          })) as BridgeSession[];
          setSessions(userSessions);
          // If there is exactly one active in-progress session, set it active automatically only if a transaction is pending on-chain
          const inProgress = userSessions.filter(s => s.phase !== 'DONE' && !(s.phase === 'SETUP'));
          if (inProgress.length === 1) {
            const session = inProgress[0];
            const isPendingOnChain = session.swapTx?.status === 'PENDING' || session.bridgeTx?.status === 'PENDING' || session.depositTx?.status === 'PENDING';
            if (isPendingOnChain) {
              setActiveSessionId(session.id);
            }
          }
        } else if (parsed && typeof parsed === 'object') {
          // Migrating legacy single session format if it has at least one transaction hash
          if (isTxOwnedByCurrentUser(parsed, wallets) && (parsed.swapTxHash || parsed.bridgeTxHash || parsed.depositTxHash || parsed.swapTx?.hash || parsed.bridgeTx?.hash || parsed.depositTx?.hash)) {
            const legacySession: BridgeSession = {
              id: parsed.id || `legacy-${Date.now()}`,
              createdAt: parsed.createdAt || Date.now(),
              phase: parsed.phase || 'SETUP',
              inputAmount: parsed.inputAmount || '',
              inputTokenSymbol: parsed.inputTokenSymbol || 'USDC',
              destinationChainId: Number(parsed.destinationChainId || 42161),
              swapTx: { hash: parsed.swapTxHash || null, status: parsed.swapStatus || null },
              bridgeTx: { hash: parsed.bridgeTxHash || null, status: parsed.bridgeStatus || null },
              depositTx: { hash: parsed.depositTxHash || null, status: parsed.depositStatus || null },
              intermediateAmount: parsed.intermediateAmount || null,
              feePaymentMethod: parsed.feePaymentMethod || FeePaymentMethod.WITH_STABLECOIN,
              requiredWallets: parsed.requiredWallets || {
                evm: wallets.evm?.address,
                stellar: wallets.stellar?.address,
                dydx: wallets.evm?.dydxAddress || wallets.cosmos?.dydxAddress
              },
              error: parsed.error || null,
              loadingStep: false,
            };
            setSessions([legacySession]);
            const isLegacyPendingOnChain = legacySession.swapTx?.status === 'PENDING' || legacySession.bridgeTx?.status === 'PENDING' || legacySession.depositTx?.status === 'PENDING';
            if (legacySession.phase !== 'DONE' && isLegacyPendingOnChain) {
              setActiveSessionId(legacySession.id);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore bridge sessions', err);
    } finally {
      setIsRestored(true);
    }
  }, []);

  const saveSessions = useCallback((updated: BridgeSession[]) => {
    try {
      const wallets = useWalletStore.getState().connectedWallets;
      const saved = localStorage.getItem(BRIDGE_STEP_KEY);
      let arr: any[] = [];
      if (saved) {
        const parsed = JSON.parse(saved);
        // Keep other users' transactions intact in localStorage
        arr = (Array.isArray(parsed) ? parsed : [parsed]).filter(p => !isTxOwnedByCurrentUser(p, wallets));
      }
      // Only persist sessions that have actually started a transaction (has a hash)
      const sessionsToSave = updated.filter(s => s.swapTx?.hash || s.bridgeTx?.hash || s.depositTx?.hash);
      arr.push(...sessionsToSave);
      localStorage.setItem(BRIDGE_STEP_KEY, JSON.stringify(arr));
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


  const getStellarAsset = (symbol: string): StellarSDK.Asset | null => {
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
  };


  useEffect(() => {
    try {
      const config = getStellarConfig(currentNetwork);
      setAmmService(new AmmSwapService(config.horizonUrl, config.networkPassphrase, config.chainId));
    } catch (err) {
      console.error('Failed to init AmmSwapService:', err);
    }
  }, [currentNetwork]);

  const fetchStellarAssets = useCallback(async () => {
    if (!ammService || !stellarAddress) return;
    try {
      setLoadingAssets(true);
      const { tokens: balances, subentryCount } = await ammService.getAssetsWithBalances(stellarAddress);
      const reserve = 1 + subentryCount * 0.5;
      const mapped: StellarToken[] = balances
        .filter((b: any) => b && b.asset)
        .map((b: any) => {
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

  useEffect(() => {
    fetchStellarAssets();
  }, [fetchStellarAssets]);

  // Handle assetParam
  useEffect(() => {
    if (assetParam && stellarAssets.length > 0) {
      const found = stellarAssets.find(a => a.symbol.toUpperCase() === assetParam.toUpperCase());
      if (found) setInputToken(found);
    }
  }, [assetParam, stellarAssets]);

  // Set default destination chain
  useEffect(() => {
    if (isRestored && !destinationChain) {
      const evmChains = getEvmChainsForNetwork(currentNetwork);
      const arb = evmChains.find(c => c.chainId === 42161 || c.slug === 'arb');
      setDestinationChain(arb || evmChains[0] || null);
    }
  }, [currentNetwork, destinationChain, isRestored]);

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const targetEvmChainId = useMemo(() => {
    if (activeSession) return activeSession.destinationChainId;
    return destinationChain?.chainId || null;
  }, [activeSession, destinationChain]);

  // Automatically switch EVM wallet network when target EVM chain ID changes
  useEffect(() => {
    if (!targetEvmChainId || !evmAddress) return;
    const provider = getProvider(WalletType.EVM);
    if (provider) {
      console.debug('[Orchestrator Hook] Auto-switching EVM wallet network to target chain ID:', targetEvmChainId);
      switchOrAddChain(provider, targetEvmChainId).catch(err => {
        console.warn('[Orchestrator Hook] Failed to auto-switch EVM wallet network:', err);
      });
    }
  }, [targetEvmChainId, evmAddress, getProvider]);

  // ---------------------------------------------------------------------------
  // Quotes Fetcher
  // ---------------------------------------------------------------------------
  const fetchAllQuotes = useCallback(async (amount: string, signal: AbortSignal) => {
    if (!amount || parseFloat(amount) <= 0 || !inputToken || !ammService || !destinationChain) {
      setSwapQuote(null);
      setBridgeQuote(null);
      setDepositQuote(null);
      setRawQuotes(null);
      return;
    }

    setIsQuoting(true);
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

      const dstUsdcAmount = bq.amountToBeReceived;
      if (!dstUsdcAmount) throw new Error('Could not determine deposit amount');

      const dr = await getRoute('USDC', parseFloat(dstUsdcAmount.toString()), destinationChain.chainId, false);
      if (signal.aborted) return;
      if (!dr) throw new Error('No deposit route to dYdX found. Try another chain.');
      setDepositQuote(dr as DepositQuote);

      setRawQuotes({ swap: finalSwapQuote, bridge: bq, dydx: dr as DepositQuote });
    } catch (err: any) {
      if (signal.aborted) return;
      console.error('Quote error:', err);
      setSetupError(err.message || 'Failed to fetch quotes');
    } finally {
      setIsQuoting(false);
    }
  }, [inputToken, ammService, stellarAssets, destinationChain, getRoute]);

  // Quote triggers on form input change
  useEffect(() => {
    if (!isRestored || !inputAmount || parseFloat(inputAmount) <= 0 || activeSessionId) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!isQuoting) {
        fetchAllQuotes(inputAmount, controller.signal);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [inputAmount, inputToken, destinationChain, fetchAllQuotes, isRestored, activeSessionId]);

  // Setup form Quote refresh timer
  useEffect(() => {
    if (activeSessionId || !inputAmount || parseFloat(inputAmount) <= 0) return;

    const controller = new AbortController();
    const interval = setInterval(() => {
      if (!isQuoting) {
        fetchAllQuotes(inputAmount, controller.signal);
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [inputAmount, fetchAllQuotes, activeSessionId]);

  // Clear Setup Form State helper
  const clearSetupForm = useCallback(() => {
    setInputAmount('');
    setSwapQuote(null);
    setBridgeQuote(null);
    setDepositQuote(null);
    setRawQuotes(null);
    setSetupError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Action Handlers (Swap, Bridge, Deposit)
  // ---------------------------------------------------------------------------
  const executeSwap = useCallback(async (session: BridgeSession): Promise<boolean> => {
    if (!ammService || !stellarAddress) return false;
    try {
      const provider = getProvider(WalletType.STELLAR) as any;
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

      const tx = await ammService.buildSwapTransaction(stellarAddress, freshSwapQuote as any, {
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
    } catch (err: any) {
      updateSession(session.id, { error: parseSwapError(err) });
      return false;
    }
  }, [ammService, stellarAddress, getProvider, currentNetwork, updateSession, showToast, stellarAssets]);

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
        feePaymentMethod: session.feePaymentMethod,
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
        updateSession(session.id, {
          bridgeTx: { hash: result.hash, status: 'PENDING' },
          intermediateAmount: freshBridgeQuote.amountToBeReceived,
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
          walletAddress: evmAddress!,
          provider: 'ALLBRIDGE',
          fromChain: 'SRB',
          fromToken: 'USDC',
          toChain: sessionChain.symbol ?? '',
          toToken: 'USDC',
          amountIn: bridgeInputAmount,
          amountOut: freshBridgeQuote.amountToBeReceived,
        }).catch(err => console.error('[Bridge] Failed to store Allbridge order:', err));

        showToast({
          type: 'BRIDGE',
          title: 'Bridge Initiated',
          message: `Your USDC is crossing to ${sessionChain.name}. This usually takes ~2-15 minutes.`,
        });
      }

      if (!result.success) throw new Error(result.error || 'Transaction failed');
      return true;
    } catch (err: any) {
      updateSession(session.id, { error: parseSwapError(err) });
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

      // Safeguard: Force wallet provider to switch to the correct destination EVM chain before queries/transactions
      const provider = getProvider(WalletType.EVM);
      if (provider) {
        console.debug('[Orchestrator Hook] Switching EVM wallet network to destination chain:', sessionChain.chainId);
        await switchOrAddChain(provider, sessionChain.chainId);
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
          console.debug('[Orchestrator Hook] Deposit transaction broadcast callback. Hash:', hash);
          // Track locally with provider: 'SKIP' immediately as soon as broadcasted
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

          // Update orchestrator session status immediately
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
    } catch (err: any) {
      updateSession(session.id, { error: err.message || 'Deposit failed' });
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
        if (ok) {
          updateSession(sessionId, { phase: 'BRIDGE', loadingStep: false });
        } else {
          updateSession(sessionId, { loadingStep: false });
        }
      } else if (session.phase === 'BRIDGE') {
        await executeBridge(session);
        updateSession(sessionId, { loadingStep: false });
      } else if (session.phase === 'DEPOSIT') {
        await executeDeposit(session);
        updateSession(sessionId, { loadingStep: false });
      }
    } catch (err: any) {
      updateSession(sessionId, { error: err.message || 'Execution failed', loadingStep: false });
    }
  }, [sessions, executeSwap, executeBridge, executeDeposit, updateSession]);

  // ---------------------------------------------------------------------------
  // Create New Session Action
  // ---------------------------------------------------------------------------
  const createSession = useCallback(async () => {
    if (!inputToken || !destinationChain || !inputAmount) return;

    const wallets = useWalletStore.getState().connectedWallets;
    const sessionId = `bridge-${Date.now()}`;

    const newSession: BridgeSession = {
      id: sessionId,
      createdAt: Date.now(),
      phase: inputToken.symbol === 'USDC' ? 'BRIDGE' : 'SWAP',
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
    };

    setSessions(prev => {
      const next = [...prev, newSession];
      saveSessions(next);
      return next;
    });

    setActiveSessionId(sessionId);
    clearSetupForm();

    // Auto-execute the first step immediately to save the user an extra click!
    if (newSession.phase === 'SWAP') {
      executeSwap(newSession)
        .then(ok => {
          if (ok) {
            updateSession(sessionId, { phase: 'BRIDGE', loadingStep: false });
          } else {
            updateSession(sessionId, { loadingStep: false });
          }
        })
        .catch(err => {
          console.error('[Orchestrator Hook] Swap execution failed:', err);
          updateSession(sessionId, { error: err.message || 'Swap execution failed', loadingStep: false });
        });
    } else if (newSession.phase === 'BRIDGE') {
      executeBridge(newSession)
        .then(() => {
          updateSession(sessionId, { loadingStep: false });
        })
        .catch(err => {
          console.error('[Orchestrator Hook] Bridge execution failed:', err);
          updateSession(sessionId, { error: err.message || 'Bridge execution failed', loadingStep: false });
        });
    }
  }, [
    inputToken,
    destinationChain,
    inputAmount,
    feePaymentMethod,
    swapQuote,
    bridgeQuote,
    depositQuote,
    saveSessions,
    clearSetupForm,
    executeSwap,
    executeBridge,
    updateSession
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

  // ---------------------------------------------------------------------------
  // Background Poll Loop for All Active Sessions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (sessions.length === 0) return;

    const checkStatus = async () => {
      // 1. Check Allbridge status for sessions in BRIDGE phase with PENDING status
      const pendingBridges = sessions.filter(s => s.phase === 'BRIDGE' && s.bridgeTx.hash && s.bridgeTx.status === 'PENDING');
      for (const session of pendingBridges) {
        try {
          console.debug('[Orchestrator Hook] Polling Allbridge status for:', session.bridgeTx.hash);
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
            showToast({
              type: 'BRIDGE',
              title: 'Bridge Funds Arrived',
              message: `Funds have successfully crossed the bridge. You can now settle them to dYdX.`,
            });
          } else if (res.isSuspended) {
            updateSession(session.id, {
              bridgeTx: { ...session.bridgeTx, status: 'FAILED' },
            });
          }
        } catch (err) {
          console.error('[Orchestrator Hook] Allbridge status poll error:', err);
        }
      }

      // 2. Check Skip status API for sessions in DEPOSIT phase with PENDING status
      const pendingDeposits = sessions.filter(s => s.phase === 'DEPOSIT' && s.depositTx.hash && s.depositTx.status === 'PENDING');
      for (const session of pendingDeposits) {
        try {
          console.debug('[Orchestrator Hook] Polling Skip status for:', session.depositTx.hash);
          const url = `https://api.skip.build/v2/tx/status?chain_id=${session.destinationChainId}&tx_hash=${session.depositTx.hash}`;
          const skipRes = await fetch(url);
          if (skipRes.ok) {
            const skipData = await skipRes.json();
            const state = skipData.state ?? 'STATE_UNKNOWN';
            const isTerminalSuccess = state === 'STATE_COMPLETED_SUCCESS';
            const isTerminalError = state === 'STATE_COMPLETED_ERROR' || state === 'STATE_ABANDONED';

            // Parse steps
            const steps = skipData.transfer_sequence || [];
            const parsedSteps = steps.map((s: any, idx: number) => {
              const opKey = Object.keys(s).find(k => k.endsWith('_transfer')) ?? 'unknown';
              const inner = s[opKey] ?? s;
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

            if (isTerminalSuccess) {
              updateSession(session.id, {
                depositTx: { ...session.depositTx, status: 'SUCCESS' },
                phase: 'DONE',
                dydxSteps: parsedSteps,
                dydxOverallState: state,
              });
              showToast({
                type: 'DYDX',
                title: 'Deposit Completed',
                message: 'Funds are fully deposited into your dYdX subaccount.',
              });
            } else if (isTerminalError) {
              updateSession(session.id, {
                depositTx: { ...session.depositTx, status: 'FAILED' },
                dydxSteps: parsedSteps,
                dydxOverallState: state,
              });
            } else {
              updateSession(session.id, {
                dydxSteps: parsedSteps,
                dydxOverallState: state,
              });
            }
          }
        } catch (err) {
          console.error('[Orchestrator Hook] Skip status poll error:', err);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 20000);
    return () => clearInterval(interval);
  }, [sessions, updateSession, showToast, currentNetwork]);

  return {
    // Form setup state
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

    // Sessions state
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    dismissSession,
    executeSessionStep,
    updateSession,
  };
};
