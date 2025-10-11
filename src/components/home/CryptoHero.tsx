import { Apple, ArrowRight, Building2, Shield, Smartphone } from 'lucide-react';

export default function CryptoHero() {
  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #020e46 0%, #0d1a6e 50%, #3b4fd9 100%)',
      }}
    >
      {/* Gradient Orbs */}
      <div
        className="absolute top-20 left-20 w-96 h-96 rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(59, 79, 217, 0.3) 0%, transparent 70%)',
        }}
      ></div>
      <div
        className="absolute bottom-20 right-20 w-96 h-96 rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(13, 26, 110, 0.4) 0%, transparent 70%)',
        }}
      ></div>
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(77, 92, 219, 0.15) 0%, transparent 70%)',
        }}
      ></div>

      <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <h1 className="heading-1 text-white leading-tight">
              India's First Crypto App
              <br />
              <span
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                with 2.5 Crore+ Users
              </span>
            </h1>

            <p className="text-xl text-white/80 font-medium">
              Begin your crypto investment journey today
            </p>

            <button
              className="btn btn-lg group text-white font-semibold flex items-center gap-3 transition-all transform hover:scale-105 shadow-xl"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                padding: '1rem 2rem',
                fontSize: '1.125rem',
              }}
            >
              Begin Your Crypto Journey
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Download Section */}
            <div className="pt-6">
              <p className="text-white/60 mb-4 text-sm font-medium">Download App Using</p>
              <div className="flex gap-4">
                <button
                  className="px-8 py-4 rounded-xl flex items-center gap-3 transition-all transform hover:scale-105 backdrop-blur-md border border-white/20"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Apple className="w-7 h-7 text-white" />
                  <div className="text-left">
                    <p className="text-white/60 text-xs">Download on the</p>
                    <p className="text-white font-semibold">App Store</p>
                  </div>
                </button>
                <button
                  className="px-8 py-4 rounded-xl flex items-center gap-3 transition-all transform hover:scale-105 backdrop-blur-md border border-white/20"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Smartphone className="w-7 h-7 text-white" />
                  <div className="text-left">
                    <p className="text-white/60 text-xs">Get it on</p>
                    <p className="text-white font-semibold">Google Play</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-4 pt-6">
              <div
                className="px-6 py-4 rounded-xl backdrop-blur-md border border-white/20"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">FIU</p>
                    <p className="text-white/70 text-xs">REGISTERED</p>
                  </div>
                </div>
              </div>

              <div
                className="px-6 py-4 rounded-xl backdrop-blur-md border border-white/20"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">ISO/IEC</p>
                    <p className="text-white/70 text-xs">27001 : 2022</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Content - Phone Mockup Image */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md">
              {/* Glow Effect Behind Phone */}
              <div
                className="absolute inset-0 blur-3xl opacity-60"
                style={{
                  background:
                    'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(59, 130, 246, 0.3) 50%, transparent 70%)',
                  transform: 'scale(1.1)',
                }}
              ></div>

              {/* Phone Mockup Container */}
              <div
                className="relative rounded-[3rem] p-2 shadow-2xl backdrop-blur-sm border-2 border-white/10"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                  aspectRatio: '9/19',
                }}
              >
                {/* Placeholder for Phone Image */}
                <div
                  className="w-full h-full rounded-[2.5rem] overflow-hidden relative"
                  style={{
                    background: 'linear-gradient(135deg, #0a1854 0%, #020e46 100%)',
                  }}
                >
                  {/* Image placeholder with border */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center p-8">
                      <div
                        className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
                        }}
                      >
                        <svg
                          className="w-10 h-10 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <p className="text-white/60 text-sm font-medium">Add your phone mockup</p>
                      <p className="text-white/40 text-xs mt-2">
                        Replace this section with
                        <br />
                        your app screenshot
                      </p>
                    </div>
                  </div>

                  {/* Optional: Status bar decoration */}
                  <div
                    className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-7 rounded-b-3xl"
                    style={{
                      background: '#000',
                    }}
                  ></div>
                </div>
              </div>

              {/* Floating Elements */}
              <div
                className="absolute -top-6 -right-6 w-24 h-24 rounded-2xl backdrop-blur-md border border-white/20 flex flex-col items-center justify-center shadow-xl animate-pulse-once"
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                }}
              >
                <p className="text-white text-2xl font-bold">₹45K</p>
                <p className="text-green-400 text-xs font-semibold">+12.5%</p>
              </div>

              <div
                className="absolute -bottom-4 -left-6 w-20 h-20 rounded-xl backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl"
                style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                }}
              >
                <div className="text-center">
                  <p className="text-white text-xs font-semibold">2.5Cr+</p>
                  <p className="text-white/70 text-[10px]">Users</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
