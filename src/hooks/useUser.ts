import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { supabase, Database } from '@/lib/supabase'

type User = Database['public']['Tables']['users']['Row']

export function useUser() {
  const { publicKey, connected } = useWallet()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch or create user when wallet connects
  useEffect(() => {
    if (!connected || !publicKey) {
      setUser(null)
      return
    }

    const fetchOrCreateUser = async () => {
      setLoading(true)
      setError(null)

      try {
        const walletAddress = publicKey.toString()
        
        // First, try to find existing user
        const { data: existingUser, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('wallet_address', walletAddress)
          .single()

        if (fetchError && fetchError.code !== 'PGRST116') {
          throw fetchError
        }

        if (existingUser) {
          setUser(existingUser)
        } else {
          // Create new user
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
              wallet_address: walletAddress,
              total_wagered: 0,
              total_won: 0,
              total_games: 0,
              win_rate: 0,
              current_streak: 0,
              max_multiplier: 0
            })
            .select()
            .single()

          if (insertError) throw insertError
          setUser(newUser)
        }
      } catch (err) {
        console.error('Error fetching/creating user:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchOrCreateUser()
  }, [connected, publicKey])

  // Update user stats
  const updateUserStats = async (stats: Partial<User>) => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('users')
        .update({ ...stats, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .single()

      if (error) throw error
      setUser(data)
      return data
    } catch (err) {
      console.error('Error updating user stats:', err)
      throw err
    }
  }

  return {
    user,
    loading,
    error,
    updateUserStats,
    refetch: () => {
      if (connected && publicKey) {
        // Re-trigger the useEffect
        setUser(null)
      }
    }
  }
} 