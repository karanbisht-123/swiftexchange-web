import React from 'react';

const SecurityFeatures: React.FC = () => {
    const features = [
        {
            title: "FIU Registered",
            description: "Swiftex is a fully compliant exchange registered with the Financial Intelligence Unit (FIU).",
            icon: (
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                </div>
            )
        },
        {
            title: "ISO/IEC 27001:2022 Certified",
            description: "We adhere to the highest international standards for information security management.",
            icon: (
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.2-2.848.578-4.155C8.522 2.949 15.685 5.253 19.332 10.019" />
                    </svg>
                </div>
            )
        },
        {
            title: "Bank-Grade Security",
            description: "Your funds are protected with multi-layered security protocols and cold storage wallets.",
            icon: (
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>
            )
        }
    ];

    return (
        <section className="py-20 bg-white">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="heading-2 mb-4">Uncompromised Security</h2>
                    <p className="text-body text-secondary">
                        We prioritize the safety of your funds and data above everything else.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <div key={index} className="flex flex-col items-center text-center p-8 rounded-2xl bg-bg-primary border border-border hover:shadow-lg transition-shadow">
                            <div className="mb-6">
                                {feature.icon}
                            </div>
                            <h3 className="heading-4 mb-3">{feature.title}</h3>
                            <p className="text-secondary text-sm leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="mt-16 flex justify-center">
                    <div className="bg-bg-tertiary px-8 py-6 rounded-xl flex flex-col md:flex-row items-center gap-8 border border-border">
                        <div className="text-center md:text-left">
                            <p className="text-sm uppercase tracking-wide text-muted font-semibold mb-1">Total Assets Secured</p>
                            <p className="text-3xl font-bold text-brand-primary">$500M+</p>
                        </div>
                        <div className="w-px h-12 bg-border hidden md:block"></div>
                        <div className="divider md:hidden w-full"></div>
                        <div className="text-center md:text-left">
                            <p className="text-sm uppercase tracking-wide text-muted font-semibold mb-1">Quarterly Audits</p>
                            <p className="text-3xl font-bold text-success">100% Pass</p>
                        </div>
                        <div className="w-px h-12 bg-border hidden md:block"></div>
                        <div className="divider md:hidden w-full"></div>
                        <div className="text-center md:text-left">
                            <p className="text-sm uppercase tracking-wide text-muted font-semibold mb-1">Uptime</p>
                            <p className="text-3xl font-bold text-brand-primary">99.99%</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default SecurityFeatures;
