import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  LogOut,
  Plus,
  Send,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import UniversalProvider from '@walletconnect/universal-provider';
import { Web3Modal } from '@web3modal/standalone';
import { Asset, Networks, Operation, TransactionBuilder } from 'stellar-sdk';
import { Horizon } from 'stellar-sdk';

interface WalletData {
  address: string;
  chainId: string;
  namespace: string;
  chainType: string;
  topic: string;
  timestamp: number;
}

interface ChainConfig {
  name: string;
  icon: string;
  namespace: string;
  chains: string[];
  methods: string[];
  events: string[];
  rpcMap?: Record<string, string>;
}

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

const MultiWalletConnector = () => {
  const [provider, setProvider] = useState<any>(null);
  const [web3Modal, setWeb3Modal] = useState<any>(null);
  const [connectedWallets, setConnectedWallets] = useState<WalletData[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSendingTx, setIsSendingTx] = useState(false);

  const chainConfigs: Record<string, ChainConfig> = {
    stellar: {
      name: 'Stellar',
      icon: '✦',
      namespace: 'stellar',
      chains: ['stellar:testnet'],
      methods: ['stellar_signTransaction', 'stellar_signAndSubmitTransaction'],
      events: ['accountsChanged'],
    },
    evm: {
      name: 'EVM',
      icon: '⟠',
      namespace: 'eip155',
      chains: ['eip155:1'],
      methods: [
        'eth_sendTransaction',
        'eth_signTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
      ],
      events: ['chainChanged', 'accountsChanged'],
      rpcMap: {
        '1': 'https://eth.llamarpc.com',
        '137': 'https://polygon-rpc.com',
        '56': 'https://bsc-dataseed.binance.org',
        '42161': 'https://arb1.arbitrum.io/rpc',
      },
    },
    cosmos: {
      name: 'Cosmos',
      icon: '⚛',
      namespace: 'cosmos',
      chains: ['cosmos:cosmoshub-4', 'cosmos:osmosis-1', 'cosmos:dydx-mainnet-1'],
      methods: ['cosmos_signDirect', 'cosmos_signAmino'],
      events: ['chainChanged', 'accountsChanged'],
    },
  };

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    initializeProvider();
  }, []);

  const initializeProvider = async () => {
    setIsInitializing(true);
    try {
      const universalProvider = await UniversalProvider.init({
        projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: 'Multi-Chain Wallet App',
          description: 'Connect wallets across EVM, Cosmos, and Stellar',
          url: window.location.origin,
          icons: ['https://SwiftEx/icon.png'],
        },
      });

      universalProvider.on('display_uri', (uri: string) => {
        console.log('WalletConnect URI:', uri);
      });

      universalProvider.on('session_update', ({ topic, params }: any) => {
        console.log(topic, params, 'fjhjkfgjfgkjfgkjfghfjk');
        const session = universalProvider.session;
        if (session) {
          console.log(session, 'to my session');
          updateWalletsFromSession(session);
        }
      });

      universalProvider.on('session_delete', ({ topic }: any) => {
        setConnectedWallets(prev => prev.filter(w => w.topic !== topic));
        setActiveSessions(prev => {
          const newSessions = new Set(prev);
          newSessions.delete(topic);
          return newSessions;
        });
        showToast('info', 'Wallet session disconnected');
      });

      const modal = new Web3Modal({
        projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
        standaloneChains: [
          ...chainConfigs.evm.chains,
          ...chainConfigs.cosmos.chains,
          ...chainConfigs.stellar.chains,
        ],
        walletConnectVersion: 2,
        themeMode: 'dark',
        themeVariables: { '--w3m-z-index': '9999' },
      });

      const sessions = universalProvider.session;
      if (sessions) {
        const sessionArray = Array.isArray(sessions) ? sessions : [sessions];
        const restoredWallets: WalletData[] = [];
        const topics = new Set<string>();

        sessionArray.forEach((session: any) => {
          topics.add(session.topic);
          Object.keys(session.namespaces).forEach(namespace => {
            const accounts = session.namespaces[namespace]?.accounts || [];
            accounts.forEach((account: string) => {
              const parts = account.split(':');
              const chainType = Object.keys(chainConfigs).find(
                key => chainConfigs[key].namespace === namespace
              );
              restoredWallets.push({
                address: parts[parts.length - 1],
                chainId: parts.length > 2 ? parts[1] : parts[0],
                namespace: namespace,
                chainType: chainType || namespace,
                topic: session.topic,
                timestamp: Date.now(),
              });
            });
          });
        });

        if (restoredWallets.length > 0) {
          setConnectedWallets(restoredWallets);
          showToast('success', `${restoredWallets.length} wallet(s) restored`);
        }
        setActiveSessions(topics);
      }

      setProvider(universalProvider);
      setWeb3Modal(modal);
    } catch (error: any) {
      console.error('Failed to initialize provider:', error);
      showToast('error', 'Failed to initialize wallet connector');
    } finally {
      setIsInitializing(false);
    }
  };

  const updateWalletsFromSession = (session: any) => {
    const newWallets: WalletData[] = [];
    Object.keys(session.namespaces).forEach(namespace => {
      const accounts = session.namespaces[namespace]?.accounts || [];
      accounts.forEach((account: string) => {
        const parts = account.split(':');
        const chainType = Object.keys(chainConfigs).find(
          key => chainConfigs[key].namespace === namespace
        );
        newWallets.push({
          address: parts[parts.length - 1],
          chainId: parts.length > 2 ? parts[1] : parts[0],
          namespace: namespace,
          chainType: chainType || namespace,
          topic: session.topic,
          timestamp: Date.now(),
        });
      });
    });

    setConnectedWallets(prev => {
      const existing = new Set(prev.map(w => `${w.address}-${w.topic}`.toLowerCase()));
      const unique = newWallets.filter(w => !existing.has(`${w.address}-${w.topic}`.toLowerCase()));
      return [...prev, ...unique];
    });
  };

  const connectWallet = async () => {
    if (!provider || !web3Modal) return;
    setIsConnecting(true);

    try {
      const optionalNamespaces: Record<string, any> = {};

      Object.values(chainConfigs).forEach(config => {
        optionalNamespaces[config.namespace] = {
          methods: config.methods,
          chains: config.chains,
          events: config.events,
          ...(config.rpcMap && { rpcMap: config.rpcMap }),
        };
      });

      const { uri, approval } = await provider.client.connect({
        optionalNamespaces,
        pairingTopic: undefined,
      });

      if (uri) {
        web3Modal.openModal({ uri });
      }

      const session = await approval();
      console.log(session, 'hii i am session ----------------');
      web3Modal.closeModal();

      if (session) {
        setActiveSessions(prev => new Set([...prev, session.topic]));
        updateWalletsFromSession(session);

        const namespaces = Object.keys(session.namespaces).join(', ');
        showToast('success', `Connected to ${namespaces} wallet`);
      }
    } catch (error: any) {
      console.error('Connection failed:', error);
      web3Modal.closeModal();

      console.log(error.message, 'error message ----');
      if (error.message?.includes('User rejected')) {
        showToast('info', 'Connection cancelled');
      } else {
        showToast('error', 'Failed to connect wallet. Please try again.');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async (wallet: WalletData) => {
    try {
      if (provider && wallet.topic) {
        await provider.disconnect({
          topic: wallet.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
      }
      setConnectedWallets(prev => prev.filter(w => w.topic !== wallet.topic));
      setActiveSessions(prev => {
        const newSessions = new Set(prev);
        newSessions.delete(wallet.topic);
        return newSessions;
      });
      showToast('success', 'Wallet disconnected');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      showToast('error', 'Failed to disconnect wallet');
    }
  };

  const disconnectAll = async () => {
    try {
      if (!provider) return;

      const topics = Array.from(activeSessions);
      await Promise.all(
        topics.map(topic =>
          provider.disconnect({
            topic,
            reason: { code: 6000, message: 'User disconnected all' },
          })
        )
      );

      setConnectedWallets([]);
      setActiveSessions(new Set());
      showToast('success', 'All wallets disconnected');
    } catch (error) {
      console.error('Failed to disconnect all:', error);
      showToast('error', 'Failed to disconnect some wallets');
    }
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 1500);
    showToast('success', 'Address copied to clipboard');
  };

  const sendTestTransaction = async (wallet: WalletData) => {
    setIsSendingTx(true);
    try {
      const server = new Horizon.Server('https://horizon-testnet.stellar.org');
      const account = await server.loadAccount(wallet.address);
      const transaction = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: 'GCYNLQAXROO26U2ZBHUB5FDLFXMIISGOMVDBFFRK7Z3RGKA2VI5BVA6I',
            asset: Asset.native(),
            amount: '200',
          })
        )
        .setTimeout(30)
        .build();

      const xdr = transaction.toXDR();

      const requestPromise = provider.client.request({
        topic: wallet.topic,
        chainId: `${wallet.namespace}:${wallet.chainId}`,
        request: {
          method: 'stellar_signAndSubmitTransaction',
          params: { xdr },
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Wallet approval timed out')), 60000)
      );

      const result = await Promise.race([requestPromise, timeoutPromise]);

      alert('Transaction submitted successfully!');
      console.log('Transaction result:', result);
    } catch (error: any) {
      console.error('Transaction error:', error);
      alert(`Transaction failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSendingTx(false);
    }
  };

  const formatAddress = (address: string) =>
    address.length <= 10 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;

  const getChainDisplayName = (chainType: string, chainId: string) => {
    const evm: Record<string, string> = {
      '1': 'Ethereum',
      '137': 'Polygon',
      '56': 'BSC',
      '42161': 'Arbitrum',
    };
    const cosmos: Record<string, string> = {
      'cosmoshub-4': 'Cosmos Hub',
      'osmosis-1': 'Osmosis',
      'dydx-mainnet-1': 'dYdX',
    };
    const stellar: Record<string, string> = {
      pubnet: 'Stellar Mainnet',
      testnet: 'Stellar Testnet',
    };
    if (chainType === 'evm') return evm[chainId] || `Chain ${chainId}`;
    if (chainType === 'cosmos') return cosmos[chainId] || chainId;
    if (chainType === 'stellar') return stellar[chainId] || chainId;
    return chainId;
  };

  const groupWalletsByTopic = () => {
    const grouped = new Map<string, WalletData[]>();
    connectedWallets.forEach(wallet => {
      if (!grouped.has(wallet.topic)) {
        grouped.set(wallet.topic, []);
      }
      grouped.get(wallet.topic)!.push(wallet);
    });
    return Array.from(grouped.values());
  };

  const walletGroups = groupWalletsByTopic();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm border animate-in slide-in-from-top duration-300 ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : toast.type === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            {toast.type === 'info' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="ml-2 hover:opacity-70 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          {connectedWallets.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-700/50 rounded-2xl mb-6 border border-slate-600/50">
                <Wallet className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-400 mb-8 text-lg">No wallets connected</p>
              <button
                onClick={connectWallet}
                disabled={isConnecting || isInitializing || !provider}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" />
                    <span>Initializing...</span>
                  </>
                ) : isConnecting ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    <span>Connect Wallet</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Connected Wallets</h2>
                <button
                  onClick={disconnectAll}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all border border-red-500/20"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm font-medium">Disconnect All</span>
                </button>
              </div>

              <div className="space-y-4">
                {walletGroups.map((group, groupIdx) => {
                  const chainTypes = [...new Set(group.map(w => w.chainType))];
                  const primaryWallet = group[0];

                  return (
                    <div
                      key={`group-${groupIdx}`}
                      className="bg-slate-700/30 rounded-xl p-5 border border-slate-600/30 hover:border-slate-500/50 transition-all"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {chainTypes.map(type => (
                              <div
                                key={type}
                                className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-xl shadow-lg"
                                title={chainConfigs[type]?.name}
                              >
                                {chainConfigs[type]?.icon || '🔗'}
                              </div>
                            ))}
                          </div>
                          <div>
                            <div className="text-white font-semibold">
                              {chainTypes.map(t => chainConfigs[t]?.name).join(' + ')}
                            </div>
                            <div className="text-sm text-gray-400">
                              {group.length} chain{group.length > 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => disconnectWallet(primaryWallet)}
                          className="flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all text-sm font-medium"
                        >
                          <LogOut className="w-4 h-4" />
                          Disconnect
                        </button>
                      </div>

                      <div className="space-y-2">
                        {group.map((wallet, idx) => (
                          <div
                            key={`wallet-${idx}`}
                            className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 border border-slate-600/30"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-300">
                                {getChainDisplayName(wallet.chainType, wallet.chainId)}
                              </div>
                              <div className="text-xs text-gray-500 font-mono mt-1">
                                {formatAddress(wallet.address)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {wallet.chainType === 'stellar' && (
                                <button
                                  onClick={() => sendTestTransaction(wallet)}
                                  disabled={isSendingTx}
                                  className="flex items-center gap-1 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-blue-500/20"
                                >
                                  {isSendingTx ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Send className="w-3 h-3" />
                                  )}
                                  <span>Test Tx</span>
                                </button>
                              )}
                              <button
                                onClick={() => copyAddress(wallet.address)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"
                              >
                                {copiedAddress === wallet.address ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={connectWallet}
                disabled={isConnecting || !provider}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-700/30 hover:bg-slate-700/50 text-white font-medium rounded-xl transition-all border border-slate-600/30 hover:border-slate-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    <span>Connect Another Wallet</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiWalletConnector;
