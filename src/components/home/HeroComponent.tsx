import React from 'react';

const HeroComponent: React.FC = () => {
  return (
    <div className="bg-primary min-h-screen flex items-center justify-center p-6">
      <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-7xl">
        {/* Left Section - Text and Button */}
        <div className="text-center md:text-left md:w-1/2 space-y-6">
          <h1 className="heading-1">
            India's First Crypto App
            <br />
            with 2.5 Crore+ Users
          </h1>
          <p className="text-body text-secondary">Begin your crypto investment journey today</p>
          <button className="btn btn-success btn-lg">Begin Your Crypto Journey &rarr;</button>
          <div className="flex justify-center md:justify-start space-x-4 mt-4">
            <span className="text-muted">Download App Using</span>
            <button className="btn btn-ghost btn-sm">iOS</button>
            <button className="btn btn-ghost btn-sm">Android</button>
          </div>
          <div className="flex justify-center md:justify-start space-x-4 mt-2">
            <span className="badge badge-success">FIU REGISTERED</span>
            <span className="badge badge-info">ISO/IEC 27001:2022</span>
          </div>
        </div>

        {/* Right Section - Mobile Image */}
        <div className="mt-8 md:mt-0 md:w-1/2 flex justify-center">
          <img
            src="https://coinswitch.co/_next/static/media/phone-app.29210987.webp" // Replace with your image path
            alt="Mobile App"
            className="w-full max-w-xs md:max-w-sm animate-slide-up"
          />
        </div>
      </div>
    </div>
  );
};

export default HeroComponent;
