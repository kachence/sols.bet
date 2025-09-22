/**
 * Generate a deterministic referral code from a wallet address
 * Uses the same algorithm as the worker for consistency
 */
export function generateReferralCode(walletAddress: string): string {
  if (!walletAddress) return "";
  
  // Create a simple hash of the wallet address (same as worker)
  let hash = 0;
  for (let i = 0; i < walletAddress.length; i++) {
    const char = walletAddress.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to positive number and create a 8-character code
  const positiveHash = Math.abs(hash);
  const referralCode = positiveHash.toString(36).substring(0, 8).toUpperCase();
  
  return referralCode;
}

/**
 * Resolve a referral code to a wallet address via the worker API
 */
export async function resolveReferralCode(referralCode: string): Promise<string | null> {
  if (!referralCode) return null;
  
  try {
    const response = await fetch(`https://casino-worker-v2.fly.dev/resolve-referral?code=${referralCode}`);
    const data = await response.json();
    
    if (response.ok && data.walletAddress) {
      return data.walletAddress;
    }
    
    return null;
  } catch (error) {
    console.error('Error resolving referral code:', error);
    return null;
  }
}

/**
 * Extract referral code from URL query parameters
 */
export function getReferralCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('ref');
} 