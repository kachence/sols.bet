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

export async function handleUserBets(req, res, requestId, supabase, redis) {
  devLog(`[API-${requestId}] 🎲 USER-BETS START: ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - user-bets disabled`); // Always log critical errors
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    return;
  }
  
  const parsedUrl = parse(req.url, true);
  const user = parsedUrl.query.user;
  const limit = parseInt(parsedUrl.query.limit) || 12;
  
  if (!user || typeof user !== 'string') {
    console.log(`[API-${requestId}] ❌ Missing user parameter`); // Always log validation errors
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'user query param required' }));
    return;
  }
  
  devLog(`[API-${requestId}] User-bets params:`, { user, limit });
  
  const cacheKey = `user-bets:${user}:${limit}`;
  
  // Check Redis cache first (cache for 30 seconds)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      devLog(`[API-${requestId}] ✅ Returning cached user-bets`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ bets: cached }));
      return;
    }
  } catch (cacheErr) {
    devWarn(`[API-${requestId}] Redis cache check failed:`, cacheErr);
  }
  
  try {
    devLog(`[API-${requestId}] Searching for transactions with user: "${user}"`);
    
    // First try to get the full wallet address from user table
    let fullWalletAddress = null;
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('wallet_address')
        .or(`wallet_address.eq.${user},wallet_address.like.${user}%`)
        .single();
      
      if (userData?.wallet_address && userData.wallet_address.length > user.length) {
        fullWalletAddress = userData.wallet_address;
        devLog(`[API-${requestId}] Found full wallet address: ${fullWalletAddress}`);
      }
    } catch (userErr) {
      devLog(`[API-${requestId}] Could not find full wallet address for user`);
    }
    
    // Try multiple user formats to find transactions
    const userFormats = [
      user, // Original format (20-char wallet)
      ...(fullWalletAddress ? [fullWalletAddress] : []), // Full wallet address if found
      user.substring(0, 8), // Short format
      user.toLowerCase(), // Lowercase
      user.toUpperCase(), // Uppercase
    ];
    
    let transactions = [];
    let queryError = null;
    
    // Try each format until we find transactions
    for (const userFormat of userFormats) {
      devLog(`[API-${requestId}] Trying user format: "${userFormat}"`);
      
      const { data: txData, error } = await supabase
        .from('transactions')
        .select('*, gems_awarded')
        .eq('player_id', userFormat)
        .in('status', ['completed', 'pending'])
        .not('game_round', 'is', null)
        .not('type', 'in', '(deposit,withdrawal,withdraw)') // Exclude deposits and withdrawals from betting history
        .order('created_at', { ascending: false })
        .limit(limit * 10);
        
      if (error) {
        queryError = error;
        devLog(`[API-${requestId}] Query error for "${userFormat}":`, error.message);
        continue;
      }
      
      if (txData && txData.length > 0) {
        devLog(`[API-${requestId}] Found ${txData.length} transactions for user format: "${userFormat}"`);
        transactions = txData;
        break;
      } else {
        devLog(`[API-${requestId}] No transactions found for user format: "${userFormat}"`);
      }
    }
    
    // If still no transactions, try a broader search to see what player_ids exist
    if (transactions.length === 0) {
      devLog(`[API-${requestId}] No transactions found with any format. Checking recent player_ids...`);
      
      const { data: recentTx } = await supabase
        .from('transactions')
        .select('player_id, created_at')
        .not('game_round', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);
        
      devLog(`[API-${requestId}] Recent player_ids in database:`, 
        recentTx?.map(tx => ({ player_id: tx.player_id, created_at: tx.created_at })) || 'none');
    }
    
    devLog(`[API-${requestId}] Database query result:`, {
      error: queryError?.message,
      transactions_returned: transactions?.length
    });
    
    if (queryError && transactions.length === 0) {
      console.error(`[API-${requestId}] Supabase error:`, queryError); // Always log database errors
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
      return;
    }
    
    if (transactions.length === 0) {
      devLog(`[API-${requestId}] No transactions found for user ${user}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ bets: [] }));
      return;
    }
    
    // Using centralized game mappings
    
    // Get current SOL/USD rate for accurate conversions
    const currentSolRate = await getSolToUsdRate();
    
    // Group transactions by game_round and aggregate
    const gameRounds = {};
    
    transactions.forEach(tx => {
      const roundId = tx.game_round;
      if (!gameRounds[roundId]) {
        gameRounds[roundId] = {
          game_round: roundId,
          game_id: tx.game_id,
          bet_amount: 0,
          win_amount: 0,
          transactions: [],
          latest_timestamp: tx.created_at,
          signature: tx.transaction_id || roundId,
          gems: {} // Initialize gems aggregation
        };
      }
      
      gameRounds[roundId].transactions.push(tx);
      
      // Aggregate gems from this transaction
      if (tx.gems_awarded && typeof tx.gems_awarded === 'object') {
        for (const [gemType, count] of Object.entries(tx.gems_awarded)) {
          if (typeof count === 'number' && count > 0) {
            gameRounds[roundId].gems[gemType] = (gameRounds[roundId].gems[gemType] || 0) + count;
          }
        }
      }
      
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
        gameRounds[roundId].bet_amount += usdAmount;
      } else if (tx.type === 'win') {
        gameRounds[roundId].win_amount += usdAmount;
      }
      
      // Keep the latest timestamp for sorting
      if (tx.created_at > gameRounds[roundId].latest_timestamp) {
        gameRounds[roundId].latest_timestamp = tx.created_at;
      }
    });
    
    // Convert to array and sort by latest timestamp
    const sortedRounds = Object.values(gameRounds)
      .sort((a, b) => new Date(b.latest_timestamp) - new Date(a.latest_timestamp))
      .slice(0, limit);
    
    // Transform data for frontend
    const userBets = sortedRounds.map(round => {
      const gameId = round.game_id?.toString() || 'external_game';
              const slugId = getGameSlug(gameId);
        const gameName = getGameName(gameId);
      
      const betAmount = round.bet_amount;
      const winAmount = round.win_amount;
      const netAmount = winAmount - betAmount;
      const multiplier = betAmount > 0 ? (winAmount / betAmount) : 0;
      
      // Find a transaction with actual txid (not NULL) for verification
      const txWithSignature = round.transactions.find(tx => tx.txid && tx.txid !== null);
      const actualSignature = txWithSignature?.txid || null;
      
      // Format wallet address from transaction data (like live-wins.js)
      const walletAddress = round.transactions[0]?.player_id || user;
      const formattedWallet = walletAddress.length > 8 
        ? `${walletAddress.substring(0, 4)}...${walletAddress.slice(-4)}`
        : walletAddress;
      
      return {
        gameId: slugId,
        gameName,
        bet: betAmount,
        payout: winAmount,
        multiplier: multiplier,
        profit: netAmount,
        timestamp: round.latest_timestamp,
        signature: actualSignature, // Use actual txid for verify links
        user: formattedWallet,
        time: round.latest_timestamp,
        gems: Object.keys(round.gems).length > 0 ? round.gems : undefined // Include gems if any were awarded
      };
    });
    
    devLog(`[API-${requestId}] Processed ${userBets.length} bet rounds for user ${user}`);
    
    // Cache result for 30 seconds
    try {
      await redis.set(cacheKey, userBets, { ex: 30 });
      devLog(`[API-${requestId}] ✅ Cached user-bets for 30s`);
    } catch (cacheSetErr) {
      devWarn(`[API-${requestId}] Redis cache set failed:`, cacheSetErr);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ bets: userBets }));
    return;
    
  } catch (error) {
    const errMsg = error?.message || String(error);
    console.error(`[API-${requestId}] Error in user-bets:`, error); // Always log fatal errors
    
    if (/EMFILE|too many open files/i.test(errMsg)) {
      console.log(`[API-${requestId}] ❌ EMFILE error`); // Always log critical errors
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'backend busy, retry' }));
      return;
    }
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return;
  }
} 