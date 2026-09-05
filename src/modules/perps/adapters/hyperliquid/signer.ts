import type {
  CancelPayload,
  OrderPayload,
  PerpSigner,
  SignatureResponse,
} from '../../core/signing/signer';

/**
 * Hyperliquid implementation of PerpSigner.
 * In a real application, this would take an ethers/viem Wallet or Signer
 * to construct the EIP-712 typed data required by HL's L1.
 */
export class HyperliquidSigner implements PerpSigner {
  // private wallet: any;

  constructor(/* wallet: any */) {
    // this.wallet = wallet;
  }

  public async initialize(): Promise<void> {
    console.log('[HyperliquidSigner] Initializing agent/session keys...');
    // e.g. prompt metamask to sign the L1 "approve agent" typed data
    return Promise.resolve();
  }

  public async signOrder(order: OrderPayload): Promise<SignatureResponse> {
    console.log('[HyperliquidSigner] Signing order:', order);
    // 1. Convert our generic OrderPayload to HL's specific format (e.g. `sz`, `px`, `cloid`)
    // 2. Hash it and sign via EIP-712

    return {
      signature: 'dummy_signature',
      payload: {
        a: order.assetId,
        b: order.isBuy,
        p: order.limitPx,
        s: order.sz,
        r: order.reduceOnly,
        t: order.orderType,
      },
    };
  }

  public async signCancel(cancel: CancelPayload): Promise<SignatureResponse> {
    console.log('[HyperliquidSigner] Signing cancel:', cancel);
    // 1. Convert our generic CancelPayload to HL's specific format
    // 2. Hash it and sign via EIP-712

    return {
      signature: 'dummy_signature',
      payload: {
        a: cancel.assetId,
        o: cancel.oid,
      },
    };
  }
}
