import { useEffect, useState } from 'react';
import { getSolToUsdRate } from '@/lib/utils';

interface UsePriceResult {
  priceUsd: number;
  loading: boolean;
  error?: unknown;
}

/**
 * Simple price hook fetching USD price for the given asset symbol.
 * Currently only supports "SOL" by delegating to getSolToUsdRate().
 */
export function usePrice(symbol: string): UsePriceResult {
  const [priceUsd, setPriceUsd] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let active = true;

    async function fetchPrice() {
      setLoading(true);
      try {
        let price = 0;
        if (symbol.toUpperCase() === 'SOL') {
          price = await getSolToUsdRate();
        } else {
          throw new Error(`Unsupported asset symbol: ${symbol}`);
        }
        if (active) {
          setPriceUsd(price);
        }
      } catch (e) {
        if (active) {
          setError(e);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchPrice();

    return () => {
      active = false;
    };
  }, [symbol]);

  return { priceUsd, loading, error };
} 