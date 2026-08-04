import { useCallback, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';
import { ethers } from 'ethers';

import { notifyWalletSignRequest } from '../../../../../utils/walletConnectUtils';
import { StellarSequenceTracker } from '../../../../stellar/utils/StellarSequenceTracker';
import { signAndSubmitTransaction } from '../../../../stellar/utils/transactionService';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { findChain } from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import {
  type NearIntentQuote,
  type NearIntentQuoteRequest,
  type NearIntentToken,
  fetchNearIntentTokens,
  getEvmChainId,
  getNearIntentQuote,
  isStellarBlockchain,
  safeParseUnits,
  submitNearIntentDeposit,
} from '../services/oneClickApi';

export { getEvmChainId };

export interface UseNearIntentCrossChainProps {
  evmAddress: string;
  stellarAddress: string;
  getProvider: (type: WalletType) => any;
}

export const useNearIntentCrossChain = ({
  evmAddress,
  stellarAddress,
  getProvider,
}: UseNearIntentCrossChainProps) => {
  const [tokens, setTokens] = useState<NearIntentToken[]>([]);
  const [isFetchingTokens, setIsFetchingTokens] = useState(false);
  const [quote, setQuote] = useState<NearIntentQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'IDLE' | 'PENDING_DEPOSIT' | 'SUCCESS' | 'CANCELLED' | 'FAILED'
  >('IDLE');

  const quoteAbortController = useRef<AbortController | null>(null);

  const fetchTokens = useCallback(async () => {
    setIsFetchingTokens(true);
    setError(null);
    try {
      const data = await fetchNearIntentTokens();
      setTokens(data);
    } catch (err: any) {
      console.error('Failed to fetch Near Intent tokens:', err);
      setError(err.message || 'Failed to fetch tokens');
    } finally {
      setIsFetchingTokens(false);
    }
  }, []);

  const fetchQuote = useCallback(
    async (
      sellAsset: NearIntentToken,
      buyAsset: NearIntentToken,
      amount: string,
      slippageToleranceBps: number = 100
    ) => {
      quoteAbortController.current?.abort();
      quoteAbortController.current = new AbortController();

      setQuoteLoading(true);
      setError(null);
      setQuote(null);

      try {
        const isStellarOrigin = isStellarBlockchain(sellAsset.blockchain);
        const isStellarDest = isStellarBlockchain(buyAsset.blockchain);
        const recipient = isStellarDest ? stellarAddress : evmAddress;
        const refundTo = isStellarOrigin ? stellarAddress : evmAddress;

        if (!recipient) {
          setError(
            isStellarDest
              ? 'Connect your Stellar wallet to receive XLM/Stellar assets'
              : 'Connect your EVM wallet to receive this asset'
          );
          setQuoteLoading(false);
          return;
        }

        const quotePayload: NearIntentQuoteRequest = {
          dry: false,
          ...(isStellarOrigin ? { depositMode: 'MEMO' as const } : {}),
          swapType: 'EXACT_INPUT',
          slippageTolerance: slippageToleranceBps,
          originAsset: sellAsset.assetId,
          depositType: 'ORIGIN_CHAIN',
          destinationAsset: buyAsset.assetId,
          amount,
          recipient,
          recipientType: 'DESTINATION_CHAIN',
          refundTo,
          refundType: 'ORIGIN_CHAIN',
          deadline: new Date(Date.now() + 1200000).toISOString(),
        };

        console.log(
          '[InterSwap] Sending quote request payload:',
          JSON.stringify(quotePayload, null, 2)
        );

        const data = await getNearIntentQuote(quotePayload);
        setQuote(data.quote);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Quote fetch error:', err);
          setError(err.message || 'Failed to fetch quote');
        }
      } finally {
        setQuoteLoading(false);
      }
    },
    [evmAddress, stellarAddress]
  );

  const executeDeposit = useCallback(
    async (
      sellAsset: NearIntentToken,
      amount: string,
      providedQuote?: NearIntentQuote
    ): Promise<string> => {
      const quoteToUse = providedQuote || quote;
      if (!quoteToUse || !quoteToUse.depositAddress) {
        const errMsg = 'No valid quote or deposit address';
        setError(errMsg);
        throw new Error(errMsg);
      }

      setLoading(true);
      setError(null);
      setStatus('PENDING_DEPOSIT');

      try {
        let txHashResult: string;

        if (isStellarBlockchain(sellAsset.blockchain)) {
          const stellarProvider = getProvider(WalletType.STELLAR);
          if (!stellarProvider) throw new Error('Stellar wallet not connected');

          notifyWalletSignRequest(WalletType.STELLAR);
          const config = getStellarConfig('mainnet');
          const server = new StellarSDK.Horizon.Server(config.horizonUrl);

          StellarSequenceTracker.reset(stellarAddress);

          const accountResponse = await server.loadAccount(stellarAddress);
          const baseSeq = StellarSequenceTracker.getAndIncrementSequence(
            stellarAddress,
            accountResponse.sequenceNumber()
          );
          const sourceAccount = new StellarSDK.Account(stellarAddress, baseSeq);

          const isNative =
            !sellAsset.contractAddress || sellAsset.contractAddress.toLowerCase() === 'native';
          const stellarAsset = isNative
            ? StellarSDK.Asset.native()
            : new StellarSDK.Asset(sellAsset.symbol, sellAsset.contractAddress!);

          const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
            fee: StellarSDK.BASE_FEE,
            networkPassphrase: config.networkPassphrase,
          });

          txBuilder.addOperation(
            StellarSDK.Operation.payment({
              destination: quoteToUse.depositAddress,
              asset: stellarAsset,
              amount: amount,
            })
          );

          if (quoteToUse.depositMemo) {
            txBuilder.addMemo(StellarSDK.Memo.text(quoteToUse.depositMemo));
          } else {
            console.warn(
              '[NEAR Intents] No depositMemo in quote — Stellar payment may not be attributed correctly.'
            );
          }

          const transaction = txBuilder.setTimeout(300).build();
          const xdr = transaction.toXDR();

          const result = await signAndSubmitTransaction({
            xdr,
            network: 'mainnet',
            networkPassphrase: config.networkPassphrase,
            provider: stellarProvider,
            stellarAddress,
          });

          if (!result.success || !result.hash) {
            throw new Error(result.error || 'Stellar transaction failed');
          }
          txHashResult = result.hash;
        } else {
          const provider = getProvider(WalletType.EVM);
          if (!provider) throw new Error('EVM wallet not connected');
          const targetChainId = getEvmChainId(sellAsset);
          if (targetChainId) {
            await switchOrAddChain(provider, targetChainId);
          } else {
            const chainConfig = findChain(sellAsset.blockchain, 'mainnet');
            if (chainConfig) await switchOrAddChain(provider, chainConfig.chainId);
          }

          const web3Provider = new ethers.BrowserProvider(provider);
          const signer = await web3Provider.getSigner();

          notifyWalletSignRequest(WalletType.EVM);

          const rawDeposit = quoteToUse.depositAddress;
          let depositAddr: string;
          if (/^0x[0-9a-fA-F]{40}$/.test(rawDeposit)) {
            depositAddr = ethers.getAddress(rawDeposit);
          } else if (/^[0-9a-fA-F]{40}$/.test(rawDeposit)) {
            depositAddr = ethers.getAddress(`0x${rawDeposit}`);
          } else if (/^[0-9a-fA-F]{64}$/.test(rawDeposit)) {
            throw new Error(
              'This token pair requires a NEAR-based deposit and is not yet supported for direct EVM wallets. Please select a different pair.'
            );
          } else {
            throw new Error(
              `Unrecognised deposit address format for this pair (${rawDeposit.slice(0, 12)}…). Please try a different pair.`
            );
          }

          const sellAddress = sellAsset.contractAddress || '';
          let txHashResultHex = '';
          const fromAddr = (await signer.getAddress()).toLowerCase();
          const amountInWei = BigInt(safeParseUnits(amount, sellAsset.decimals || 18));

          if (
            !sellAddress ||
            sellAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
          ) {
            const txHex = await provider.request({
              method: 'eth_sendTransaction',
              params: [
                {
                  from: fromAddr,
                  to: depositAddr,
                  value: '0x' + amountInWei.toString(16),
                },
              ],
            });
            txHashResultHex = txHex;
          } else {
            const erc20Abi = [
              'function transfer(address to, uint256 amount) public returns (bool)',
            ];
            const iface = new ethers.Interface(erc20Abi);
            const data = iface.encodeFunctionData('transfer', [depositAddr, amountInWei]);

            const txHex = await provider.request({
              method: 'eth_sendTransaction',
              params: [
                {
                  from: fromAddr,
                  to: sellAddress,
                  data,
                },
              ],
            });
            txHashResultHex = txHex;
          }
          txHashResult = txHashResultHex;
        }

        setTxHash(txHashResult);
        await submitNearIntentDeposit(
          txHashResult,
          quoteToUse.depositAddress,
          quoteToUse.depositMemo
        );
        setStatus('SUCCESS');
        return txHashResult;
      } catch (err: any) {
        const msg = (err?.message || String(err)).toLowerCase();

        // Add console log to satisfy the user's request to see the error/rejection in the console
        console.log('[InterSwap] Transaction result/error:', err);

        const rejected =
          err?.code === 4001 ||
          err?.code === 'ACTION_REJECTED' ||
          msg.includes('user rejected') ||
          msg.includes('user denied') ||
          msg.includes('user cancelled') ||
          msg.includes('rejected by user') ||
          msg.includes('signing/submission failed or was cancelled') ||
          msg.includes('cancelled');

        if (rejected) {
          setError(null);
          setStatus('CANCELLED');
          throw new DOMException('Swap aborted', 'AbortError');
        } else {
          console.error('[InterSwap] Execute deposit error:', err);
          setError(err.message || 'Transaction failed. Please try again.');
          setStatus('FAILED');
          throw err;
        }
      } finally {
        setLoading(false);
      }
    },
    [quote, getProvider]
  );

  const reset = useCallback(() => {
    setQuote(null);
    setTxHash(null);
    setError(null);
    setStatus('IDLE');
  }, []);

  return {
    tokens,
    isFetchingTokens,
    fetchTokens,
    quote,
    quoteLoading,
    fetchQuote,
    executeDeposit,
    txHash,
    loading,
    error,
    status,
    reset,
  };
};
