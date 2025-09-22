import { createHmac } from 'crypto';
import { lru } from 'tiny-lru';
import { EvmPriceServiceConnection } from '@pythnetwork/pyth-evm-js';
import fetch from 'node-fetch';

// === Module Dependencies ===
let redis = null;
let supabase = null;

// Initialize dependencies (called from api.js)
export function initializeDependencies(redisInstance, supabaseInstance) {
  redis = redisInstance;
  supabase = supabaseInstance;
}

// === Price Utilities ===
const priceCache = lru(1, 60000); // 1 item max, 60 second TTL
const REDIS_PRICE_KEY = 'price:solusd';
const PYTH_SOL_USD_ID = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

// === Bankroll Value Utilities ===
const bankrollCache = lru(1, 60000); // 1 item max, 60 second TTL
const REDIS_BANKROLL_KEY = 'bankroll:usd_value';
const BANKROLL_WALLET_ADDRESS = 'FGxFyyspz79vCm5KvawzzBZ3rE3jzdFUDFzyL2Tnu3X3';

// === Test Mode Rate Locking ===
const REDIS_TEST_MODE_KEY = 'test:rate_lock';
// Local cache for test mode state (refreshed from Redis)
let testModeCache = {
  isActive: false,
  lockedRate: null,
  lockExpiry: null,
  lastCheck: 0
};

// === Security Utilities ===
export function validateHmacSignature(data, apiEncryptionKey) {
  if (!data.hashed_result || !apiEncryptionKey) {
    return false;
  }
  
  // Fields to hash in exact order as per CWS documentation
  const fieldsToHash = [
    data.command,
    data.timestamp,
    data.login,
    data.internal_session_id,
    data.uniqid,
    data.amount,
    data.type,
    data.userid,
    data.custom_data
  ];
  
  // Create JSON string with specific flags (matching PHP implementation)
  // PHP uses: JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_NUMERIC_CHECK
  const jsonString = JSON.stringify(fieldsToHash, (key, value) => {
    // Convert numeric strings to actual numbers (JSON_NUMERIC_CHECK equivalent)
    if (typeof value === 'string' && !isNaN(value) && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
    return value;
  }).replace(/\\\//g, '/'); // Unescape slashes (JSON_UNESCAPED_SLASHES equivalent)
  
  // Create HMAC SHA256
  const computedHmac = createHmac('sha256', apiEncryptionKey)
    .update(jsonString, 'utf8')
    .digest('hex');
  
  // Debug logging for HMAC validation (temporarily enabled for debugging)
  // console.log(`🔐 HMAC Debug:`, {
  //   fieldsToHash,
  //   jsonString,
  //   computedHmac: computedHmac.substring(0, 16) + '...', // First 16 chars for security
  //   expectedHmac: data.hashed_result?.substring(0, 16) + '...', // First 16 chars for security
  //   matches: computedHmac === data.hashed_result
  // });
  
  return computedHmac === data.hashed_result;
}

// Validate CWS server IP (optional but recommended)
export function validateCwsServerIp(clientIp) {
  // Add known CWS server IPs here - get these from CWS support
  const allowedIps = [
    // Add CWS server IPs when provided by support
    // '1.2.3.4',
    // '5.6.7.8'
  ];
  
  // Skip IP validation if no IPs configured (for development)
  if (allowedIps.length === 0) {
    return true;
  }
  
  return allowedIps.includes(clientIp);
}

// === Price and Conversion Utilities ===
// Utility functions for balance conversion
export function lamportsToSol(lamports) {
  return lamports / 1e9;
}

export function solToLamports(sol) {
  return Math.round(sol * 1e9);
}

export function solToUsd(sol, rate) {
  return sol * rate;
}

export function usdToSol(usd, rate) {
  return usd / rate;
}

// === Test Mode Rate Locking Functions ===
export async function lockRateForTesting(durationSeconds = 30) {
  try {
    // Get current rate from cache first
    const currentRate = priceCache.get('sol');
    if (!currentRate || currentRate <= 0) {
      throw new Error('No valid rate available to lock - cache is empty');
    }
    
    if (!redis) {
      throw new Error('Redis not available for test mode');
    }
    
    const now = Date.now();
    const lockData = {
      isActive: true,
      lockedRate: currentRate,
      lockExpiry: now + (durationSeconds * 1000),
      lockStartTime: now
    };
    
    // Store in Redis with TTL slightly longer than the lock duration for cleanup
    const jsonData = JSON.stringify(lockData);
    await redis.set(REDIS_TEST_MODE_KEY, jsonData, { ex: durationSeconds + 10 });
    console.log(`📝 TEST MODE: Stored in Redis:`, { key: REDIS_TEST_MODE_KEY, data: jsonData });
    
    // Update local cache
    testModeCache = {
      isActive: true,
      lockedRate: currentRate,
      lockExpiry: lockData.lockExpiry,
      lastCheck: now
    };
    
    console.log(`🔒 TEST MODE: Rate locked at $${currentRate.toFixed(8)} for ${durationSeconds} seconds (shared across all instances)`);
    return {
      success: true,
      lockedRate: currentRate,
      expiresAt: new Date(lockData.lockExpiry).toISOString(),
      durationSeconds
    };
  } catch (error) {
    console.error('❌ Failed to lock rate for testing:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function unlockRateForTesting() {
  try {
    if (!redis) {
      throw new Error('Redis not available for test mode');
    }
    
    // Check current state from Redis
    const currentState = await getTestModeStatus();
    
    if (currentState.isActive) {
      const wasLocked = currentState.lockedRate;
      
      // Remove from Redis
      await redis.del(REDIS_TEST_MODE_KEY);
      
      // Clear local cache
      testModeCache = {
        isActive: false,
        lockedRate: null,
        lockExpiry: null,
        lastCheck: Date.now()
      };
      
      console.log(`🔓 TEST MODE: Rate unlocked (was $${wasLocked?.toFixed(8)}) - shared across all instances`);
      return { success: true, wasLocked: true };
    }
    return { success: true, wasLocked: false };
  } catch (error) {
    console.error('❌ Failed to unlock rate for testing:', error.message);
    return { success: false, error: error.message };
  }
}

export async function getTestModeStatus() {
  const now = Date.now();
  
  try {
    // Check cache first (refresh every 5 seconds or if cache is empty)
    if (testModeCache.lastCheck > 0 && (now - testModeCache.lastCheck) < 5000) {
      // Use cached value if recent
      return {
        isActive: testModeCache.isActive,
        lockedRate: testModeCache.lockedRate,
        expiresAt: testModeCache.lockExpiry ? new Date(testModeCache.lockExpiry).toISOString() : null,
        secondsRemaining: testModeCache.lockExpiry ? Math.max(0, Math.ceil((testModeCache.lockExpiry - now) / 1000)) : 0
      };
    }
    
    // Refresh from Redis
    if (!redis) {
      // Fallback to local cache if Redis unavailable
      return {
        isActive: false,
        lockedRate: null,
        expiresAt: null,
        secondsRemaining: 0
      };
    }
    
    const redisData = await redis.get(REDIS_TEST_MODE_KEY);
    // console.log(`📖 TEST MODE: Retrieved from Redis:`, { key: REDIS_TEST_MODE_KEY, data: redisData, type: typeof redisData });
    
    if (redisData) {
      let lockData;
      try {
        // Handle both string and object responses from Redis
        if (typeof redisData === 'string') {
          lockData = JSON.parse(redisData);
        } else if (typeof redisData === 'object' && redisData !== null) {
          lockData = redisData; // Already an object
        } else {
          throw new Error(`Unexpected Redis data type: ${typeof redisData}`);
        }
      } catch (parseError) {
        console.error('❌ Failed to parse test mode data from Redis:', parseError.message, 'Raw data:', redisData);
        // Clear corrupted data
        await redis.del(REDIS_TEST_MODE_KEY);
        testModeCache = {
          isActive: false,
          lockedRate: null,
          lockExpiry: null,
          lastCheck: now
        };
        return {
          isActive: false,
          lockedRate: null,
          expiresAt: null,
          secondsRemaining: 0
        };
      }
      
      // Check if expired
      if (lockData.lockExpiry && now > lockData.lockExpiry) {
        console.log(`⏰ TEST MODE: Auto-expired after ${((now - lockData.lockStartTime) / 1000).toFixed(1)}s`);
        await redis.del(REDIS_TEST_MODE_KEY);
        testModeCache = {
          isActive: false,
          lockedRate: null,
          lockExpiry: null,
          lastCheck: now
        };
        return {
          isActive: false,
          lockedRate: null,
          expiresAt: null,
          secondsRemaining: 0
        };
      }
      
      // Update cache with fresh data
      testModeCache = {
        isActive: lockData.isActive,
        lockedRate: lockData.lockedRate,
        lockExpiry: lockData.lockExpiry,
        lastCheck: now
      };
      
      return {
        isActive: lockData.isActive,
        lockedRate: lockData.lockedRate,
        expiresAt: new Date(lockData.lockExpiry).toISOString(),
        secondsRemaining: Math.max(0, Math.ceil((lockData.lockExpiry - now) / 1000))
      };
    } else {
      // No test mode active
      testModeCache = {
        isActive: false,
        lockedRate: null,
        lockExpiry: null,
        lastCheck: now
      };
      
      return {
        isActive: false,
        lockedRate: null,
        expiresAt: null,
        secondsRemaining: 0
      };
    }
  } catch (error) {
    console.error('❌ Failed to get test mode status from Redis:', error.message);
    // Return cached value or default
    return {
      isActive: testModeCache.isActive || false,
      lockedRate: testModeCache.lockedRate || null,
      expiresAt: testModeCache.lockExpiry ? new Date(testModeCache.lockExpiry).toISOString() : null,
      secondsRemaining: testModeCache.lockExpiry ? Math.max(0, Math.ceil((testModeCache.lockExpiry - now) / 1000)) : 0
    };
  }
}

// Global rate synchronization for consistent balance calculations across instances
// Ensures all processes use the same SOL/USD rate from unified cache
export async function getSynchronizedSolRate(username = null) {
  try {
    const rate = await getSolToUsdRate();
    
    // Validate rate is reasonable (between $50-$1000 as sanity check)
    if (!rate || isNaN(rate) || rate <= 0 || rate < 50 || rate > 1000) {
      throw new Error(`Invalid SOL rate received: ${rate} - this suggests critical pricing system failure`);
    }
    
    // Check if we're in test mode for enhanced logging
    const testStatus = getTestModeStatus();
    const modeIndicator = testStatus.isActive ? '🔒 LOCKED' : '';
    
    if (username) {
      // console.log(`💰 Global synchronized rate for ${username}: $${rate.toFixed(8)} ${modeIndicator}`);
    }
    
    return rate;
  } catch (error) {
    console.error(`❌ CRITICAL: Failed to get synchronized SOL rate for ${username || 'system'}:`, error.message);
    throw new Error(`Rate synchronization failure: ${error.message}`);
  }
}

// Supabase RPC with retry logic
export async function rpcWithRetry(supabase, functionName, params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.rpc(functionName, params);
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.warn(`RPC attempt ${attempt}/${maxRetries} failed:`, error);
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
}

// Get SOL to USD rate (unified cache system)
export async function getSolToUsdRate() {
    // 0) Test Mode: Check if rate is locked for testing
    const testStatus = await getTestModeStatus(); // This auto-expires if needed
    if (testStatus.isActive && testStatus.lockedRate) {
      // Always populate local cache with locked rate for consistency
      priceCache.set('sol', testStatus.lockedRate);
      return testStatus.lockedRate;
    }
    
    // 1) Check in-memory cache (L1) - fast local access
    const cached = priceCache.get('sol');
    if (cached) {
      return cached;
    }
  
    // 2) Check Redis shared cache (L2) - synchronized across all instances
    try {
      if (!redis) {
        throw new Error('Redis not initialized - call initializeDependencies() first');
      }
      
      const cachedRedis = await redis.get(REDIS_PRICE_KEY);
      if (cachedRedis !== null && cachedRedis !== undefined) {
        const price = parseFloat(cachedRedis);
        if (price > 0) {
          priceCache.set('sol', price); // populate local cache
          return price;
        }
      }
    } catch (e) {
      console.error('❌ Redis fetch failed for price cache:', e.message);
      console.error('This indicates a critical infrastructure issue - background price updater may be down');
    }
  
    // 3) Emergency fetch ONLY if cache completely fails (should never happen in normal operation)
    console.error('🚨 CRITICAL: Price cache completely failed - performing emergency fetch');
    
    // Try Pyth first (critical emergency only)
    try {
      const pythPrice = await getPythPrice();
      if (pythPrice > 0) {
      priceCache.set('sol', pythPrice);
      try {
          // Try to restore Redis cache for other instances
        await redis.set(REDIS_PRICE_KEY, pythPrice, { ex: 65 });
        } catch (redisErr) {
          console.error('Failed to restore Redis cache after emergency fetch:', redisErr.message);
        }
        console.error(`🚨 EMERGENCY: Used Pyth fallback: $${pythPrice} - CHECK BACKGROUND UPDATER!`);
      return pythPrice;
      }
    } catch (pythErr) {
      console.error('Emergency Pyth fetch failed:', pythErr.message);
    }
  
    // Try Chainlink fallback (critical emergency only)
    try {
      const chainlinkPrice = await getChainlinkPrice();
      if (chainlinkPrice > 0) {
        priceCache.set('sol', chainlinkPrice);
        try {
          await redis.set(REDIS_PRICE_KEY, chainlinkPrice, { ex: 65 });
        } catch (redisErr) {
          console.error('Failed to restore Redis cache after emergency fetch:', redisErr.message);
    }
        console.error(`🚨 EMERGENCY: Used Chainlink fallback: $${chainlinkPrice} - CHECK BACKGROUND UPDATER!`);
        return chainlinkPrice;
      }
    } catch (chainlinkErr) {
      console.error('Emergency Chainlink fetch failed:', chainlinkErr.message);
    }
  
    // Try CoinGecko fallback (critical emergency only)
    try {
      const cgPrice = await getCoinGeckoPrice();
      if (cgPrice > 0) {
      priceCache.set('sol', cgPrice);
      try {
        await redis.set(REDIS_PRICE_KEY, cgPrice, { ex: 65 });
        } catch (redisErr) {
          console.error('Failed to restore Redis cache after emergency fetch:', redisErr.message);
        }
        console.error(`🚨 EMERGENCY: Used CoinGecko fallback: $${cgPrice} - CHECK BACKGROUND UPDATER!`);
      return cgPrice;
      }
    } catch (cgErr) {
      console.error('Emergency CoinGecko fetch failed:', cgErr.message);
    }
  
    // Final fallback: Get last known good price from Supabase (absolute last resort)
    console.error('🔍 ALL APIS FAILED - checking Supabase for last known good price...');
    try {
      if (!supabase) {
        throw new Error('Supabase not initialized');
      }
      
      const { data: priceData } = await supabase
        .from('price_history')
        .select('price')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (priceData?.price && priceData.price > 0) {
        const dbPrice = parseFloat(priceData.price);
        priceCache.set('sol', dbPrice);
        try {
          await redis.set(REDIS_PRICE_KEY, dbPrice, { ex: 65 });
        } catch (redisErr) {
          console.error('Failed to restore Redis cache with DB price:', redisErr.message);
        }
        console.error(`📊 EMERGENCY: Using stale DB price: $${dbPrice} - MANUAL INTERVENTION REQUIRED!`);
        return dbPrice;
      }
    } catch (supabaseErr) {
      console.error('Supabase emergency price fetch failed:', supabaseErr.message);
    }
  
    // Complete system failure - no price data available anywhere
    const errorMsg = 'COMPLETE PRICING SYSTEM FAILURE: No price data from cache, APIs, or database. Background updater is likely offline. Manual intervention required immediately.';
    console.error(`[CRITICAL] 🚨 ${errorMsg}`);
    throw new Error(errorMsg);
}

async function getPythPrice() {
  const timeoutMs = 1500;
  const pricePromise = (async () => {
    const connection = new EvmPriceServiceConnection('https://hermes.pyth.network');
    const feeds = await connection.getLatestPriceFeeds([PYTH_SOL_USD_ID]);
    if (!feeds || feeds.length === 0) throw new Error('No Pyth price feeds');
    const priceInfo = feeds[0].getPriceNoOlderThan(60); // seconds
    if (!priceInfo) throw new Error('Stale Pyth price');
    const numeric = Number(priceInfo.price);
    const price = numeric * Math.pow(10, priceInfo.expo);
    if (!price || price <= 0) throw new Error('Invalid Pyth price');
    return price;
  })();

  return await Promise.race([
    pricePromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Pyth timeout')), timeoutMs))
  ]);
}

async function getChainlinkPrice() {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 1500);
  try {
    // Using Chainlink's HTTP data feeds for SOL/USD
    const url = 'https://api.chain.link/user/publicKey/0x4Bec3E4dF1f7Fd4dce0a9A91Dd2bF9Cf8d7B6B0d/cryptoapis/solana-usd/data';
    const res = await fetch(url, { 
      signal: ctl.signal, 
      headers: { 'accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`Chainlink HTTP error ${res.status}`);
    const json = await res.json();
    
    const price = Number(json.data.price || json.answer || json.result);
    if (!price || price <= 0) throw new Error('Invalid Chainlink price format');
    return price;
  } catch (err) {
    throw new Error(`Chainlink fetch failed: ${err.message}`);
  } finally {
    clearTimeout(to);
  }
}

async function getCoinGeckoPrice() {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 1500);
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
    const res = await fetch(url, { signal: ctl.signal, headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error(`CoinGecko error ${res.status}`);
    const json = await res.json();
    const price = json?.solana?.usd;
    if (typeof price !== 'number' || price <= 0) throw new Error('Invalid CoinGecko price');
    return price;
  } finally {
    clearTimeout(to);
  }
}

// Extract username from login
export function extractUsername(login) {
  if (!login) return login;
  
  const OPERATOR_ID = process.env.OPERATOR_ID || '241';
  
  const prefixPatterns = [
    'user_',                   // user_Gz3ZKi9ARmqjbhBnxx3j (NEW: our custom prefix)
    `stg_u${OPERATOR_ID}_user_`,    // stg_u241_user_4M38DeTShLeXqV25rcgj
    'stg_u_',                  // stg_u_EZaMupaW3cwcFFvaCL8L
    `u${OPERATOR_ID}_stg_`,    // u241_stg_4M38DeTShLeXqV25rcgj
    `stg_u${OPERATOR_ID}_`,    // stg_u241_4M38DeTShLeXqV25rcgj  
    `u${OPERATOR_ID}_`         // u241_4M38DeTShLeXqV25rcgj
  ];
  
  for (const pattern of prefixPatterns) {
    if (login.startsWith(pattern)) {
      return login.replace(pattern, '');
    }
  }
  
  return login;
}

// Parse JSON from request body (supports both API v1.0 rvar and v2.0 raw JSON)
export async function json(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        // Handle legacy form data (rvar=...) for backward compatibility
        if (body.startsWith('rvar=')) {
          resolve({ rvar: body.split('rvar=')[1] });
        } else {
          // Handle raw JSON (API v2.0 format)
          resolve(JSON.parse(body));
        }
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// Helper function to get current balance for error responses
export async function getCurrentBalanceForError(login, redis, supabase) {
  let currentBalanceUsd = "0.00";
  try {
    const username = extractUsername(login);
    if (username) {
      const solToUsdRate = await getSynchronizedSolRate(username);

      // Single cache key for user balance (simplified approach)
      let startingLamports = await redis.get(`user:balance:${username}`);

      // Fallback to database if cache miss
      if (startingLamports === null || startingLamports === undefined) {
        const { data: rpcRows } = await rpcWithRetry(supabase, 'get_user_balance', { p_login: username });
        const result = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        startingLamports = result?.balance ?? 0;
        
        // Pre-populate cache with DB value
        try {
          await redis.set(`user:balance:${username}`, startingLamports, { ex: 300 });
        } catch (cacheErr) {
          console.warn('Failed to populate cache from DB:', cacheErr.message);
        }
      }

      startingLamports = Number(startingLamports);
      const startingUsd = solToUsd(lamportsToSol(startingLamports), solToUsdRate);
      currentBalanceUsd = startingUsd.toFixed(2);
    }
  } catch (balanceErr) {
    console.warn(`Could not fetch balance for error response:`, balanceErr);
  }
  return currentBalanceUsd;
} 

// === Bankroll Value Functions ===

// Fetch SOL balance from Solana RPC
async function getSolanaBalance(address) {
  // Priority order for RPC URL selection:
  // 1. NEXT_PUBLIC_RPC_ENDPOINT (Helius with API key)
  // 2. SOLANA_RPC_URL (custom override)
  // 3. Default based on NODE_ENV
  const isDevelopment = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
  const defaultRpcUrl = isDevelopment 
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com';
  
  const solanaRpcUrl = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 
                       process.env.SOLANA_RPC_URL || 
                       defaultRpcUrl;
  const timeoutMs = 5000; // 5 second timeout
  
  // Determine network from URL for logging
  const network = solanaRpcUrl.includes('devnet') || solanaRpcUrl.includes('testnet') 
    ? 'devnet' 
    : 'mainnet';
  const rpcProvider = solanaRpcUrl.includes('helius') ? 'Helius' : 'Default';
  
  // console.log(`🌐 Using Solana RPC: ${solanaRpcUrl} (${network} via ${rpcProvider})`);
  
  const balancePromise = (async () => {
    const response = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Solana RPC HTTP error ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Solana RPC error: ${data.error.message}`);
    }
    
    const balanceLamports = data.result?.value;
    if (typeof balanceLamports !== 'number') {
      throw new Error('Invalid balance response from Solana RPC');
    }
    
    // Convert lamports to SOL (1 SOL = 1e9 lamports)
    const balanceSol = balanceLamports / 1e9;
    return balanceSol;
  })();

  return await Promise.race([
    balancePromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Solana RPC timeout')), timeoutMs))
  ]);
}

// Get bankroll value in USD (unified cache system)
export async function getBankrollValueUsd() {
  // 1) Check in-memory cache (L1) - fast local access
  const cached = bankrollCache.get('usd_value');
  if (cached) {
    return cached;
  }

  // 2) Check Redis shared cache (L2) - synchronized across all instances
  try {
    if (!redis) {
      throw new Error('Redis not initialized - call initializeDependencies() first');
    }
    
    const cachedRedis = await redis.get(REDIS_BANKROLL_KEY);
    if (cachedRedis !== null && cachedRedis !== undefined) {
      const bankrollUsd = parseFloat(cachedRedis);
      if (bankrollUsd >= 0) { // Allow 0 as valid value
        bankrollCache.set('usd_value', bankrollUsd); // populate local cache
        return bankrollUsd;
      }
    }
  } catch (e) {
    console.error('❌ Redis fetch failed for bankroll cache:', e.message);
    console.error('This indicates a critical infrastructure issue - background bankroll updater may be down');
  }

  // 3) Emergency fetch ONLY if cache completely fails (should never happen in normal operation)
  console.error('🚨 CRITICAL: Bankroll cache completely failed - performing emergency fetch');
  
  try {
    const balanceSol = await getSolanaBalance(BANKROLL_WALLET_ADDRESS);
    const solPrice = await getSolToUsdRate(); // Use existing price system
    const bankrollUsd = balanceSol * solPrice;
    
    if (bankrollUsd >= 0) {
      bankrollCache.set('usd_value', bankrollUsd);
      try {
        // Try to restore Redis cache for other instances
        await redis.set(REDIS_BANKROLL_KEY, bankrollUsd, { ex: 65 });
      } catch (redisErr) {
        console.error('Failed to restore Redis bankroll cache after emergency fetch:', redisErr.message);
      }
      console.error(`🚨 EMERGENCY: Calculated bankroll value: $${bankrollUsd.toFixed(2)} - CHECK BACKGROUND UPDATER!`);
      return bankrollUsd;
    }
  } catch (emergencyErr) {
    console.error('Emergency bankroll fetch failed:', emergencyErr.message);
  }

  // Complete system failure - no bankroll data available anywhere
  const errorMsg = 'COMPLETE BANKROLL SYSTEM FAILURE: No bankroll data from cache or emergency fetch. Background updater is likely offline. Manual intervention required immediately.';
  console.error(`[CRITICAL] 🚨 ${errorMsg}`);
  throw new Error(errorMsg);
}

// Export price functions for background updater
export { getPythPrice, getChainlinkPrice, getCoinGeckoPrice, getSolanaBalance };

// === Referral Utilities ===

/**
 * Generates a deterministic referral code from a wallet address
 */
export function generateReferralCode(walletAddress) {
  if (!walletAddress) return "";
  
  // Create a simple hash of the wallet address
  let hash = 0;
  for (let i = 0; i < walletAddress.length; i++) {
    const char = walletAddress.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to positive number and create a 8-character code
  const positiveHash = Math.abs(hash);
  const referralCode = positiveHash.toString(36).substring(0, 8).toUpperCase();
  
  return referralCode;
} 