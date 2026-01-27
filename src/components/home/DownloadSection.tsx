import React from 'react';

const DownloadSection: React.FC = () => {
    return (
        <section className="py-20 bg-brand-primary text-white relative overflow-hidden">
            {/* Background patterns */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-accent/20 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/2"></div>

            <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className="flex flex-col md:flex-row items-center justify-between">
                    <div className="md:w-1/2 space-y-8 text-center md:text-left">
                        <h2 className="text-4xl text-primary  md:text-5xl font-bold font-heading leading-tight">
                            Trade Anywhere, <br /> Anytime.
                        </h2>
                        <p className="text-lg text-secondary  max-w-md mx-auto md:mx-0">
                            Stay connected to the market with our powerful mobile app. Manage your portfolio, execute trades, and get price alerts on the go.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 pt-4">
                            <button className="btn bg-secondary text-brand-primary hover:bg-primary flex items-center gap-3 px-6 py-3 min-w-[180px]">
                                <svg viewBox="0 0 384 512" fill="currentColor" className="w-6 h-6">
                                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 46.9 126.7 98.9 126.7 25.8 0 49.7-20 74.8-20 24.3 0 46.5 20.8 76.5 20.8 48 0 81.1-126.7 81.1-126.7-3.7-1.8-82.9-39.7-80.9-106.8zM260.3 50c18.5-20.4 43.4-32.8 75.1-28 2.7 28.4-9.8 82-46.6 82-19.1 0-39.4-14.5-51.2-30.2-11.7-16.6-13.4-43.4-13.7-46.1 1.6-2.5 17.5-3.3 36.4 22.3z" />
                                </svg>
                                <div className="text-left">
                                    <div className="text-xs text-primary">Download on the</div>
                                    <div className="text-sm font-bold leading-none text-secondary">App Store</div>
                                </div>
                            </button>
                            <button className="btn bg-transparent border border-primary text-white hover:bg-white/10 flex items-center gap-3 px-6 py-3 min-w-[180px]">
                                <svg viewBox="0 0 512 512" fill="currentColor" className="w-6 h-6">
                                    <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
                                </svg>
                                <div className="text-left">
                                    <div className="text-xs text-primary">Get it on</div>
                                    <div className="text-sm font-bold leading-none text-secondary">Google Play</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="md:w-1/2 flex justify-center mt-12 md:mt-0 relative">


                        <img
                            src="/mobilefuturedash.png"
                            alt="Swiftex App"
                            className="w-full max-w-sm rounded-2xl hover:rotate-0 transition-transform duration-500"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
};

export default DownloadSection;
