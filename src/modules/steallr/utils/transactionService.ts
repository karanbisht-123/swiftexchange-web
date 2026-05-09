import { getStellarConfig } from '../../walletconnect/config/chains';

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

/**
 * Submits a signed transaction XDR to the Stellar Horizon server.
 */
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

/**
 * Unified service to sign and submit Stellar transactions.
 * Handles both WalletConnect (multichain) and Freighter extension.
 */
export const signAndSubmitTransaction = async (
  params: SignAndSubmitParams
): Promise<SignAndSubmitResult> => {
  const { xdr, network, networkPassphrase, provider } = params;

  try {
    // 1. Handle Freighter Extension
    const win = window as any;
    if (provider?.isFreighter || (win.freighter && provider === win.freighter)) {
      console.log('[StellarTransactionService] Using Freighter');
      const freighter = win.freighterApi || win.freighter;

      const signResult = await freighter.signTransaction(xdr, {
        network,
        networkPassphrase
      });

      const signedXdr = typeof signResult === 'string' ? signResult : signResult?.signedTxXdr;

      if (!signedXdr) {
        throw new Error('Freighter failed to sign the transaction');
      }

      // Submit signed XDR to Horizon
      const config = getStellarConfig(network.toLowerCase() as any);
      const hash = await submitToHorizon(signedXdr, config.horizonUrl);

      return { success: true, hash };
    }

    // 2. Handle WalletConnect
    if (provider?.client && provider?.session) {
      console.log('[StellarTransactionService] Using WalletConnect');

      console.log("-----------")
      const config = getStellarConfig(network.toLowerCase() as any);
      const stellarNetwork = config.chainId; // 'pubnet' or 'testnet'

      const topic = provider.session.topic;
      const chainId = `stellar:${stellarNetwork}`;

      const signParams = {
        xdr,
        network: stellarNetwork.toUpperCase(), // 'PUBNET' or 'TESTNET'
        networkPassphrase,
      };

      console.log('[StellarTransactionService] signParams:', signParams);

      try {
        // Try signAndSubmitXDR first
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
      } catch (wcError: any) {
        console.warn('[StellarTransactionService] stellar_signAndSubmitXDR failed, trying fallback...', wcError);

        // Fallback: Try stellar_signTransaction if signAndSubmit is not supported
        const signResult = await provider.client.request({
          topic,
          chainId,
          request: {
            method: 'stellar_signTransaction',
            params: signParams,
          },
        });

        const signedXdr = signResult?.signedXDR || (typeof signResult === 'string' ? signResult : null);

        if (!signedXdr) {
          throw new Error('Wallet failed to sign the transaction');
        }

        const config = getStellarConfig(network.toLowerCase() as any);
        const hash = await submitToHorizon(signedXdr, config.horizonUrl);
        return { success: true, hash };
      }
    }

    // 3. Fallback for other providers that might have a simple request method
    if (typeof provider?.request === 'function') {
      console.log('[StellarTransactionService] Using generic provider.request');
      const result = await provider.request({
        method: 'stellar_signAndSubmitXDR',
        params: {
          xdr,
          network: network.toUpperCase(),
          networkPassphrase,
        },
      });

      if (result?.status === 'success' || result?.hash) {
        return { success: true, hash: result.hash };
      }

      return { success: false, error: 'Transaction failed' };
    }

    throw new Error('No compatible Stellar wallet provider found');

  } catch (error: any) {
    console.error('[StellarTransactionService] Error:', error);
    return {
      success: false,
      error: error?.message || 'Failed to sign and submit transaction',
    };
  }
};
