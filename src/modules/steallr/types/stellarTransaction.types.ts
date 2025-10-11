export interface StellarSendTransaction {
  id: string;
  type: 'send';
  from: string;
  to: string;
  amount: string;
  asset: string;
  network: string;
  chainId: string;
  sequence?: string;
  timeBounds?: {
    minTime: string;
    maxTime: string;
  };
  operations: Array<{
    type: string;
    destination: string;
    asset: string;
    amount: string;
  }>;
  xdr?: string;
  timestamp: number;
  status: 'pending' | 'signed' | 'broadcasted' | 'confirmed' | 'failed';
  memo?: string;
  fee: string;
}

export interface StellarReceiveTransaction {
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

export interface StellarTransactionOptions {
  memo?: string;
  timeBounds?: {
    minTime: number;
    maxTime: number;
  };
}
