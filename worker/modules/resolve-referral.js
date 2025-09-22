import { generateReferralCode } from './shared-utils.js';

/**
 * Handle resolve-referral requests
 * Resolves a referral code back to the original wallet address
 */
export async function handleResolveReferral(req, res, requestId, supabase) {
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const code = urlParams.get('code');
  
  if (!code || typeof code !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Referral code is required' }));
    return;
  }

  try {
    console.log(`🔍 [API-${requestId}] Resolving referral code: ${code}`);
    
    // Fetch all users to check their referral codes
    // Note: In a production system with many users, you might want to optimize this
    // by creating a separate referral_codes table or indexing strategy
    const { data: users, error } = await supabase
      .from('users')
      .select('wallet_address')
      .limit(10000); // Reasonable limit to prevent memory issues

    if (error) {
      console.error(`❌ [API-${requestId}] Error fetching users for referral resolution:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
      return;
    }

    // Check each user's wallet address to see if it generates the matching referral code
    for (const user of users || []) {
      const userReferralCode = generateReferralCode(user.wallet_address);
      if (userReferralCode === code.toUpperCase()) {
        console.log(`✅ [API-${requestId}] Referral code ${code} resolved to wallet: ${user.wallet_address}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          walletAddress: user.wallet_address,
          referralCode: userReferralCode
        }));
        return;
      }
    }

    // No matching referral code found
    console.log(`❌ [API-${requestId}] Referral code ${code} not found`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Referral code not found' }));

  } catch (err) {
    console.error(`❌ [API-${requestId}] Error resolving referral code:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
} 