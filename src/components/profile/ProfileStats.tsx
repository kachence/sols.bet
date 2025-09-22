import { Icon } from "@/components/common";

interface PlayerStats {
  totalWagered: number;
  biggestWin: number;
  netProfitLoss: number;
  totalGames: number;
  winRate: number;
  favoriteGame: string;
  currentStreak: number;
  maxMultiplier: number;
}

interface ProfileStatsProps {
  stats: PlayerStats;
}

// Dummy fallback implementations
const useCurrentToken = () => ({ symbol: "SOL", decimals: 9 });
const TokenValue = ({ amount }: { amount: number }) => (
  <span>{typeof amount === "number" ? (amount / 1e9).toFixed(4) : amount}</span>
);

export default function ProfileStats({ stats }: ProfileStatsProps) {
  const token = useCurrentToken();
  
  const isProfit = stats.netProfitLoss >= 0;
  
  const statsGrid = [
    {
      label: "Total Wagered",
      value: <TokenValue amount={stats.totalWagered} />,
      icon: "chart",
      color: "text-luck-primary",
      bgColor: "bg-luck-primary/20"
    },
    {
      label: "Biggest Win",
      value: <TokenValue amount={stats.biggestWin} />,
      icon: "star",
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/20"
    },
    {
      label: "Net P&L",
      value: (
        <span className={isProfit ? "text-green-400" : "text-red-400"}>
          {isProfit ? "+" : ""}
          <TokenValue amount={Math.abs(stats.netProfitLoss)} />
        </span>
      ),
      icon: isProfit ? "arrow-up" : "arrow-down",
      color: isProfit ? "text-green-400" : "text-red-400",
      bgColor: isProfit ? "bg-green-400/20" : "bg-red-400/20"
    },
    {
      label: "Games Played",
      value: stats.totalGames.toLocaleString(),
      icon: "games",
      color: "text-blue-400",
      bgColor: "bg-blue-400/20"
    },
    {
      label: "Win Rate",
      value: `${(stats.winRate * 100).toFixed(1)}%`,
      icon: "target",
      color: "text-purple-400",
      bgColor: "bg-purple-400/20"
    },
    {
      label: "Current Streak",
      value: `${stats.currentStreak} wins`,
      icon: "fire",
      color: "text-orange-400",
      bgColor: "bg-orange-400/20"
    }
  ];

  return (
    <div className="rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-luck-primary/20 rounded-lg flex items-center justify-center">
          <Icon name="chart" size="lg" color="primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">Player Statistics</h3>
          <p className="text-gray-400 text-sm">Your gambling performance overview</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statsGrid.map((stat, index) => (
          <div
            key={index}
            className="bg-luck-accent/30 rounded-lg p-4 hover:bg-luck-accent/40 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                <Icon name={stat.icon as any} size="md" />
              </div>
              <div className="text-right">
                <div className={`text-xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
              </div>
            </div>
            <div className="text-gray-400 text-sm font-medium">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Performance Insights */}
      <div className="mt-6 pt-6 border-t border-luck-accent/30">
        <h4 className="text-white font-bold mb-4">Performance Insights</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-luck-accent/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon name={isProfit ? "arrow-up" : "arrow-down"} size="sm" />
              <h5 className="text-white font-medium">Profit Analysis</h5>
            </div>
            <p className="text-gray-400 text-sm">
              {isProfit 
                ? `You're up ${((stats.netProfitLoss / stats.totalWagered) * 100).toFixed(2)}% on your total wagered amount.`
                : `You're down ${((Math.abs(stats.netProfitLoss) / stats.totalWagered) * 100).toFixed(2)}% on your total wagered amount.`
              }
            </p>
          </div>

          <div className="bg-luck-accent/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="info" size="sm" />
              <h5 className="text-white font-medium">Risk Level</h5>
            </div>
            <p className="text-gray-400 text-sm">
              {stats.totalWagered > 1000e9 
                ? "High roller - Consider setting deposit limits"
                : "Moderate activity - Wagering within reasonable limits"
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 