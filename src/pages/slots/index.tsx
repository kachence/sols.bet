import React, { useState, useMemo } from 'react';
import { NextSeo } from 'next-seo';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Icon } from '@/components/common';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faStar, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { BASE_SEO_CONFIG } from '@/constants';
import { SLOT_GAMES } from '@/components/game/GameCarousel';
import { LiveWins } from '@/components/game/LiveWins';

interface SlotGameCardProps {
  game: typeof SLOT_GAMES[0];
  index: number;
}

function SlotGameCard({ game, index }: SlotGameCardProps) {
  // Game gradient colors
  const getGameGradientColor = (gameId: string): string => {
    const colorMap: Record<string, string> = {
      "pyramid-riches": "#8B4513",
      "count-dracula": "#8B0000",
      "wild-bears": "#2D5016",
      "catz-reel-love": "#8B4B8B",
      "mystic-books": "#6B4423",
      "bitcoin-billion": "#B8860B",
      "queen-mermaid": "#004D40",
      "fruit-party": "#C62828",
      "mega-joker": "#4A148C",
      "luxurious-slot": "#B8860B",
    };
    return colorMap[gameId] || "#2B0F54";
  };

  const gradientColor = getGameGradientColor(game.id);

  return (
    <Link href={`/slots/${game.id}`} passHref>
      <motion.div
        className="group cursor-pointer relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        whileTap={{ scale: 0.98 }}
      >
        <motion.div
          className="w-full relative overflow-hidden rounded-xl"
          style={{ aspectRatio: "3/4" }}
        >
          {/* Game image */}
          <motion.div className="absolute inset-0 w-full h-full overflow-hidden">
            <Image
              src={game.image}
              alt={game.name}
              width={400}
              height={533}
              className="absolute inset-0 w-full h-full object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
              loading="lazy"
            />
          </motion.div>

          {/* Game stats at top */}
          <div 
            className="absolute top-0 left-0 right-0 p-3 md:p-4"
            style={{
              background: `linear-gradient(to bottom, ${gradientColor}E6, ${gradientColor}99, transparent)`
            }}
          >
            <div className="flex items-center justify-between">
              {/* RTP */}
              <span className="text-white text-sm font-semibold">RTP {game.rtp}%</span>
              
              {/* Volatility */}
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <FontAwesomeIcon
                    key={i}
                    icon={faBolt}
                    className={`w-3 h-3 ${
                      i < game.volatility ? "text-richGold" : "text-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Game name at bottom */}
          <div 
            className="absolute bottom-0 left-0 right-0 p-3 md:p-4 group-hover:opacity-0 transition-opacity duration-300"
            style={{
              background: `linear-gradient(to top, ${gradientColor}E6, ${gradientColor}99, transparent)`
            }}
          >
            <h3 className="text-white font-bold text-lg md:text-xl text-center leading-tight">
              {game.name}
            </h3>
          </div>

          {/* Hover overlay */}
          <motion.div 
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-darkLuxuryPurple/20 via-darkLuxuryPurple/80 to-darkLuxuryPurple/100"></div>
            
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-3">
              <div className="bg-richGold hover:brightness-110 text-black px-8 py-4 rounded-lg font-bold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] flex items-center gap-2 text-lg">
                <Icon name="play" size="sm" className="!text-black" />
                Play
              </div>
              
              <div className="text-white font-semibold text-sm">
                Max Win: <span className="text-richGold">{game.maxWin.toLocaleString()}X</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </Link>
  );
}

export default function SlotsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter games based on search term
  const filteredGames = useMemo(() => {
    if (!searchTerm.trim()) return SLOT_GAMES;
    
    return SLOT_GAMES.filter(game =>
      game.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <>
      <NextSeo
        title="Premium Slot Games - SOLS.BET | Blockchain Casino"
        description="Discover our collection of premium slot games on Solana blockchain. Experience provably fair slots with instant payouts, stunning graphics, and exciting bonus features."
        canonical="https://sols.bet/slots"
        openGraph={{
          title: "Premium Slot Games - SOLS.BET",
          description: "Discover our collection of premium slot games on Solana blockchain with provably fair mechanics and instant payouts.",
          url: "https://sols.bet/slots",
          images: [{
            url: "https://sols.bet/seo-banner.png",
            width: 1200,
            height: 630,
            alt: "SOLS.BET Premium Slot Games"
          }],
          site_name: "SOLS.BET"
        }}
        twitter={{
          cardType: "summary_large_image",
          handle: "@solsbet",
          site: "@solsbet"
        }}
        additionalMetaTags={[
          {
            name: "keywords",
            content: "slot games, blockchain slots, crypto slots, solana slots, provably fair slots, online casino"
          }
        ]}
      />

      {/* Live Wins */}
      <LiveWins />

      <div className="bg-midnightAmethyst rounded-xl">
        <div className="container mx-auto px-4 py-8">
          {/* Search Bar */}
          <div className="mb-8">
            <div className="w-full relative">
              <div className="relative">
                <FontAwesomeIcon 
                  icon={faMagnifyingGlass}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5"
                />
                <input
                  type="text"
                  placeholder="Search by name"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 text-lg bg-darkLuxuryPurple border border-richGold/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-richGold/50 focus:ring-2 focus:ring-richGold/20"
                />
              </div>
            </div>
          </div>

          {/* Games Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {filteredGames.map((game, index) => (
              <SlotGameCard key={game.id} game={game} index={index} />
            ))}
          </div>

          {/* No results message */}
          {filteredGames.length === 0 && searchTerm.trim() && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-xl mb-4">No games found</div>
              <div className="text-gray-500">
                Try searching with different keywords
              </div>
            </div>
          )}

          {/* Total games count */}
          <div className="text-center mt-12 text-gray-400">
            Showing {filteredGames.length} of {SLOT_GAMES.length} slot games
          </div>
        </div>
      </div>
    </>
  );
} 