export const formatAddress = (address: string, startChars = 6, endChars = 4): string => {
  if (!address) return '';
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
};

export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const isValidStellarAddress = (address: string): boolean => {
  return /^G[A-Z2-7]{55}$/.test(address);
};

export const isValidCosmosAddress = (address: string): boolean => {
  const prefixes = ['cosmos', 'osmo', 'dydx', 'juno', 'atom'];
  return prefixes.some(prefix => address.startsWith(prefix)) && address.length > 20;
};

export const detectChainTypeFromAddress = (
  address: string
): 'evm' | 'stellar' | 'cosmos' | 'unknown' => {
  if (isValidEthereumAddress(address)) return 'evm';
  if (isValidStellarAddress(address)) return 'stellar';
  if (isValidCosmosAddress(address)) return 'cosmos';
  return 'unknown';
};

export const formatChainId = (chainId: string | number): string => {
  if (typeof chainId === 'number') {
    return chainId.toString();
  }
  if (chainId.includes(':')) {
    const [, reference] = chainId.split(':');
    return reference;
  }

  return chainId;
};

export const toHexChainId = (chainId: string | number): string => {
  const id = typeof chainId === 'string' ? parseInt(chainId) : chainId;
  return `0x${id.toString(16)}`;
};

export const fromHexChainId = (hexChainId: string): number => {
  return parseInt(hexChainId, 16);
};

export const getExplorerUrl = (
  address: string,
  chain: any,
  type: 'address' | 'tx' = 'address'
): string => {
  if (!chain.blockExplorerUrls || chain.blockExplorerUrls.length === 0) {
    return '';
  }

  const baseUrl = chain.blockExplorerUrls[0];
  return `${baseUrl}/${type}/${address}`;
};

export const formatTokenBalance = (
  balance: string | number,
  decimals: number = 18,
  displayDecimals: number = 4
): string => {
  const balanceNumber = typeof balance === 'string' ? parseFloat(balance) : balance;
  const divisor = Math.pow(10, decimals);
  const formatted = (balanceNumber / divisor).toFixed(displayDecimals);
  return parseFloat(formatted).toString();
};

export const parseTokenAmount = (amount: string | number, decimals: number = 18): string => {
  const amountNumber = typeof amount === 'string' ? parseFloat(amount) : amount;
  const multiplier = Math.pow(10, decimals);
  return Math.floor(amountNumber * multiplier).toString();
};

export const isWalletInjected = (walletName: string): boolean => {
  const win = window as any;

  const walletChecks: Record<string, () => boolean> = {
    metamask: () => win.ethereum?.isMetaMask,
    trust: () => win.ethereum?.isTrust,
    coinbase: () => win.ethereum?.isCoinbaseWallet,
    freighter: () => !!win.freighter,
  };

  return walletChecks[walletName.toLowerCase()]?.() || false;
};

export const getWalletIcon = (walletName: string): string => {
  const icons: Record<string, string> = {
    metamask: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
    trust: 'https://trustwallet.com/assets/images/media/assets/TWT.png',
    walletconnect: 'https://avatars.githubusercontent.com/u/37784886',
    coinbase: 'https://www.coinbase.com/img/favicon/favicon-32x32.png',
    phantom: 'https://phantom.app/img/phantom-logo.png',
  };

  return icons[walletName.toLowerCase()] || '';
};

export const waitForTransaction = async (
  provider: any,
  txHash: string,
  confirmations: number = 1
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const checkConfirmation = async () => {
      try {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });

        if (receipt) {
          const currentBlock = await provider.request({
            method: 'eth_blockNumber',
          });

          const blocksPassed = parseInt(currentBlock, 16) - parseInt(receipt.blockNumber, 16);

          if (blocksPassed >= confirmations) {
            resolve(receipt);
          } else {
            setTimeout(checkConfirmation, 2000);
          }
        } else {
          setTimeout(checkConfirmation, 2000);
        }
      } catch (error) {
        reject(error);
      }
    };

    checkConfirmation();
  });
};

export const estimateGas = async (provider: any, transaction: any): Promise<string> => {
  try {
    const gasEstimate = await provider.request({
      method: 'eth_estimateGas',
      params: [transaction],
    });

    return gasEstimate;
  } catch (error) {
    console.error('Gas estimation failed:', error);
    throw error;
  }
};

export const getGasPrice = async (provider: any): Promise<string> => {
  try {
    const gasPrice = await provider.request({
      method: 'eth_gasPrice',
    });

    return gasPrice;
  } catch (error) {
    console.error('Failed to get gas price:', error);
    throw error;
  }
};

export const formatLargeNumber = (num: number): string => {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export const getSafeErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.reason) return error.reason;
  return 'An unknown error occurred';
};
