import { useState, useEffect } from 'react'
import { supabase, Database } from '@/lib/supabase'

type LeaderboardEntry = Database['public']['Tables']['leaderboard']['Row']

export function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch leaderboard data
  const fetchLeaderboard = async (limit = 100) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('total_wagered', { ascending: false })
        .limit(limit)

      if (error) throw error
      setLeaderboard(data || [])
    } catch (err) {
      console.error('Error fetching leaderboard:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Get top winners (by total won)
  const getTopWinners = async (limit = 10) => {
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('total_won', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching top winners:', err)
      return []
    }
  }

  // Get biggest single wins
  const getBiggestWins = async (limit = 10) => {
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('biggest_win', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching biggest wins:', err)
      return []
    }
  }

  // Get user's rank by wallet address
  const getUserRank = async (walletAddress: string) => {
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('rank, total_wagered, total_won, win_rate')
        .eq('wallet_address', walletAddress)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data
    } catch (err) {
      console.error('Error fetching user rank:', err)
      return null
    }
  }

  // Update or insert leaderboard entry
  const updateLeaderboardEntry = async (
    userId: string,
    walletAddress: string,
    stats: {
      username?: string
      total_wagered: number
      total_won: number
      biggest_win: number
      win_rate: number
      total_games: number
    }
  ) => {
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .upsert({
          user_id: userId,
          wallet_address: walletAddress,
          ...stats,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err) {
      console.error('Error updating leaderboard:', err)
      throw err
    }
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  return {
    leaderboard,
    loading,
    error,
    getTopWinners,
    getBiggestWins,
    getUserRank,
    updateLeaderboardEntry,
    refetch: () => fetchLeaderboard()
  }
} 