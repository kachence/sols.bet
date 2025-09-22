import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NextSeo } from 'next-seo';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Icon } from '@/components/common';
import RecentPlays from '@/components/game/RecentPlays/RecentPlays';
import { BASE_SEO_CONFIG } from '@/constants';
import { CWS_GAMES } from '@/lib/gameMappings';
import Image from "next/image";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPiggyBank, faBuildingColumns } from '@fortawesome/free-solid-svg-icons';
import { useBankrollValue } from "@/hooks/useBankrollValue";
import { GemCollection } from "@/components/common/GemCollection";

// Debug mode to help with development   
const DEBUG_MODE = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');

export default function DynamicSlotGame() {
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

  // Get game configuration
  const gameConfig = gameId && typeof gameId === 'string' ? CWS_GAMES[gameId as keyof typeof CWS_GAMES] : null;

  // Redirect to 404 if game not found
  useEffect(() => {
    if (gameId && !gameConfig) {
      router.push('/404');
    }
  }, [gameId, gameConfig, router]);

  const createGameTicket = useCallback(async () => {
    if (!gameConfig) return;
    
    const debugId = Math.random().toString(36).substr(2, 9);
    
    if (!connected || !publicKey) {
      setError("Please connect your wallet first");
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const requestData = {
        gameId: gameConfig.id,
        wallet: publicKey.toString(),
        mode: "real" // Always use real mode
      };

      const apiUrl = 'https://casino-worker-v2.fly.dev/games/ticket';

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
      } catch (parseError) { 
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
        throw new Error(data.error || 'Failed to create game ticket');
      }

      if (!data.launch) {
        throw new Error('No game launch URL received');
      }

      // Final game URL
      let gameUrl = data.launch;
      setGameUrl(gameUrl);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [connected, publicKey, gameConfig]);

  const handleBackToLobby = () => {
    setGameUrl(null);
    setError(null);
    setDebugInfo(null);
  };

  // Auto-launch game immediately when wallet is connected
  useEffect(() => {
    if (connected && publicKey && !gameUrl && !isLoading && !error && gameConfig) {
      createGameTicket();
    }
  }, [connected, publicKey, gameUrl, isLoading, error, createGameTicket, gameConfig]);

  // Handle iframe loading events
  useEffect(() => {
    if (!gameUrl || !iframeRef.current) return;

    const iframe = iframeRef.current;
    
    const handleLoad = () => {};

    const handleError = (event: Event) => {
      setError('Failed to load game. Please try again.');
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
    };
  }, [gameUrl]);

  // Handle cross-origin communication with the game iframe
  useEffect(() => {
    if (!gameUrl) return;

    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from casino.sols.bet origin
      if (!event.origin.includes('casino.sols.bet')) {
        return;
      }

      switch (event.data?.cmd) {
        case 'BALANCE_UPDATE':
          break;
        case 'EXIT':
          handleBackToLobby();
          break;
        case 'ERROR':
          setError(event.data.message || 'Game error occurred');
          break;
        default:
          if (event.data.type === 'GAME_EXIT') {
            handleBackToLobby();
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
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
          title={`${gameConfig.name} - Play Slots with SOL | sols.bet`}
          description={`Play ${gameConfig.name} slot game with Solana (SOL). Enjoy crypto casino gaming with instant payouts, provably fair gameplay, and exciting bonus features.`}
          canonical={`${BASE_SEO_CONFIG.openGraph.url}/slots/${gameId}`}
          openGraph={{
            title: `${gameConfig.name} - Solana Slot Game`,
            description: `Play ${gameConfig.name} with SOL on sols.bet. Crypto casino gaming with instant payouts and provably fair results.`,
            url: `${BASE_SEO_CONFIG.openGraph.url}/slots/${gameId}`,
            type: 'website',
            images: [
              {
                url: `${BASE_SEO_CONFIG.openGraph.url}/games/slots/${gameId}-poster-tall.jpg`,
                width: 400,
                height: 533,
                alt: `${gameConfig.name} slot game poster`
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
              <div className="flex-1 min-w-0 space-y-8">
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
          description={`Connect your Solana wallet to play ${gameConfig.name}. Enjoy crypto casino gaming with instant payouts and provably fair results.`}
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
        description={`Loading ${gameConfig.name} slot game. Please wait while we prepare your gaming session.`}
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