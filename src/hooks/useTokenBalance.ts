import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getSolToUsdRate } from '@/lib/utils';

const LAMPORTS_PER_SOL = 1_000_000_000;

interface TokenBalanceResult {
  balanceLamports: number;
  balanceSol: number;
  balanceUsd: number;
  bonusBalance: number;
  /** @deprecated use balanceLamports instead */
  balance?: number;
}

export function useTokenBalance(refreshMs = 3_000): TokenBalanceResult {
  const { publicKey } = useWallet();

  const [state, setState] = useState<TokenBalanceResult & { balance: number }>({
    balanceLamports: 0,
    balanceSol: 0,
    balanceUsd: 0,
    bonusBalance: 0,
    balance: 0,
  });

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // HTTP polling function
  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;

    try {
      const shortId = publicKey.toString().substring(0, 20);
      const res = await fetch(`https://casino-worker-v2.fly.dev/wallet-balance?user=${shortId}`);
      const json = await res.json();

      if (json.balanceLamports !== undefined) {
        const rate = await getSolToUsdRate();
        const balanceSol = json.balanceLamports / LAMPORTS_PER_SOL;
        const balanceUsd = balanceSol * rate;

        setState({
          balanceLamports: json.balanceLamports as number,
          balanceSol,
          balanceUsd,
          bonusBalance: 0,
          balance: json.balanceLamports as number,
        });
      }
    } catch (e) {
      console.warn('Failed to fetch balance:', e);
    }
  }, [publicKey]);

  // Reset state when wallet disconnects
  useEffect(() => {
    if (!publicKey) {
      setState({ balanceLamports: 0, balanceSol: 0, balanceUsd: 0, bonusBalance: 0, balance: 0 });
      
      // Clean up polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      return;
    }

    // Fetch immediately
    fetchBalance();
    
    // Set up polling
    pollIntervalRef.current = setInterval(fetchBalance, refreshMs);

    // Cleanup function
    return () => {
      if (pollIntervalRef.current) {
        console.log(`[Balance] Stopping polling`);
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [publicKey, fetchBalance, refreshMs]);

  // Handle visibility change (resync when tab becomes visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && publicKey) {
        console.log(`[Balance] Tab visible, syncing balance`);
        fetchBalance();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [publicKey, fetchBalance]);

  return state;
} 