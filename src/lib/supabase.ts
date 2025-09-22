import './emfileGuard';
import { createClient } from '@supabase/supabase-js'

// Skip undici setup in browser environment to avoid Node.js module issues
if (typeof window === 'undefined') {
  // Server-side only: Try to set up undici connection pooling
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setGlobalDispatcher, Agent } = require('undici');
    const globalAgentKey = '__GLOBAL_UNDICI_AGENT__';
    const existing = (global as any)[globalAgentKey];
    const agent = existing || new Agent({ connections: 4, pipelining: 1, keepAliveTimeout: 500 });
    if (!existing) {
      (global as any)[globalAgentKey] = agent;
    }
    setGlobalDispatcher(agent);
  } catch (e) {
    // Undici not available – continue without limiting sockets
    console.warn('[supabase] Undici not available, skipping global dispatcher tweak');
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Optimized Supabase client with connection pooling to prevent EMFILE errors.
// Make sure we create **one** client per process.
const globalSupabaseKey = '__GLOBAL_SUPABASE_CLIENT__';

const supabase =
  (global as any)[globalSupabaseKey] ||
  createClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: 'public',
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        'Connection': 'keep-alive',
      },
    },
    // Reduce concurrent connections to prevent file descriptor exhaustion
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });

if (!(global as any)[globalSupabaseKey]) {
  (global as any)[globalSupabaseKey] = supabase;
}

export { supabase };

// Database types (you'll update these based on your actual schema)
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          wallet_address: string
          username?: string
          created_at: string
          updated_at: string
          total_wagered: number
          total_won: number
          total_games: number
          return_to_player: number
          favorite_game?: string
          current_streak: number
          max_multiplier: number
          balance: number
          signed_in: boolean | null
          sign_in_expire: string | null
          smart_vault: string | null
          referral: string | null
        }
        Insert: {
          id?: string
          wallet_address: string
          username?: string
          created_at?: string
          updated_at?: string
          total_wagered?: number
          total_won?: number
          total_games?: number
          return_to_player?: number
          favorite_game?: string
          current_streak?: number
          max_multiplier?: number
          balance?: number
          signed_in?: boolean
          sign_in_expire?: string
          smart_vault?: string
          referral?: string
        }
        Update: {
          id?: string
          wallet_address?: string
          username?: string
          updated_at?: string
          total_wagered?: number
          total_won?: number
          total_games?: number
          return_to_player?: number
          favorite_game?: string
          current_streak?: number
          max_multiplier?: number
          balance?: number
          signed_in?: boolean
          sign_in_expire?: string
          smart_vault?: string
          referral?: string
        }
      }
      game_sessions: {
        Row: {
          id: string
          user_id: string
          game_type: string
          wager_amount: number
          payout_amount: number
          multiplier: number
          result: 'win' | 'loss'
          game_data: any
          transaction_hash?: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          game_type: string
          wager_amount: number
          payout_amount: number
          multiplier: number
          result: 'win' | 'loss'
          game_data?: any
          transaction_hash?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          game_type?: string
          wager_amount?: number
          payout_amount?: number
          multiplier?: number
          result?: 'win' | 'loss'
          game_data?: any
          transaction_hash?: string
        }
      }
      leaderboard: {
        Row: {
          id: string
          user_id: string
          wallet_address: string
          username?: string
          total_wagered: number
          total_won: number
          biggest_win: number
          win_rate: number
          total_games: number
          rank: number
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          wallet_address: string
          username?: string
          total_wagered?: number
          total_won?: number
          biggest_win?: number
          win_rate?: number
          total_games?: number
          rank?: number
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          wallet_address?: string
          username?: string
          total_wagered?: number
          total_won?: number
          biggest_win?: number
          win_rate?: number
          total_games?: number
          rank?: number
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
} 