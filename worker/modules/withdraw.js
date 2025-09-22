import { lamportsToSol, solToUsd, rpcWithRetry, getSolToUsdRate, json } from './shared-utils.js';

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

export async function handleWithdraw(req, res, requestId, supabase, redis) {
  devLog(`[API-${requestId}] 💸 WITHDRAW START: ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - withdraw disabled`); // Always log critical errors
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Service temporarily unavailable' }));
    return;
  }
  
  const startTime = Date.now();
  
  try {
    const body = await json(req);
    const { 
      walletAddress, 
      amountLamports, 
      transactionId, 
      vaultAddress,
      transactionHash,
      currency = 'SOL'
    } = body;

    // Validate required fields
    if (!walletAddress || !amountLamports || !transactionId) {
      console.log(`[API-${requestId}] ❌ Missing required fields`); // Always log validation errors
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Missing required fields: walletAddress, amountLamports, transactionId'
      }));
      return;
    }

    // Validate currency (for now only SOL)
    if (currency !== 'SOL') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Only SOL withdrawals are currently supported'
      }));
      return;
    }

    // Validate amount is positive
    if (amountLamports <= 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Withdrawal amount must be positive'
      }));
      return;
    }

    devLog(`[API-${requestId}] Processing withdrawal:`, {
      walletAddress,
      amountLamports,
      solAmount: lamportsToSol(amountLamports),
      transactionId,
      vaultAddress
    });

    // Convert wallet address to username format (first 20 chars)
    const username = walletAddress.substring(0, 20);
    devLog(`[API-${requestId}] Username format: ${walletAddress} -> ${username}`);

    // Check for duplicate transaction
    const { data: duplicateCheck, error: duplicateErr } = await supabase
      .from('transactions')
      .select('balance_after')
      .eq('transaction_id', transactionId)
      .limit(1);

    if (duplicateErr) {
      console.error(`[API-${requestId}] Duplicate check error`, duplicateErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Database error during duplicate check' 
      }));
      return;
    }

    if (duplicateCheck && duplicateCheck.length > 0) {
      devLog(`[API-${requestId}] ✅ Duplicate transaction, returning cached balance`);
      const balanceInLamports = Number(duplicateCheck[0].balance_after) || 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        balance: balanceInLamports
      }));
      return;
    }

    // Check if user has sufficient balance for withdrawal
    const { data: userRecord, error: balanceError } = await supabase
      .from('users')
      .select('balance')
      .eq('username', username)
      .limit(1);

    if (balanceError) {
      console.error(`[API-${requestId}] Error fetching user balance:`, balanceError);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Database error fetching balance'
      }));
      return;
    }

    if (!userRecord || userRecord.length === 0) {
      devLog(`[API-${requestId}] ❌ User not found: ${username}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'User not found'
      }));
      return;
    }

    const currentBalanceLamports = Number(userRecord[0].balance) || 0;
    if (currentBalanceLamports < amountLamports) {
      devLog(`[API-${requestId}] ❌ Insufficient balance: ${currentBalanceLamports} < ${amountLamports}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Insufficient balance for withdrawal'
      }));
      return;
    }

    // Perform atomic balance update via RPC
    const metadata = {
      currency: 'SOL',
      vault_address: vaultAddress,
      vault_transaction_hash: transactionHash,
      withdrawal_destination: 'smart_vault'
    };

    // Calculate USD amount in cents
    let usdCents = null;
    try {
      const solToUsdRate = await getSolToUsdRate();
      const solAmount = lamportsToSol(amountLamports);
      const usdAmount = solToUsd(solAmount, solToUsdRate);
      usdCents = Math.round(usdAmount * 100); // Convert to cents
    } catch (priceError) {
      devWarn(`[API-${requestId}] Failed to fetch SOL price for USD calculation:`, priceError);
    }

    const rpcParams = {
      p_username: username,
      p_amount_lamports: amountLamports,
      p_amount_usd: usdCents,
      p_operation: 'withdraw',
      p_transaction_id: transactionId,
      p_game_id: 'vault_withdrawal',
      p_game_round: transactionId,
      p_metadata: metadata
    };

    devLog(`[API-${requestId}] 🔄 Calling update_user_balance RPC...`);
    const { data: updateRes, error: updateErr } = await rpcWithRetry(supabase, 'update_user_balance', rpcParams);

    if (updateErr) {
      console.error(`[API-${requestId}] Update balance RPC error:`, updateErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Database error during balance update' 
      }));
      return;
    }

    // Handle TABLE function response - it returns an array, so get first row
    const result = Array.isArray(updateRes) ? updateRes[0] : updateRes;

    if (!result?.success) {
      const errCode = result?.error || 'unknown_error';
      console.error(`[API-${requestId}] ❌ Balance update failed: ${errCode}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: `Balance update failed: ${errCode}` 
      }));
      return;
    }

    const newBalanceLamports = Number(result.balance) || 0;

    devLog(`[API-${requestId}] ✅ Withdrawal successful:`, {
      newBalanceLamports,
      newBalanceSol: lamportsToSol(newBalanceLamports)
    });

    // Update Redis cache with the fresh balance (single cache approach)
    try {
      const cacheKey = `user:balance:${username}`;
      const prevKey = `user:balance_prev:${username}`;
      const tsKey = `user:balance_ts:${username}`;

      // Get previous balance first, then pipeline the updates
      const prev = await redis.get(cacheKey);
      
      const withdrawCachePipe = redis.pipeline();
      if (prev !== null && prev !== undefined) {
        withdrawCachePipe.set(prevKey, prev, { ex: 120 });  // Store previous for animation
      }
      withdrawCachePipe.set(cacheKey, newBalanceLamports, { ex: 300 });     // Single balance cache
      withdrawCachePipe.set(tsKey, Date.now(), { ex: 300 });                // Timestamp
      await withdrawCachePipe.exec();
      
      devLog(`[API-${requestId}] ✅ Updated cache: ${cacheKey} = ${newBalanceLamports} lamports`);
    } catch (cacheErr) {
      devWarn(`[API-${requestId}] Failed to update Redis balance cache`, cacheErr);
    }
    
    const durationMs = Date.now() - startTime;
    devLog(`[API-${requestId}] ⏱️ Total request duration: ${durationMs}ms`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      balance: newBalanceLamports
    }));
    return;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`[API-${requestId}] ❌ Withdrawal error after ${durationMs}ms:`, error); // Always log fatal errors
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }));
    return;
  }
} 