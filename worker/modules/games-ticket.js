import fetch from 'node-fetch';
import { json } from './shared-utils.js';
import { isSlotGame, getGameMinBet, getGameMaxBet } from '../lib/gameMappings.js';

// Development logging helpers
const isDev = 'development' === 'development';
const devLog = (...args) => isDev && console.log(...args);
const devWarn = (...args) => isDev && console.warn(...args);
const devError = (...args) => isDev && console.error(...args);

/**
 * Handle games ticket requests
 * POST: Create game ticket for CWS API integration
 */
export async function handleGamesTicket(req, res, requestId, redis) {
  devLog(`[API-${requestId}] 🎫 TICKET START: ${req.method} ${req.url}`);
  
  const startTime = Date.now();
  
  try {
    const body = await json(req);
    const { gameId, wallet, mode } = body;
    
    devLog(`[API-${requestId}] Request validation:`, {
      gameId,
      wallet,
      mode,
      hasGameId: !!gameId,
      hasWallet: !!wallet,
      hasMode: !!mode
    });
    
    // Log the exact wallet for debugging cross-user token issues
    console.log(`[API-${requestId}] 🔍 WALLET DEBUG: Received wallet "${wallet}" for game ${gameId}`);
    
    if (!gameId || !wallet || !mode) {
      console.log(`[API-${requestId}] ❌ Missing required fields`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Missing required fields: gameId, wallet, mode'
      }));
      return;
    }
    
    if (!['real', 'fun'].includes(mode)) {
      console.log(`[API-${requestId}] ❌ Invalid mode: ${mode}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Mode must be either "real" or "fun"'
      }));
      return;
    }
    
    // Create expiry date 5 minutes in the future (GMT)
    const expiryDate = new Date(Date.now() + 5 * 60 * 1000);
    const expiryString = expiryDate.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    
    // Get configuration
    const OPERATOR_ID = process.env.OPERATOR_ID || '241';
    const CWS_ENV = process.env.CWS_ENV || 'staging';
    
    devLog(`[API-${requestId}] Environment configuration:`, {
      OPERATOR_ID,
      CWS_ENV,
      hasApiUser: !!process.env.CWS_USER,
      hasApiPass: !!process.env.CWS_PASS,
      apiUser: process.env.CWS_USER ? `${process.env.CWS_USER.substring(0, 3)}***` : 'MISSING',
      apiPassSet: !!process.env.CWS_PASS
    });
    
    // Build login with correct prefix for environment
    const username = wallet.substring(0, 20); // truncate wallet to reasonable username length
    const login = `user_${username}`;
    
    devLog(`[API-${requestId}] Login generation:`, {
      originalWallet: wallet,
      truncatedUsername: username,
      environment: CWS_ENV,
      finalLogin: login
    });
    
    // Extra debug logging to track cross-user issues
    console.log(`[API-${requestId}] 🆔 LOGIN DEBUG: wallet="${wallet}" → username="${username}" → login="${login}"`);
    
    // Validate API credentials before proceeding
    if (!process.env.CWS_USER || !process.env.CWS_PASS) {
      console.log(`[API-${requestId}] ❌ Missing CWS API credentials`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'CWS API credentials not configured'
      }));
      return;
    }

    // API v2.0 payload for getGameUrl command
    const tokenPayload = {
      command: "getGameUrl",
      environment: CWS_ENV,
      mode,                       // "real" | "fun"
      game: parseInt(gameId),     // game ID as integer
      login: login,               // username for the environment
      pass: "defaultpass123",     // simple password for demo
      currency: "USD",            // Game only supports USD, we'll convert SOL internally
      expiry_date: expiryString,
      apiusername: process.env.CWS_USER,
      apipass: process.env.CWS_PASS,
      exit_url: "https://sols.bet",
      // Add unique session identifier to prevent token caching conflicts
      session_id: `${login}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      // Additional unique parameters to force CWS to generate unique tokens per user
      user_context: `${username}_${gameId}_${mode}_${Date.now()}`,
      unique_timestamp: Date.now(),
      wallet_hash: wallet.substring(0, 8) // First 8 chars of wallet for uniqueness
      // Standard parameters for better game experience
      // hidemenu: 1                 // Hide top menu UI (Home, History, etc.)
    };

    // Add slot-specific parameters (paytable_version only works for slots)
    if (isSlotGame(gameId.toString())) {
      tokenPayload.paytable_version = "highest"; // Set RTP to 98% (highest) - slots only
      devLog(`[API-${requestId}] 🎰 Slot game detected - adding paytable_version: highest`);
    }

    // Add dynamic bet limits based on game type
    const minBet = getGameMinBet(gameId.toString());
    const maxBet = getGameMaxBet(gameId.toString());
    
    if (minBet) {
      tokenPayload.force_min_bet = minBet;
      devLog(`[API-${requestId}] 💰 Setting min bet: ${minBet}`);
    }
    
    if (maxBet) {
      tokenPayload.force_max_bet = maxBet;
      devLog(`[API-${requestId}] 💰 Setting max bet: ${maxBet}`);
    }
    
    // Add wallet URLs for real mode only
    if (mode === 'real') {
      tokenPayload.getbalance_url = 'https://casino-worker-v2.fly.dev/getbalance';
      tokenPayload.balance_adj_url = 'https://casino-worker-v2.fly.dev/balance_adj';
    
      devLog(`[API-${requestId}] 🔗 Added Fly.io wallet URLs for real mode`);
    } else {
      devLog(`[API-${requestId}] 🎮 Fun mode - no wallet URLs needed`);
    }
    
    devLog(`[API-${requestId}] API v2.0 token payload:`, {
      command: tokenPayload.command,
      environment: tokenPayload.environment,
      mode: tokenPayload.mode,
      game: tokenPayload.game,
      login: tokenPayload.login,
      currency: tokenPayload.currency,
      expiry_date: tokenPayload.expiry_date,
      hidemenu: tokenPayload.hidemenu,
      paytable_version: tokenPayload.paytable_version || 'not_set',
      force_min_bet: tokenPayload.force_min_bet || 'not_set',
      force_max_bet: tokenPayload.force_max_bet || 'not_set',
      hasApiCredentials: !!(tokenPayload.apiusername && tokenPayload.apipass),
      gameType: isSlotGame(gameId.toString()) ? 'slot' : 'classic'
    });
    
    // Step 1: Get play token from CWS API v2.0
    devLog(`[API-${requestId}] 🔄 Requesting play token from CWS API v2.0...`);
    devLog(`[API-${requestId}] 🔄 Request payload:`, JSON.stringify(tokenPayload, null, 2));
    
    // CWS REST API endpoint for token generation (production)
    const apiUrls = [
      'https://casino.sols.bet/API/restapi.php'
    ];
    
    let tokenResponse;
    let lastError;
    
    for (const apiUrl of apiUrls) {
      try {
        devLog(`[API-${requestId}] 🔄 Trying CWS API endpoint: ${apiUrl}`);
        
        tokenResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': '100x-Casino-Worker/1.0'
          },
          body: JSON.stringify(tokenPayload),
          timeout: 10000 // 10 second timeout
        });
        
        // If we get a response, break out of the loop
        break;
        
      } catch (fetchError) {
        console.log(`[API-${requestId}] ❌ Failed to reach ${apiUrl}:`, fetchError.message);
        lastError = fetchError;
        continue;
      }
    }
    
    if (!tokenResponse) {
      throw new Error(`Failed to connect to any CWS API endpoint. Last error: ${lastError?.message}`);
    }
      
    devLog(`[API-${requestId}] 🔄 CWS API response status: ${tokenResponse.status} ${tokenResponse.statusText}`);
    devLog(`[API-${requestId}] 🔄 CWS API response headers:`, Object.fromEntries(tokenResponse.headers.entries()));
    
    // Get response text first to see what we actually received
    const responseText = await tokenResponse.text();
    devLog(`[API-${requestId}] 🔄 CWS API raw response:`, responseText.substring(0, 500));
    
    if (!tokenResponse.ok) {
      throw new Error(`CWS API returned ${tokenResponse.status}: ${tokenResponse.statusText}. Response: ${responseText.substring(0, 200)}`);
    }
    
    // Check if response looks like an error page or redirect
    if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
      console.error(`[API-${requestId}] ❌ CWS API returned HTML page instead of JSON`);
      console.error(`[API-${requestId}] ❌ This usually means:`);
      console.error(`[API-${requestId}] ❌   1. Wrong API endpoint URL`);
      console.error(`[API-${requestId}] ❌   2. API v2.0 not enabled for this account`);
      console.error(`[API-${requestId}] ❌   3. Invalid API credentials`);
      console.error(`[API-${requestId}] ❌   4. Account not authorized for REST API`);
      
      // Extract any error messages from HTML if possible
      const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : 'Unknown';
      
      throw new Error(`CWS REST API returned HTML page: "${title}". This indicates the REST API endpoint is not available or account not authorized. Please contact support to verify: 1) API v2.0 enabled, 2) REST API access, 3) Account permissions.`);
    }

    // Try to parse as JSON
    let tokenData;
    try {
      tokenData = JSON.parse(responseText);
      devLog(`[API-${requestId}] 🎫 CWS API v2.0 parsed response:`, tokenData);
    } catch (parseError) {
      console.error(`[API-${requestId}] ❌ Failed to parse CWS response as JSON:`, parseError);
      throw new Error(`CWS API returned invalid JSON. Response: ${responseText.substring(0, 200)}`);
    }
    
    if (tokenData.message !== 'OK' || !tokenData.play_token) {
      throw new Error(`CWS API error: ${tokenData.message || 'No play token received'}. Full response: ${JSON.stringify(tokenData)}`);
    }
    
    // Step 2: Build the final game URL with the play token (Production)
    const gameUrl = `https://casino.sols.bet/API/play.php?play_token=${tokenData.play_token}`;
    
    devLog(`[API-${requestId}] 🎯 Generated game URL (API v2.0):`, {
      url: gameUrl,
      playToken: tokenData.play_token,
      note: "This URL should load the game with seamless wallet integration using API v2.0"
    });
    
    // CRITICAL: Create session record to prevent cross-user contamination
    // This allows getbalance to validate that requests are for the correct user
    const gameSessionKey = `game_session:${username}`;
    const sessionData = {
      wallet: wallet,
      gameId: parseInt(gameId),
      playToken: tokenData.play_token,
      createdAt: Date.now(),
      mode: mode
    };
    
    try {
      // Store session for 1 hour (games typically last < 1 hour)
      await redis.setex(gameSessionKey, 3600, JSON.stringify(sessionData));
      devLog(`[API-${requestId}] 🔐 Session stored for user: ${username} (1 hour TTL)`);
    } catch (sessionError) {
      console.log(`[API-${requestId}] ⚠️ Failed to store session (proceeding anyway):`, sessionError.message);
    }
    
    // Return launch URL to the front-end
    const response = {
      success: true,
      launch: gameUrl,
      debug: {
        payload: tokenPayload,
        playToken: tokenData.play_token,
        requestId,
        mode,
        walletIntegration: mode === 'real' ? 'enabled' : 'disabled',
        apiVersion: "2.0",
        note: "This URL should be opened in an iframe or new window"
      }
    };
    
    const endTime = Date.now();
    devLog(`[API-${requestId}] ✅ SUCCESS - API v2.0 Ticket created successfully`);
    devLog(`[API-${requestId}] Response:`, JSON.stringify(response, null, 2));
    devLog(`[API-${requestId}] Request completed in ${endTime - startTime}ms`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
    return;
    
  } catch (error) {
    console.error(`[API-${requestId}] ❌ FATAL ERROR creating CWS API v2.0 game URL:`, error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to create game ticket',
      details: error.message,
      troubleshooting: {
        issue: 'CWS REST API v2.0 endpoint not responding with JSON',
        using_endpoints: {
          rest_api: 'https://casino.sols.bet/API/restapi.php',
          game_launch: 'https://casino.sols.bet/API/play.php'
        },
        likely_causes: [
          'API credentials incorrect',
          'API v2.0 not enabled for this account',
          'Account permissions insufficient'
        ],
        next_steps: [
          'Verify API credentials with support',
          'Confirm API v2.0 is enabled for the account',
          'Check account permissions'
        ]
      }
    }));
    return;
  }
} 