import { Icon } from "@/components/common";
import { ACHIEVEMENTS, ACHIEVEMENT_COLORS } from "@/constants";

interface BadgeProps {
  achievementId: string;
  isUnlocked: boolean;
  progress?: number; // Progress towards unlocking (0-100)
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
}

export default function Badge({ 
  achievementId, 
  isUnlocked, 
  progress = 0, 
  size = "md",
  showTooltip = true 
}: BadgeProps) {
  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
  
  if (!achievement) {
    return null;
  }

  const colors = ACHIEVEMENT_COLORS[achievement.rarity as keyof typeof ACHIEVEMENT_COLORS];
  
  const sizeClasses = {
    sm: {
      container: "w-12 h-12",
      icon: "sm" as const,
      text: "text-xs"
    },
    md: {
      container: "w-16 h-16",
      icon: "md" as const,
      text: "text-sm"
    },
    lg: {
      container: "w-20 h-20",
      icon: "lg" as const,
      text: "text-base"
    }
  };

  const classes = sizeClasses[size];

  return (
    <div className="group relative">
      {/* Badge */}
      <div 
        className={`${classes.container} rounded-xl border-2 flex items-center justify-center transition-all duration-200 ${
          isUnlocked 
            ? `${colors.bg} ${colors.border} hover:scale-105` 
            : "bg-gray-600 border-gray-600 opacity-50"
        }`}
      >
        <Icon 
          name={achievement.icon as any} 
          size={classes.icon} 
          color={isUnlocked ? "default" : "muted"}
        />
        
        {/* Progress Ring for Locked Badges */}
        {!isUnlocked && progress > 0 && (
          <div className="absolute inset-0 rounded-xl">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                className="text-gray-700"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                strokeDasharray={`${progress * 2.83} 283`}
                className={colors.text}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
          <div className="bg-[#0c0f1a] border border-[#1a2332] rounded-lg p-3 min-w-48 text-center">
            <div className={`font-bold ${isUnlocked ? colors.text : "text-gray-400"} ${classes.text}`}>
              {achievement.name}
            </div>
            <div className="text-gray-400 text-xs mt-1">
              {achievement.description}
            </div>
            
            {/* Rarity Badge */}
            <div className="mt-2">
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                {achievement.rarity.toUpperCase()}
              </span>
            </div>
            
            {/* Progress Text */}
            {!isUnlocked && progress > 0 && (
              <div className="text-gray-400 text-xs mt-2">
                Progress: {progress.toFixed(0)}%
              </div>
            )}
            
            {/* Unlock Status */}
            <div className={`text-xs mt-2 ${isUnlocked ? "text-green-400" : "text-gray-400"}`}>
              {isUnlocked ? "✓ Unlocked" : "🔒 Locked"}
            </div>
          </div>
          
          {/* Tooltip Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2">
            <div className="border-4 border-transparent border-t-[#1a2332]"></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Achievements Grid Component
interface AchievementsGridProps {
  unlockedAchievements: string[];
  playerStats: {
    gamesPlayed: number;
    maxBet: number;
    winStreak: number;
    totalWagered: number;
    maxMultiplier: number;
    referrals: number;
  };
}

export function AchievementsGrid({ unlockedAchievements, playerStats }: AchievementsGridProps) {
  // Calculate progress for locked achievements
  const getProgress = (achievement: typeof ACHIEVEMENTS[0]) => {
    if (unlockedAchievements.includes(achievement.id)) return 100;
    
    switch (achievement.requirement.type) {
      case "games_played":
        return Math.min((playerStats.gamesPlayed / achievement.requirement.value) * 100, 100);
      case "max_bet":
        return Math.min((playerStats.maxBet / achievement.requirement.value) * 100, 100);
      case "win_streak":
        return Math.min((playerStats.winStreak / achievement.requirement.value) * 100, 100);
      case "total_wagered":
        return Math.min((playerStats.totalWagered / achievement.requirement.value) * 100, 100);
      case "max_multiplier":
        return Math.min((playerStats.maxMultiplier / achievement.requirement.value) * 100, 100);
      case "referrals":
        return Math.min((playerStats.referrals / achievement.requirement.value) * 100, 100);
      default:
        return 0;
    }
  };

  return (
    <div className="bg-[#0c0f1a] border border-[#1a2332] rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-[#00ff9f]/20 rounded-lg flex items-center justify-center">
          <Icon name="star" size="lg" color="primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">Achievements</h3>
          <p className="text-gray-400 text-sm">
            {unlockedAchievements.length}/{ACHIEVEMENTS.length} unlocked
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="w-full bg-[#1a2332] rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-[#00ff9f] to-yellow-400 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(unlockedAchievements.length / ACHIEVEMENTS.length) * 100}%` }}
          />
        </div>
        <div className="text-xs text-gray-400 text-center mt-2">
          Achievement Progress: {((unlockedAchievements.length / ACHIEVEMENTS.length) * 100).toFixed(0)}%
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {ACHIEVEMENTS.map((achievement) => (
          <Badge
            key={achievement.id}
            achievementId={achievement.id}
            isUnlocked={unlockedAchievements.includes(achievement.id)}
            progress={getProgress(achievement)}
            size="md"
          />
        ))}
      </div>

      {/* Rarity Legend */}
      <div className="mt-6 pt-6 border-t border-luck-accent/30">
        <h4 className="text-white font-bold mb-3">Rarity Guide</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(ACHIEVEMENT_COLORS).map(([rarity, colors]) => (
            <div key={rarity} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${colors.bg}`} />
              <span className="text-gray-300 text-sm capitalize">{rarity}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 