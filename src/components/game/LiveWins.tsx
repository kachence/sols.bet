import React, { useEffect } from "react";
import { useLiveWins } from "@/hooks/useLiveWins";
import Image from "next/image";
import { SLOT_GAMES, CLASSIC_GAMES } from "@/components/game/GameCarousel";
import { getGameImage, NUMERIC_TO_SLUG } from "@/lib/gameMappings";

// Helper to format wallet addresses as XX...XXXX
const shortenWallet = (addr: string, prefix: number = 2, suffix: number = 4) => {
  if (!addr) return "";
  if (addr.length <= prefix + suffix + 3) return addr;
  return `${addr.slice(0, prefix)}…${addr.slice(-suffix)}`;
};

// Build image map and id sets from carousel data so LiveWins always stays in sync
const GAME_IMAGE_MAP: Record<string, string> = {
  ...SLOT_GAMES.reduce((acc, g) => ({ ...acc, [g.id]: g.image }), {} as Record<string, string>),
  ...CLASSIC_GAMES.reduce((acc, g) => ({ ...acc, [g.id]: g.image }), {} as Record<string, string>),
};

const slotGameIds = new Set(SLOT_GAMES.map((g) => g.id));
const classicGameIds = new Set(CLASSIC_GAMES.map((g) => g.id));

interface LiveWin {
  id: string;
  gameId: string;
  gameName: string;
  amount: number;
  wallet: string;
  timestamp: Date;
}

interface LiveWinCardProps {
  win: LiveWin;
  index: number;
}

function LiveWinCard({ win, index }: LiveWinCardProps) {
  const slugId = NUMERIC_TO_SLUG[win.gameId] || win.gameId;
  
  // Use centralized function with fallback to carousel mapping
  const gameImage = getGameImage(win.gameId) !== "/logo.png" ? getGameImage(win.gameId) : GAME_IMAGE_MAP[slugId] || "/logo.png";
  
  // Determine the game URL based on gameId
  const getGameUrl = (gameId: string) => {
    const slug = NUMERIC_TO_SLUG[gameId] || gameId;
    
    if (slotGameIds.has(slug)) {
      return `/slots/${slug}`;
    } else if (classicGameIds.has(slug)) {
      return `/classics/${slug}`;
    } else {
      // Fallback to play route for external games
      return `/play/${gameId}`;
    }
  };

  const gameUrl = getGameUrl(slugId);

  return (
    <div className="flex flex-col items-center gap-1.5 w-full min-w-[80px] max-w-[80px]">
      {/* Game Image - Consistent sizing */}
      <a 
        href={gameUrl}
        className="w-20 h-20 rounded-lg overflow-hidden mx-auto hover:opacity-80 transition-opacity cursor-pointer"
      >
        <Image
          src={gameImage}
          alt={win.gameName}
          width={80}
          height={80}
          className="w-full h-full object-cover"
          loading="eager"
        />
      </a>
      
      {/* USD Amount */}
      <div className="text-richGold font-bold text-xs text-center">
        ${win.amount.toFixed(2)}
      </div>
      
      {/* Avatar and Wallet */}
      <div className="flex items-center gap-0.5 justify-center">
        <div className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0">
          <Image 
            src="/avatar.png" 
            alt="Avatar" 
            width={16}
            height={16}
            className="w-full h-full object-cover"
            loading="eager"
          />
        </div>
        <span className="text-gray-400 text-xs font-medium truncate max-w-[70px]">
          {shortenWallet(win.wallet)}
        </span>
      </div>
    </div>
  );
}

export function LiveWins() {
  const { wins, loading, error, refetch } = useLiveWins({
    limit: 20,
    minAmount: 0.1, // $0.1 minimum to show wins
    pollingInterval: 10000, // Poll every 10 seconds
    instanceId: 'LiveWins-Header' // Unique identifier for debugging
  });

  // Always use all available wins - let the UI naturally fit what it can
  const displayWins = wins.slice(0, 20);

  // Show loading state
  if (loading) {
    return (
      <div className="bg-cardMedium border border-cardMedium rounded-lg p-4 mb-8 overflow-hidden relative z-10">
        <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
          <div className="w-2 h-2 bg-richGold rounded-full animate-pulse"></div>
          <span className="text-white font-bold text-sm">Live Wins</span>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-400 text-sm">Loading recent wins...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-cardMedium border border-cardMedium rounded-lg p-4 mb-8 overflow-hidden relative z-10">
        <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          <span className="text-white font-bold text-sm">Live Wins</span>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="text-red-400 text-sm">Failed to load wins</div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (!displayWins.length) {
    return (
      <div className="bg-cardMedium border border-cardMedium rounded-lg p-4 mb-8 overflow-hidden relative z-10">
        <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
          <div className="w-2 h-2 bg-richGold rounded-full"></div>
          <span className="text-white font-bold text-sm">Live Wins</span>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-400 text-sm">No recent wins to display</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cardMedium border border-cardMedium rounded-lg p-4 mb-8 overflow-hidden relative z-10">
      {/* Live Wins Label - Top Left Corner */}
      <div className="bg-cardMedium border border-cardMedium pb-1 pr-2 absolute top-4 left-4 flex items-center gap-2 z-10 ">
        <div className="w-2 h-2 bg-richGold rounded-full animate-pulse"></div>
        <span className="text-white font-bold text-sm">Live Wins</span>
      </div>
      
      {/* Flexible Wins Display - Fits as many as possible horizontally */}
      <div className="overflow-hidden">
        <div className="flex gap-2 items-center w-full px-2">
          {displayWins.map((win, index) => (
            <div
              key={`${win.id}-${index}`}
              className="flex-none" // Don't grow or shrink, maintain fixed size
            >
              <LiveWinCard win={win} index={index} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 