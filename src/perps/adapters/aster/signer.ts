import type { Signer } from 'ethers';

export async function signEVMWithdraw(
  signer: Signer,
  chainId: number,
  params: {
    destination: string;
    destinationChain: string;
    token: string;
    amount: string;
    fee: string;
    nonce: number;
  }
): Promise<string> {
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
    destination: params.destination,
    'destination Chain': params.destinationChain,
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

  public async signRequest(_payload: any): Promise<any> {
    throw new Error('Not implemented: trading is not enabled yet for Aster');
  }
}
