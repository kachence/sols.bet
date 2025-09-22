import { useState, useEffect } from 'react';

export function useBankrollValue() {
  const [bankrollUsd, setBankrollUsd] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBankrollValue = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('https://casino-worker-v2.fly.dev/bankroll-value');
        const data = await response.json();
        
        if (data.success && typeof data.bankrollUsd === 'number') {
          setBankrollUsd(data.bankrollUsd);
        } else {
          throw new Error(data.error || 'Invalid response format');
        }
      } catch (err) {
        console.error('Failed to fetch bankroll value:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        // Fallback to mock value on error
        setBankrollUsd(13605101.13);
      } finally {
        setLoading(false);
      }
    };

    fetchBankrollValue();

    // Set up polling every 60 seconds to keep value fresh
    const interval = setInterval(fetchBankrollValue, 60000);

    return () => clearInterval(interval);
  }, []);

  return {
    bankrollUsd,
    loading,
    error
  };
} 