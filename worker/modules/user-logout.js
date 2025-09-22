/**
 * Handle user logout requests
 * Updates the user's signed_in status to false
 */
export async function handleUserLogout(req, res, requestId, supabase) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Parse request body
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { walletAddress } = JSON.parse(body);
        
        if (!walletAddress) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing walletAddress' }));
          return;
        }

        console.log(`👋 [API-${requestId}] User logout request for wallet: ${walletAddress.substring(0, 8)}...`);

        // Update user's signed_in status to false
        const { error } = await supabase
          .from('users')
          .update({ signed_in: false })
          .eq('wallet_address', walletAddress);

        if (error) {
          console.error(`❌ [API-${requestId}] Error logging out user:`, error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to logout' }));
          return;
        }

        console.log(`✅ [API-${requestId}] User logged out successfully: ${walletAddress.substring(0, 8)}...`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));

      } catch (parseErr) {
        console.error(`❌ [API-${requestId}] Error parsing request body:`, parseErr);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });

  } catch (err) {
    console.error(`❌ [API-${requestId}] User logout error:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
} 