import { lamportsToSol, solToUsd, getSolToUsdRate, json } from './shared-utils.js';
import { parse } from 'url';
import { GAME_NAME_MAP, GAME_ID_MAP, getGameName, getGameSlug } from '../lib/gameMappings.js';

// Development logging helpers
const isDev = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
const devLog = (...args) => {
  if (isDev) console.log(...args);
};
const devWarn = (...args) => {
  if (isDev) console.warn(...args);
};
const devError = (...args) => {
  if (isDev) console.error(...args);
};

export async function handleLiveWins(req, res, requestId, supabase, redis) {
  // devLog(`[API-${requestId}] 🏆 LIVE-WINS START: ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - live-wins endpoint disabled`); // Always log critical errors
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    return;
  }
  
  const parsedUrl = parse(req.url, true);
  const limit = parseInt(parsedUrl.query.limit) || 15;
  const minAmountUsd = parseFloat(parsedUrl.query.minAmount) || 0.01; // Changed from 0 to 0.01 to show small wins
  
  // devLog(`[API-${requestId}] Live-wins params:`, { limit, minAmountUsd });
  
  // Cache key should include limit and minAmount to prevent cross-contamination
  const cacheKey = `live-wins:limit-${limit}:min-${minAmountUsd}`;
  
  // Check Redis cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      // devLog(`[API-${requestId}] ✅ Returning cached live-wins`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ wins: cached }));
      return;
    }
  } catch (cacheErr) {
    devWarn(`[API-${requestId}] Redis cache check failed:`, cacheErr);
  }
  
  try {
    // Get winning transactions from the main transactions table
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .in('type', ['bet', 'win']) // Get both bets and wins to calculate multipliers
      .eq('status', 'completed')
      .not('game_round', 'is', null)
      .not('type', 'in', '(deposit,withdrawal,withdraw)') // Exclude deposits and withdrawals
      .order('created_at', { ascending: false })
      .limit(limit * 20); // Get more to have enough data after grouping by rounds
    
    // devLog(`[API-${requestId}] Database query result:`, {
    //   error: error?.message,
    //   transactions_returned: transactions?.length
    // });
    
    if (error) {
      console.error(`[API-${requestId}] Supabase error:`, error); // Always log database errors
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
      return;
    }
    
    if (!transactions || transactions.length === 0) {
      // devLog(`[API-${requestId}] No wins found`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ wins: [] }));
      return;
    }
    
    // Using centralized game mappings
    
    // Get current SOL/USD rate for accurate conversions
    const currentSolRate = await getSolToUsdRate();
    
    // Group transactions by game_round and aggregate (similar to user-bets)
    const gameRounds = {};
    
    transactions.forEach(tx => {
      const roundId = tx.game_round;
      if (!gameRounds[roundId]) {
        gameRounds[roundId] = {
          game_round: roundId,
          game_id: tx.game_id,
          player_id: tx.player_id,
          bet_amount: 0,
          win_amount: 0,
          transactions: [],
          latest_timestamp: tx.created_at,
          signature: tx.txid || tx.transaction_id || roundId
        };
      }
      
      gameRounds[roundId].transactions.push(tx);
      
      // Convert amount to USD for aggregation
      let usdAmount = 0;
      if (tx.amount_usd !== null && tx.amount_usd !== undefined) {
        // Use amount_usd column (stored in cents, convert to dollars)
        usdAmount = tx.amount_usd / 100;
      } else if (tx.metadata?.usd_amount) {
        usdAmount = parseFloat(tx.metadata.usd_amount);
      } else {
        // Fallback to old conversion logic if amount_usd is not available
        if (tx.currency === 'USD' && tx.amount) {
        if (tx.amount >= 1000000) {
          // Likely lamports stored as USD
          const solAmount = lamportsToSol(tx.amount);
          usdAmount = solToUsd(solAmount, currentSolRate);
        } else {
          usdAmount = tx.amount;
        }
      } else if (tx.currency === 'SOL' && tx.amount) {
        const solAmount = lamportsToSol(tx.amount);
        usdAmount = solToUsd(solAmount, currentSolRate);
      } else if (tx.amount && tx.amount >= 1000000) {
        // Assume lamports
        const solAmount = lamportsToSol(tx.amount);
        usdAmount = solToUsd(solAmount, currentSolRate);
      } else {
        usdAmount = tx.amount || 0;
        }
      }
      
      if (tx.type === 'bet') {
        gameRounds[roundId].bet_amount += Math.abs(usdAmount); // Ensure positive
      } else if (tx.type === 'win') {
        gameRounds[roundId].win_amount += usdAmount;
      }
      
      // Keep the latest timestamp for sorting
      if (tx.created_at > gameRounds[roundId].latest_timestamp) {
        gameRounds[roundId].latest_timestamp = tx.created_at;
      }
    });
    
    // Convert to array, filter winning rounds only, and sort by latest timestamp
    const winningRounds = Object.values(gameRounds)
      .filter(round => round.win_amount > 0) // Only include rounds with wins
      .sort((a, b) => new Date(b.latest_timestamp) - new Date(a.latest_timestamp));
    
    // Transform data for frontend consumption
    const liveWins = winningRounds
      .map((round) => {
        const winAmount = round.win_amount;
        const betAmount = round.bet_amount;
        
        // Ensure we have a reasonable win amount (allow very small wins)
        if (winAmount <= 0 || winAmount > 1000000) {
          devWarn(`[LIVE-WINS] Filtering out invalid win amount: $${winAmount}`);
          return null;
        }
        
        // Calculate multiplier
        const multiplier = betAmount > 0 ? (winAmount / betAmount) : 0;
        
        // Map numeric game IDs to slug IDs & friendly names using centralized functions
        const numericGameId = round.game_id?.toString() || 'external_game';
        const slugId = getGameSlug(numericGameId);
        const gameName = getGameName(numericGameId);
        
        // Debug: Log when we encounter null/missing game_id
        if (!round.game_id && isDev) {
          devLog(`[LIVE-WINS] Missing game_id for round ${round.game_round}, defaulting to external_game`);
        }
        
        // Format wallet address
        const walletAddress = round.player_id || 'Unknown';
        const formattedWallet = walletAddress.length > 8 
          ? `${walletAddress.substring(0, 4)}...${walletAddress.slice(-4)}`
          : walletAddress;
        
        // Find a transaction with actual txid (not NULL) for verification
        const txWithSignature = round.transactions.find(tx => tx.txid && tx.txid !== null);
        const actualSignature = txWithSignature?.txid || null;
        
        // Extract gems data from transactions gems_awarded column (same logic as user-bets.js)
        const gemsEarned = {};
        round.transactions.forEach(tx => {
          if (tx.gems_awarded && typeof tx.gems_awarded === 'object') {
            // Aggregate gems from all transactions in this round
            Object.entries(tx.gems_awarded).forEach(([gemType, count]) => {
              if (typeof count === 'number' && count > 0) {
                gemsEarned[gemType] = (gemsEarned[gemType] || 0) + count;
              }
            });
          }
        });

        return {
          id: round.signature, // Unique identifier (keep for backwards compatibility)
          gameId: slugId,
          gameName,
          amount: winAmount, // Preserve decimal precision for accurate display
          wallet: formattedWallet,
          timestamp: round.latest_timestamp,
          // New fields for RecentPlays.tsx
          betAmount: betAmount,
          multiplier: multiplier,
          winAmount: winAmount, // Preserve decimal precision for accurate display
          signature: actualSignature, // Use actual txid for verify links
          gems: Object.keys(gemsEarned).length > 0 ? gemsEarned : undefined // Include gems if any were earned
        };
      })
      .filter((win) => win !== null && win.amount >= minAmountUsd) // Filter out null values and below minimum
      .slice(0, limit);
    
    // devLog(`[API-${requestId}] Transformed ${liveWins.length} wins`);
    
    // Cache result for 10 seconds
    try {
      await redis.set(cacheKey, liveWins, { ex: 10 });
      // devLog(`[API-${requestId}] ✅ Cached live-wins for 10s`);
    } catch (cacheSetErr) {
      devWarn(`[API-${requestId}] Redis cache set failed:`, cacheSetErr);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ wins: liveWins }));
    return;
    
  } catch (error) {
    const errMsg = error?.message || String(error);
    console.error(`[API-${requestId}] Error in live-wins:`, error); // Always log fatal errors
    
    if (/EMFILE|too many open files/i.test(errMsg)) {
      // Attempt to return last cached wins if available
      try {
        const cached = await redis.get('live-wins:recent');
        if (cached) {
          // devLog(`[API-${requestId}] ⚡ Fallback to cached wins due to EMFILE`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ wins: cached }));
          return;
        }
      } catch {}
      
      console.log(`[API-${requestId}] ❌ EMFILE error, no cache available`); // Always log critical errors
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'backend busy, retry' }));
      return;
    }
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return;
  }
} 