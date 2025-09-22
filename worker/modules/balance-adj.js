import { getSolToUsdRate, getSynchronizedSolRate, lamportsToSol, solToUsd, extractUsername, getCurrentBalanceForError, validateHmacSignature, validateCwsServerIp, json } from './shared-utils.js';

// =============================================================================
// PERFORMANCE MONITORING UTILITIES
// =============================================================================
class PerformanceTracker {
  constructor(requestId) {
    this.requestId = requestId;
    this.startTime = process.hrtime.bigint();
    this.lastCheckpoint = this.startTime;
    this.checkpoints = [];
  }

  checkpoint(name, details = {}) {
    const now = process.hrtime.bigint();
    const sinceLast = Number(now - this.lastCheckpoint) / 1_000_000; // Convert to ms
    const sinceStart = Number(now - this.startTime) / 1_000_000;
    
    const checkpoint = {
      name,
      sinceLast: `${sinceLast.toFixed(2)}ms`,
      sinceStart: `${sinceStart.toFixed(2)}ms`,
      details
    };
    
    this.checkpoints.push(checkpoint);
    console.log(`[PERF-${this.requestId}] ⏱️ ${name}: +${sinceLast.toFixed(2)}ms (total: ${sinceStart.toFixed(2)}ms)`, details);
    
    this.lastCheckpoint = now;
    return sinceLast;
  }

  logSummary() {
    const totalTime = Number(process.hrtime.bigint() - this.startTime) / 1_000_000;
    console.log(`[PERF-${this.requestId}] 📊 TOTAL RESPONSE TIME: ${totalTime.toFixed(2)}ms`);
    
    // Identify slowest operations
    const slowOps = this.checkpoints
      .map(cp => ({ name: cp.name, time: parseFloat(cp.sinceLast) }))
      .filter(op => op.time > 50) // Operations taking more than 50ms
      .sort((a, b) => b.time - a.time);
    
    if (slowOps.length > 0) {
      console.log(`[PERF-${this.requestId}] 🐌 SLOW OPERATIONS (>50ms):`, slowOps);
    }
    
    return totalTime;
  }
}

// =============================================================================
// OPTIMIZATION B: Redis Connection Pooling & Persistent Connections
// =============================================================================
let optimizedRedis = null;

function getOptimizedRedis(redis) {
  if (!optimizedRedis) {
    // Clone the Redis client with optimized settings for persistent connections
    optimizedRedis = redis;
    
    // Configure keepAlive and socket reuse if possible
    if (redis.options) {
      redis.options.keepAlive = true;
      redis.options.lazyConnect = false;
      redis.options.maxRetriesPerRequest = 2;
      redis.options.retryDelayOnFailover = 50;
      redis.options.enableReadyCheck = false;
      redis.options.connectTimeout = 5000;
      redis.options.commandTimeout = 3000;
    }
  }
  return optimizedRedis;
}

// =============================================================================
// OPTIMIZATION D: Price Cache Seeding
// =============================================================================
let cachedSolRate = null;
let cacheExpiry = 0;
let priceSeeded = false;
const PRICE_CACHE_TTL = 30000; // 30 seconds cache

async function getOptimizedSolRate(username, redis) {
  const now = Date.now();
  
  // Return cached rate if still valid
  if (cachedSolRate && now < cacheExpiry) {
    return cachedSolRate;
  }
  
  try {
    // Fetch fresh rate
    cachedSolRate = await getSynchronizedSolRate(username);
    cacheExpiry = now + PRICE_CACHE_TTL;
    return cachedSolRate;
  } catch (error) {
    console.warn('[PRICE-CACHE] Failed to fetch SOL rate, using fallback');
    // Fallback to direct API if synchronized rate fails
    cachedSolRate = await getSolToUsdRate();
    cacheExpiry = now + PRICE_CACHE_TTL;
    return cachedSolRate;
  }
}

// Seed price cache on module load (runs once when module is imported)
async function seedPriceCache() {
  if (priceSeeded) return;
  
  try {
    console.log('[PRICE-SEED] Seeding SOL/USD rate cache...');
    const rate = await getSolToUsdRate();
    cachedSolRate = rate;
    cacheExpiry = Date.now() + PRICE_CACHE_TTL;
    priceSeeded = true;
    console.log(`[PRICE-SEED] ✅ Seeded with rate: $${rate}`);
  } catch (error) {
    console.warn('[PRICE-SEED] Failed to seed price cache:', error.message);
  }
}

// Seed immediately when module loads
seedPriceCache();

// Validate timestamp (should be within reasonable time window)
function validateTimestamp(timestamp, maxAgeMinutes = 1440) {
  if (!timestamp) return false;
  
  try {
    // Parse timestamp in format: YYYY-mm-dd HH:mm:ss
    const requestTime = new Date(timestamp.replace(' ', 'T') + 'Z'); // Assume UTC
    const currentTime = new Date();
    const timeDifference = Math.abs(currentTime.getTime() - requestTime.getTime());
    const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds
    
    return timeDifference <= maxAge;
  } catch (error) {
    return false;
  }
}

// Development logging helpers
const isDev = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
const devLog = (...args) => isDev && console.log(...args);
const devWarn = (...args) => isDev && console.warn(...args);
const devError = (...args) => isDev && console.error(...args);

/**
 * Handle balance_adj requests (API v2.0)
 * POST: Process balance adjustments for CWS game integration
 */
export async function handleBalanceAdj(req, res, requestId, supabase, redis) {
  // Initialize performance tracker
  const perf = new PerformanceTracker(requestId);
  perf.checkpoint('REQUEST_START', { requestId });

  // Get optimized Redis client with persistent connections
  const optRedis = getOptimizedRedis(redis);
  perf.checkpoint('REDIS_CLIENT_INIT');
  
  // Get client IP for validation
  const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress;
  
  // Parse raw JSON body (API v2.0 format)
  let data;
  try {
    data = await json(req);
    perf.checkpoint('JSON_PARSE', { 
      hasData: !!data, 
      command: data?.command, 
      type: data?.type,
      amount: data?.amount
    });
    
    devLog(`[API-${requestId}] 📨 Received API v2.0 balance_adj request:`, {
      command: data.command,
      type: data.type,
      login: data.login,
      amount: data.amount,
      timestamp: data.timestamp,
      clientIp
    });
  } catch (parseError) {
    perf.checkpoint('JSON_PARSE_ERROR', { error: parseError.message });
    console.log(`[API-${requestId}] ❌ JSON parse error:`, parseError);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Invalid JSON format' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return;
  }
  
  // Security validations for API v2.0
  const apiEncryptionKey = process.env.CWS_ENCRYPTION_KEY;
  perf.checkpoint('ENV_CHECK');
    
  // 1. Validate HMAC signature - ALWAYS required for security
  if (!apiEncryptionKey) {
    perf.checkpoint('HMAC_KEY_MISSING');
    console.log(`[API-${requestId}] ❌ HMAC encryption key not configured`);
    const currentBalanceUsd = await getCurrentBalanceForError(data.login, optRedis, supabase);
    perf.checkpoint('ERROR_BALANCE_FETCH');
    const errorResponse = { status: "0", balance: currentBalanceUsd, errormsg: 'Server configuration error' };
    console.log(`[API-${requestId}] 📤 RESPONSE (500):`, JSON.stringify(errorResponse));
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return; // Explicit return - no processing
  }
  
  const hmacStart = process.hrtime.bigint();
  const hmacValid = validateHmacSignature(data, apiEncryptionKey);
  const hmacTime = Number(process.hrtime.bigint() - hmacStart) / 1_000_000;
  perf.checkpoint('HMAC_VALIDATION', { valid: hmacValid, hmacTime: `${hmacTime.toFixed(2)}ms` });
  
  if (!hmacValid) {
    console.log(`[API-${requestId}] ❌ HMAC signature validation failed`);
    const currentBalanceUsd = await getCurrentBalanceForError(data.login, optRedis, supabase);
    perf.checkpoint('ERROR_BALANCE_FETCH');
    const errorResponse = { status: "0", balance: currentBalanceUsd, errormsg: 'Invalid signature' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return; // Explicit return - no processing
  }
  
  // 2. Validate timestamp (5 minutes window for API v2.0)
  const timestampValid = validateTimestamp(data.timestamp, 5);
  perf.checkpoint('TIMESTAMP_VALIDATION', { valid: timestampValid, timestamp: data.timestamp });
  
  if (!timestampValid) {
    console.log(`[API-${requestId}] ❌ Timestamp validation failed: ${data.timestamp}`);
    const currentBalanceUsd = await getCurrentBalanceForError(data.login, optRedis, supabase);
    perf.checkpoint('ERROR_BALANCE_FETCH');
    const errorResponse = { status: "0", balance: currentBalanceUsd, errormsg: 'Invalid or expired timestamp' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return; // Explicit return - no processing
  }
  
  // 3. Validate CWS server IP (optional)
  const ipValid = validateCwsServerIp(clientIp);
  perf.checkpoint('IP_VALIDATION', { valid: ipValid, clientIp });
  
  if (!ipValid) {
    console.log(`[API-${requestId}] ❌ IP validation failed: ${clientIp}`);
    const currentBalanceUsd = await getCurrentBalanceForError(data.login, optRedis, supabase);
    perf.checkpoint('ERROR_BALANCE_FETCH');
    const errorResponse = { status: "0", balance: currentBalanceUsd, errormsg: 'Unauthorized IP' };
    console.log(`[API-${requestId}] 📤 RESPONSE (403):`, JSON.stringify(errorResponse));
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return; // Explicit return - no processing
  }
  
  devLog(`[API-${requestId}] ✅ All API v2.0 security validations passed`);
  
  // Basic validation - allow amount: 0 (valid for $0 wins/pushes)
  if (!data.command || data.amount === undefined || data.amount === null || !data.login || !data.type || !data.uniqid) {
    perf.checkpoint('FIELD_VALIDATION_FAILED');
    console.log(`[API-${requestId}] ❌ Missing required fields`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Missing required fields' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return;
  }
  
  if (data.command !== 'balance_adj') {
    perf.checkpoint('COMMAND_VALIDATION_FAILED', { command: data.command });
    console.log(`[API-${requestId}] ❌ Invalid command: ${data.command}`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Invalid command' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return;
  }
  
  if (!['bet', 'win', 'cancel', 'cancelbet', 'cancelwin'].includes(data.type)) {
    perf.checkpoint('TYPE_VALIDATION_FAILED', { type: data.type });
    console.log(`[API-${requestId}] ❌ Invalid type: ${data.type}`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Invalid type' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return;
  }
  
  perf.checkpoint('BASIC_VALIDATION_COMPLETE');
  
  // --------------------------------------------------
  // IDEMPOTENCY: ensure each uniqid is processed once
  // --------------------------------------------------
  const usernameForIdem = extractUsername(data.login);
  const uniqKey = `balance_adj:uniq:${usernameForIdem}:${data.uniqid}`;
  
  devLog(`[API-${requestId}] Idempotency check:`, { usernameForIdem, uniqKey });
  perf.checkpoint('IDEMPOTENCY_SETUP', { username: usernameForIdem, uniqid: data.uniqid });
  
  // Try to set placeholder - if key already exists transaction was processed before
  try {
    const idempotencyStart = process.hrtime.bigint();
    const setResp = await optRedis.set(uniqKey, 'processing', { nx: true, ex: 3600 }); // 1-hour protect window
    const idempotencyTime = Number(process.hrtime.bigint() - idempotencyStart) / 1_000_000;
    perf.checkpoint('IDEMPOTENCY_CHECK', { 
      isDuplicate: !setResp, 
      redisTime: `${idempotencyTime.toFixed(2)}ms`
    });
    
    if (!setResp) {
      console.log(`[API-${requestId}] ⏩ Duplicate uniqid detected (${data.uniqid}), skipping processing`);
      
      // Return the EXACT same balance from the original transaction (true idempotency)
      let storedResponse;
      try {
        const getStart = process.hrtime.bigint();
        storedResponse = await optRedis.get(`${uniqKey}:response`);
        const getTime = Number(process.hrtime.bigint() - getStart) / 1_000_000;
        perf.checkpoint('IDEMPOTENCY_RESPONSE_GET', { 
          hasStored: !!storedResponse,
          redisTime: `${getTime.toFixed(2)}ms`
        });
        
        if (storedResponse) {
          // Handle both string and object responses from Redis
          if (typeof storedResponse === 'string') {
            storedResponse = JSON.parse(storedResponse);
          } else if (typeof storedResponse === 'object' && storedResponse !== null) {
            // Already an object, use as-is
          } else {
            throw new Error(`Unexpected stored response type: ${typeof storedResponse}`);
          }
        }
      } catch (getErr) {
        perf.checkpoint('IDEMPOTENCY_RESPONSE_ERROR', { error: getErr.message });
        devWarn(`[API-${requestId}] Failed to get stored response from idempotency key:`, getErr);
        storedResponse = null; // Ensure it's null on error
      }
      
      // If stored response is available, return it exactly
      if (storedResponse) {
        try {
          // Refresh balance to reflect latest state in case subsequent transactions modified it
          const balanceStart = process.hrtime.bigint();
          const latestLamports = await optRedis.get(`user:balance:${usernameForIdem}`);
          const balanceTime = Number(process.hrtime.bigint() - balanceStart) / 1_000_000;
          perf.checkpoint('DUPLICATE_BALANCE_REFRESH', { 
            hasBalance: latestLamports !== null,
            redisTime: `${balanceTime.toFixed(2)}ms`
          });
          
          if (latestLamports !== null && latestLamports !== undefined) {
            const solRate = await getOptimizedSolRate(usernameForIdem, optRedis);
            perf.checkpoint('DUPLICATE_SOL_RATE_FETCH');
            const latestUsd = solToUsd(lamportsToSol(Number(latestLamports)), solRate).toFixed(2);
            storedResponse.balance = latestUsd;
          }
        } catch (refreshErr) {
          perf.checkpoint('DUPLICATE_REFRESH_ERROR', { error: refreshErr.message });
          devWarn(`[API-${requestId}] Failed to refresh balance for duplicate response:`, refreshErr);
        }

        console.log(`[API-${requestId}] 📤 RESPONSE (200 - duplicate/stored):`, JSON.stringify(storedResponse));
        console.log(`[API-${requestId}] 🛡️ Duplicate transaction blocked - no state changes made`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(storedResponse));
        perf.logSummary();
        return;
      }
      
      // Fallback if stored response not found
      const balanceToReturn = await getCurrentBalanceForError(data.login, optRedis, supabase);
      perf.checkpoint('DUPLICATE_FALLBACK_BALANCE');
      const responseData = {
        status: "0",
        balance: balanceToReturn,
        errormsg: "Duplicate transaction",
        timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
      };
      console.log(`[API-${requestId}] 📤 RESPONSE (200 - duplicate/fallback):`, JSON.stringify(responseData));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseData));
      perf.logSummary();
      return;
    }
  } catch (idemRedisErr) {
    perf.checkpoint('IDEMPOTENCY_REDIS_ERROR', { error: idemRedisErr.message });
    devWarn(`[API-${requestId}] Redis error during idempotency check`, idemRedisErr);
    // In case of Redis failure, proceed without idempotency to avoid blocking core functionality
  }
  
  // Extract and validate username
  const extractedUsername = extractUsername(data.login);
  perf.checkpoint('USERNAME_EXTRACTION', { username: extractedUsername });
  
  // Validate username is reasonable (not test/invalid patterns)
  if (!extractedUsername || extractedUsername.includes('xxx') || extractedUsername.includes('test_invalid') || extractedUsername.length < 3) {
    perf.checkpoint('USERNAME_VALIDATION_FAILED', { username: extractedUsername });
    console.log(`[API-${requestId}] ❌ Invalid username: ${extractedUsername} from login: ${data.login}`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Invalid user' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return;
  }
  
  // CRITICAL: Validate session hasn't been hijacked by wrong user
  // Check if this login matches our recent game ticket generation
  try {
    const gameSessionKey = `game_session:${extractedUsername}`;
    const recentSession = await optRedis.get(gameSessionKey);
    
    // If we have no recent session record, this could be session hijacking
    if (!recentSession) {
      console.log(`[API-${requestId}] 🚨 SECURITY ALERT: No recent session for user ${extractedUsername}`);
      console.log(`[API-${requestId}] 🚨 This could indicate session hijacking or token reuse`);
      console.log(`[API-${requestId}] 🚨 Rejecting balance_adj request for security`);
      
      const errorResponse = { status: "0", balance: "0", errormsg: 'Session expired or invalid' };
      console.log(`[API-${requestId}] 📤 RESPONSE (403):`, JSON.stringify(errorResponse));
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errorResponse));
      perf.logSummary();
      return;
    }
    
    perf.checkpoint('SESSION_VALIDATION_PASSED', { username: extractedUsername });
    devLog(`[API-${requestId}] ✅ Session validation passed for user: ${extractedUsername}`);
  } catch (sessionError) {
    console.log(`[API-${requestId}] ⚠️ Session validation error (proceeding anyway):`, sessionError.message);
  }
  
  // Validate amount is not NaN
  const amountUsd = parseFloat(data.amount);
  if (isNaN(amountUsd)) {
    perf.checkpoint('AMOUNT_VALIDATION_FAILED', { amount: data.amount });
    console.log(`[API-${requestId}] ❌ Invalid amount: ${data.amount} resulted in NaN`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Invalid amount' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return;
  }
  
  devLog(`[API-${requestId}] Processing balance adjustment:`, {
    extractedUsername,
    amountUsd,
    type: data.type,
    uniqid: data.uniqid
  });
  
  // Create clean job payload (same format as worker expects)
  const payload = {
    requestId,
    type: data.type,
    username: extractedUsername,
    amountUsd: Math.abs(amountUsd),
    gpid: data.gpid,
    subtype: data.subtype ?? null,
    uniqid: data.uniqid,
    gameId: data.gameid || data.gameId || 'unknown', // Extract game ID from provider data
    timestamp: Date.now(),
    raw: JSON.stringify(data) // API v2.0: store the raw JSON data instead of rvar
  };
  
  perf.checkpoint('PAYLOAD_CREATION', { type: data.type, amount: amountUsd });
  
  // -----------------------------
  // Simple balance preview logic - OPTIMIZED with cached rate
  // -----------------------------
  const solRateStart = process.hrtime.bigint();
  const solToUsdRate = await getOptimizedSolRate(extractedUsername, optRedis);
  const solRateTime = Number(process.hrtime.bigint() - solRateStart) / 1_000_000;
  perf.checkpoint('SOL_RATE_FETCH', { 
    rate: solToUsdRate,
    cached: cachedSolRate === solToUsdRate,
    fetchTime: `${solRateTime.toFixed(2)}ms`
  });
  
  const balanceStart = process.hrtime.bigint();
  let startingLamports = await optRedis.get(`user:balance:${payload.username}`);
  const balanceTime = Number(process.hrtime.bigint() - balanceStart) / 1_000_000;
  
  let cacheSource = 'cache';
  if (startingLamports === null || startingLamports === undefined) {
    // Fallback to DB one time
    cacheSource = 'db';
    const dbStart = process.hrtime.bigint();
    try {
      const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('username', payload.username)
        .single();
      startingLamports = user?.balance ?? 0;
      const dbTime = Number(process.hrtime.bigint() - dbStart) / 1_000_000;
      perf.checkpoint('DB_BALANCE_FETCH', { 
        balance: startingLamports,
        dbTime: `${dbTime.toFixed(2)}ms`
      });
    } catch (dbErr) {
      const dbTime = Number(process.hrtime.bigint() - dbStart) / 1_000_000;
      perf.checkpoint('DB_BALANCE_ERROR', { 
        error: dbErr.message,
        dbTime: `${dbTime.toFixed(2)}ms`
      });
      startingLamports = 0;
      cacheSource = 'default';
    }
  } else {
    perf.checkpoint('CACHE_BALANCE_FETCH', { 
      balance: startingLamports,
      redisTime: `${balanceTime.toFixed(2)}ms`
    });
  }
  
  startingLamports = Number(startingLamports);
  const startingUsd = solToUsd(lamportsToSol(startingLamports), solToUsdRate);

  devLog(`[API-${requestId}] Balance calculation starting point:`, {
    startingLamports,
    startingUsd,
    cacheSource,
    solToUsdRate: `$${solToUsdRate} (cached: ${cachedSolRate === solToUsdRate})`
  });

  // store cumulative pending bet only for worker (does not affect preview)
  if (data.type === 'bet' && data.gpid) {
    const pendingBetKey = `pending_bet:${payload.username}:${data.gpid}`;
    try {
      const pendingStart = process.hrtime.bigint();
      const existingBet = await optRedis.get(pendingBetKey);
      const newCum = (existingBet ? parseFloat(existingBet) : 0) + payload.amountUsd;
      await optRedis.set(pendingBetKey, newCum, { ex: 300 });
      const pendingTime = Number(process.hrtime.bigint() - pendingStart) / 1_000_000;
      perf.checkpoint('PENDING_BET_UPDATE', { 
        newCum,
        redisTime: `${pendingTime.toFixed(2)}ms`
      });
      devLog(`[API-${requestId}] Updated pending bet:`, { pendingBetKey, newCum });
    } catch (pendingBetErr) {
      perf.checkpoint('PENDING_BET_ERROR', { error: pendingBetErr.message });
      devWarn(`[API-${requestId}] Failed to update pending bet:`, pendingBetErr);
    }
  }
  if (data.type === 'win' && data.gpid) {
    const pendingBetKey = `pending_bet:${payload.username}:${data.gpid}`;
    try { 
      const pendingStart = process.hrtime.bigint();
      await optRedis.del(pendingBetKey); 
      const pendingTime = Number(process.hrtime.bigint() - pendingStart) / 1_000_000;
      perf.checkpoint('PENDING_BET_CLEAR', { 
        redisTime: `${pendingTime.toFixed(2)}ms`
      });
      devLog(`[API-${requestId}] Cleared pending bet:`, { pendingBetKey });
    } catch (pendingBetErr) {
      perf.checkpoint('PENDING_BET_CLEAR_ERROR', { error: pendingBetErr.message });
      devWarn(`[API-${requestId}] Failed to clear pending bet:`, pendingBetErr);
    }
  }

  let expectedBalanceUsd;
  if (data.type === 'bet') {
    expectedBalanceUsd = startingUsd - payload.amountUsd;
  } else if (data.type === 'win') {
    expectedBalanceUsd = startingUsd + payload.amountUsd;
  } else if (data.type === 'cancelbet') {
    expectedBalanceUsd = startingUsd + payload.amountUsd; // refund
  } else if (data.type === 'cancelwin') {
    expectedBalanceUsd = startingUsd - payload.amountUsd; // deduct win
  } else {
    expectedBalanceUsd = startingUsd; // no change for other types
  }

  perf.checkpoint('BALANCE_CALCULATION', { 
    startingUsd: startingUsd.toFixed(2),
    expectedUsd: expectedBalanceUsd.toFixed(2),
    operation: data.type,
    amount: payload.amountUsd
  });

  // Check for insufficient funds on bets and cancelwin operations
  if ((data.type === 'bet' || data.type === 'cancelwin') && expectedBalanceUsd < 0) {
    perf.checkpoint('INSUFFICIENT_FUNDS', { 
      startingUsd: startingUsd.toFixed(2),
      operation: data.type,
      amount: payload.amountUsd,
      wouldResult: expectedBalanceUsd.toFixed(2)
    });
    const operation = data.type === 'bet' ? 'bet' : 'cancel win';
    console.log(`[API-${requestId}] ❌ Insufficient funds: start=${startingUsd.toFixed(2)}, ${operation}=${payload.amountUsd}, would result in ${expectedBalanceUsd.toFixed(2)}`);
    const responseData = {
      status: "0",
      balance: startingUsd.toFixed(2),
      errormsg: "Insufficient funds",
      timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
    };
    console.log(`[API-${requestId}] 📤 RESPONSE (200 - insufficient funds):`, JSON.stringify(responseData));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responseData));
    perf.logSummary();
    return; // Explicit return - insufficient funds rejected
  }

  const currentBalanceUsd = Math.max(0, expectedBalanceUsd).toFixed(2);
  devLog(`[API-${requestId}] Preview balance: start=${startingUsd.toFixed(2)} USD, tx=${data.type} ${payload.amountUsd}, result=${currentBalanceUsd}, cache_source=${cacheSource}`);
  
  // Update Redis cache immediately with expected balance for instant UI updates
  try {
    const cacheStart = process.hrtime.bigint();
    const expectedBalanceLamports = Math.round((parseFloat(currentBalanceUsd) / solToUsdRate) * 1e9);
    const cacheKey = `user:balance:${payload.username}`;
    const tsKey = `user:balance_ts:${payload.username}`;
    const currentTimestamp = Date.now();
    
    devLog(`[API-${requestId}] 🚀 IMMEDIATE cache update with final balance:`, {
      expectedBalanceUsd: currentBalanceUsd,
      expectedBalanceLamports,
      transactionType: data.type,
      timestamp: currentTimestamp
    });
    
    // Get current timestamp to avoid overwriting newer updates
    const existingTs = await optRedis.get(tsKey);
    if (existingTs && currentTimestamp <= Number(existingTs)) {
      const cacheTime = Number(process.hrtime.bigint() - cacheStart) / 1_000_000;
      perf.checkpoint('CACHE_UPDATE_SKIPPED', { 
        reason: 'newer_timestamp_exists',
        existingTs,
        currentTs: currentTimestamp,
        redisTime: `${cacheTime.toFixed(2)}ms`
      });
      devLog(`[API-${requestId}] ⚠️ Skipping cache update - newer timestamp exists (${existingTs} >= ${currentTimestamp})`);
    } else {
      // Pipeline cache writes for atomicity using optimized Redis
      const pipe = optRedis.pipeline();
      pipe.set(cacheKey, expectedBalanceLamports, { ex: 300 });  // Single balance cache
      pipe.set(tsKey, currentTimestamp, { ex: 300 });           // Timestamp for ordering

      await pipe.exec();
      const cacheTime = Number(process.hrtime.bigint() - cacheStart) / 1_000_000;
      perf.checkpoint('CACHE_UPDATE_SUCCESS', { 
        balance: currentBalanceUsd,
        lamports: expectedBalanceLamports,
        redisTime: `${cacheTime.toFixed(2)}ms`
      });

      devLog(`[API-${requestId}] ✅ Updated single cache key: ${cacheKey} (ts: ${currentTimestamp})`);
    }
  } catch (cacheErr) {
    perf.checkpoint('CACHE_UPDATE_CRITICAL_ERROR', { error: cacheErr.message });
    console.error(`[API-${requestId}] ❌ CRITICAL: Failed to update cache immediately:`, cacheErr);
    // This is critical - if cache update fails, we should not proceed
    const errorResponse = { status: "0", balance: startingUsd.toFixed(2), errormsg: 'Cache update failed' };
    console.log(`[API-${requestId}] 📤 RESPONSE (500):`, JSON.stringify(errorResponse));
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    perf.logSummary();
    return;
  }
  
  // Prepare response data
  const responseData = { 
    status: "1", 
    balance: currentBalanceUsd,
    timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
  };
  
  perf.checkpoint('RESPONSE_PREPARATION');
  
  // CRITICAL: Store idempotency response BEFORE enqueueing job to prevent race conditions
  try {
    const idemStart = process.hrtime.bigint();
    const currentTimestamp = Date.now();
    const idemTsKey = `${uniqKey}:ts`;
    const idemResponseKey = `${uniqKey}:response`;
    
    // Check if a newer timestamp already exists
    const existingTs = await optRedis.get(idemTsKey);
    if (existingTs && currentTimestamp <= Number(existingTs)) {
      const idemTime = Number(process.hrtime.bigint() - idemStart) / 1_000_000;
      perf.checkpoint('IDEMPOTENCY_STORE_SKIPPED', { 
        reason: 'newer_timestamp_exists',
        redisTime: `${idemTime.toFixed(2)}ms`
      });
      devLog(`[API-${requestId}] ⚠️ Skipping idempotency response storage - newer timestamp exists (${existingTs} >= ${currentTimestamp})`);
    } else {
      // Pipeline the idempotency storage (complete response + timestamp) using optimized Redis
      const idemPipe = optRedis.pipeline();
      idemPipe.set(idemResponseKey, JSON.stringify(responseData), { ex: 3600 });  // Store complete response
      idemPipe.set(idemTsKey, currentTimestamp, { ex: 3600 });    // 1 hour TTL
      await idemPipe.exec();
      const idemTime = Number(process.hrtime.bigint() - idemStart) / 1_000_000;
      perf.checkpoint('IDEMPOTENCY_STORE_SUCCESS', { 
        balance: currentBalanceUsd,
        redisTime: `${idemTime.toFixed(2)}ms`
      });
      devLog(`[API-${requestId}] 💾 Pipelined idempotency storage: ${currentBalanceUsd} (ts: ${currentTimestamp})`);
    }
  } catch (idemStoreErr) {
    perf.checkpoint('IDEMPOTENCY_STORE_ERROR', { error: idemStoreErr.message });
    devWarn(`[API-${requestId}] Failed to store idempotency key:`, idemStoreErr);
  }
  
  // Enqueue job to worker using Upstash Redis – do NOT block response
  const enqueueStart = process.hrtime.bigint();
  optRedis.xadd("balance_adj", "*", { payload: JSON.stringify(payload) })
    .then(() => {
      const enqueueTime = Number(process.hrtime.bigint() - enqueueStart) / 1_000_000;
      devLog(`[API-${requestId}] ✅ Job enqueued: ${data.type} $${payload.amountUsd} for ${payload.username} (${enqueueTime.toFixed(2)}ms)`);
    })
    .catch(err => {
      const enqueueTime = Number(process.hrtime.bigint() - enqueueStart) / 1_000_000;
      console.error(`[API-${requestId}] ❌ Failed to enqueue job (${enqueueTime.toFixed(2)}ms)`, err);
    });

  perf.checkpoint('JOB_ENQUEUE_INITIATED');

  // Return 200 OK with expected balance (API v2.0 format - raw JSON with timestamp)
  console.log(`[API-${requestId}] 📤 RESPONSE (200 - success):`, JSON.stringify(responseData));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(responseData));

  // Log final performance summary
  perf.logSummary();

  // -------------------- END --------------------
} 