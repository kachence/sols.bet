import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { GemType } from '@/constants';

export interface GemCollection {
  garnet: number;
  amethyst: number;
  topaz: number;
  sapphire: number;
  emerald: number;
  ruby: number;
  diamond: number;
  total: number;
  lastUpdated: string;
  [key: string]: number | string; // Allow string indexing
}

export interface GemIncrement {
  gemType: keyof GemCollection;
  amount: number;
  timestamp: number;
}

export function useGemCollection() {
  const { connected, publicKey } = useWallet();
  const [gemCollection, setGemCollection] = useState<GemCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gemIncrements, setGemIncrements] = useState<GemIncrement[]>([]);
  
  // For caching
  const cacheRef = useRef<{ data: GemCollection; timestamp: number } | null>(null);
  const CACHE_DURATION = 60000; // 1 minute client-side cache
  
  // Real-time subscription ref
  const subscriptionRef = useRef<any>(null);
  
  // Debounce ref for increment detection
  const lastIncrementRef = useRef<{ [key: string]: number }>({});

  // Get username from wallet
  const username = publicKey?.toString().substring(0, 20);

  // Add gem increment animation
  const addGemIncrement = useCallback((gemType: keyof GemCollection, amount: number) => {
    if (gemType === 'total' || gemType === 'lastUpdated') return;
    
    console.log(`🎬 Adding gem increment animation: ${gemType} +${amount}`);
    
    const increment: GemIncrement = {
      gemType,
      amount,
      timestamp: Date.now()
    };
    
    setGemIncrements(prev => {
      // Remove any existing increments for the same gem type to prevent duplicates
      const filteredIncrements = prev.filter(inc => inc.gemType !== gemType);
      const newIncrements = [...filteredIncrements, increment];
      console.log('🎬 New increments after adding:', newIncrements);
      return newIncrements;
    });
    
    // Remove after animation duration (2 seconds)
    setTimeout(() => {
      setGemIncrements(prev => prev.filter(inc => inc.timestamp !== increment.timestamp));
    }, 2000);
  }, []);

  // Fetch gem collection from API
  const fetchGemCollection = useCallback(async (useCache = true) => {
    if (!username) return null;

    // Check cache first
    if (useCache && cacheRef.current) {
      const cacheAge = Date.now() - cacheRef.current.timestamp;
      if (cacheAge < CACHE_DURATION) {
        console.log('🚀 Using cached gem collection');
        return cacheRef.current.data;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const workerUrl = 'https://casino-worker-v2.fly.dev';

      const response = await fetch(`${workerUrl}/gem-collection?username=${encodeURIComponent(username)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch gem collection');
      }

      const newCollection = result.data;
      
      console.log('🔍 Gem collection API response:', result);
      console.log('💎 New collection data:', newCollection);
      
      // Check for increments if we have previous data
      if (gemCollection) {
        const now = Date.now();
        
        for (const [gemType, newCount] of Object.entries(newCollection)) {
          if (gemType === 'total' || gemType === 'lastUpdated') continue;
          
          const oldCount = gemCollection[gemType as keyof GemCollection] as number;
          const increment = (newCount as number) - oldCount;
          
          if (increment > 0) {
            // Debounce: only show animation if it's been at least 3 seconds since last increment for this gem
            const lastIncrement = lastIncrementRef.current[gemType] || 0;
            if (now - lastIncrement > 3000) {
              console.log(`💎 Gem increment detected: ${gemType} +${increment}`);
              addGemIncrement(gemType as keyof GemCollection, increment);
              lastIncrementRef.current[gemType] = now;
            }
          }
        }
      }

      // Update cache
      cacheRef.current = {
        data: newCollection,
        timestamp: Date.now()
      };

      setGemCollection(newCollection);
      return newCollection;
    } catch (err) {
      console.error('Failed to fetch gem collection:', err);
      setError(err instanceof Error ? err.message : 'Failed to load gem collection');
      return null;
    } finally {
      setLoading(false);
    }
  }, [username, gemCollection, addGemIncrement]);

  // Setup real-time subscription and initial fetch
  useEffect(() => {
    if (!connected || !username) {
      // Cleanup subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      setGemCollection(null);
      setGemIncrements([]);
      cacheRef.current = null;
      return;
    }

    // Only setup subscription on client side
    if (typeof window !== 'undefined') {
      // Dynamically import supabase only on client side
      import('@/lib/supabase').then(({ supabase }) => {
        // Subscribe to user changes for real-time gem updates
        subscriptionRef.current = supabase
          .channel('gem-updates')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `username=eq.${username}`
            },
            (payload: any) => {
              console.log('💎 Real-time gem update received:', payload);
              
              // Invalidate cache and refetch
              cacheRef.current = null;
              fetchGemCollection(false);
            }
          )
          .subscribe();
      }).catch(err => {
        console.warn('Failed to setup real-time subscription:', err);
      });
    }

    // Initial fetch
    fetchGemCollection();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [connected, username, fetchGemCollection]);

  // Manual refresh function
  const refreshGemCollection = useCallback(() => {
    cacheRef.current = null;
    return fetchGemCollection(false);
  }, [fetchGemCollection]);

  return {
    gemCollection,
    loading,
    error,
    gemIncrements,
    refreshGemCollection,
    addGemIncrement // Expose for manual testing
  };
} 