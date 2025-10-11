export interface AmountQuoteStepProps {
  onComplete: (data: {
    amount: number;
    quoteDetails: QuoteDetails;
    transactionHash: string;
    bridgeTransactionHash?: string;
  }) => void;
  onBack: () => void;
  chain: Chain;
  senderAddress: string;
  getPrivateKey: (type: string) => Promise<string | null>;
}

export interface QuoteDetails {
  price: string;
  rate1: string;
  slippage1: string;
  minReceived1: string;
  provider: string;
  rate2: string;
  slippage2: string;
  minReceived2: string;
  rawQuote: SwapQuote;
}

export interface BridgeQuoteDetails {
  provider: string;
  rate: string;
  slippage: string;
  minReceived: string;
  rawQuote: any;
}

export type TransactionStep =
  | 'idle'
  | 'fetching_quotes'
  | 'preparing_approval'
  | 'signing_approval'
  | 'executing_approval'
  | 'preparing_swap'
  | 'signing_swap'
  | 'executing_swap'
  | 'preparing_bridge'
  | 'executing_bridge'
  | 'completed'
  | 'error';

export interface SwapQuote {
  poolAddress: string;
  outputToken: string;
  inputToken: string;
  outputAmount: string;
  inputAmount: string;
  buyAmount: string;
  rate: string;
  priceImpact?: string;
  provider?: string;
  fee?: number;
}

export type Chain = string; // Adjust based on your chainConfigs
export interface PrepareRequest {
  address: string;
  swapType: string;
  swapData: string;
  value: string;
  approveData: string;
}

export interface ExecuteRequest {
  txs: string[];
}
