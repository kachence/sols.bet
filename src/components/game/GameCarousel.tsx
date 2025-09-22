import React, { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/common";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';

interface SlotGame {
  id: string;
  name: string;
  image: string;
  background: string;
  volatility: number;
  rtp: number; // RTP percentage (e.g., 96.5 for 96.5%)
  maxWin: number; // Max win multiplier (e.g., 5000 for 5000X)
}

interface ClassicGame {
  id: string;
  name: string;
  image: string;
  background: string;
  volatility: number;
  rtp: number; // RTP percentage (e.g., 96.5 for 96.5%)
  maxWin: number; // Max win multiplier (e.g., 1000 for 1000X)
}

// Define our slot games using the uploaded images - Updated with CWS integration
export const SLOT_GAMES: SlotGame[] = [
  {
    id: "pyramid-riches",
    name: "Pyramid Riches",
    image: "/games/slots/pyramid-riches-poster-tall.jpg",
    background: "#8B4513",
    volatility: 1,
    rtp: 98.52,
    maxWin: 1500,
  },
  {
    id: "fruit-party",
    name: "Fruit Party Non Stop",
    image: "/games/slots/fruit-party-non-stop-poster-tall.jpg",
    background: "#FF6347",
    volatility: 5,
    rtp: 98.05,
    maxWin: 2000,
  },
  {
    id: "mega-joker",
    name: "Mega Joker Jackpot",
    image: "/games/slots/mega-joker-jackpot-poster-tall.jpg",
    background: "#8B0000",
    volatility: 5,
    rtp: 98.31,
    maxWin: 7000,
  },
  {
    id: "luxurious-slot",
    name: "Luxurious Slot",
    image: "/games/slots/luxurious-slot-poster-tall.jpg",
    background: "#B8860B",
    volatility: 5,
    rtp: 98.10,
    maxWin: 12000,
  },
  {
    id: "mystic-books",
    name: "Mystic Books",
    image: "/games/slots/mystic-books-poster-tall.jpg",
    background: "#4B0082",
    volatility: 4,
    rtp: 97.59,
    maxWin: 8000,
  },
  {
    id: "bitcoin-billion",
    name: "Bitcoin Billion",
    image: "/games/slots/bitcoin-billion-poster-tall.jpg",
    background: "#FF8C00",
    volatility: 5,
    rtp: 97.93,
    maxWin: 6000,
  },
  {
    id: "queen-mermaid",
    name: "Queen Mermaid",
    image: "/games/slots/queen-mermaid-poster-tall.jpg",
    background: "#008B8B",
    volatility: 4,
    rtp: 98.17,
    maxWin: 4000,
  },
  {
    id: "count-dracula",
    name: "The Legend of the Count Dracula",
    image: "/games/slots/the-legend-of-the-count-dracula-poster-tall.jpg",
    background: "#4B0000",
    volatility: 1,
    rtp: 98.40,
    maxWin: 1500,
  },
  {
    id: "wild-bears",
    name: "Treasure of the Wild Bears",
    image: "/games/slots/treasure-of-the-wild-bears-poster-tall.jpg",
    background: "#2D5A27",
    volatility: 3,
    rtp: 97.75,
    maxWin: 3000,
  },
  {
    id: "catz-reel-love",
    name: "Catz Reel Love",
    image: "/games/slots/catz-reel-love-poster-tall.jpg",
    background: "#FF69B4",
    volatility: 5,
    rtp: 97.04,
    maxWin: 7000,
  },
];

// Define our classic games - mix of CWS games and custom games
export const CLASSIC_GAMES: ClassicGame[] = [
  // Custom Games (these will use /play/[gameId] route) - Featured first
  {
    id: "mines-adventure",
    name: "Mines",
    image: "/games/classics/mines-cybertron-poster-tall.jpg",
    background: "#9C27B0",
    volatility: 3,
    rtp: 99.02,
    maxWin: 3884,
  },
  {
    id: "plinko-drop",
    name: "Plinko",
    image: "/games/classics/plinko-poster-tall.jpg",
    background: "#00BCD4",
    volatility: 3,
    rtp: 99.01,
    maxWin: 902.5,
  },
  // CWS Classic Games (these will use /classics/[gameId] route)
  {
    id: "blackjack-ultimate",
    name: "Blackjack Ultimate",
    image: "/games/classics/blackjack-ultimate-poster-tall.jpg",
    background: "#212121",
    volatility: 1,
    rtp: 96.54,
    maxWin: 3,
  },
  // Featured Custom Game
  {
    id: "coin-flip",
    name: "Coin Flip",
    image: "/games/classics/coin-flip-poster-tall.jpg",
    background: "#FFEB3B",
    volatility: 1,
    rtp: 95.0,
    maxWin: 2,
  },
  // More CWS Classic Games
  {
    id: "european-roulette",
    name: "European Roulette",
    image: "/games/classics/roulette-european-poster-tall.jpg",
    background: "#4CAF50",
    volatility: 3,
    rtp: 97.3,
    maxWin: 36,
  },
  {
    id: "oasis-poker",
    name: "Oasis Poker",
    image: "/games/classics/oasis-poker-poster-tall.jpg",
    background: "#00838F",
    volatility: 3,
    rtp: 98.92,
    maxWin: 100,
  },
  {
    id: "poker-texas-holdem",
    name: "Poker Texas Holdem",
    image: "/games/classics/poker-texas-holdem-poster-tall.jpg",
    background: "#C62828",
    volatility: 2,
    rtp: 97.50,
    maxWin: 2,
  },
  {
    id: "war-of-cards",
    name: "War of Cards",
    image: "/games/classics/war-of-cards-poster-tall.jpg",
    background: "#8E24AA",
    volatility: 3,
    rtp: 97.12,
    maxWin: 10,
  },
  // Other Custom Games
  {
    id: "keno-classic",
    name: "Keno Soccer",
    image: "/games/classics/keno-80-soccer-poster-tall.jpg",
    background: "#2E7D32",
    volatility: 4,
    rtp: 96.03,
    maxWin: 10000,
  },
  {
    id: "crown-and-anchor",
    name: "Crown and Anchor",
    image: "/games/classics/crown-and-anchor-poster-tall.jpg",
    background: "#8B4513",
    volatility: 2,
    rtp: 96.30,
    maxWin: 6,
  },
];

interface GameCarouselCardProps {
  game: SlotGame | ClassicGame;
  index: number;
  isSlotGame?: boolean;
  isClassicGame?: boolean;
}

function GameCarouselCard({ game, index, isSlotGame = false, isClassicGame = false }: GameCarouselCardProps) {
  const router = useRouter();
  
  // Different image handling for slot/classic games vs regular games
  const { image: imagePath, name: gameName, background: gameBackground, volatility: gameVolatility } =
    game as SlotGame | ClassicGame;

  // Individual gradient colors for each game based on their visual themes
  const getGameGradientColor = (gameId: string): string => {
    const colorMap: Record<string, string> = {
      // Slots
      "pyramid-riches": "#8B4513", // Dark sandy brown for Egyptian theme
      "count-dracula": "#8B0000", // Dark red for vampire theme
      "wild-bears": "#2D5016", // Deep forest green for nature theme
      "catz-reel-love": "#8B4B8B", // Muted pink/magenta for cute theme
      "mystic-books": "#6B4423", // Deep amber/bronze for mystical theme
      "bitcoin-billion": "#B8860B", // Dark golden for cryptocurrency theme
      "queen-mermaid": "#004D40", // Deep teal for ocean theme
      "fruit-party": "#C62828", // Deep red for fruit theme
      "mega-joker": "#4A148C", // Deep purple for joker theme
      "luxurious-slot": "#B8860B", // Dark gold for luxurious theme
      
      // Classics
      "blackjack-ultimate": "#1A1A1A", // Deep charcoal for classic card game
      "crown-and-anchor": "#8B4513", // Dark brown for nautical theme
      "european-roulette": "#1B5E20", // Deep green for roulette table
      "oasis-poker": "#00695C", // Deep teal for oasis theme
      "poker-texas-holdem": "#B71C1C", // Deep red for classic poker
      "war-of-cards": "#6A1B9A", // Deep purple for war theme
      "coin-flip": "#B8860B", // Dark gold for coin theme
      "keno-classic": "#1B5E20", // Deep green for soccer-themed keno
      "mines-adventure": "#3E2723", // Dark brown for mining theme
      "plinko-drop": "#1976D2", // Deep blue for plinko theme
    };
    
    return colorMap[gameId] || "#2B0F54"; // Fallback to darkLuxuryPurple
  };

  const gradientColor = getGameGradientColor(game.id);

  // Smart routing based on game type and availability
  const getGameHref = () => {
    return isSlotGame ? `/slots/${game.id}` : `/classics/${game.id}`;
  };

  return (
    <Link href={getGameHref()} passHref>
      <motion.div
        className="group cursor-pointer relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Portrait card with 3:4 aspect ratio - no border */}
        <motion.div
          className="w-full relative overflow-hidden rounded-xl"
          style={{ 
            aspectRatio: "3/4", // Portrait orientation (taller than wide)
          }}
        >
          {/* Game image - full coverage for slot/classic games, centered logo for others */}
          {(isSlotGame || isClassicGame) ? (
            <motion.div
              className="absolute inset-0 w-full h-full overflow-hidden"
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <Image
                src={imagePath}
                alt={gameName}
                width={400}
                height={533}
                className="absolute inset-0 w-full h-full object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1200px) 25vw, (max-width: 1400px) 20vw, 14vw"
                loading="eager"
              />
            </motion.div>
          ) : (
            <>
              {/* Background pattern for regular games */}
              <motion.div
                className="absolute top-0 left-0 w-full h-full opacity-10 overflow-hidden"
                whileHover={{ opacity: 0.25 }}
                transition={{ duration: 0.3 }}
              >
                <Image
                  src="/stuff.png"
                  alt="Background pattern"
                  width={400}
                  height={533}
                  className="w-full h-full object-center object-cover"
                  loading="eager"
                />
              </motion.div>
              
              {/* Game logo/image */}
              <motion.div
                className="absolute top-0 left-0 w-full h-3/4 p-4 flex items-center justify-center overflow-hidden"
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <Image
                  src={imagePath}
                  alt={gameName}
                  width={300}
                  height={300}
                  className="object-contain"
                  loading="eager"
                />
              </motion.div>
            </>
          )}

          {/* Game stats at top */}
          <div 
            className="absolute top-0 left-0 right-0 p-2 sm:p-3 md:p-4"
            style={{
              background: `linear-gradient(to bottom, ${gradientColor}E6, ${gradientColor}99, transparent)`
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-white text-xs font-semibold">RTP {game.rtp}%</span>
              <div className="flex items-center gap-0.5 sm:gap-1">
                {/* Volatility bolts */}
                {Array.from({ length: 5 }).map((_, i) => (
                  <FontAwesomeIcon
                    key={i}
                    icon={faBolt}
                    className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${
                      i < gameVolatility
                        ? "text-richGold"
                        : "text-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Game name at bottom */}
          <div 
            className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 md:p-4 group-hover:opacity-0 transition-opacity duration-300"
            style={{
              background: `linear-gradient(to top, ${gradientColor}E6, ${gradientColor}99, transparent)`
            }}
          >
            <h3 className="text-white font-bold text-sm md:text-lg mb-1 text-center leading-tight">{gameName}</h3>
          </div>

          {/* Hover overlay with gradient and play button at bottom */}
          <motion.div 
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          >
            {/* Gradient overlay from top to bottom using dark purple */}
            <div className="absolute inset-0 bg-gradient-to-b from-darkLuxuryPurple/20 via-darkLuxuryPurple/80 to-darkLuxuryPurple/100"></div>
            
            {/* Play button and max win text positioned at bottom center */}
            <div className="absolute bottom-4 sm:bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 sm:gap-3">
              <div className="bg-richGold hover:brightness-110 text-black px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 rounded-lg font-bold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] flex items-center gap-1 sm:gap-2 text-sm sm:text-base md:text-lg">
                <Icon name="play" size="sm" className="!text-black" />
                Play
              </div>
              
              {/* Max win text */}
              <div className="text-white font-semibold text-xs sm:text-sm">
                Max Win: <span className="text-richGold">{game.maxWin.toLocaleString()}X</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </Link>
  );
}

interface GameCarouselProps {
  gameType?: 'slots' | 'classics';
}

export function GameCarousel({ gameType = 'classics' }: GameCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [visibleCards, setVisibleCards] = useState(4);  // Initial SSR safe
  const [cardWidth, setCardWidth] = useState(0);  // NEW: Dynamic card width incl gap
  const [gap, setGap] = useState(12);  // NEW: Track gap for SSR safety
  const carouselRef = useRef<HTMLDivElement>(null);
  
  // Use different game sets based on type
  const games = gameType === 'slots' ? SLOT_GAMES : CLASSIC_GAMES;
  const isSlotCarousel = gameType === 'slots';
  
  // Updated visible cards calc - responsive breakpoints for optimal card sizing
  const getVisibleCards = () => {
    if (typeof window === 'undefined') return 4;
    const width = window.innerWidth;
    if (width >= 1460) return 6;  // Large screens - 6 cards
    if (width >= 1386) return 5;  // Medium-large screens - 5 cards  
    if (width >= 768) return 4;   // md - 4 cards
    if (width >= 640) return 3;   // sm - 3 cards
    return 2;  // xs/mobile - 2 cards
  };

  // NEW: Slide by 1 card for precision control
  const maxIndex = Math.max(0, games.length - visibleCards);
  const boundedCurrentIndex = Math.min(Math.max(0, currentIndex), maxIndex);

  // Update visible and recalculate card width on resize
  React.useEffect(() => {
    const handleResize = () => {
      const newVisible = getVisibleCards();
      setVisibleCards(newVisible);
      
      if (carouselRef.current) {
        const containerWidth = carouselRef.current.offsetWidth;
        const currentGap = window.innerWidth >= 768 ? 16 : 12;  // md:gap-4 (16px), default gap-3 (12px)
        const calculatedCardWidth = (containerWidth - currentGap * (newVisible - 1)) / newVisible;
        setCardWidth(calculatedCardWidth);
        setGap(currentGap);
      }

      // Reset index if out of bounds
      setCurrentIndex((prev) => Math.min(prev, Math.max(0, games.length - newVisible)));
    };

    handleResize();  // Initial
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [games.length]);

  // Navigation: Slide by 2 cards for faster navigation
  const handlePrevious = React.useCallback(() => {
    if (isScrolling || currentIndex <= 0) return;
    setIsScrolling(true);
    setCurrentIndex((prev) => Math.max(0, prev - 2));  // Slide by 2
    setTimeout(() => setIsScrolling(false), 300);
  }, [isScrolling, currentIndex]);

  const handleNext = React.useCallback(() => {
    if (isScrolling || currentIndex >= maxIndex) return;
    setIsScrolling(true);
    setCurrentIndex((prev) => Math.min(maxIndex, prev + 2));  // Slide by 2
    setTimeout(() => setIsScrolling(false), 300);
  }, [isScrolling, currentIndex, maxIndex]);

  // Connect to external navigation buttons with specific IDs
  React.useEffect(() => {
    // Connect to specific navigation buttons based on game type
    const prevId = gameType === 'slots' ? 'slots-prev' : 'classics-prev';
    const nextId = gameType === 'slots' ? 'slots-next' : 'classics-next';
    
    const prevButton = document.getElementById(prevId);
    const nextButton = document.getElementById(nextId);

    if (prevButton) {
      prevButton.addEventListener('click', handlePrevious);
    }
    
    if (nextButton) {
      nextButton.addEventListener('click', handleNext);
    }

    return () => {
      if (prevButton) prevButton.removeEventListener('click', handlePrevious);
      if (nextButton) nextButton.removeEventListener('click', handleNext);
    };
  }, [gameType, handlePrevious, handleNext]);

  // Update button states - updated for new sliding approach
  React.useEffect(() => {
    const prevId = gameType === 'slots' ? 'slots-prev' : 'classics-prev';
    const nextId = gameType === 'slots' ? 'slots-next' : 'classics-next';
    
    const prevButton = document.getElementById(prevId);
    const nextButton = document.getElementById(nextId);

    // Hide buttons entirely if all games fit in one view
    const shouldShowNavigation = games.length > visibleCards;

    if (prevButton) {
      if (!shouldShowNavigation) {
        prevButton.style.display = 'none';
      } else {
        prevButton.style.display = 'block';
        prevButton.style.opacity = boundedCurrentIndex <= 0 ? '0.5' : '1';
        prevButton.style.pointerEvents = boundedCurrentIndex <= 0 ? 'none' : 'auto';
      }
    }
    
    if (nextButton) {
      if (!shouldShowNavigation) {
        nextButton.style.display = 'none';
      } else {
        nextButton.style.display = 'block';
        nextButton.style.opacity = boundedCurrentIndex >= maxIndex ? '0.5' : '1';
        nextButton.style.pointerEvents = boundedCurrentIndex >= maxIndex ? 'none' : 'auto';
      }
    }
  }, [gameType, boundedCurrentIndex, maxIndex, games.length, visibleCards]);

  return (
    <div className="relative">
      {/* Carousel Container - Single Row */}
      <div className="overflow-hidden" ref={carouselRef}>
        <motion.div
          className="flex gap-3 md:gap-4"
          animate={{ 
            x: cardWidth > 0 ? -boundedCurrentIndex * (cardWidth + gap) : 0
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          {games.map((game, index) => (
            <div
              key={game.id}
              className="flex-shrink-0"
              style={{ width: cardWidth > 0 ? `${cardWidth}px` : 'auto' }}
            >
              <GameCarouselCard 
                game={game} 
                index={index} 
                isSlotGame={isSlotCarousel}
                isClassicGame={gameType === 'classics'}
              />
            </div>
          ))}
        </motion.div>
      </div>

      {/* Progress Indicators - Updated to show per position */}
      <div className="flex items-center justify-center gap-2 mt-4 md:mt-6">
        {games.length > visibleCards && Array.from({ length: maxIndex + 1 }).map((_, pageIndex) => (
          <button
            key={pageIndex}
            onClick={() => {
              if (!isScrolling) setCurrentIndex(pageIndex);
            }}
            className={`w-2 h-2 rounded-full transition-all duration-200 ${
              pageIndex === boundedCurrentIndex ? "bg-richGold w-6 md:w-8" : "bg-gray-600 hover:bg-richGold/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
} 