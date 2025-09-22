import { useState, useEffect, useRef } from 'react';
import { AdminLayout } from '@/components/layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faExclamationTriangle, faCheckCircle, faClock } from '@fortawesome/free-solid-svg-icons';

interface UserReconciliationResult {
  userId: string;
  walletAddress: string;
  dbBalance: number;
  onChainBalance: number;
  difference: number;
  status: 'match' | 'mismatch' | 'error';
  error?: string;
}

interface ReconciliationSummary {
  totalUsers: number;
  matches: number;
  mismatches: number;
  errors: number;
  totalDbBalance: number;
  totalOnChainBalance: number;
  lastRun: string;
  nextRun: string;
  processingTimeMs: number;
}

interface BankrollSafetyCheck {
  timestamp: string;
  bankrollUsd: number;
  safetyThreshold: number;
  isSafe: boolean;
  riskLevel: number;
  maxBet: number;
  maxWin: number;
  safetyFactor: number;
}

interface BankrollSafetyData {
  success: boolean;
  safetyCheck: BankrollSafetyCheck | null;
  stats: {
    updateCount: number;
    consecutiveFailures: number;
    lastUpdateTime: string | null;
    healthStatus: string;
    alertsSent: number;
  };
  monitor: {
    status: string;
    intervalMs: number;
    nextCheckIn: string;
    leadership: {
      status: string;
      isLeader: boolean;
      currentLeader: string | null;
    };
  };
  timestamp: string;
}

interface ProfitLossCheck {
  timestamp: string;
  analysisWindow: string;
  totalWagersUsd: number;
  totalPayoutsUsd: number;
  transactionCount: number;
  actualRtpPercent: number;
  expectedRtpPercent: number;
  deviationPercent: number;
  isHealthy: boolean;
  hasEnoughData: boolean;
  minTransactionThreshold: number;
  alertType: string | null;
  alertSeverity: string;
  houseEdgePercent: number;
  healthyRange: {
    min: number;
    max: number;
  };
}

interface ProfitLossData {
  success: boolean;
  profitLossCheck: ProfitLossCheck | null;
  stats: {
    updateCount: number;
    consecutiveFailures: number;
    lastUpdateTime: string | null;
    healthStatus: string;
    alertsSent: number;
  };
  monitor: {
    status: string;
    intervalMs: number;
    nextCheckIn: string;
    leadership: {
      status: string;
      isLeader: boolean;
      currentLeader: string | null;
    };
  };
  timestamp: string;
}

interface GemFairnessCheck {
  timestamp: string;
  totalUsersAnalyzed: number;
  unfairUsers: number;
  fairnessPercentage: number;
  wagerThreshold: number;
  fairnessTolerance: number;
  gemStatistics: {
    [gemName: string]: {
      totalExpected: number;
      totalActual: number;
      overallDeviation: number;
      unfairUserCount: number;
      rarity: string;
    };
  };
  isHealthy: boolean;
  topUnfairUsers: Array<{
    userId: string;
    walletAddress: string;
    totalWageredSol: number;
    maxDeviationGem: string;
    maxDeviationRatio: number;
  }>;
}

interface GemFairnessData {
  success: boolean;
  gemFairnessCheck: GemFairnessCheck | null;
  stats: {
    updateCount: number;
    consecutiveFailures: number;
    lastUpdateTime: string | null;
    healthStatus: string;
    totalUsersAnalyzed: number;
    unfairUsers: number;
    alertsSent: number;
  };
  monitor: {
    status: string;
    intervalMs: number;
    nextCheckIn: string;
    leadership: {
      status: string;
      isLeader: boolean;
      currentLeader: string | null;
    };
  };
  timestamp: string;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [mismatchedUsers, setMismatchedUsers] = useState<UserReconciliationResult[]>([]);
  const [error, setError] = useState('');
  const [timeUntilNext, setTimeUntilNext] = useState('');
  const [bankrollSafety, setBankrollSafety] = useState<BankrollSafetyData | null>(null);
  const [bankrollSafetyError, setBankrollSafetyError] = useState('');
  const [profitLoss, setProfitLoss] = useState<ProfitLossData | null>(null);
  const [profitLossError, setProfitLossError] = useState('');
  const [gemFairness, setGemFairness] = useState<GemFairnessData | null>(null);
  const [gemFairnessError, setGemFairnessError] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // API endpoint URL (use your worker API URL)
  const API_BASE_URL = process.env.NEXT_PUBLIC_WORKER_API_URL || 'https://casino-worker-v2.fly.dev';

  // Fetch reconciliation results from the worker API
  const fetchReconciliationResults = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/reconciliation-results`);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'API returned error');
      }
      
      return data;
    } catch (error) {
      console.error('Failed to fetch reconciliation results:', error);
      throw error;
    }
  };

  // Fetch bankroll safety data from the worker API
  const fetchBankrollSafetyData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/bankroll-safety`);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'API returned error');
      }
      
      return data;
    } catch (error) {
      console.error('Failed to fetch bankroll safety data:', error);
      throw error;
    }
  };

  // Fetch profit/loss data from the worker API
  const fetchProfitLossData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/profit-loss`);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'API returned error');
      }
      
      return data;
    } catch (error) {
      console.error('Failed to fetch profit/loss data:', error);
      throw error;
    }
  };

  // Fetch gem fairness data from the worker API
  const fetchGemFairnessData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/gem-fairness`);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'API returned error');
      }
      
      return data;
    } catch (error) {
      console.error('Failed to fetch gem fairness data:', error);
      throw error;
    }
  };

  // Trigger manual reconciliation
  const triggerManualReconciliation = async () => {
    setTriggering(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/reconciliation-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Manual trigger failed');
      }
      
      console.log('Manual reconciliation triggered successfully');
      
      // Wait a moment then refresh results
      setTimeout(() => {
        loadReconciliationResults(false);
      }, 2000);
      
    } catch (err) {
      console.error('Failed to trigger manual reconciliation:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to trigger reconciliation';
      setError(errorMessage);
    } finally {
      setTriggering(false);
    }
  };

  // Load results from the server
  const loadReconciliationResults = async (showProgress = true) => {
    if (showProgress) {
      setLoading(true);
      setError('');
      setBankrollSafetyError('');
      setProfitLossError('');
      setGemFairnessError('');
    }

    try {
      // Fetch reconciliation, bankroll safety, profit/loss, and gem fairness data in parallel
      const [reconciliationData, bankrollSafetyData, profitLossData, gemFairnessData] = await Promise.allSettled([
        fetchReconciliationResults(),
        fetchBankrollSafetyData(),
        fetchProfitLossData(),
        fetchGemFairnessData()
      ]);

      // Handle reconciliation results
      if (reconciliationData.status === 'fulfilled') {
        if (reconciliationData.value.summary) {
          setSummary(reconciliationData.value.summary);
        }
        
        if (reconciliationData.value.issues) {
          setMismatchedUsers(reconciliationData.value.issues);
        }
        
        setError('');
        console.log('Loaded reconciliation results from server:', reconciliationData.value.stats);
      } else {
        console.error('Failed to load reconciliation results:', reconciliationData.reason);
        const errorMessage = reconciliationData.reason instanceof Error ? reconciliationData.reason.message : 'Failed to load reconciliation results';
        setError(errorMessage);
      }

      // Handle bankroll safety results
      if (bankrollSafetyData.status === 'fulfilled') {
        setBankrollSafety(bankrollSafetyData.value);
        setBankrollSafetyError('');
        console.log('Loaded bankroll safety data from server:', bankrollSafetyData.value.stats);
      } else {
        console.error('Failed to load bankroll safety data:', bankrollSafetyData.reason);
        const errorMessage = bankrollSafetyData.reason instanceof Error ? bankrollSafetyData.reason.message : 'Failed to load bankroll safety data';
        setBankrollSafetyError(errorMessage);
      }

      // Handle profit/loss results
      if (profitLossData.status === 'fulfilled') {
        setProfitLoss(profitLossData.value);
        setProfitLossError('');
        console.log('Loaded profit/loss data from server:', profitLossData.value.stats);
      } else {
        console.error('Failed to load profit/loss data:', profitLossData.reason);
        const errorMessage = profitLossData.reason instanceof Error ? profitLossData.reason.message : 'Failed to load profit/loss data';
        setProfitLossError(errorMessage);
      }

      // Handle gem fairness results
      if (gemFairnessData.status === 'fulfilled') {
        setGemFairness(gemFairnessData.value);
        setGemFairnessError('');
        console.log('Loaded gem fairness data from server:', gemFairnessData.value.stats);
      } else {
        console.error('Failed to load gem fairness data:', gemFairnessData.reason);
        const errorMessage = gemFairnessData.reason instanceof Error ? gemFairnessData.reason.message : 'Failed to load gem fairness data';
        setGemFairnessError(errorMessage);
      }
      
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(errorMessage);
    } finally {
      if (showProgress) {
        setLoading(false);
      }
    }
  };

  // Update countdown timer based on next run time
  const updateTimeUntilNext = () => {
    if (!summary?.nextRun) return;
    
    const now = new Date();
    const nextRun = new Date(summary.nextRun);
    const timeLeft = nextRun.getTime() - now.getTime();
    
    if (timeLeft <= 0) {
      setTimeUntilNext('Running soon...');
      return;
    }
    
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    setTimeUntilNext(`${hours}h ${minutes}m ${seconds}s`);
  };

  useEffect(() => {
    // Load reconciliation results immediately
    loadReconciliationResults(true);

    // Set up periodic refresh every 30 seconds to check for updates
    intervalRef.current = setInterval(() => {
      loadReconciliationResults(false); // Background refresh
    }, 30000);

    // Update countdown every second
    const countdownInterval = setInterval(updateTimeUntilNext, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearInterval(countdownInterval);
    };
  }, []);

  useEffect(() => {
    updateTimeUntilNext();
  }, [summary?.nextRun]);

  const formatSOL = (lamports: number) => {
    return `${(lamports / 1e9).toFixed(6)} SOL`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusIcon = (hasIssues: boolean) => {
    return hasIssues ? (
      <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400" />
    ) : (
      <FontAwesomeIcon icon={faCheckCircle} className="text-green-400" />
    );
  };

  const hasIssues = (summary?.mismatches || 0) > 0 || (summary?.errors || 0) > 0;

  return (
    <AdminLayout title="Admin Dashboard">
      <div className="space-y-8">
        


        {/* Status Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Bankroll Safety Status Card */}
          {bankrollSafety?.safetyCheck && (
            <div className="bg-cardMedium rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon 
                  icon={bankrollSafety.safetyCheck.isSafe ? faCheckCircle : faExclamationTriangle} 
                  className={bankrollSafety.safetyCheck.isSafe ? 'text-green-400' : 'text-red-400'} 
                />
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Bankroll Safety: {bankrollSafety.safetyCheck.isSafe ? 'Safe' : 'UNSAFE'}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    ${bankrollSafety.safetyCheck.bankrollUsd.toFixed(2)} / ${bankrollSafety.safetyCheck.safetyThreshold.toFixed(2)} 
                    ({bankrollSafety.safetyCheck.riskLevel.toFixed(1)}%)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-300 mb-1">
                  <span className={`font-semibold ${
                    bankrollSafety.safetyCheck.riskLevel < 50 ? 'text-red-400' : 
                    bankrollSafety.safetyCheck.riskLevel < 80 ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    Risk Level: {bankrollSafety.safetyCheck.riskLevel.toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  Max Risk: ${bankrollSafety.safetyCheck.maxBet} × {bankrollSafety.safetyCheck.maxWin}X × {bankrollSafety.safetyCheck.safetyFactor}
                </div>
              </div>
            </div>
            </div>
          )}

          {/* Profit/Loss Status Card */}
          {profitLoss?.profitLossCheck && (
            <div className="bg-cardMedium rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon 
                  icon={
                    !profitLoss.profitLossCheck.hasEnoughData ? faClock :
                    profitLoss.profitLossCheck.isHealthy ? faCheckCircle : faExclamationTriangle
                  } 
                  className={
                    !profitLoss.profitLossCheck.hasEnoughData ? 'text-yellow-400' :
                    profitLoss.profitLossCheck.isHealthy ? 'text-green-400' : 'text-red-400'
                  } 
                />
          <div>
                  <h2 className="text-lg font-semibold text-white">
                    Profit/Loss Ratio: {
                      !profitLoss.profitLossCheck.hasEnoughData ? 'Insufficient Data' :
                      profitLoss.profitLossCheck.isHealthy ? 'Healthy' : 'ALERT'
                    }
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {!profitLoss.profitLossCheck.hasEnoughData ? 
                      `${profitLoss.profitLossCheck.transactionCount}/${profitLoss.profitLossCheck.minTransactionThreshold} transactions • Need more data` :
                      `${profitLoss.profitLossCheck.actualRtpPercent.toFixed(2)}% RTP (${profitLoss.profitLossCheck.deviationPercent >= 0 ? '+' : ''}${profitLoss.profitLossCheck.deviationPercent.toFixed(1)}% from expected)`
                    }
            </p>
          </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-300 mb-1">
                  <span className={`font-semibold ${
                    !profitLoss.profitLossCheck.hasEnoughData ? 'text-yellow-400' :
                    profitLoss.profitLossCheck.actualRtpPercent < 90 ? 'text-red-400' : 
                    profitLoss.profitLossCheck.actualRtpPercent > 105 ? 'text-orange-400' : 'text-green-400'
                  }`}>
                    {!profitLoss.profitLossCheck.hasEnoughData ? 
                      'Waiting...' :
                      `${profitLoss.profitLossCheck.houseEdgePercent.toFixed(2)}% House Edge`
                    }
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {!profitLoss.profitLossCheck.hasEnoughData && '⏳ Rolling 24h analysis'}
                  {profitLoss.profitLossCheck.hasEnoughData && profitLoss.profitLossCheck.alertType === 'house_winning_too_much' && '🚨 House winning too much'}
                  {profitLoss.profitLossCheck.hasEnoughData && profitLoss.profitLossCheck.alertType === 'players_winning_too_much' && '🚨 Players winning too much'}
                  {profitLoss.profitLossCheck.hasEnoughData && profitLoss.profitLossCheck.alertType === 'significant_deviation' && '⚠️ Significant deviation'}
                  {profitLoss.profitLossCheck.hasEnoughData && !profitLoss.profitLossCheck.alertType && '✅ Normal operations'}
                </div>
              </div>
          </div>
        </div>
          )}

          {/* Reconciliation Status Card */}
          <div className="bg-cardMedium rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(hasIssues)}
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Balance Reconciliation: {hasIssues ? 'Issues Detected' : 'All Clear'}
                </h2>
                {summary && (
                  <p className="text-gray-400 text-sm">
                    Last run: {formatDate(summary.lastRun)}
                  </p>
                )}
              </div>
            </div>
            {summary && (
              <div className="text-right">
                <div className="flex items-center gap-2 text-gray-300 text-sm mb-1">
                  <FontAwesomeIcon icon={faClock} />
                  <span>Next run in: {timeUntilNext}</span>
                </div>
                {(loading || triggering) && (
                  <div className="text-xs text-gray-400">
                    {triggering ? 'Running reconciliation...' : 'Refreshing...'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Error Messages */}
        {bankrollSafetyError && (
          <div className="bg-red-900 border border-red-600 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-200">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span className="font-medium">Bankroll Safety Error:</span>
            </div>
            <p className="text-red-300 mt-1">{bankrollSafetyError}</p>
          </div>
        )}

        {profitLossError && (
          <div className="bg-red-900 border border-red-600 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-200">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span className="font-medium">Profit/Loss Monitor Error:</span>
            </div>
            <p className="text-red-300 mt-1">{profitLossError}</p>
          </div>
        )}

        {/* Gem Fairness Status Card */}
        {gemFairness?.gemFairnessCheck && (
          <div className="bg-cardMedium rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon 
                  icon={gemFairness.gemFairnessCheck.isHealthy ? faCheckCircle : faExclamationTriangle} 
                  className={gemFairness.gemFairnessCheck.isHealthy ? 'text-green-400' : 'text-red-400'} 
                />
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Gem Drop Fairness: {gemFairness.gemFairnessCheck.isHealthy ? 'Fair' : 'UNFAIR'}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {gemFairness.gemFairnessCheck.fairnessPercentage.toFixed(1)}% fair • {gemFairness.gemFairnessCheck.unfairUsers} unfair users
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-300 mb-1">
                  <span className={`font-semibold ${
                    gemFairness.gemFairnessCheck.fairnessPercentage < 90 ? 'text-red-400' : 
                    gemFairness.gemFairnessCheck.fairnessPercentage < 95 ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {gemFairness.gemFairnessCheck.totalUsersAnalyzed} users analyzed
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {gemFairness.gemFairnessCheck.wagerThreshold}+ SOL wagered threshold
                </div>
              </div>
            </div>
          </div>
        )}

        {gemFairnessError && (
          <div className="bg-red-900 border border-red-600 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-200">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span className="font-medium">Gem Fairness Monitor Error:</span>
            </div>
            <p className="text-red-300 mt-1">{gemFairnessError}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900 border border-red-600 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-200">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span className="font-medium">Error during reconciliation:</span>
            </div>
            <p className="text-red-300 mt-1">{error}</p>
          </div>
        )}

        {/* Bankroll Safety Details */}
        {bankrollSafety?.safetyCheck && (
          <div className="bg-cardMedium rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Bankroll Safety Monitor</h2>
              <div className="flex gap-3">
                <button
                  onClick={() => loadReconciliationResults(true)}
                  disabled={loading || triggering}
                  className="flex items-center gap-2 px-4 py-2 bg-cardMedium text-white font-medium rounded hover:bg-gray-600 disabled:opacity-50 border border-gray-600"
                >
                  <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
                <button
                  onClick={triggerManualReconciliation}
                  disabled={loading || triggering}
                  className="flex items-center gap-2 px-4 py-2 bg-richGold text-black font-medium rounded hover:bg-yellow-400 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faSync} className={triggering ? 'animate-spin' : ''} />
                  {triggering ? 'Running...' : 'Run Now'}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Current Bankroll</h3>
                <p className="text-2xl font-bold text-white">${bankrollSafety.safetyCheck.bankrollUsd.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Safety Threshold</h3>
                <p className="text-2xl font-bold text-white">${bankrollSafety.safetyCheck.safetyThreshold.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Risk Level</h3>
                <p className={`text-2xl font-bold ${
                  bankrollSafety.safetyCheck.riskLevel < 50 ? 'text-red-400' : 
                  bankrollSafety.safetyCheck.riskLevel < 80 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {bankrollSafety.safetyCheck.riskLevel.toFixed(1)}%
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Status</h3>
                <p className={`text-2xl font-bold ${bankrollSafety.safetyCheck.isSafe ? 'text-green-400' : 'text-red-400'}`}>
                  {bankrollSafety.safetyCheck.isSafe ? 'SAFE' : 'UNSAFE'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="text-gray-300 font-medium mb-2">Safety Parameters</h4>
                <div className="space-y-1 text-gray-400">
                  <div>Max Bet: ${bankrollSafety.safetyCheck.maxBet}</div>
                  <div>Max Win Multiplier: {bankrollSafety.safetyCheck.maxWin}X</div>
                  <div>Safety Factor: {bankrollSafety.safetyCheck.safetyFactor}X buffer</div>
                  <div>Calculation: ${bankrollSafety.safetyCheck.maxBet} × {bankrollSafety.safetyCheck.maxWin} × {bankrollSafety.safetyCheck.safetyFactor} = ${bankrollSafety.safetyCheck.safetyThreshold.toFixed(2)}</div>
                </div>
              </div>
              <div>
                <h4 className="text-gray-300 font-medium mb-2">Monitor Status</h4>
                <div className="space-y-1 text-gray-400">
                  <div>Checks: Every 10 minutes</div>
                  <div>Total Checks: {bankrollSafety.stats.updateCount}</div>
                  <div>Alerts Sent: {bankrollSafety.stats.alertsSent}</div>
                  <div>Health: <span className={`font-medium ${
                    bankrollSafety.stats.healthStatus === 'healthy' ? 'text-green-400' : 'text-red-400'
                  }`}>{bankrollSafety.stats.healthStatus.toUpperCase()}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Gem Fairness Details */}
        {gemFairness?.gemFairnessCheck && (
          <div className="bg-cardMedium rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Gem Drop Fairness Monitor</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Users Analyzed</h3>
                <p className="text-2xl font-bold text-white">{gemFairness.gemFairnessCheck.totalUsersAnalyzed}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Unfair Users</h3>
                <p className={`text-2xl font-bold ${
                  gemFairness.gemFairnessCheck.unfairUsers === 0 ? 'text-green-400' : 'text-red-400'
                }`}>{gemFairness.gemFairnessCheck.unfairUsers}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Fairness Rate</h3>
                <p className={`text-2xl font-bold ${
                  gemFairness.gemFairnessCheck.fairnessPercentage >= 95 ? 'text-green-400' : 
                  gemFairness.gemFairnessCheck.fairnessPercentage >= 90 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {gemFairness.gemFairnessCheck.fairnessPercentage.toFixed(1)}%
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Status</h3>
                <p className={`text-2xl font-bold ${gemFairness.gemFairnessCheck.isHealthy ? 'text-green-400' : 'text-red-400'}`}>
                  {gemFairness.gemFairnessCheck.isHealthy ? 'FAIR' : 'UNFAIR'}
                </p>
              </div>
            </div>

            {/* Gem Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div>
                <h4 className="text-gray-300 font-medium mb-3">Gem Drop Statistics</h4>
                <div className="space-y-2">
                  {Object.entries(gemFairness.gemFairnessCheck.gemStatistics || {}).map(([gemName, stats]) => (
                    <div key={gemName} className="flex justify-between items-center p-2 bg-gray-800/30 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{gemName}</span>
                        <span className="text-xs text-gray-400">({stats.rarity})</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${
                          stats.overallDeviation >= 0.8 && stats.overallDeviation <= 1.2 ? 'text-green-400' : 
                          stats.overallDeviation >= 0.5 && stats.overallDeviation <= 2.0 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {stats.overallDeviation.toFixed(2)}x rate
                        </div>
                        <div className="text-xs text-gray-400">
                          {stats.unfairUserCount > 0 && `${stats.unfairUserCount} unfair`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="text-gray-300 font-medium mb-3">Monitor Configuration</h4>
                <div className="space-y-1 text-gray-400 text-sm">
                  <div>Wager Threshold: {gemFairness.gemFairnessCheck.wagerThreshold} SOL</div>
                  <div>Fairness Tolerance: {gemFairness.gemFairnessCheck.fairnessTolerance}X deviation</div>
                  <div>Drop Rate: Per 0.1 SOL wagered</div>
                  <div>Analysis Period: Every 2 hours</div>
                  <div>Total Checks: {gemFairness.stats.updateCount}</div>
                  <div>Alerts Sent: {gemFairness.stats.alertsSent}</div>
                  <div>Health: <span className={`font-medium ${
                    gemFairness.stats.healthStatus === 'healthy' ? 'text-green-400' : 'text-red-400'
                  }`}>{gemFairness.stats.healthStatus.toUpperCase()}</span></div>
                </div>
              </div>
            </div>

            {/* Top Unfair Users (if any) */}
            {gemFairness.gemFairnessCheck.topUnfairUsers && gemFairness.gemFairnessCheck.topUnfairUsers.length > 0 && (
              <div className="mt-4 p-4 bg-red-900/20 border-l-4 border-red-500 rounded-lg">
                <h4 className="text-red-300 font-medium mb-2">🚨 Top Unfair Users</h4>
                <div className="space-y-2">
                  {gemFairness.gemFairnessCheck.topUnfairUsers.slice(0, 5).map((user, index) => (
                    <div key={user.userId} className="flex justify-between items-center text-sm">
                      <div className="text-gray-300">
                        <span className="font-mono">{user.walletAddress.substring(0, 8)}...{user.walletAddress.slice(-4)}</span>
                        <span className="ml-2 text-gray-400">({user.totalWageredSol.toFixed(2)} SOL wagered)</span>
                      </div>
                      <div className="text-red-300">
                        {user.maxDeviationGem}: {user.maxDeviationRatio.toFixed(2)}x
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Users showing significant deviation from expected gem drop rates. Review individual cases for potential issues.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Reconciliation Summary Cards */}
        {summary && (
          <div className="bg-cardMedium rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Balance Reconciliation</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-1">Total Users</h3>
              <p className="text-2xl font-bold text-white">{summary.totalUsers}</p>
            </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-1">Matches</h3>
              <p className="text-2xl font-bold text-green-400">{summary.matches}</p>
            </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-1">Mismatches</h3>
              <p className="text-2xl font-bold text-red-400">{summary.mismatches}</p>
            </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-1">Errors</h3>
              <p className="text-2xl font-bold text-red-500">{summary.errors}</p>
              </div>
            </div>
          </div>
        )}

        {/* Issues Table */}
        {mismatchedUsers.length > 0 && (
          <div className="bg-cardMedium rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-400 mb-4">
              Users with Balance Issues ({mismatchedUsers.length})
            </h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-600">
                    <th className="text-left text-gray-300 py-3 px-2">Status</th>
                    <th className="text-left text-gray-300 py-3 px-2">Wallet Address</th>
                    <th className="text-left text-gray-300 py-3 px-2">DB Balance</th>
                    <th className="text-left text-gray-300 py-3 px-2">On-Chain Balance</th>
                    <th className="text-left text-gray-300 py-3 px-2">Difference</th>
                    <th className="text-left text-gray-300 py-3 px-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {mismatchedUsers.map((result) => (
                    <tr key={result.userId} className="border-b border-gray-700 hover:bg-gray-800/50">
                      <td className="py-3 px-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          result.status === 'mismatch' ? 'bg-red-800 text-red-200' : 'bg-red-900 text-red-300'
                        }`}>
                          {result.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono text-xs text-white">
                        {result.walletAddress.substring(0, 8)}...{result.walletAddress.slice(-4)}
                      </td>
                      <td className="py-3 px-2 text-white font-mono">
                        {formatSOL(result.dbBalance)}
                      </td>
                      <td className="py-3 px-2 text-white font-mono">
                        {result.status === 'error' ? 'Error' : formatSOL(result.onChainBalance)}
                      </td>
                      <td className="py-3 px-2 font-mono">
                        <span className={result.difference > 100000 ? 'text-red-300' : result.difference < -100000 ? 'text-yellow-300' : 'text-green-300'}>
                          {result.status === 'error' ? 'N/A' : 
                           result.difference >= 0 ? `+${formatSOL(result.difference)}` : formatSOL(result.difference)}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-red-300 text-xs">
                        {result.error || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Data Message */}
        {!summary && !loading && !triggering && (
          <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-6 text-center">
            <FontAwesomeIcon icon={faClock} className="text-gray-400 w-12 h-12 mb-3" />
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No Recent Data</h3>
            <p className="text-gray-400 mb-4">
              No reconciliation data available. Reconciliation runs automatically on the server every hour.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => loadReconciliationResults(true)}
                disabled={loading || triggering}
                className="px-4 py-2 bg-cardMedium text-white font-medium rounded hover:bg-gray-600 border border-gray-600 disabled:opacity-50"
              >
                Refresh Results
              </button>
              <button
                onClick={triggerManualReconciliation}
                disabled={loading || triggering}
                className="px-4 py-2 bg-richGold text-black font-medium rounded hover:bg-yellow-400 disabled:opacity-50"
              >
                {triggering ? 'Running...' : 'Run Now'}
              </button>
            </div>
          </div>
        )}

        {/* No Issues Message */}
        {summary && mismatchedUsers.length === 0 && (
          <div className="bg-green-900/20 border border-green-600 rounded-lg p-6 text-center">
            <FontAwesomeIcon icon={faCheckCircle} className="text-green-400 w-12 h-12 mb-3" />
            <h3 className="text-lg font-semibold text-green-300 mb-2">All Balances Match!</h3>
            <p className="text-green-400">
              All {summary.matches} users with vaults have matching balances between database and on-chain.
            </p>
          </div>
        )}

        {/* Profit/Loss Details */}
        {profitLoss?.profitLossCheck && (
          <div className="bg-cardMedium rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Profit/Loss Ratio Monitor</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Total Wagered</h3>
                <p className="text-2xl font-bold text-white">${profitLoss.profitLossCheck.totalWagersUsd.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Total Paid Out</h3>
                <p className="text-2xl font-bold text-white">${profitLoss.profitLossCheck.totalPayoutsUsd.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">Actual RTP</h3>
                <p className={`text-2xl font-bold ${
                  !profitLoss.profitLossCheck.hasEnoughData ? 'text-gray-400' :
                  profitLoss.profitLossCheck.actualRtpPercent < 90 ? 'text-red-400' : 
                  profitLoss.profitLossCheck.actualRtpPercent > 105 ? 'text-orange-400' : 'text-green-400'
                }`}>
                  {!profitLoss.profitLossCheck.hasEnoughData ? 'N/A' : `${profitLoss.profitLossCheck.actualRtpPercent.toFixed(2)}%`}
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-1">House Edge</h3>
                <p className={`text-2xl font-bold ${
                  !profitLoss.profitLossCheck.hasEnoughData ? 'text-gray-400' :
                  profitLoss.profitLossCheck.houseEdgePercent > 10 ? 'text-red-400' : 
                  profitLoss.profitLossCheck.houseEdgePercent < 0 ? 'text-orange-400' : 'text-green-400'
                }`}>
                  {!profitLoss.profitLossCheck.hasEnoughData ? 'N/A' : `${profitLoss.profitLossCheck.houseEdgePercent.toFixed(2)}%`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h4 className="text-gray-300 font-medium mb-2">Performance Analysis</h4>
                <div className="space-y-1 text-gray-400">
                  <div>Expected RTP: {profitLoss.profitLossCheck.expectedRtpPercent}%</div>
                  <div>Deviation: {profitLoss.profitLossCheck.deviationPercent >= 0 ? '+' : ''}{profitLoss.profitLossCheck.deviationPercent.toFixed(2)}%</div>
                  <div>Transaction Count: {profitLoss.profitLossCheck.transactionCount}</div>
                  <div>Analysis Window: Rolling 24h</div>
                </div>
              </div>
              <div>
                <h4 className="text-gray-300 font-medium mb-2">Health Thresholds</h4>
                <div className="space-y-1 text-gray-400">
                  <div>Healthy Range: {profitLoss.profitLossCheck.healthyRange.min}% - {profitLoss.profitLossCheck.healthyRange.max}% RTP</div>
                  <div>Min Transactions: {profitLoss.profitLossCheck.minTransactionThreshold}</div>
                  <div>Current Status: <span className={`font-medium ${
                    !profitLoss.profitLossCheck.hasEnoughData ? 'text-yellow-400' :
                    profitLoss.profitLossCheck.isHealthy ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {!profitLoss.profitLossCheck.hasEnoughData ? 'INSUFFICIENT DATA' :
                     profitLoss.profitLossCheck.isHealthy ? 'HEALTHY' : 'ALERT'}
                  </span></div>
                  <div>Alert Type: <span className={`font-medium ${
                    profitLoss.profitLossCheck.alertType === 'insufficient_data' ? 'text-yellow-400' :
                    profitLoss.profitLossCheck.alertSeverity === 'critical' ? 'text-red-400' : 
                    profitLoss.profitLossCheck.alertSeverity === 'warning' ? 'text-yellow-400' : 'text-green-400'
                  }`}>{profitLoss.profitLossCheck.alertType || 'None'}</span></div>
                </div>
              </div>
              <div>
                <h4 className="text-gray-300 font-medium mb-2">Monitor Status</h4>
                <div className="space-y-1 text-gray-400">
                  <div>Checks: Every hour</div>
                  <div>Total Checks: {profitLoss.stats.updateCount}</div>
                  <div>Alerts Sent: {profitLoss.stats.alertsSent}</div>
                  <div>Health: <span className={`font-medium ${
                    profitLoss.stats.healthStatus === 'healthy' ? 'text-green-400' : 'text-red-400'
                  }`}>{profitLoss.stats.healthStatus.toUpperCase()}</span></div>
                </div>
              </div>
            </div>

            {((!profitLoss.profitLossCheck.hasEnoughData && profitLoss.profitLossCheck.alertType === 'insufficient_data') || 
              (profitLoss.profitLossCheck.hasEnoughData && profitLoss.profitLossCheck.alertType && profitLoss.profitLossCheck.alertType !== 'insufficient_data')) && (
              <div className={`mt-4 p-4 rounded-lg border-l-4 ${
                profitLoss.profitLossCheck.alertType === 'insufficient_data' ? 'bg-blue-900/20 border-blue-500' :
                profitLoss.profitLossCheck.alertSeverity === 'critical' ? 'bg-red-900/20 border-red-500' : 'bg-yellow-900/20 border-yellow-500'
              }`}>
                <h4 className={`font-medium mb-2 ${
                  profitLoss.profitLossCheck.alertType === 'insufficient_data' ? 'text-blue-300' :
                  profitLoss.profitLossCheck.alertSeverity === 'critical' ? 'text-red-300' : 'text-yellow-300'
                }`}>
                  {profitLoss.profitLossCheck.alertType === 'insufficient_data' ? '📊 Insufficient Data' :
                   profitLoss.profitLossCheck.alertSeverity === 'critical' ? '🚨 Critical Alert' : '⚠️ Warning'}
                </h4>
                <p className="text-sm text-gray-300">
                  {profitLoss.profitLossCheck.alertType === 'insufficient_data' && 
                    `Waiting for more transaction data to perform reliable analysis. Current: ${profitLoss.profitLossCheck.transactionCount} transactions, need at least ${profitLoss.profitLossCheck.minTransactionThreshold}. Monitor will continue checking every hour.`}
                  {profitLoss.profitLossCheck.alertType === 'house_winning_too_much' && 
                    'The house is winning significantly more than expected. This could indicate a bug in game logic or RNG systems.'}
                  {profitLoss.profitLossCheck.alertType === 'players_winning_too_much' && 
                    'Players are winning significantly more than expected. This could indicate a potential exploit or vulnerability.'}
                  {profitLoss.profitLossCheck.alertType === 'significant_deviation' && 
                    'There is a significant deviation from expected RTP. Monitor gameplay patterns and investigate if necessary.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}