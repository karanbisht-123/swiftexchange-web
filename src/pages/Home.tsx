// import CryptoHero from '../components/home/CryptoHero';
import HeroComponent from '../components/home/HeroComponent';
import { ConnectWalletButton } from '../modules/walletconnect/components/ConnectWalletButton';
// import Topbar from '../components/layout/Topbar';
// import MultiWalletConnector from '../modules/walletconnect/components/MultiWalletConnector';
import { WalletListModal } from '../modules/walletconnect/components/WalletListModal';

const Home = () => {
  return (
    <div className="flex flex-col min-h-screen bg-primary">
      <header className="py-6 px-8 flex justify-between items-center">
        <ConnectWalletButton />
      </header>

      <WalletListModal />

      {/* <WalletConTopbar /> */}
      {/* <Topbar /> */}
      {/* <MultiWalletConnector /> */}
      <HeroComponent />
      {/* <CryptoHero /> */}
    </div>
  );
};

export default Home;
