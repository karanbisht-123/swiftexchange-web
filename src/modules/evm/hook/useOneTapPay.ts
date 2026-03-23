import { useCallback, useEffect, useRef, useState } from 'react';

import { ethers } from 'ethers';

import { ERC20_ABI } from '../../../abi/Erc20AbI';
import { SWAP_ROUTER_ABI } from '../../../abi/SwapRouterABI';
import { getConfigByChainId, getNetworkKeyFromChainId } from '../../../config/swapConfigs';
import type {
  BridgeQuoteDetails,
  QuoteDetails,
  TransactionStep,
} from '../../../types/evm/onTapPay.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { TRANSACTION_STEP } from '../constant/OnTapPay.constants';
import { getBridgeQuote, getSwapQuote } from '../service/evmSwapService';
import { addLocalTransaction } from '../service/localTransactionService';

const QUOTE_DEBOUNCE_DELAY = 800;
const SLIPPAGE_TOLERANCE = 0.5;
const MIN_NATIVE_FOR_GAS = '0.001';

type SwapPath = 'NATIVE_TO_USDC' | 'NATIVE_TO_USDT_TO_USDC' | 'USDT_TO_USDC' | 'NONE';

interface Asset {
  code: string;
  name: string;
  address: string;
  decimals: number;
  balance: number;
  logoUri: string;
}

interface SwapQuoteResponse {
  inputAmount: string;
  inputToken: string;
  outputAmount: string;
  outputToken: string;
  pricePerToken: string;
  fee: string;
  poolAddress: string;
}

interface BridgeQuoteResponse {
  quotes: {
    conversionRate: string;
    minimumAmountOut: string;
    slippageTolerance: string;
  };
}

interface UseOneTapPayProps {
  bridgeRecipient: string;
  onRampUrl?: string;
  onComplete: (data: {
    amount: number;
    quoteDetails: QuoteDetails;
    transactionHash: string;
    bridgeTransactionHash?: string;
  }) => void;
}

// const logger = {
//   step: (step: TransactionStep, data?: unknown) =>
//     console.log(`[STEP:${step}]`, TRANSACTION_STEP_MESSAGES[step], data || ''),
//   info: (message: string, data?: unknown) => console.log(`[INFO] ${message}`, data || ''),
//   error: (message: string, error?: unknown) => console.error(`[ERROR] ${message}`, error || ''),
//   success: (message: string, data?: unknown) => console.log(`[SUCCESS] ${message}`, data || ''),
// };

export const useOneTapPay = ({ bridgeRecipient, onRampUrl, onComplete }: UseOneTapPayProps) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const evmWallet = connectedWallets[WalletType.EVM];
  const senderAddress = evmWallet?.address;
  const provider = getProvider(WalletType.EVM);

  const [amount, setAmount] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<TransactionStep>(TRANSACTION_STEP.IDLE);
  const [quoteDetails, setQuoteDetails] = useState<QuoteDetails | null>(null);
  const [bridgeQuoteDetails, setBridgeQuoteDetails] = useState<BridgeQuoteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string>('0');
  const [usdtBalance, setUsdtBalance] = useState<string>('0');
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(false);
  const [assets, setAssets] = useState<{
    native: Asset | null;
    usdt: Asset | null;
    usdc: Asset | null;
  }>({
    native: null,
    usdt: null,
    usdc: null,
  });
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [swapPath, setSwapPath] = useState<SwapPath>('NONE');

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestIdRef = useRef<string>('');

  const fetchBalancesAndAssets = useCallback(async () => {
    if (!senderAddress || !provider) return;

    setIsBalanceLoading(true);
    try {
      const chainIdHex = await provider.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(chainIdHex, 16);
      setChainId(currentChainId);

      const config = getConfigByChainId(currentChainId);
      if (!config) {
        throw new Error(`Unsupported chain: ${currentChainId}`);
      }

      const nativeBal = await provider.request({
        method: 'eth_getBalance',
        params: [senderAddress, 'latest'],
      });
      const nativeBalanceFormatted = ethers.formatEther(nativeBal);
      setNativeBalance(nativeBalanceFormatted);

      const ethersProvider = new ethers.BrowserProvider(provider);

      const usdtContract = new ethers.Contract(config.usdt, ERC20_ABI, ethersProvider);
      let usdtBal = '0';
      let usdtDecimals = 6;

      try {
        const [balance, decimals] = await Promise.all([
          usdtContract.balanceOf(senderAddress),
          usdtContract.decimals(),
        ]);
        usdtDecimals = Number(decimals);
        usdtBal = ethers.formatUnits(balance, usdtDecimals);
        setUsdtBalance(usdtBal);
      } catch (err) {
        console.error('Failed to fetch USDT balance', err);
      }

      // Fetch USDC balance
      const usdcContract = new ethers.Contract(config.usdc, ERC20_ABI, ethersProvider);
      let usdcBal = '0';
      let usdcDecimals = 6;

      try {
        const [balance, decimals] = await Promise.all([
          usdcContract.balanceOf(senderAddress),
          usdcContract.decimals(),
        ]);
        usdcDecimals = Number(decimals);
        usdcBal = ethers.formatUnits(balance, usdcDecimals);
        setUsdcBalance(usdcBal);
      } catch (err) {
        console.log(err);
        // logger.error('Failed to fetch USDC balance', err);
      }

      const nativeAsset: Asset = {
        code: config.nativeSymbol,
        name: `${config.nativeSymbol}`,
        address: config.wNative,
        decimals: 18,
        balance: parseFloat(nativeBalanceFormatted),
        logoUri: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${config.wNative}/logo.png`,
      };

      const usdtAsset: Asset = {
        code: 'USDT',
        name: 'Tether USD',
        address: config.usdt,
        decimals: usdtDecimals,
        balance: parseFloat(usdtBal),
        logoUri:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
      };

      const usdcAsset: Asset = {
        code: 'USDC',
        name: 'USD Coin',
        address: config.usdc,
        decimals: usdcDecimals,
        balance: parseFloat(usdcBal),
        logoUri:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
      };

      setAssets({ native: nativeAsset, usdt: usdtAsset, usdc: usdcAsset });

      // logger.success('Balances loaded', {
      //   native: nativeBalanceFormatted,
      //   usdt: usdtBal,
      //   usdc: usdcBal,
      //   chainId: currentChainId,
      //   isTestnet: config.isTestnet,
      // });
    } catch (error) {
      // logger.error('Balance fetch failed', error);
      setError(`Failed to fetch balances: ${(error as Error).message}`);
    } finally {
      setIsBalanceLoading(false);
    }
  }, [senderAddress, provider]);

  useEffect(() => {
    fetchBalancesAndAssets();
  }, [fetchBalancesAndAssets]);

  const determineSwapPath = useCallback(
    (amountIn: string): SwapPath => {
      if (!chainId || !assets.native || !assets.usdt) return 'NONE';

      const inputAmount = parseFloat(amountIn);
      const nativeBal = parseFloat(nativeBalance);
      const usdtBal = parseFloat(usdtBalance);
      const minGas = parseFloat(MIN_NATIVE_FOR_GAS);
      if (nativeBal > inputAmount + minGas) {
        return 'NATIVE_TO_USDT_TO_USDC';
      } else if (usdtBal >= inputAmount) {
        return 'USDT_TO_USDC';
      }

      return 'NONE';
    },
    [chainId, assets, nativeBalance, usdtBalance]
  );

  const fetchQuotes = useCallback(
    async (currentAmount: string, requestId: string) => {
      const num = parseFloat(currentAmount);
      if (isNaN(num) || num <= 0 || !chainId || !assets.native || !assets.usdt) {
        setQuoteDetails(null);
        setBridgeQuoteDetails(null);
        setSwapPath('NONE');
        return;
      }

      const path = determineSwapPath(currentAmount);
      setSwapPath(path);

      if (path === 'NONE') {
        setError('Insufficient balance for this transaction');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setCurrentStep(TRANSACTION_STEP.FETCHING_QUOTES);
      setError(null);

      try {
        const config = getConfigByChainId(chainId);
        if (!config) throw new Error(`Unsupported chain: ${chainId}`);

        const networkKey = getNetworkKeyFromChainId(chainId);
        if (!networkKey) throw new Error(`Network key not found for chain: ${chainId}`);

        const chainType = chainId === 1 || chainId === 11155111 ? 'ETH' : 'BNB';

        if (path === 'NATIVE_TO_USDT_TO_USDC') {
          // logger.info('Fetching Native -> USDT swap quote', { amount: currentAmount });

          const swapPayload = {
            tokenIn: {
              symbol: assets.native.code,
              name: assets.native.name,
              decimals: assets.native.decimals,
              address: config.wNative,
              balance: '0',
              logoUri: assets.native.logoUri,
            },
            tokenOut: {
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: assets.usdt.decimals,
              address: config.usdt,
              balance: assets.usdt.balance.toString(),
              logoUri: assets.usdt.logoUri,
            },
            swapType: 'exactInputSingle',
            amount: currentAmount,
          };

          const swapResponse = (await getSwapQuote(
            chainId,
            swapPayload as any
          )) as unknown as SwapQuoteResponse;

          // Convert fee from number to string for SwapQuoteResponse compatibility
          swapResponse.fee = String(swapResponse.fee);

          if (requestId !== lastRequestIdRef.current) return;
          // logger.success('Swap quote received', swapResponse);

          const bridgeResponse: BridgeQuoteResponse = await getBridgeQuote(
            swapResponse.outputAmount,
            chainType
          );

          if (requestId !== lastRequestIdRef.current) return;
          // logger.success('Bridge quote received', bridgeResponse);

          const newQuoteDetails: QuoteDetails = {
            price: 'DEX + Bridge',
            rate1: `1 ${swapResponse.inputToken} ≈ ${swapResponse.pricePerToken} ${swapResponse.outputToken}`,
            slippage1: `${SLIPPAGE_TOLERANCE}%`,
            minReceived1: `${(parseFloat(swapResponse.outputAmount) * (1 - SLIPPAGE_TOLERANCE / 100)).toFixed(4)} ${swapResponse.outputToken}`,
            provider: 'Uniswap V3',
            rate2: `1 USDT ≈ ${bridgeResponse.quotes.conversionRate} USDC`,
            slippage2: `${bridgeResponse.quotes.slippageTolerance}%`,
            minReceived2: `${bridgeResponse.quotes.minimumAmountOut} USDC`,
            rawQuote: swapResponse,
          };

          const newBridgeDetails: BridgeQuoteDetails = {
            provider: 'Allbridge',
            rate: `1 USDT = ${bridgeResponse.quotes.conversionRate} USDC`,
            slippage: `${bridgeResponse.quotes.slippageTolerance}%`,
            minReceived: `${bridgeResponse.quotes.minimumAmountOut} USDC`,
            rawQuote: bridgeResponse,
          };

          setQuoteDetails(newQuoteDetails);
          setBridgeQuoteDetails(newBridgeDetails);
        } else if (path === 'USDT_TO_USDC') {
          // logger.info('Fetching USDT -> USDC bridge quote', { amount: currentAmount });

          const bridgeResponse: BridgeQuoteResponse = await getBridgeQuote(
            currentAmount,
            chainType
          );

          if (requestId !== lastRequestIdRef.current) return;
          // logger.success('Bridge quote received', bridgeResponse);

          const newQuoteDetails: QuoteDetails = {
            price: 'Direct Bridge',
            rate1: `1 USDT ≈ ${bridgeResponse.quotes.conversionRate} USDC`,
            slippage1: `${bridgeResponse.quotes.slippageTolerance}%`,
            minReceived1: `${bridgeResponse.quotes.minimumAmountOut} USDC`,
            provider: 'Allbridge',
            rate2: '',
            slippage2: '',
            minReceived2: '',
            rawQuote: {
              inputAmount: currentAmount,
              inputToken: 'USDT',
              outputAmount: currentAmount,
              outputToken: 'USDT',
              pricePerToken: '1.0',
              fee: '0',
              poolAddress: '',
            },
          };

          const newBridgeDetails: BridgeQuoteDetails = {
            provider: 'Allbridge',
            rate: `1 USDT = ${bridgeResponse.quotes.conversionRate} USDC`,
            slippage: `${bridgeResponse.quotes.slippageTolerance}%`,
            minReceived: `${bridgeResponse.quotes.minimumAmountOut} USDC`,
            rawQuote: bridgeResponse,
          };

          setQuoteDetails(newQuoteDetails);
          setBridgeQuoteDetails(newBridgeDetails);
        }

        setCurrentStep(TRANSACTION_STEP.IDLE);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (requestId !== lastRequestIdRef.current) return;

        // logger.error('Quote fetch failed', err);
        setError(`Failed to fetch quotes: ${(err as Error).message}`);
        setQuoteDetails(null);
        setBridgeQuoteDetails(null);
        setCurrentStep(TRANSACTION_STEP.ERROR);
      }
    },
    [chainId, assets, determineSwapPath]
  );

  const scheduleQuoteFetch = useCallback(
    (currentAmount: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      const requestId = `${Date.now()}-${Math.random()}`;
      lastRequestIdRef.current = requestId;

      timeoutRef.current = setTimeout(
        () => fetchQuotes(currentAmount, requestId),
        QUOTE_DEBOUNCE_DELAY
      );
    },
    [fetchQuotes]
  );

  useEffect(() => {
    if (chainId && amount) {
      scheduleQuoteFetch(amount);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [amount, chainId, scheduleQuoteFetch]);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value;
    setAmount(newAmount);
    setError(null);
    setSuccessMessage(null);
  }, []);

  const checkAndApproveUSDT = async (spender: string, amount: bigint): Promise<void> => {
    if (!provider || !senderAddress || !assets.usdt || !chainId) {
      throw new Error('Missing required data for approval');
    }

    const config = getConfigByChainId(chainId);
    if (!config) throw new Error(`Unsupported chain: ${chainId}`);

    const ethersProvider = new ethers.BrowserProvider(provider);
    const usdtContract = new ethers.Contract(config.usdt, ERC20_ABI, ethersProvider);

    const currentAllowance = await usdtContract.allowance(senderAddress, spender);

    if (currentAllowance < amount) {
      // logger.step(TRANSACTION_STEP.SIGNING_APPROVAL, { spender, amount: amount.toString() });
      setCurrentStep(TRANSACTION_STEP.SIGNING_APPROVAL);

      const usdtInterface = new ethers.Interface(ERC20_ABI);
      const approvalData = usdtInterface.encodeFunctionData('approve', [spender, amount]);

      const approveTxParams = {
        from: senderAddress,
        to: config.usdt,
        data: approvalData,
        value: '0x0',
      };

      const approveGasEstimate = await provider.request({
        method: 'eth_estimateGas',
        params: [approveTxParams],
      });

      setCurrentStep(TRANSACTION_STEP.EXECUTING_APPROVAL);
      const approveTxHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ ...approveTxParams, gas: approveGasEstimate }],
      });

      // logger.success('Approval transaction sent', { txHash: approveTxHash });
      await waitForTransaction(approveTxHash);
      // logger.success('USDT approval confirmed');
    } else {
      console.info('USDT allowance sufficient, skipping approval');
    }
  };

  const executeSwap = async (): Promise<string> => {
    if (!provider || !senderAddress || !quoteDetails?.rawQuote || !chainId || !assets.usdt) {
      throw new Error('Missing swap data');
    }

    // logger.step(TRANSACTION_STEP.PREPARING_SWAP);
    setCurrentStep(TRANSACTION_STEP.PREPARING_SWAP);

    const config = getConfigByChainId(chainId);
    if (!config) throw new Error(`Unsupported chain: ${chainId}`);

    try {
      const swapData = quoteDetails.rawQuote as SwapQuoteResponse;
      const swapInterface = new ethers.Interface(SWAP_ROUTER_ABI);
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      const minAmountOut = ethers.parseUnits(
        (parseFloat(swapData.outputAmount) * (1 - SLIPPAGE_TOLERANCE / 100)).toFixed(
          assets.usdt.decimals
        ),
        assets.usdt.decimals
      );

      const swapParams = {
        tokenIn: config.wNative,
        tokenOut: config.usdt,
        fee: 3000,
        recipient: senderAddress,
        deadline,
        amountIn: ethers.parseEther(amount),
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0,
      };

      const swapCallData = swapInterface.encodeFunctionData('exactInputSingle', [swapParams]);

      const txParams: any = {
        from: senderAddress,
        to: config.swapRouter,
        value: ethers.parseEther(amount).toString(),
        data: swapCallData,
      };

      const gasEstimate = await provider.request({
        method: 'eth_estimateGas',
        params: [txParams],
      });
      txParams.gas = gasEstimate;

      setCurrentStep(TRANSACTION_STEP.EXECUTING_SWAP);
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      });

      // logger.success('Swap executed successfully', { txHash });

      // Store in localStorage for monitoring
      addLocalTransaction({
        hash: txHash,
        chainId,
        type: 'swap',
        timestamp: Date.now(),
        description: `Swap ${assets.native?.code} → USDT`,
      });

      return txHash;
    } catch (error) {
      // logger.error('Swap execution failed', error);
      throw new Error(`Swap failed: ${(error as Error).message}`);
    }
  };

  const executeBridge = async (usdtAmount: string): Promise<string> => {
    if (!provider || !senderAddress || !assets.usdt || !chainId) {
      throw new Error('Missing bridge data');
    }

    // logger.step(TRANSACTION_STEP.PREPARING_BRIDGE);
    setCurrentStep(TRANSACTION_STEP.PREPARING_BRIDGE);

    const config = getConfigByChainId(chainId);
    if (!config) throw new Error(`Unsupported chain: ${chainId}`);

    try {
      const formattedAmount = ethers.parseUnits(usdtAmount, assets.usdt.decimals);
      await checkAndApproveUSDT(bridgeRecipient, formattedAmount);
      const usdtInterface = new ethers.Interface(ERC20_ABI);
      const transferData = usdtInterface.encodeFunctionData('transfer', [
        bridgeRecipient,
        formattedAmount,
      ]);

      const txParams = {
        from: senderAddress,
        to: config.usdt,
        data: transferData,
        value: '0x0',
      };

      const gasEstimate = await provider.request({
        method: 'eth_estimateGas',
        params: [txParams],
      });

      setCurrentStep(TRANSACTION_STEP.EXECUTING_BRIDGE);
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ ...txParams, gas: gasEstimate }],
      });

      // logger.success('Bridge executed successfully', { txHash });

      // Store in localStorage for monitoring
      addLocalTransaction({
        hash: txHash,
        chainId,
        type: 'bridge',
        timestamp: Date.now(),
        description: `Bridge USDT → USDC`,
      });

      return txHash;
    } catch (error) {
      // logger.error('Bridge execution failed', error);
      throw new Error(`Bridge failed: ${(error as Error).message}`);
    }
  };

  const waitForTransaction = async (txHash: string): Promise<void> => {
    if (!provider) throw new Error('Provider not available');

    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      try {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });

        if (receipt) {
          // logger.success('Transaction confirmed', { txHash, receipt });
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      } catch (error) {
        // logger.error('Error checking transaction', error);
        throw error;
      }
    }

    throw new Error('Transaction confirmation timeout');
  };

  const handleApprove = async (): Promise<void> => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (swapPath === 'NONE') {
      setError('Insufficient balance for this transaction');
      return;
    }

    if (!quoteDetails?.rawQuote) {
      setError('No quote available. Please try again');
      return;
    }

    // logger.step(TRANSACTION_STEP.PREPARING_APPROVAL);
    setCurrentStep(TRANSACTION_STEP.PREPARING_APPROVAL);
    setError(null);
    setSuccessMessage(null);

    try {
      let swapTxHash: string;
      let bridgeTxHash: string | undefined;

      if (swapPath === 'NATIVE_TO_USDT_TO_USDC') {
        // logger.info('Executing: Native Token → USDT (Swap) → USDC (Bridge)');
        swapTxHash = await executeSwap();
        await waitForTransaction(swapTxHash);
        const swapData = quoteDetails.rawQuote as SwapQuoteResponse;
        bridgeTxHash = await executeBridge(swapData.outputAmount);
        await waitForTransaction(bridgeTxHash);
      } else if (swapPath === 'USDT_TO_USDC') {
        // logger.info('Executing: USDT → USDC (Direct Bridge)');

        swapTxHash = await executeBridge(amount);
        await waitForTransaction(swapTxHash);
        bridgeTxHash = swapTxHash;
      } else {
        throw new Error('Invalid swap path');
      }

      await fetchBalancesAndAssets();

      setCurrentStep(TRANSACTION_STEP.COMPLETED);
      const successMsg =
        swapPath === 'NATIVE_TO_USDT_TO_USDC'
          ? 'Successfully swapped to USDT and bridged to USDC!'
          : 'Successfully bridged to USDC!';

      setSuccessMessage(successMsg);

      onComplete({
        amount: num,
        quoteDetails,
        transactionHash: swapTxHash,
        bridgeTransactionHash: bridgeTxHash,
      });
    } catch (err) {
      setCurrentStep(TRANSACTION_STEP.ERROR);
      const errorMsg = (err as Error).message;
      setError(errorMsg);
      // logger.error('Transaction failed', err);
    }
  };

  const handleDeposit = () => {
    if (onRampUrl) {
      window.open(onRampUrl, '_blank', 'noopener,noreferrer');
    } else {
      setError('Deposit URL not configured');
    }
  };

  const hasInsufficientBalance =
    parseFloat(nativeBalance) <= parseFloat(MIN_NATIVE_FOR_GAS) && parseFloat(usdtBalance) === 0;

  return {
    amount,
    currentStep,
    quoteDetails,
    bridgeQuoteDetails,
    error,
    successMessage,
    nativeBalance,
    usdtBalance,
    usdcBalance,
    isBalanceLoading,
    senderAddress,
    chainId,
    assets,
    swapPath,
    hasInsufficientBalance,
    handleAmountChange,
    handleApprove,
    handleDeposit,
  };
};
