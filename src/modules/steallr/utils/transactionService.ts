import * as StellarSDK from '@stellar/stellar-sdk';
import { getStellarConfig } from '../../walletconnect/config/chains';
import { StellarSequenceTracker } from './StellarSequenceTracker';
import { sendCustomNotification } from '../../../service/notificationService';

export interface SignAndSubmitParams {
  xdr: string;
  network: string;
  networkPassphrase: string;
  provider: any;
  stellarAddress?: string;
}

export interface SignAndSubmitResult {
  success: boolean;
  hash?: string;
  error?: string;
}

async function submitToHorizon(
  signedXdr: string,
  horizonUrl: string
): Promise<string> {
  const broadcastUrl = `${horizonUrl}/transactions`;
  const body = new URLSearchParams({ tx: signedXdr });

  const res = await fetch(broadcastUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await res.json();

  if (!res.ok) {
    const extras = json?.extras?.result_codes;
    if (extras) {
      const detail = extras.operations ? ` — ${extras.operations.join(', ')}` : '';
      throw new Error(`Stellar submission failed: ${extras.transaction}${detail}`);
    }
    throw new Error(json?.title || 'Horizon submission failed');
  }

  return json.hash;
}

export const signAndSubmitTransaction = async (
  params: SignAndSubmitParams
): Promise<SignAndSubmitResult> => {
  const token = localStorage.getItem('device_token');
  if (token) {
    sendCustomNotification(token, {
      title: 'Transaction Request',
      body: 'Please confirm the Stellar transaction.',
    }).catch(err => {
      console.error(err);
    });
  }
  const { network, networkPassphrase, provider } = params;
  let finalXdr = params.xdr;

  let sourceAddress: string | undefined;
  let txSeq: string | undefined;

  try {
    const tx = new StellarSDK.Transaction(finalXdr, networkPassphrase);
    sourceAddress = tx.source;
    txSeq = tx.sequence;

    if (sourceAddress && txSeq) {
      try {
        const config = getStellarConfig(network.toLowerCase() as any);
        const horizonServer = new StellarSDK.Horizon.Server(config.horizonUrl);
        const accountResponse = await horizonServer.loadAccount(sourceAddress);
        const networkSeqStr = accountResponse.sequenceNumber();
        const networkSeq = BigInt(networkSeqStr);
        const isKnown = StellarSequenceTracker.isKnownSequence(sourceAddress, txSeq);

        if (isKnown || BigInt(txSeq) > networkSeq + 1n) {
          const baseSeqUsed = BigInt(txSeq) - 1n;
          StellarSequenceTracker.syncSequence(sourceAddress, baseSeqUsed.toString());
          if (isKnown) {
            StellarSequenceTracker.removeKnownSequence(sourceAddress, txSeq);
          }
          console.log(`[StellarTransactionService] Tracker synchronized to sequence ${baseSeqUsed} for ${sourceAddress}`);
        } else {
          const baseSeq = StellarSequenceTracker.getAndIncrementSequence(sourceAddress, networkSeqStr);
          const expectedTxSeq = (BigInt(baseSeq) + 1n).toString();

          if (expectedTxSeq !== txSeq) {
            console.log(`[StellarTransactionService] Mutating XDR sequence from ${txSeq} to ${expectedTxSeq} for ${sourceAddress}`);
            (tx as any).tx._attributes.seqNum = (StellarSDK as any).xdr.SequenceNumber.fromString(expectedTxSeq);
            (tx as any)._envelope = undefined;
            finalXdr = tx.toXDR();
            txSeq = expectedTxSeq;
          }
          StellarSequenceTracker.removeKnownSequence(sourceAddress, expectedTxSeq);
        }
      } catch (seqError) {
        console.warn('[StellarTransactionService] Failed to check/correct sequence number:', seqError);
      }
    }
  } catch (parseErr) {
    console.warn('[StellarTransactionService] Failed to parse transaction XDR:', parseErr);
  }

  try {
    const win = window as any;
    if (provider?.isFreighter || (win.freighter && provider === win.freighter)) {
      console.log('[StellarTransactionService] Using Freighter');
      const freighter = win.freighterApi || win.freighter;

      const signResult = await freighter.signTransaction(finalXdr, {
        network,
        networkPassphrase
      });

      const signedXdr = typeof signResult === 'string' ? signResult : signResult?.signedTxXdr;

      if (!signedXdr) {
        throw new Error('Freighter failed to sign the transaction');
      }
      const config = getStellarConfig(network.toLowerCase() as any);
      const hash = await submitToHorizon(signedXdr, config.horizonUrl);

      return { success: true, hash };
    }

    if (provider?.client && provider?.session) {
      console.log('[StellarTransactionService] Using WalletConnect');

      console.log("-----------")
      const config = getStellarConfig(network.toLowerCase() as any);
      const stellarNetwork = config.chainId;

      const topic = provider.session.topic;
      const chainId = `stellar:${stellarNetwork}`;

      const signParams = {
        xdr: finalXdr,
        network: stellarNetwork.toUpperCase(),
        networkPassphrase,
      };

      console.log('[StellarTransactionService] signParams:', signParams);

      const result = await provider.client.request({
        topic,
        chainId,
        request: {
          method: 'stellar_signAndSubmitXDR',
          params: signParams,
        },
      });

      if (result?.status === 'success' || result?.hash) {
        return { success: true, hash: result.hash };
      }

      if (result?.signedXDR) {
        const config = getStellarConfig(network.toLowerCase() as any);
        const hash = await submitToHorizon(result.signedXDR, config.horizonUrl);
        return { success: true, hash };
      }

      if (typeof result === 'string') {
        return { success: true, hash: result };
      }

      throw new Error('Transaction signing/submission failed or was cancelled');
    }

    if (typeof provider?.request === 'function') {
      console.log('[StellarTransactionService] Using generic provider.request');
      const result = await provider.request({
        method: 'stellar_signAndSubmitXDR',
        params: {
          xdr: finalXdr,
          network: network.toUpperCase(),
          networkPassphrase,
        },
      });

      if (result?.status === 'success' || result?.hash) {
        return { success: true, hash: result.hash };
      }

      throw new Error('Transaction failed');
    }

    throw new Error('No compatible Stellar wallet provider found');

  } catch (error: any) {
    console.error('[StellarTransactionService] Error:', error);
    const errStr = error?.message || String(error);

    if (sourceAddress && txSeq) {
      const baseSeqUsed = (BigInt(txSeq) - 1n).toString();
      StellarSequenceTracker.rollbackSequence(sourceAddress, baseSeqUsed);
      if (errStr.includes('tx_bad_seq') || errStr.includes('sequence_mismatch') || errStr.includes('bad sequence')) {
        StellarSequenceTracker.reset(sourceAddress);
      }
    }

    return {
      success: false,
      error: errStr,
    };
  }
};
