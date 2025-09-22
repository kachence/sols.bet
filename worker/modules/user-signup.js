import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { generateReferralCode } from './shared-utils.js';

/**
 * Resolve referral code to wallet address
 */
async function resolveReferralCodeToWallet(referralCode, supabase) {
  if (!referralCode) return null;
  
  try {
    // Fetch all users to check their referral codes
    const { data: users, error } = await supabase
      .from('users')
      .select('wallet_address')
      .limit(10000);

    if (error) {
      console.error('Error fetching users for referral resolution:', error);
      return null;
    }

    // Check each user's wallet address to see if it generates the matching referral code
    for (const user of users || []) {
      const userReferralCode = generateReferralCode(user.wallet_address);
      if (userReferralCode === referralCode.toUpperCase()) {
        return user.wallet_address;
      }
    }
  } catch (error) {
    console.error('Error resolving referral code:', error);
  }
  
  return null;
}

/**
 * Handle user signup requests
 * Supports wallet signature verification and referral tracking
 */
export async function handleUserSignup(req, res, requestId, supabase) {
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
        const { walletAddress, signature, message, referralCode } = JSON.parse(body);
        
        if (!walletAddress || !signature || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing parameters' }));
          return;
        }

        console.log(`👤 [API-${requestId}] User signup request for wallet: ${walletAddress.substring(0, 8)}...`);
        if (referralCode) {
          console.log(`👥 [API-${requestId}] Referral code provided: ${referralCode}`);
        }

        // Verify signature
        const pubkeyBytes = bs58.decode(walletAddress);
        const sigBytes = bs58.decode(signature);
        const msgBytes = new TextEncoder().encode(message);

        const isValid = nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
        if (!isValid) {
          console.log(`❌ [API-${requestId}] Invalid signature for wallet: ${walletAddress}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signature' }));
          return;
        }

        // Resolve referral code to wallet address if provided
        let referrerWalletAddress = null;
        if (referralCode) {
          referrerWalletAddress = await resolveReferralCodeToWallet(referralCode, supabase);
          console.log(`👥 [API-${requestId}] Referral code ${referralCode} resolved to:`, referrerWalletAddress);
        }

        // Check if user already exists
        const { data: existing, error: fetchErr } = await supabase
          .from('users')
          .select('id')
          .eq('wallet_address', walletAddress)
          .single();

        if (fetchErr && fetchErr.code !== 'PGRST116') {
          console.error(`❌ [API-${requestId}] Database error checking existing user:`, fetchErr);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Database error' }));
          return;
        }

        if (existing) {
          // Existing user - update sign-in info but don't modify referral
          const username = walletAddress.substring(0, 20);
          const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          const { data: upsertRes, error: upsertErr } = await supabase
            .from('users')
            .upsert({
              wallet_address: walletAddress,
              username,
              signed_in: true,
              sign_in_expire: expiry.toISOString()
            }, { onConflict: 'wallet_address' })
            .select('id')
            .single();

          if (upsertErr) {
            console.error(`❌ [API-${requestId}] Error updating existing user:`, upsertErr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to update user' }));
            return;
          }

          console.log(`✅ [API-${requestId}] Existing user signed in: ${walletAddress.substring(0, 8)}...`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            created: false, 
            id: upsertRes.id, 
            exp: expiry.toISOString() 
          }));
          return;
        }

        // Create new user with referral information
        const username = walletAddress.substring(0, 20);
        const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const userData = {
          wallet_address: walletAddress,
          username,
          signed_in: true,
          sign_in_expire: expiry.toISOString()
        };

        // Add referral information if available
        if (referrerWalletAddress) {
          userData.referral = referrerWalletAddress;
          console.log(`👥 [API-${requestId}] Setting referral for new user ${walletAddress.substring(0, 8)}... to ${referrerWalletAddress.substring(0, 8)}...`);
        }

        const { data: upsertRes, error: upsertErr } = await supabase
          .from('users')
          .upsert(userData, { onConflict: 'wallet_address' })
          .select('id')
          .single();

        if (upsertErr) {
          console.error(`❌ [API-${requestId}] Error creating new user:`, upsertErr);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to create user' }));
          return;
        }

        console.log(`✅ [API-${requestId}] New user created: ${walletAddress.substring(0, 8)}...${referrerWalletAddress ? ' with referral' : ''}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          created: true, 
          id: upsertRes.id, 
          exp: expiry.toISOString(),
          referral: referrerWalletAddress ? true : false
        }));

      } catch (parseErr) {
        console.error(`❌ [API-${requestId}] Error parsing request body:`, parseErr);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });

  } catch (err) {
    console.error(`❌ [API-${requestId}] User signup error:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
} 