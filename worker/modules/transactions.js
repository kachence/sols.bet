import { parse } from 'url';
import { getSolToUsdRate, lamportsToSol } from './shared-utils.js';

// Development logging helpers
const isDev = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
const devLog = (...args) => isDev && console.log(...args);
const devWarn = (...args) => isDev && console.warn(...args);
const devError = (...args) => isDev && console.error(...args);

/**
 * Handle transactions requests (deposits and withdrawals)
 * GET: Retrieve transaction history for a user with pagination
 */
export async function handleTransactions(req, res, requestId, supabase, redis) {
  devLog(`[API-${requestId}] 💳 TRANSACTIONS START: ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - transactions disabled`);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    return;
  }
  
  const parsedUrl = parse(req.url, true);
  const user = parsedUrl.query.user;
  const limit = parseInt(parsedUrl.query.limit) || 10;
  const offset = parseInt(parsedUrl.query.offset) || 0;
  
  if (!user || typeof user !== 'string') {
    console.log(`[API-${requestId}] ❌ Missing user parameter`);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'user query param required' }));
    return;
  }
  
  devLog(`[API-${requestId}] Transactions params:`, { user, limit, offset });
  
  const cacheKey = `transactions:${user}:${limit}:${offset}`;
  
  // Check Redis cache first (cache for 30 seconds)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      devLog(`[API-${requestId}] ✅ Returning cached transactions`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ transactions: cached.transactions, total: cached.total }));
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
    
    devLog(`[API-${requestId}] Trying user formats:`, userFormats);
    
    let transactions = [];
    let totalCount = 0;
    let queryError = null;
    
    // Try each format until we find transactions
    for (const userFormat of userFormats) {
      devLog(`[API-${requestId}] Trying user format: "${userFormat}"`);
      
      // Get total count for pagination
      const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', userFormat)
        .in('type', ['deposit', 'withdrawal'])
        .eq('status', 'completed');
        
      // Get actual transactions
      const { data: txData, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('player_id', userFormat)
        .in('type', ['deposit', 'withdrawal'])
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
        
      if (error) {
        queryError = error;
        devLog(`[API-${requestId}] Query error for "${userFormat}":`, error.message);
        continue;
      }
      
      if (txData && txData.length > 0) {
        devLog(`[API-${requestId}] Found ${txData.length} transactions for user format: "${userFormat}"`);
        transactions = txData;
        totalCount = count || 0;
        break;
      } else {
        devLog(`[API-${requestId}] No transactions found for user format: "${userFormat}"`);
      }
    }
    
    devLog(`[API-${requestId}] Database query result:`, {
      error: queryError?.message,
      transactions_returned: transactions?.length,
      total_count: totalCount
    });
    
    if (queryError && transactions.length === 0) {
      console.error(`[API-${requestId}] Supabase error:`, queryError);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
      return;
    }
    
    if (transactions.length === 0) {
      devLog(`[API-${requestId}] No transactions found for user ${user}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ transactions: [], total: 0 }));
      return;
    }
    
    // Get current SOL/USD rate for accurate conversions
    const currentSolRate = await getSolToUsdRate();
    devLog(`[API-${requestId}] Current SOL rate: $${currentSolRate}`);
    
    // Transform transactions for frontend
    const userTransactions = transactions.map(tx => {
      // Convert amount to SOL for display
      let solAmount = 0;
      if (tx.currency === 'SOL' && tx.amount) {
        solAmount = lamportsToSol(tx.amount);
      } else if (tx.amount && tx.amount >= 1000000) {
        // Assume lamports
        solAmount = lamportsToSol(tx.amount);
      } else if (tx.metadata?.sol_amount) {
        solAmount = parseFloat(tx.metadata.sol_amount);
      } else {
        // Fallback: convert USD to SOL using current rate
        const usdAmount = tx.amount || 0;
        solAmount = usdAmount / currentSolRate;
      }
      
      // Use actual txid if available, otherwise fallback to transaction_id
      const actualTxId = tx.txid || tx.transaction_id || tx.id;
      const formattedTxId = actualTxId && actualTxId.length > 8 
        ? `${actualTxId.substring(0, 4)}...${actualTxId.slice(-4)}`
        : actualTxId || 'N/A';
      
      return {
        id: tx.id,
        date: tx.created_at,
        amount: solAmount,
        txid: formattedTxId,
        type: tx.type,
        signature: tx.txid || tx.transaction_id || tx.id
      };
    });
    
    devLog(`[API-${requestId}] Processed ${userTransactions.length} transactions for user ${user}`);
    
    const result = {
      transactions: userTransactions,
      total: totalCount
    };
    
    // Cache result for 30 seconds
    try {
      await redis.set(cacheKey, result, { ex: 30 });
      devLog(`[API-${requestId}] ✅ Cached transactions for 30s`);
    } catch (cacheSetErr) {
      devWarn(`[API-${requestId}] Redis cache set failed:`, cacheSetErr);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
    
  } catch (error) {
    const errMsg = error?.message || String(error);
    console.error(`[API-${requestId}] Error in transactions:`, error);
    
    if (/EMFILE|too many open files/i.test(errMsg)) {
      console.log(`[API-${requestId}] ❌ EMFILE error`);
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'backend busy, retry' }));
      return;
    }
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return;
  }
} 