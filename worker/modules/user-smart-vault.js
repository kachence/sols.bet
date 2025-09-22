import { parse } from 'url';
import { json } from './shared-utils.js';

// Development logging helpers
const isDev = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
const devLog = (...args) => isDev && console.log(...args);

/**
 * Handle user-smart-vault requests
 * GET: Retrieve smart vault address for a wallet
 * POST: Update smart vault address for a wallet
 */
export async function handleUserSmartVault(req, res, requestId, supabase) {
  devLog(`[API-${requestId}] 🏦 USER-SMART-VAULT START: ${req.method} ${req.url}`);
  
  // Check if Supabase is available
  if (!supabase) {
    console.log(`[API-${requestId}] ❌ Supabase not available - user-smart-vault disabled`);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    return;
  }
  
  let walletAddress;
  
  if (req.method === 'GET') {
    const parsedUrl = parse(req.url, true);
    walletAddress = parsedUrl.query.walletAddress;
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      console.log(`[API-${requestId}] ❌ Missing walletAddress parameter`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing walletAddress' }));
      return;
    }
    
    devLog(`[API-${requestId}] GET smart vault for wallet: ${walletAddress}`);
    
    try {
      // Try to find user with full wallet address first
      let { data, error } = await supabase
        .from('users')
        .select('smart_vault')
        .eq('wallet_address', walletAddress)
        .single();
        
      // If not found, try with username format (20-char)
      if ((error && error.code === 'PGRST116') || !data) {
        const username = walletAddress.substring(0, 20);
        devLog(`[API-${requestId}] Full address not found, trying username format: ${username}`);
        
        const result = await supabase
          .from('users')
          .select('smart_vault')
          .eq('wallet_address', username)
          .single();
          
        data = result.data;
        error = result.error;
      }
        
      if (error && error.code !== 'PGRST116') {
        console.error(`[API-${requestId}] Database error:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database error' }));
        return;
      }
      
      devLog(`[API-${requestId}] ✅ Retrieved smart vault for ${walletAddress}: ${data?.smart_vault || 'null'}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ smart_vault: data?.smart_vault ?? null }));
      return;
      
    } catch (error) {
      console.error(`[API-${requestId}] ❌ User smart vault GET error:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
      return;
    }
  }
  
  if (req.method === 'POST') {
    try {
      const body = await json(req);
      walletAddress = body.walletAddress;
      const vaultAddress = body.vaultAddress;
      
      devLog(`[API-${requestId}] POST smart vault update:`, { walletAddress, vaultAddress });
      
      if (!walletAddress || typeof walletAddress !== 'string') {
        console.log(`[API-${requestId}] ❌ Missing walletAddress in POST body`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing walletAddress' }));
        return;
      }
      
      if (!vaultAddress || typeof vaultAddress !== 'string') {
        console.log(`[API-${requestId}] ❌ Missing vaultAddress in POST body`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing vaultAddress' }));
        return;
      }
      
      // Try to update using both wallet_address and username (20-char) as identifiers
      const username = walletAddress.substring(0, 20);
      devLog(`[API-${requestId}] Attempting update for full address: ${walletAddress}, username: ${username}`);
      
      // First try updating by full wallet address
      const { error: fullError } = await supabase
        .from('users')
        .update({ smart_vault: vaultAddress })
        .eq('wallet_address', walletAddress);
      
      // If that didn't work, try by username (20-char format)
      if (fullError) {
        devLog(`[API-${requestId}] Full wallet update failed, trying username format...`);
        const { error: usernameError } = await supabase
          .from('users')
          .update({ smart_vault: vaultAddress })
          .eq('wallet_address', username);
          
        if (usernameError) {
          console.error(`[API-${requestId}] Both update attempts failed:`, { fullError, usernameError });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to update' }));
          return;
        }
        
        devLog(`[API-${requestId}] ✅ Updated smart vault via username for ${username}: ${vaultAddress}`);
      } else {
        devLog(`[API-${requestId}] ✅ Updated smart vault via full address for ${walletAddress}: ${vaultAddress}`);
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
      
    } catch (error) {
      console.error(`[API-${requestId}] ❌ User smart vault POST error:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update' }));
      return;
    }
  }
  
  console.log(`[API-${requestId}] ❌ Method not allowed: ${req.method}`);
  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
  return;
} 