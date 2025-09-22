import React from 'react';
import { useRealtimeBalance } from '@/hooks/useRealtimeBalance';

interface RealtimeBalanceDisplayProps {
  username: string;
  userId?: string;
  className?: string;
  showDebugInfo?: boolean;
}

export function RealtimeBalanceDisplay({ 
  username, 
  userId, 
  className = '',
  showDebugInfo = false 
}: RealtimeBalanceDisplayProps) {
  const {
    balanceLamports,
    balanceSol,
    balanceUsd,
    isLoading,
    error,
    lastUpdated,
    refreshBalance,
    isConnected
  } = useRealtimeBalance({ username, userId });

  const formatTime = (timestamp: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleTimeString();
  };

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        <span className="text-gray-500">Loading balance...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="h-2 w-2 bg-red-500 rounded-full"></div>
        <span className="text-red-500">Error: {error}</span>
        <button 
          onClick={refreshBalance}
          className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col space-y-1 ${className}`}>
      {/* Main Balance Display */}
      <div className="flex items-center space-x-3">
        <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
        <div className="flex flex-col">
          <span className="text-lg font-bold text-white">
            ${balanceUsd.toFixed(2)}
          </span>
          <span className="text-sm text-gray-400">
            {balanceSol.toFixed(6)} SOL
          </span>
        </div>
        <button 
          onClick={refreshBalance}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          title="Refresh balance"
        >
          ↻
        </button>
      </div>

      {/* Debug Information */}
      {showDebugInfo && (
        <div className="text-xs text-gray-500 space-y-1">
          <div>Status: {isConnected ? 'Realtime Connected' : 'Disconnected'}</div>
          <div>Last Update: {formatTime(lastUpdated)}</div>
          <div>Lamports: {balanceLamports.toLocaleString()}</div>
          <div>Username: {username}</div>
          {userId && <div>User ID: {userId}</div>}
        </div>
      )}
    </div>
  );
}

export default RealtimeBalanceDisplay; 