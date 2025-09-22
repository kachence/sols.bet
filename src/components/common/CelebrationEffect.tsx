import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Confetti from 'react-confetti'

interface CelebrationEffectProps {
  isActive: boolean
  type?: 'win' | 'bonus' | 'level' | 'gem'
  message?: string
  onComplete?: () => void
}

export function CelebrationEffect({ 
  isActive, 
  type = 'win', 
  message,
  onComplete 
}: CelebrationEffectProps) {
  const [showConfetti, setShowConfetti] = useState(false)
  const [showMessage, setShowMessage] = useState(false)

  useEffect(() => {
    if (isActive) {
      setShowConfetti(true)
      setShowMessage(true)
      
      // Stop confetti after 3 seconds
      const confettiTimer = setTimeout(() => {
        setShowConfetti(false)
      }, 3000)

      // Hide message after 4 seconds
      const messageTimer = setTimeout(() => {
        setShowMessage(false)
        onComplete?.()
      }, 4000)

      return () => {
        clearTimeout(confettiTimer)
        clearTimeout(messageTimer)
      }
    }
  }, [isActive, onComplete])

  const getColors = () => {
    switch (type) {
      case 'win':
        return ['#00ff88', '#00cc6a', '#ffd700', '#ffaa00']
      case 'bonus':
        return ['#00ff88', '#22c55e', '#84cc16', '#65a30d']
      case 'level':
        return ['#8b5cf6', '#a855f7', '#c084fc', '#ddd6fe']
      case 'gem':
        return ['#00ffff', '#00bfff', '#87ceeb', '#b0e0e6']
      default:
        return ['#00ff88', '#00cc6a', '#ffd700', '#ffaa00']
    }
  }

  const getMessage = () => {
    if (message) return message
    
    switch (type) {
      case 'win':
        return 'BIG WIN!'
      case 'bonus':
        return 'BONUS CLAIMED!'
      case 'level':
        return 'LEVEL UP!'
      case 'gem':
        return 'GEMS COLLECTED!'
      default:
        return 'CONGRATULATIONS!'
    }
  }

  const getIcon = () => {
    switch (type) {
      case 'win':
        return '🎉'
      case 'bonus':
        return '💰'
      case 'level':
        return '⭐'
      case 'gem':
        return '💎'
      default:
        return '🎉'
    }
  }

  if (!isActive) return null

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Confetti */}
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          colors={getColors()}
          numberOfPieces={200}
          recycle={false}
          gravity={0.3}
        />
      )}

      {/* Celebration Message */}
      <AnimatePresence>
        {showMessage && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.3, rotateZ: -10 }}
              animate={{ 
                scale: [0.3, 1.2, 1],
                rotateZ: [-10, 5, 0]
              }}
              exit={{ 
                scale: 0.8,
                opacity: 0,
                y: -50
              }}
              transition={{ 
                duration: 0.8,
                ease: [0.25, 0.46, 0.45, 0.94],
                scale: {
                  times: [0, 0.6, 1],
                  duration: 0.8
                }
              }}
            >
              {/* Icon */}
              <motion.div
                className="text-8xl mb-4"
                animate={{ 
                  rotate: [0, -10, 10, -5, 5, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  repeatType: "reverse"
                }}
              >
                {getIcon()}
              </motion.div>

              {/* Main Message */}
              <motion.h1
                className="text-6xl md:text-8xl font-black text-luck-primary mb-4"
                style={{
                  textShadow: `
                    0 0 20px rgba(0, 255, 136, 0.8),
                    0 0 40px rgba(0, 255, 136, 0.6),
                    0 0 60px rgba(0, 255, 136, 0.4)
                  `,
                  background: 'linear-gradient(45deg, #00ff88, #00cc6a, #ffd700)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
                animate={{ 
                  scale: [1, 1.05, 1],
                  filter: [
                    'hue-rotate(0deg)',
                    'hue-rotate(30deg)',
                    'hue-rotate(0deg)'
                  ]
                }}
                transition={{ 
                  duration: 1.5,
                  repeat: Infinity,
                  repeatType: "reverse"
                }}
              >
                {getMessage()}
              </motion.h1>

              {/* Sparkle Effects */}
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 bg-luck-primary rounded-full"
                  style={{
                    left: `${20 + i * 10}%`,
                    top: `${30 + (i % 2) * 20}%`,
                  }}
                  animate={{
                    scale: [0, 1, 0],
                    opacity: [0, 1, 0],
                    rotate: [0, 180, 360],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut"
                  }}
                />
              ))}

              {/* Pulsing Ring */}
              <motion.div
                className="absolute inset-0 border-4 border-luck-primary rounded-full opacity-30"
                animate={{
                  scale: [1, 2, 3],
                  opacity: [0.3, 0.1, 0]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut"
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Hook for easy usage
export function useCelebration() {
  const [celebration, setCelebration] = useState<{
    isActive: boolean
    type?: 'win' | 'bonus' | 'level' | 'gem'
    message?: string
  }>({
    isActive: false
  })

  const celebrate = (type?: 'win' | 'bonus' | 'level' | 'gem', message?: string) => {
    setCelebration({
      isActive: true,
      type,
      message
    })
  }

  const stopCelebration = () => {
    setCelebration({ isActive: false })
  }

  return {
    celebration,
    celebrate,
    stopCelebration,
    CelebrationComponent: () => (
      <CelebrationEffect
        isActive={celebration.isActive}
        type={celebration.type}
        message={celebration.message}
        onComplete={stopCelebration}
      />
    )
  }
} 