import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getSolToUsdRate, lamportsToSol, solToUsd } from '@/lib/utils';

interface BalanceState {
  balanceLamports: number;
  balanceSol: number;
  balanceUsd: number;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;
}

interface UseRealtimeBalanceOptions {
  username?: string;
  userId?: string;
  enableFallbackPolling?: boolean;
  fallbackInterval?: number;
}

export function useRealtimeBalance({
  username,
  userId,
  enableFallbackPolling = true,
  fallbackInterval = 30000 // 30 seconds
}: UseRealtimeBalanceOptions) {
  const [balance, setBalance] = useState<BalanceState>({
    balanceLamports: 0,
    balanceSol: 0,
    balanceUsd: 0,
    isLoading: true,
    error: null,
    lastUpdated: 0
  });

  const subscriptionRef = useRef<any>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRealtimeUpdate = useRef<number>(0);

  // Function to update balance with rate conversion
  const updateBalance = useCallback(async (balanceLamports: number) => {
    try {
      const rate = await getSolToUsdRate();
      const balanceSol = lamportsToSol(balanceLamports);
      const balanceUsd = solToUsd(balanceSol, rate);
      
      setBalance({
        balanceLamports,
        balanceSol,
        balanceUsd,
        isLoading: false,
        error: null,
        lastUpdated: Date.now()
      });
      
      lastRealtimeUpdate.current = Date.now();
    } catch (error) {
      console.error('Error updating balance:', error);
      setBalance(prev => ({
        ...prev,
        error: 'Failed to convert balance',
        isLoading: false
      }));
    }
  }, []);

  // HTTP fallback function
  const fetchBalanceFallback = useCallback(async () => {
    if (!username) return;
    
    try {
      const response = await fetch(`https://casino-worker-v2.fly.dev/wallet-balance?user=${encodeURIComponent(username)}`);
      if (!response.ok) throw new Error('Balance fetch failed');
      
      const data = await response.json();
      setBalance({
        balanceLamports: data.balanceLamports,
        balanceSol: data.balanceSol,
        balanceUsd: data.balanceUsd,
        isLoading: false,
        error: null,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Fallback balance fetch error:', error);
      setBalance(prev => ({
        ...prev,
        error: 'Failed to fetch balance',
        isLoading: false
      }));
    }
  }, [username]);

  // Initial balance fetch
  useEffect(() => {
    if (!username) return;
    
    fetchBalanceFallback();
  }, [username, fetchBalanceFallback]);

  // Set up Realtime subscription
  useEffect(() => {
    if (!userId && !username) return;

    console.log(`[Realtime] Setting up balance subscription for user: ${username || userId}`);

    // Create channel for this user
    const channel = supabase
      .channel(`balance:${username || userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          table: 'users',
          filter: userId ? `id=eq.${userId}` : `username=eq.${username}`
        },
        (payload: any) => {
          console.log(`[Realtime] Balance update received:`, payload);
          
          if (payload.new && typeof payload.new.balance === 'number') {
            updateBalance(payload.new.balance);
          }
        }
      )
      .subscribe((status: string) => {
        console.log(`[Realtime] Subscription status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Successfully subscribed to balance updates`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[Realtime] Subscription error`);
          setBalance(prev => ({
            ...prev,
            error: 'Realtime connection failed'
          }));
        }
      });

    subscriptionRef.current = channel;

    // Cleanup function
    return () => {
      if (subscriptionRef.current) {
        console.log(`[Realtime] Unsubscribing from balance updates`);
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [userId, username, updateBalance]);

  // Set up fallback polling (only if enabled and no recent Realtime updates)
  useEffect(() => {
    if (!enableFallbackPolling || !username) return;

    const pollForBalance = () => {
      const timeSinceLastUpdate = Date.now() - lastRealtimeUpdate.current;
      
      // Only poll if we haven't received a Realtime update recently
      if (timeSinceLastUpdate > fallbackInterval) {
        console.log(`[Fallback] Polling balance (no Realtime update for ${timeSinceLastUpdate}ms)`);
        fetchBalanceFallback();
      }
    };

    fallbackTimerRef.current = setInterval(pollForBalance, fallbackInterval);

    return () => {
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [enableFallbackPolling, fallbackInterval, username, fetchBalanceFallback]);

  // Handle visibility change (resync when tab becomes visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && username) {
        console.log(`[Visibility] Tab visible, syncing balance`);
        fetchBalanceFallback();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [username, fetchBalanceFallback]);

  // Manual refresh function
  const refreshBalance = useCallback(() => {
    if (username) {
      setBalance(prev => ({ ...prev, isLoading: true }));
      fetchBalanceFallback();
    }
  }, [username, fetchBalanceFallback]);

  return {
    ...balance,
    refreshBalance,
    isConnected: subscriptionRef.current !== null
  };
} 