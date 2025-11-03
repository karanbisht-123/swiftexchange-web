import HeroComponent from '../components/home/HeroComponent';
import Topbar from '../components/layout/Topbar';

// import NetworkSwitch from '../modules/walletconnect/components/NetworkSwitch';
// import { useWalletConnect } from '../modules/walletconnect/hooks/useWalletConnect';

const Home = () => {
  // const { connectedWallets, getNetwork } = useWalletConnect();
  return (
    <div className="flex flex-col min-h-screen bg-primary">
      <div>
        {/* <div>Current Network: {getNetwork()}</div>
        <div>
          Connected Wallets:
          {Object.entries(connectedWallets).map(([type, wallet]) => (
            <div key={type}>
              {type}: {wallet.address} (Chain ID: {wallet.chainId})
            </div>
          ))}
        </div> */}
      </div>
      <Topbar />
      <HeroComponent />
    </div>
  );
};

export default Home;
