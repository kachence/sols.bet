import { lamportsToSol, solToUsd, getSolToUsdRate, getSynchronizedSolRate, rpcWithRetry, json, extractUsername } from './shared-utils.js';
import { parse } from 'url';

// Development logging helpers
const isDev = false; // process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
const devLog = (...args) => {
  if (isDev) console.log(...args);
};
const devWarn = (...args) => {
  if (isDev) console.warn(...args);
};
const devError = (...args) => {
  if (isDev) console.error(...args);
};

export async function handleWalletBalance(req, res, requestId, supabase, redis) {
  // devLog(`[API-${requestId}] 💰 WALLET-BALANCE START: ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - wallet-balance disabled`); // Always log critical errors
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    return;
  }
  
  const parsedUrl = parse(req.url, true);
  const rawUser = parsedUrl.query.user;
  
  if (!rawUser || typeof rawUser !== 'string') {
    console.log(`[API-${requestId}] ❌ Missing or invalid user parameter`); // Always log validation errors
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'user query param required' }));
    return;
  }

  // CRITICAL: Extract username same way as getbalance.js for consistency
  const user = extractUsername(rawUser);
  // devLog(`[API-${requestId}] Username extracted: ${user} from raw: ${rawUser}`);
  
  try {
    // Single cache key for user balance (simplified approach)
    const cacheKey = `user:balance:${user}`;

    // Try cache first
    let lamports = await redis.get(cacheKey);

    // Database fallback only when cache completely misses
    if (lamports === null) {
      // devLog(`[API-${requestId}] Cache miss, fetching from database for user: ${user}`);
      
      const { data: rpcRows } = await rpcWithRetry(
        supabase,
        'get_user_balance',
        { p_login: user }
      );

      // Supabase returns an array of rows for TABLE-returning functions
      const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;

      if (!row?.found) {
        lamports = 0;
        // devLog(`[API-${requestId}] User not found in database, defaulting to 0 balance`);
      } else {
        lamports = Number(row.balance_lamports ?? row.balance ?? 0);
        // devLog(`[API-${requestId}] Retrieved balance from database: ${lamports} lamports`);
      }

      // Cache for 5 minutes (standard TTL)
      await redis.set(cacheKey, lamports, { ex: 300 });
      // devLog(`[API-${requestId}] Cached balance for 5 minutes`);
    } else {
      // devLog(`[API-${requestId}] Retrieved balance from cache: ${lamports} lamports`);
    }

    // Get synchronized SOL rate for this user to ensure consistency with getbalance
    const rateStartTime = Date.now();
    const rate = await getSynchronizedSolRate(user);
    const rateEndTime = Date.now();
    const sol = lamportsToSol(lamports);
    const usd = solToUsd(sol, rate);

    const payload = { 
      balanceLamports: lamports, 
      balanceSol: sol, 
      balanceUsd: usd,
      // Add rounded USD for consistency checking
      balanceUsdRounded: parseFloat(usd.toFixed(2))
    };
    
             //      devLog(`[API-${requestId}] 🔍 BALANCE CALCULATION (wallet-balance):`, {
    //   rawUser,
    //   processedUser: user,
    //   lamports,
    //   solRate: rate,
    //   solRateFetchTime: `${rateEndTime - rateStartTime}ms`,
    //   sol,
    //   usd,
    //   usdRounded: usd.toFixed(2),
    //   cacheKey,
    //   timestamp: new Date().toISOString()
    // });
    
    // devLog(`[API-${requestId}] ✅ Wallet balance retrieved for ${user}: ${usd.toFixed(2)} USD`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  } catch (error) {
    console.error(`[API-${requestId}] ❌ Wallet balance error:`, error); // Always log fatal errors
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal' }));
    return;
  }
} 