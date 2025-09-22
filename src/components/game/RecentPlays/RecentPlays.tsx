// src/components/game/RecentPlays/RecentPlays.tsx
import React from "react";
import { TimeDiff } from "@/utils/TimeDiff";
import Image from "next/image";
import { useUserBets } from "../../../hooks/useUserBets";
import { useLiveWins } from "../../../hooks/useLiveWins";
import { Icon } from "@/components/common";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getGameImage, getGameName } from "@/lib/gameMappings";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSackDollar, faClover } from "@fortawesome/free-solid-svg-icons";
import { GEM_CONFIG } from "@/constants";

// Utility to truncate addresses
function truncate(str: string, prefix = 4, suffix = 4) {
  if (!str) return "";
  return `${str.slice(0, prefix)}…${str.slice(-suffix)}`;
}

// Component to display gem rewards with count bubbles
function GemRewards({ gems }: { gems?: Record<string, number> }) {
  if (!gems || Object.keys(gems).length === 0) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      {Object.entries(gems).map(([gemType, count]) => {
        const gemConfig = GEM_CONFIG.types.find(g => g.name.toLowerCase() === gemType.toLowerCase());
        if (!gemConfig || count <= 0) return null;

        return (
          <div key={gemType} className="relative flex-shrink-0">
            <div className="w-6 h-6 relative">
              <Image 
                src={gemConfig.image} 
                alt={gemConfig.name} 
                width={24} 
                height={24}
                className="object-contain"
              />
              {count > 1 && (
                <div className="absolute -top-1 -right-1 bg-richGold text-black text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold text-[10px]">
                  {count}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RecentPlays() {
  const userBets = useUserBets(12);
  const liveWins = useLiveWins({
    limit: 12, // Match the limit used for user bets
    minAmount: 0.01, // $0.01 minimum to show small wins
    pollingInterval: 10000, // Poll every 10 seconds
    instanceId: 'RecentPlays-Tabs' // Unique identifier for debugging
  });

  // Safety net: Always limit to 12 wins in case the hook returns more
  const safeWins = liveWins.wins.slice(0, 12);
  const wallet = useWallet();
  const [activeTab, setActiveTab] = useState("My Bets");

  // Extend the LiveWin type to include the new fields from the API
  interface ExtendedLiveWin {
    id: string;
    gameId: string;
    gameName: string;
    amount: number;
    wallet: string;
    timestamp: Date;
    betAmount?: number;
    multiplier?: number;
    winAmount?: number;
    signature?: string;
    gems?: Record<string, number>;
  }

  // Filter tabs based on wallet connection
  const allTabs = [
    { id: "My Bets", label: "My Bets" },
    { id: "Live Wins", label: "Live Wins" },
    { id: "Big Wins", label: "Big Wins" },
    { id: "Lucky Wins", label: "Lucky Wins" }
  ];
  
  const tabs = wallet.connected ? allTabs : allTabs.filter(tab => tab.id !== "My Bets");

  // Auto-switch to Live Wins if My Bets is active but user disconnects
  React.useEffect(() => {
    if (!wallet.connected && activeTab === "My Bets") {
      setActiveTab("Live Wins");
    }
  }, [wallet.connected, activeTab]);

  return (
    <div className="w-full">
      {/* Luck.io Style Tabs */}
      <div className="flex px-6 py-6 justify-center lg:justify-start">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-2 sm:py-4 text-xs sm:text-sm transition-colors duration-200 border-b-2 rounded-lg px-4 sm:px-6 lg:px-8 border-transparent font-semibold ${
              index > 0 ? 'ml-2 sm:ml-4' : ''
            } ${
              activeTab === tab.id
                ? 'text-richGold bg-darkLuxuryPurple'
                : 'text-gray-300 bg-transparent hover:text-white hover:bg-darkLuxuryPurple'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "My Bets" && (
        <div className="overflow-x-auto relative">
          <div className="min-w-[800px] relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[30%] after:bg-gradient-to-t after:from-cardMedium after:to-transparent after:pointer-events-none after:z-10">
            {/* Header - luck.io style */}
            <div className="flex items-center px-12 py-3 text-gray-400 text-xs font-medium uppercase tracking-wider">
              <div className="flex-1 min-w-[200px] text-left">GAME</div>
              <div className="w-28 min-w-[120px] text-left">USER</div>
              <div className="w-20 text-right">TIME</div>
              <div className="w-20 text-right">BET</div>
              <div className="w-28 text-right">MULTIPLIER</div>
              <div className="w-24 text-right">PAYOUT</div>
              <div className="w-40 text-right">GEMS</div>
              <div className="w-20 text-right">VERIFY</div>
            </div>

          {/* Rows - luck.io style with compact layout */}
            {userBets.map((tx) => {
          const gameId = tx.gameId;
              const betAmount = Math.abs(tx.bet);
              const profitMultiplier = betAmount > 0 ? (tx.payout / betAmount) : 0;
              const gameImage = getGameImage(gameId);
              const isWin = tx.payout > tx.bet;
              
          return (
                <div key={tx.signature} className="bg-darkLuxuryPurple rounded-lg mx-6 my-2">
                  <div className="flex items-center px-6 py-3 hover:bg-darkLuxuryPurple/80 transition-colors duration-200 group rounded-lg">
                    {/* Game Icon & Name */}
                    <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-[200px]">
                      <div className="relative flex-shrink-0 w-8 h-8">
                        <Image 
                          src={gameImage} 
                          alt="game" 
                          width={32}
                          height={32}
                          className="w-full h-full rounded-lg object-cover" 
                          loading="eager"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = '/logo.png';
                          }}
                        />
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-richGold/20 to-richGold/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"></div>
                      </div>
                      <span className="text-sm text-white font-medium truncate capitalize">
                        {tx.gameName || getGameName(gameId)}
                      </span>
                    </div>

                    {/* User */}
                    <div className="flex items-center overflow-hidden w-28 min-w-[120px]">
                      <div className="w-6 h-6 rounded-full overflow-hidden mr-2 flex-shrink-0">
                        <Image 
                          src="/avatar.png" 
                          alt="User Avatar" 
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                          loading="eager"
                        />
                      </div>
                      <span className="text-sm text-white font-medium truncate">
                        {truncate(tx.user, 4, 4)}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="text-xs text-gray-400 font-medium text-right w-20">
                      <TimeDiff time={new Date(tx.timestamp).getTime()} />
                    </div>

                    {/* Bet Amount */}
                    <div className="text-sm text-white font-semibold text-right w-20">
                      <span>$</span>{betAmount.toFixed(2)}
                    </div>

                    {/* Multiplier */}
                    <div className="text-sm font-bold text-right w-28">
                      <span className={`${
                        profitMultiplier > 0 
                          ? 'text-richGold' 
                          : 'text-gray-400'
                      }`}>
                        {profitMultiplier > 0 ? `${profitMultiplier.toFixed(2)}x` : '0.00x'}
                      </span>
                    </div>

                    {/* Payout */}
                    <div className="text-sm font-bold text-right w-24">
                      {isWin ? (
                        <span className={`${
                          tx.payout > 0 
                            ? 'text-richGold' 
                            : 'text-gray-400'
                        }`}>
                          <span className={`${
                          tx.payout > 0 
                            ? 'text-richGold' 
                            : 'text-gray-400'
                        }`}>$</span>{tx.payout.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          <span className="text-richGold">$</span>0.00
                        </span>
                      )}
                    </div>

                    {/* Gems */}
                    <div className="w-40 text-right">
                      <GemRewards gems={tx.gems} />
                    </div>

                    {/* Verify Button */}
                    <div className="flex justify-end w-20">
                      <a
                        href={tx.signature ? `https://solscan.io/tx/${tx.signature}${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}` : '#'}
                        target={tx.signature ? "_blank" : "_self"}
                        rel={tx.signature ? "noopener noreferrer" : undefined}
                        className="w-8 h-8 rounded-lg bg-cardMedium flex items-center justify-center hover:border-richGold hover:bg-cardDarkAlt transition-all duration-200 group/verify"
                      >
                        <Icon 
                          name="link" 
                          size="xs" 
                          className="text-gray-400 group-hover/verify:text-richGold transition-colors duration-200" 
                        />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {userBets.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-cardMedium flex items-center justify-center mb-4">
                  <FontAwesomeIcon icon={faSackDollar} className="text-gray-400 text-2xl" />
                </div>
                {!wallet.connected ? (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
                    <p className="text-gray-400 text-sm max-w-sm">
                      Connect your wallet to view your betting history and track your wins.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-white mb-2">No Bets Yet</h3>
                    <p className="text-gray-400 text-sm max-w-sm">
                      Your betting history will appear here once you start playing games.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Other Tab Content */}
      {activeTab === "Live Wins" && (
        <div className="overflow-x-auto relative">
          <div className="min-w-[800px] relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[30%] after:bg-gradient-to-t after:from-cardMedium after:to-transparent after:pointer-events-none after:z-10">
            {/* Header */}
            <div className="flex items-center px-12 py-3 text-gray-400 text-xs font-medium uppercase tracking-wider">
              <div className="flex-1 min-w-[200px] text-left">GAME</div>
              <div className="w-28 min-w-[120px] text-left">USER</div>
              <div className="w-20 text-right">TIME</div>
              <div className="w-20 text-right">BET</div>
              <div className="w-28 text-right">MULTIPLIER</div>
              <div className="w-24 text-right">PAYOUT</div>
              <div className="w-40 text-right">GEMS</div>
              <div className="w-20 text-right">VERIFY</div>
            </div>

          {/* Rows - live wins data */}
          {safeWins.map((win) => {
            const extendedWin = win as ExtendedLiveWin;
            const gameId = win.gameId;
            const gameImage = getGameImage(gameId);
            // Use the actual bet amount and multiplier from the API
            const payout = extendedWin.winAmount || extendedWin.amount; // Use winAmount if available, fallback to amount
            const betAmount = extendedWin.betAmount || 0;
            const multiplier = extendedWin.multiplier || 0;
            
            // Debug: Log gameId and gameName for troubleshooting
            if (process.env.NODE_ENV === 'development') {
              console.log('Live Win Debug:', { gameId, gameName: extendedWin.gameName, fallbackName: getGameName(gameId) });
            }
            
            return (
              <div key={win.id} className="bg-darkLuxuryPurple rounded-lg mx-6 my-2">
                <div className="flex items-center px-6 py-3 hover:bg-darkLuxuryPurple/80 transition-colors duration-200 group rounded-lg">
                  {/* Game Icon & Name */}
                  <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-[200px]">
                    <div className="relative flex-shrink-0 w-8 h-8">
                      <Image 
                        src={gameImage} 
                        alt="game" 
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-lg object-cover" 
                        loading="eager"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/logo.png';
                        }}
                      />
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-richGold/20 to-richGold/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"></div>
                    </div>
                    <span className="text-sm text-white font-medium truncate capitalize">
                      {extendedWin.gameName || getGameName(gameId)}
                    </span>
              </div>

              {/* User */}
                  <div className="flex items-center overflow-hidden w-28 min-w-[120px]">
                    <div className="w-6 h-6 rounded-full overflow-hidden mr-2 flex-shrink-0">
                      <Image 
                        src="/avatar.png" 
                        alt="User Avatar" 
                        width={24}
                        height={24}
                        className="w-full h-full object-cover"
                        loading="eager"
                      />
                    </div>
                    <span className="text-sm text-white font-medium truncate">
                      {win.wallet}
              </span>
                  </div>

              {/* Time */}
                  <div className="text-xs text-gray-400 font-medium text-right w-20">
                    <TimeDiff time={new Date(win.timestamp).getTime()} />
                  </div>

                  {/* Bet Amount */}
                  <div className="text-sm text-white font-semibold text-right w-20">
                    <span>$</span>{betAmount.toFixed(2)}
                  </div>

                  {/* Multiplier */}
                  <div className="text-sm font-bold text-right w-28">
                    <span className={`${
                      multiplier > 0 
                        ? 'text-richGold' 
                        : 'text-gray-400'
                    }`}>
                      {multiplier > 0 ? `${multiplier.toFixed(2)}x` : '0.00x'}
                    </span>
                  </div>

                  {/* Payout */}
                  <div className="text-sm font-bold text-right w-24">
                    <span className="text-richGold">
                      <span className="text-richGold">$</span>{payout.toFixed(2)}
              </span>
                  </div>

                  {/* Gems */}
                  <div className="w-40 text-right">
                    <GemRewards gems={extendedWin.gems} />
                  </div>

                  {/* Verify Button */}
                  <div className="flex justify-end w-20">
                    <a
                      href={extendedWin.signature ? `https://solscan.io/tx/${extendedWin.signature}${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}` : '#'}
                      target={extendedWin.signature ? "_blank" : "_self"}
                      rel={extendedWin.signature ? "noopener noreferrer" : undefined}
                      className="w-8 h-8 rounded-lg bg-cardMedium flex items-center justify-center hover:border-richGold hover:bg-cardDarkAlt transition-all duration-200 group/verify"
                    >
                      <Icon 
                        name="link" 
                        size="xs" 
                        className="text-gray-400 group-hover/verify:text-richGold transition-colors duration-200" 
                      />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty State */}
          {safeWins.length === 0 && !liveWins.loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-cardMedium flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faSackDollar} className="text-gray-400 text-2xl" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No Live Wins</h3>
              <p className="text-gray-400 text-sm max-w-sm">
                Recent big wins from players will appear here.
              </p>
            </div>
          )}

            {/* Loading State */}
            {liveWins.loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-cardMedium flex items-center justify-center mb-4 animate-pulse">
                  <Icon name="trophy" size="lg" className="text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Loading...</h3>
                <p className="text-gray-400 text-sm max-w-sm">
                  Fetching recent wins...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Other Tab Content */}
      {activeTab === "Big Wins" && (
        <div className="overflow-x-auto relative">
          <div className="min-w-[800px] relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[30%] after:bg-gradient-to-t after:from-cardMedium after:to-transparent after:pointer-events-none after:z-10">
            {/* Header */}
            <div className="flex items-center px-12 py-3 text-gray-400 text-xs font-medium uppercase tracking-wider">
              <div className="flex-1 min-w-[200px] text-left">GAME</div>
              <div className="w-28 min-w-[120px] text-left">USER</div>
              <div className="w-20 text-right">TIME</div>
              <div className="w-20 text-right">BET</div>
              <div className="w-28 text-right">MULTIPLIER</div>
              <div className="w-24 text-right">PAYOUT</div>
              <div className="w-40 text-right">GEMS</div>
              <div className="w-20 text-right">VERIFY</div>
            </div>

          {/* Rows - Big wins data (wins above $100) */}
          {safeWins
            .filter((win) => {
              const extendedWin = win as ExtendedLiveWin;
              const payout = extendedWin.winAmount || extendedWin.amount;
              return payout >= 100; // Big wins are $100+
            })
            .map((win) => {
              const extendedWin = win as ExtendedLiveWin;
              const gameId = win.gameId;
              const gameImage = getGameImage(gameId);
              const payout = extendedWin.winAmount || extendedWin.amount;
              const betAmount = extendedWin.betAmount || 0;
              const multiplier = extendedWin.multiplier || 0;
              
              return (
                <div key={win.id} className="bg-darkLuxuryPurple rounded-lg mx-6 my-2">
                  <div className="flex items-center px-6 py-3 hover:bg-darkLuxuryPurple/80 transition-colors duration-200 group rounded-lg">
                    {/* Game Icon & Name */}
                    <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-[200px]">
                      <div className="relative flex-shrink-0 w-8 h-8">
                        <Image 
                          src={gameImage} 
                          alt="game" 
                          width={32}
                          height={32}
                          className="w-full h-full rounded-lg object-cover" 
                          loading="eager"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = '/logo.png';
                          }}
                        />
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-richGold/20 to-richGold/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"></div>
                      </div>
                      <span className="text-sm text-white font-medium truncate capitalize">
                        {extendedWin.gameName || getGameName(gameId)}
                      </span>
                    </div>

                    {/* User */}
                    <div className="flex items-center overflow-hidden w-28 min-w-[120px]">
                      <div className="w-6 h-6 rounded-full overflow-hidden mr-2 flex-shrink-0">
                        <Image 
                          src="/avatar.png" 
                          alt="User Avatar" 
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                          loading="eager"
                        />
                      </div>
                      <span className="text-sm text-white font-medium truncate">
                        {win.wallet}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="text-xs text-gray-400 font-medium text-right w-20">
                      <TimeDiff time={new Date(win.timestamp).getTime()} />
                    </div>

                    {/* Bet Amount */}
                    <div className="text-sm text-white font-semibold text-right w-20">
                      <span>$</span>{betAmount.toFixed(2)}
                    </div>

              {/* Multiplier */}
                    <div className="text-sm font-bold text-right w-28">
                      <span className={`${
                        multiplier > 0 
                          ? 'text-richGold' 
                          : 'text-gray-400'
                      }`}>
                        {multiplier > 0 ? `${multiplier.toFixed(2)}x` : '0.00x'}
                      </span>
                    </div>

              {/* Payout */}
                    <div className="text-sm font-bold text-right w-20">
                      <span className="text-richGold">
                        <span className="text-richGold">$</span>{payout.toFixed(2)}
                      </span>
                    </div>

                    {/* Gems */}
                    <div className="w-40 text-right">
                      <GemRewards gems={extendedWin.gems} />
                    </div>

                    {/* Verify Button */}
                    <div className="flex justify-end w-20">
                      <a
                        href={extendedWin.signature ? `https://solscan.io/tx/${extendedWin.signature}${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}` : '#'}
                        target={extendedWin.signature ? "_blank" : "_self"}
                        rel={extendedWin.signature ? "noopener noreferrer" : undefined}
                        className="w-8 h-8 rounded-lg bg-cardMedium flex items-center justify-center hover:border-richGold hover:bg-cardDarkAlt transition-all duration-200 group/verify"
                      >
                        <Icon 
                          name="link" 
                          size="xs" 
                          className="text-gray-400 group-hover/verify:text-richGold transition-colors duration-200" 
                        />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}

          {/* Empty State */}
          {safeWins.filter(win => {
            const extendedWin = win as ExtendedLiveWin;
            const payout = extendedWin.winAmount || extendedWin.amount;
            return payout >= 100;
          }).length === 0 && !liveWins.loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-cardMedium flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faSackDollar} className="text-gray-400 text-2xl" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No Big Wins</h3>
              <p className="text-gray-400 text-sm max-w-sm">
                Wins of $100 or more will appear here.
              </p>
            </div>
          )}

            {/* Loading State */}
            {liveWins.loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-cardMedium flex items-center justify-center mb-4 animate-pulse">
                  <Icon name="star" size="lg" className="text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Loading...</h3>
                <p className="text-gray-400 text-sm max-w-sm">
                  Fetching big wins...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Other Tab Content */}
      {activeTab === "Lucky Wins" && (
        <div className="overflow-x-auto relative">
          <div className="min-w-[800px] relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[30%] after:bg-gradient-to-t after:from-cardMedium after:to-transparent after:pointer-events-none after:z-10">
            {/* Header */}
            <div className="flex items-center px-12 py-3 text-gray-400 text-xs font-medium uppercase tracking-wider">
              <div className="flex-1 min-w-[200px] text-left">GAME</div>
              <div className="w-28 min-w-[120px] text-left">USER</div>
              <div className="w-28 text-right">TIME</div>
              <div className="w-28 text-right">BET</div>
              <div className="w-40 text-right">MULTIPLIER</div>
              <div className="w-28 text-right">PAYOUT</div>
              <div className="w-40 text-right">GEMS</div>
              <div className="w-24 text-right">VERIFY</div>
            </div>

          {/* Rows - Lucky wins data (multiplier > 10x) */}
          {safeWins
            .filter((win) => {
              const extendedWin = win as ExtendedLiveWin;
              const multiplier = extendedWin.multiplier || 0;
              return multiplier > 10; // Lucky wins have multiplier > 10x
            })
            .map((win) => {
              const extendedWin = win as ExtendedLiveWin;
              const gameId = win.gameId;
              const gameImage = getGameImage(gameId);
              const payout = extendedWin.winAmount || extendedWin.amount;
              const betAmount = extendedWin.betAmount || 0;
              const multiplier = extendedWin.multiplier || 0;
              
              return (
                <div key={win.id} className="bg-darkLuxuryPurple rounded-lg mx-6 my-2">
                  <div className="flex items-center px-6 py-3 hover:bg-darkLuxuryPurple/80 transition-colors duration-200 group rounded-lg">
                    {/* Game Icon & Name */}
                    <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-[200px]">
                      <div className="relative flex-shrink-0 w-8 h-8">
                        <Image 
                          src={gameImage} 
                          alt="game" 
                          width={32}
                          height={32}
                          className="w-full h-full rounded-lg object-cover" 
                          loading="eager"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = '/logo.png';
                          }}
                        />
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-richGold/20 to-richGold/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"></div>
                      </div>
                      <span className="text-sm text-white font-medium truncate capitalize">
                        {extendedWin.gameName || getGameName(gameId)}
                      </span>
                    </div>

                    {/* User */}
                    <div className="flex items-center overflow-hidden w-28 min-w-[120px]">
                      <div className="w-6 h-6 rounded-full overflow-hidden mr-2 flex-shrink-0">
                        <Image 
                          src="/avatar.png" 
                          alt="User Avatar" 
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                          loading="eager"
                        />
                      </div>
                      <span className="text-sm text-white font-medium truncate">
                        {win.wallet}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="text-xs text-gray-400 font-medium text-right w-20">
                      <TimeDiff time={new Date(win.timestamp).getTime()} />
                    </div>

                    {/* Bet Amount */}
                    <div className="text-sm text-white font-semibold text-right w-20">
                      <span>$</span>{betAmount.toFixed(2)}
                    </div>

                    {/* Multiplier - Highlight high multipliers */}
                    <div className="text-sm font-bold text-right w-28">
                      <span className={`${
                        multiplier >= 50 
                          ? 'text-purple-400' // Ultra lucky (50x+)
                          : multiplier >= 25 
                          ? 'text-orange-400' // Super lucky (25x+)
                          : multiplier > 10 
                          ? 'text-richGold' // Lucky (10x+)
                          : 'text-gray-400'
                      }`}>
                        {multiplier > 0 ? `${multiplier.toFixed(2)}x` : '0.00x'}
                      </span>
                    </div>

                                        {/* Payout */}
                    <div className="text-sm font-bold text-right w-20">
                      <span className="text-richGold">
                        <span className="text-richGold">$</span>{payout.toFixed(2)}
                      </span>
                    </div>

                    {/* Gems */}
                    <div className="w-40 text-right">
                      <GemRewards gems={extendedWin.gems} />
                    </div>

                    {/* Verify Button */}
                    <div className="flex justify-end w-20">
                      <a
                        href={extendedWin.signature ? `https://solscan.io/tx/${extendedWin.signature}${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}` : '#'}
                        target={extendedWin.signature ? "_blank" : "_self"}
                        rel={extendedWin.signature ? "noopener noreferrer" : undefined}
                        className="w-8 h-8 rounded-lg bg-cardMedium flex items-center justify-center hover:border-richGold hover:bg-cardDarkAlt transition-all duration-200 group/verify"
                      >
                        <Icon 
                          name="link" 
                          size="xs" 
                          className="text-gray-400 group-hover/verify:text-richGold transition-colors duration-200" 
                        />
                      </a>
                    </div>
            </div>
            </div>
          );
        })}

          {/* Empty State */}
          {safeWins.filter(win => {
            const extendedWin = win as ExtendedLiveWin;
            const multiplier = extendedWin.multiplier || 0;
            return multiplier > 10;
          }).length === 0 && !liveWins.loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-cardMedium flex items-center justify-center mb-4">
                <FontAwesomeIcon icon={faClover} className="text-gray-400 text-2xl" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No Lucky Wins</h3>
              <p className="text-gray-400 text-sm max-w-sm">
                Wins with multipliers greater than 10x will appear here.
              </p>
            </div>
          )}

            {/* Loading State */}
            {liveWins.loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-cardMedium flex items-center justify-center mb-4 animate-pulse">
                  <Icon name="dice" size="lg" className="text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Loading...</h3>
                <p className="text-gray-400 text-sm max-w-sm">
                  Fetching lucky wins...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fallback for any other tabs */}
      {!["My Bets", "Live Wins", "Big Wins", "Lucky Wins"].includes(activeTab) && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-cardMedium flex items-center justify-center mb-4">
            <Icon 
              name="dice" 
              size="lg" 
              className="text-gray-400" 
            />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">{activeTab}</h3>
          <p className="text-gray-400 text-sm max-w-sm">
            This feature is coming soon.
          </p>
      </div>
      )}
    </div>
  );
}
