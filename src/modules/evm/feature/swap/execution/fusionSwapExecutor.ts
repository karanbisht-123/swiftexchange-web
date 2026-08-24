import { ethers } from 'ethers';

import { useSwapStore } from '../../../../../store/swapStore';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { getChainById } from '../../../utils/Chainregistry';
import { parseRawChainId, switchOrAddChain } from '../../../utils/evmChainUtils';
import { AGGREGATOR_NATIVE_ADDRESS, LIMIT_ORDER_PROTOCOL } from '../constants/swap.constants';
import { formatAmount } from '../utils/swapAmountUtils';
import { parseSwapError } from '../utils/swapErrorHandler';
import { ensureFusionAllowance, readAllowance } from './approvalExecutor';

export interface ExecuteFusionSwapDependencies {
  simulateSwapTransaction: (
    params: any
  ) => Promise<{ canProceed: boolean; errors: string[]; warnings: string[] }>;
  build1InchFusionOrder: (params: any) => Promise<any>;
  submit1InchFusionOrder: (payload: any, isCrossChain: boolean, isNative: boolean) => Promise<any>;
  getProvider: (type: WalletType) => any;
}
function isUnsupportedMethodError(e: any): boolean {
  if (e instanceof TypeError) return true;
  const code = e?.code ?? e?.error?.code ?? e?.info?.error?.code;
  const msg = (e?.message ?? e?.info?.error?.message ?? '').toLowerCase();

  if (code === 4200 || code === -32601) return true;
  if (
    code === -32603 &&
    (msg.includes('method') ||
      msg.includes('supported') ||
      msg.includes('does not exist') ||
      msg.includes('not found') ||
      msg.includes('cannot read') ||
      msg.includes('undefined'))
  ) {
    return true;
  }
  return (
    msg.includes('unknown method') ||
    msg.includes('not supported') ||
    msg.includes('unsupported method') ||
    msg.includes('method does not exist') ||
    msg.includes('does not exist') ||
    msg.includes('cannot read properties of undefined') ||
    msg.includes('is not a function')
  );
}

export async function execute1InchFusionSwap(
  chainId: number | string,
  quote: any,
  preset: string,
  senderAddress: string,
  sellAsset: any,
  buyAsset: any,
  sellAmount: string,
  deps: ExecuteFusionSwapDependencies,
  onProgress?: (step: 'approving' | 'signing') => void,
  onApprovalTxHash?: (hash: string) => void,
  onBeforeWalletSign?: () => void
): Promise<string> {
  const provider = deps.getProvider(WalletType.EVM);
  if (!provider) throw new Error('EVM wallet not connected');

  const presetData = quote.presets?.[preset];
  if (presetData) {
    const auctionEndInSeconds = presetData.startAuctionIn + presetData.auctionDuration;
    const expiresAt = Date.now() + auctionEndInSeconds * 1000;
    if (expiresAt < Date.now() + 60_000) {
      throw new Error('Fusion quote auction window is too short — please refresh and try again');
    }
  }

  const toChainId = buyAsset.chainId || chainId;
  const isCrossChain = String(chainId) !== String(toChainId);

  const chainConfig = getChainById(chainId);
  const rawSymbol =
    (chainConfig?.symbol || chainConfig?.nativeCurrency.symbol)?.toUpperCase() || 'ETH';
  const chainSymbol = rawSymbol === 'BNB' ? 'BSC' : rawSymbol;
  const amountBN = BigInt(formatAmount(sellAmount, sellAsset.decimals));

  const isNativeAddress = (address: string | undefined | null): boolean => {
    if (!address) return true;
    const lowAddress = address.toLowerCase();
    return lowAddress === 'native' || lowAddress === '0x0000000000000000000000000000000000000000';
  };

  // Ensure the wallet is on the correct chain
  try {
    const rawChainId = await provider.request({ method: 'eth_chainId' });
    const currentChainId = parseRawChainId(rawChainId);
    const targetChainId = Number(chainId);

    if (currentChainId !== targetChainId) {
      await switchOrAddChain(provider, chainId);
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (switchErr: any) {
    console.error('[FusionExecutor] Chain switch failed:', switchErr?.message);
    const isUserReject =
      /user rejected|user cancelled|user denied|4001/i.test(switchErr?.message ?? '') ||
      switchErr?.code === 4001;
    throw new Error(
      isUserReject
        ? 'User rejected the chain switch'
        : `Chain switch failed: ${switchErr?.message || 'Unknown error'}`
    );
  }

  //Check / grant allowance
  const currentAllowance = sellAsset.isNative
    ? amountBN
    : await readAllowance(
        sellAsset.address,
        senderAddress,
        LIMIT_ORDER_PROTOCOL,
        chainId,
        provider
      );
  const requiresApproval = currentAllowance < amountBN;

  if (requiresApproval && onProgress) {
    onProgress('approving');
  }

  const { useUnlimitedApproval } = useSwapStore.getState();
  const allowance = await ensureFusionAllowance(
    sellAsset.address,
    senderAddress,
    amountBN,
    provider,
    chainId,
    onBeforeWalletSign,
    useUnlimitedApproval
  );
  if (allowance.approvalTxHash && onApprovalTxHash) {
    onApprovalTxHash(allowance.approvalTxHash);
  }

  //Pre-flight simulation
  const simResult = await deps.simulateSwapTransaction({
    networkKey: chainId,
    from: senderAddress,
    to: AGGREGATOR_NATIVE_ADDRESS,
    value: sellAsset.isNative ? amountBN.toString() : '0',
  });

  if (!simResult.canProceed && !simResult.errors.some(e => e.includes('execution will fail'))) {
    const errorDetails = [...simResult.errors, ...simResult.warnings].join(' | ');
    throw new Error(`Simulation Alert: ${errorDetails}`);
  }

  //Build the Fusion order
  const normalizedTokenIn =
    sellAsset.isNative || isNativeAddress(sellAsset.address)
      ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
      : sellAsset.address;
  const normalizedTokenOut =
    buyAsset.isNative || isNativeAddress(buyAsset.address)
      ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
      : buyAsset.address;

  const secretCount =
    quote.presets?.[preset]?.secretsCount || quote.presets?.[preset]?.secretCount || 1;
  const isSourceNative = sellAsset.isNative || isNativeAddress(sellAsset.address);

  const fusionOrder = await deps.build1InchFusionOrder({
    quote,
    tokenIn: normalizedTokenIn,
    tokenOut: normalizedTokenOut,
    amount: amountBN.toString(),
    walletAddress: senderAddress,
    chain: chainSymbol,
    preset,
    permit: '',
    toChain: isCrossChain
      ? (() => {
          const chainInfo = getChainById(toChainId);
          const symbol =
            (chainInfo?.symbol || chainInfo?.nativeCurrency.symbol)?.toUpperCase() || 'ETH';
          return symbol === 'BNB' ? 'BSC' : symbol;
        })()
      : undefined,
    secretCount: isCrossChain ? secretCount : undefined,
    isNative: isSourceNative,
  });

  const { typedData, extension, orderHash } = fusionOrder;

  if (!orderHash) throw new Error('No orderHash received from build order');

  // Sign or broadcast
  let submitPayload: any;

  if (fusionOrder.transaction) {
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner(senderAddress);

    const txParams = {
      // `from` omitted — signer is already bound to senderAddress via getSigner(senderAddress)
      to: fusionOrder.transaction.to,
      data: fusionOrder.transaction.data,
      value: BigInt(fusionOrder.transaction.value || 0),
    };

    if (onProgress) onProgress('signing');
    onBeforeWalletSign?.();
    const txResponse = await signer.sendTransaction(txParams);

    submitPayload = {
      orderHash: fusionOrder.orderHash,
      txHash: txResponse.hash,
      srcChain: chainSymbol,
    };
  } else {
    if (!typedData) throw new Error('No typed data received from build order');
    if (!extension) throw new Error('No extension data received from build order');

    if (onProgress) onProgress('signing');
    onBeforeWalletSign?.();
    let signature: string | undefined;

    try {
      signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [senderAddress, JSON.stringify(typedData)],
      });
    } catch (err1: any) {
      if (!isUnsupportedMethodError(err1)) {
        throw err1;
      }
      console.warn('[FusionExecutor] eth_signTypedData_v4 not supported, trying v3…');
      try {
        signature = await provider.request({
          method: 'eth_signTypedData',
          params: [senderAddress, JSON.stringify(typedData)],
        });
      } catch (err2: any) {
        if (!isUnsupportedMethodError(err2)) throw err2;
        throw new Error(
          'Your wallet does not support EIP-712 message signing (eth_signTypedData). ' +
            'Please use a wallet that supports this feature (e.g., MetaMask, Rabby).'
        );
      }
    }

    if (!signature) throw new Error('Signature cancelled or empty — please try again');

    const orderMessage = typedData.message;
    const orderFields = {
      maker: orderMessage.maker,
      makerAsset: orderMessage.makerAsset,
      takerAsset: orderMessage.takerAsset,
      makerTraits: orderMessage.makerTraits,
      salt: orderMessage.salt,
      makingAmount: orderMessage.makingAmount,
      takingAmount: orderMessage.takingAmount,
      receiver: orderMessage.receiver || senderAddress,
    };

    if (isCrossChain) {
      const destChainInfo = getChainById(toChainId);
      const destRawSymbol =
        (destChainInfo?.symbol || destChainInfo?.nativeCurrency.symbol)?.toUpperCase() || 'ETH';
      submitPayload = {
        chain: chainSymbol,
        toChain: destRawSymbol === 'BNB' ? 'BSC' : destRawSymbol,
        order: orderFields,
        signature,
        extension,
        quoteId: quote.quoteId,
        orderHash,
      };
    } else {
      submitPayload = {
        chain: chainSymbol,
        order: orderFields,
        quoteId: quote.quoteId,
        extension,
        signature,
        permit: '',
        orderHash,
      };
    }
  }

  // Submit with retry
  const MAX_RETRIES = 1;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await deps.submit1InchFusionOrder(submitPayload, isCrossChain, isSourceNative);

      break;
    } catch (err: any) {
      const msg = (err.message ?? '').toLowerCase();
      const isTransient =
        msg.includes('allowance') ||
        msg.includes('permit') ||
        msg.includes('balance') ||
        msg.includes('insufficient');

      if (isTransient && attempt < MAX_RETRIES) {
        console.warn(
          `[FusionExecutor] Submission failed (transient), retrying ${attempt}/${MAX_RETRIES}…`
        );
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      throw new Error(parseSwapError(err));
    }
  }

  return orderHash;
}
