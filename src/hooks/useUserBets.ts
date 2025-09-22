import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export interface UserBet {
  gameId: string;
  gameName: string;
  bet: number;
  payout: number;
  multiplier: number;
  profit: number;
  timestamp: string;
  signature: string;
  user: string;
  time: string;
  gems?: Record<string, number>; // Gems awarded for this game round
}

export function useUserBets(limit = 12): UserBet[] {
  const [bets, setBets] = useState<UserBet[]>([]);
  const [loading, setLoading] = useState(false);
  const wallet = useWallet();
  
  useEffect(() => {
    if (!wallet.publicKey) {
      setBets([]);
      return;
    }

    const fetchUserBets = async () => {
      try {
        setLoading(true);
        const username = wallet.publicKey!.toString().substring(0, 20);
        
        const response = await fetch(
          `https://casino-worker-v2.fly.dev/user-bets?user=${encodeURIComponent(username)}&limit=${limit}`,
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
        setBets(data.bets || []);
      } catch (error) {
        console.error('Failed to fetch user bets:', error);
        setBets([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserBets();
  }, [wallet.publicKey, limit]);

  return bets;
} 