// Centralized game mappings for worker
// This file consolidates all game-related mappings to avoid duplication across worker modules

// Game name mapping for display purposes
export const GAME_NAME_MAP = {
  // Slots
  '5007': 'Mystic Books',
  '5016': 'Pyramid Riches II',
  '6760': 'The Legend of Count Dracula',
  '6866': 'Treasure of the Wild Bears',
  '6864': 'Catz Reel Love',
  '5019': 'Bitcoin Billion',
  '6619': 'Queen Mermaid Deluxe',
  '6628': 'Fruit Party Non Stop',
  '6885': 'Mega Joker Jackpot',
  '6868': 'Luxurious Slot',
  // Classics
  '5108': 'BlackJack Ultimate',
  '5702': 'Crown and Anchor',
  '5500': 'European Roulette',
  '5106': 'Oasis Poker',
  '5207': 'Poker Texas Holdem',
  '5223': 'War of Cards',
  '5314': 'Keno Soccer',
  '5800': 'Mines CyberWorld',
  '5810': 'Coin Flip',
  '5820': 'Plinko',
  'external_game': 'Casino Game'
};

// Game ID mapping for URL slugs
export const GAME_ID_MAP = {
  // Slots
  '5007': 'mystic-books', '5016': 'pyramid-riches', '6760': 'count-dracula', '6866': 'wild-bears',
  '6864': 'catz-reel-love', '5019': 'bitcoin-billion', '6619': 'queen-mermaid',
  '6628': 'fruit-party', '6885': 'mega-joker', '6868': 'luxurious-slot',
  // Classics
  '5108': 'blackjack-ultimate',
  '5702': 'crown-and-anchor', '5500': 'european-roulette',
  '5106': 'oasis-poker', '5207': 'poker-texas-holdem', '5223': 'war-of-cards',
  '5314': 'keno-classic', '5800': 'mines-adventure', '5810': 'coin-flip', '5820': 'plinko-drop',
  'external_game': 'casino-game'
};

// Game image mapping for achievements and other visual displays
export const GAME_IMAGE_MAP = {
  // Slots games
  '5016': '/games/slots/pyramid-riches-poster-tall.jpg',
  '6760': '/games/slots/the-legend-of-the-count-dracula-poster-tall.jpg',
  '6866': '/games/slots/treasure-of-the-wild-bears-poster-tall.jpg',
  '6864': '/games/slots/catz-reel-love-poster-tall.jpg',
  '6904': '/games/slots/lucky-shamrock-poster-tall.jpg',
  '5007': '/games/slots/mystic-books-poster-tall.jpg',
  '5019': '/games/slots/bitcoin-billion-poster-tall.jpg',
  '6619': '/games/slots/queen-mermaid-poster-tall.jpg',
  '6625': '/games/slots/tales-of-a-geisha-poster-tall.jpg',
  '6854': '/games/slots/sweet-reels-of-love-poster-tall.jpg',
  '6761': '/games/slots/archer-of-slotwood-poster-tall.jpg',
  '5011': '/games/slots/bee-party-poster-tall.jpg',
  '5013': '/games/slots/circus-of-fortune-poster-tall.jpg',
  '6628': '/games/slots/fruit-party-non-stop-poster-tall.jpg',
  '5009': '/games/slots/oktoberfest-beer-bash-poster-tall.jpg',
  '5005': '/games/slots/safari-reels-poster-tall.jpg',
  
  // Classics games
  '5108': '/games/classics/blackjack-ultimate-poster-tall.jpg',
  '5702': '/games/classics/crown-and-anchor-poster-tall.jpg',
  '5500': '/games/classics/roulette-european-poster-tall.jpg',
  '5106': '/games/classics/oasis-poker-poster-tall.jpg',
  '5207': '/games/classics/poker-texas-holdem-poster-tall.jpg',
  '5223': '/games/classics/war-of-cards-poster-tall.jpg',
  '5314': '/games/classics/keno-80-soccer-poster-tall.jpg',
  '5800': '/games/classics/mines-cybertron-poster-tall.jpg',
  '5810': '/games/classics/coin-flip-poster-tall.jpg',
  '5820': '/games/classics/plinko-poster-tall.jpg',
};

// Utility function to get game name
export function getGameName(gameId) {
  return GAME_NAME_MAP[gameId] || 'Casino Game';
}

// Utility function to get game slug
export function getGameSlug(gameId) {
  return GAME_ID_MAP[gameId] || gameId;
}

// Game type mapping - determines if game is slot or classic
export const GAME_TYPE_MAP = {
  // Slots
  '5007': 'slot',    // Mystic Books
  '5016': 'slot',    // Pyramid Riches II
  '6760': 'slot',    // The Legend of Count Dracula
  '6866': 'slot',    // Treasure of the Wild Bears
  '6864': 'slot',    // Catz Reel Love
  '5019': 'slot',    // Bitcoin Billion
  '6619': 'slot',    // Queen Mermaid Deluxe
  '6628': 'slot',    // Fruit Party Non Stop
  '6885': 'slot',    // Mega Joker Jackpot
  '6868': 'slot',    // Luxurious Slot
  
  // Classics
  '5108': 'classic', // BlackJack Ultimate
  '5702': 'classic', // Crown and Anchor
  '5500': 'classic', // European Roulette
  '5106': 'classic', // Oasis Poker
  '5207': 'classic', // Poker Texas Holdem
  '5223': 'classic', // War of Cards
  '5314': 'classic', // Keno Soccer
  '5800': 'classic', // Mines CyberWorld
  '5810': 'classic', // Coin Flip
  '5820': 'classic', // Plinko
};

// Minimum bet mapping per game
export const GAME_MIN_BET_MAP = {
  // Slots - 0.01 minimum bet
  '5007': '0.01', // Mystic Books
  '5016': '0.01', // Pyramid Riches II
  '6760': '0.01', // The Legend of Count Dracula
  '6866': '0.01', // Treasure of the Wild Bears
  '6864': '0.01', // Catz Reel Love
  '5019': '0.01', // Bitcoin Billion
  '6619': '0.01', // Queen Mermaid Deluxe
  '6628': '0.01', // Fruit Party Non Stop
  '6885': '0.01', // Mega Joker Jackpot
  '6868': '0.01', // Luxurious Slot
  
  // Classics - variable minimum bets
  '5108': '1.00', // BlackJack Ultimate
  '5702': '1.00', // Crown and Anchor
  '5500': '1.00', // European Roulette
  '5106': '1.00', // Oasis Poker
  '5207': '1.00', // Poker Texas Holdem
  '5223': '1.00', // War of Cards
  '5314': '0.10', // Keno Soccer
  '5800': '0.50', // Mines CyberWorld
  '5810': '1.00', // Coin Flip
  '5820': '0.50'  // Plinko
};

// Maximum bet mapping per game
export const GAME_MAX_BET_MAP = {
  // Slots - variable maximum bets
  '5007': '0.02', // Mystic Books
  '5016': '0.50', // Pyramid Riches II
  '6760': '0.20', // The Legend of Count Dracula
  '6866': '0.10', // Treasure of the Wild Bears
  '6864': '0.10', // Catz Reel Love
  '5019': '0.20', // Bitcoin Billion
  '6619': '0.10', // Queen Mermaid Deluxe
  '6628': '0.20', // Fruit Party Non Stop
  '6885': '0.10', // Mega Joker Jackpot
  '6868': '0.02', // Luxurious Slot
  
  // Classics - variable maximum bets
  '5108': '100.00', // BlackJack Ultimate
  '5702': '100.00', // Crown and Anchor
  '5500': '100.00', // European Roulette
  '5106': '100.00', // Oasis Poker
  '5207': '100.00', // Poker Texas Holdem
  '5223': '100.00', // War of Cards
  '5314': '1.00',   // Keno Soccer
  '5800': '5.00',   // Mines CyberWorld
  '5810': '100.00', // Coin Flip
  '5820': '20.00'   // Plinko
};

// Utility function to check if game is a slot
export function isSlotGame(gameId) {
  return GAME_TYPE_MAP[gameId] === 'slot';
}

// Utility function to check if game is a classic
export function isClassicGame(gameId) {
  return GAME_TYPE_MAP[gameId] === 'classic';
}

// Utility function to get minimum bet for game
export function getGameMinBet(gameId) {
  return GAME_MIN_BET_MAP[gameId] || null;
}

// Utility function to get maximum bet for game
export function getGameMaxBet(gameId) {
  return GAME_MAX_BET_MAP[gameId] || null;
}

// Utility function to get game image
export function getGameImage(gameId) {
  return GAME_IMAGE_MAP[gameId] || '/sols-bet-logo.png';
} 