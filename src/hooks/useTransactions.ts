import { useState, useEffect } from 'react';

interface Transaction {
  id: string;
  date: string;
  amount: number;
  txid: string;
  type: 'deposit' | 'withdraw';
  signature: string;
}

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  total: number;
  refetch: () => void;
}

export function useTransactions(
  user: string | null,
  limit: number = 5,
  offset: number = 0
): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchTransactions = async () => {
    if (!user) {
      setTransactions([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        user,
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const response = await fetch(
        `https://casino-worker-v2.fly.dev/transactions?${params}`,
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

      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
      setTransactions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [user, limit, offset]);

  return {
    transactions,
    loading,
    error,
    total,
    refetch: fetchTransactions,
  };
} 