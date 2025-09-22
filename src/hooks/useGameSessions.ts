import { useState, useEffect } from 'react'
import { supabase, Database } from '@/lib/supabase'
import { useUser } from './useUser'

type GameSession = Database['public']['Tables']['game_sessions']['Row']
type NewGameSession = Database['public']['Tables']['game_sessions']['Insert']

export function useGameSessions() {
  const { user } = useUser()
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch user's game sessions
  const fetchSessions = async (limit = 50) => {
    if (!user) return

    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      const sessions: GameSession[] = (data as GameSession[]) || []
      setSessions(sessions)
    } catch (err) {
      console.error('Error fetching game sessions:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Create new game session
  const createGameSession = async (sessionData: Omit<NewGameSession, 'user_id'>) => {
    if (!user) throw new Error('User not found')

    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .insert({
          ...sessionData,
          user_id: user.id
        })
        .select()
        .single()

      if (error) throw error
      
      // Add to local state
      setSessions(prev => [data, ...prev])
      return data
    } catch (err) {
      console.error('Error creating game session:', err)
      throw err
    }
  }

  // Get recent big wins
  const getRecentBigWins = async (limit = 10) => {
    if (!user) return []

    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('result', 'win')
        .gte('multiplier', 2) // Only wins with 2x+ multiplier
        .order('payout_amount', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching big wins:', err)
      return []
    }
  }

  // Get stats for a specific game type
  const getGameTypeStats = async (gameType: string) => {
    if (!user) return null

    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('game_type', gameType)

      if (error) throw error

      const sessions: GameSession[] = (data as GameSession[]) || []
      const totalGames = sessions.length
      const totalWins = sessions.filter(s => s.result === 'win').length
      const totalWagered = sessions.reduce((sum, s) => sum + s.wager_amount, 0)
      const totalWon = sessions.reduce((sum, s) => sum + s.payout_amount, 0)
      const biggestWin = Math.max(...sessions.map(s => s.payout_amount), 0)
      const highestMultiplier = Math.max(...sessions.map(s => s.multiplier), 0)

      return {
        totalGames,
        totalWins,
        winRate: totalGames > 0 ? totalWins / totalGames : 0,
        totalWagered,
        totalWon,
        netProfit: totalWon - totalWagered,
        biggestWin,
        highestMultiplier
      }
    } catch (err) {
      console.error('Error fetching game type stats:', err)
      return null
    }
  }

  // Fetch sessions when user changes
  useEffect(() => {
    if (user) {
      fetchSessions()
    } else {
      setSessions([])
    }
  }, [user])

  return {
    sessions,
    loading,
    error,
    createGameSession,
    getRecentBigWins,
    getGameTypeStats,
    refetch: () => fetchSessions()
  }
} 