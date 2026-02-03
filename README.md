# Swiftex Wallet Exchange 🚀

<div align="center">

**A Non-Custodial Multi-Chain DeFi Trading Platform**

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[Live Demo](https://swfitexclient-vercel.vercel.app/) | [Documentation](#) | [Report Bug](#) | [Request Feature](#)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Supported Networks](#-supported-networks)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [User Flow](#-user-flow)
- [Technology Stack](#-technology-stack)
- [Security](#-security)
- [Development](#-development)
- [Deployment](#-deployment)

---

## 🌟 Overview

**Swiftex Wallet Exchange** is an open-source, non-custodial decentralized exchange that enables seamless trading across multiple blockchain ecosystems. Connect your wallet, manage assets, swap tokens, and trade perpetual derivatives—all while maintaining full control of your funds.

### What Makes Swiftex Different?

- ✅ **Truly Non-Custodial**: You control your keys, we never see them
- ✅ **Multi-Chain Native**: EVM, Stellar, and dYdX Chain in one platform
- ✅ **Advanced Trading**: Perpetual derivatives with isolated margin support
- ✅ **WalletConnect v2**: Connect from desktop or mobile
- ✅ **Real-Time Updates**: Live market data via WebSocket
- ✅ **Open Source**: Fully auditable codebase

---

## 🎯 Key Features

### 💼 Wallet & Asset Management

- **Multi-Wallet Support**: Connect EVM (MetaMask, Coinbase Wallet, etc.) and Stellar wallets via WalletConnect v2
- **Unified Dashboard**: View all your balances across connected chains
- **Native Transfers**: Send and receive assets directly from the interface
- **Real-Time Balance Updates**: Automatic balance refresh via WebSocket

### 🔄 Cross-Chain Operations

- **EVM ↔ Stellar Bridge**: Bridge assets between EVM chains and Stellar network
- **AMM Swaps**: Trade on Stellar's automated market makers
- **Order Book Trading**: Execute trades on Stellar's decentralized order books
- **Trustline Management**: Add and manage Stellar asset trustlines

### 📈 Perpetual Trading (dYdX v4)

Powered by `@dydxprotocol/v4-client-js`:

- **Order Types**:
  - Market Orders
  - Limit Orders
  - Take-Profit / Stop-Loss
  - Post-Only Orders
  - Conditional Orders

- **Margin Modes**: 
  - ✅ Cross Margin
  - ✅ Isolated Margin

- **Real-Time Data**: Live order books, trades, and price charts
- **Subaccount Management**: Multiple trading accounts per wallet

### 📊 Market Intelligence

- Interactive price charts (TradingView Lightweight Charts)
- Live order book depth
- Recent trades feed
- Market statistics
- Portfolio tracking with P&L

---

## 🌐 Supported Networks

| Network | Features | Status |
|---------|----------|--------|
| **Ethereum** | Swaps, Transfers, Bridging | ✅ Active |
| **BNB** | Swaps, Transfers, Bridging | ✅ Active |
| **Stellar** | AMM Swaps, Order Book Trading, Trustlines | ✅ Active |
| **dYdX Chain** | Perpetual Derivatives Trading | ✅ Active |

---

## 🏗️ Architecture

### Application Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface (React)                    │
├─────────────────────────────────────────────────────────────┤
│  WalletConnect v2  │  Asset Manager  │  Trading Interface   │
├─────────────────────────────────────────────────────────────┤
│  EVM Integration   │  Stellar SDK    │  dYdX v4 Client      │
├─────────────────────────────────────────────────────────────┤
│   Ethers.js        │  Horizon API    │  Indexer WebSocket   │
├─────────────────────────────────────────────────────────────┤
│  Backend Proxy     │  Stellar RPC    │  dYdX Chain RPC      │
└─────────────────────────────────────────────────────────────┘
```

### dYdX Trading Flow

```
1. User Connects EVM Wallet
         ↓
2. Onboarding Signature Request
         ↓
3. Derive dYdX Chain Address (Deterministic)
         ↓
4. Create Local Signing Keys (In-Memory Only)
         ↓
5. Check Subaccount Balance
         ↓
6. [If Funded] → Enable Trading
   [If Not]    → Prompt Deposit
         ↓
7. Place Orders (Signed Locally)
         ↓
8. Submit to dYdX Chain for Execution
```

### Key Design Principles

- **No Private Key Storage**: All signing happens in-browser, keys stay in memory only
- **Deterministic Key Derivation**: dYdX keys derived from wallet signature
- **Client-Side Only**: Backend services are stateless proxies
- **Wallet Approval Required**: Every action requires explicit user signature

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- A compatible wallet:
  - EVM: MetaMask, Coinbase Wallet, Rainbow, etc.
  - Stellar: Freighter, Lobstr, xBull, Rabet

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-org/swiftex-wallet-exchange.git
cd swiftex-wallet-exchange
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```env
# WalletConnect Configuration
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
VITE_WALLETCONNECT_RELAY_URL=wss://relay.walletconnect.com

# Development Environment
VITE_BASE_SERVER_URL_DEV=https://dev-api.swiftex.exchange
VITE_BASE_PROXY_URL_DEV=https://dev-proxy.swiftex.exchange
VITE_API_DEVICE_AUTH_DEV=your_dev_auth_token

# Production Environment
VITE_BASE_SERVER_URL_PROD=https://api.swiftex.exchange
VITE_BASE_PROXY_URL_PROD=https://proxy.swiftex.exchange
VITE_API_DEVICE_AUTH_PROD=your_prod_auth_token
```

4. **Start development server**

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 👤 User Flow

### First-Time User Journey

#### Step 1: Connect Wallet
- Click "Connect Wallet" button
- Choose your wallet provider
- Approve connection in your wallet

#### Step 2: View Your Assets
- See all your token balances across connected chains
- Real-time price updates
- Portfolio value tracking

#### Step 3: Perform Actions

**For EVM/Stellar Operations:**
- Swap tokens on Stellar AMM
- Bridge assets between chains
- Send/receive native tokens
- Manage Stellar trustlines
- Each action requires wallet approval

**For dYdX Trading:**

1. **Complete Onboarding**
   - Sign the dYdX onboarding message (one-time)
   - Your dYdX Chain address is derived from your EVM wallet
   - No new mnemonic needed

2. **Fund Your Account** (if needed)
   - Deposit funds via dYdX bridge
   - Funds appear in your subaccount

3. **Start Trading**
   - Browse markets
   - View real-time order books and charts
   - Place market or limit orders
   - Set stop-loss and take-profit levels
   - Choose cross or isolated margin
   - Monitor positions and P&L

---

## 🛠️ Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework with concurrent features |
| **Vite 5** | Lightning-fast build tool and dev server |
| **TypeScript** | Type-safe development |
| **Tailwind CSS** | Utility-first styling |
| **@tailwindcss/vite** | Native Tailwind integration for Vite |

### Blockchain Integration

| Library | Purpose |
|---------|---------|
| **WalletConnect v2** | Multi-wallet connection protocol |
| **Ethers.js** | EVM blockchain interaction |
| **@stellar/stellar-sdk** | Stellar network operations |
| **@dydxprotocol/v4-client-js** | dYdX perpetual trading |

### State & Real-Time Data

| Tool | Purpose |
|------|---------|
| **Zustand** | Lightweight state management |
| **WebSocket** | Real-time market data and account updates |

### Development Tools

| Tool | Purpose |
|------|---------|
| **vite-plugin-node-polyfills** | Node.js polyfills for browser compatibility |
| **vite-plugin-remove-console** | Remove console logs in production builds |
| **ESLint** | Code linting |
| **Prettier** | Code formatting |

### Backend Services

- **Swiftex Proxy**: Authenticated proxy for RPC calls and API access
- **Stellar Horizon**: Stellar network API
- **dYdX Indexer**: Historical data and account queries
- **dYdX Chain RPC**: Transaction submission

---

## 🔐 Security

### Non-Custodial Architecture

Swiftex never has access to your private keys:

✅ **What We Do:**
- Request wallet signatures for actions
- Derive dYdX keys client-side (in-memory only)
- Relay signed transactions to blockchain networks
- Provide UI for managing your assets

❌ **What We Don't Do:**
- Store private keys or mnemonics
- Have access to your funds
- Sign transactions on your behalf
- Persist signing keys between sessions

### dYdX Signing Model

**How It Works:**
1. You sign a dYdX onboarding message with your EVM wallet
2. The signature is used to deterministically derive your dYdX Chain address and signing keys
3. These keys are held in browser memory ONLY for the active session
4. All trade messages are signed locally
5. Signed payloads are sent to dYdX for execution
6. Keys are cleared when you close the browser

**Security Best Practices:**
- Always verify transaction details before signing
- Use hardware wallets for large amounts
- Keep your wallet software updated
- Never share your seed phrase or private keys
- Close browser when done trading

**Important Note:**
- dYdX signing keys exist in browser memory only
- Keys are never stored or transmitted
- No random mnemonics are generated
- Derived deterministically from your wallet signature

---

## 💻 Development

### Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run ESLint
npm run lint

# Fix ESLint errors automatically
npm run lint:fix

# Format code with Prettier
npm run format
```

### Vite Configuration

The project uses a custom Vite setup optimized for blockchain development:

```typescript
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import removeConsole from 'vite-plugin-remove-console';

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  plugins: [
    react(),
    tailwindcss(),
    removeConsole(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
      },
      protocolImports: true,
    }),
  ],
  optimizeDeps: {
    include: ['buffer', 'process', 'vm-browserify'],
  },
});
```

**Key Features:**
- **Node.js Polyfills**: Required for blockchain libraries to work in browser
- **Console Removal**: Automatically strips console logs in production
- **Global Definitions**: Defines `global` as `globalThis` for compatibility
- **Optimized Dependencies**: Pre-bundles common blockchain utilities

### Project Structure

```
swiftex-wallet-exchange/
├── src/
│   ├── components/           # React components
│   │   ├── wallet/          # Wallet connection
│   │   ├── trading/         # Trading interface
│   │   ├── assets/          # Asset management
│   │   └── shared/          # Reusable UI components
│   ├── hooks/               # Custom React hooks
│   │   ├── useWalletConnect.ts
│   │   ├── useDydxAccount.ts
│   │   ├── useStellarBalances.ts
│   │   └── useAssetSearch.ts
│   ├── store/               # Zustand state management
│   │   ├── walletStore.ts
│   │   ├── tradingStore.ts
│   │   └── marketStore.ts
│   ├── services/            # API and blockchain services
│   │   ├── dydx/           # dYdX integration
│   │   ├── stellar/        # Stellar operations
│   │   └── evm/            # EVM operations
│   ├── utils/               # Utility functions
│   ├── config/              # Configuration files
│   ├── types/               # TypeScript type definitions
│   └── App.tsx              # Main app component
├── public/                  # Static assets
├── .env.example             # Environment variables template
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Project dependencies
```

### WalletConnect Setup

Get your Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/):

1. Create an account on WalletConnect Cloud
2. Create a new project
3. Copy your Project ID
4. Add to `.env` as `VITE_WALLETCONNECT_PROJECT_ID`

### Proxy Authentication

All API calls go through Swiftex's authenticated proxy:

- **Development**: Use `VITE_API_DEVICE_AUTH_DEV` token
- **Production**: Use `VITE_API_DEVICE_AUTH_PROD` token
- Contact the Swiftex team to get your authentication tokens

The proxy handles:
- RPC calls to EVM networks
- Stellar Horizon API calls
- dYdX indexer queries
- Rate limiting and caching

---

## 🚢 Deployment

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` folder.

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/swiftex-wallet-exchange)

**Vercel Configuration:**
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### Deploy to Netlify

**Netlify Configuration** (`netlify.toml`):
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Environment Variables in Production

Set all required environment variables in your hosting platform:

**Required Variables:**
- `VITE_WALLETCONNECT_PROJECT_ID`
- `VITE_WALLETCONNECT_RELAY_URL`
- `VITE_BASE_SERVER_URL_PROD`
- `VITE_BASE_PROXY_URL_PROD`
- `VITE_API_DEVICE_AUTH_PROD`

**Important:** Never commit `.env` file to git.

---

## 📱 Mobile App

Swiftex is also available as a mobile application for iOS and Android:

- **iOS**: [Download on App Store](#)
- **Android**: [Download on Google Play](#)

The mobile app provides the same features with native mobile optimizations.

---

## 🗺️ Roadmap

### Q1 2025
- ✅ Multi-wallet WalletConnect integration
- ✅ Stellar asset management
- ✅ dYdX v4 perpetual trading
- ✅ Real-time WebSocket data
- ✅ Isolated margin support

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

Need help? We're here for you:

- **Documentation**: [Read the docs](#)
- **Discord**: [Join our community](#)
- **Twitter**: [@SwiftexExchange](#)
- **Email**: support@swiftex.exchange
- **GitHub Repository**: [swiftexchange-web](https://github.com/karanbisht-123/swiftexchange-web)
- **GitHub Issues**: [Report a bug](https://github.com/karanbisht-123/swiftexchange-web/issues)
## 🙏 Acknowledgments

Built with amazing tools and protocols:

- [dYdX Protocol](https://dydx.exchange/) - Decentralized perpetual trading
- [Stellar Development Foundation](https://stellar.org/) - Fast, low-cost transfers
- [WalletConnect](https://walletconnect.com/) - Multi-wallet connectivity
- [Vite](https://vitejs.dev/) - Lightning-fast frontend tooling
- [React](https://react.dev/) - UI library
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

---

## ⚠️ Disclaimer

**Important: Read Before Using**

Swiftex Wallet Exchange is non-custodial software. Use at your own risk.

**Risks:**
- Trading cryptocurrencies and derivatives involves substantial risk of loss
- You are solely responsible for securing your wallet and funds
- Market conditions can be volatile and unpredictable
- You may lose all or part of your investment

**Always:**
- ✅ Do your own research (DYOR)
- ✅ Never invest more than you can afford to lose
- ✅ Keep your seed phrase secure and private
- ✅ Use hardware wallets for large amounts
- ✅ Verify all transaction details before signing

**Never:**
- ❌ Share your private keys or seed phrases
- ❌ Trust unsolicited messages
- ❌ Use public WiFi without VPN
- ❌ Click suspicious links

This software is provided "as is" without warranty of any kind.

---

<div align="center">

**Built with ❤️ by the Swiftex Team**

[Website](https://swiftexchange.io/) • [Twitter](https://x.com/SwiftExwallet) • [Discord](https://discord.com/invite/gCevdzbC) • [GitHub](#)

⭐ Star us on GitHub if you find this project useful!

</div>