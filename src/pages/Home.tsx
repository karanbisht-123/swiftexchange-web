import HeroComponent from '../components/home/HeroComponent';
import PlatformPreview from '../components/home/PlatformPreview';
import DownloadSection from '../components/home/DownloadSection';
import Topbar from '../components/layout/Topbar';

const Home = () => {
  return (
    <div className="flex flex-col min-h-screen bg-primary">
      <Topbar />
      <HeroComponent />
      <PlatformPreview />
      <DownloadSection />
    </div>
  );
};

export default Home;
