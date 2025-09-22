// Centralized game mappings and configurations
// This file consolidates all game-related mappings to avoid duplication

// CWS Game Configuration with complete details
export const CWS_GAMES = {
  'mystic-books': {
    id: 5007,
    name: 'Mystic Books',
    description: 'Embark on a mystical journey through ancient books filled with magical symbols and hidden treasures in this enchanting slot adventure.'
  },
  'pyramid-riches': {
    id: 5016,
    name: 'Pyramid Riches II',
    description: 'Discover the ancient treasures of the pharaohs in this Egyptian-themed slot adventure with golden pyramids and mystical symbols.'
  },
  'count-dracula': {
    id: 6760,
    name: 'The Legend of Count Dracula',
    description: 'Enter the dark castle of Count Dracula in this gothic horror slot filled with vampires, bats, and supernatural rewards.'
  },
  'wild-bears': {
    id: 6866,
    name: 'Treasure of the Wild Bears',
    description: 'Journey into the wilderness where wild bears guard ancient treasures in this nature-themed slot adventure.'
  },
  'catz-reel-love': {
    id: 6864,
    name: 'Catz Reel Love',
    description: 'Fall in love with adorable cats in this charming slot game filled with feline friends and purr-fect prizes.'
  },
  'bitcoin-billion': {
    id: 5019,
    name: 'Bitcoin Billion',
    description: 'Enter the world of cryptocurrency in this modern slot where digital coins and blockchain technology create massive wins.'
  },
  'queen-mermaid': {
    id: 6619,
    name: 'Queen Mermaid Deluxe',
    description: 'Dive deep into the ocean kingdom where the Queen Mermaid rules over treasures beneath the waves.'
  },
  'fruit-party': {
    id: 6628,
    name: 'Fruit Party Non Stop',
    description: 'Dance with delicious fruits in this vibrant party slot where juicy symbols create explosive winning combinations.'
  },
  'mega-joker': {
    id: 6885,
    name: 'Mega Joker Jackpot',
    description: 'Laugh your way to the bank with the Mega Joker in this classic-style slot with massive jackpot potential.'
  },
  'luxurious-slot': {
    id: 6868,
    name: 'Luxurious Slot',
    description: 'Experience ultimate luxury with this premium slot featuring golden symbols, precious gems, and extravagant rewards.'
  }
} as const;

// Direct mapping from NUMERIC IDs to poster images
export const NUMERIC_ID_TO_IMAGE: Record<string, string> = {
  // Slots - mapping numeric CWS IDs directly to poster images
  "5007": "/games/slots/mystic-books-poster-tall.jpg",
  "5016": "/games/slots/pyramid-riches-poster-tall.jpg", 
  "6760": "/games/slots/the-legend-of-the-count-dracula-poster-tall.jpg",
  "6866": "/games/slots/treasure-of-the-wild-bears-poster-tall.jpg",
  "6864": "/games/slots/catz-reel-love-poster-tall.jpg",
  "5019": "/games/slots/bitcoin-billion-poster-tall.jpg",
  "6619": "/games/slots/queen-mermaid-poster-tall.jpg",
  "6628": "/games/slots/fruit-party-non-stop-poster-tall.jpg",
  "6885": "/games/slots/mega-joker-jackpot-poster-tall.jpg",
  "6868": "/games/slots/luxurious-slot-poster-tall.jpg",
  // Classics - mapping numeric CWS IDs directly to poster images
  "5108": "/games/classics/blackjack-ultimate-poster-tall.jpg",
  "5702": "/games/classics/crown-and-anchor-poster-tall.jpg",
  "5500": "/games/classics/roulette-european-poster-tall.jpg",
  "5106": "/games/classics/oasis-poker-poster-tall.jpg",
  "5207": "/games/classics/poker-texas-holdem-poster-tall.jpg",
  "5223": "/games/classics/war-of-cards-poster-tall.jpg",
  "5314": "/games/classics/keno-80-soccer-poster-tall.jpg",
  "5800": "/games/classics/mines-cybertron-poster-tall.jpg",
  "5810": "/games/classics/coin-flip-poster-tall.jpg",
  "5820": "/games/classics/plinko-poster-tall.jpg",
};

// Slug-based mapping for fallback
export const SLUG_TO_IMAGE: Record<string, string> = {
  // Slots
  "mystic-books": "/games/slots/mystic-books-poster-tall.jpg",
  "pyramid-riches": "/games/slots/pyramid-riches-poster-tall.jpg", 
  "count-dracula": "/games/slots/the-legend-of-the-count-dracula-poster-tall.jpg",
  "wild-bears": "/games/slots/treasure-of-the-wild-bears-poster-tall.jpg",
  "catz-reel-love": "/games/slots/catz-reel-love-poster-tall.jpg",
  "bitcoin-billion": "/games/slots/bitcoin-billion-poster-tall.jpg",
  "queen-mermaid": "/games/slots/queen-mermaid-poster-tall.jpg",
  "fruit-party": "/games/slots/fruit-party-non-stop-poster-tall.jpg",
  "mega-joker": "/games/slots/mega-joker-jackpot-poster-tall.jpg",
  "luxurious-slot": "/games/slots/luxurious-slot-poster-tall.jpg",
  // Classics
  "blackjack-ultimate": "/games/classics/blackjack-ultimate-poster-tall.jpg",
  "crown-and-anchor": "/games/classics/crown-and-anchor-poster-tall.jpg",
  "european-roulette": "/games/classics/roulette-european-poster-tall.jpg",
  "oasis-poker": "/games/classics/oasis-poker-poster-tall.jpg",
  "poker-texas-holdem": "/games/classics/poker-texas-holdem-poster-tall.jpg",
  "war-of-cards": "/games/classics/war-of-cards-poster-tall.jpg",
  "coin-flip": "/games/classics/coin-flip-poster-tall.jpg",
  "keno-classic": "/games/classics/keno-80-soccer-poster-tall.jpg",
  "mines-adventure": "/games/classics/mines-cybertron-poster-tall.jpg",
  "plinko-drop": "/games/classics/plinko-poster-tall.jpg",
};

// Map numeric CWS game IDs (as strings) to their slug IDs
export const NUMERIC_TO_SLUG: Record<string, string> = {
  // Slots - Updated to match GameCarousel IDs exactly
  "5007": "mystic-books",
  "5016": "pyramid-riches",
  "6760": "count-dracula",
  "6866": "wild-bears",
  "6864": "catz-reel-love",
  "5019": "bitcoin-billion",
  "6619": "queen-mermaid",
  "6628": "fruit-party",
  "6885": "mega-joker",
  "6868": "luxurious-slot",
  // Classics - Updated to match exact GameCarousel IDs
  "5108": "blackjack-ultimate",
  "5702": "crown-and-anchor",
  "5500": "european-roulette",
  "5106": "oasis-poker",
  "5207": "poker-texas-holdem",
  "5223": "war-of-cards",
  "5314": "keno-classic",
  "5800": "mines-adventure",
  "5810": "coin-flip",
  "5820": "plinko-drop",

};

// Game name mapping for display purposes
export const GAME_NAME_MAP: Record<string, string> = {
  // Slots
  '5007': 'Mystic Books', '5016': 'Pyramid Riches II', '6760': 'The Legend of Count Dracula',
  '6866': 'Treasure of the Wild Bears', '6864': 'Catz Reel Love', '5019': 'Bitcoin Billion',
  '6619': 'Queen Mermaid Deluxe', '6628': 'Fruit Party Non Stop', '6885': 'Mega Joker Jackpot', '6868': 'Luxurious Slot',
  // Classics
  '5108': 'BlackJack Ultimate',
  '5702': 'Crown and Anchor', '5500': 'European Roulette', '5106': 'Oasis Poker',
  '5207': 'Poker Texas Holdem', '5223': 'War of Cards', '5314': 'Keno Soccer',
  '5800': 'Mines CyberWorld', '5810': 'Coin Flip', '5820': 'Plinko', 'external_game': 'Casino Game'
};

// Game ID mapping for URL slugs
export const GAME_ID_MAP: Record<string, string> = {
  // Slots
  '5007': 'mystic-books', '5016': 'pyramid-riches', '6760': 'count-dracula', '6866': 'wild-bears',
  '6864': 'catz-reel-love', '5019': 'bitcoin-billion', '6619': 'queen-mermaid',
  '6628': 'fruit-party', '6885': 'mega-joker', '6868': 'luxurious-slot',
  // Classics
  '5108': 'blackjack-ultimate',
  '5702': 'crown-and-anchor', '5500': 'european-roulette', '5106': 'oasis-poker',
  '5207': 'poker-texas-holdem', '5223': 'war-of-cards', '5314': 'keno-classic',
  '5800': 'mines-adventure', '5810': 'coin-flip', '5820': 'plinko-drop', 'external_game': 'casino-game'
};

// Utility function to resolve game image - centralized logic
export function getGameImage(gameId: string): string {
  const slugId = NUMERIC_TO_SLUG[gameId] || gameId;
  
  // Try numeric ID first, then slug ID, then default
  return NUMERIC_ID_TO_IMAGE[gameId] || SLUG_TO_IMAGE[slugId] || "/logo.png";
}

// Utility function to get game name
export function getGameName(gameId: string): string {
  return GAME_NAME_MAP[gameId] || 'Casino Game';
}

// Utility function to get game slug
export function getGameSlug(gameId: string): string {
  return GAME_ID_MAP[gameId] || gameId;
} 