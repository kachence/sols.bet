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

export async function handleDeposit(req, res, requestId, supabase, redis) {
  devLog(`[API-${requestId}] 💰 DEPOSIT START: ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - deposit disabled`); // Always log critical errors
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

    devLog(`[API-${requestId}] 🔍 Extracted fields:`, {
      walletAddress: walletAddress || 'MISSING',
      amountLamports: amountLamports || 'MISSING',
      transactionId: transactionId || 'MISSING',
      vaultAddress: vaultAddress || 'not provided',
      transactionHash: transactionHash || 'not provided',
      currency,
      walletAddressType: typeof walletAddress,
      amountLamportsType: typeof amountLamports,
      transactionIdType: typeof transactionId
    });

    // Validate required fields
    if (!walletAddress || !amountLamports || !transactionId) {
      console.log(`[API-${requestId}] ❌ Missing required fields validation failed`); // Always log validation errors
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Missing required fields: walletAddress, amountLamports, transactionId'
      }));
      return;
    }

    // Validate currency (for now only SOL)
    if (currency !== 'SOL') {
      console.log(`[API-${requestId}] ❌ Invalid currency: ${currency}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Only SOL deposits are currently supported'
      }));
      return;
    }

    // Validate amount is positive
    if (amountLamports <= 0) {
      console.log(`[API-${requestId}] ❌ Invalid amount: ${amountLamports}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Deposit amount must be positive'
      }));
      return;
    }

    devLog(`[API-${requestId}] ✅ All validations passed`);
    devLog(`[API-${requestId}] 🔄 Processing deposit:`, {
      walletAddress,
      amountLamports,
      solAmount: lamportsToSol(amountLamports),
      transactionId,
      vaultAddress
    });

    // Get SOL to USD rate for balance display
    devLog(`[API-${requestId}] 📊 Fetching SOL to USD rate...`);
    let solToUsdRate = 100; // Fallback rate
    try {
      const rateStartTime = Date.now();
      solToUsdRate = await getSolToUsdRate();
      const rateEndTime = Date.now();
      devLog(`[API-${requestId}] ✅ SOL rate fetched: $${solToUsdRate} (took ${rateEndTime - rateStartTime}ms)`);
    } catch (priceError) {
      devWarn(`[API-${requestId}] ⚠️ Failed to fetch SOL price, using fallback rate:`, priceError);
    }

    // Convert wallet address to username format (first 20 chars)
    const username = walletAddress.substring(0, 20);
    devLog(`[API-${requestId}] 👤 Username format: ${walletAddress} -> ${username}`);

    // Check for duplicate transaction
    devLog(`[API-${requestId}] 🔍 Checking for duplicate transaction: ${transactionId}`);
    const duplicateStartTime = Date.now();
    
    const { data: duplicateRes, error: duplicateErr } = await rpcWithRetry(supabase, 'check_duplicate_transaction', {
      p_transaction_id: transactionId
    });

    const duplicateEndTime = Date.now();
    devLog(`[API-${requestId}] 🔍 Duplicate check completed (took ${duplicateEndTime - duplicateStartTime}ms)`);

    if (duplicateErr) {
      console.error(`[API-${requestId}] ❌ Duplicate check RPC error:`, duplicateErr);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Database error during duplicate check' 
      }));
      return;
    }

    if (duplicateRes?.found) {
      devLog(`[API-${requestId}] ✅ Duplicate transaction detected, returning cached balance`);
      const balanceInLamports = Number(duplicateRes.balance) || 0;
      const balanceInUsd = solToUsd(lamportsToSol(balanceInLamports), solToUsdRate);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        balance: balanceInLamports,
        balanceUsd: balanceInUsd
      }));
      return;
    }

    devLog(`[API-${requestId}] ✅ No duplicate found, proceeding with deposit`);

    // Perform atomic balance update via RPC
    const metadata = {
      currency: 'SOL',
      vault_address: vaultAddress,
      vault_transaction_hash: transactionHash,
      deposit_source: 'smart_vault',
      sol_to_usd_rate: solToUsdRate
    };

    // Calculate USD amount in cents
    const solAmount = lamportsToSol(amountLamports);
    const usdAmount = solToUsd(solAmount, solToUsdRate);
    const usdCents = Math.round(usdAmount * 100); // Convert to cents

    const rpcParams = {
      p_username: username,
      p_amount_lamports: amountLamports,
      p_amount_usd: usdCents,
      p_operation: 'deposit', // Using 'deposit' operation to add funds
      p_transaction_id: transactionId,
      p_game_id: 'vault_deposit',
      p_game_round: transactionId,
      p_metadata: metadata
    };

    devLog(`[API-${requestId}] 🔄 Calling update_user_balance RPC...`);

    const updateStartTime = Date.now();
    const { data: updateRes, error: updateErr } = await rpcWithRetry(supabase, 'update_user_balance', rpcParams);
    const updateEndTime = Date.now();

    devLog(`[API-${requestId}] 🔄 RPC call completed (took ${updateEndTime - updateStartTime}ms)`);

    if (updateErr) {
      console.error(`[API-${requestId}] ❌ Update balance RPC error:`, updateErr);
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

    // Success – return new balance
    const newBalanceLamports = Number(result.balance) || 0;
    const newBalanceUsd = solToUsd(lamportsToSol(newBalanceLamports), solToUsdRate);

    devLog(`[API-${requestId}] ✅ Deposit successful:`, {
      newBalanceLamports,
      newBalanceSol: lamportsToSol(newBalanceLamports),
      newBalanceUsd,
      transactionId,
      amountDeposited: amountLamports,
      executionTime: Date.now() - startTime + 'ms'
    });

    // Update Redis cache with the fresh balance (single cache approach)
    devLog(`[API-${requestId}] 🔄 Updating Redis cache...`);
    try {
      const cacheKey = `user:balance:${username}`;
      const prevKey = `user:balance_prev:${username}`;
      const tsKey = `user:balance_ts:${username}`;

      // Get previous balance first, then pipeline the updates
      const prev = await redis.get(cacheKey);
      
      const depositCachePipe = redis.pipeline();
      if (prev !== null && prev !== undefined) {
        depositCachePipe.set(prevKey, prev, { ex: 120 });  // Store previous for animation
      }
      depositCachePipe.set(cacheKey, newBalanceLamports, { ex: 300 });     // Single balance cache
      depositCachePipe.set(tsKey, Date.now(), { ex: 300 });                // Timestamp
      await depositCachePipe.exec();
      
      devLog(`[API-${requestId}] ✅ Updated cache: ${cacheKey} = ${newBalanceLamports} lamports`);
    } catch (cacheErr) {
      devWarn(`[API-${requestId}] ⚠️ Failed to update Redis balance cache:`, cacheErr);
    }
    
    const totalExecutionTime = Date.now() - startTime;
    devLog(`[API-${requestId}] ✅ ======= Deposit Complete =======`);
    devLog(`[API-${requestId}] ✅ Total execution time: ${totalExecutionTime}ms`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      balance: newBalanceLamports,
      balanceUsd: newBalanceUsd
    }));
    return;

  } catch (error) {
    const totalExecutionTime = Date.now() - startTime;
    console.error(`[API-${requestId}] ❌ ======= DEPOSIT FATAL ERROR =======`);
    console.error(`[API-${requestId}] ❌ Execution time before error: ${totalExecutionTime}ms`);
    console.error(`[API-${requestId}] ❌ Error:`, error);
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }));
    return;
  }
} 