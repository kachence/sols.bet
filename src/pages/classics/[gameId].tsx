import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NextSeo } from 'next-seo';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/common';
import RecentPlays from '@/components/game/RecentPlays/RecentPlays';
import { BASE_SEO_CONFIG, GEM_CONFIG, GemType } from '@/constants';
import { getGameName, NUMERIC_TO_SLUG } from '@/lib/gameMappings';
import Image from "next/image";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGem, faPiggyBank, faBuildingColumns } from '@fortawesome/free-solid-svg-icons';
import { useBankrollValue } from "@/hooks/useBankrollValue";
import { GemCollection } from "@/components/common/GemCollection";

// Helper function to get game ID from slug using centralized mappings
const getGameIdFromSlug = (slug: string): number | null => {
  // Reverse lookup in NUMERIC_TO_SLUG mapping
  for (const [numericId, gameSlug] of Object.entries(NUMERIC_TO_SLUG)) {
    if (gameSlug === slug) {
      return parseInt(numericId);
    }
  }
  return null;
};

// Get game configuration based on slug
const getGameConfig = (gameSlug: string) => {
  const gameId = getGameIdFromSlug(gameSlug);
  const gameName = getGameName(gameId?.toString() || gameSlug);
  
  // Game descriptions
  const descriptions: Record<string, string> = {
    'blackjack-ultimate': 'Experience the ultimate blackjack game with stunning 3D graphics and professional dealer action.',
    'crown-and-anchor': 'Roll the dice in this classic pub game where you bet on symbols and hope for matching results.',
    'european-roulette': 'Spin the wheel in this classic European roulette with advanced 3D graphics and smooth gameplay.',
    'video-poker': 'Join the royal flush party in this exciting video poker game with premium graphics and smooth gameplay.',
    'roulette-no-zero': 'Play roulette with no zero for better odds in this advanced 3D version of the classic casino game.',
    'keno-classic': 'Try your luck with this exciting keno game featuring the golden egg farm theme.',
    'mines-adventure': 'Navigate the dangerous mines in this thrilling adventure game set in a cyber world.',
    'plinko-drop': 'Drop the ball and watch it bounce through the pegs in this classic Plinko game.',
    'coin-flip': 'Call heads or tails in this simple but exciting coin flip game.'
  };
  
  return {
    id: gameId,
    name: gameName,
    description: descriptions[gameSlug] || 'Enjoy this exciting casino game.'
  };
};

// Debug mode to help with development   
const DEBUG_MODE = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');

export default function DynamicClassicGame() {
  const router = useRouter();
  const { gameId } = router.query;
  const { publicKey, connected } = useWallet();
  const walletModal = useWalletModal();
  const [isLoading, setIsLoading] = useState(false);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sidebar hooks
  const { bankrollUsd, loading: bankrollLoading, error: bankrollError } = useBankrollValue();

  // Get game configuration using centralized mappings
  const gameConfig = gameId && typeof gameId === 'string' ? getGameConfig(gameId) : null;

  // Redirect to 404 if game not found
  useEffect(() => {
    if (gameId && !gameConfig) {
      router.push('/404');
    }
  }, [gameId, gameConfig, router]);

  const createGameTicket = useCallback(async () => {
    if (!gameConfig) return;
    
    // Handle custom games without numeric CWS IDs
    if (gameConfig.id === null) {
      console.log(`[FRONTEND] ⚠️ Custom game "${gameId}" has no CWS ID - redirecting to home`);
      setError("This game is not available yet. Please try other games.");
      return;
    }
    
    const debugId = Math.random().toString(36).substr(2, 9);
    console.log(`[FRONTEND-${debugId}] ======= createGameTicket START =======`);
    
    if (!connected || !publicKey) {
      console.log(`[FRONTEND-${debugId}] ❌ Wallet not connected:`, { connected, publicKey: !!publicKey });
      setError("Please connect your wallet first");
      return;
    }
    
    console.log(`[FRONTEND-${debugId}] ✅ Wallet connected:`, {
      publicKey: publicKey.toString(),
      connected
    });
    
    setIsLoading(true);
    setError(null);

    // Start audio context asynchronously (completely non-blocking)
    console.log(`[FRONTEND-${debugId}] 🔊 Setting up audio context...`);

    try {
      const requestData = {
        gameId: gameConfig.id,
        wallet: publicKey.toString(),
        mode: "real" // Always use real mode
      };

      console.log(`[FRONTEND-${debugId}] 📞 Making API request to ticket endpoint...`);
      console.log(`[FRONTEND-${debugId}] Request data:`, requestData);

      const apiUrl = 'https://casino-worker-v2.fly.dev/games/ticket';
      console.log(`[FRONTEND-${debugId}] 🎯 Calling API:`, apiUrl);

      const startTime = Date.now();
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      const endTime = Date.now();

      // Use defensive parsing instead of assuming JSON
      const text = await response.text();
      
      let data: any;
      try { 
        data = JSON.parse(text);
        console.log(`[FRONTEND-${debugId}] ✅ Parsed JSON successfully:`, data);
      } catch (parseError) { 
        console.error(`[FRONTEND-${debugId}] ❌ JSON Parse Error:`, parseError);
        console.error(`[FRONTEND-${debugId}] Raw response text:`, text);
        data = { 
          success: false, 
          error: `JSON Parse Error: ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}` 
        };
      }

      // Store debug info for display
      setDebugInfo({
        requestId: debugId,
        request: requestData,
        response: data,
        apiResponseTime: `${endTime - startTime}ms`,
        timestamp: new Date().toISOString()
      });

      if (!data.success) {
        console.error(`[FRONTEND-${debugId}] ❌ API returned success=false:`, data);
        throw new Error(data.error || 'Failed to create game ticket');
      }

      if (!data.launch) {
        console.error(`[FRONTEND-${debugId}] ❌ No launch URL in response:`, data);
        throw new Error('No game launch URL received');
      }

      console.log(`[FRONTEND-${debugId}] 🎮 Received game launch URL:`, {
        originalUrl: data.launch,
        urlLength: data.launch.length,
        domain: new URL(data.launch).hostname
      });

      // Final game URL
      let gameUrl = data.launch;
      console.log(`[FRONTEND-${debugId}] 🔗 Using game URL for iframe:`, {
        originalUrl: data.launch,
        finalUrl: gameUrl
      });
      
      console.log(`[FRONTEND-${debugId}] ✅ Setting game URL for iframe loading...`);
      setGameUrl(gameUrl);
      
    } catch (err) {
      console.error(`[FRONTEND-${debugId}] ❌ FATAL ERROR:`, err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      console.log(`[FRONTEND-${debugId}] 🏁 Finishing createGameTicket...`);
      setIsLoading(false);
      console.log(`[FRONTEND-${debugId}] ===============================`);
    }
  }, [connected, publicKey, gameConfig]);

  const handleBackToLobby = () => {
    console.log(`[FRONTEND] 🔙 Returning to lobby...`);
    setGameUrl(null);
    setError(null);
    setDebugInfo(null);
  };

  // Auto-launch game immediately when wallet is connected
  useEffect(() => {
    console.log(`[FRONTEND] 🔍 Auto-launch check:`, {
      connected,
      hasPublicKey: !!publicKey,
      hasGameUrl: !!gameUrl,
      isLoading,
      hasError: !!error,
      gameConfig: !!gameConfig
    });
    
    if (connected && publicKey && !gameUrl && !isLoading && !error && gameConfig) {
      console.log(`[FRONTEND] 🚀 Auto-launching game immediately...`);
      createGameTicket();
    }
  }, [connected, publicKey, gameUrl, isLoading, error, createGameTicket, gameConfig]);

  // Handle iframe loading events
  useEffect(() => {
    if (!gameUrl || !iframeRef.current) return;

    const iframe = iframeRef.current;
    
    const handleLoad = () => {
      console.log(`[FRONTEND] 🎮 Game iframe loaded successfully:`, {
        src: iframe.src,
        readyState: iframe.contentDocument?.readyState
      });
    };

    const handleError = (event: Event) => {
      console.error(`[FRONTEND] ❌ Game iframe failed to load:`, event);
      setError('Failed to load game. Please try again.');
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    console.log(`[FRONTEND] 📺 Setting up iframe event listeners for:`, gameUrl);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
    };
  }, [gameUrl]);

  // Handle cross-origin communication with the game iframe
  useEffect(() => {
    if (!gameUrl) return;

    const handleMessage = (event: MessageEvent) => {
      console.log(`[FRONTEND] 📨 Received postMessage:`, {
        origin: event.origin,
        data: event.data,
        timestamp: new Date().toISOString()
      });

      // Only accept messages from casino.sols.bet origin
      if (!event.origin.includes('casino.sols.bet')) {
        console.log(`[FRONTEND] ❌ Rejected message from invalid origin:`, event.origin);
        return;
      }

      console.log(`[FRONTEND] ✅ Accepted message from valid origin`);

      // Handle CWS postMessage commands
      switch (event.data?.cmd) {
        case 'BALANCE_UPDATE':
          console.log(`[FRONTEND] 💰 Balance updated via postMessage:`, event.data.balance);
          break;
        case 'EXIT':
          console.log(`[FRONTEND] 🚪 Game requesting exit via postMessage`);
          handleBackToLobby();
          break;
        case 'ERROR':
          console.log(`[FRONTEND] ❌ Game reported error via postMessage:`, event.data);
          setError(event.data.message || 'Game error occurred');
          break;
        default:
          // Handle legacy message types for compatibility
          if (event.data.type === 'GAME_EXIT') {
            console.log(`[FRONTEND] 🚪 Legacy game exit message`);
            handleBackToLobby();
          } else {
            console.log(`[FRONTEND] 🤷 Unknown message type:`, event.data);
          }
          break;
      }
    };

    console.log(`[FRONTEND] 📡 Setting up postMessage listener for game communication`);
    window.addEventListener('message', handleMessage);

    return () => {
      console.log(`[FRONTEND] 🗑️ Cleaning up postMessage listener`);
      window.removeEventListener('message', handleMessage);
    };
  }, [gameUrl]);

  // Don't render anything until we have the game config
  if (!gameConfig) {
    return null;
  }

  if (gameUrl) {
    return (
      <>
        <NextSeo
          title={`${gameConfig.name} - Play Classic Casino Games with SOL | sols.bet`}
          description={`Play ${gameConfig.name} classic casino game with Solana (SOL). Enjoy crypto gaming with instant payouts, provably fair gameplay, and traditional casino excitement.`}
          canonical={`${BASE_SEO_CONFIG.openGraph.url}/classics/${gameId}`}
          openGraph={{
            title: `${gameConfig.name} - Solana Classic Casino Game`,
            description: `Play ${gameConfig.name} with SOL on sols.bet. Classic casino gaming with instant payouts and provably fair results.`,
            url: `${BASE_SEO_CONFIG.openGraph.url}/classics/${gameId}`,
            type: 'website',
            images: [
              {
                url: `${BASE_SEO_CONFIG.openGraph.url}/games/classics/${gameId}-poster-tall.jpg`,
                width: 400,
                height: 533,
                alt: `${gameConfig.name} classic casino game poster`
              }
            ]
          }}
          twitter={{
            handle: '@solsbet',
            site: '@solsbet',
            cardType: 'summary_large_image'
          }}
        />
        
        <div className="min-h-screen flex flex-col">
          {/* Game Container */}
          <main className="flex-1">
            <div className="flex flex-col min-[1386px]:flex-row gap-8">
              {/* Main Content - Left Side */}
              <div className="flex-1 min-w-0 space-y-4">
            <div className="w-full relative">
              <iframe
                ref={iframeRef}
                src={gameUrl}
                title={gameConfig.name}
                    className="w-full h-[550px] lg:h-[650px] xl:h-[750px]"
                style={{
                  backgroundColor: '#000',
                  borderRadius: '10px'
                }}
                allowFullScreen
                allow="autoplay; fullscreen; payment"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-downloads"
              />
              
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                  <div className="text-center text-white">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-richGold mx-auto mb-4"></div>
                    <p>Loading {gameConfig.name}...</p>
                    {DEBUG_MODE && <p className="text-xs text-gray-400 mt-2">Check console for detailed logs</p>}
                  </div>
                </div>
              )}
            </div>
            
            {/* Recent Plays Section */}
              <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
                <RecentPlays />
                </div>
              </div>

              {/* Sidebar - Right Side */}
              <div className="space-y-6 min-[1386px]:w-72 min-[1386px]:flex-shrink-0">
                {/* Total Bankroll Value */}
                <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon 
                        icon={faBuildingColumns} 
                        className="text-white w-5 h-5" 
                        style={{ fontSize: '20px' }}
                      />
                      <h3 className="text-white font-bold">Bankroll Value</h3>
                    </div>
                    <a 
                      href={`https://solscan.io/account/FGxFyyspz79vCm5KvawzzBZ3rE3jzdFUDFzyL2Tnu3X3${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-richGold hover:text-richGold/80 transition-colors text-base font-medium"
                    >
                      Verify
                    </a>
                  </div>
                  
                              <div className="bg-darkLuxuryPurple rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon 
                        icon={faPiggyBank} 
                        className="text-richGold w-5 h-5" 
                        style={{ fontSize: '20px' }}
                      />
                      <div className="text-white font-bold text-base">
                        {bankrollLoading ? (
                          <span className="animate-pulse">Loading...</span>
                        ) : (
                          `$${bankrollUsd.toLocaleString('en-US', { 
                            minimumFractionDigits: 2, 
                            maximumFractionDigits: 2 
                          })}`
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gem Collection */}
                <GemCollection />
              </div>
            </div>
          </main>
        </div>
      </>
    );
  }

  // Show minimal loading screen only if wallet not connected or error occurred
  if (!connected) {
    return (
      <>
        <NextSeo
          title={`${gameConfig.name} - Connect Wallet to Play | sols.bet`}
          description={`Connect your Solana wallet to play ${gameConfig.name}. Enjoy classic casino gaming with instant payouts and provably fair results.`}
        />
        <div className="min-h-screen flex flex-col">
          {/* Game Container */}
          <main className="flex-1">
            <div className="flex flex-col min-[1386px]:flex-row gap-8">
              {/* Main Content - Left Side */}
              <div className="flex-1 min-w-0 space-y-8">
                <div className="w-full relative">
                  <div 
                    className="w-full h-[550px] lg:h-[650px] xl:h-[750px] bg-black flex items-center justify-center"
                    style={{
                      borderRadius: '10px'
                    }}
                  >
                    <div className="max-w-md w-full text-center px-4">
                      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                        <h2 className="text-white text-xl font-semibold mb-4">Connect Your Wallet</h2>
                        <p className="text-gray-300 mb-6">
                          Connect to play {gameConfig.name} with real SOL.
                        </p>
                        <button 
                          onClick={() => walletModal.setVisible(true)}
                          className="w-full bg-richGold hover:brightness-110 text-darkLuxuryPurple px-4 py-3 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] hover:shadow-[0_0_30px_rgba(255,215,0,0.6)] flex items-center justify-center gap-2"
                        >
                          <Icon name="wallet" size="sm" className="!text-darkLuxuryPurple" />
                          Connect Wallet
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Recent Plays Section */}
                <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
                  <RecentPlays />
                </div>
              </div>

              {/* Sidebar - Right Side */}
              <div className="space-y-6 min-[1386px]:w-72 min-[1386px]:flex-shrink-0">
                {/* Total Bankroll Value */}
                <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon 
                        icon={faBuildingColumns} 
                        className="text-white w-5 h-5" 
                        style={{ fontSize: '20px' }}
                      />
                      <h3 className="text-white font-bold">Bankroll Value</h3>
                    </div>
                    <a 
                      href={`https://solscan.io/account/FGxFyyspz79vCm5KvawzzBZ3rE3jzdFUDFzyL2Tnu3X3${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-richGold hover:text-richGold/80 transition-colors text-base font-medium"
                    >
                      Verify
                    </a>
                  </div>
                  
                  <div className="bg-darkLuxuryPurple rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon 
                        icon={faPiggyBank} 
                        className="text-richGold w-5 h-5" 
                        style={{ fontSize: '20px' }}
                      />
                      <div className="text-white font-bold text-base">
                        {bankrollLoading ? (
                          <span className="animate-pulse">Loading...</span>
                        ) : (
                          `$${bankrollUsd.toLocaleString('en-US', { 
                            minimumFractionDigits: 2, 
                            maximumFractionDigits: 2 
                          })}`
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gem Collection */}
                <GemCollection />
              </div>
            </div>
          </main>
        </div>
      </>
    );
  }

  // Show error screen if there's an error
  if (error) {
    return (
      <>
        <NextSeo
          title={`${gameConfig.name} - Game Error | sols.bet`}
          description={`Error loading ${gameConfig.name}. Please try again or contact support for assistance.`}
        />
        <div className="min-h-screen flex flex-col">
          {/* Game Container */}
          <main className="flex-1">
            <div className="flex flex-col min-[1386px]:flex-row gap-8">
              {/* Main Content - Left Side */}
              <div className="flex-1 min-w-0 space-y-8">
                <div className="w-full relative">
                  <div 
                    className="w-full h-[550px] lg:h-[650px] xl:h-[750px] bg-black flex items-center justify-center"
                    style={{
                      borderRadius: '10px'
                    }}
                  >
                    <div className="max-w-md w-full text-center px-4">
                      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Icon name="warning" size="lg" className="text-red-400" />
                        </div>
                        <h2 className="text-white text-xl font-semibold mb-4">Error Loading Game</h2>
                        <p className="text-gray-300 mb-6">
                          {error}
                        </p>
                        <div className="space-y-3">
                          <button 
                            onClick={() => {
                              setError(null);
                              createGameTicket();
                            }}
                            className="w-full bg-richGold hover:brightness-110 text-darkLuxuryPurple px-4 py-3 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] hover:shadow-[0_0_30px_rgba(255,215,0,0.6)] flex items-center justify-center gap-2"
                          >
                            <Icon name="refresh" size="sm" className="!text-darkLuxuryPurple" />
                            Try Again
                          </button>
                          <button 
                            onClick={() => router.push('/')}
                            className="w-full bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                          >
                            <Icon name="chevron-left" size="sm" />
                            Back to Lobby
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Recent Plays Section */}
                <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
                  <RecentPlays />
                </div>
              </div>

              {/* Sidebar - Right Side */}
              <div className="space-y-6 min-[1386px]:w-72 min-[1386px]:flex-shrink-0">
                {/* Total Bankroll Value */}
                <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon 
                        icon={faBuildingColumns} 
                        className="text-white w-5 h-5" 
                        style={{ fontSize: '20px' }}
                      />
                      <h3 className="text-white font-bold">Bankroll Value</h3>
                    </div>
                    <a 
                      href={`https://solscan.io/account/FGxFyyspz79vCm5KvawzzBZ3rE3jzdFUDFzyL2Tnu3X3${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-richGold hover:text-richGold/80 transition-colors text-base font-medium"
                    >
                      Verify
                    </a>
                  </div>
                  
                  <div className="bg-darkLuxuryPurple rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon 
                        icon={faPiggyBank} 
                        className="text-richGold w-5 h-5" 
                        style={{ fontSize: '20px' }}
                      />
                      <div className="text-white font-bold text-base">
                        {bankrollLoading ? (
                          <span className="animate-pulse">Loading...</span>
                        ) : (
                          `$${bankrollUsd.toLocaleString('en-US', { 
                            minimumFractionDigits: 2, 
                            maximumFractionDigits: 2 
                          })}`
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gem Collection */}
                <GemCollection />
              </div>
            </div>
          </main>
        </div>
      </>
    );
  }

  // If wallet is connected but no game URL yet, show black screen matching iframe size
  return (
    <>
      <NextSeo
        title={`Loading ${gameConfig.name}... | sols.bet`}
        description={`Loading ${gameConfig.name} classic casino game. Please wait while we prepare your gaming session.`}
      />
      <div className="min-h-screen flex flex-col">
        {/* Game Container */}
        <main className="flex-1">
          <div className="flex flex-col min-[1386px]:flex-row gap-8">
            {/* Main Content - Left Side */}
            <div className="flex-1 min-w-0 space-y-8">
              <div className="w-full relative">
                <div 
                  className="w-full h-[550px] lg:h-[650px] xl:h-[750px] bg-black flex items-center justify-center"
                  style={{
                    borderRadius: '10px'
                  }}
                >
                  <div className="text-center text-white">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-richGold mx-auto mb-4"></div>
                    <p className="text-xl">Loading {gameConfig.name}...</p>
                    <p className="text-sm text-gray-400 mt-2">Preparing your game session...</p>
                  </div>
                </div>
              </div>
              
              {/* Recent Plays Section */}
              <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
                <RecentPlays />
              </div>
            </div>

            {/* Sidebar - Right Side */}
            <div className="space-y-6 min-[1386px]:w-72 min-[1386px]:flex-shrink-0">
              {/* Total Bankroll Value */}
              <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon 
                      icon={faBuildingColumns} 
                      className="text-white w-5 h-5" 
                      style={{ fontSize: '20px' }}
                    />
                    <h3 className="text-white font-bold">Bankroll Value</h3>
                  </div>
                  <a 
                    href={`https://solscan.io/account/FGxFyyspz79vCm5KvawzzBZ3rE3jzdFUDFzyL2Tnu3X3${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-richGold hover:text-richGold/80 transition-colors text-base font-medium"
                  >
                    Verify
                  </a>
                </div>
                
                <div className="bg-darkLuxuryPurple rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon 
                      icon={faPiggyBank} 
                      className="text-richGold w-5 h-5" 
                      style={{ fontSize: '20px' }}
                    />
                    <div className="text-white font-bold text-base">
                      {bankrollLoading ? (
                        <span className="animate-pulse">Loading...</span>
                      ) : (
                        `$${bankrollUsd.toLocaleString('en-US', { 
                          minimumFractionDigits: 2, 
                          maximumFractionDigits: 2 
                        })}`
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Gem Collection */}
              <GemCollection />
            </div>
          </div>
        </main>
      </div>
    </>
  );
} 