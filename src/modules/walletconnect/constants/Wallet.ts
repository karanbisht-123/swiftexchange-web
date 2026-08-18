export const WalletType = {
  EVM: 'evm',
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
    id: 'swiftex',
    name: 'SwiftEx Wallet',
    icon: '/logo.avif',
    type: WalletType.EVM,
  },
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

export const STELLAR_WALLETS: WalletConfig[] = [
  {
    id: 'swiftex',
    name: 'SwiftEx Wallet',
    icon: '/logo.avif',
    type: WalletType.STELLAR,
  },
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
  stellar: ['stellar_signTransaction', 'stellar_signAndSubmitXDR'],
};

export const CHAIN_EVENTS = {
  evm: ['chainChanged', 'accountsChanged'],
  stellar: ['accountsChanged'],
};

export interface WalletMetadata {
  name: string;
  icon: string;
  redirects?: {
    native: string;
    universal: string;
  };
}

export const WALLET_METADATA_MAP: Record<string, WalletMetadata> = {
  swiftex: {
    name: 'SwiftEx Wallet',
    icon: 'https://explorer-api.walletconnect.com/v3/logo/sm/54c06c6a-333d-49d6-f2fd-7e89d2068500?projectId=fdde0f7f2696cc4d849103c23792d693',
    redirects: {
      native: 'swiftEx://app.swiftexchange.io',
      universal: 'https://app.swiftexchange.io/',
    },
  },
  metamask: {
    name: 'MetaMask',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3ymr3UNKopfI0NmUY95Dr-0589vG-91KuAA&s',
    redirects: {
      native: 'metamask://',
      universal: 'https://metamask.app.link/wc',
    },
  },
  trust: {
    name: 'Trust Wallet',
    icon: 'https://play-lh.googleusercontent.com/cd5BevWohRqLwsI2_i3k4YIVtcO57cIZCs6l20H1Hcdj0P2rFEcX_7QtgKbTM3Sn_A',
    redirects: {
      native: 'trust://',
      universal: 'https://link.trustwallet.com/wc',
    },
  },
  rainbow: {
    name: 'Rainbow',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDU5aTw2FNop7OonFBOXEeAXb1biSQbBr6Ew&s',
    redirects: {
      native: 'rainbow://',
      universal: 'https://rnbwapp.com/wc',
    },
  },
  lobstr: {
    name: 'LOBSTR',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRr4vU2tmIUuPEaeD2fPRDIgbC4ZcqfNzQR3Q&s',
    redirects: {
      native: 'lobstr://',
      universal: 'https://lobstr.co',
    },
  },
  freighter: {
    name: 'Freighter',
    icon: 'https://framerusercontent.com/images/hJLECaObEXnPQkYrO2ZccbSk.png?width=512&height=512',
    redirects: {
      native: 'freighter://',
      universal: 'https://freighter.app',
    },
  },
  walletconnect: {
    name: 'WalletConnect',
    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWu9CeO85RIMN2ixs9U_6YhnatWBxtCzn6L_e7QRO_CiEV1SB0LGbSXJijfHYt0N46slY&usqp=CAU',
  },
};
