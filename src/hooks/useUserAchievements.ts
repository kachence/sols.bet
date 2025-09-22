import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface UserAchievements {
  totalWagered: number;
  currentRank: string;
  largestPayout: {
    amount: number;
    multiplier: number;
    gameName: string;
    gameImage: string;
  };
  luckiestBet: {
    multiplier: number;
    payout: number;
    gameName: string;
    gameImage: string;
  };
}

export function useUserAchievements() {
  const [achievements, setAchievements] = useState<UserAchievements | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { publicKey } = useWallet();

  useEffect(() => {
    if (!publicKey) {
      setAchievements(null);
      return;
    }

    const fetchAchievements = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const username = publicKey.toString().substring(0, 20);
        
        const response = await fetch(
          `https://casino-worker-v2.fly.dev/user-achievements?user=${encodeURIComponent(username)}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        setAchievements(data);
      } catch (err) {
        console.error('Failed to fetch user achievements:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch achievements');
        setAchievements(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAchievements();
  }, [publicKey]);

  return {
    achievements,
    loading,
    error,
  };
} 