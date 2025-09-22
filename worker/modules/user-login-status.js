/**
 * Handle user login status requests
 * Checks if a user is signed in and if their session is still valid
 */
export async function handleUserLoginStatus(req, res, requestId, supabase) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Parse URL to get query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const walletAddress = url.searchParams.get('walletAddress');
    
    if (!walletAddress) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing walletAddress' }));
      return;
    }

    console.log(`🔍 [API-${requestId}] Login status check for wallet: ${walletAddress.substring(0, 8)}...`);

    // Fetch user's sign-in status and expiration
    const { data, error } = await supabase
      .from('users')
      .select('signed_in, sign_in_expire')
      .eq('wallet_address', walletAddress)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error(`❌ [API-${requestId}] Database error checking login status:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
      return;
    }

    if (!data) {
      console.log(`📝 [API-${requestId}] User not found: ${walletAddress.substring(0, 8)}...`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ signed_in: false, exp: null }));
      return;
    }

    // Check if session is still valid
    const now = new Date();
    const exp = data.sign_in_expire ? new Date(data.sign_in_expire) : null;
    const valid = data.signed_in && exp && exp > now;

    console.log(`✅ [API-${requestId}] Login status for ${walletAddress.substring(0, 8)}...: signed_in=${!!valid}, exp=${exp ? exp.toISOString() : null}`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      signed_in: !!valid, 
      exp: exp ? exp.toISOString() : null 
    }));

  } catch (err) {
    console.error(`❌ [API-${requestId}] User login status error:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
} 