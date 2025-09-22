import { getSolToUsdRate, getSynchronizedSolRate, lamportsToSol, solToUsd, extractUsername, getCurrentBalanceForError, rpcWithRetry, validateHmacSignature, validateCwsServerIp, json } from './shared-utils.js';

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
 * Handle getbalance requests (API v2.0)
 * POST: Retrieve user balance for CWS game integration
 */
export async function handleGetBalance(req, res, requestId, supabase, redis) {
  devLog(`[API-${requestId}] 🔍 GETBALANCE START (API v2.0): ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - getbalance disabled`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Service temporarily unavailable' };
    console.log(`[API-${requestId}] 📤 RESPONSE (503):`, JSON.stringify(errorResponse));
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return;
  }
  
  // Get client IP for validation
  const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress;
  
  // Parse raw JSON body (API v2.0 format)
  let requestData;
  try {
    requestData = await json(req);
    devLog(`[API-${requestId}] 📨 Received API v2.0 getbalance request:`, {
      command: requestData.command,
      login: requestData.login,
      userid: requestData.userid,
      timestamp: requestData.timestamp,
      clientIp
    });
  } catch (parseError) {
    console.log(`[API-${requestId}] ❌ JSON parse error:`, parseError.message);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Invalid JSON format' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return;
  }
  
  // Security validations for API v2.0
  const apiEncryptionKey = process.env.CWS_ENCRYPTION_KEY;
  
  // 1. Validate HMAC signature - ALWAYS required for security
  if (!apiEncryptionKey) {
    console.log(`[API-${requestId}] ❌ HMAC encryption key not configured`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Server configuration error' };
    console.log(`[API-${requestId}] 📤 RESPONSE (500):`, JSON.stringify(errorResponse));
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return; // Explicit return - no processing
  }
  
  if (!validateHmacSignature(requestData, apiEncryptionKey)) {
    console.log(`[API-${requestId}] ❌ HMAC signature validation failed`);
    const currentBalanceUsd = await getCurrentBalanceForError(requestData.login, redis, supabase);
    const errorResponse = { status: "0", balance: currentBalanceUsd, errormsg: 'Invalid signature' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return; // Explicit return - no processing
  }
  
  // 2. Validate timestamp (5 minutes window for API v2.0)
  if (!validateTimestamp(requestData.timestamp, 5)) {
    console.log(`[API-${requestId}] ❌ Timestamp validation failed: ${requestData.timestamp}`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Invalid or expired timestamp' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return;
  }
  
  // 3. Validate CWS server IP (optional)
  if (!validateCwsServerIp(clientIp)) {
    console.log(`[API-${requestId}] ❌ IP validation failed: ${clientIp}`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Unauthorized IP' };
    console.log(`[API-${requestId}] 📤 RESPONSE (403):`, JSON.stringify(errorResponse));
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return; // Explicit return - no processing
  }
  
  devLog(`[API-${requestId}] ✅ All API v2.0 security validations passed`);
  
  // Validate required fields
  if (!requestData.command || !requestData.userid || !requestData.login || !requestData.timestamp) {
    const errorResponse = { status: "0", balance: "0", errormsg: 'Missing required fields: command, userid, login, timestamp' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return;
  }
  
  // Validate command
  if (requestData.command !== 'getbalance') {
    console.log(`[API-${requestId}] ❌ Invalid command: ${requestData.command}`);
    const errorResponse = { status: "0", balance: "0", errormsg: 'Invalid command. Expected: getbalance' };
    console.log(`[API-${requestId}] 📤 RESPONSE (400):`, JSON.stringify(errorResponse));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return;
  }
  
  // Extract username from login
  const username = extractUsername(requestData.login);
  devLog(`[API-${requestId}] Username extracted: ${username} from login: ${requestData.login}`);
  
  // CRITICAL: Validate session hasn't been hijacked by wrong user
  // Check if this login matches our recent game ticket generation
  const gameSessionKey = `game_session:${username}`;
  const recentSession = await redis.get(gameSessionKey);
  
  // If we have no recent session record, this could be session hijacking
  if (!recentSession) {
    console.log(`[API-${requestId}] 🚨 SECURITY ALERT: No recent session for user ${username}`);
    console.log(`[API-${requestId}] 🚨 This could indicate session hijacking or token reuse`);
    console.log(`[API-${requestId}] 🚨 Rejecting getbalance request for security`);
    
    const errorResponse = { status: "0", balance: "0", errormsg: 'Session expired or invalid' };
    console.log(`[API-${requestId}] 📤 RESPONSE (403):`, JSON.stringify(errorResponse));
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return;
  }
  
  devLog(`[API-${requestId}] ✅ Session validation passed for user: ${username}`);
  
  try {
    // Check Redis cache first (single cache key)
    const cacheKey = `user:balance:${username}`;
    const currRaw = await redis.get(cacheKey);
    let balanceInLamports = typeof currRaw === 'number' ? currRaw : null;
    
    devLog(`[API-${requestId}] Cache check:`, { cacheKey, currRaw, balanceInLamports });
    
    // If cache miss, query Supabase RPC
    if (balanceInLamports === null) {
      try {
        const { data: rpcRows } = await rpcWithRetry(supabase, 'get_user_balance', { p_login: username });
        const result = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        
        devLog(`[API-${requestId}] RPC result:`, result);
        
        if (!result || result.found === false) {
          const errorResponse = { 
            status: "0", 
            balance: "0", 
            errormsg: 'Invalid user',
            timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
          };
          console.log(`[API-${requestId}] 📤 RESPONSE (200):`, JSON.stringify(errorResponse));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errorResponse));
          return;
        }
        
        balanceInLamports = Number(result.balance) || 0;
        
        // Update Redis cache
        try {
          await redis.set(cacheKey, balanceInLamports, { ex: 300 });
          devLog(`[API-${requestId}] Updated cache:`, { cacheKey, balanceInLamports });
        } catch (cacheErr) {
          devWarn('Failed to update Redis cache:', cacheErr);
        }
      } catch (rpcErr) {
        console.error(`[API-${requestId}] RPC error:`, rpcErr);
        
        // If we have stale cache, use it
        if (currRaw !== null && currRaw !== undefined) {
          const solToUsdRate = await getSynchronizedSolRate(username);
          const sol = lamportsToSol(Number(currRaw));
          const usd = solToUsd(sol, solToUsdRate);
          const staleResponse = { 
            status: "1", 
            balance: usd.toFixed(2),
            timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
          };
          console.log(`[API-${requestId}] 📤 RESPONSE (200 - stale cache):`, JSON.stringify(staleResponse));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(staleResponse));
          return;
        }
        
        const backendErrorResponse = { 
          status: "0", 
          balance: "0", 
          errormsg: 'Temporary backend error',
          timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
        };
        console.log(`[API-${requestId}] 📤 RESPONSE (503):`, JSON.stringify(backendErrorResponse));
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(backendErrorResponse));
        return;
      }
    }
    
    // Convert balance to USD using synchronized rate for consistency
    const rateStartTime = Date.now();
    const solToUsdRate = await getSynchronizedSolRate(username);
    const rateEndTime = Date.now();
    const balanceInSol = lamportsToSol(balanceInLamports);
    const balanceInUsd = solToUsd(balanceInSol, solToUsdRate);
    
         devLog(`[API-${requestId}] 🔍 BALANCE CALCULATION (getbalance):`, {
       username,
       originalLogin: requestData.login,
      balanceInLamports,
      solToUsdRate,
       solRateFetchTime: `${rateEndTime - rateStartTime}ms`,
      balanceInSol,
      balanceInUsd,
       finalBalance: balanceInUsd.toFixed(2),
       cacheKey,
       timestamp: new Date().toISOString()
    });
    
    devLog(`[API-${requestId}] ✅ Balance retrieved: $${balanceInUsd.toFixed(2)} for ${username}`);
    
    // API v2.0 response format with timestamp
    const responseData = { 
      status: "1", 
      balance: balanceInUsd.toFixed(2),
      timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
    };
    console.log(`[API-${requestId}] 📤 RESPONSE (200 - success):`, JSON.stringify(responseData));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responseData));
    return;
    
  } catch (error) {
    console.error(`[API-${requestId}] ❌ GetBalance API v2.0 error:`, error);
    const serverErrorResponse = { 
      status: "0", 
      balance: "0", 
      errormsg: 'Internal server error',
      timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
    };
    console.log(`[API-${requestId}] 📤 RESPONSE (500):`, JSON.stringify(serverErrorResponse));
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(serverErrorResponse));
    return;
  }
} 