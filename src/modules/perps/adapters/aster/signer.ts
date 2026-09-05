import { getAddress, isAddress } from 'ethers';
import type { Signer } from 'ethers';

export const EVM_CHAIN_NAME_MAP: Record<number, string> = {
  1: 'ETH',
  56: 'BSC',
  42161: 'Arbitrum',
};

export function getEVMChainName(chainId: number): string {
  const name = EVM_CHAIN_NAME_MAP[chainId];
  if (!name) {
    throw new Error(
      `Unsupported EVM chainId ${chainId}. Allowed chains: 1 (ETH), 56 (BSC), 42161 (Arbitrum).`
    );
  }
  return name;
}

export interface EVMWithdrawPayload {
  destination: string;
  token: string;
  amount: string;
  fee: string;
  nonce: number | bigint;
}

export async function signEVMWithdraw(
  signer: Signer,
  chainId: number,
  params: EVMWithdrawPayload
): Promise<string> {
  if (!isAddress(params.destination)) {
    throw new Error(`Invalid destination EVM address: ${params.destination}`);
  }

  const checksummedDestination = getAddress(params.destination);
  const destinationChain = getEVMChainName(chainId);

  const domain = {
    name: 'Aster',
    version: '1',
    chainId: chainId,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };

  const types = {
    Action: [
      { name: 'type', type: 'string' },
      { name: 'destination', type: 'address' },
      { name: 'destination Chain', type: 'string' },
      { name: 'token', type: 'string' },
      { name: 'amount', type: 'string' },
      { name: 'fee', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'aster chain', type: 'string' },
    ],
  };

  const value = {
    type: 'Withdraw',
    destination: checksummedDestination,
    'destination Chain': destinationChain,
    token: params.token,
    amount: params.amount,
    fee: params.fee,
    nonce: params.nonce,
    'aster chain': 'Mainnet',
  };

  return await signer.signTypedData(domain, types, value);
}

export class AsterSigner {
  privateKey?: string;

  constructor(privateKey?: string) {
    this.privateKey = privateKey;
  }

  public async signRequest(): Promise<any> {
    throw new Error('Not implemented: trading is not enabled yet for Aster');
  }
}
