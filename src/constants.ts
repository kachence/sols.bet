// src\constants.ts
import { PublicKey } from "@solana/web3.js";

/******************************************
 * ┌──────────────────────────────────────┐ *
 * │          PLATFORM FEES               │ *
 * └──────────────────────────────────────┘ *
 ******************************************/

// Creator fee (in %)
export const PLATFORM_CREATOR_FEE = 0.05; // 5% !!max 5%!!

// Jackpot fee (in %)
export const PLATFORM_JACKPOT_FEE = 0.01; // 0.1%

// Referral fee (in %)
export const PLATFORM_REFERRAL_FEE = 0.0025; // 0.25%

// Toggle live toast events - (true = on, false = off)
export const LIVE_EVENT_TOAST = false;

/******************************************
 * ┌──────────────────────────────────────┐ *
 * │          SMART VAULT CONFIG          │ *
 * └──────────────────────────────────────┘ *
 ******************************************/

// Smart Vault Program ID
export const SMART_VAULT_PROGRAM_ID = new PublicKey("3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg");

// Vault transaction fee (in SOL)
export const VAULT_TRANSACTION_FEE = 0.001; // 0.001 SOL

// Default vault settings
export const VAULT_SETTINGS = {
  // Minimum deposit amount (in lamports)
  minDeposit: 0.001e9, // 0.001 SOL
  // Maximum deposit amount (in lamports) 
  maxDeposit: 1000e9, // 1000 SOL
  // Vault yield APY (annual percentage yield)
  yieldAPY: 0.05, // 5%
};

/******************************************
 * ┌──────────────────────────────────────┐ *
 * │         BONUS & REWARDS CONFIG       │ *
 * └──────────────────────────────────────┘ *
 ******************************************/

// Rakeback configuration
export const RAKEBACK_CONFIG = {
  // Base rakeback percentage
  baseRate: 0.05, // 5%
  // Levels and their rakeback rates
  levels: [
    { level: 1, name: "Bronze", rate: 0.05, minWager: 0, color: "#CD7F32" },
    { level: 2, name: "Silver", rate: 0.08, minWager: 100e9, color: "#C0C0C0" },
    { level: 3, name: "Gold", rate: 0.12, minWager: 500e9, color: "#FFD700" },
    { level: 4, name: "Platinum", rate: 0.15, minWager: 1000e9, color: "#E5E4E2" },
    { level: 5, name: "Diamond", rate: 0.20, minWager: 5000e9, color: "#B9F2FF" },
  ],
  // Claim cooldown (in seconds)
  claimCooldown: 86400, // 24 hours
};

// Reload bonus configuration
export const RELOAD_BONUS_CONFIG = {
  // Daily reload bonus
  daily: {
    percentage: 0.25, // 25%
    maxAmount: 5e9, // 5 SOL
    cooldown: 86400, // 24 hours
  },
  // Weekly reload bonus
  weekly: {
    percentage: 0.50, // 50%
    maxAmount: 20e9, // 20 SOL
    cooldown: 604800, // 7 days
  },
  // Monthly reload bonus
  monthly: {
    percentage: 1.0, // 100%
    maxAmount: 100e9, // 100 SOL
    cooldown: 2592000, // 30 days
  },
};

// Gem collectibles configuration
export type GemType = 'Garnet' | 'Amethyst' | 'Topaz' | 'Sapphire' | 'Emerald' | 'Ruby' | 'Diamond';

export interface GemCollection {
  [key: string]: number;
}

export const GEM_CONFIG = {
  // Gem types (in ascending rarity order)
  types: [
    { name: 'Garnet' as GemType, rarity: 'Common', color: '#DC2626', image: '/garnet.png' },
    { name: 'Amethyst' as GemType, rarity: 'Common', color: '#7C3AED', image: '/amethyst.png' },
    { name: 'Topaz' as GemType, rarity: 'Uncommon', color: '#F59E0B', image: '/topaz.png' },
    { name: 'Sapphire' as GemType, rarity: 'Rare', color: '#2563EB', image: '/sapphire.png' },
    { name: 'Emerald' as GemType, rarity: 'Epic', color: '#059669', image: '/emerald.png' },
    { name: 'Ruby' as GemType, rarity: 'Legendary', color: '#DC2626', image: '/ruby.png' },
    { name: 'Diamond' as GemType, rarity: 'Mythic', color: '#64748B', image: '/diamond.png' },
  ],
  // Gems earned per SOL wagered
  gemsPerSOL: 10,
  // Milestone rewards
  milestones: [
    { gems: 50, reward: "5% Rakeback Boost", type: "rakeback_boost", value: 0.05 },
    { gems: 100, reward: "Free Reload Bonus", type: "reload_bonus", value: 1e9 },
    { gems: 250, reward: "VIP Badge", type: "badge", value: "vip" },
    { gems: 500, reward: "10 SOL Bonus", type: "balance_bonus", value: 10e9 },
    { gems: 1000, reward: "Diamond Status", type: "rank_boost", value: "diamond" },
  ],
  // Gem exchange rates
  exchange: {
    // SOL per gem
    solPerGem: 0.001e9, // 0.001 SOL per gem
    // Bonus balance per gem
    bonusPerGem: 0.01e9, // 0.01 SOL bonus per gem
  },
};

/******************************************
 * ┌──────────────────────────────────────┐ *
 * │         PLAYER PROFILE CONFIG        │ *
 * └──────────────────────────────────────┘ *
 ******************************************/

// Player rank configuration
export const PLAYER_RANKS = [
  { 
    level: 1, 
    name: "Bronze", 
    minWager: 0, 
    color: "#CD7F32", 
    bgGradient: "from-orange-400 to-orange-600",
    benefits: ["5% Rakeback", "Basic Support"]
  },
  { 
    level: 2, 
    name: "Silver", 
    minWager: 100e9, 
    color: "#C0C0C0", 
    bgGradient: "from-gray-400 to-gray-600",
    benefits: ["8% Rakeback", "Priority Support", "Weekly Bonus"]
  },
  { 
    level: 3, 
    name: "Gold", 
    minWager: 500e9, 
    color: "#FFD700", 
    bgGradient: "from-yellow-400 to-yellow-600",
    benefits: ["12% Rakeback", "VIP Support", "Monthly Bonus", "Custom Badge"]
  },
  { 
    level: 4, 
    name: "Platinum", 
    minWager: 1000e9, 
    color: "#E5E4E2", 
    bgGradient: "from-slate-400 to-slate-600",
    benefits: ["15% Rakeback", "Dedicated Manager", "Exclusive Events"]
  },
  { 
    level: 5, 
    name: "Diamond", 
    minWager: 5000e9, 
    color: "#B9F2FF", 
    bgGradient: "from-cyan-400 to-cyan-600",
    benefits: ["20% Rakeback", "Personal Host", "All Access", "Custom Limits"]
  },
];

// Achievement badges configuration
export const ACHIEVEMENTS = [
  {
    id: "first_game",
    name: "First Game",
    description: "Play your first game",
    icon: "games",
    requirement: { type: "games_played", value: 1 },
    rarity: "common"
  },
  {
    id: "high_roller",
    name: "High Roller", 
    description: "Wager 100 SOL in a single game",
    icon: "star",
    requirement: { type: "max_bet", value: 100e9 },
    rarity: "rare"
  },
  {
    id: "win_streak",
    name: "Win Streak",
    description: "Win 5 games in a row",
    icon: "fire",
    requirement: { type: "win_streak", value: 5 },
    rarity: "epic"
  },
  {
    id: "whale",
    name: "Whale",
    description: "Wager 1000 SOL total",
    icon: "chart",
    requirement: { type: "total_wagered", value: 1000e9 },
    rarity: "legendary"
  },
  {
    id: "diamond_hands",
    name: "Diamond Hands",
    description: "Hold through a 50x multiplier",
    icon: "diamond",
    requirement: { type: "max_multiplier", value: 50 },
    rarity: "legendary"
  },
  {
    id: "referral_master",
    name: "Referral Master",
    description: "Refer 10 active players",
    icon: "users",
    requirement: { type: "referrals", value: 10 },
    rarity: "epic"
  }
];

// Achievement rarity colors
export const ACHIEVEMENT_COLORS = {
  common: { bg: "bg-gray-500", text: "text-gray-300", border: "border-gray-500" },
  rare: { bg: "bg-blue-500", text: "text-blue-300", border: "border-blue-500" },
  epic: { bg: "bg-purple-500", text: "text-purple-300", border: "border-purple-500" },
  legendary: { bg: "bg-yellow-500", text: "text-yellow-300", border: "border-yellow-500" },
};

/******************************************
 * ┌──────────────────────────────────────┐ *
 * │          METATAGS (SEO)              │ *
 * └──────────────────────────────────────┘ *
 ******************************************/

export const BASE_SEO_CONFIG = {
  defaultTitle: "sols.bet - Premier On-Chain Casino",
  description:
    "A next-generation casino gaming platform built on Solana blockchain with provably fair games.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://sols.bet/",
    title: "sols.bet - Premier On-Chain Casino",
    description:
      "A next-generation casino gaming platform built on Solana blockchain with provably fair games.",
    images: [
      {
        url: "https://sols.bet/seo-banner.png",
        width: 1200,
        height: 630,
        alt: "SOLS.BET - Premier On-Chain Casino",
      },
    ],
    site_name: "SOLS.BET",
  },
  twitter: {
    cardType: "summary_large_image",
    site: "https://twitter.com/solsbet",
    handle: "@solsbet",
  },
  additionalMetaTags: [
    {
      name: "keywords",
      content: "casino, gaming, blockchain, solana, crypto, gambling, entertainment, airdrop",
    },
    {
      name: "theme-color",
      content: "#000000",
    },
  ],
};

/******************************************
 * ┌──────────────────────────────────────┐ *
 * │      SUPPORTED PLATFORM TOKENS       │ *
 * └──────────────────────────────────────┘ *
 ******************************************/

export const TOKENLIST = [
  // SOL
  {
    mint: new PublicKey("So11111111111111111111111111111111111111112"),
    name: "Solana",
    symbol: "SOL",
    image:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    decimals: 9,
    baseWager: 0.01e9,
  },
  // USDC
  {
    mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    name: "USD Coin",
    symbol: "USDC",
    image:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    decimals: 9,
    baseWager: 0.01e9,
  },
  // GUAC
  {
    mint: new PublicKey("AZsHEMXd36Bj1EMNXhowJajpUXzrKcK57wW4ZGXVa7yR"),
    name: "Guacamole",
    symbol: "GUAC",
    image:
      "https://bafkreiccbqs4jty2yjvuxp5x7gzgepquvv657ttauaqgxfhxghuz5us54u.ipfs.nftstorage.link/",
    decimals: 5,
    baseWager: 2000000e5,
  },

  // Add New Public pool
  // {
  //   mint: new PublicKey(""),
  //   name: "",
  //   symbol: "",
  //   image: "",
  //   decimals: 0,
  //   baseWager: 0,
  // },

  // Add New Private pool
  // {
  //   mint: new PublicKey(""),
  //   poolAuthority: new PublicKey(""), // REQUIRED FOR PRIVATE POOLS ONLY
  //   name: "",
  //   symbol: "",
  //   image: "",
  //   decimals: 0,
  //   baseWager: 0,
  // },
];
