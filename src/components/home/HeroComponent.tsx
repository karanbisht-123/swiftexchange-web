import React, { useState, useEffect } from 'react';
import { ArrowRight, Send, Repeat, CreditCard, ArrowLeftRight, TrendingUp } from 'lucide-react';

const HeroComponent: React.FC = () => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const images = [
    '/home2.png',
    '/briage.png',
    '/steller.png',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, 1000);

    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <div className="bg-primary min-h-[90vh] flex items-center justify-center p-6 relative overflow-hidden">

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none z-0">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-brand-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[100px]" />
      </div>

      <div className="flex flex-col lg:flex-row items-center justify-between w-full max-w-7xl z-10 gap-1 lg:gap-8">

        <div className="flex flex-col items-center lg:items-start text-center lg:text-left w-full lg:w-1/2 space-y-8 animate-fade-in-up">

          {/* <span className="flex items-center gap-2 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-4 py-1.5 rounded-full text-sm font-medium backdrop-blur-sm w-fit">
            <Zap className="w-4 h-4 fill-current" />
            <span>5-in-1 Crypto Platform</span>
          </span> */}

          <h1 className="heading-1 leading-tight">
            <span className="text-secondary block text-4xl md:text-6xl font-bold tracking-tight">
              Trade, Swap, Buy <br />
              <span className="text-brand-primary">Send & Receive</span>
            </span>
            <span className="text-2xl md:text-3xl font-medium text-muted block mt-4">
              Everything Crypto, One Platform
            </span>
          </h1>

          <p className="text-body text-secondary/80 max-w-lg text-lg">
            The only platform you need. <strong>Trade futures</strong>, <strong>swap</strong> cross-chain,
            <strong> buy/sell</strong> with fiat, <strong>send</strong> instantly, and <strong>receive</strong> from any chain.
            Powered by <strong>Stellar</strong> and <strong>dYdX</strong>.
          </p>

          <div className="flex flex-row items-center gap-4 w-full sm:w-auto">
            <button className="btn btn-primary btn-lg w-full sm:w-auto shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/30 transition-all flex items-center justify-center gap-2 group">
              Start Trading
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="btn btn-secondary btn-lg w-full sm:w-auto flex items-center justify-center gap-2 bg-secondary/10 border-transparent hover:bg-secondary/20">
              Explore Markets
            </button>
          </div>

          <div className="w-full hidden lg:block pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="flex flex-col items-center gap-2 px-3 py-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-brand-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-5 h-5 text-brand-primary" />
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-secondary">Trade</div>
                  <div className="text-[10px] text-secondary/60">Futures</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 px-3 py-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Repeat className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-secondary">Swap</div>
                  <div className="text-[10px] text-secondary/60">Cross-Chain</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 px-3 py-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <CreditCard className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-secondary">Buy/Sell</div>
                  <div className="text-[10px] text-secondary/60">Fiat Ramps</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 px-3 py-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Send className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-secondary">Send</div>
                  <div className="text-[10px] text-secondary/60">Instant</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 px-3 py-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ArrowLeftRight className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-secondary">Receive</div>
                  <div className="text-[10px] text-secondary/60">Multi-Chain</div>
                </div>
              </div>
            </div>

            <div className="mt-6 px-6 py-4 bg-gradient-to-r from-brand-primary/10 to-indigo-500/10 rounded-xl border border-brand-primary/20 backdrop-blur-md">
              <p className="text-sm text-secondary/90 text-center">
                <span className="font-bold text-brand-primary">5 powerful features</span> in one unified platform.
                No need to switch between apps. Trade, transact, and manage everything seamlessly.
              </p>
              <div className="flex flex-wrap justify-center  gap-4 opacity-80 pt-2">
                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 backdrop-blur-md">
                  <div className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_10px_rgba(var(--brand-primary),0.5)]"></div>
                  <span className="text-xs font-bold text-secondary tracking-widest uppercase">Powered by Stellar</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 backdrop-blur-md">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                  <span className="text-xs font-bold text-secondary tracking-widest uppercase">dYdX Protocol</span>
                </div>
              </div>
            </div>
          </div>



        </div>

        <div className="w-full lg:w-1/2 relative flex justify-center items-center perspective-[1000px] h-[500px] lg:h-[600px]">

          <div className="relative z-20 w-[300px] md:w-[500px] flex justify-center items-center">

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[280px] h-[280px] md:w-[400px] md:h-[400px] bg-gradient-to-r from-brand-primary/15 via-indigo-500/15 to-brand-primary/15 rounded-full blur-[80px] animate-pulse-slow"></div>
              <div className="absolute w-[200px] h-[200px] md:w-[300px] md:h-[300px] bg-brand-primary/20 rounded-full blur-[60px] animate-float-delayed"></div>
            </div>

            <div className="relative z-20 h-[400px] lg:h-[660px] w-full animate-float hover:scale-105 transition-transform duration-500">
              {images.map((img, index) => (
                <img
                  key={index}
                  src={img}
                  alt={`Swiftex App Screen ${index + 1}`}
                  className={`w-full h-auto drop-shadow-2xl absolute inset-0 object-contain transition-opacity duration-500 ${index === currentImageIndex ? 'opacity-100' : 'opacity-0'
                    }`}
                />
              ))}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float 7s ease-in-out infinite 1s;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
          opacity: 0;
          transform: translateY(20px);
        }
        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(0.95); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
};

export default HeroComponent;