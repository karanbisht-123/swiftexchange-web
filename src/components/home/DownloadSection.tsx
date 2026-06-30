import React from 'react';

const DownloadSection: React.FC = () => {

  return (
    <section className="py-20 bg-brand-primary  relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-accent/20 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="md:w-1/2 space-y-8 text-center md:text-left">
            <h2 className="text-4xl  md:text-5xl font-bold font-heading leading-tight">
              Trade Anywhere, <br /> Anytime.
            </h2>
            <p className="text-lg  max-w-md mx-auto md:mx-0">
              Stay connected to the market with our powerful mobile app. Manage your portfolio,
              execute trades, and get price alerts on the go.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 pt-4">
              <a
                href="https://apps.apple.com/us/app/swiftex-wallet/id6759080930"
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:scale-105 transition-transform duration-300"
                aria-label="Download on App Store"
              >
                <img
                  src="/app-store-download.fb5659b5.png"
                  alt="Download on App Store"
                  className="h-14 w-auto"
                />
              </a>

              {/* Google Play — Live */}
              <a
                href="https://play.google.com/store/apps/details?id=org.app.swiftEx.wallet&pcampaignid=web_share"
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:scale-105 transition-transform duration-300"
                aria-label="Get it on Google Play"
              >
                <img
                  src="/google-play-download.1c0e3a31.png"
                  alt="Get it on Google Play"
                  className="h-14 w-auto"
                />
              </a>

            </div>
            <p className="text-xs text-slate-400 text-center md:text-left">
              Available now on Android & iOS
            </p>
          </div>
          <div className="md:w-1/2 flex justify-center mt-12 md:mt-0 relative">
            <a
              href="https://play.google.com/store/apps/details?id=org.app.swiftEx.wallet&pcampaignid=web_share"
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:scale-105 transition-transform duration-500"
              aria-label="View Swiftex App on Google Play"
            >
              <img
                src="/briage.png"
                alt="Swiftex App"
                className="w-full max-w-md rounded-2xl"
              />
            </a>
          </div>

        </div>
      </div>
    </section>
  );
};

export default DownloadSection;