import React, { useState, useEffect } from 'react';
import { XMarkIcon, SparklesIcon, GiftIcon } from '@heroicons/react/20/solid';
import AirdropModal from '@/components/common/AirdropModal';

function DevnetBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const [showAirdropModal, setShowAirdropModal] = useState(false);

  useEffect(() => {
    // Check localStorage for dismissed state
    try {
      const dismissed = localStorage.getItem('devnet-banner-dismissed');
      if (dismissed === 'true') {
        setIsVisible(false);
      }
    } catch (error) {
      // localStorage might not be available, keep banner visible
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      localStorage.setItem('devnet-banner-dismissed', 'true');
    } catch (error) {
      // localStorage might not be available
    }
  };

  if (!isVisible) return null;

  return (
    <div className="relative isolate z-20 flex items-center gap-x-6 overflow-hidden bg-gradient-to-r from-darkLuxuryPurple via-purple-900 to-darkLuxuryPurple px-4 py-3 sm:px-6 border-b border-richGold/20">
      {/* Animated background effects */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-[max(-7rem,calc(50%-52rem))] -z-10 -translate-y-1/2 transform-gpu blur-2xl animate-pulse"
      >
        <div
          style={{
            clipPath:
              'polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)',
          }}
          className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-richGold/60 to-purple-400/40 opacity-50"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-[max(45rem,calc(50%+8rem))] -z-10 -translate-y-1/2 transform-gpu blur-2xl animate-pulse"
        style={{ animationDelay: '1s' }}
      >
        <div
          style={{
            clipPath:
              'polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)',
          }}
          className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-purple-400/40 to-richGold/60 opacity-50"
        />
      </div>
      
      {/* Main content */}
      <div className="flex flex-1 items-center justify-center">
        {/* Desktop Layout */}
        <div className="hidden sm:flex items-center gap-x-6 flex-1 justify-center">
          {/* Animated icon */}
          <div className="flex-shrink-0">
            <div className="relative">
              <GiftIcon className="h-6 w-6 text-richGold animate-bounce" />
              <SparklesIcon className="absolute -top-1 -right-1 h-3 w-3 text-yellow-300 animate-pulse" />
            </div>
          </div>
          
          {/* Text content */}
          <div className="flex items-center gap-x-2">
            <span className="inline-flex items-center rounded-md bg-richGold/20 px-2 py-1 text-xs font-bold text-richGold ring-1 ring-inset ring-richGold/30">
              DEVNET ONLY
            </span>
            <span className="text-gray-300">•</span>
            <p className="text-sm text-white font-medium">
              <span className="text-richGold font-semibold">Airdrop is LIVE!</span> Play with devnet SOL to earn gems 💎
            </p>
          </div>
          
          {/* Action button */}
          <button
            onClick={() => setShowAirdropModal(true)}
            className="group inline-flex items-center gap-x-1.5 rounded-full bg-gradient-to-r from-richGold to-yellow-500 px-4 py-2 text-sm font-semibold text-black shadow-lg hover:shadow-richGold/25 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-richGold transition-all duration-200"
          >
            <GiftIcon className="h-4 w-4 group-hover:animate-pulse" />
            Learn More
            <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">&rarr;</span>
          </button>
        </div>

        {/* Mobile Layout */}
        <div className="sm:hidden flex flex-col items-center gap-y-3 text-center flex-1">
          {/* Top row: Icon + Badge */}
          <div className="flex items-center gap-x-2">
            <div className="relative">
              <GiftIcon className="h-5 w-5 text-richGold animate-bounce" />
              <SparklesIcon className="absolute -top-0.5 -right-0.5 h-2 w-2 text-yellow-300 animate-pulse" />
            </div>
            <span className="inline-flex items-center rounded-md bg-richGold/20 px-2 py-0.5 text-xs font-bold text-richGold ring-1 ring-inset ring-richGold/30">
              DEVNET ONLY
            </span>
          </div>
          
          {/* Middle row: Text */}
          <p className="text-sm text-white font-medium">
            <span className="text-richGold font-semibold">Airdrop is LIVE!</span><br />
            Play with devnet SOL to earn gems 💎
          </p>
          
          {/* Bottom row: Button */}
          <button
            onClick={() => setShowAirdropModal(true)}
            className="group inline-flex items-center gap-x-1.5 rounded-full bg-gradient-to-r from-richGold to-yellow-500 px-3 py-1.5 text-sm font-semibold text-black shadow-lg hover:shadow-richGold/25 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-richGold transition-all duration-200"
          >
            <GiftIcon className="h-3 w-3 group-hover:animate-pulse" />
            Info
            <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">&rarr;</span>
          </button>
        </div>
        
        {/* Dismiss button - always positioned on the right */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <button 
            type="button" 
            className="group -m-2 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
            onClick={handleDismiss}
            title="Dismiss banner"
          >
            <span className="sr-only">Dismiss</span>
            <XMarkIcon aria-hidden="true" className="h-5 w-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>
      
      {/* Airdrop Info Modal */}
      <AirdropModal 
        open={showAirdropModal} 
        onOpenChange={setShowAirdropModal} 
      />
    </div>
  );
}

export default React.memo(DevnetBanner); 