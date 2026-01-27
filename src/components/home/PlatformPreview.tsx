import React, { useState } from 'react';

const PlatformPreview: React.FC = () => {
    const [activeIndex, setActiveIndex] = useState(1);

    const screens = [
        { id: 0, img: '/dash.png', title: 'Analytics', position: 'left' },
        { id: 1, img: '/future.png', title: 'Trading', position: 'center' },
        { id: 2, img: '/ordebookswap.png', title: 'Orders', position: 'right' },
    ];

    const getPosition = (index: number) => {
        if (index === activeIndex) return 'center';
        if (index === (activeIndex - 1 + 3) % 3) return 'left';
        if (index === (activeIndex + 1) % 3) return 'right';
        return 'hidden';
    };

    return (
        <section className="py-24 bg-gradient-to-b from-primary to-bg-tertiary overflow-hidden">
            <div className="max-w-[1400px] mx-auto px-6 text-center">
                <div className="max-w-3xl mx-auto mb-20 space-y-4">
                    <h2 className="heading-2">
                        Powerful Trading Platform <br />
                        <span className="text-brand-primary">Built for Everyone</span>
                    </h2>
                    <p className="text-body text-secondary">
                        Whether you're a beginner or a pro, our platform offers the tools you need to succeed.
                        Real-time charts, advanced order types, and seamless execution.
                    </p>
                </div>

                {/* Carousel Container */}
                <div className="relative h-[400px] md:h-[600px] flex items-center justify-center perspective-[2000px]">
                    {/* Glow Effect */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-brand-primary/20 blur-[120px] -z-10 rounded-full"></div>

                    {screens.map((screen, index) => {
                        const position = getPosition(index);

                        let transformClass = '';
                        let zIndexClass = '';
                        let opacityClass = '';
                        let pointerEvents = 'cursor-pointer';

                        if (position === 'center') {
                            transformClass = 'translate-x-0 scale-[1.15] md:scale-[1.25] rotate-y-0';
                            zIndexClass = 'z-30';
                            opacityClass = 'opacity-100';
                            pointerEvents = 'cursor-default';
                        } else if (position === 'left') {
                            transformClass = '-translate-x-[15%] md:-translate-x-[45%] scale-[0.8] md:scale-[0.85] -rotate-y-12';
                            zIndexClass = 'z-10';
                            opacityClass = 'opacity-40 hover:opacity-100 blur-[1px] hover:blur-0';
                        } else if (position === 'right') {
                            transformClass = 'translate-x-[15%] md:translate-x-[45%] scale-[0.8] md:scale-[0.85] rotate-y-12';
                            zIndexClass = 'z-10';
                            opacityClass = 'opacity-40 hover:opacity-100 blur-[1px] hover:blur-0';
                        }

                        return (
                            <div
                                key={screen.id}
                                className={`absolute w-[80%] md:w-[65%] max-w-5xl transition-all duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] will-change-transform ${transformClass} ${zIndexClass} ${opacityClass} ${pointerEvents}`}
                                onMouseEnter={() => setActiveIndex(index)}
                            >
                                <div className={`relative rounded-xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden ${position === 'center' ? 'ring-1 ring-white/10' : ''}`}>
                                    {/* Only show header for center card to reduce noise, or show for all if preferred. keeping simple for back cards */}
                                    {position === 'center' && (
                                        <div className="h-10 bg-gray-900/95 backdrop-blur flex items-center px-4 space-x-2 border-b border-gray-800">
                                            <div className="flex space-x-1.5">
                                                <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
                                                <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                                                <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
                                            </div>
                                            <div className="flex-1 text-center">
                                                <span className="text-xs text-gray-500 font-medium bg-gray-800 px-3 py-1 rounded-md">swiftex.exchange/trade</span>
                                            </div>
                                        </div>
                                    )}

                                    <img
                                        src={screen.img}
                                        alt={screen.title}
                                        className="w-full h-auto object-cover bg-gray-900 min-h-[300px] md:min-h-[400px]"
                                    />
                                    {/* Overlay for depth on side cards */}
                                    {position !== 'center' && <div className="absolute inset-0 bg-gray-900/40 transition-colors"></div>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 text-left max-w-7xl mx-auto">
                    <div className="p-6 bg-bg-secondary rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow group">
                        <div className="w-12 h-12 bg-brand-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-brand-primary/20 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                        <h3 className="heading-4 mb-2">Advanced Charting</h3>
                        <p className="text-secondary text-sm">Analyze markets with TradingView charts, indicators, and drawing tools.</p>
                    </div>
                    <div className="p-6 bg-bg-secondary rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow group">
                        <div className="w-12 h-12 bg-brand-accent/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-brand-accent/20 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-brand-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="heading-4 mb-2">Low Fees</h3>
                        <p className="text-secondary text-sm">Trade with competitive fees and maximize your profits. No hidden charges.</p>
                    </div>
                    <div className="p-6 bg-bg-secondary rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow group">
                        <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-success/20 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="heading-4 mb-2">Instant Execution</h3>
                        <p className="text-secondary text-sm">Experience lightning-fast order matching engine capable of millions of transactions.</p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default PlatformPreview;
