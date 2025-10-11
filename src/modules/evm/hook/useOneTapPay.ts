import { useCallback, useEffect, useRef, useState } from 'react';

import { ethers } from 'ethers';

// import { SWAP_CONFIGS } from "../../../config/swapConfigs";
import type {
  BridgeQuoteDetails,
  QuoteDetails,
  TransactionStep,
  // ExecuteRequest,
} from '../../../types/evm/onTapPay.types';
import { useWalletStore } from '../../wallet/store.ts/walletStore';
import { TRANSACTION_STEP, TRANSACTION_STEP_MESSAGES } from '../constant/OnTapPay.constants';
import { sendCryptoEVMBroadcast, sendCryptoEVMPrepare } from '../service/evmService';
import {
  getBridgeQuote,
  // executeSwapTransaction,
  getSwapQuote,
} from '../service/evmSwapService';
import { handleEvmSwap } from '../utils/evmSwapUtils';
// import { SWAP_ROUTER_ABI } from "../../../abi/SwapRouterABI";
import { getNativeBalance } from '../utils/evmUtils';

const BRIDGE_RECIPIENT = import.meta.env.VITE_USDT_CONTRACT_ADDRESS as string;
const QUOTE_DEBOUNCE_DELAY = 800;
const SLIPPAGE_TOLERANCE = 0.5;
// const TRANSACTION_DEADLINE = 600;
const DEFAULT_FEE = 3000;
const EVM_CHAIN = 'sepolia';

const USDT_ABI = [
  'function transfer(address to, uint256 value) public returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const ASSETS = {
  sell: {
    code: 'WETH',
    name: 'Wrapped Ethereum',
    decimals: 18,
    address: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
    isNative: false,
    balance: 0,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  },
  buy: {
    code: 'USDT',
    name: 'USDT Coin',
    decimals: 6,
    address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    isNative: false,
    balance: 0,
    logoUri:
      'https://tokens.pancakeswap.finance/images/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d.png',
  },
} as const;

interface UseOneTapPayProps {
  onComplete: (data: {
    amount: number;
    quoteDetails: QuoteDetails;
    transactionHash: string;
    bridgeTransactionHash?: string;
  }) => void;
}

interface UseOneTapPayReturn {
  amount: string;
  currentStep: any;
  quoteDetails: QuoteDetails | null;
  bridgeQuoteDetails: BridgeQuoteDetails | null;
  error: string | null;
  successMessage: string | null;
  balance: string | null;
  isBalanceLoading: boolean;
  senderAddress: string | undefined;
  handleAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleApprove: () => Promise<void>;
}

const logger = {
  step: (step: TransactionStep, data?: unknown) =>
    console.log(
      `[TRANSACTION_STEP:${step.toUpperCase()}]`,
      TRANSACTION_STEP_MESSAGES[step],
      data || ''
    ),
  info: (message: string, data?: unknown) => console.log(`[INFO] ${message}`, data || ''),
  error: (message: string, error?: unknown) => console.error(`[ERROR] ${message}`, error || ''),
  success: (message: string, data?: unknown) => console.log(`[SUCCESS] ${message}`, data || ''),
};

const isValidAmount = (amount: string): boolean => {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
};

const validateAddresses = () => {
  if (!BRIDGE_RECIPIENT || !ethers.isAddress(BRIDGE_RECIPIENT)) {
    throw new Error('Invalid bridge recipient address configuration');
  }
  if (!ethers.isAddress(ASSETS.sell.address) || !ethers.isAddress(ASSETS.buy.address)) {
    throw new Error('Invalid token address');
  }
};

export const useOneTapPay = ({ onComplete }: UseOneTapPayProps): UseOneTapPayReturn => {
  const { walletAddresses, getPrivateKey, isSessionValid } = useWalletStore();
  const senderAddress = walletAddresses.find(addr => addr.startsWith('0x') && addr.length === 42);

  const [amount, setAmount] = useState<string>('0.0001');
  const [currentStep, setCurrentStep] = useState<TransactionStep>(TRANSACTION_STEP.IDLE);
  const [quoteDetails, setQuoteDetails] = useState<QuoteDetails | null>(null);
  const [bridgeQuoteDetails, setBridgeQuoteDetails] = useState<BridgeQuoteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestIdRef = useRef<string>('');
  const balanceCacheKey = useRef<string>('');

  useEffect(() => {
    if (!senderAddress || !isSessionValid()) {
      setError('Please connect your wallet first');
      return;
    }
    try {
      validateAddresses();
      logger.info('Hook initialized', { chain: EVM_CHAIN, senderAddress });
    } catch (error) {
      setError(`Configuration error: ${(error as Error).message}`);
    }
  }, [senderAddress, isSessionValid]);

  const fetchBalance = useCallback(async () => {
    if (!senderAddress) return;
    const cacheKey = `${EVM_CHAIN}-${senderAddress}`;
    if (cacheKey === balanceCacheKey.current && balance !== null) return;

    setIsBalanceLoading(true);
    try {
      const bal = await getNativeBalance(EVM_CHAIN, senderAddress);
      setBalance(bal);
      balanceCacheKey.current = cacheKey;
      logger.success('Balance fetched', { balance: bal });
    } catch (error) {
      setBalance('0');
      setError(`Failed to fetch balance: ${(error as Error).message}`);
    } finally {
      setIsBalanceLoading(false);
    }
  }, [senderAddress]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const fetchQuotes = useCallback(async (currentAmount: string, requestId: string) => {
    logger.step(TRANSACTION_STEP.FETCHING_QUOTES, { amount: currentAmount });
    if (!isValidAmount(currentAmount)) {
      setQuoteDetails(null);
      setError('Please enter a valid positive amount.');
      return;
    }

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setCurrentStep(TRANSACTION_STEP.FETCHING_QUOTES);
    setError(null);
    setSuccessMessage(null);
    setBridgeQuoteDetails(null);

    try {
      const quoteRequest = {
        tokenIn: {
          symbol: ASSETS.sell.code,
          name: ASSETS.sell.name,
          decimals: ASSETS.sell.decimals,
          address: ASSETS.sell.address,
          balance: ASSETS.sell.balance.toString(),
          logoUri: ASSETS.sell.logoUri,
        },
        tokenOut: {
          symbol: ASSETS.buy.code,
          name: ASSETS.buy.name,
          decimals: ASSETS.buy.decimals,
          address: ASSETS.buy.address,
          balance: ASSETS.buy.balance.toString(),
          logoUri: ASSETS.buy.logoUri,
        },
        amount: currentAmount,
      };

      const swapResponse = await getSwapQuote(EVM_CHAIN, quoteRequest);
      if (requestId !== lastRequestIdRef.current) return;

      const swapQuote = {
        inputAmount: swapResponse.inputAmount || currentAmount,
        inputToken: swapResponse.inputToken || ASSETS.sell.code,
        outputAmount: swapResponse.outputAmount || '0',
        outputToken: swapResponse.outputToken || ASSETS.buy.code,
        pricePerToken:
          swapResponse.pricePerToken ||
          (parseFloat(swapResponse.outputAmount || '0') / parseFloat(currentAmount)).toFixed(6),
        fee: swapResponse.fee || DEFAULT_FEE.toString(),
        poolAddress: swapResponse.poolAddress || '',
      };

      const newQuoteDetails: any = {
        price: 'Uniswap',
        rate1: `1 ${ASSETS.sell.code} = ${swapQuote.pricePerToken} ${ASSETS.buy.code}`,
        slippage1: `${swapResponse.priceImpact || 0}%`,
        minReceived1: `${(
          parseFloat(swapQuote.outputAmount) *
          (1 - SLIPPAGE_TOLERANCE / 100)
        ).toFixed(4)} ${ASSETS.buy.code}`,
        provider: 'Uniswap',
        rate2: `1 ${ASSETS.buy.code} = ${(1 / parseFloat(swapQuote.pricePerToken)).toFixed(
          6
        )} ${ASSETS.sell.code}`,
        slippage2: `${SLIPPAGE_TOLERANCE}%`,
        minReceived2: `${(
          parseFloat(swapQuote.outputAmount) *
          (1 - SLIPPAGE_TOLERANCE / 100)
        ).toFixed(4)} ${ASSETS.buy.code}`,
        rawQuote: swapResponse,
      };

      setQuoteDetails(newQuoteDetails);

      const bridgeQuoteRequest = {
        amount: swapQuote.outputAmount,
        chainType: 'ETH',
      };

      const bridgeResponse = await getBridgeQuote(
        bridgeQuoteRequest.amount,
        bridgeQuoteRequest.chainType
      );
      if (requestId !== lastRequestIdRef.current) return;

      const bridgeQuoteDetails: BridgeQuoteDetails = {
        provider: 'Allbridge',
        rate: `1 ${ASSETS.buy.code} = ${bridgeResponse.quotes.conversionRate} USDC`,
        slippage: `${bridgeResponse.quotes.slippageTolerance}%`,
        minReceived: `${bridgeResponse.quotes.minimumAmountOut} USDC`,
        rawQuote: bridgeResponse,
      };

      setBridgeQuoteDetails(bridgeQuoteDetails);
      setCurrentStep(TRANSACTION_STEP.IDLE);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || requestId !== lastRequestIdRef.current)
      )
        return;
      setError(`Failed to fetch quotes: ${(err as Error).message}`);
      setQuoteDetails(null);
      setBridgeQuoteDetails(null);
      setCurrentStep(TRANSACTION_STEP.ERROR);
    }
  }, []);

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
    scheduleQuoteFetch(amount);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [amount, scheduleQuoteFetch]);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value;
    setAmount(newAmount);
    setError(null);
    setSuccessMessage(null);
    setCurrentStep(TRANSACTION_STEP.IDLE);
  }, []);

  const transferUsdt = async (amount: string): Promise<string> => {
    logger.step(TRANSACTION_STEP.PREPARING_BRIDGE, { amount });
    try {
      const privateKey = await getPrivateKey('evm');
      if (!privateKey) throw new Error('EVM private key not found');

      const wallet = new ethers.Wallet(privateKey);
      const usdtInterface = new ethers.Interface(USDT_ABI);
      const formattedAmount = ethers.parseUnits(amount, ASSETS.buy.decimals);

      const transferData = usdtInterface.encodeFunctionData('transfer', [
        BRIDGE_RECIPIENT,
        formattedAmount,
      ]);

      const preInfo = await sendCryptoEVMPrepare(
        EVM_CHAIN,
        wallet.address,
        ASSETS.buy.address,
        amount
      );

      (console.log(preInfo, '---------------'), 'chai =n id ');
      const chainId = parseInt(preInfo?.unsignedTx?.chainId, 10);
      if (isNaN(chainId)) {
        throw new Error(`Invalid chainId: ${preInfo?.unsignedTx?.chainId}`);
      }

      const transaction = {
        to: ASSETS.buy.address,
        data: transferData,
        nonce: preInfo?.unsignedTx?.nonce,
        gasLimit: preInfo?.unsignedTx?.gasLimit,
        gasPrice: preInfo?.unsignedTx?.gasPrice,
        value: '0',
        chainId: preInfo?.unsignedTx?.chainId,
      };

      setCurrentStep(TRANSACTION_STEP.EXECUTING_BRIDGE);
      const signedTx = await wallet.signTransaction(transaction);
      console.log(signedTx, 'hkdskjhkjshdkjdhs');
      const txHash = await sendCryptoEVMBroadcast(signedTx, EVM_CHAIN);

      if (!txHash) {
        throw new Error('USDT transfer failed: No transaction hash received');
      }

      await fetchBalance();
      return txHash;
    } catch (error) {
      throw new Error(`USDT transfer failed: ${(error as Error).message}`);
    }
  };

  const handleEvmSwapWrapper = async (): Promise<{
    swapTxHash: string;
    bridgeTxHash?: string;
  }> => {
    logger.step(TRANSACTION_STEP.PREPARING_SWAP);
    setCurrentStep(TRANSACTION_STEP.PREPARING_SWAP);
    try {
      if (!quoteDetails?.rawQuote) throw new Error('No valid quote available');
      if (!senderAddress) throw new Error('Sender address not available');

      const swapQuote = {
        inputAmount: quoteDetails.rawQuote.inputAmount || amount,
        outputAmount: quoteDetails.rawQuote.outputAmount || '0',
        inputToken: quoteDetails.rawQuote.inputToken || ASSETS.sell.code,
        outputToken: quoteDetails.rawQuote.outputToken || ASSETS.buy.code,
        fee: quoteDetails.rawQuote.fee || DEFAULT_FEE.toString(),
        poolAddress: quoteDetails.rawQuote.poolAddress || '',
      };

      const modifiedBuyAsset = {
        ...ASSETS.buy,
        code: 'USDC',
      };

      const modifiedSellAsset = {
        ...ASSETS.sell,
        code: 'ETH',
        isNative: true,
      };

      const swapTxHash = await handleEvmSwap(
        EVM_CHAIN,
        swapQuote,
        modifiedSellAsset,
        modifiedBuyAsset,
        senderAddress,
        amount,
        SLIPPAGE_TOLERANCE,
        getPrivateKey
      );

      let bridgeTxHash: string | undefined;
      if (bridgeQuoteDetails) {
        setCurrentStep(TRANSACTION_STEP.PREPARING_BRIDGE);
        bridgeTxHash = await transferUsdt((quoteDetails.rawQuote as any).outputAmount.toString());
      }

      await fetchBalance();
      return { swapTxHash, bridgeTxHash };
    } catch (error) {
      console.log(error, 'hiii i ameorr ');
      throw new Error(`Swap transaction failed: ${(error as Error).message}`);
    }
  };

  const handleApprove = async (): Promise<void> => {
    if (!isValidAmount(amount)) {
      setError('Please enter a valid positive amount.');
      return;
    }
    if (parseFloat(amount) > parseFloat(balance || '0')) {
      setError('Insufficient balance for swap.');
      return;
    }
    if (!quoteDetails?.rawQuote) {
      setError('No valid quote available.');
      return;
    }

    logger.step(TRANSACTION_STEP.PREPARING_APPROVAL, { amount });
    setCurrentStep(TRANSACTION_STEP.PREPARING_APPROVAL);
    setError(null);
    setSuccessMessage(null);

    try {
      const { swapTxHash, bridgeTxHash } = await handleEvmSwapWrapper();
      setCurrentStep(TRANSACTION_STEP.COMPLETED);
      const message = bridgeTxHash
        ? 'Swap and bridge transfer completed successfully!'
        : 'Swap completed successfully!';
      setSuccessMessage(message);

      onComplete({
        amount: parseFloat(amount),
        quoteDetails,
        transactionHash: swapTxHash,
        bridgeTransactionHash: bridgeTxHash,
      });
    } catch (err) {
      setCurrentStep(TRANSACTION_STEP.ERROR);
      setError(`Transaction failed: ${(err as Error).message}`);
    }
  };

  return {
    amount,
    currentStep,
    quoteDetails,
    bridgeQuoteDetails,
    error,
    successMessage,
    balance,
    isBalanceLoading,
    senderAddress,
    handleAmountChange,
    handleApprove,
  };
};
