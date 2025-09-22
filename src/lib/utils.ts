import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { lru } from 'tiny-lru'
// Pyth price service client (works over HTTPS)
import { EvmPriceServiceConnection } from '@pythnetwork/pyth-evm-js'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Price cache - holds one SOL price value for 60 seconds
const priceCache = lru<number>(1, 60000); // 1 item max, 60 second TTL

// Redis key for cross-process price caching
const REDIS_PRICE_KEY = 'price:solusd';

// TEMPORARY: Hard-code SOL price to $100 until real fetch logic is restored.
// All previous caching / fetch code is kept below (commented) for easy re-enable.

export async function getSolToUsdRate(): Promise<number> {
  // 1) Check in-memory LRU
  const cached = priceCache.get('sol');
  if (cached) return cached;

  // 2) Check Redis shared cache
  try {
    const { redis } = await import('@/lib/redis');
    const cachedRedis = await redis.get(REDIS_PRICE_KEY) as number | null;
    if (cachedRedis !== null && cachedRedis !== undefined) {
      priceCache.set('sol', cachedRedis); // populate local cache
      return cachedRedis;
    }
  } catch (e) {
    // Redis may be unavailable; continue silently
  }

  // Primary: Pyth Hermes
  try {
    const pythPrice = await getPythPrice();
    priceCache.set('sol', pythPrice);
    try {
      const { redis } = await import('@/lib/redis');
      await redis.set(REDIS_PRICE_KEY, pythPrice, { ex: 65 });
    } catch {}
    return pythPrice;
  } catch (pythErr) {
    console.warn('Pyth price fetch failed, falling back to CoinGecko', pythErr);
  }

  // Fallback: CoinGecko simple price
  try {
    const cgPrice = await getCoinGeckoPrice();
    priceCache.set('sol', cgPrice);
    try {
      const { redis } = await import('@/lib/redis');
      await redis.set(REDIS_PRICE_KEY, cgPrice, { ex: 65 });
    } catch {}
    return cgPrice;
  } catch (cgErr) {
    console.warn('CoinGecko price fetch failed, using hardcoded 100', cgErr);
  }

  const fallback = 100;
  console.error('[PRICE ALARM] Using ultimate fallback SOL/USD price of $100. All providers failed.');
  priceCache.set('sol', fallback);
  return fallback;
}

// Pyth SOL/USD price id (stable feed)
const PYTH_SOL_USD_ID = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

export async function getPythPrice(): Promise<number> {
  // 1.5 s overall timeout (same as Jupiter)
  const timeoutMs = 1500;

  const pricePromise = (async () => {
    const connection = new EvmPriceServiceConnection('https://hermes.pyth.network');
    const feeds = await connection.getLatestPriceFeeds([PYTH_SOL_USD_ID]);
    if (!feeds || feeds.length === 0) throw new Error('No Pyth price feeds');
    const priceInfo = feeds[0].getPriceNoOlderThan(60); // seconds
    if (!priceInfo) throw new Error('Stale Pyth price');
    const numeric = Number(priceInfo.price);
    const price = numeric * Math.pow(10, priceInfo.expo);
    if (!price || price <= 0) throw new Error('Invalid Pyth price');
    return price;
  })();

  return await Promise.race([
    pricePromise,
    new Promise<number>((_, rej) => setTimeout(() => rej(new Error('Pyth timeout')), timeoutMs))
  ]);
}

async function getCoinGeckoPrice(): Promise<number> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 1500);
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
    const res = await fetch(url, { signal: ctl.signal, headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error(`CoinGecko error ${res.status}`);
    const json: any = await res.json();
    const price = json?.solana?.usd;
    if (typeof price !== 'number' || price <= 0) throw new Error('Invalid CoinGecko price');
    return price;
  } finally {
    clearTimeout(to);
  }
}

export function solToUsd(solAmount: number, rate: number): number {
  return +(solAmount * rate).toFixed(2); // Round to 2 decimal places
}

export function usdToSol(usdAmount: number, rate: number): number {
  return usdAmount / rate;
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1000000000;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * 1000000000);
}
