// src/hooks/useRecentPlays.ts

import { useEffect, useState } from "react";

export interface RecentPlayEvent {
  signature: string;
  user: string;
  time: number; // Unix ms
  gameId: string;
  bet: number;
  multiplier: number;
  payout: number;
}

// TEMP: generate placeholder data
function generateDummyEvents(count = 10): RecentPlayEvent[] {
  const games = [
    "tower-heist",
    "limbo",
    "plinko",
    "dice",
    "crash",
    "roulette",
  ];
  return Array.from({ length: count }).map((_, i) => {
    const bet = +(Math.random() * 5 + 0.05).toFixed(2);
    const multiplier = +(Math.random() * 4 + 0.5).toFixed(2);
    return {
      signature: `dummy_sig_${i}_${Date.now()}`,
      user: `user_${Math.random().toString(36).substring(2, 6)}`,
      time: Date.now() - i * 1000,
      gameId: games[Math.floor(Math.random() * games.length)],
      bet,
      multiplier,
      payout: +(bet * multiplier).toFixed(2),
    };
  });
}

export function useRecentPlays(_platformOnly = false): RecentPlayEvent[] {
  const [events, setEvents] = useState<RecentPlayEvent[]>([]);

  useEffect(() => {
    // Simulate fetching from Supabase later; for now dummy
    setEvents(generateDummyEvents(12));
  }, []);

  return events;
}
