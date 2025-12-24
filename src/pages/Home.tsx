import HeroComponent from '../components/home/HeroComponent';
import Topbar from '../components/layout/Topbar';

const Home = () => {
  return (
    <div className="flex flex-col min-h-screen bg-primary">
      <Topbar />
      <HeroComponent />
    </div>
  );
};

export default Home;
