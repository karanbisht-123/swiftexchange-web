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
import { getEvmChainsForNetwork, findChain, type ChainConfig } from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import * as StellarSDK from '@stellar/stellar-sdk';
import { addLocalTransaction } from '../../../../evm/service/localTransactionService';
import { storeSwapOrder, getTransactionStatus, getSwapOrdersByWallet, updateSwapOrderStatus } from '../../../../evm/service/evmTransactionStatusService';
import { useNotificationStore } from '../../../../../store/notificationStore';
import { isTxOwnedByCurrentUser } from '../../../../dydx/hooks/useTransactionTracker';

const STELLAR_CHAIN_ID = 'pubnet';
const BRIDGE_STEP_KEY = 'stellar_dydx_bridge_step';
const DEFAULT_SLIPPAGE = 1.0;

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
        .filter(s => s.swapTx?.hash || s.bridgeTx?.hash || s.depositTx?.hash)
        .map(s => ({
          id: s.id,
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
        phase: 'BRIDGE',
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
          provider: 'SRBTODYDX',
          fromChain: 'SRB',
          fromToken: 'USDC',
          toChain: sessionChain.symbol ?? '',
          toToken: 'USDC',
          amountIn: bridgeInputAmount,
          amountOut: freshBridgeQuote.amountToBeReceived,
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
          console.error('Swap execution failed:', err);
          updateSession(sessionId, { error: classifyBridgeError(err), loadingStep: false });
        });
    } else if (newSession.phase === 'BRIDGE') {
      executeBridge(newSession)
        .then(() => {
          updateSession(sessionId, { loadingStep: false });
        })
        .catch(err => {
          console.error('Bridge execution failed:', err);
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
    quoteTimestamp
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
      if (saved && Object.keys(wallets).length > 0) {
        const parsed = JSON.parse(saved.trim().replace(/\u201c|\u201d/g, '"'));
        if (Array.isArray(parsed)) {
          const userSessions = (parsed.filter(p => isTxOwnedByCurrentUser(p, wallets) && (p.swapTx?.hash || p.bridgeTx?.hash || p.depositTx?.hash || p.swapTxHash || p.bridgeTxHash || p.depositTxHash)) as SDKAny[]).map(p => ({
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
            error: p.error
              ? (typeof p.error === 'string' ? { message: p.error, action: 'Tap Try Again to retry this step.' } : p.error)
              : null,
            loadingStep: false,
            expectedSwapOutput: p.expectedSwapOutput || p.swapQuote?.estimatedOutput || null,
            expectedBridgeOutput: p.expectedBridgeOutput || p.bridgeQuote?.amountToBeReceived || null,
            dydxSteps: p.dydxSteps || [],
            dydxOverallState: p.dydxOverallState || '',
            bridgeStartedAt: p.bridgeStartedAt || null,
            expectedBridgeTimeMs: p.expectedBridgeTimeMs || null,
          })) as BridgeSession[];
          setSessions(userSessions);

          setActiveSessionId(prev => {
            if (prev && userSessions.some(s => s.id === prev)) return prev;
            const inProgress = userSessions.filter(s => s.phase !== 'DONE' && s.phase !== 'SETUP');
            if (inProgress.length === 1) {
              const session = inProgress[0];
              const isPendingOnChain =
                session.swapTx?.status === 'PENDING' ||
                session.bridgeTx?.status === 'PENDING' ||
                session.depositTx?.status === 'PENDING';
              if (isPendingOnChain) return session.id;
            }
            return null;
          });
        } else if (parsed && typeof parsed === 'object') {
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
              error: parsed.error
                ? (typeof parsed.error === 'string' ? { message: parsed.error, action: 'Tap Try Again to retry this step.' } : parsed.error)
                : null,
              loadingStep: false,
              bridgeStartedAt: parsed.bridgeStartedAt || null,
              expectedBridgeTimeMs: parsed.expectedBridgeTimeMs || null,
            };
            setSessions([legacySession]);
            setActiveSessionId(prev => {
              if (prev === legacySession.id) return prev;
              const isLegacyPendingOnChain =
                legacySession.swapTx?.status === 'PENDING' ||
                legacySession.bridgeTx?.status === 'PENDING' ||
                legacySession.depositTx?.status === 'PENDING';
              return legacySession.phase !== 'DONE' && isLegacyPendingOnChain ? legacySession.id : null;
            });
          } else {
            setSessions([]);
            setActiveSessionId(null);
          }
        } else {
          setSessions([]);
          setActiveSessionId(null);
        }
      } else {
        setSessions([]);
        setActiveSessionId(null);
      }
    } catch (err) {
      console.error('Failed to restore bridge sessions', err);
      setSessions([]);
      setActiveSessionId(null);
    } finally {
      setIsRestored(true);
    }
  }, [connectedWallets]);

  useEffect(() => {
    if (!isRestored || !inputAmount || parseFloat(inputAmount) <= 0 || activeSessionId) return;

    const controller = new AbortController();
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

    const controller = new AbortController();
    const interval = setInterval(() => {
      if (!isQuotingRef.current) {
        fetchAllQuotes(inputAmount, controller.signal);
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [inputAmount, fetchAllQuotes, activeSessionId]);

  useEffect(() => {
    if (sessions.length === 0) return;

    const checkStatus = async () => {
      const pendingSessions = sessions.filter(s => {
        if (s.phase === 'DONE') return false;
        // Only show sessions that have at least one genuinely pending step
        // Failed sessions should only appear in Transaction History, not the Bridge screen
        const hasPending =
          s.swapTx?.status === 'PENDING' ||
          s.bridgeTx?.status === 'PENDING' ||
          s.depositTx?.status === 'PENDING';
        const isErrored = !!s.error;
        return hasPending || isErrored;
      });

      const pendingBridges = pendingSessions.filter(s => s.phase === 'BRIDGE' && s.bridgeTx.hash && s.bridgeTx.status === 'PENDING');
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

            if (!session.id.startsWith('session-reconstructed-') && !session.id.startsWith('session-dydx-')) {
              showToast({
                type: 'BRIDGE',
                title: 'Bridge Funds Arrived',
                message: `Funds have successfully crossed the bridge. You can now settle them to dYdX.`,
              });
            }
          } else if (res.isSuspended) {
            updateSession(session.id, {
              bridgeTx: { ...session.bridgeTx, status: 'FAILED' },
            });
            updateSwapOrderStatus({ txHash: session.bridgeTx.hash!, orderStatus: 'failed' }).catch(console.error);
          }
        } catch (err: any) {
          console.error('Allbridge status poll error:', err);
          if (err?.message?.toLowerCase().includes('not found')) {
            const timeElapsed = Date.now() - (session.bridgeStartedAt || session.createdAt);
            if (timeElapsed > 60 * 60 * 1000) {
              updateSession(session.id, {
                bridgeTx: { ...session.bridgeTx, status: 'FAILED' },
              });
              updateSwapOrderStatus({ txHash: session.bridgeTx.hash!, orderStatus: 'failed' }).catch(console.error);
            }
          }
        }
      }

      const pendingDeposits = pendingSessions.filter((s: BridgeSession) => s.phase === 'DEPOSIT' && s.depositTx.hash && s.depositTx.status === 'PENDING');
      for (const session of pendingDeposits) {
        try {
          const url = `https://api.skip.build/v2/tx/status?chain_id=${session.destinationChainId}&tx_hash=${session.depositTx.hash}`;
          const skipRes = await fetch(url);
          if (skipRes.ok) {
            const skipData = await skipRes.json();
            const state = skipData.state ?? 'STATE_UNKNOWN';
            const isTerminalSuccess = state === 'STATE_COMPLETED_SUCCESS';
            const isTerminalError = state === 'STATE_COMPLETED_ERROR' || state === 'STATE_ABANDONED';

            const steps = skipData.transfer_sequence || [];
            const parsedSteps = steps.map((s: SDKAny, idx: number) => {
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
              updateSwapOrderStatus({ txHash: session.depositTx.hash!, orderStatus: 'completed' }).catch(console.error);

              if (session.id.startsWith('session-reconstructed-') || session.id.startsWith('session-dydx-')) {
                dismissSession(session.id);
              } else {
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
              }
            } else if (isTerminalError) {
              updateSession(session.id, {
                depositTx: { ...session.depositTx, status: 'FAILED' },
                dydxSteps: parsedSteps,
                dydxOverallState: state,
              });
              updateSwapOrderStatus({ txHash: session.depositTx.hash!, orderStatus: 'failed' }).catch(console.error);
            } else {
              updateSession(session.id, {
                dydxSteps: parsedSteps,
                dydxOverallState: state,
              });
            }
          } else {
             const errorData = await skipRes.text();
             if (errorData.includes('tx not found')) {
                 const timeElapsed = Date.now() - (session.bridgeStartedAt || session.createdAt);
                 if (timeElapsed > 60 * 60 * 1000) {
                     updateSession(session.id, {
                       depositTx: { ...session.depositTx, status: 'FAILED' },
                     });
                     updateSwapOrderStatus({ txHash: session.depositTx.hash!, orderStatus: 'failed' }).catch(console.error);
                 }
             }
          }
        } catch (err: any) {
          console.error('Skip status poll error:', err);
          if (err?.message?.toLowerCase().includes('not found')) {
            const timeElapsed = Date.now() - (session.bridgeStartedAt || session.createdAt);
            if (timeElapsed > 60 * 60 * 1000) {
              updateSession(session.id, {
                depositTx: { ...session.depositTx, status: 'FAILED' },
              });
              updateSwapOrderStatus({ txHash: session.depositTx.hash!, orderStatus: 'failed' }).catch(console.error);
            }
          }
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 20000);
    return () => clearInterval(interval);
  }, [sessions, updateSession, showToast, currentNetwork]);


  useEffect(() => {
    if (!evmAddress || !isRestored) return;

    const reconcileSessionsWithBackend = async () => {
      try {
        const ordersRes = await getSwapOrdersByWallet(evmAddress, 1, 10);
        if (!ordersRes || !Array.isArray(ordersRes.data)) return;

        setSessions(prev => {
          let updated = [...prev];
          let changed = false;

          // Gather all transaction hashes already claimed by existing sessions to prevent duplicates
          const claimedHashes = [
            ...updated.map(s => s?.depositTx?.hash),
            ...updated.map(s => s?.bridgeTx?.hash),
          ]
            .filter(Boolean)
            .map(h => h!.trim().toLowerCase());

          updated = updated.map(session => {
            if (!session) return session;
            let sessionUpdates: Partial<BridgeSession> = {};

            // Reconcile BRIDGE phase
            if (session.phase === 'BRIDGE' && session.bridgeTx?.hash) {
              const matchedOrder = ordersRes.data.find(
                o => o && o.txHash && typeof o.txHash === 'string' &&
                  o.txHash.trim().toLowerCase() === session.bridgeTx.hash?.trim().toLowerCase() &&
                  (o.provider === 'SRBTODYDX' || o.provider === 'ALLBRIDGE')
              );
              if (matchedOrder) {
                const newStatus: TxStatus = matchedOrder.status === 'completed'
                  ? 'SUCCESS'
                  : matchedOrder.status === 'failed'
                    ? 'FAILED'
                    : 'PENDING';

                if (session.bridgeTx.status !== newStatus) {
                  sessionUpdates.bridgeTx = { ...session.bridgeTx, status: newStatus };
                  if (newStatus === 'SUCCESS') {
                    sessionUpdates.phase = 'DEPOSIT';
                    if (matchedOrder.amountOut) {
                      sessionUpdates.intermediateAmount = String(matchedOrder.amountOut);
                    }
                  }
                  changed = true;
                }
              }

              // Check if a matching unclaimed dYdX deposit order exists on the backend
              const matchedDydxOrder = ordersRes.data.find(
                o => {
                  if (!o || o.provider !== 'DYDX') return false;
                  const txHashMatch = o.txHash && typeof o.txHash === 'string';
                  const notClaimed = txHashMatch && !claimedHashes.includes(o.txHash.trim().toLowerCase());
                  const timeBaseline = matchedOrder && matchedOrder.createdAt ? new Date(matchedOrder.createdAt).getTime() - 2 * 60 * 1000 : session.createdAt - 10 * 60 * 1000;
                  const timeMatch = o.createdAt && !isNaN(new Date(o.createdAt).getTime()) && new Date(o.createdAt).getTime() > timeBaseline;
                  const expectedAmtStr = sessionUpdates.intermediateAmount || session.intermediateAmount || session.expectedBridgeOutput || session.inputAmount || '0';
                  const amountMatch = o.amountIn && !isNaN(parseFloat(o.amountIn)) && !isNaN(parseFloat(expectedAmtStr)) && Math.abs(parseFloat(o.amountIn) - parseFloat(expectedAmtStr)) < 1.0;

                  return txHashMatch && notClaimed && timeMatch && amountMatch;
                }
              );

              if (matchedDydxOrder) {
                const newDydxStatus: TxStatus = matchedDydxOrder.status === 'completed'
                  ? 'SUCCESS'
                  : matchedDydxOrder.status === 'failed'
                    ? 'FAILED'
                    : 'PENDING';

                const targetPhase: Phase = newDydxStatus === 'SUCCESS' ? 'DONE' : 'DEPOSIT';

                if (
                  (sessionUpdates.bridgeTx?.status || session.bridgeTx.status) !== 'SUCCESS' ||
                  (sessionUpdates.phase || session.phase) !== targetPhase ||
                  (sessionUpdates.depositTx?.hash || session.depositTx?.hash) !== matchedDydxOrder.txHash?.trim() ||
                  (sessionUpdates.depositTx?.status || session.depositTx?.status) !== newDydxStatus
                ) {
                  sessionUpdates.bridgeTx = { ...session.bridgeTx, status: 'SUCCESS' };
                  sessionUpdates.phase = targetPhase;
                  sessionUpdates.depositTx = {
                    hash: (matchedDydxOrder.txHash && typeof matchedDydxOrder.txHash === 'string')
                      ? matchedDydxOrder.txHash.trim()
                      : (sessionUpdates.depositTx?.hash || session.depositTx?.hash || null),
                    status: newDydxStatus
                  };
                  if (matchedDydxOrder.amountIn) {
                    sessionUpdates.intermediateAmount = String(matchedDydxOrder.amountIn);
                  }
                  claimedHashes.push(matchedDydxOrder.txHash.trim().toLowerCase());
                  changed = true;
                }
              }
            }


            if (session.phase === 'DEPOSIT') {
              // Try to find the deposit order by transaction hash
              let matchedOrder = session.depositTx?.hash
                ? ordersRes.data.find(
                  o => o && o.txHash && typeof o.txHash === 'string' &&
                    o.txHash.trim().toLowerCase() === session.depositTx.hash?.trim().toLowerCase() &&
                    o.provider === 'DYDX'
                )
                : undefined;

              // If no hash was saved locally yet, check if there's a DYDX order created recently
              if (!matchedOrder && !session.depositTx?.hash) {
                const srbOrder = ordersRes.data.find(
                  o => o && o.txHash && typeof o.txHash === 'string' &&
                    session.bridgeTx?.hash &&
                    o.txHash.trim().toLowerCase() === session.bridgeTx.hash.trim().toLowerCase() &&
                    (o.provider === 'SRBTODYDX' || o.provider === 'ALLBRIDGE')
                );

                matchedOrder = ordersRes.data.find(
                  o => {
                    if (!o || o.provider !== 'DYDX') return false;
                    const txHashMatch = o.txHash && typeof o.txHash === 'string';
                    const notClaimed = txHashMatch && !claimedHashes.includes(o.txHash.trim().toLowerCase());
                    const timeBaseline = srbOrder && srbOrder.createdAt ? new Date(srbOrder.createdAt).getTime() - 2 * 60 * 1000 : session.createdAt - 10 * 60 * 1000;
                    const timeMatch = o.createdAt && !isNaN(new Date(o.createdAt).getTime()) && new Date(o.createdAt).getTime() > timeBaseline;
                    const expectedAmtStr = session.intermediateAmount || session.inputAmount || '0';
                    const amountMatch = o.amountIn && !isNaN(parseFloat(o.amountIn)) && !isNaN(parseFloat(expectedAmtStr)) && Math.abs(parseFloat(o.amountIn) - parseFloat(expectedAmtStr)) < 1.0;

                    return txHashMatch && notClaimed && timeMatch && amountMatch;
                  }
                );

                if (matchedOrder && matchedOrder.txHash && typeof matchedOrder.txHash === 'string') {
                  sessionUpdates.depositTx = { hash: matchedOrder.txHash.trim(), status: 'PENDING' };
                  claimedHashes.push(matchedOrder.txHash.trim().toLowerCase());
                  changed = true;
                }
              }

              if (matchedOrder) {
                const newStatus: TxStatus = matchedOrder.status === 'completed'
                  ? 'SUCCESS'
                  : matchedOrder.status === 'failed'
                    ? 'FAILED'
                    : 'PENDING';

                if (session.depositTx?.status !== newStatus) {
                  sessionUpdates.depositTx = {
                    hash: (matchedOrder.txHash && typeof matchedOrder.txHash === 'string')
                      ? matchedOrder.txHash.trim()
                      : (session.depositTx?.hash || null),
                    status: newStatus
                  };
                  if (newStatus === 'SUCCESS') {
                    sessionUpdates.phase = 'DONE';
                  }
                  changed = true;
                }
              }
            }

            if (Object.keys(sessionUpdates).length > 0) {
              return { ...session, ...sessionUpdates };
            }
            return session;
          });

          // 2. Reconstruct any missing sessions from backend orders (e.g. if localStorage is cleared or on new device)
          const srbOrders = ordersRes.data.filter(
            o => o && o.provider === 'SRBTODYDX' &&
              o.txHash &&
              o.createdAt &&
              !isNaN(new Date(o.createdAt).getTime()) &&
              o.status !== 'completed' && o.status !== 'success'
          );

          // Track SRB bridge hashes we reconstruct so DYDX reconstruction can skip ones already covered
          const reconstructedSrbBridgeHashes: string[] = [];

          for (const srbOrder of srbOrders) {
            if (!srbOrder.txHash || typeof srbOrder.txHash !== 'string') continue;

            // Check if any local session already has this bridge hash
            const hasLocalSession = updated.some(
              s => s && s.bridgeTx?.hash && typeof s.bridgeTx.hash === 'string' &&
                s.bridgeTx.hash.trim().toLowerCase() === srbOrder.txHash!.trim().toLowerCase()
            );

            if (hasLocalSession) continue;

            const dstChainSymbol = srbOrder.fromChain === 'SRB' ? srbOrder.toChain : srbOrder.fromChain;
            const dstChainConfig = dstChainSymbol ? findChain(dstChainSymbol, currentNetwork) : undefined;
            const destinationChainId = dstChainConfig ? Number(dstChainConfig.chainId) : 42161;

            const isSrbFailed = srbOrder.status === 'failed';

            // Bridge is pending (not completed, not failed)
            const phase: Phase = 'BRIDGE';

            const reconstructedSession: BridgeSession = {
              id: `session-reconstructed-${srbOrder.txHash.trim()}`,
              createdAt: new Date(srbOrder.createdAt!).getTime(),
              phase,
              inputAmount: srbOrder.amountIn || '0',
              inputTokenSymbol: 'USDC',
              destinationChainId,
              swapTx: { hash: null, status: null },
              bridgeTx: {
                hash: srbOrder.txHash.trim(),
                status: isSrbFailed ? 'FAILED' : 'PENDING'
              },
              depositTx: { hash: null, status: null },
              intermediateAmount: srbOrder.amountOut || srbOrder.amountIn || '0',
              feePaymentMethod: FeePaymentMethod.WITH_STABLECOIN,
              requiredWallets: {
                evm: evmAddress,
                stellar: stellarAddress
              },
              error: null,
              loadingStep: false,
              expectedSwapOutput: null,
              expectedBridgeOutput: srbOrder.amountOut || null,
              bridgeStartedAt: new Date(srbOrder.createdAt!).getTime(),
              expectedBridgeTimeMs: null,
            };

            reconstructedSrbBridgeHashes.push(srbOrder.txHash.trim().toLowerCase());
            updated.push(reconstructedSession);
            changed = true;
          }

          // 3. Reconstruct standalone DYDX orders (if any are missing)
          const dydxOrders = ordersRes.data.filter(
            o => o && o.provider === 'DYDX' &&
              o.txHash &&
              o.createdAt &&
              !isNaN(new Date(o.createdAt).getTime()) &&
              !claimedHashes.includes(o.txHash.trim().toLowerCase()) &&
              o.status !== 'completed' && o.status !== 'success'
          );

          for (const dydxOrder of dydxOrders) {
            if (!dydxOrder.txHash || typeof dydxOrder.txHash !== 'string') continue;

            // Skip if any existing session already tracks this deposit hash
            const hasLocalSession = updated.some(
              s => s && s.depositTx?.hash && typeof s.depositTx.hash === 'string' &&
                s.depositTx.hash.trim().toLowerCase() === dydxOrder.txHash!.trim().toLowerCase()
            );
            if (hasLocalSession) continue;

            // Skip if we just reconstructed an SRB session for the same bridge tx
            // (the reconcile loop will link them properly once the bridge resolves)
            const isLinkedToReconstructedSrb = reconstructedSrbBridgeHashes.some(bridgeHash => {
              const srbBackendOrder = ordersRes.data.find(
                o => o && o.txHash && o.txHash.trim().toLowerCase() === bridgeHash &&
                  (o.provider === 'SRBTODYDX' || o.provider === 'ALLBRIDGE')
              );
              if (!srbBackendOrder || !srbBackendOrder.amountOut) return false;
              const expectedAmt = parseFloat(srbBackendOrder.amountOut);
              const dydxAmt = parseFloat(dydxOrder.amountIn || '0');
              return !isNaN(expectedAmt) && !isNaN(dydxAmt) && Math.abs(expectedAmt - dydxAmt) < 1.0;
            });
            if (isLinkedToReconstructedSrb) continue;

            const isFailed = dydxOrder.status === 'failed';
            const dydxCreatedAt = new Date(dydxOrder.createdAt!).getTime();
            const dstChainConfig = dydxOrder.fromChain ? findChain(dydxOrder.fromChain, currentNetwork) : undefined;
            const destinationChainId = dstChainConfig ? Number(dstChainConfig.chainId) : 42161;

            const reconstructedSession: BridgeSession = {
              id: `session-dydx-${dydxOrder.txHash.trim()}`,
              createdAt: dydxCreatedAt,
              phase: 'DEPOSIT',
              inputAmount: dydxOrder.amountIn || '0',
              inputTokenSymbol: 'USDC',
              destinationChainId,
              swapTx: { hash: null, status: null },
              bridgeTx: { hash: null, status: 'SUCCESS' },
              depositTx: {
                hash: dydxOrder.txHash.trim(),
                status: isFailed ? 'FAILED' : 'PENDING'
              },
              intermediateAmount: dydxOrder.amountIn || '0',
              feePaymentMethod: FeePaymentMethod.WITH_STABLECOIN,
              requiredWallets: {
                evm: evmAddress,
                stellar: stellarAddress
              },
              error: null,
              loadingStep: false,
              expectedSwapOutput: null,
              expectedBridgeOutput: dydxOrder.amountIn || null,
              bridgeStartedAt: dydxCreatedAt,
              expectedBridgeTimeMs: null,
            };

            claimedHashes.push(dydxOrder.txHash.trim().toLowerCase());
            updated.push(reconstructedSession);
            changed = true;
          }

          if (changed) {
            saveSessions(updated);
            return updated;
          }
          return prev;
        });
      } catch (err) {
        console.error('Failed to reconcile sessions with backend:', err);
      }
    };

    reconcileSessionsWithBackend();
    const interval = setInterval(reconcileSessionsWithBackend, 20000);
    return () => clearInterval(interval);
  }, [evmAddress, stellarAddress, isRestored, currentNetwork, saveSessions]);

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
