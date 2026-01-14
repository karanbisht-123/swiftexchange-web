export const WalletType = {
  EVM: 'evm',
  COSMOS: 'cosmos',
  STELLAR: 'stellar',
} as const;

export type WalletType = (typeof WalletType)[keyof typeof WalletType];

export interface WalletConfig {
  id: string;
  name: string;
  icon: string;
  type: WalletType;
}

export const EVM_WALLETS: WalletConfig[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3ymr3UNKopfI0NmUY95Dr-0589vG-91KuAA&s',
    type: WalletType.EVM,
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    icon: 'https://play-lh.googleusercontent.com/cd5BevWohRqLwsI2_i3k4YIVtcO57cIZCs6l20H1Hcdj0P2rFEcX_7QtgKbTM3Sn_A',
    type: WalletType.EVM,
  },

  {
    id: 'rainbow',
    name: 'Rainbow',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDU5aTw2FNop7OonFBOXEeAXb1biSQbBr6Ew&s',
    type: WalletType.EVM,
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU',
    type: WalletType.EVM,
  },
];

export const COSMOS_WALLETS: WalletConfig[] = [
  {
    id: 'keplr',
    name: 'Keplr',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ5rMEIpPYpBjh6xhQtBd7TQDiaUi1H1VX9eA&s',
    type: WalletType.COSMOS,
  },
  {
    id: 'leap',
    name: 'Leap Wallet',
    icon: 'https://avatars.githubusercontent.com/u/99279452?s=200&v=4',
    type: WalletType.COSMOS,
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU',
    type: WalletType.COSMOS,
  },
];

export const STELLAR_WALLETS: WalletConfig[] = [
  {
    id: 'lobstr',
    name: 'LOBSTR ',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRr4vU2tmIUuPEaeD2fPRDIgbC4ZcqfNzQR3Q&s',
    type: WalletType.STELLAR,
  },

  {
    id: 'freighter',
    name: 'FREIGHTER',
    icon: 'https://framerusercontent.com/images/hJLECaObEXnPQkYrO2ZccbSk.png?width=512&height=512',
    type: WalletType.STELLAR,
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU',
    type: WalletType.STELLAR,
  },
];

export const CHAIN_METHODS = {
  evm: [
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData',
    'eth_signTypedData_v4',
  ],
  cosmos: ['cosmos_getAccounts', 'cosmos_signDirect', 'cosmos_signAmino', 'cosmos_sendTransaction'],
  stellar: ['stellar_signTransaction', 'stellar_signAndSubmitXDR'],
};

export const CHAIN_EVENTS = {
  evm: ['chainChanged', 'accountsChanged'],
  cosmos: ['accountsChanged'],
  stellar: ['accountsChanged'],
};
