import { useState, useEffect, useCallback } from 'react';

interface LiveWin {
  id: string;
  gameId: string;
  gameName: string;
  amount: number;
  wallet: string;
  timestamp: Date;
  signature?: string;
}

interface UseLiveWinsOptions {
  limit?: number;
  minAmount?: number; // in USD dollars
  pollingInterval?: number; // in milliseconds
  instanceId?: string; // unique identifier for debugging
}

export function useLiveWins(options: UseLiveWinsOptions = {}) {
  const {
    limit = 15,
    minAmount = 0.1, // $0.1 minimum
    pollingInterval = 10000, // 10 seconds
    instanceId = `limit-${limit}` // identifier based on limit for debugging
  } = options;

  const [wins, setWins] = useState<LiveWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWins = useCallback(async () => {
    try {
      const url = `https://casino-worker-v2.fly.dev/live-wins?limit=${limit}&minAmount=${minAmount}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch live wins');
      }

      const data = await response.json();
      
      // Convert timestamp strings back to Date objects
      const winsWithDates = data.wins.map((win: any) => ({
        ...win,
        timestamp: new Date(win.timestamp)
      }));

      setWins(winsWithDates);
      setError(null);
    } catch (err) {
      console.error(`[LiveWins ${instanceId}] Error fetching live wins:`, err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [limit, minAmount, instanceId]);

  // Add new win to the list (for real-time updates)
  const addNewWin = useCallback((newWin: LiveWin) => {
    setWins(prevWins => {
      // Check if win already exists
      if (prevWins.some(win => win.id === newWin.id)) {
        return prevWins;
      }
      
      // Add new win to the beginning and keep only the latest wins
      const updatedWins = [newWin, ...prevWins].slice(0, limit);
      return updatedWins;
    });
  }, [limit]);

  // Initial fetch
  useEffect(() => {
    fetchWins();
  }, [fetchWins]);

  // Set up polling for real-time updates
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const interval = setInterval(() => {
      fetchWins();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [fetchWins, pollingInterval]);

  return {
    wins,
    loading,
    error,
    refetch: fetchWins,
    addNewWin
  };
} 