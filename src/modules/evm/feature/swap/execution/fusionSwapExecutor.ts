import { ethers } from 'ethers';

import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { getChainById } from '../../../utils/Chainregistry';
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

  if (quote.deadline && Math.floor(Date.now() / 1000) > Number(quote.deadline)) {
    throw new Error('Fusion quote has expired — please refresh and try again');
  }

  const toChainId = buyAsset.chainId || chainId;
  const isCrossChain = String(chainId) !== String(toChainId);

  const chainConfig = getChainById(chainId);
  const rawSymbol =
    (chainConfig?.symbol || chainConfig?.nativeCurrency.symbol)?.toUpperCase() || 'ETH';
  const chainSymbol = rawSymbol === 'BNB' ? 'BSC' : rawSymbol;
  const amountBN = BigInt(formatAmount(sellAmount, sellAsset.decimals));

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

  if (onProgress) {
    onProgress(requiresApproval ? 'approving' : 'signing');
  }

  const allowance = await ensureFusionAllowance(
    sellAsset.address,
    senderAddress,
    amountBN,
    provider,
    chainId,
    onBeforeWalletSign
  );
  if (allowance.approvalTxHash) {
    if (onApprovalTxHash) onApprovalTxHash(allowance.approvalTxHash);
  }

  if (onProgress) onProgress('signing');

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

  const isNativeAddress = (address: string | undefined | null): boolean => {
    if (!address) return true;
    const lowAddress = address.toLowerCase();
    return lowAddress === 'native' || lowAddress === '0x0000000000000000000000000000000000000000';
  };

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
  console.log('[execute1InchFusionSwap] buildFusionOrder response:', {
    fusionOrder,
    sellAssetAddress: sellAsset.address,
    buyAssetAddress: buyAsset.address,
    normalizedTokenIn,
    normalizedTokenOut,
  });

  if (!orderHash) throw new Error('No orderHash received from build order');

  let submitPayload: any;

  if (fusionOrder.transaction) {
    console.log('[execute1InchFusionSwap] Native order returned a transaction. Broadcasting...');
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    const txParams = {
      from: senderAddress,
      to: fusionOrder.transaction.to,
      data: fusionOrder.transaction.data,
      value: BigInt(fusionOrder.transaction.value || 0),
    };

    onBeforeWalletSign?.();
    const txResponse = await signer.sendTransaction(txParams);
    console.log('[execute1InchFusionSwap] Native fusion tx broadcast:', txResponse.hash);

    submitPayload = {
      orderHash: fusionOrder.orderHash,
      txHash: txResponse.hash,
      srcChain: chainSymbol,
    };
  } else {
    if (!typedData) throw new Error('No typed data received for signing');
    if (!extension) throw new Error('No extension data received from build order');

    console.log('[execute1InchFusionSwap] Requesting signature for typedData:', typedData);
    onBeforeWalletSign?.();
    const signature: string = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [senderAddress, JSON.stringify(typedData)],
    });
    if (!signature) throw new Error('Signature cancelled or failed');
    console.log('[execute1InchFusionSwap] Signature generated:', signature);

    const orderMessage = typedData.message;
    submitPayload = {
      chain: chainSymbol,
      order: {
        maker: orderMessage.maker,
        makerAsset: orderMessage.makerAsset,
        takerAsset: orderMessage.takerAsset,
        makerTraits: orderMessage.makerTraits,
        salt: orderMessage.salt,
        makingAmount: orderMessage.makingAmount,
        takingAmount: orderMessage.takingAmount,
        receiver: orderMessage.receiver || senderAddress,
      },
      quoteId: quote.quoteId,
      extension,
      signature,
      permit: '',
      orderHash,
    };

    if (isCrossChain) {
      submitPayload = {
        chain: chainSymbol,
        toChain: (() => {
          const chainInfo = getChainById(toChainId);
          const symbol =
            (chainInfo?.symbol || chainInfo?.nativeCurrency.symbol)?.toUpperCase() || 'ETH';
          return symbol === 'BNB' ? 'BSC' : symbol;
        })(),
        order: {
          maker: orderMessage.maker,
          makerAsset: orderMessage.makerAsset,
          takerAsset: orderMessage.takerAsset,
          makerTraits: orderMessage.makerTraits,
          salt: orderMessage.salt,
          makingAmount: orderMessage.makingAmount,
          takingAmount: orderMessage.takingAmount,
          receiver: orderMessage.receiver || senderAddress,
        },
        signature,
        extension,
        quoteId: quote.quoteId,
        orderHash,
      };
    }
  }

  console.log('[execute1InchFusionSwap] Submitting order payload:', submitPayload);

  const MAX_RETRIES = 4;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await deps.submit1InchFusionOrder(submitPayload, isCrossChain, isSourceNative);
      break;
    } catch (err: any) {
      const msg = err.message?.toLowerCase() ?? '';
      const isTransient =
        msg.includes('allowance') ||
        msg.includes('permit') ||
        msg.includes('balance') ||
        msg.includes('insufficient');

      if (isTransient && attempt < MAX_RETRIES) {
        console.warn(
          `[execute1InchFusionSwap] Submission failed, retrying (${attempt}/${MAX_RETRIES})`
        );
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      console.log(err, 'fusion error');
      throw new Error(parseSwapError(err));
    }
  }

  return orderHash;
}
