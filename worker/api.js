// IMPORTANT: Import Sentry instrumentation first
import "./instrument.mjs";

import { createServer } from 'http';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';

// Import modular endpoints
import { handleDeposit } from './modules/deposit.js';
import { handleWithdraw } from './modules/withdraw.js';
import { handleLiveWins } from './modules/live-wins.js';
import { handleUserAchievements } from './modules/user-achievements.js';
import { handleUserBets } from './modules/user-bets.js';
import { handleWalletBalance } from './modules/wallet-balance.js';
import { handleUserSmartVault } from './modules/user-smart-vault.js';
import { handleTransactions } from './modules/transactions.js';
import { handleGamesTicket } from './modules/games-ticket.js';
import { handleGetBalance } from './modules/getbalance.js';
import { handleBalanceAdj } from './modules/balance-adj.js';
import { handleResolveReferral } from './modules/resolve-referral.js';
import { handleUserSignup } from './modules/user-signup.js';
import { handleUserLogout } from './modules/user-logout.js';
import { handleUserLoginStatus } from './modules/user-login-status.js';
import { getPythPrice, getChainlinkPrice, getCoinGeckoPrice, initializeDependencies, getSolToUsdRate, lockRateForTesting, unlockRateForTesting, getTestModeStatus, getBankrollValueUsd, getSolanaBalance, json } from './modules/shared-utils.js';
import * as gemCollection from './modules/gem-collection.js';

// Initialize Redis connection (using Upstash client like the worker)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Price cache constants - using unified cache from shared-utils.js
const REDIS_PRICE_KEY = 'price:solusd';

// Bankroll cache constants
const REDIS_BANKROLL_KEY = 'bankroll:usd_value';
const BANKROLL_WALLET_ADDRESS = 'FGxFyyspz79vCm5KvawzzBZ3rE3jzdFUDFzyL2Tnu3X3';

// Price updater metrics
const priceMetrics = {
  updateCount: 0,
  consecutiveFailures: 0,
  lastSuccessfulUpdate: null,
  lastFailure: null,
  sourceStats: {
    pyth: { successes: 0, failures: 0 },
    chainlink: { successes: 0, failures: 0 },
    coingecko: { successes: 0, failures: 0 },
    fallback: { uses: 0 }
  }
};

// Background price updater - runs every 10 seconds
let priceUpdaterStats = {
  updateCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  lastUpdateTime: null,
  lastPrice: null,
  sourceStats: {
    pyth: { success: 0, failure: 0 },
    chainlink: { success: 0, failure: 0 },
    coingecko: { success: 0, failure: 0 }
  },
  healthStatus: 'starting'
};

// Leader election for price updates
const LEADER_KEY = 'price_updater_leader';
const LEADER_TTL = 30; // 30 seconds leader lease
let isLeader = false;
let leaderCheckInterval = null;
let priceUpdateInterval = null;

// Leader election for bankroll updates
const BANKROLL_LEADER_KEY = 'bankroll_updater_leader';
const BANKROLL_LEADER_TTL = 90; // 90 seconds leader lease (longer since updates are every 60s)
let isBankrollLeader = false;
let bankrollLeaderCheckInterval = null;
let bankrollUpdateInterval = null;

// Leader election for user reconciliation
const RECONCILIATION_LEADER_KEY = 'reconciliation_updater_leader';
const RECONCILIATION_LEADER_TTL = 3900; // 65 minutes leader lease (longer than 1 hour)
let isReconciliationLeader = false;
let reconciliationLeaderCheckInterval = null;
let reconciliationTimeout = null;

// Leader election for bankroll safety monitoring
const BANKROLL_SAFETY_LEADER_KEY = 'bankroll_safety_leader';
const BANKROLL_SAFETY_LEADER_TTL = 900; // 15 minutes leader lease (longer than 10 minute intervals)
let isBankrollSafetyLeader = false;
let bankrollSafetyLeaderCheckInterval = null;
let bankrollSafetyUpdateInterval = null;

// Leader election for profit/loss monitoring
const PROFIT_LOSS_LEADER_KEY = 'profit_loss_leader';
const PROFIT_LOSS_LEADER_TTL = 4500; // 75 minutes leader lease (longer than 1 hour intervals)
let isProfitLossLeader = false;
let profitLossLeaderCheckInterval = null;
let profitLossUpdateInterval = null;

// Leader election for gem fairness monitoring
const GEM_FAIRNESS_LEADER_KEY = 'gem_fairness_leader';
const GEM_FAIRNESS_LEADER_TTL = 7500; // 125 minutes leader lease (longer than 2 hour intervals)
let isGemFairnessLeader = false;
let gemFairnessLeaderCheckInterval = null;
let gemFairnessUpdateInterval = null;

// Bankroll updater stats
let bankrollUpdaterStats = {
  updateCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  lastUpdateTime: null,
  lastBankrollUsd: null,
  lastSolBalance: null,
  healthStatus: 'starting'
};

// User reconciliation stats
let reconciliationStats = {
  updateCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  lastUpdateTime: null,
  lastSummary: null,
  healthStatus: 'starting'
};

// Bankroll safety monitor stats
let bankrollSafetyStats = {
  updateCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  lastUpdateTime: null,
  lastCheck: null,
  healthStatus: 'starting',
  currentBankroll: null,
  safetyThreshold: null,
  isSafe: null,
  alertsSent: 0
};

// Profit/Loss ratio monitor stats
let profitLossStats = {
  updateCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  lastUpdateTime: null,
  lastCheck: null,
  healthStatus: 'starting',
  currentRtp: null,
  expectedRtp: null,
  isHealthy: null,
  alertsSent: 0
};

// Gem fairness monitor stats
let gemFairnessStats = {
  updateCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  lastUpdateTime: null,
  lastCheck: null,
  healthStatus: 'starting',
  totalUsersAnalyzed: 0,
  unfairUsers: 0,
  alertsSent: 0
};

async function electLeader() {
  const instanceId = crypto.randomUUID();
  
  try {
    // Try to become leader
    const becameLeader = await redis.set(LEADER_KEY, instanceId, { ex: LEADER_TTL, nx: true });
    
    if (becameLeader) {
      isLeader = true;
      console.log(`👑 Became price update leader: ${instanceId.substring(0, 8)}`);
      startPriceUpdater();
    } else {
      isLeader = false;
      const currentLeader = await redis.get(LEADER_KEY);
      // console.log(`⚡ Another instance is leader: ${currentLeader?.substring(0, 8) || 'unknown'}`);
      stopPriceUpdater();
    }
  } catch (error) {
    console.error('Leader election failed:', error.message);
  }
}

async function renewLeadership() {
  if (!isLeader) return;
  
  try {
    const currentLeader = await redis.get(LEADER_KEY);
    // Only renew if we're still the leader
    if (currentLeader) {
      await redis.expire(LEADER_KEY, LEADER_TTL);
      // console.log(`🔄 Leadership renewed`);
    } else {
      // Leadership lost, try to regain
      console.log(`👑 Leadership lost, attempting re-election`);
      isLeader = false;
      await electLeader();
    }
  } catch (error) {
    console.error('Leadership renewal failed:', error.message);
    isLeader = false;
  }
}

async function renewBankrollLeadership() {
  if (!isBankrollLeader) return;
  
  try {
    const currentLeader = await redis.get(BANKROLL_LEADER_KEY);
    // Only renew if we're still the leader
    if (currentLeader) {
      await redis.expire(BANKROLL_LEADER_KEY, BANKROLL_LEADER_TTL);
      // console.log(`🔄 Bankroll leadership renewed`);
    } else {
      // Leadership lost, try to regain
      console.log(`🏛️ Bankroll leadership lost, attempting re-election`);
      isBankrollLeader = false;
      await electBankrollLeader();
    }
  } catch (error) {
    console.error('Bankroll leadership renewal failed:', error.message);
    isBankrollLeader = false;
  }
}

function startPriceUpdater() {
  if (priceUpdateInterval) return; // Already running
  
  console.log(`🚀 Starting price updater as leader`);
  updatePriceInBackground(); // Immediate update
  priceUpdateInterval = setInterval(updatePriceInBackground, 10000);
}

function stopPriceUpdater() {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
    priceUpdateInterval = null;
    console.log(`🛑 Stopped price updater (not leader)`);
  }
}

// Bankroll leader election functions
async function electBankrollLeader() {
  const instanceId = crypto.randomUUID();
  
  try {
    // Try to become bankroll leader
    const becameLeader = await redis.set(BANKROLL_LEADER_KEY, instanceId, { ex: BANKROLL_LEADER_TTL, nx: true });
    
    if (becameLeader) {
      isBankrollLeader = true;
      console.log(`🏛️ Became bankroll update leader: ${instanceId.substring(0, 8)}`);
      startBankrollUpdater();
    } else {
      isBankrollLeader = false;
      const currentLeader = await redis.get(BANKROLL_LEADER_KEY);
      // console.log(`⚡ Another instance is bankroll leader: ${currentLeader?.substring(0, 8) || 'unknown'}`);
      stopBankrollUpdater();
    }
  } catch (error) {
    console.error('Bankroll leader election failed:', error.message);
  }
}

function startBankrollUpdater() {
  if (bankrollUpdateInterval) return; // Already running
  
  // console.log('🏛️ Starting bankroll updater (60s intervals)');
  bankrollUpdateInterval = setInterval(updateBankrollInBackground, 60000); // 60 seconds
  
  // Do initial update immediately
  updateBankrollInBackground();
}

function stopBankrollUpdater() {
  if (bankrollUpdateInterval) {
    clearInterval(bankrollUpdateInterval);
    bankrollUpdateInterval = null;
    console.log('🛑 Stopped bankroll updater');
  }
}

// User reconciliation leader election functions
async function electReconciliationLeader() {
  const instanceId = crypto.randomUUID();
  
  try {
    // Try to become reconciliation leader
    const becameLeader = await redis.set(RECONCILIATION_LEADER_KEY, instanceId, { ex: RECONCILIATION_LEADER_TTL, nx: true });
    
    if (becameLeader) {
      isReconciliationLeader = true;
      console.log(`👥 Became reconciliation leader: ${instanceId.substring(0, 8)}`);
      scheduleReconciliation();
    } else {
      isReconciliationLeader = false;
      const currentLeader = await redis.get(RECONCILIATION_LEADER_KEY);
      // console.log(`⚡ Another instance is reconciliation leader: ${currentLeader?.substring(0, 8) || 'unknown'}`);
      stopReconciliation();
    }
  } catch (error) {
    console.error('Reconciliation leader election failed:', error.message);
  }
}

async function renewReconciliationLeadership() {
  if (!isReconciliationLeader) return;
  
  try {
    const currentLeader = await redis.get(RECONCILIATION_LEADER_KEY);
    // Only renew if we're still the leader
    if (currentLeader) {
      await redis.expire(RECONCILIATION_LEADER_KEY, RECONCILIATION_LEADER_TTL);
      console.log(`🔄 Reconciliation leadership renewed`);
    } else {
      // Leadership lost, try to regain
      console.log(`👥 Reconciliation leadership lost, attempting re-election`);
      isReconciliationLeader = false;
      await electReconciliationLeader();
    }
  } catch (error) {
    console.error('Reconciliation leadership renewal failed:', error.message);
    isReconciliationLeader = false;
  }
}

function scheduleReconciliation() {
  if (reconciliationTimeout) return; // Already scheduled
  
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0); // Next hour at :00:00
  
  const timeUntilNextHour = nextHour.getTime() - now.getTime();
  
  console.log(`👥 Scheduling user reconciliation for ${nextHour.toISOString()} (in ${Math.round(timeUntilNextHour / 1000 / 60)} minutes)`);
  
  // Set timeout for the next hour boundary
  reconciliationTimeout = setTimeout(() => {
    if (isReconciliationLeader) {
      runUserReconciliation(); // Run the reconciliation
      
      // Schedule the next one in exactly 1 hour
      reconciliationTimeout = setInterval(() => {
        if (isReconciliationLeader) {
          runUserReconciliation();
        }
      }, 60 * 60 * 1000); // 1 hour
    }
  }, timeUntilNextHour);
}

function stopReconciliation() {
  if (reconciliationTimeout) {
    clearTimeout(reconciliationTimeout);
    clearInterval(reconciliationTimeout);
    reconciliationTimeout = null;
    console.log('🛑 Stopped reconciliation scheduler');
  }
}

// Bankroll safety leader election functions
async function electBankrollSafetyLeader() {
  const instanceId = crypto.randomUUID();
  
  try {
    // Try to become bankroll safety leader
    const becameLeader = await redis.set(BANKROLL_SAFETY_LEADER_KEY, instanceId, { ex: BANKROLL_SAFETY_LEADER_TTL, nx: true });
    
    if (becameLeader) {
      isBankrollSafetyLeader = true;
      console.log(`🛡️ Became bankroll safety leader: ${instanceId.substring(0, 8)}`);
      startBankrollSafetyMonitor();
    } else {
      isBankrollSafetyLeader = false;
      const currentLeader = await redis.get(BANKROLL_SAFETY_LEADER_KEY);
      // console.log(`⚡ Another instance is bankroll safety leader: ${currentLeader?.substring(0, 8) || 'unknown'}`);
      stopBankrollSafetyMonitor();
    }
  } catch (error) {
    console.error('Bankroll safety leader election failed:', error.message);
  }
}

async function renewBankrollSafetyLeadership() {
  if (!isBankrollSafetyLeader) return;
  
  try {
    const currentLeader = await redis.get(BANKROLL_SAFETY_LEADER_KEY);
    // Only renew if we're still the leader
    if (currentLeader) {
      await redis.expire(BANKROLL_SAFETY_LEADER_KEY, BANKROLL_SAFETY_LEADER_TTL);
      console.log(`🔄 Bankroll safety leadership renewed`);
    } else {
      // Leadership lost, try to regain
      console.log(`🛡️ Bankroll safety leadership lost, attempting re-election`);
      isBankrollSafetyLeader = false;
      await electBankrollSafetyLeader();
    }
  } catch (error) {
    console.error('Bankroll safety leadership renewal failed:', error.message);
    isBankrollSafetyLeader = false;
  }
}

function startBankrollSafetyMonitor() {
  if (bankrollSafetyUpdateInterval) return; // Already running
  
  console.log('🛡️ Starting bankroll safety monitor (10 minute intervals)');
  bankrollSafetyUpdateInterval = setInterval(monitorBankrollSafety, 10 * 60 * 1000); // 10 minutes
  
  // Do initial check immediately
  monitorBankrollSafety();
}

function stopBankrollSafetyMonitor() {
  if (bankrollSafetyUpdateInterval) {
    clearInterval(bankrollSafetyUpdateInterval);
    bankrollSafetyUpdateInterval = null;
    console.log('🛑 Stopped bankroll safety monitor');
  }
}

// Profit/Loss monitor leader election functions
async function electProfitLossLeader() {
  const instanceId = crypto.randomUUID();
  
  try {
    // Try to become profit/loss leader
    const becameLeader = await redis.set(PROFIT_LOSS_LEADER_KEY, instanceId, { ex: PROFIT_LOSS_LEADER_TTL, nx: true });
    
    if (becameLeader) {
      isProfitLossLeader = true;
      console.log(`📊 Became profit/loss leader: ${instanceId.substring(0, 8)}`);
      startProfitLossMonitor();
    } else {
      isProfitLossLeader = false;
      const currentLeader = await redis.get(PROFIT_LOSS_LEADER_KEY);
      // console.log(`⚡ Another instance is profit/loss leader: ${currentLeader?.substring(0, 8) || 'unknown'}`);
      stopProfitLossMonitor();
    }
  } catch (error) {
    console.error('Profit/loss leader election failed:', error.message);
  }
}

async function renewProfitLossLeadership() {
  if (!isProfitLossLeader) return;
  
  try {
    const currentLeader = await redis.get(PROFIT_LOSS_LEADER_KEY);
    // Only renew if we're still the leader
    if (currentLeader) {
      await redis.expire(PROFIT_LOSS_LEADER_KEY, PROFIT_LOSS_LEADER_TTL);
      console.log(`🔄 Profit/loss leadership renewed`);
    } else {
      // Leadership lost, try to regain
      console.log(`📊 Profit/loss leadership lost, attempting re-election`);
      isProfitLossLeader = false;
      await electProfitLossLeader();
    }
  } catch (error) {
    console.error('Profit/loss leadership renewal failed:', error.message);
    isProfitLossLeader = false;
  }
}

function startProfitLossMonitor() {
  if (profitLossUpdateInterval) return; // Already running
  
  console.log('📊 Starting profit/loss monitor (hourly intervals)');
  profitLossUpdateInterval = setInterval(monitorProfitLossRatio, 60 * 60 * 1000); // 1 hour
  
  // Do initial check immediately
  monitorProfitLossRatio();
}

function stopProfitLossMonitor() {
  if (profitLossUpdateInterval) {
    clearInterval(profitLossUpdateInterval);
    profitLossUpdateInterval = null;
    console.log('🛑 Stopped profit/loss monitor');
  }
}

// Gem fairness monitor leader election functions
async function electGemFairnessLeader() {
  const instanceId = crypto.randomUUID();
  
  try {
    // Try to become gem fairness leader
    const becameLeader = await redis.set(GEM_FAIRNESS_LEADER_KEY, instanceId, { ex: GEM_FAIRNESS_LEADER_TTL, nx: true });
    
    if (becameLeader) {
      isGemFairnessLeader = true;
      console.log(`💎 Became gem fairness leader: ${instanceId.substring(0, 8)}`);
      startGemFairnessMonitor();
    } else {
      isGemFairnessLeader = false;
      const currentLeader = await redis.get(GEM_FAIRNESS_LEADER_KEY);
      // console.log(`⚡ Another instance is gem fairness leader: ${currentLeader?.substring(0, 8) || 'unknown'}`);
      stopGemFairnessMonitor();
    }
  } catch (error) {
    console.error('Gem fairness leader election failed:', error.message);
  }
}

async function renewGemFairnessLeadership() {
  if (!isGemFairnessLeader) return;
  
  try {
    const currentLeader = await redis.get(GEM_FAIRNESS_LEADER_KEY);
    // Only renew if we're still the leader
    if (currentLeader) {
      await redis.expire(GEM_FAIRNESS_LEADER_KEY, GEM_FAIRNESS_LEADER_TTL);
      console.log(`🔄 Gem fairness leadership renewed`);
    } else {
      // Leadership lost, try to regain
      console.log(`💎 Gem fairness leadership lost, attempting re-election`);
      isGemFairnessLeader = false;
      await electGemFairnessLeader();
    }
  } catch (error) {
    console.error('Gem fairness leadership renewal failed:', error.message);
    isGemFairnessLeader = false;
  }
}

function startGemFairnessMonitor() {
  if (gemFairnessUpdateInterval) return; // Already running
  
  console.log('💎 Starting gem fairness monitor (2-hour intervals)');
  gemFairnessUpdateInterval = setInterval(monitorGemFairness, 2 * 60 * 60 * 1000); // 2 hours
  
  // Do initial check immediately
  monitorGemFairness();
}

function stopGemFairnessMonitor() {
  if (gemFairnessUpdateInterval) {
    clearInterval(gemFairnessUpdateInterval);
    gemFairnessUpdateInterval = null;
    console.log('🛑 Stopped gem fairness monitor');
  }
}

async function updatePriceInBackground() {
  // Only update if we're the leader
  if (!isLeader) {
    console.log(`⏭️ Price update skipped - not the leader`);
    return;
  }
  
  try {
    let price = null;
    let source = null;

    // Try Pyth first (primary oracle)
    try {
      price = await getPythPrice();
      source = 'pyth';
      priceUpdaterStats.sourceStats.pyth.success++;
    } catch (pythErr) {
      priceUpdaterStats.sourceStats.pyth.failure++;
      console.warn('Background Pyth price fetch failed:', pythErr.message);
      
      // Try Chainlink fallback
      try {
        price = await getChainlinkPrice();
        source = 'chainlink';
        priceUpdaterStats.sourceStats.chainlink.success++;
      } catch (chainlinkErr) {
        priceUpdaterStats.sourceStats.chainlink.failure++;
        console.warn('Background Chainlink price fetch failed:', chainlinkErr.message);
        
        // Try CoinGecko fallback
        try {
          price = await getCoinGeckoPrice();
          source = 'coingecko';
          priceUpdaterStats.sourceStats.coingecko.success++;
        } catch (cgErr) {
          priceUpdaterStats.sourceStats.coingecko.failure++;
          throw new Error(`All price sources failed: Pyth(${pythErr.message}), Chainlink(${chainlinkErr.message}), CoinGecko(${cgErr.message})`);
        }
      }
    }

    if (price && price > 0) {
      // Update unified cache system via Redis (shared-utils.js will pick this up)
      try {
        await redis.set(REDIS_PRICE_KEY, price, { ex: 65 });
      } catch (redisErr) {
        console.warn('Failed to update Redis price cache:', redisErr.message);
      }

      // Store in Supabase for persistent fallback
      try {
        await supabase
          .from('price_history')
          .insert({ 
            price: price, 
            source: source,
            created_at: new Date().toISOString()
          });
      } catch (supabaseErr) {
        console.warn('Failed to store price in Supabase:', supabaseErr.message);
      }

      // Update stats
      priceUpdaterStats.updateCount++;
      priceUpdaterStats.consecutiveFailures = 0;
      priceUpdaterStats.lastUpdateTime = new Date().toISOString();
      priceUpdaterStats.lastPrice = price;
      priceUpdaterStats.healthStatus = 'healthy';
      
      // console.log(`💰 Price updated from ${source}: $${price.toFixed(4)} (update #${priceUpdaterStats.updateCount})`);
    } else {
      throw new Error('Invalid price received');
    }
    
  } catch (error) {
    priceUpdaterStats.failureCount++;
    priceUpdaterStats.consecutiveFailures++;
    
    if (priceUpdaterStats.consecutiveFailures >= 3) {
      priceUpdaterStats.healthStatus = 'degraded';
      console.error(`🚨 Price updater degraded: ${priceUpdaterStats.consecutiveFailures} consecutive failures. Latest error:`, error.message);
    } else {
      console.warn(`⚠️ Price update failed (${priceUpdaterStats.consecutiveFailures}/3):`, error.message);
    }
  }
}

async function updateBankrollInBackground() {
  // Only update if we're the bankroll leader
  if (!isBankrollLeader) {
    console.log(`⏭️ Bankroll update skipped - not the leader`);
    return;
  }
  
  try {
    // Use same RPC selection logic as getSolanaBalance
    const isDevelopment = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
    const defaultRpcUrl = isDevelopment 
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com';
    
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 
                   process.env.SOLANA_RPC_URL || 
                   defaultRpcUrl;
    
    // Determine network from URL
    const network = rpcUrl.includes('devnet') || rpcUrl.includes('testnet') 
      ? 'devnet' 
      : 'mainnet';
    const rpcProvider = rpcUrl.includes('helius') ? 'Helius' : 'Default';
    
    // console.log(`🏛️ Starting bankroll value update on ${network} via ${rpcProvider}...`);
    
    // Fetch SOL balance from the bankroll wallet
    const balanceSol = await getSolanaBalance(BANKROLL_WALLET_ADDRESS);
    // console.log(`🔍 Bankroll SOL balance on ${network} via ${rpcProvider}: ${balanceSol.toFixed(4)} SOL`);
    
    // Get current SOL price (using existing price system)
    const solPrice = await getSolToUsdRate();
    // console.log(`💰 Current SOL price: $${solPrice.toFixed(4)}`);
    
    // Calculate USD value
    const bankrollUsd = balanceSol * solPrice;
    
    if (bankrollUsd >= 0) {
      // Update Redis cache
      try {
        await redis.set(REDIS_BANKROLL_KEY, bankrollUsd, { ex: 65 });
        // console.log(`✅ Updated bankroll cache: $${bankrollUsd.toFixed(2)}`);
      } catch (redisErr) {
        console.warn('Failed to update Redis bankroll cache:', redisErr.message);
      }

      // Store in Supabase for persistent fallback (create table if needed)
      try {
        await supabase
          .from('bankroll_history')
          .insert({ 
            balance_sol: balanceSol,
            balance_usd: bankrollUsd,
            sol_price: solPrice,
            wallet_address: BANKROLL_WALLET_ADDRESS,
            network: network,
            created_at: new Date().toISOString()
          });
      } catch (supabaseErr) {
        console.warn('Failed to store bankroll in Supabase (table may not exist):', supabaseErr.message);
      }

      // Update stats
      bankrollUpdaterStats.updateCount++;
      bankrollUpdaterStats.consecutiveFailures = 0;
      bankrollUpdaterStats.lastUpdateTime = new Date().toISOString();
      bankrollUpdaterStats.lastBankrollUsd = bankrollUsd;
      bankrollUpdaterStats.lastSolBalance = balanceSol;
      bankrollUpdaterStats.healthStatus = 'healthy';
      
      // console.log(`🏛️ Bankroll updated on ${network} via ${rpcProvider}: ${balanceSol.toFixed(4)} SOL = $${bankrollUsd.toFixed(2)} (update #${bankrollUpdaterStats.updateCount})`);
    } else {
      throw new Error('Invalid bankroll value calculated');
    }
    
  } catch (error) {
    bankrollUpdaterStats.failureCount++;
    bankrollUpdaterStats.consecutiveFailures++;
    
    if (bankrollUpdaterStats.consecutiveFailures >= 3) {
      bankrollUpdaterStats.healthStatus = 'degraded';
      console.error(`🚨 Bankroll updater degraded: ${bankrollUpdaterStats.consecutiveFailures} consecutive failures. Latest error:`, error.message);
    } else {
      console.warn(`⚠️ Bankroll update failed (${bankrollUpdaterStats.consecutiveFailures}/3):`, error.message);
    }
  }
}

async function runUserReconciliation() {
  // Only run if we're the reconciliation leader
  if (!isReconciliationLeader) {
    console.log(`⏭️ User reconciliation skipped - not the leader`);
    return;
  }
  
  await performUserReconciliation('scheduled');
}

async function runUserReconciliationManual() {
  // Manual trigger bypasses leader election
  await performUserReconciliation('manual');
}

// Discord webhook configuration
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1401215152854007899/1jcn9xshKikrLuKOhcm3BK_Nv4-dH1-K0E9tc3pSFDRlvD5tySQ_1DCvh1eAl4Y9fcJp';

async function monitorBankrollSafety() {
  // Only monitor if we're the bankroll safety leader
  if (!isBankrollSafetyLeader) {
    console.log(`⏭️ Bankroll safety check skipped - not the leader`);
    return;
  }
  
  try {
    console.log(`🛡️ Starting bankroll safety check...`);
    
    // Safety threshold calculation: max_bet * max_win * 2
    const MAX_BET_USD = .1; // $1
    const MAX_WIN_MULTIPLIER = 6000; // 6000X
    const SAFETY_FACTOR = 2; // 2x buffer
    const SAFETY_THRESHOLD_USD = MAX_BET_USD * MAX_WIN_MULTIPLIER * SAFETY_FACTOR; // $12,000
    
    // Get current bankroll value
    const currentBankrollUsd = await getBankrollValueUsd();
    
    if (!currentBankrollUsd || currentBankrollUsd <= 0) {
      throw new Error('Failed to fetch bankroll value or received invalid value');
    }
    
    const isSafe = currentBankrollUsd >= SAFETY_THRESHOLD_USD;
    const riskLevel = (currentBankrollUsd / SAFETY_THRESHOLD_USD * 100).toFixed(1);
    
    // Store current check results
    const currentCheck = {
      timestamp: new Date().toISOString(),
      bankrollUsd: currentBankrollUsd,
      safetyThreshold: SAFETY_THRESHOLD_USD,
      isSafe: isSafe,
      riskLevel: parseFloat(riskLevel),
      maxBet: MAX_BET_USD,
      maxWin: MAX_WIN_MULTIPLIER,
      safetyFactor: SAFETY_FACTOR
    };
    
    // Update stats
    bankrollSafetyStats.updateCount++;
    bankrollSafetyStats.consecutiveFailures = 0;
    bankrollSafetyStats.lastUpdateTime = currentCheck.timestamp;
    bankrollSafetyStats.lastCheck = currentCheck;
    bankrollSafetyStats.healthStatus = 'healthy';
    bankrollSafetyStats.currentBankroll = currentBankrollUsd;
    bankrollSafetyStats.safetyThreshold = SAFETY_THRESHOLD_USD;
    bankrollSafetyStats.isSafe = isSafe;
    
    // Store results in Redis with 20-minute TTL (longer than 10-minute intervals)
    const REDIS_BANKROLL_SAFETY_KEY = 'bankroll_safety_check';
    try {
      await redis.set(REDIS_BANKROLL_SAFETY_KEY, JSON.stringify(currentCheck), { ex: 1200 }); // 20 minutes
      console.log(`✅ Stored bankroll safety results in Redis`);
    } catch (redisErr) {
      console.warn('Failed to store bankroll safety in Redis:', redisErr.message);
    }
    
    // Send Discord alert if bankroll is below threshold
    if (!isSafe) {
      await sendBankrollSafetyAlert(currentCheck);
      bankrollSafetyStats.alertsSent++;
    }
    
    console.log(`🛡️ Bankroll safety check completed: $${currentBankrollUsd.toFixed(2)} / $${SAFETY_THRESHOLD_USD.toFixed(2)} (${riskLevel}%) - ${isSafe ? 'SAFE' : 'UNSAFE'}`);
    
  } catch (error) {
    bankrollSafetyStats.failureCount++;
    bankrollSafetyStats.consecutiveFailures++;
    
    if (bankrollSafetyStats.consecutiveFailures >= 3) {
      bankrollSafetyStats.healthStatus = 'degraded';
      console.error(`🚨 Bankroll safety monitor degraded: ${bankrollSafetyStats.consecutiveFailures} consecutive failures. Latest error:`, error.message);
    } else {
      console.warn(`⚠️ Bankroll safety check failed (${bankrollSafetyStats.consecutiveFailures}/3):`, error.message);
    }
  }
}

async function monitorProfitLossRatio() {
  // Only monitor if we're the profit/loss leader
  if (!isProfitLossLeader) {
    console.log(`⏭️ Profit/loss check skipped - not the leader`);
    return;
  }
  
  try {
    console.log(`📊 Starting profit/loss ratio check...`);
    
    // Get rolling 24-hour window (not daily reset)
    const now = new Date();
    const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago
    const endTime = now;
    
    console.log(`📅 Analyzing rolling 24h data from ${startTime.toISOString()} to ${endTime.toISOString()}`);
    
    // Expected RTP parameters
    const EXPECTED_RTP_PERCENT = 95; // 95% RTP (5% house edge)
    const HEALTHY_MIN_RTP = 90; // Alert if < 90% (potential bug - house winning too much)
    const HEALTHY_MAX_RTP = 105; // Alert if > 105% (potential exploit - players winning too much)
    const MIN_TRANSACTION_COUNT = 100; // Minimum transactions needed for reliable analysis
    
    // Query total wagers (bets) for rolling 24h window
    const { data: wagerData, error: wagerError } = await supabase
      .rpc('get_daily_wagers', { 
        start_date: startTime.toISOString(),
        end_date: endTime.toISOString()
      });
    
    if (wagerError) {
      // Fallback to direct query if RPC doesn't exist
      const { data: betTransactions, error: betError } = await supabase
        .from('transactions')
        .select('amount_usd')
        .eq('type', 'bet')
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString());
      
      if (betError) throw new Error(`Failed to fetch bet data: ${betError.message}`);
      
      const totalWagersUsd = betTransactions?.reduce((sum, bet) => sum + Math.abs(bet.amount_usd || 0), 0) || 0;
      
      // Query total payouts (wins) for rolling 24h window
      const { data: winTransactions, error: winError } = await supabase
        .from('transactions')
        .select('amount_usd')
        .eq('type', 'win')
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString());
      
      if (winError) throw new Error(`Failed to fetch win data: ${winError.message}`);
      
      const totalPayoutsUsd = winTransactions?.reduce((sum, win) => sum + Math.abs(win.amount_usd || 0), 0) || 0;
      
      var dailyStats = {
        totalWagers: totalWagersUsd,
        totalPayouts: totalPayoutsUsd,
        transactionCount: (betTransactions?.length || 0) + (winTransactions?.length || 0)
      };
    } else {
      var dailyStats = wagerData[0] || { totalWagers: 0, totalPayouts: 0, transactionCount: 0 };
    }
    
    // Calculate actual RTP
    const actualRtpPercent = dailyStats.totalWagers > 0 
      ? (dailyStats.totalPayouts / dailyStats.totalWagers) * 100 
      : 0;
    
    // Check if we have enough data for reliable analysis
    const hasEnoughData = dailyStats.transactionCount >= MIN_TRANSACTION_COUNT;
    
    // Determine health status
    let isHealthy = true;
    let alertType = null;
    let alertSeverity = 'normal';
    const deviationFromExpected = actualRtpPercent - EXPECTED_RTP_PERCENT;
    
    if (!hasEnoughData) {
      // Insufficient data - don't trigger alerts
      alertType = 'insufficient_data';
      alertSeverity = 'info';
      console.log(`📊 Insufficient data for analysis: ${dailyStats.transactionCount} transactions (need ${MIN_TRANSACTION_COUNT}+)`);
    } else {
      // Enough data - perform normal health checks
      isHealthy = actualRtpPercent >= HEALTHY_MIN_RTP && actualRtpPercent <= HEALTHY_MAX_RTP;
      
      if (actualRtpPercent < HEALTHY_MIN_RTP) {
        alertType = 'house_winning_too_much';
        alertSeverity = 'critical';
      } else if (actualRtpPercent > HEALTHY_MAX_RTP) {
        alertType = 'players_winning_too_much';
        alertSeverity = 'critical';
      } else if (Math.abs(deviationFromExpected) > 3) {
        alertType = 'significant_deviation';
        alertSeverity = 'warning';
      }
    }
    
    // Store current check results
    const currentCheck = {
      timestamp: new Date().toISOString(),
      analysisWindow: `Rolling 24h (${startTime.toISOString()} to ${endTime.toISOString()})`,
      totalWagersUsd: dailyStats.totalWagers,
      totalPayoutsUsd: dailyStats.totalPayouts,
      transactionCount: dailyStats.transactionCount,
      actualRtpPercent: actualRtpPercent,
      expectedRtpPercent: EXPECTED_RTP_PERCENT,
      deviationPercent: deviationFromExpected,
      isHealthy: isHealthy,
      hasEnoughData: hasEnoughData,
      minTransactionThreshold: MIN_TRANSACTION_COUNT,
      alertType: alertType,
      alertSeverity: alertSeverity,
      houseEdgePercent: 100 - actualRtpPercent,
      healthyRange: {
        min: HEALTHY_MIN_RTP,
        max: HEALTHY_MAX_RTP
      }
    };
    
    // Update stats
    profitLossStats.updateCount++;
    profitLossStats.consecutiveFailures = 0;
    profitLossStats.lastUpdateTime = currentCheck.timestamp;
    profitLossStats.lastCheck = currentCheck;
    profitLossStats.healthStatus = 'healthy';
    profitLossStats.currentRtp = actualRtpPercent;
    profitLossStats.expectedRtp = EXPECTED_RTP_PERCENT;
    profitLossStats.isHealthy = isHealthy;
    
    // Store results in Redis with 90-minute TTL (longer than 1-hour intervals)
    const REDIS_PROFIT_LOSS_KEY = 'profit_loss_check';
    try {
      await redis.set(REDIS_PROFIT_LOSS_KEY, JSON.stringify(currentCheck), { ex: 5400 }); // 90 minutes
      console.log(`✅ Stored profit/loss results in Redis`);
    } catch (redisErr) {
      console.warn('Failed to store profit/loss in Redis:', redisErr.message);
    }
    
    // Send Discord alert only for real issues (not insufficient data)
    if (hasEnoughData && (!isHealthy || (alertType && alertType !== 'insufficient_data'))) {
      await sendProfitLossAlert(currentCheck);
      profitLossStats.alertsSent++;
    }
    
    console.log(`📊 Profit/loss check completed: $${dailyStats.totalWagers.toFixed(2)} wagered, $${dailyStats.totalPayouts.toFixed(2)} paid out, ${actualRtpPercent.toFixed(2)}% RTP - ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    
  } catch (error) {
    profitLossStats.failureCount++;
    profitLossStats.consecutiveFailures++;
    
    if (profitLossStats.consecutiveFailures >= 3) {
      profitLossStats.healthStatus = 'degraded';
      console.error(`🚨 Profit/loss monitor degraded: ${profitLossStats.consecutiveFailures} consecutive failures. Latest error:`, error.message);
    } else {
      console.warn(`⚠️ Profit/loss check failed (${profitLossStats.consecutiveFailures}/3):`, error.message);
    }
  }
}

async function sendProfitLossAlert(checkData) {
  try {
    const alertColors = {
      house_winning_too_much: 0xff0000, // Red - critical bug
      players_winning_too_much: 0xff6600, // Orange - potential exploit  
      significant_deviation: 0xffaa00, // Yellow - warning
      normal: 0x00ff00 // Green - healthy
    };
    
    const color = alertColors[checkData.alertType] || alertColors.normal;
    
    let alertTitle = '📊 Profit/Loss Ratio Alert';
    let alertDescription = '';
    
    switch (checkData.alertType) {
      case 'house_winning_too_much':
        alertTitle = '🚨 CRITICAL: House Winning Too Much';
        alertDescription = `**POTENTIAL BUG DETECTED**\n\nRTP is ${checkData.actualRtpPercent.toFixed(2)}% (< 90%), indicating the house may be winning excessively. This could indicate a bug in game logic.`;
        break;
      case 'players_winning_too_much':
        alertTitle = '🚨 CRITICAL: Players Winning Too Much';
        alertDescription = `**POTENTIAL EXPLOIT DETECTED**\n\nRTP is ${checkData.actualRtpPercent.toFixed(2)}% (> 105%), indicating players are winning more than expected. This could indicate an exploit or manipulation.`;
        break;
      case 'significant_deviation':
        alertTitle = '⚠️ WARNING: Significant RTP Deviation';
        alertDescription = `**UNUSUAL ACTIVITY DETECTED**\n\nRTP is ${checkData.actualRtpPercent.toFixed(2)}%, deviating ${Math.abs(checkData.deviationPercent).toFixed(2)}% from expected ${checkData.expectedRtpPercent}%.`;
        break;
      default:
        alertTitle = '📊 Daily P/L Report';
        alertDescription = `Daily profit/loss analysis completed.`;
    }
    
    // Create alert embed
    const embed = {
      title: alertTitle,
      description: alertDescription,
      color: color,
      fields: [
        {
          name: '📈 Daily Performance',
          value: `**Total Wagers:** $${checkData.totalWagersUsd.toFixed(2)}\n**Total Payouts:** $${checkData.totalPayoutsUsd.toFixed(2)}\n**Transaction Count:** ${checkData.transactionCount}`,
          inline: true
        },
        {
          name: '🎯 RTP Analysis',
          value: `**Actual RTP:** ${checkData.actualRtpPercent.toFixed(2)}%\n**Expected RTP:** ${checkData.expectedRtpPercent}%\n**Deviation:** ${checkData.deviationPercent >= 0 ? '+' : ''}${checkData.deviationPercent.toFixed(2)}%`,
          inline: true
        },
        {
          name: '🏠 House Edge',
          value: `**Actual Edge:** ${checkData.houseEdgePercent.toFixed(2)}%\n**Expected Edge:** ${100 - checkData.expectedRtpPercent}%\n**Healthy Range:** ${checkData.healthyRange.min}% - ${checkData.healthyRange.max}% RTP`,
          inline: false
        }
      ],
      footer: {
        text: 'Profit/Loss Ratio Monitor',
        icon_url: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bitcoin/bitcoin-original.svg'
      },
      timestamp: checkData.timestamp
    };

    // Add action recommendations for critical alerts
    if (checkData.alertSeverity === 'critical') {
      let actionText = '';
      if (checkData.alertType === 'house_winning_too_much') {
        actionText = '🔴 **IMMEDIATE ACTION:** Review game logic, RNG, and payout calculations for bugs';
      } else if (checkData.alertType === 'players_winning_too_much') {
        actionText = '🔴 **IMMEDIATE ACTION:** Investigate for potential exploits, review game sessions, and consider temporary restrictions';
      }
      
      if (actionText) {
        embed.fields.push({
          name: '⚠️ Recommended Actions',
          value: actionText,
          inline: false
        });
      }
    }

    // Send webhook
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'Profit/Loss Monitor',
        avatar_url: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bitcoin/bitcoin-original.svg',
        embeds: [embed]
      })
    });

    if (response.ok) {
      console.log(`📢 Profit/loss alert sent to Discord - RTP: ${checkData.actualRtpPercent.toFixed(2)}% (${checkData.alertType || 'normal'})`);
    } else {
      const errorText = await response.text();
      console.error('📢 Discord profit/loss webhook failed:', response.status, errorText);
    }

  } catch (error) {
    console.error('📢 Profit/loss Discord notification error:', error.message);
  }
}

async function monitorGemFairness() {
  // Only monitor if we're the gem fairness leader
  if (!isGemFairnessLeader) {
    console.log(`⏭️ Gem fairness check skipped - not the leader`);
    return;
  }
  
  try {
    console.log(`💎 Starting gem fairness analysis...`);
    
    // Gem drop rates per 0.1 SOL wagered (as percentages)
    const GEM_DROP_RATES = {
      'Garnet': { rate: 15.0, rarity: 'Common', threshold: 0.1 }, // 15%
      'Amethyst': { rate: 8.0, rarity: 'Uncommon', threshold: 0.1 }, // 8%
      'Topaz': { rate: 4.0, rarity: 'Rare', threshold: 0.1 }, // 4%
      'Sapphire': { rate: 2.0, rarity: 'Epic', threshold: 0.1 }, // 2%
      'Emerald': { rate: 0.7, rarity: 'Legendary', threshold: 0.1 }, // 0.7%
      'Ruby': { rate: 0.2, rarity: 'Mythic', threshold: 0.1 }, // 0.2%
      'Diamond': { rate: 0.1, rarity: 'Exotic', threshold: 0.1 } // 0.1%
    };
    
    const WAGER_THRESHOLD_SOL = 2.0; // Only analyze users with 2+ SOL wagered
    const FAIRNESS_TOLERANCE = 2.0; // Alert if 2x over/under expected
    
    // Query users with significant wagers and their gem collections
    const { data: eligibleUsers, error: usersError } = await supabase
      .from('users')
      .select(`
        id,
        wallet_address,
        total_wagered_sol,
        gem_collection
      `)
      .gte('total_wagered_sol', WAGER_THRESHOLD_SOL)
      .not('gem_collection', 'is', null)
      .order('total_wagered_sol', { ascending: false });
    
    if (usersError) {
      throw new Error(`Failed to fetch eligible users: ${usersError.message}`);
    }
    
    if (!eligibleUsers || eligibleUsers.length === 0) {
      console.log('💎 No eligible users found for gem fairness analysis');
      return;
    }
    
    console.log(`💎 Analyzing ${eligibleUsers.length} users with ${WAGER_THRESHOLD_SOL}+ SOL wagered`);
    
    const analysisResults = [];
    const unfairUsers = [];
    
    // Analyze each user's gem drop rates
    for (const user of eligibleUsers) {
      try {
        const totalWageredSol = user.total_wagered_sol || 0;
        const gemCollection = user.gem_collection || {};
        
        // Calculate expected drops based on total wagers
        const expectedDrops = {};
        const actualDrops = {};
        const dropAnalysis = {};
        
        // Calculate drops per 0.1 SOL increment
        const dropOpportunities = Math.floor(totalWageredSol / 0.1);
        
        let hasUnfairness = false;
        let maxDeviationGem = null;
        let maxDeviationRatio = 0;
        
        for (const [gemName, gemInfo] of Object.entries(GEM_DROP_RATES)) {
          // Expected drops = opportunities × drop rate
          const expectedCount = dropOpportunities * (gemInfo.rate / 100);
          const actualCount = gemCollection[gemName] || 0;
          
          expectedDrops[gemName] = expectedCount;
          actualDrops[gemName] = actualCount;
          
          // Calculate deviation ratio (actual / expected)
          const deviationRatio = expectedCount > 0 ? actualCount / expectedCount : (actualCount > 0 ? 999 : 1);
          
          // Check if deviation exceeds tolerance
          const isUnfair = deviationRatio >= FAIRNESS_TOLERANCE || deviationRatio <= (1 / FAIRNESS_TOLERANCE);
          
          if (isUnfair) {
            hasUnfairness = true;
            if (Math.abs(deviationRatio - 1) > Math.abs(maxDeviationRatio - 1)) {
              maxDeviationGem = gemName;
              maxDeviationRatio = deviationRatio;
            }
          }
          
          dropAnalysis[gemName] = {
            expected: expectedCount,
            actual: actualCount,
            deviation: deviationRatio,
            isUnfair: isUnfair,
            rarity: gemInfo.rarity
          };
        }
        
        const userAnalysis = {
          userId: user.id,
          walletAddress: user.wallet_address,
          totalWageredSol: totalWageredSol,
          dropOpportunities: dropOpportunities,
          expectedDrops: expectedDrops,
          actualDrops: actualDrops,
          dropAnalysis: dropAnalysis,
          hasUnfairness: hasUnfairness,
          maxDeviationGem: maxDeviationGem,
          maxDeviationRatio: maxDeviationRatio
        };
        
        analysisResults.push(userAnalysis);
        
        if (hasUnfairness) {
          unfairUsers.push(userAnalysis);
        }
        
      } catch (error) {
        console.warn(`💎 Failed to analyze user ${user.id}:`, error.message);
      }
    }
    
    // Calculate summary statistics
    const totalUnfairUsers = unfairUsers.length;
    const fairnessPercentage = ((eligibleUsers.length - totalUnfairUsers) / eligibleUsers.length) * 100;
    
    // Aggregate gem statistics
    const gemStatistics = {};
    for (const gemName of Object.keys(GEM_DROP_RATES)) {
      let totalExpected = 0;
      let totalActual = 0;
      let unfairCount = 0;
      
      for (const result of analysisResults) {
        totalExpected += result.expectedDrops[gemName] || 0;
        totalActual += result.actualDrops[gemName] || 0;
        if (result.dropAnalysis[gemName].isUnfair) {
          unfairCount++;
        }
      }
      
      gemStatistics[gemName] = {
        totalExpected: totalExpected,
        totalActual: totalActual,
        overallDeviation: totalExpected > 0 ? totalActual / totalExpected : 1,
        unfairUserCount: unfairCount,
        rarity: GEM_DROP_RATES[gemName].rarity
      };
    }
    
    // Store current check results
    const currentCheck = {
      timestamp: new Date().toISOString(),
      totalUsersAnalyzed: eligibleUsers.length,
      unfairUsers: totalUnfairUsers,
      fairnessPercentage: fairnessPercentage,
      wagerThreshold: WAGER_THRESHOLD_SOL,
      fairnessTolerance: FAIRNESS_TOLERANCE,
      gemStatistics: gemStatistics,
      isHealthy: totalUnfairUsers === 0,
      topUnfairUsers: unfairUsers.slice(0, 10) // Store top 10 for alerts
    };
    
    // Update stats
    gemFairnessStats.updateCount++;
    gemFairnessStats.consecutiveFailures = 0;
    gemFairnessStats.lastUpdateTime = currentCheck.timestamp;
    gemFairnessStats.lastCheck = currentCheck;
    gemFairnessStats.healthStatus = 'healthy';
    gemFairnessStats.totalUsersAnalyzed = eligibleUsers.length;
    gemFairnessStats.unfairUsers = totalUnfairUsers;
    
    // Store results in Redis with 3-hour TTL (longer than 2-hour intervals)
    const REDIS_GEM_FAIRNESS_KEY = 'gem_fairness_check';
    try {
      await redis.set(REDIS_GEM_FAIRNESS_KEY, JSON.stringify(currentCheck), { ex: 10800 }); // 3 hours
      console.log(`✅ Stored gem fairness results in Redis`);
    } catch (redisErr) {
      console.warn('Failed to store gem fairness in Redis:', redisErr.message);
    }
    
    // Send Discord alert if unfairness detected
    if (totalUnfairUsers > 0) {
      await sendGemFairnessAlert(currentCheck);
      gemFairnessStats.alertsSent++;
    }
    
    console.log(`💎 Gem fairness check completed: ${eligibleUsers.length} users analyzed, ${totalUnfairUsers} unfair (${fairnessPercentage.toFixed(1)}% fair)`);
    
  } catch (error) {
    gemFairnessStats.failureCount++;
    gemFairnessStats.consecutiveFailures++;
    
    if (gemFairnessStats.consecutiveFailures >= 3) {
      gemFairnessStats.healthStatus = 'degraded';
      console.error(`🚨 Gem fairness monitor degraded: ${gemFairnessStats.consecutiveFailures} consecutive failures. Latest error:`, error.message);
    } else {
      console.warn(`⚠️ Gem fairness check failed (${gemFairnessStats.consecutiveFailures}/3):`, error.message);
    }
  }
}

async function sendGemFairnessAlert(checkData) {
  try {
    const severityColor = checkData.unfairUsers > 10 ? 0xff0000 : (checkData.unfairUsers > 5 ? 0xff6600 : 0xffaa00);
    
    // Create alert embed
    const embed = {
      title: '💎 Gem Drop Fairness Alert',
      description: `**FAIRNESS ISSUE DETECTED**\n\n${checkData.unfairUsers} users out of ${checkData.totalUsersAnalyzed} analyzed show unfair gem drop patterns (${checkData.fairnessPercentage.toFixed(1)}% fair).`,
      color: severityColor,
      fields: [
        {
          name: '📊 Analysis Summary',
          value: `**Users Analyzed:** ${checkData.totalUsersAnalyzed}\n**Unfair Users:** ${checkData.unfairUsers}\n**Fairness Rate:** ${checkData.fairnessPercentage.toFixed(1)}%\n**Wager Threshold:** ${checkData.wagerThreshold} SOL`,
          inline: true
        },
        {
          name: '⚙️ Detection Settings',
          value: `**Tolerance:** ${checkData.fairnessTolerance}X deviation\n**Drop Rate:** Per 0.1 SOL wagered\n**Analysis Period:** Every 2 hours`,
          inline: true
        }
      ],
      footer: {
        text: 'Gem Fairness Monitor',
        icon_url: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg'
      },
      timestamp: checkData.timestamp
    };

    // Add gem statistics
    const gemStatsText = Object.entries(checkData.gemStatistics)
      .filter(([_, stats]) => stats.unfairUserCount > 0)
      .slice(0, 5) // Top 5 problematic gems
      .map(([gemName, stats]) => {
        return `**${gemName}** (${stats.rarity}): ${stats.unfairUserCount} users, ${stats.overallDeviation.toFixed(2)}x rate`;
      }).join('\n') || 'No specific gem issues detected';

    embed.fields.push({
      name: '💎 Problematic Gems',
      value: gemStatsText,
      inline: false
    });

    // Add top unfair users (anonymized)
    if (checkData.topUnfairUsers && checkData.topUnfairUsers.length > 0) {
      const userList = checkData.topUnfairUsers.slice(0, 3).map((user, index) => {
        const address = user.walletAddress.substring(0, 8) + '...' + user.walletAddress.slice(-4);
        return `${index + 1}. **${address}** - ${user.totalWageredSol.toFixed(2)} SOL wagered, worst: ${user.maxDeviationGem} (${user.maxDeviationRatio.toFixed(2)}x)`;
      }).join('\n');

      embed.fields.push({
        name: '🔍 Top Unfair Users',
        value: userList,
        inline: false
      });
    }

    // Add action recommendations
    let actionText = '';
    if (checkData.unfairUsers > 10) {
      actionText = '🔴 **CRITICAL:** Review gem drop mechanism and RNG systems immediately';
    } else if (checkData.unfairUsers > 5) {
      actionText = '🟡 **HIGH PRIORITY:** Investigate gem distribution algorithm';
    } else {
      actionText = '🟠 **MONITOR:** Check for patterns and investigate specific users';
    }

    embed.fields.push({
      name: '⚠️ Recommended Actions',
      value: actionText,
      inline: false
    });

    // Send webhook
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'Gem Fairness Monitor',
        avatar_url: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg',
        embeds: [embed]
      })
    });

    if (response.ok) {
      console.log(`📢 Gem fairness alert sent to Discord - ${checkData.unfairUsers} unfair users detected`);
    } else {
      const errorText = await response.text();
      console.error('📢 Discord gem fairness webhook failed:', response.status, errorText);
    }

  } catch (error) {
    console.error('📢 Gem fairness Discord notification error:', error.message);
  }
}

async function sendBankrollSafetyAlert(checkData) {
  try {
    const riskLevelColor = checkData.riskLevel < 50 ? 0xff0000 : (checkData.riskLevel < 80 ? 0xff6600 : 0xffaa00);
    
    // Create alert embed
    const embed = {
      title: '🚨 Bankroll Safety Alert',
      description: `**CRITICAL: Bankroll Below Safety Threshold**\n\nThe house bankroll has fallen below the minimum safe operating level.`,
      color: riskLevelColor,
      fields: [
        {
          name: '💰 Current Status',
          value: `**Current Bankroll:** $${checkData.bankrollUsd.toFixed(2)}\n**Safety Threshold:** $${checkData.safetyThreshold.toFixed(2)}\n**Risk Level:** ${checkData.riskLevel}% of safe amount`,
          inline: true
        },
        {
          name: '⚙️ Safety Parameters',
          value: `**Max Bet:** $${checkData.maxBet}\n**Max Win:** ${checkData.maxWin}X\n**Safety Factor:** ${checkData.safetyFactor}X buffer`,
          inline: true
        },
        {
          name: '🏦 Wallet Information',
          value: `**Address:** \`${BANKROLL_WALLET_ADDRESS.substring(0, 8)}...${BANKROLL_WALLET_ADDRESS.slice(-4)}\`\n**Full Address:** ||${BANKROLL_WALLET_ADDRESS}||`,
          inline: false
        },
        {
          name: '⚠️ Action Required',
          value: checkData.riskLevel < 50 
            ? '🔴 **IMMEDIATE ACTION REQUIRED** - Consider halting operations or reducing max bets'
            : checkData.riskLevel < 80 
            ? '🟡 **HIGH RISK** - Monitor closely and consider adding funds'
            : '🟠 **MODERATE RISK** - Bankroll is below safe threshold',
          inline: false
        }
      ],
      footer: {
        text: 'Bankroll Safety Monitor',
        icon_url: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/solana/solana-original.svg'
      },
      timestamp: checkData.timestamp
    };

    // Send webhook
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'Bankroll Safety Monitor',
        avatar_url: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/solana/solana-original.svg',
        embeds: [embed]
      })
    });

    if (response.ok) {
      console.log(`📢 Bankroll safety alert sent to Discord - Risk Level: ${checkData.riskLevel}%`);
    } else {
      const errorText = await response.text();
      console.error('📢 Discord bankroll safety webhook failed:', response.status, errorText);
    }

  } catch (error) {
    console.error('📢 Bankroll safety Discord notification error:', error.message);
  }
}

async function sendDiscordNotification(summary, issues) {
  try {
    // Only send notifications if there are mismatches or errors
    if (summary.mismatches === 0 && summary.errors === 0) {
      console.log('📢 Discord: No issues found, skipping notification');
      return;
    }

    const totalIssues = summary.mismatches + summary.errors;
    const color = totalIssues === 0 ? 0x00ff00 : (summary.errors > 0 ? 0xff0000 : 0xffa500);
    
    // Determine alert level and emoji
    let alertLevel = '✅ All Clear';
    let alertEmoji = '✅';
    if (summary.errors > 0) {
      alertLevel = '🚨 Critical Issues';
      alertEmoji = '🚨';
    } else if (summary.mismatches > 0) {
      alertLevel = '⚠️ Balance Mismatches';
      alertEmoji = '⚠️';
    }

    // Format processing time
    const processingTime = summary.processingTimeMs ? `${summary.processingTimeMs}ms` : 'N/A';
    
    // Create rich embed
    const embed = {
      title: `${alertEmoji} Balance Reconciliation Report`,
      description: `**${alertLevel}**\n\nLatest reconciliation results from the casino balance system.`,
      color: color,
      fields: [
        {
          name: '📊 Summary Stats',
          value: `**Total Users:** ${summary.totalUsers}\n**✅ Matches:** ${summary.matches}\n**⚠️ Mismatches:** ${summary.mismatches}\n**❌ Errors:** ${summary.errors}`,
          inline: true
        },
        {
          name: '💰 Balance Overview', 
          value: `**DB Total:** ${(summary.totalDbBalance / 1e9).toFixed(4)} SOL\n**On-Chain Total:** ${(summary.totalOnChainBalance / 1e9).toFixed(4)} SOL\n**Processing Time:** ${processingTime}`,
          inline: true
        },
        {
          name: '🕐 Timing',
          value: `**Last Run:** <t:${Math.floor(new Date(summary.lastRun).getTime() / 1000)}:R>\n**Next Run:** <t:${Math.floor(new Date(summary.nextRun).getTime() / 1000)}:R>`,
          inline: false
        }
      ],
      footer: {
        text: 'Casino Balance Reconciliation System',
        icon_url: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redis/redis-original.svg'
      },
      timestamp: new Date().toISOString()
    };

    // Add problematic users section if there are issues
    if (issues && issues.length > 0) {
      const topIssues = issues.slice(0, 5); // Show first 5 issues
      const issueList = topIssues.map(issue => {
        const diff = Math.abs(issue.difference);
        const diffSol = (diff / 1e9).toFixed(6);
        const status = issue.status === 'error' ? '❌ Error' : '⚠️ Mismatch';
        return `${status} **${issue.userId.slice(0, 8)}...** (${diffSol} SOL diff)`;
      }).join('\n');

      embed.fields.push({
        name: `🔍 Top Issues (${Math.min(issues.length, 5)}/${issues.length})`,
        value: issueList,
        inline: false
      });

      if (issues.length > 5) {
        embed.fields.push({
          name: '📋 Additional Info',
          value: `**+${issues.length - 5} more issues** - Check admin dashboard for full details`,
          inline: false
        });
      }
    }

    // Send webhook
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'Balance Reconciliation Bot',
        avatar_url: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/solana/solana-original.svg',
        embeds: [embed]
      })
    });

    if (response.ok) {
      console.log(`📢 Discord notification sent successfully for ${totalIssues} issues`);
    } else {
      const errorText = await response.text();
      console.error('📢 Discord webhook failed:', response.status, errorText);
    }

  } catch (error) {
    console.error('📢 Discord notification error:', error.message);
  }
}

async function performUserReconciliation(triggerType = 'scheduled') {
  const startTime = Date.now();
  console.log(`👥 Starting ${triggerType} user balance reconciliation...`);
  
  try {
    // Fetch all users with smart vaults
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, wallet_address, smart_vault, balance, created_at')
      .not('smart_vault', 'is', null)
      .order('created_at', { ascending: false });

    if (userError) throw userError;
    if (!users || users.length === 0) {
      console.log('👥 No users with smart vaults found');
      return;
    }

    console.log(`👥 Processing ${users.length} users with smart vaults...`);

    const VAULT_INIT_AMOUNT = 1315440; // 0.00131544 SOL (actual vault creation amount)
    const tolerance = 100000; // 0.0001 SOL
    
    // Use same RPC logic as other functions
    const isDevelopment = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
    const defaultRpcUrl = isDevelopment 
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com';
    
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 
                   process.env.SOLANA_RPC_URL || 
                   defaultRpcUrl;

    const results = [];
    let processedCount = 0;
    
    // Process users in small batches to avoid overwhelming RPC
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (user) => {
        try {
          const onChainBalanceSol = await getSolanaBalance(user.smart_vault);
          const onChainBalance = Math.round(onChainBalanceSol * 1e9); // Convert SOL to lamports
          const expectedOnChainBalance = user.balance + VAULT_INIT_AMOUNT;
          const difference = onChainBalance - expectedOnChainBalance;
          const absoluteDifference = Math.abs(difference);
          
          const status = absoluteDifference <= tolerance ? 'match' : 'mismatch';

          return {
            userId: user.id,
            walletAddress: user.wallet_address,
            dbBalance: user.balance,
            onChainBalance,
            difference,
            status,
            error: null
          };
        } catch (error) {
          return {
            userId: user.id,
            walletAddress: user.wallet_address,
            dbBalance: user.balance,
            onChainBalance: 0,
            difference: 0,
            status: 'error',
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      processedCount += batch.length;
      console.log(`👥 Processed ${processedCount}/${users.length} users`);
      
      // Small delay between batches
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Calculate summary
    const summary = {
      totalUsers: users.length,
      matches: results.filter(r => r.status === 'match').length,
      mismatches: results.filter(r => r.status === 'mismatch').length,
      errors: results.filter(r => r.status === 'error').length,
      totalDbBalance: results.reduce((sum, r) => sum + r.dbBalance, 0),
      totalOnChainBalance: results.reduce((sum, r) => sum + r.onChainBalance, 0),
      lastRun: new Date().toISOString(),
      nextRun: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Next hour
      processingTimeMs: Date.now() - startTime
    };

    // Get problematic users
    const problematicUsers = results.filter(r => r.status === 'mismatch' || r.status === 'error');

    // Store results in Redis with 70-minute TTL (longer than 1 hour)
    const REDIS_RECONCILIATION_KEY = 'admin:reconciliation_summary';
    const REDIS_RECONCILIATION_ISSUES_KEY = 'admin:reconciliation_issues';
    
    try {
      await redis.set(REDIS_RECONCILIATION_KEY, JSON.stringify(summary), { ex: 4200 }); // 70 minutes
      await redis.set(REDIS_RECONCILIATION_ISSUES_KEY, JSON.stringify(problematicUsers), { ex: 4200 });
      console.log(`✅ Stored reconciliation results in Redis`);
    } catch (redisErr) {
      console.warn('Failed to store reconciliation in Redis:', redisErr.message);
    }

    // Store in Supabase for persistence (create table if needed)
    try {
      await supabase
        .from('reconciliation_history')
        .insert({
          total_users: summary.totalUsers,
          matches: summary.matches,
          mismatches: summary.mismatches,
          errors: summary.errors,
          total_db_balance: summary.totalDbBalance,
          total_onchain_balance: summary.totalOnChainBalance,
          processing_time_ms: summary.processingTimeMs,
          problematic_users: problematicUsers,
          created_at: summary.lastRun
        });
    } catch (supabaseErr) {
      console.warn('Failed to store reconciliation in Supabase (table may not exist):', supabaseErr.message);
    }

    // Update stats
    reconciliationStats.updateCount++;
    reconciliationStats.consecutiveFailures = 0;
    reconciliationStats.lastUpdateTime = summary.lastRun;
    reconciliationStats.lastSummary = summary;
    reconciliationStats.healthStatus = 'healthy';
    
    console.log(`👥 ${triggerType.charAt(0).toUpperCase() + triggerType.slice(1)} reconciliation completed: ${summary.matches} matches, ${summary.mismatches} mismatches, ${summary.errors} errors (${summary.processingTimeMs}ms)`);
    
    // Send Discord notification if there are issues
    await sendDiscordNotification(summary, problematicUsers);
    
    if (summary.mismatches > 0 || summary.errors > 0) {
      console.warn(`⚠️ Found ${summary.mismatches + summary.errors} users with balance issues`);
    }
    
  } catch (error) {
    reconciliationStats.failureCount++;
    reconciliationStats.consecutiveFailures++;
    
    if (reconciliationStats.consecutiveFailures >= 3) {
      reconciliationStats.healthStatus = 'degraded';
      console.error(`🚨 User reconciliation degraded: ${reconciliationStats.consecutiveFailures} consecutive failures. Latest ${triggerType} error:`, error.message);
    } else {
      console.warn(`⚠️ ${triggerType.charAt(0).toUpperCase() + triggerType.slice(1)} reconciliation failed (${reconciliationStats.consecutiveFailures}/3):`, error.message);
    }
  }
}

// Subscribe to balance updates for real-time cache sync
redis.subscribe('balance_update', async (message) => {
  try {
    const { username, balance, timestamp } = JSON.parse(message);
    const cacheKey = `user:balance:${username}`;
    const tsKey = `user:balance_ts:${username}`;
    const updateTimestamp = timestamp || Date.now();
    
    // Check if we have a newer timestamp to avoid overwriting newer data
    const existingTs = await redis.get(tsKey);
    if (existingTs && updateTimestamp <= Number(existingTs)) {
      console.log(`[API] Skipping pubsub update for ${username} - newer timestamp exists (${existingTs} >= ${updateTimestamp})`);
      return;
    }
    
    // Pipeline the cache updates into one network round-trip
    const pubsubPipe = redis.pipeline();
    pubsubPipe.set(cacheKey, balance, { ex: 300 });         // Single cache with 5 minutes TTL
    pubsubPipe.set(tsKey, updateTimestamp, { ex: 300 });    // Timestamp key
    await pubsubPipe.exec();
    
    console.log(`[API] Pipelined cache update via pubsub for ${username}: ${balance} lamports (ts: ${updateTimestamp})`);
  } catch (err) {
    console.warn(`[API] Error processing pubsub balance update:`, err);
  }
});

// Initialize Supabase client for getbalance (with error handling)
let supabase = null;
try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        db: { schema: 'public' },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        },
        global: {
          headers: { 'Connection': 'keep-alive' }
        }
      }
    );
    console.log('✅ Supabase client initialized successfully');
    
    // Initialize shared-utils dependencies
    initializeDependencies(redis, supabase);
    console.log('✅ Shared utilities dependencies initialized');
  } else {
    console.warn('⚠️ Supabase environment variables missing - getbalance endpoint will be disabled');
  }
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error);
}

// Create HTTP server
const server = createServer(async (req, res) => {
  const requestId = randomUUID();
  
  console.log(`[API-${requestId}] ${req.method} ${req.url}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200).end();
    return;
  }
  
  try {
    // Handle balance_adj requests (API v2.0)
    if (req.method === "POST" && req.url.includes("/balance_adj")) {
      await handleBalanceAdj(req, res, requestId, supabase, redis);
      return;
    }
    
    // Handle getbalance requests (API v2.0)
    if (req.method === "POST" && req.url.includes("/getbalance")) {
      await handleGetBalance(req, res, requestId, supabase, redis);
      return;
    }
    
    // Handle games ticket requests
    if (req.method === "POST" && req.url.includes("/games/ticket")) {
      await handleGamesTicket(req, res, requestId, redis);
      return;
    }
    
    // Handle price health check
    if (req.method === "GET" && req.url.includes("/health/price")) {
      try {
        // Use unified cache system instead of local cache
        const unifiedPrice = await getSolToUsdRate();
        const redisPrice = await redis.get(REDIS_PRICE_KEY);
        const redisTtl = await redis.ttl(REDIS_PRICE_KEY);
        
        // Calculate uptime metrics
        const uptimeMs = priceUpdaterStats.updateCount * 10000; // 10s intervals
        const totalRequests = Object.values(priceUpdaterStats.sourceStats).reduce((sum, source) => 
          sum + (source.success || 0) + (source.failure || 0), 0);
        
        // Check leader status
        let leaderStatus = 'unknown';
        let currentLeader = null;
        try {
          currentLeader = await redis.get(LEADER_KEY);
          if (currentLeader) {
            leaderStatus = isLeader ? 'this_instance' : 'another_instance';
          } else {
            leaderStatus = 'no_leader';
          }
        } catch (leaderErr) {
          leaderStatus = 'unknown';
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: priceUpdaterStats.consecutiveFailures < 3 ? 'healthy' : 'degraded',
          price: {
            current: unifiedPrice || null,
            source: 'unified_cache'
          },
          cache: {
            unified: unifiedPrice || null,
            redis: redisPrice || null,
            redisTtl: redisTtl
          },
          metrics: {
            updateCount: priceUpdaterStats.updateCount,
            consecutiveFailures: priceUpdaterStats.consecutiveFailures,
            lastSuccessfulUpdate: priceUpdaterStats.lastUpdateTime,
            lastFailure: priceUpdaterStats.lastUpdateTime, // Assuming lastUpdateTime is the last failure
            totalOracleRequests: totalRequests,
            sourceStats: priceUpdaterStats.sourceStats
          },
          updater: {
            status: isLeader ? 'leader' : 'follower',
            intervalMs: 10000,
            nextUpdateIn: isLeader ? `~${10 - (Date.now() % 10000) / 1000}s` : 'N/A (not leader)',
            leadership: {
              status: leaderStatus,
              isLeader: isLeader,
              currentLeader: currentLeader ? currentLeader.substring(0, 8) + '...' : null
            }
          },
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: err.message }));
      }
      return;
    }
    
    // Handle bankroll value requests
    if (req.method === "GET" && req.url.includes("/bankroll-value")) {
      try {
        const bankrollValue = await getBankrollValueUsd();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          bankrollUsd: bankrollValue,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Bankroll value endpoint error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch bankroll value',
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    // Handle bankroll safety status requests
    if (req.method === "GET" && req.url.includes("/bankroll-safety")) {
      try {
        const REDIS_BANKROLL_SAFETY_KEY = 'bankroll_safety_check';
        
        // Get latest safety check from Redis
        const safetyCheck = await redis.get(REDIS_BANKROLL_SAFETY_KEY);
        let parsedSafetyCheck = null;
        
        if (safetyCheck) {
          try {
            parsedSafetyCheck = typeof safetyCheck === 'string' ? JSON.parse(safetyCheck) : safetyCheck;
          } catch (parseErr) {
            console.warn('Failed to parse safety check from Redis:', parseErr.message);
          }
        }
        
        // Check leader status
        let leaderStatus = 'unknown';
        let currentLeader = null;
        try {
          currentLeader = await redis.get(BANKROLL_SAFETY_LEADER_KEY);
          if (currentLeader) {
            leaderStatus = isBankrollSafetyLeader ? 'this_instance' : 'another_instance';
          } else {
            leaderStatus = 'no_leader';
          }
        } catch (leaderErr) {
          leaderStatus = 'unknown';
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          safetyCheck: parsedSafetyCheck,
          stats: {
            updateCount: bankrollSafetyStats.updateCount,
            consecutiveFailures: bankrollSafetyStats.consecutiveFailures,
            lastUpdateTime: bankrollSafetyStats.lastUpdateTime,
            healthStatus: bankrollSafetyStats.healthStatus,
            alertsSent: bankrollSafetyStats.alertsSent
          },
          monitor: {
            status: isBankrollSafetyLeader ? 'leader' : 'follower',
            intervalMs: 10 * 60 * 1000, // 10 minutes
            nextCheckIn: isBankrollSafetyLeader ? `~${10 - (Date.now() % (10 * 60 * 1000)) / (60 * 1000)}m` : 'N/A (not leader)',
            leadership: {
              status: leaderStatus,
              isLeader: isBankrollSafetyLeader,
              currentLeader: currentLeader ? currentLeader.substring(0, 8) + '...' : null
            }
          },
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Bankroll safety endpoint error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch bankroll safety status',
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    // Handle profit/loss ratio status requests
    if (req.method === "GET" && req.url.includes("/profit-loss")) {
      try {
        const REDIS_PROFIT_LOSS_KEY = 'profit_loss_check';
        
        // Get latest P/L check from Redis
        const profitLossCheck = await redis.get(REDIS_PROFIT_LOSS_KEY);
        let parsedProfitLossCheck = null;
        
        if (profitLossCheck) {
          try {
            parsedProfitLossCheck = typeof profitLossCheck === 'string' ? JSON.parse(profitLossCheck) : profitLossCheck;
          } catch (parseErr) {
            console.warn('Failed to parse profit/loss check from Redis:', parseErr.message);
          }
        }
        
        // Check leader status
        let leaderStatus = 'unknown';
        let currentLeader = null;
        try {
          currentLeader = await redis.get(PROFIT_LOSS_LEADER_KEY);
          if (currentLeader) {
            leaderStatus = isProfitLossLeader ? 'this_instance' : 'another_instance';
          } else {
            leaderStatus = 'no_leader';
          }
        } catch (leaderErr) {
          leaderStatus = 'unknown';
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          profitLossCheck: parsedProfitLossCheck,
          stats: {
            updateCount: profitLossStats.updateCount,
            consecutiveFailures: profitLossStats.consecutiveFailures,
            lastUpdateTime: profitLossStats.lastUpdateTime,
            healthStatus: profitLossStats.healthStatus,
            alertsSent: profitLossStats.alertsSent
          },
          monitor: {
            status: isProfitLossLeader ? 'leader' : 'follower',
            intervalMs: 60 * 60 * 1000, // 1 hour
            nextCheckIn: isProfitLossLeader ? `~${60 - (Date.now() % (60 * 60 * 1000)) / (60 * 1000)}m` : 'N/A (not leader)',
            leadership: {
              status: leaderStatus,
              isLeader: isProfitLossLeader,
              currentLeader: currentLeader ? currentLeader.substring(0, 8) + '...' : null
            }
          },
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Profit/loss endpoint error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch profit/loss status',
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    // Handle gem fairness status requests
    if (req.method === "GET" && req.url.includes("/gem-fairness")) {
      try {
        const REDIS_GEM_FAIRNESS_KEY = 'gem_fairness_check';
        
        // Get latest gem fairness check from Redis
        const gemFairnessCheck = await redis.get(REDIS_GEM_FAIRNESS_KEY);
        let parsedGemFairnessCheck = null;
        
        if (gemFairnessCheck) {
          try {
            parsedGemFairnessCheck = typeof gemFairnessCheck === 'string' ? JSON.parse(gemFairnessCheck) : gemFairnessCheck;
          } catch (parseErr) {
            console.warn('Failed to parse gem fairness check from Redis:', parseErr.message);
          }
        }
        
        // Check leader status
        let leaderStatus = 'unknown';
        let currentLeader = null;
        try {
          currentLeader = await redis.get(GEM_FAIRNESS_LEADER_KEY);
          if (currentLeader) {
            leaderStatus = isGemFairnessLeader ? 'this_instance' : 'another_instance';
          } else {
            leaderStatus = 'no_leader';
          }
        } catch (leaderErr) {
          leaderStatus = 'unknown';
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          gemFairnessCheck: parsedGemFairnessCheck,
          stats: {
            updateCount: gemFairnessStats.updateCount,
            consecutiveFailures: gemFairnessStats.consecutiveFailures,
            lastUpdateTime: gemFairnessStats.lastUpdateTime,
            healthStatus: gemFairnessStats.healthStatus,
            totalUsersAnalyzed: gemFairnessStats.totalUsersAnalyzed,
            unfairUsers: gemFairnessStats.unfairUsers,
            alertsSent: gemFairnessStats.alertsSent
          },
          monitor: {
            status: isGemFairnessLeader ? 'leader' : 'follower',
            intervalMs: 2 * 60 * 60 * 1000, // 2 hours
            nextCheckIn: isGemFairnessLeader ? `~${120 - (Date.now() % (2 * 60 * 60 * 1000)) / (60 * 1000)}m` : 'N/A (not leader)',
            leadership: {
              status: leaderStatus,
              isLeader: isGemFairnessLeader,
              currentLeader: currentLeader ? currentLeader.substring(0, 8) + '...' : null
            }
          },
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Gem fairness endpoint error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch gem fairness status',
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    // Handle user reconciliation results
    if (req.method === "GET" && req.url.includes("/reconciliation-results")) {
      console.log('🎯 Reconciliation results endpoint hit');
      try {
        const REDIS_RECONCILIATION_KEY = 'admin:reconciliation_summary';
        const REDIS_RECONCILIATION_ISSUES_KEY = 'admin:reconciliation_issues';
        
        console.log('🔍 Fetching reconciliation results from Redis...');
        
        const summary = await redis.get(REDIS_RECONCILIATION_KEY);
        const issues = await redis.get(REDIS_RECONCILIATION_ISSUES_KEY);
        
        console.log('📊 Raw summary from Redis:', typeof summary, summary ? String(summary).substring(0, 100) + '...' : 'null');
        console.log('🚨 Raw issues from Redis:', typeof issues, issues ? String(issues).substring(0, 100) + '...' : 'null');
        
        let parsedSummary = null;
        let parsedIssues = [];
        
        if (summary) {
          try {
            // Handle both string and object cases
            parsedSummary = typeof summary === 'string' ? JSON.parse(summary) : summary;
            console.log('✅ Successfully parsed summary');
          } catch (parseErr) {
            console.warn('❌ Failed to parse summary from Redis:', parseErr.message);
            console.warn('📝 Raw summary data type:', typeof summary);
            console.warn('📝 Raw summary content:', summary);
            parsedSummary = null;
          }
        }
        
        if (issues) {
          try {
            // Handle both string and object cases
            parsedIssues = typeof issues === 'string' ? JSON.parse(issues) : issues;
            console.log('✅ Successfully parsed issues, count:', Array.isArray(parsedIssues) ? parsedIssues.length : 'not array');
          } catch (parseErr) {
            console.warn('❌ Failed to parse issues from Redis:', parseErr.message);
            console.warn('📝 Raw issues data type:', typeof issues);
            console.warn('📝 Raw issues content:', issues);
            parsedIssues = [];
          }
        }
        
        const stats = {
          updateCount: reconciliationStats?.updateCount || 0,
          lastUpdateTime: reconciliationStats?.lastUpdateTime || null,
          healthStatus: reconciliationStats?.healthStatus || 'unknown',
          consecutiveFailures: reconciliationStats?.consecutiveFailures || 0
        };
        
        const response = {
          success: true,
          summary: parsedSummary,
          issues: parsedIssues,
          stats: stats,
          timestamp: new Date().toISOString()
        };
        
        console.log('📤 Sending reconciliation response, summary available:', !!parsedSummary, 'issues count:', Array.isArray(parsedIssues) ? parsedIssues.length : 'not array');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err) {
        console.error('❌ Reconciliation results endpoint error:', err.message);
        console.error('📋 Full error stack:', err.stack);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch reconciliation results: ' + err.message,
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    // Handle manual reconciliation trigger
    if (req.method === "POST" && req.url.includes("/reconciliation-trigger")) {
      try {
        console.log(`👥 Manual reconciliation triggered by admin`);
        
        // Run reconciliation immediately, bypassing leader election
        await runUserReconciliationManual();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Manual reconciliation completed successfully',
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Manual reconciliation trigger error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Failed to trigger manual reconciliation: ' + err.message,
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
          // Handle bankroll health check
      if (req.method === "GET" && req.url.includes("/health/bankroll")) {
        try {
          // Use same RPC selection logic as getSolanaBalance
          const isDevelopment = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
          const defaultRpcUrl = isDevelopment 
            ? 'https://api.devnet.solana.com'
            : 'https://api.mainnet-beta.solana.com';
          
          const rpcUrl = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 
                         process.env.SOLANA_RPC_URL || 
                         defaultRpcUrl;
          
          // Determine network from URL
          const network = rpcUrl.includes('devnet') || rpcUrl.includes('testnet') 
            ? 'devnet' 
            : 'mainnet';
          const rpcProvider = rpcUrl.includes('helius') ? 'Helius' : 'Default';
          
          const bankrollValue = await getBankrollValueUsd();
          const redisBankroll = await redis.get(REDIS_BANKROLL_KEY);
          const redisTtl = await redis.ttl(REDIS_BANKROLL_KEY);
        
        // Check leader status
        let leaderStatus = 'unknown';
        let currentLeader = null;
        try {
          currentLeader = await redis.get(BANKROLL_LEADER_KEY);
          if (currentLeader) {
            leaderStatus = isBankrollLeader ? 'this_instance' : 'another_instance';
          } else {
            leaderStatus = 'no_leader';
          }
        } catch (leaderErr) {
          leaderStatus = 'unknown';
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: bankrollUpdaterStats.consecutiveFailures < 3 ? 'healthy' : 'degraded',
          bankroll: {
            current: bankrollValue || null,
            lastSolBalance: bankrollUpdaterStats.lastSolBalance || null,
            walletAddress: BANKROLL_WALLET_ADDRESS,
            network: network,
            rpcUrl: rpcUrl,
            rpcProvider: rpcProvider
          },
          cache: {
            unified: bankrollValue || null,
            redis: redisBankroll || null,
            redisTtl: redisTtl
          },
          metrics: {
            updateCount: bankrollUpdaterStats.updateCount,
            consecutiveFailures: bankrollUpdaterStats.consecutiveFailures,
            lastSuccessfulUpdate: bankrollUpdaterStats.lastUpdateTime,
            failureCount: bankrollUpdaterStats.failureCount
          },
          updater: {
            status: isBankrollLeader ? 'leader' : 'follower',
            intervalMs: 60000,
            nextUpdateIn: isBankrollLeader ? `~${60 - (Date.now() % 60000) / 1000}s` : 'N/A (not leader)',
            leadership: {
              status: leaderStatus,
              isLeader: isBankrollLeader,
              currentLeader: currentLeader ? currentLeader.substring(0, 8) + '...' : null
            }
          },
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: err.message }));
      }
      return;
    }
    
    // Handle live-wins requests
    if (req.method === "GET" && req.url.includes("/live-wins")) {
      await handleLiveWins(req, res, requestId, supabase, redis);
      return;
    }
    
    // Handle wallet-balance requests
    if (req.method === "GET" && req.url.includes("/wallet-balance")) {
      await handleWalletBalance(req, res, requestId, supabase, redis);
      return;
    }
    
    // Handle user-smart-vault requests
    if (req.url.includes("/user-smart-vault")) {
      await handleUserSmartVault(req, res, requestId, supabase);
      return;
    }
    
    // Handle transactions requests (deposits and withdrawals)
    if (req.method === "GET" && req.url.includes("/transactions")) {
      await handleTransactions(req, res, requestId, supabase, redis);
      return;
    }

    // Handle user-achievements requests (largest payout and luckiest bet)
    if (req.method === "GET" && req.url.includes("/user-achievements")) {
      await handleUserAchievements(req, res, requestId, supabase, redis);
      return;
    }

    // Handle user-bets requests
    if (req.method === "GET" && req.url.includes("/user-bets")) {
      await handleUserBets(req, res, requestId, supabase, redis);
      return;
    }
    
    // Handle deposit requests
    if (req.method === "POST" && req.url.includes("/balance/deposit")) {
      await handleDeposit(req, res, requestId, supabase, redis);
      return;
    }
    
    // Handle withdraw requests
    if (req.method === "POST" && req.url.includes("/balance/withdraw")) {
      await handleWithdraw(req, res, requestId, supabase, redis);
      return;
    }
    
    // Handle test mode rate locking endpoints
    if (req.method === "POST" && req.url === '/test/lock-rate') {
      try {
        let duration = 30; // Default 30 seconds
        
        // Parse duration from request body if provided
        try {
          const body = await json(req);
          if (body.duration && typeof body.duration === 'number' && body.duration > 0) {
            duration = Math.min(body.duration, 300); // Max 5 minutes for safety
          }
        } catch (parseErr) {
          // Use default duration if body parsing fails
        }
        
        const result = await lockRateForTesting(duration);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: result.success ? 'success' : 'error',
          ...result,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error(`[API-${requestId}] ❌ Test mode lock error:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          error: error.message,
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    if (req.method === "POST" && req.url === '/test/unlock-rate') {
      try {
        const result = await unlockRateForTesting();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          ...result,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error(`[API-${requestId}] ❌ Test mode unlock error:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          error: error.message,
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    if (req.method === "GET" && req.url === '/test/rate-status') {
      try {
        const status = await getTestModeStatus();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          testMode: status,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error(`[API-${requestId}] ❌ Test mode status error:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          error: error.message,
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/gem-collection')) {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const username = urlParams.get('username');
      
      if (!username) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username parameter required' }));
        return;
      }

      try {
        console.log(`📦 [API] Fetching gem collection for ${username}`);
        const collection = await gemCollection.getUserGemCollection(username);
        
        if (!collection) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User not found' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: collection
        }));
      } catch (error) {
        console.error('❌ [API] Error fetching gem collection:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Failed to fetch gem collection',
          details: error.message 
        }));
      }
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/gem-leaderboard')) {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const limit = parseInt(urlParams.get('limit')) || 10;
      
      try {
        console.log(`🏆 [API] Fetching gem leaderboard (limit: ${limit})`);
        const leaderboard = await gemCollection.getGemLeaderboard(limit);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: leaderboard
        }));
      } catch (error) {
        console.error('❌ [API] Error fetching gem leaderboard:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Failed to fetch gem leaderboard',
          details: error.message 
        }));
      }
      return;
    }

    // Handle resolve-referral requests
    if (req.method === 'GET' && req.url.startsWith('/resolve-referral')) {
      await handleResolveReferral(req, res, requestId, supabase);
      return;
    }

    // Handle user-signup requests
    if (req.method === 'POST' && req.url.startsWith('/user-signup')) {
      await handleUserSignup(req, res, requestId, supabase);
      return;
    }

    // Handle user-logout requests
    if (req.method === 'POST' && req.url.startsWith('/user-logout')) {
      await handleUserLogout(req, res, requestId, supabase);
      return;
    }

    // Handle user-login-status requests
    if (req.method === 'GET' && req.url.startsWith('/user-login-status')) {
      await handleUserLoginStatus(req, res, requestId, supabase);
      return;
    }
    
    // Handle health check
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'balance_adj_api' }));
      return;
    }
    
    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    
  } catch (error) {
    console.error(`[API-${requestId}] ❌ Error:`, error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: "0", 
      balance: "0", 
      errormsg: 'Internal server error',
      timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
    }));
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Fly.io API server running on port ${PORT}`);
  console.log(`✅ Available endpoints:`);
  console.log(`   POST /balance_adj - Balance adjustment API (v2.0) (modular)`);
  console.log(`   POST /getbalance - Balance retrieval API (v2.0) (modular)`);
  console.log(`   GET /live-wins - Live wins API`); 
  console.log(`   POST /games/ticket - Ticket creation API (v2.0) (modular)`);
  console.log(`   GET /wallet-balance - Wallet balance API`);
  console.log(`   GET/POST /user-smart-vault - Smart vault management API (modular)`);
  console.log(`   GET /user-bets - User bets API`);
  console.log(`   GET /user-achievements - User achievements API`);
  console.log(`   GET /transactions - User transactions API (modular)`);
  console.log(`   POST /balance/deposit - Deposit funds API`);
  console.log(`   POST /balance/withdraw - Withdraw funds API`);
  console.log(`   GET /health/price - Price updater health check`);
  console.log(`   GET /bankroll-value - Bankroll value in USD`);
  console.log(`   GET /health/bankroll - Bankroll updater health check`);
  console.log(`   GET /bankroll-safety - Bankroll safety monitor status`);
  console.log(`   GET /profit-loss - Profit/loss ratio monitor status`);
  console.log(`   GET /gem-fairness - Gem drop fairness monitor status`);
  console.log(`   GET /reconciliation-results - User balance reconciliation results`);
  console.log(`   POST /reconciliation-trigger - Manually trigger user balance reconciliation`);
  console.log(`   POST /test/lock-rate - 🧪 Lock SOL/USD rate for testing`);
  console.log(`   POST /test/unlock-rate - 🧪 Unlock SOL/USD rate`);
  console.log(`   GET /test/rate-status - 🧪 Check test mode status`);
  console.log(`   GET /gem-collection - Fetch user's gem collection`);
  console.log(`   GET /gem-leaderboard - Fetch gem leaderboard`);
  console.log(`   GET /resolve-referral - Resolve a referral code to a wallet address`);
  console.log(`   POST /user-signup - User signup with signature verification and referral support`);
  console.log(`   POST /user-logout - User logout (sets signed_in to false)`);
  console.log(`   GET /user-login-status - Check user login status and session validity`);
  
  // Start leader election and updater systems
  console.log('🚀 Starting leader election for price, bankroll, reconciliation, bankroll safety, profit/loss, and gem fairness updates');
  
  // Initial leader elections (async, don't block server startup)
  electLeader().catch(err => console.error('Initial price leader election failed:', err));
  electBankrollLeader().catch(err => console.error('Initial bankroll leader election failed:', err));
  electReconciliationLeader().catch(err => console.error('Initial reconciliation leader election failed:', err));
  electBankrollSafetyLeader().catch(err => console.error('Initial bankroll safety leader election failed:', err));
  electProfitLossLeader().catch(err => console.error('Initial profit/loss leader election failed:', err));
  electGemFairnessLeader().catch(err => console.error('Initial gem fairness leader election failed:', err));
  
  // Check price leadership and renew every 15 seconds
  leaderCheckInterval = setInterval(async () => {
    if (isLeader) {
      await renewLeadership();
    } else {
      await electLeader();
    }
  }, 15000);
  
  // Check bankroll leadership and renew every 45 seconds
  bankrollLeaderCheckInterval = setInterval(async () => {
    if (isBankrollLeader) {
      await renewBankrollLeadership();
    } else {
      await electBankrollLeader();
    }
  }, 45000);
  
  // Check reconciliation leadership and renew every 30 minutes
  reconciliationLeaderCheckInterval = setInterval(async () => {
    if (isReconciliationLeader) {
      await renewReconciliationLeadership();
    } else {
      await electReconciliationLeader();
    }
  }, 30 * 60 * 1000); // 30 minutes
  
  // Check bankroll safety leadership and renew every 5 minutes
  bankrollSafetyLeaderCheckInterval = setInterval(async () => {
    if (isBankrollSafetyLeader) {
      await renewBankrollSafetyLeadership();
    } else {
      await electBankrollSafetyLeader();
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  // Check profit/loss leadership and renew every 30 minutes
  profitLossLeaderCheckInterval = setInterval(async () => {
    if (isProfitLossLeader) {
      await renewProfitLossLeadership();
    } else {
      await electProfitLossLeader();
    }
  }, 30 * 60 * 1000); // 30 minutes
  
  // Check gem fairness leadership and renew every 60 minutes
  gemFairnessLeaderCheckInterval = setInterval(async () => {
    if (isGemFairnessLeader) {
      await renewGemFairnessLeadership();
    } else {
      await electGemFairnessLeader();
    }
  }, 60 * 60 * 1000); // 60 minutes
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});