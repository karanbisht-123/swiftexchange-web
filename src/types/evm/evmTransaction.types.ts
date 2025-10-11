export interface EVMSendTransaction {
  id: string;
  type: 'send';
  from: string;
  to: string;
  amount: string;
  asset: string;
  network: string;
  chainId: string;
  nonce?: number;
  data?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  gasLimit?: string;
  value: string;
  timestamp: number;
  status: 'pending' | 'signed' | 'broadcasted' | 'confirmed' | 'failed';
  memo?: string;
}

export interface EVMReceiveTransaction {
  id: string;
  type: 'receive';
  to: string;
  amount: string;
  asset: string;
  network: string;
  chainId: string;
  from?: string;
  timestamp: number;
  status: 'pending' | 'confirmed';
}

export interface EVMTransactionOptions {
  memo?: string;
  gasPrice?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}
