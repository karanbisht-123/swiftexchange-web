export class DydxDebugger {
  static inspectOfflineSigner(signer: any, label: string = 'OfflineSigner') {
    console.group(`[DydxDebugger] Inspecting ${label}`);

    if (!signer) {
      console.error('❌ Signer is null or undefined');
      console.groupEnd();
      return;
    }

    console.log('✅ Signer exists');
    console.log('Type:', typeof signer);
    console.log('Constructor:', signer.constructor?.name);

    // Check required methods
    const requiredMethods = ['getAccounts', 'signDirect', 'signAmino'];
    requiredMethods.forEach(method => {
      const exists = typeof signer[method] === 'function';
      console.log(
        `${exists ? '✅' : '❌'} ${method}:`,
        exists ? 'function' : typeof signer[method]
      );
    });

    // Check for unexpected methods
    const unexpectedMethods = ['signTransaction', 'sign'];
    unexpectedMethods.forEach(method => {
      if (typeof signer[method] === 'function') {
        console.warn(`⚠️  Unexpected method found: ${method}`);
      }
    });

    // List all methods
    console.log('All methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(signer)));

    console.groupEnd();
  }

  static inspectLocalWallet(wallet: any, label: string = 'LocalWallet') {
    console.group(`[DydxDebugger] Inspecting ${label}`);

    if (!wallet) {
      console.error('❌ Wallet is null or undefined');
      console.groupEnd();
      return;
    }

    console.log('✅ Wallet exists');
    console.log('Type:', typeof wallet);
    console.log('Constructor:', wallet.constructor?.name);

    // Check for signing methods
    const signingMethods = ['sign', 'signDirect', 'signAmino', 'signTransaction', 'getAccounts'];

    signingMethods.forEach(method => {
      const exists = typeof wallet[method] === 'function';
      console.log(
        `${exists ? '✅' : '❌'} ${method}:`,
        exists ? 'function' : typeof wallet[method]
      );
    });

    // List all properties
    console.log('All properties:', Object.keys(wallet));
    console.log('All methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)));

    console.groupEnd();
  }

  static inspectWalletProvider(provider: any, label: string = 'WalletProvider') {
    console.group(`[DydxDebugger] Inspecting ${label}`);

    if (!provider) {
      console.error('❌ Provider is null or undefined');
      console.groupEnd();
      return;
    }

    console.log('✅ Provider exists');
    console.log('Type:', typeof provider);

    // Check if it's WalletConnect
    const isWalletConnect = !!provider.request;
    console.log(`Provider type: ${isWalletConnect ? 'WalletConnect' : 'Extension (Keplr/Leap)'}`);

    if (isWalletConnect) {
      console.log('✅ provider.request exists');
      console.log('Session:', provider.session ? '✅ Active' : '❌ No session');
    } else {
      const methods = ['enable', 'getOfflineSigner', 'signDirect', 'signAmino'];
      methods.forEach(method => {
        const exists = typeof provider[method] === 'function';
        console.log(
          `${exists ? '✅' : '❌'} ${method}:`,
          exists ? 'function' : typeof provider[method]
        );
      });
    }

    console.groupEnd();
  }

  static async testOfflineSignerMethods(signer: any) {
    console.group('[DydxDebugger] Testing OfflineSigner Methods');

    try {
      // Test getAccounts
      console.log('Testing getAccounts...');
      const accounts = await signer.getAccounts();
      console.log('✅ getAccounts success:', accounts);

      // Test signDirect (without actually signing)
      console.log('Testing signDirect availability...');
      if (typeof signer.signDirect === 'function') {
        console.log('✅ signDirect method exists');
      } else {
        console.error('❌ signDirect method missing');
      }
    } catch (error: any) {
      console.error('❌ Test failed:', error.message);
    }

    console.groupEnd();
  }

  static traceOrderPlacement(params: any) {
    console.group('[DydxDebugger] Order Placement Trace');
    console.log('Order params:', params);
    console.log('Timestamp:', new Date().toISOString());
    console.groupEnd();
  }

  static catchSigningError(error: any, context: string) {
    console.group(`[DydxDebugger] Signing Error - ${context}`);
    console.error('Error:', error);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Error stack:', error?.stack);

    // Common issues
    if (error?.message?.includes('signTransaction')) {
      console.error('🔴 ISSUE: Trying to call signTransaction instead of signDirect');
      console.error('SOLUTION: Ensure LocalWallet is created from a proper OfflineSigner');
    }

    if (error?.message?.includes('undefined')) {
      console.error('🔴 ISSUE: Method is undefined');
      console.error('SOLUTION: Check that wallet provider has required Cosmos signing methods');
    }

    console.groupEnd();
  }
}

// Enhanced dYdXWalletService with debugging
export function createDebuggedDydxWalletService() {
  return {
    async connect(this: any, subaccountNumber: number = 0) {
      console.log('[DEBUG] Starting dYdX connection...', subaccountNumber);

      // Original connection logic...
      // After getting offlineSigner:
      DydxDebugger.inspectWalletProvider(this.walletProvider, 'Cosmos Provider');
      DydxDebugger.inspectOfflineSigner(this.offlineSigner, 'OfflineSigner');
      await DydxDebugger.testOfflineSignerMethods(this.offlineSigner);

      // After creating LocalWallet:
      DydxDebugger.inspectLocalWallet(this.localWallet, 'LocalWallet');

      // Continue with original logic...
    },
  };
}
