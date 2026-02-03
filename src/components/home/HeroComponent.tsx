import React from 'react';

const HeroComponent: React.FC = () => {
  return (
    <div className="bg-primary min-h-[90vh] flex items-center justify-center p-6 relative overflow-hidden">


      <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-7xl z-10">
        {/* Left Section - Text and Button */}
        <div className="text-center md:text-left md:w-1/2 space-y-8 animate-slide-up">
          <div className="space-y-4">
            <span className="badge badge-primary bg-brand-primary/10 text-brand-primary border-brand-primary/20 px-4 py-1.5 rounded-full text-sm font-medium inline-block mb-2">
              #1 Most Trusted Exchange
            </span>
            <h1 className="heading-1 leading-tight">
              <span className="text-brand-primary block">Swiftex Exchange</span>
              <span className="text-3xl md:text-5xl font-medium text-secondary block mt-2">
                The Future of <br className="hidden md:block" /> Crypto Trading
              </span>
            </h1>
            <p className="text-body text-secondary max-w-lg mx-auto md:mx-0">
              Buy, sell, and trade over 200+ cryptocurrencies with the lowest fees and highest security standards. Join 2.5 Crore+ users today.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4">
            <button className="btn btn-primary btn-lg w-full sm:w-auto shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/30 transition-all">
              Start Trading Now &rarr;
            </button>
            <button className="btn btn-secondary btn-lg w-full sm:w-auto">
              View Markets
            </button>
          </div>

          {/* <div className="pt-8 border-t border-border/50">
            <p className="text-sm font-semibold text-muted mb-4 uppercase tracking-wider">Trusted by Industry Leaders</p>
            <div className="flex justify-center md:justify-start space-x-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-white/50 rounded-lg border border-border/50">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-xs font-semibold text-primary">FIU REGISTERED</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-white/50 rounded-lg border border-border/50">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-xs font-semibold text-primary">ISO/IEC 27001:2022</span>
              </div>
            </div>
          </div> */}
        </div>

        {/* Right Section - Image */}
        <div className="mt-12 md:mt-0 md:w-1/2 flex justify-center md:justify-end relative">
          <div className="relative w-full max-w-md animate-bounce-in">


            <img
              src="/mobile.png"
              alt="Swiftex Mobile App"
              className="w-full h-auto drop-shadow-2xl relative z-20 hover:scale-105 transition-transform duration-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroComponent;
