import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const GEM_TYPES = ['garnet', 'amethyst', 'topaz', 'sapphire', 'emerald', 'ruby', 'diamond'];

// Cache duration in seconds (5 minutes)
const CACHE_DURATION = 300;

/**
 * Get user's gem collection with caching
 */
async function getUserGemCollection(username) {
  const cacheKey = `gems:${username}`;
  
  try {
    // Try to get from Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`📦 Cache hit for gems:${username}`);
      // Upstash Redis automatically handles JSON serialization
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    console.log(`🔍 Cache miss for gems:${username}, fetching from database`);
    
    // Get from database
    const { data: user, error } = await supabase
      .from('users')
      .select('garnet, amethyst, topaz, sapphire, emerald, ruby, diamond')
      .eq('username', username)
      .single();

    if (error) {
      console.error('Failed to fetch gems from database:', error);
      throw error;
    }

    if (!user) {
      console.warn(`User ${username} not found`);
      return null;
    }

    // Format gem collection
    const gemCollection = {
      garnet: user.garnet || 0,
      amethyst: user.amethyst || 0,
      topaz: user.topaz || 0,
      sapphire: user.sapphire || 0,
      emerald: user.emerald || 0,
      ruby: user.ruby || 0,
      diamond: user.diamond || 0,
      total: (user.garnet || 0) + (user.amethyst || 0) + (user.topaz || 0) + 
             (user.sapphire || 0) + (user.emerald || 0) + (user.ruby || 0) + (user.diamond || 0),
      lastUpdated: new Date().toISOString()
    };

    // Cache the result (Upstash Redis handles JSON automatically)
    await redis.set(cacheKey, gemCollection, { ex: CACHE_DURATION });
    console.log(`💎 Cached gem collection for ${username}: ${gemCollection.total} total gems`);

    return gemCollection;
  } catch (error) {
    console.error('Error fetching gem collection:', error);
    throw error;
  }
}

/**
 * Invalidate gem cache for a user (call when gems are awarded)
 */
async function invalidateGemCache(username) {
  const cacheKey = `gems:${username}`;
  try {
    await redis.del(cacheKey);
    console.log(`🗑️ Invalidated gem cache for ${username}`);
  } catch (error) {
    console.warn('Failed to invalidate gem cache:', error);
  }
}

/**
 * Get leaderboard of users by total gems
 */
async function getGemLeaderboard(limit = 10) {
  const cacheKey = 'gems:leaderboard';
  
  try {
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('📦 Cache hit for gem leaderboard');
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    console.log('🔍 Cache miss for gem leaderboard, fetching from database');
    
    // Build dynamic SQL for total gems calculation
    const gemSumSQL = GEM_TYPES.map(gem => `COALESCE(${gem}, 0)`).join(' + ');
    
    const { data: leaderboard, error } = await supabase
      .from('users')
      .select(`username, wallet_address, ${GEM_TYPES.join(', ')}`)
      .gte(gemSumSQL, 1) // Only users with at least 1 gem
      .order(gemSumSQL, { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch gem leaderboard:', error);
      throw error;
    }

    // Format leaderboard
    const formattedLeaderboard = leaderboard.map((user, index) => {
      const totalGems = GEM_TYPES.reduce((sum, gem) => sum + (user[gem] || 0), 0);
      return {
        rank: index + 1,
        username: user.username,
        walletAddress: user.wallet_address,
        totalGems,
        gems: {
          garnet: user.garnet || 0,
          amethyst: user.amethyst || 0,
          topaz: user.topaz || 0,
          sapphire: user.sapphire || 0,
          emerald: user.emerald || 0,
          ruby: user.ruby || 0,
          diamond: user.diamond || 0
        }
      };
    });

    // Cache for 1 minute (leaderboard changes frequently)
    await redis.set(cacheKey, formattedLeaderboard, { ex: 60 });
    
    return formattedLeaderboard;
  } catch (error) {
    console.error('Error fetching gem leaderboard:', error);
    throw error;
  }
}

/**
 * Notify real-time clients about gem updates
 */
async function notifyGemUpdate(username, gemUpdates) {
  try {
    // Invalidate cache first
    await invalidateGemCache(username);
    
    // Get fresh gem collection
    const gemCollection = await getUserGemCollection(username);
    
    // Publish to real-time channel (if you have WebSocket/SSE setup)
    // For now, we'll use Supabase's built-in real-time capabilities
    console.log(`📡 Gem update notification for ${username}:`, { 
      updates: gemUpdates, 
      newTotal: gemCollection.total 
    });
    
    return gemCollection;
  } catch (error) {
    console.error('Error notifying gem update:', error);
    throw error;
  }
}

export {
  getUserGemCollection,
  invalidateGemCache,
  getGemLeaderboard,
  notifyGemUpdate,
  GEM_TYPES
}; 