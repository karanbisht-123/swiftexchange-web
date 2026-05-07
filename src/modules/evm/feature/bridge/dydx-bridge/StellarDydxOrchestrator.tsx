import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowUpDown, RefreshCw, AlertCircle, CheckCircle2, Wallet, Layers, Clock, Eye, EyeOff } from 'lucide-react';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { AmmSwapService } from '../../../../steallr/service/ammSwapService';
import {
  getSupportedTokens,
  getBridgeQuote as getStellarBridgeQuote,
  prepareStellarToEvmRawTransaction,
  STELLAR_NETWORK_PASSPHRASE
} from '../../../../steallr/service/allbridgeService';
import { useDydxDeposit } from '../../../../dydx/hooks/useDydxDeposit';
import { ChainSymbol, FeePaymentMethod, Messenger } from '@allbridge/bridge-core-sdk';
import { useAssetSelectorModal } from '../../../../commonfeature/components/useAssetSelectorModal';
import { ChevronDown } from 'lucide-react';
import { getChainById, getEvmChainsForNetwork, type ChainConfig } from '../../../utils/Chainregistry';
import * as ChainUrlHelpers from '../../../utils/ChainUrlHelpers';
import TransactionButton from '../../../../commonfeature/components/TransactionButton';
import { portfolioUtils } from '../../../../walletconnect/utils/portfolioUtils';
import * as StellarSDK from '@stellar/stellar-sdk';

// Constants from registry
const STELLAR_CHAIN_ID = 'pubnet';

const Shimmer: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />
);

export const StellarDydxOrchestrator: React.FC = () => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network) as 'mainnet' | 'testnet';

  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarAddress = stellarWallet?.address;
  const evmAddress = evmWallet?.address;

  // Flow State
  const [phase, setPhase] = useState<'SETUP' | 'SWAP' | 'BRIDGE' | 'DEPOSIT' | 'DONE'>('SETUP');
  const [destinationChain, setDestinationChain] = useState<ChainConfig | null>(null);
  const [showNetworkSelector, setShowNetworkSelector] = useState(false);

  // Input State
  const [inputToken, setInputToken] = useState<any>(null);
  const [inputAmount, setInputAmount] = useState<string>('');
  const [stellarAssets, setStellarAssets] = useState<any[]>([]);
  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);

  // Quotes
  const [isQuoting, setIsQuoting] = useState(false);
  const [swapQuote, setSwapQuote] = useState<any>(null);
  const [bridgeQuote, setBridgeQuote] = useState<any>(null);
  const [depositQuote, setDepositQuote] = useState<any>(null);
  const [rawQuotes, setRawQuotes] = useState<{ swap: any; bridge: any; dydx: any } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(false);
  const [feePaymentMethod, setFeePaymentMethod] = useState<FeePaymentMethod>(FeePaymentMethod.WITH_STABLECOIN);

  const { openAssetSelector } = useAssetSelectorModal();
  const { getRoute, deposit, isLoading: dydxLoading } = useDydxDeposit();
  const [showFullDetails, setShowFullDetails] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const BRIDGE_STEP_KEY = 'stellar_dydx_bridge_step';

  const isUsdc = inputToken?.symbol?.toUpperCase() === 'USDC';


  useEffect(() => {
    try {
      const saved = localStorage.getItem(BRIDGE_STEP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.phase && parsed.phase !== 'SETUP' && parsed.phase !== 'DONE') {
          setPhase(parsed.phase);
          if (parsed.inputAmount) setInputAmount(parsed.inputAmount);
          if (parsed.swapQuote) setSwapQuote(parsed.swapQuote);
          if (parsed.bridgeQuote) setBridgeQuote(parsed.bridgeQuote);
          if (parsed.depositQuote) setDepositQuote(parsed.depositQuote);
          if (parsed.destinationChain) setDestinationChain(parsed.destinationChain);
        }
      }
    } catch { /* silent - session restore is best-effort */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist step progress to localStorage
  useEffect(() => {
    if (phase === 'DONE' || phase === 'SETUP') {
      localStorage.removeItem(BRIDGE_STEP_KEY);
    } else {
      try {
        localStorage.setItem(BRIDGE_STEP_KEY, JSON.stringify({
          phase, inputAmount, swapQuote, bridgeQuote, depositQuote, destinationChain
        }));
      } catch { /* silent */ }
    }
  }, [phase, inputAmount, swapQuote, bridgeQuote, depositQuote, destinationChain]);

  // Initialize Destination Chain
  useEffect(() => {
    if (!destinationChain) {
      const evmChains = getEvmChainsForNetwork(currentNetwork);
      const arb = evmChains.find(c => c.chainId === 42161 || c.slug === 'arb');
      setDestinationChain(arb || evmChains[0] || null);
    }
  }, [currentNetwork, destinationChain]);

  useEffect(() => {
    try {
      const config = getStellarConfig(currentNetwork);
      const service = new AmmSwapService(config.horizonUrl, config.networkPassphrase, config.chainId);
      setAmmService(service);
    } catch (err) {
      console.error('Failed to init AmmSwapService:', err);
    }
  }, [currentNetwork]);

  const isFetchingAssetsRef = useRef(false);
  const fetchStellarAssets = useCallback(async () => {
    if (!ammService || !stellarAddress || isFetchingAssetsRef.current) return;
    try {
      isFetchingAssetsRef.current = true;
      const { tokens: balances, subentryCount } = await ammService.getAssetsWithBalances(stellarAddress);
      const reserve = 1 + subentryCount * 0.5;
      const mapped = balances
        .filter((b: any) => b && b.asset)
        .map((b: any) => {
          let balanceToUse = b.balance || '0';
          if (b.code === 'XLM') {
            balanceToUse = Math.max(0, parseFloat(b.balance || '0') - reserve).toString();
          }

          const isNative = typeof b.asset.isNative === 'function' ? b.asset.isNative() : (b.code === 'XLM');

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
            hasTrustline: b.hasTrustline
          };
        });

      setStellarAssets(mapped);

      setInputToken((prev: any) => {
        if (prev) {
          // Update the balance of the previously selected token
          const updated = mapped.find(m => m.symbol === prev.symbol);
          if (updated) return updated;
          return prev;
        }
        const xlm = mapped.find((m: any) => m.symbol === 'XLM');
        return xlm || mapped[0];
      });
    } catch (err) {
      console.error('Failed to fetch Stellar balances:', err);
    } finally {
      isFetchingAssetsRef.current = false;
    }
  }, [ammService, stellarAddress]);

  useEffect(() => {
    fetchStellarAssets();
  }, [fetchStellarAssets]);

  const tokenBalance = useMemo(() => {
    if (!inputToken) return '0';
    const found = stellarAssets.find(a => a.symbol === inputToken.symbol);
    return found?.balance || '0';
  }, [inputToken, stellarAssets]);

  const getStellarAsset = (token: any) => {
    if (!token) return null;
    if (token.asset) return token.asset;
    if (token.isNative || token.symbol === 'XLM') return StellarSDK.Asset.native();
    if (token.address && token.address !== 'native') {
      return new StellarSDK.Asset(token.symbol, token.address);
    }
    return StellarSDK.Asset.native();
  };

  const fetchAllQuotes = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0 || !inputToken || !ammService || !destinationChain) {
      setSwapQuote(null); setBridgeQuote(null); setDepositQuote(null); setRawQuotes(null);
      return;
    }

    setIsQuoting(true);
    setError(null);

    try {
      // Step 1 (optional): Stellar Swap + bridge tokens lookup — PARALLEL
      let usdcAmountStellar = amount;
      let finalSwapQuote: any = null;

      const inputAsset = getStellarAsset(inputToken);
      if (!inputAsset) throw new Error('Invalid input token');

      // Run swap quote and allbridge token list in parallel
      const [swapResult, allTokens] = await Promise.all([
        isUsdc
          ? Promise.resolve(null)
          : (async () => {
            const usdcAsset = stellarAssets.find(a => a.symbol === 'USDC');
            if (!usdcAsset) throw new Error('USDC asset not found on Stellar');
            const targetAsset = getStellarAsset(usdcAsset);
            if (!targetAsset) throw new Error('Invalid target token');
            return ammService.getSwapQuote(inputAsset, targetAsset, amount, { slippageTolerance: 1.0 });
          })(),
        getSupportedTokens(),
      ]);

      if (!isUsdc && swapResult) {
        finalSwapQuote = swapResult;
        usdcAmountStellar = finalSwapQuote.estimatedOutput;
      }
      setSwapQuote(finalSwapQuote);

      // Step 2: Allbridge bridge quote
      const dstSymbol = (destinationChain.symbol === 'BNB' ? ChainSymbol.BSC : destinationChain.symbol) as ChainSymbol;
      const [srcUsdc, dstUsdc] = [
        allTokens.find(t => t.chainSymbol === ChainSymbol.SRB && t.symbol === 'USDC'),
        allTokens.find(t => t.chainSymbol === dstSymbol && t.symbol === 'USDC'),
      ];
      if (!srcUsdc || !dstUsdc) throw new Error('Bridge tokens not found for selected chain');

      const bq = await getStellarBridgeQuote({
        amount: usdcAmountStellar,
        sourceToken: srcUsdc,
        destinationToken: dstUsdc,
        slippageTolerance: 1.0
      });
      setBridgeQuote(bq);

      // Step 3: dYdX deposit route
      const dstUsdcAmount = bq.amountToBeReceived;
      const dr = await getRoute('USDC', parseFloat(dstUsdcAmount), destinationChain.chainId, false);
      if (!dr) {
        throw new Error('Bridge available, but no deposit route to dYdX found. Try another chain.');
      }
      setDepositQuote(dr);

      setRawQuotes({
        swap: finalSwapQuote ?? null,
        bridge: bq,
        dydx: dr,
      });

    } catch (err: any) {
      console.error('Quote error:', err);
      setError(err.message || 'Failed to fetch quotes');
    } finally {
      setIsQuoting(false);
    }
  }, [inputToken, isUsdc, ammService, stellarAssets, destinationChain, getRoute]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (phase === 'SETUP' && inputAmount && parseFloat(inputAmount) > 0) {
        fetchAllQuotes(inputAmount);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [inputAmount, inputToken, destinationChain, phase, fetchAllQuotes]);

  // Step 4: Auto-refresh quotes every 30s
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (phase === 'SETUP' && inputAmount && parseFloat(inputAmount) > 0 && !isQuoting) {
      interval = setInterval(() => {
        fetchAllQuotes(inputAmount);
      }, 30000);
    }
    return () => clearTimeout(interval);
  }, [inputAmount, phase, isQuoting, fetchAllQuotes]);

  const handleMaxAmount = () => {
    if (tokenBalance && parseFloat(tokenBalance) > 0) {
      setInputAmount(tokenBalance);
    }
  };

  const executeSwap = async () => {
    if (!ammService || !stellarAddress || !swapQuote || !inputToken) return false;
    try {
      const provider = getProvider(WalletType.STELLAR) as any;
      const inputAsset = getStellarAsset(inputToken);
      if (!inputAsset) throw new Error('Invalid input token');

      const tx = await ammService.buildSwapTransaction(stellarAddress, swapQuote, { slippageTolerance: 1.0 });
      await ammService.executeSwapWithWalletConnect(tx, provider);
      await fetchStellarAssets();
      return true;
    } catch (err: any) {
      setError(err.message || 'Swap failed');
      return false;
    }
  };

  const executeBridge = async () => {
    if (!stellarAddress || !evmAddress || !bridgeQuote) return false;
    try {
      const xdr = await prepareStellarToEvmRawTransaction({
        amount: isUsdc ? inputAmount : (swapQuote?.estimatedOutput || inputAmount),
        sourceToken: bridgeQuote.sourceToken,
        destinationToken: bridgeQuote.destinationToken,
        fromAccountAddress: stellarAddress,
        toAccountAddress: evmAddress,
        feePaymentMethod: feePaymentMethod,
        messenger: Messenger.ALLBRIDGE,
        slippageTolerance: 1.0
      });
      const provider = getProvider(WalletType.STELLAR) as any;
      const signParams = { xdr, networkPassphrase: STELLAR_NETWORK_PASSPHRASE[currentNetwork], network: currentNetwork === 'mainnet' ? 'pubnet' : 'TESTNET' };
      await provider.request({ method: 'stellar_signAndSubmitXDR', params: signParams });
      return true;
    } catch (err: any) {
      setError(err.message || 'Bridge failed');
      return false;
    }
  };

  const executeDeposit = async () => {
    if (!bridgeQuote || !destinationChain) return false;
    
    // Step 1: Just-In-Time (JIT) Route Verification
    // We re-fetch the route right before the final deposit to ensure 
    // quotes haven't expired while waiting for the bridge.
    try {
      setLoadingStep(true);
      setError(null);
      
      const amountToDeposit = parseFloat(bridgeQuote.amountToBeReceived);
      
      // Re-fetch route from Skip API
      const freshRoute = await getRoute('USDC', amountToDeposit, destinationChain.chainId, false);
      
      if (!freshRoute) {
        throw new Error('Could not verify fresh deposit route. Please try again.');
      }

      // Update state with fresh quote
      setDepositQuote(freshRoute);
      setRawQuotes(prev => prev ? { ...prev, dydx: freshRoute } : null);

      // Step 2: Execute the actual deposit
      const res = await deposit('USDC', amountToDeposit, destinationChain.chainId, true, '1');
      if (res.success) {
        return true;
      } else {
        setError(res.error || 'Deposit failed');
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'Deposit verification failed');
      return false;
    }
  };

  const handleActionClick = async () => {
    if (!evmAddress || !stellarAddress) {
      setError('Please connect both Stellar and EVM wallets');
      return;
    }

    if (phase === 'SETUP') {
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
        const ok = await executeBridge();
        if (ok) setPhase('DEPOSIT');
      } else if (phase === 'DEPOSIT') {
        const ok = await executeDeposit();
        if (ok) setPhase('DONE');
      }
    } finally {
      setLoadingStep(false);
    }
  };

  const handleReset = () => {
    setPhase('SETUP');
    setInputAmount('');
    setError(null);
    setRawQuotes(null);
    localStorage.removeItem(BRIDGE_STEP_KEY);
  };

  const isInsufficient = parseFloat(inputAmount) > parseFloat(tokenBalance);

  const displayState = useMemo(() => {
    const stellarConfig = getStellarConfig(currentNetwork);
    const usdcLogo = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png";

    if (phase === 'SETUP' || phase === 'SWAP') {
      if (isUsdc) {
        return {
          top: { symbol: 'USDC', network: 'STELLAR', amount: inputAmount, logo: usdcLogo, balance: tokenBalance },
          bottom: { symbol: 'USDC', network: destinationChain?.name?.toUpperCase() || 'EVM', amount: bridgeQuote?.amountToBeReceived, logo: usdcLogo },
          title: `Bridge to ${destinationChain?.name || 'EVM'}`,
        };
      }
      return {
        top: { symbol: inputToken?.symbol || 'Select', network: 'STELLAR', amount: inputAmount, logo: inputToken?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol, stellarConfig), balance: tokenBalance },
        bottom: { symbol: 'USDC', network: 'STELLAR', amount: swapQuote?.estimatedOutput, logo: usdcLogo },
        title: 'Swap to USDC',
      };
    }
    if (phase === 'BRIDGE') {
      return {
        top: { symbol: 'USDC', network: 'STELLAR', amount: isUsdc ? inputAmount : swapQuote?.estimatedOutput, logo: usdcLogo, balance: isUsdc ? inputAmount : swapQuote?.estimatedOutput },
        bottom: { symbol: 'USDC', network: destinationChain?.name?.toUpperCase() || 'EVM', amount: bridgeQuote?.amountToBeReceived, logo: usdcLogo },
        title: `Bridge to ${destinationChain?.name || 'EVM'}`,
      };
    }
    if (phase === 'DEPOSIT' || phase === 'DONE') {
      return {
        top: { symbol: 'USDC', network: destinationChain?.name?.toUpperCase() || 'EVM', amount: bridgeQuote?.amountToBeReceived, logo: usdcLogo, balance: bridgeQuote?.amountToBeReceived },
        bottom: { symbol: 'USDC', network: 'DYDX', amount: depositQuote?.receivedAmount, logo: usdcLogo },
        title: phase === 'DONE' ? 'Transfer Complete' : 'Bridge to dYdX',
      };
    }
    return {
      top: { symbol: inputToken?.symbol, network: 'STELLAR', amount: inputAmount, logo: inputToken?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol, stellarConfig), balance: '0' },
      bottom: { symbol: 'USDC', network: 'DYDX', amount: depositQuote?.receivedAmount, logo: usdcLogo },
      title: 'Transfer Complete',
    };
  }, [phase, isUsdc, inputAmount, inputToken, swapQuote, bridgeQuote, depositQuote, tokenBalance, destinationChain, currentNetwork]);

  const buttonLabel = useMemo(() => {
    if (!evmAddress || !stellarAddress) return 'CONNECT WALLETS';
    if (!inputAmount || parseFloat(inputAmount) <= 0) return 'ENTER AMOUNT';
    if (isInsufficient) return 'INSUFFICIENT BALANCE';
    if (isQuoting) return 'FETCHING QUOTES...';

    if (phase === 'SETUP') return 'START TRANSFER';
    if (phase === 'SWAP') return 'APPROVE SWAP (1/3)';
    if (phase === 'BRIDGE') return `APPROVE BRIDGE (${isUsdc ? '1/2' : '2/3'})`;
    if (phase === 'DEPOSIT') return loadingStep ? 'VERIFYING ROUTE...' : `APPROVE DEPOSIT (${isUsdc ? '2/2' : '3/3'})`;
    if (phase === 'DONE') return 'START NEW TRANSFER';

    return 'START';
  }, [evmAddress, stellarAddress, inputAmount, isInsufficient, isQuoting, phase, isUsdc]);

  const renderStepIndicator = () => {
    const steps = isUsdc ? ['Bridge (1)', 'Bridge (2)'] : ['Swap', 'Bridge (1)', 'Bridge (2)'];
    const currentStepIndex = phase === 'SETUP' ? -1 : phase === 'SWAP' ? 0 : phase === 'BRIDGE' ? (isUsdc ? 0 : 1) : phase === 'DEPOSIT' ? (isUsdc ? 1 : 2) : 3;

    return (
      <div className="flex items-center justify-between w-full mb-8 px-4">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-2 relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-700 shadow-lg ${i <= currentStepIndex ? 'bg-brand text-white shadow-brand/20' : 'bg-tertiary text-muted'}`}>
                {i < currentStepIndex ? <CheckCircle2 size={20} /> : <span className="text-xs font-black">{i + 1}</span>}
              </div>
              <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${i <= currentStepIndex ? 'text-brand' : 'text-muted'}`}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-[-12px] -mt-6 bg-divider/10 relative">
                <div
                  className="absolute inset-0 bg-brand transition-all duration-1000 ease-out"
                  style={{ width: i < currentStepIndex ? '100%' : '0%' }}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const routeBreakdown = useMemo(() => {
    if (!bridgeQuote && !depositQuote && !swapQuote) return null;
    const stellarConfig = getStellarConfig(currentNetwork);
    const usdcLogo = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png";
    const dydxLogo = "https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png";

    const bridgeFee = bridgeQuote ? (feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN ? (bridgeQuote.feeOptions.stablecoin?.float) : (bridgeQuote.feeOptions.native.float)) : 0;
    const bridgeTime = Math.round((bridgeQuote?.transferTimeMs || 0) / 60000);
    const depositTime = Math.round((depositQuote?.estimatedDurationSeconds || 0) / 60);

    const items = [];

    if (swapQuote) {
      items.push({
        label: 'Swap',
        value: `${inputToken?.symbol} → USDC`,
        fee: 'Variable',
        amount: swapQuote.estimatedOutput ? portfolioUtils.formatBalance(swapQuote.estimatedOutput) : '',
        icon: inputToken?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol, stellarConfig),
        chainIcon: stellarConfig.logoUrl,
        status: phase === 'SETUP' ? 'pending' : (phase === 'SWAP' ? 'active' : 'done')
      });
    }

    if (bridgeQuote) {
      items.push({
        label: 'Bridge',
        value: `Stellar → ${destinationChain?.name}`,
        fee: `${bridgeFee} ${feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN ? 'USDC' : 'XLM'}`,
        amount: bridgeQuote.amountToBeReceived ? portfolioUtils.formatBalance(bridgeQuote.amountToBeReceived) : '',
        time: `${bridgeTime}m`,
        icon: usdcLogo,
        chainIcon: stellarConfig.logoUrl,
        status: phase === 'BRIDGE' ? 'active' : (['SETUP', 'SWAP'].includes(phase) ? 'pending' : 'done')
      });
    }

    if (depositQuote) {
      items.push({
        label: 'Bridge',
        value: `${destinationChain?.name} → dYdX`,
        fee: `$${depositQuote.usd_amount_in - depositQuote.usd_amount_out || '0.02'}`,
        amount: depositQuote.receivedAmount ? portfolioUtils.formatBalance(depositQuote.receivedAmount.toString()) : '',
        time: `${depositTime}m`,
        icon: usdcLogo,
        chainIcon: destinationChain?.logoURI,
        status: phase === 'DEPOSIT' ? 'active' : (phase === 'DONE' ? 'done' : 'pending')
      });
      items.push({
        label: 'Settled',
        value: 'dYdX Account',
        fee: '---',
        amount: depositQuote.receivedAmount ? portfolioUtils.formatBalance(depositQuote.receivedAmount.toString()) : '',
        icon: usdcLogo,
        chainIcon: dydxLogo,
        status: phase === 'DONE' ? 'done' : 'pending'
      });
    }

    const totalTime = bridgeTime + depositTime;

    return { items, totalTime };
  }, [bridgeQuote, depositQuote, swapQuote, inputToken, destinationChain, currentNetwork, phase, isUsdc, feePaymentMethod]);

  const evmChains = useMemo(() => getEvmChainsForNetwork(currentNetwork), [currentNetwork]);

  return (
    <div className="w-full mx-auto px-4 pb-4 animate-fade-in">
      {/* Header Section */}
      <div className={`-mb-3 flex px-2 ${phase === 'SETUP' ? 'justify-end' : 'justify-center'}`}>

        {phase === 'SETUP' && (
          <div className="relative">
            <button
              onClick={() => setShowNetworkSelector(!showNetworkSelector)}
              className="flex items-center gap-3 bg-tertiary  hover:bg-hover px-5 py-2.5 rounded-xl rounded-b-none pb-5 border border-divider transition-all  group"
            >
              <div className="flex flex-col items-start leading-none">
                <span className="text-[8px] font-black text-brand uppercase tracking-widest mb-1">Bridge Conduit</span>
                <div className="flex items-center gap-2">
                  <img src={destinationChain?.logoURI} className="w-4 h-4 rounded-full" alt="" />
                  <span className="text-xs font-black text-primary uppercase">{destinationChain?.name}</span>
                </div>
              </div>
              <ChevronDown size={14} className={`text-muted transition-transform duration-300 ml-2 ${showNetworkSelector ? 'rotate-180' : ''}`} />
            </button>

            {showNetworkSelector && (
              <div className="absolute top-full right-0 mt-3 w-64 bg-tertiary border border-divider rounded-[2rem] p-3 z-[100] shadow-2xl animate-slide-up backdrop-blur-xl">
                <div className="px-3 py-2 mb-2 border-b border-divider/50">
                  <span className="text-[10px] font-black text-muted uppercase tracking-widest">Select Bridge Pathway</span>
                  <p className="text-[8px] font-bold text-muted/60 uppercase mt-1">Funds will pass through here to dYdX</p>
                </div>
                {evmChains.map((c) => (
                  <button
                    key={c.chainId}
                    onClick={() => {
                      setDestinationChain(c);
                      setShowNetworkSelector(false);
                    }}
                    className={`flex items-center gap-4 w-full px-4 py-3.5 rounded-xl transition-all ${destinationChain?.chainId === c.chainId ? 'bg-brand/10 text-brand' : 'hover:bg-hover text-secondary'}`}
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
        {phase !== 'SETUP' && phase !== 'DONE' && renderStepIndicator()}

        <div className="space-y-1 relative">
          <div className="bg-tertiary rounded-xl p-8 group transition-all duration-500 shadow-sm relative z-0">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">You Pay</span>
              {phase === 'SETUP' && (
                <button
                  onClick={handleMaxAmount}
                  className="text-[10px] font-black text-brand bg-brand/10 px-4 py-1.5 rounded-full hover:bg-brand hover:text-white transition-all tracking-widest"
                >
                  MAX: {portfolioUtils.formatBalance(tokenBalance)}
                </button>
              )}
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={() => phase === 'SETUP' && openAssetSelector('BRIDGE', { defaultNetwork: STELLAR_CHAIN_ID, showAllStellarAssets: true, onSelect: (a) => setInputToken(a) })}
                className={`flex items-center gap-4 bg-secondary hover:bg-hover rounded-2xl px-5 py-4 transition-all border border-divider/50 shadow-sm min-w-[190px] ${phase === 'SETUP' ? 'active:scale-95' : 'pointer-events-none opacity-80'}`}
              >
                <div className="relative">
                  <img src={displayState.top.logo} className="w-10 h-10 rounded-full object-cover shadow-md" alt="" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-secondary bg-primary flex items-center justify-center p-0.5 shadow-sm">
                    <img src={getStellarConfig(currentNetwork).logoUrl} className="w-full h-full object-contain" alt="" />
                  </div>
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="font-black text-lg text-primary uppercase tracking-tight">{displayState.top.symbol}</span>
                  <span className="text-[9px] font-black text-muted uppercase tracking-tighter">Stellar</span>
                </div>
                {phase === 'SETUP' && <ChevronDown size={14} className="text-muted ml-auto" />}
              </button>

              <div className="flex-1 text-right">
                {phase === 'SETUP' ? (
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="w-full bg-transparent border-none text-right text-5xl font-black focus:ring-0 p-0 placeholder:text-muted/10 truncate outline-none text-primary tracking-tighter"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                ) : (
                  <div className="text-5xl font-black text-primary truncate tracking-tighter">
                    {displayState.top.amount ? portfolioUtils.formatBalance(displayState.top.amount) : '0.00'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className="w-12 h-12 bg-secondary rounded-2xl  border-secondary flex items-center justify-center shadow-xl">
              <ArrowUpDown size={20} className="text-brand" />
            </div>
          </div>

          <div className="bg-tertiary rounded-xl p-8 group transition-all duration-500 shadow-sm relative overflow-hidden border border-divider/20">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">You Receive</span>
              {phase === 'SETUP' || phase === 'SWAP' || phase === 'BRIDGE' ? (
                <div className="flex items-center gap-1.5 bg-brand/5 px-3 py-1 rounded-full border border-brand/10">
                  <span className="text-[9px] font-black text-brand uppercase tracking-tighter italic">Pending Final Settlement</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-brand/10 px-3 py-1 rounded-full border border-brand/20">
                  <CheckCircle2 size={10} className="text-brand" />
                  <span className="text-[9px] font-black text-brand uppercase tracking-tighter">Settled on dYdX</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4  bg-secondary rounded-2xl px-5 py-4 border border-divider/50 shadow-sm min-w-[190px] opacity-90">
                <div className="relative">
                  <img src={displayState.bottom.logo} className="w-10 h-10 rounded-full object-cover shadow-md" alt="" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-secondary bg-bg-primary flex items-center justify-center p-0.5 shadow-sm">
                    {displayState.bottom.network === 'DYDX' ? (
                      <div className="w-full h-full bg-black rounded-full flex items-center justify-center p-1">
                        <img src="https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png" className="w-full h-full object-contain" alt="" />
                      </div>
                    ) : (
                      <img
                        src={getChainById(displayState.bottom.network === 'STELLAR' ? STELLAR_CHAIN_ID : (destinationChain?.chainId || 42161))?.logoURI}
                        className="w-full h-full object-contain"
                        alt=""
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="font-black text-lg text-primary uppercase tracking-tight">{displayState.bottom.symbol}</span>
                  <span className="text-[9px] font-black text-muted uppercase tracking-tighter">{displayState.bottom.network}</span>
                </div>
              </div>

              <div className="flex-1 text-right">
                {isQuoting ? (
                  <Shimmer className="h-10 w-full mb-1" />
                ) : (
                  <div className="text-5xl font-black text-primary truncate tracking-tighter">
                    {displayState.bottom.amount ? portfolioUtils.formatBalance(displayState.bottom.amount) : '0.00'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Route Transparency - Show More Option */}
        {phase === 'SETUP' && routeBreakdown && (
          <div className="flex justify-center -mt-2 -mb-1 ">
            <button
              onClick={() => setShowFullDetails(!showFullDetails)}
              className="text-[10px] bg-primary p-3 px-5 rounded-t-lg font-black text-muted hover:text-brand uppercase tracking-widest flex items-center gap-1.5 transition-colors"
            >
              {showFullDetails ? (
                <EyeOff size={12} />
              ) : (
                <Eye size={12} />
              )}
              {showFullDetails ? 'Hide Full Quote' : 'View Full Route Details'}
            </button>
          </div>
        )}
        {/* Fee & Time Details */}
        {phase === 'SETUP' && routeBreakdown && (
          <div className="bg-tertiary rounded-xl border border-divider p-6 pb-0 animate-fade-in relative">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-brand" />
                <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">Route Details</h4>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-xl border border-divider">
                  <span className="text-[9px] font-black text-muted uppercase">Bridge Fee:</span>
                  <button
                    onClick={() => setFeePaymentMethod(feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN ? FeePaymentMethod.WITH_NATIVE_CURRENCY : FeePaymentMethod.WITH_STABLECOIN)}
                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  >
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN ? 'bg-brand/10 border-brand/20' : 'bg-tertiary border-divider'}`}>
                      <img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png" className="w-3 h-3 rounded-full" alt="" />
                      <span className={`text-[8px] font-black ${feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN ? 'text-brand' : 'text-muted'}`}>USDC</span>
                    </div>
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY ? 'bg-brand/10 border-brand/20' : 'bg-tertiary border-divider'}`}>
                      <img src={getStellarConfig(currentNetwork).logoUrl} className="w-3 h-3 rounded-full" alt="" />
                      <span className={`text-[8px] font-black ${feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY ? 'text-brand' : 'text-muted'}`}>XLM</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-2 mb-10 relative">
              {isQuoting ? (
                <div className="flex justify-between w-full px-4">
                  {[1, 2, 3].map(i => <Shimmer key={i} className="w-16 h-16 rounded-2xl" />)}
                </div>
              ) : (
                routeBreakdown.items.map((item, idx) => (
                  <React.Fragment key={idx}>
                    <div className="flex flex-col items-center gap-3 relative z-10 ">
                      <div className={`w-14 h-14 relative rounded-2xl bg-tertiary flex items-center justify-center border transition-all duration-500 shadow-sm ${item.status === 'done' ? 'border-success/50' : item.status === 'active' ? 'border-brand shadow-lg shadow-brand/10' : 'border-divider'}`}>
                        <img src={item.icon} className="w-8 h-8 rounded-full shadow-sm" alt="" />
                        <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full border-2 border-secondary bg-bg-primary flex items-center justify-center p-0.5 shadow-sm">
                          <img src={item.chainIcon} className="w-full h-full object-contain" alt="" />
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${item.status === 'active' ? 'text-brand' : 'text-muted'}`}>{item.label}</span>
                        <span className="text-[8px] font-bold text-white/40 mt-0.5">{item.amount ? `${item.amount} USDC` : '---'}</span>
                        {item.time && (
                          <div className="flex items-center gap-1 mt-0.5 opacity-80">
                            <Clock size={8} className="text-brand" />
                            <span className="text-[10px] font-black text-brand uppercase tracking-tighter">{item.time}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {idx < routeBreakdown.items.length - 1 && (
                      <div className="flex-1 h-0 border-t-2 border-dotted mx-2 mb-12 transition-all duration-500 opacity-30"
                        style={{ borderColor: item.status === 'done' ? 'var(--success)' : 'var(--divider)' }} />
                    )}
                  </React.Fragment>
                ))
              )}
            </div>

            {/* Always-visible per-step fee breakdown */}
            <div className="space-y-2 py-4 border-t border-divider/50">
              {routeBreakdown.items.map((item, idx) => item.fee !== '---' && (
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
              ))}
            </div>

            {showFullDetails && rawQuotes && (
              <div className="space-y-3 py-4 border-t border-divider/50 animate-fade-in">
                <p className="text-[9px] font-black text-brand uppercase tracking-[0.2em] mb-2">Full Quote Breakdown</p>

                {/* Stellar Swap Quote */}
                {rawQuotes.swap && (
                  <details className="group" open>
                    <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                      <span className="group-open:text-brand transition-colors">Stellar Swap</span>
                      <ChevronDown size={10} className="group-open:rotate-180 group-open:text-brand transition-all duration-300" />
                    </summary>
                    <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                      <div className="flex justify-between"><span className="text-muted">You Pay</span><span className="text-primary font-black">{rawQuotes.swap.inputAmount} {rawQuotes.swap.fromAsset?.code || inputToken?.symbol}</span></div>
                      <div className="flex justify-between"><span className="text-muted">You Get (USDC)</span><span className="text-brand font-black">{parseFloat(rawQuotes.swap.estimatedOutput || '0').toFixed(6)}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Min. Received</span><span className="text-primary">{parseFloat(rawQuotes.swap.minimumOutput || '0').toFixed(6)} USDC</span></div>
                      <div className="flex justify-between"><span className="text-muted">Price Impact</span><span className={`font-black ${(rawQuotes.swap.priceImpact || 0) > 1 ? 'text-red-400' : 'text-green-400'}`}>{((rawQuotes.swap.priceImpact || 0)).toFixed(3)}%</span></div>
                      <div className="flex justify-between"><span className="text-muted">Route</span>
                        <span className="text-primary text-right max-w-[140px] truncate">
                          {Array.isArray(rawQuotes.swap.path?.path)
                            ? rawQuotes.swap.path.path.map((p: any) => p.code).join(' → ')
                            : 'AMM Pool'}
                        </span>
                      </div>
                      <div className="flex justify-between"><span className="text-muted">Slippage</span><span>1.0%</span></div>
                    </div>
                  </details>
                )}

                {/* Allbridge Quote */}
                {rawQuotes.bridge && (
                  <details className="group" open={!rawQuotes.swap}>
                    <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                      <span className="group-open:text-brand transition-colors">Allbridge (Stellar → {rawQuotes.bridge.destinationToken?.chainName || destinationChain?.name})</span>
                      <ChevronDown size={10} className="group-open:rotate-180 group-open:text-brand transition-all duration-300" />
                    </summary>
                    <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                      <div className="flex justify-between"><span className="text-muted">Bridge Amount In</span><span className="text-primary font-black">{rawQuotes.bridge.amountToBeReceived ? (parseFloat(rawQuotes.bridge.amountToBeReceived) + parseFloat(rawQuotes.bridge.feeOptions?.stablecoin?.float || '0')).toFixed(4) : '—'} USDC</span></div>
                      <div className="flex justify-between"><span className="text-muted">Amount Out</span><span className="text-brand font-black">{parseFloat(rawQuotes.bridge.amountToBeReceived || '0').toFixed(4)} USDC</span></div>
                      <div className="flex justify-between"><span className="text-muted">Exchange Rate</span><span>{rawQuotes.bridge.exchangeRate}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Transfer Time</span><span>{Math.round((rawQuotes.bridge.transferTimeMs || 0) / 60000)} min</span></div>
                      <div className="flex justify-between"><span className="text-muted">Fee (pay in USDC)</span><span className="text-yellow-400 font-black">{rawQuotes.bridge.feeOptions?.stablecoin?.float} USDC</span></div>
                      <div className="flex justify-between"><span className="text-muted">Fee (pay in XLM)</span><span className="text-yellow-400">{rawQuotes.bridge.feeOptions?.native?.float} XLM</span></div>
                      <div className="flex justify-between"><span className="text-muted">Source</span><span className="text-primary">Stellar ({rawQuotes.bridge.sourceToken?.chainName})</span></div>
                      <div className="flex justify-between"><span className="text-muted">Destination</span><span className="text-primary">{rawQuotes.bridge.destinationToken?.chainName} ({rawQuotes.bridge.destinationToken?.symbol})</span></div>
                    </div>
                  </details>
                )}

                {/* dYdX / Skip Route */}
                {rawQuotes.dydx && (
                  <details className="group">
                    <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                      <span className="group-open:text-brand transition-colors">dYdX Settlement (Skip / CCTP)</span>
                      <ChevronDown size={10} className="group-open:rotate-180 group-open:text-brand transition-all duration-300" />
                    </summary>
                    <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                      <div className="flex justify-between"><span className="text-muted">Bridge</span><span className="text-brand font-black">CCTP</span></div>
                      <div className="flex justify-between"><span className="text-muted">Est. Time</span><span>{rawQuotes.dydx.estimatedTime || `~${Math.round((rawQuotes.dydx.estimatedDurationSeconds || 0) / 60)} min`}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Bridge Fee</span><span className="text-yellow-400 font-black">${(rawQuotes.dydx.fee || 0.02).toFixed(4)} USD</span></div>
                      <div className="flex justify-between"><span className="text-muted">Settled (USDC)</span><span className="text-brand font-black">{(rawQuotes.dydx.receivedAmount || 0).toFixed(4)}</span></div>
                      <div className="flex justify-between"><span className="text-muted">USD Value Out</span><span className="text-primary">${rawQuotes.dydx.usdAmountOut}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Settled On</span><span className="text-brand">dYdX Chain</span></div>
                    </div>
                  </details>
                )}

                <p className="text-[10px] font-bold text-muted/30 uppercase text-center mt-2">
                  * Quotes refresh every 30s. All fees included in final amount.
                </p>
              </div>
            )}


            <div className="mt-4 p-4 bg-brand rounded-2xl rounded-b-none bg-secondary  flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Total Estimated Received</p>
                <div className="flex items-center gap-2.5">
                  <div className="flex -space-x-1.5">
                    <div className="w-5.5 h-5.5 rounded-full bg-black flex items-center justify-center p-1 border border-secondary shadow-sm">
                      <img src="https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png" className="w-full h-full object-contain" alt="" />
                    </div>
                    <div className="w-5 h-5 rounded-full bg-bg-primary flex items-center justify-center p-0.5 border border-secondary shadow-sm">
                      <img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png" className="w-full h-full object-contain rounded-full" alt="" />
                    </div>
                  </div>
                  {isQuoting ? (
                    <Shimmer className="h-6 w-24" />
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-brand tracking-tighter leading-none">
                        {routeBreakdown.items[routeBreakdown.items.length - 1]?.amount || '0.00'}
                      </span>
                      <span className="text-brand text-[10px] font-black uppercase opacity-60">USDC</span>
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
                  <span className="text-[8px] font-bold text-white/20 uppercase">Total EST. TIME</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phase Progress */}
        {(phase !== 'SETUP' && phase !== 'DONE') && (
          <div className="p-6 bg-brand/5 rounded-xl border border-brand/10 animate-fade-in">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-brand flex items-center justify-center shadow-lg shadow-brand/20">
                <RefreshCw size={24} className={`text-white ${loadingStep ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <span className="text-[10px] font-black text-brand uppercase tracking-widest block mb-1">{displayState.title}</span>
                <p className="text-xs font-bold text-primary">Confirm in your {phase === 'DEPOSIT' ? 'EVM' : 'Stellar'} wallet</p>
              </div>
            </div>
            <div className="w-full h-2 bg-divider rounded-full overflow-hidden">
              <div
                className="h-full bg-brand transition-all duration-1000 shadow-[0_0_10px_rgba(var(--brand-rgb),0.5)]"
                style={{ width: phase === 'SWAP' ? '33%' : phase === 'BRIDGE' ? '66%' : '95%' }}
              />
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 mb-4 animate-shake">
              <AlertCircle size={18} className="text-red-500" />
              <p className="text-xs font-bold text-red-500">{error}</p>
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
              {phase === 'SETUP' && !evmAddress && (
                <div className="absolute inset-0 bg-secondary/80 backdrop-blur-sm z-[60] flex flex-col items-center justify-center rounded-xl border border-divider p-6 text-center">
                  <Wallet size={32} className="text-brand mb-3 opacity-50" />
                  <p className="text-sm font-bold text-primary">Connect Wallets to Begin</p>
                </div>
              )}
              <TransactionButton
                label={buttonLabel}
                isLoading={isQuoting || loadingStep || dydxLoading}
                isDisabled={!inputAmount || parseFloat(inputAmount) <= 0 || isInsufficient || (phase === 'SETUP' && !depositQuote)}
                isError={!!error}
                onClick={handleActionClick}
                className="py-8 rounded-xl text-lg font-bold tracking-widest shadow-xl uppercase"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StellarDydxOrchestrator;
