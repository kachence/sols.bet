import { lamportsToSol, solToUsd, getSolToUsdRate, json } from './shared-utils.js';
import { parse } from 'url';
import { GAME_NAME_MAP, getGameName, getGameImage } from '../lib/gameMappings.js';

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

export async function handleUserAchievements(req, res, requestId, supabase, redis) {
  devLog(`[API-${requestId}] 🏆 USER-ACHIEVEMENTS START: ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - user-achievements disabled`); // Always log critical errors
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    return;
  }
  
  const parsedUrl = parse(req.url, true);
  const user = parsedUrl.query.user;
  
  if (!user || typeof user !== 'string') {
    console.log(`[API-${requestId}] ❌ Missing user parameter`); // Always log validation errors
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'user query param required' }));
    return;
  }
  
  devLog(`[API-${requestId}] User-achievements params:`, { user });
  
  const cacheKey = `user-achievements:${user}`;
  
  // Check Redis cache first (cache for 30 seconds)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      devLog(`[API-${requestId}] ✅ Returning cached user-achievements`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cached));
      return;
    }
  } catch (cacheErr) {
    devWarn(`[API-${requestId}] Redis cache check failed:`, cacheErr);
  }
  
  try {
    devLog(`[API-${requestId}] Searching for achievements with user: "${user}"`);
    
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
    
    let winTransactions = [];
    let totalWagered = 0;
    let queryError = null;
    
    // Try each format until we find transactions
    for (const userFormat of userFormats) {
      devLog(`[API-${requestId}] Trying user format: "${userFormat}"`);
      
      // Get all win transactions and bet transactions for this user
      const { data: txData, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('player_id', userFormat)
        .in('type', ['win', 'bet'])
        .eq('status', 'completed')
        .not('game_round', 'is', null)
        .not('type', 'in', '(deposit,withdrawal,withdraw)')
        .order('created_at', { ascending: false });
        
      if (error) {
        queryError = error;
        devLog(`[API-${requestId}] Query error for "${userFormat}":`, error.message);
        continue;
      }
      
      if (txData && txData.length > 0) {
        devLog(`[API-${requestId}] Found ${txData.length} transactions for user format: "${userFormat}"`);
        
        // Separate wins and bets for calculations
        const wins = txData.filter(tx => tx.type === 'win');
        const bets = txData.filter(tx => tx.type === 'bet');
        
        winTransactions = wins;
        
        // Calculate total wagered from bet transactions
        const currentSolRate = await getSolToUsdRate();
        totalWagered = bets.reduce((total, bet) => {
          let usdAmount = 0;
          if (bet.amount_usd !== null && bet.amount_usd !== undefined) {
            // Use amount_usd column (stored in cents, convert to dollars)
            usdAmount = Math.abs(bet.amount_usd) / 100;
          } else if (bet.metadata?.usd_amount) {
            usdAmount = Math.abs(parseFloat(bet.metadata.usd_amount));
          } else {
            // Fallback to old conversion logic if amount_usd is not available
            if (bet.currency === 'USD' && bet.amount) {
            if (bet.amount >= 1000000) {
              const solAmount = lamportsToSol(Math.abs(bet.amount));
              usdAmount = solToUsd(solAmount, currentSolRate);
            } else {
              usdAmount = Math.abs(bet.amount);
            }
          } else if (bet.currency === 'SOL' && bet.amount) {
            const solAmount = lamportsToSol(Math.abs(bet.amount));
            usdAmount = solToUsd(solAmount, currentSolRate);
          } else if (bet.amount && bet.amount >= 1000000) {
            const solAmount = lamportsToSol(Math.abs(bet.amount));
            usdAmount = solToUsd(solAmount, currentSolRate);
          } else {
            usdAmount = Math.abs(bet.amount || 0);
            }
          }
          return total + usdAmount;
        }, 0);
        
        break;
      } else {
        devLog(`[API-${requestId}] No transactions found for user format: "${userFormat}"`);
      }
    }
    
    devLog(`[API-${requestId}] Database query result:`, {
      error: queryError?.message,
      win_transactions_returned: winTransactions?.length,
      total_wagered: totalWagered
    });
    
    if (queryError && winTransactions.length === 0) {
      console.error(`[API-${requestId}] Supabase error:`, queryError); // Always log database errors
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
      return;
    }
    
    // Using centralized game mappings
    
    // Calculate achievements
    let largestPayout = null;
    let luckiestBet = null;
    const currentSolRate = await getSolToUsdRate();
    
    if (winTransactions.length > 0) {
      // Find largest payout (highest win amount)
      const largestWin = winTransactions.reduce((max, win) => {
        let usdAmount = 0;
        if (win.amount_usd !== null && win.amount_usd !== undefined) {
          // Use amount_usd column (stored in cents, convert to dollars)
          usdAmount = win.amount_usd / 100;
        } else if (win.metadata?.usd_amount) {
          usdAmount = parseFloat(win.metadata.usd_amount);
        } else {
          // Fallback to old conversion logic if amount_usd is not available
          if (win.currency === 'USD' && win.amount) {
          if (win.amount >= 1000000) {
            const solAmount = lamportsToSol(win.amount);
            usdAmount = solToUsd(solAmount, currentSolRate);
          } else {
            usdAmount = win.amount;
          }
        } else if (win.currency === 'SOL' && win.amount) {
          const solAmount = lamportsToSol(win.amount);
          usdAmount = solToUsd(solAmount, currentSolRate);
        } else if (win.amount && win.amount >= 1000000) {
          const solAmount = lamportsToSol(win.amount);
          usdAmount = solToUsd(solAmount, currentSolRate);
        } else {
          usdAmount = win.amount || 0;
          }
        }
        
        return usdAmount > (max.amount || 0) ? { ...win, amount: usdAmount } : max;
      }, {});
      
      if (largestWin.amount > 0) {
        const gameId = largestWin.game_id?.toString() || 'external_game';
        const gameName = getGameName(gameId);
        
        largestPayout = {
          amount: largestWin.amount,
          multiplier: largestWin.multiplier || 1,
          gameName,
          gameImage: getGameImage(gameId)
        };
      }
      
      // Find luckiest bet (highest multiplier)
      const luckiestWin = winTransactions.reduce((max, win) => {
        const multiplier = win.multiplier || 1;
        return multiplier > (max.multiplier || 0) ? { ...win, multiplier } : max;
      }, {});
      
      if (luckiestWin.multiplier > 1) {
        const gameId = luckiestWin.game_id?.toString() || 'external_game';
        const gameName = getGameName(gameId);
        
        let winAmount = 0;
        if (luckiestWin.amount_usd !== null && luckiestWin.amount_usd !== undefined) {
          // Use amount_usd column (stored in cents, convert to dollars)
          winAmount = luckiestWin.amount_usd / 100;
        } else if (luckiestWin.metadata?.usd_amount) {
          winAmount = parseFloat(luckiestWin.metadata.usd_amount);
        } else {
          // Fallback to old conversion logic if amount_usd is not available
          if (luckiestWin.currency === 'USD' && luckiestWin.amount) {
          if (luckiestWin.amount >= 1000000) {
            const solAmount = lamportsToSol(luckiestWin.amount);
            winAmount = solToUsd(solAmount, currentSolRate);
          } else {
            winAmount = luckiestWin.amount;
          }
        } else if (luckiestWin.currency === 'SOL' && luckiestWin.amount) {
          const solAmount = lamportsToSol(luckiestWin.amount);
          winAmount = solToUsd(solAmount, currentSolRate);
        } else if (luckiestWin.amount && luckiestWin.amount >= 1000000) {
          const solAmount = lamportsToSol(luckiestWin.amount);
          winAmount = solToUsd(solAmount, currentSolRate);
        } else {
          winAmount = luckiestWin.amount || 0;
          }
        }
        
        luckiestBet = {
          multiplier: luckiestWin.multiplier,
          payout: winAmount,
          gameName,
          gameImage: getGameImage(gameId)
        };
      }
    }
    
    // Calculate rank based on wagered amount
    let currentRank;
    if (totalWagered >= 100000) {
      currentRank = "Whale";
    } else if (totalWagered >= 25000) {
      currentRank = "Highroller";
    } else if (totalWagered >= 10000) {
      currentRank = "Grinder";
    } else {
      currentRank = "Rookie";
    }
    
    const achievements = {
      totalWagered: totalWagered,
      currentRank: currentRank,
      largestPayout: largestPayout || {
        amount: 0,
        multiplier: 0,
        gameName: "No wins yet",
        gameImage: "/sols-bet-logo.png"
      },
      luckiestBet: luckiestBet || {
        multiplier: 0,
        payout: 0,
        gameName: "No wins yet",
        gameImage: "/sols-bet-logo.png"
      }
    };
    
    devLog(`[API-${requestId}] ✅ User achievements calculated:`, {
      totalWagered: achievements.totalWagered,
      hasLargestPayout: !!largestPayout,
      hasLuckiestBet: !!luckiestBet
    });
    
    // Cache result for 30 seconds
    try {
      await redis.set(cacheKey, achievements, { ex: 30 });
      devLog(`[API-${requestId}] ✅ Cached user-achievements for 30 seconds`);
    } catch (cacheSetErr) {
      devWarn(`[API-${requestId}] Redis cache set failed:`, cacheSetErr);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(achievements));
    return;
    
  } catch (error) {
    const errMsg = error?.message || String(error);
    console.error(`[API-${requestId}] Error in user-achievements:`, error); // Always log fatal errors
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return;
  }
} 