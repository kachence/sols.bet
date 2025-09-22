import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Play, RotateCcw, Clock, AlertTriangle, Info, Lock, Unlock, Shield } from 'lucide-react';
import { generateTestSignature } from '@/lib/hmacUtils';
import { useWallet } from '@solana/wallet-adapter-react';
import { AdminLayout } from '@/components/layout';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'running' | 'pending';
  duration?: number;
  expectedBalance?: number;
  actualBalance?: number;
  error?: string;
  response?: any;
  sentData?: any;
}

interface TestSuite {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  isRunning: boolean;
}



const generateUniqId = (prefix: string = 'unitest_') => {
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).substring(2, 10);
  return `${prefix}${timestamp}${random}`;
};

const generateGpid = () => Math.floor(Math.random() * 100000000);

const getCurrentTimestamp = () => {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace('T', ' ');
};

const RGSUnitTests = () => {
  const { publicKey, connected } = useWallet();
  
  const [testSuite, setTestSuite] = useState<TestSuite>({
    totalTests: 13, // Base test count, may increase with test mode operations
    passedTests: 0,
    failedTests: 0,
    results: [],
    isRunning: false
  });
  
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'individual'>('overview');

  // Test Mode Rate Locking State
  const [testMode, setTestMode] = useState({
    isActive: false,
    lockedRate: null as number | null,
    expiresAt: null as string | null,
    secondsRemaining: 0,
    isLoading: false
  });

  // Configuration
  const [config, setConfig] = useState({
    operatorId: '241',
    username: connected && publicKey ? publicKey.toString().substring(0, 20) : '',
    userId: '66',
            getbalanceUrl: 'https://casino-worker-v2.fly.dev/getbalance',
        balanceAdjUrl: 'https://casino-worker-v2.fly.dev/balance_adj',
    currency: 'CREDITS',
    apiEncryptionKey: 'f7b9cf1435e3b89f2ac1280e5e81aa4171a0c3ebcde32cd7f2a1a1d0b6d36910c6122cfbd4c61fa3c7c15475ad3798710b541cc0666fba57d1f963f2749f4d4e', // CWS API encryption key
            testModeBaseUrl: 'https://casino-worker-v2.fly.dev'
  });

  // Auto-fill wallet address when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      setConfig(prev => ({
        ...prev,
        username: publicKey.toString().substring(0, 20)
      }));
    }
  }, [connected, publicKey]);

  // Test Mode Functions
  const checkTestModeStatus = async () => {
    try {
      const response = await fetch(`${config.testModeBaseUrl}/test/rate-status`);
      const result = await response.json();
      
      if (result.status === 'success' && result.testMode) {
        setTestMode(prev => ({
          ...prev,
          isActive: result.testMode.isActive,
          lockedRate: result.testMode.lockedRate,
          expiresAt: result.testMode.expiresAt,
          secondsRemaining: result.testMode.secondsRemaining
        }));
      }
    } catch (error) {
      console.error('Failed to check test mode status:', error);
    }
  };

  const lockRateForTesting = async (duration: number = 120) => {
    setTestMode(prev => ({ ...prev, isLoading: true }));
    
    try {
      const response = await fetch(`${config.testModeBaseUrl}/test/lock-rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration })
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        setTestMode(prev => ({
          ...prev,
          isActive: true,
          lockedRate: result.lockedRate,
          expiresAt: result.expiresAt,
          secondsRemaining: duration,
          isLoading: false
        }));
        return true;
      } else {
        throw new Error(result.error || 'Failed to lock rate');
      }
    } catch (error) {
      console.error('Failed to lock rate:', error);
      setTestMode(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  };

  const unlockRate = async () => {
    setTestMode(prev => ({ ...prev, isLoading: true }));
    
    try {
      const response = await fetch(`${config.testModeBaseUrl}/test/unlock-rate`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        setTestMode(prev => ({
          ...prev,
          isActive: false,
          lockedRate: null,
          expiresAt: null,
          secondsRemaining: 0,
          isLoading: false
        }));
        return true;
      } else {
        throw new Error(result.error || 'Failed to unlock rate');
      }
    } catch (error) {
      console.error('Failed to unlock rate:', error);
      setTestMode(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  };

  // Check test mode status on component mount and periodically
  useEffect(() => {
    checkTestModeStatus();
    const interval = setInterval(checkTestModeStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [config.testModeBaseUrl]);

  const makeRequest = async (url: string, data: any): Promise<{ response: any; duration: number }> => {
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      const duration = Date.now() - startTime;
      
      return { response: result, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw { error, duration };
    }
  };

  const updateTestResult = (newResult: TestResult) => {
    setTestSuite(prev => {
      // Check if a result with the same name already exists
      const existingIndex = prev.results.findIndex(r => r.name === newResult.name);
      
      let updatedResults;
      if (existingIndex >= 0) {
        // Update existing result
        updatedResults = [...prev.results];
        updatedResults[existingIndex] = newResult;
      } else {
        // Add new result
        updatedResults = [...prev.results, newResult];
      }
      
      const passed = updatedResults.filter(r => r.status === 'passed').length;
      const failed = updatedResults.filter(r => r.status === 'failed').length;
      
      return {
        ...prev,
        results: updatedResults,
        passedTests: passed,
        failedTests: failed
      };
    });
  };

  // Test 1: Get Balance
  const runTest1 = async () => {
    const uniqid = generateUniqId();
    const timestamp = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data object for signature generation (without hashed_result)
    const dataForSig = {
      command: "getbalance",
      timestamp,
      login,
      internal_session_id: "",
      uniqid,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };
    
    const data = {
      ...dataForSig,
      currency: config.currency,
      hashed_result: await generateTestSignature(dataForSig, config.apiEncryptionKey)
    };

    try {
      const { response, duration } = await makeRequest(config.getbalanceUrl, data);
      const balance = parseFloat(response.balance || 0);
      setCurrentBalance(balance);
      
      const success = response.status === "1" && balance > 0;
      updateTestResult({
        name: "Test 1: Get Balance",
        status: success ? 'passed' : 'failed',
        duration,
        expectedBalance: balance,
        actualBalance: balance,
        error: success ? undefined : 'Expected balance > 0 and status = "1"',
        response,
        sentData: data
      });
    } catch (error: any) {
      updateTestResult({
        name: "Test 1: Get Balance",
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: data
      });
    }
  };

  // Test 2: Bet → Win (3 steps)
  const runTest2 = async () => {
    const gpid = generateGpid();
    
    // Step 1: Get Balance
    const uniqid1 = generateUniqId();
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };
    
    const getBalanceData = {
      ...dataForSig1,
      currency: config.currency,
      hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
    };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      const initialBalance = parseFloat(balanceResponse.balance || 0);
      setCurrentBalance(initialBalance);
      
      if (balanceResponse.status !== "1") {
        updateTestResult({
          name: "Test 2.1: Get Balance", 
          status: 'failed',
          duration: balanceDuration,
          error: 'Failed to get initial balance',
          response: balanceResponse,
          sentData: getBalanceData
        });
        return;
      }

      updateTestResult({
        name: "Test 2.1: Get Balance",
        status: 'passed',
        duration: balanceDuration,
        actualBalance: initialBalance,
        response: balanceResponse,
        sentData: getBalanceData
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Bet
      const uniqid2 = generateUniqId();
      const timestamp2 = getCurrentTimestamp();
      
      const dataForSig2 = {
        command: "balance_adj",
        timestamp: timestamp2,
        login,
        internal_session_id: "",
        uniqid: uniqid2,
        amount: "-1.00",
        type: "bet",
        userid: config.userId,
        custom_data: ""
      };
      
      const betData = {
        ...dataForSig2,
        currency: config.currency,
        gameid: "5500",
        gpid: gpid,
        gpid_status: "open",
        hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
      };

      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      const betBalance = parseFloat(betResponse.balance || 0);
      const expectedBetBalance = initialBalance - 1;
      
      updateTestResult({
        name: "Test 2.2: Place Bet",
        status: Math.abs(betBalance - expectedBetBalance) < 0.01 ? 'passed' : 'failed',
        duration: betDuration,
        actualBalance: betBalance,
        expectedBalance: expectedBetBalance,
        response: betResponse,
        sentData: betData,
        error: Math.abs(betBalance - expectedBetBalance) >= 0.01 ? `Expected ${expectedBetBalance}, got ${betBalance}` : undefined
      });
      
      setCurrentBalance(betBalance);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Grant Win
      const uniqid3 = generateUniqId();
      const timestamp3 = getCurrentTimestamp();
      
      const dataForSig3 = {
        command: "balance_adj",
        timestamp: timestamp3,
        login,
        internal_session_id: "",
        uniqid: uniqid3,
        amount: "5.00",
        type: "win",
        userid: config.userId,
        custom_data: ""
      };
      
      const winData = {
        ...dataForSig3,
        currency: config.currency,
        gameid: "5500",
        gpid: gpid,
        gpid_status: "closed",
        hashed_result: await generateTestSignature(dataForSig3, config.apiEncryptionKey)
      };

      const { response: winResponse, duration: winDuration } = await makeRequest(config.balanceAdjUrl, winData);
      const winBalance = parseFloat(winResponse.balance || 0);
      const expectedWinBalance = betBalance + 5;
      
      updateTestResult({
        name: "Test 2.3: Grant Win",
        status: Math.abs(winBalance - expectedWinBalance) < 0.01 ? 'passed' : 'failed',
        duration: winDuration,
        actualBalance: winBalance,
        expectedBalance: expectedWinBalance,
        response: winResponse,
        sentData: winData,
        error: Math.abs(winBalance - expectedWinBalance) >= 0.01 ? `Expected ${expectedWinBalance}, got ${winBalance}` : undefined
      });
      
      setCurrentBalance(winBalance);
          } catch (error: any) {
              updateTestResult({
        name: "Test 2: Bet → Win",
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: { command: "getbalance", login: `stg_u${config.operatorId}_${config.username}` }
      });
      }
    };

  // Test 3: Multiple Bets then Win
  const runTest3 = async () => {
    const gpid = generateGpid();
    let runningBalance = currentBalance;

    // 3.1 Get Balance
    const testName1 = "Test 3.1: Get Balance";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const balanceData = {
      command: "getbalance",
      uniqid: uniqid1,
      type: "getbalance",
      amount: "0.00",
      timestamp: timestamp1,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
    };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, balanceData);
      runningBalance = parseFloat(balanceResponse.balance || 0);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "1" ? 'passed' : 'failed',
        duration: balanceDuration,
        actualBalance: runningBalance,
        response: balanceResponse,
        sentData: balanceData
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: balanceData
      });
      return;
    }

    // 3.2.1 Place Bet 1
    const testName2 = "Test 3.2.1: Place Bet 1";
    updateTestResult({ name: testName2, status: 'running' });

    const uniqid2 = generateUniqId();
    const timestamp2 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login,
      internal_session_id: "",
      uniqid: uniqid2,
      amount: "-1.00",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const bet1Data = {
      command: "balance_adj",
      uniqid: uniqid2,
      type: "bet",
      amount: "-1.00",
      timestamp: timestamp2,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: bet1Response, duration: bet1Duration } = await makeRequest(config.balanceAdjUrl, bet1Data);
      const bet1Balance = parseFloat(bet1Response.balance || 0);
      const expectedBet1Balance = runningBalance - 1;
      
      updateTestResult({
        name: testName2,
        status: Math.abs(bet1Balance - expectedBet1Balance) < 0.01 ? 'passed' : 'failed',
        duration: bet1Duration,
        actualBalance: bet1Balance,
        expectedBalance: expectedBet1Balance,
        response: bet1Response,
        sentData: bet1Data,
        error: Math.abs(bet1Balance - expectedBet1Balance) >= 0.01 ? `Expected ${expectedBet1Balance}, got ${bet1Balance}` : undefined
      });
      
      runningBalance = bet1Balance;
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: bet1Data
      });
      return;
    }

    // 3.2.2 Place Bet 2 (increment)
    const testName3 = "Test 3.2.2: Place Bet 2 (increment)";
    updateTestResult({ name: testName3, status: 'running' });

    const uniqid3 = generateUniqId();
    const timestamp3 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig3 = {
      command: "balance_adj",
      timestamp: timestamp3,
      login,
      internal_session_id: "",
      uniqid: uniqid3,
      amount: "-2.00",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const bet2Data = {
      command: "balance_adj",
      uniqid: uniqid3,
      type: "bet",
      amount: "-2.00",
      timestamp: timestamp3,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig3, config.apiEncryptionKey)
    };

    try {
      const { response: bet2Response, duration: bet2Duration } = await makeRequest(config.balanceAdjUrl, bet2Data);
      const bet2Balance = parseFloat(bet2Response.balance || 0);
      const expectedBet2Balance = runningBalance - 2;
      
      updateTestResult({
        name: testName3,
        status: Math.abs(bet2Balance - expectedBet2Balance) < 0.01 ? 'passed' : 'failed',
        duration: bet2Duration,
        actualBalance: bet2Balance,
        expectedBalance: expectedBet2Balance,
        response: bet2Response,
        sentData: bet2Data,
        error: Math.abs(bet2Balance - expectedBet2Balance) >= 0.01 ? `Expected ${expectedBet2Balance}, got ${bet2Balance}` : undefined
      });
      
      runningBalance = bet2Balance;
    } catch (error: any) {
      updateTestResult({
        name: testName3,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: bet2Data
      });
      return;
    }

    // 3.3 Grant Win
    const testName4 = "Test 3.3: Grant Win";
    updateTestResult({ name: testName4, status: 'running' });

    const uniqid4 = generateUniqId();
    const timestamp4 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig4 = {
      command: "balance_adj",
      timestamp: timestamp4,
      login,
      internal_session_id: "",
      uniqid: uniqid4,
      amount: "3.00",
      type: "win",
      userid: config.userId,
      custom_data: ""
    };

    const winData = {
      command: "balance_adj",
      uniqid: uniqid4,
      type: "win",
      amount: "3.00",
      timestamp: timestamp4,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "closed",
      hashed_result: await generateTestSignature(dataForSig4, config.apiEncryptionKey)
    };

    try {
      const { response: winResponse, duration: winDuration } = await makeRequest(config.balanceAdjUrl, winData);
      const winBalance = parseFloat(winResponse.balance || 0);
      const expectedWinBalance = runningBalance + 3;
      
      updateTestResult({
        name: testName4,
        status: Math.abs(winBalance - expectedWinBalance) < 0.01 ? 'passed' : 'failed',
        duration: winDuration,
        actualBalance: winBalance,
        expectedBalance: expectedWinBalance,
        response: winResponse,
        sentData: winData,
        error: Math.abs(winBalance - expectedWinBalance) >= 0.01 ? `Expected ${expectedWinBalance}, got ${winBalance}` : undefined
      });
      
      setCurrentBalance(winBalance);
    } catch (error: any) {
      updateTestResult({
        name: testName4,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: winData
      });
    }
  };

  // Test 4: Idempotency on Bet
  const runTest4 = async () => {
    const gpid = generateGpid();
    const uniqId = generateUniqId();
    let runningBalance = currentBalance;

    // 4.1 Get Balance
    const testName1 = "Test 4.1: Get Balance";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const getBalanceData = {
      command: "getbalance",
      uniqid: uniqid1,
      type: "getbalance",
      amount: "0.00",
      timestamp: timestamp1,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
    };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      runningBalance = parseFloat(balanceResponse.balance || 0);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "1" ? 'passed' : 'failed',
        duration: balanceDuration,
        actualBalance: runningBalance,
        response: balanceResponse,
        sentData: getBalanceData
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
      return;
    }

    // 4.2.1 Place Bet (First Time)
    const testName2 = "Test 4.2.1: Place Bet (First)";
    updateTestResult({ name: testName2, status: 'running' });

    const timestamp2 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login,
      internal_session_id: "",
      uniqid: uniqId,
      amount: "-1.00",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const betData = {
      command: "balance_adj",
      uniqid: uniqId,
      type: "bet",
      amount: "-1.00",
      timestamp: timestamp2,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      const betBalance = parseFloat(betResponse.balance || 0);
      const expectedBetBalance = runningBalance - 1;
      
      updateTestResult({
        name: testName2,
        status: Math.abs(betBalance - expectedBetBalance) < 0.01 ? 'passed' : 'failed',
        duration: betDuration,
        actualBalance: betBalance,
        expectedBalance: expectedBetBalance,
        response: betResponse,
        sentData: betData,
        error: Math.abs(betBalance - expectedBetBalance) >= 0.01 ? `Expected ${expectedBetBalance}, got ${betBalance}` : undefined
      });
      
      runningBalance = betBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
      return;
    }

    // 4.2.2 Repeat Same Bet (should be idempotent)
    const testName3 = "Test 4.2.2: Repeat Same Bet (Idempotency)";
    updateTestResult({ name: testName3, status: 'running' });

    const timestamp3 = getCurrentTimestamp();
    
    // Create data for signature generation (same uniqid, new timestamp)
    const dataForSig3 = {
      command: "balance_adj",
      timestamp: timestamp3,
      login,
      internal_session_id: "",
      uniqid: uniqId, // Same uniqid for idempotency test
      amount: "-1.00",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const repeatBetData = {
      ...betData,
      timestamp: timestamp3,
      hashed_result: await generateTestSignature(dataForSig3, config.apiEncryptionKey)
    };

    try {
      const { response: repeatResponse, duration: repeatDuration } = await makeRequest(config.balanceAdjUrl, repeatBetData);
      const repeatBalance = parseFloat(repeatResponse.balance || 0);
      
      updateTestResult({
        name: testName3,
        status: Math.abs(repeatBalance - runningBalance) < 0.01 ? 'passed' : 'failed',
        duration: repeatDuration,
        actualBalance: repeatBalance,
        expectedBalance: runningBalance,
        response: repeatResponse,
        sentData: repeatBetData,
        error: Math.abs(repeatBalance - runningBalance) >= 0.01 ? `Expected ${runningBalance}, got ${repeatBalance} - transaction should not be processed twice` : undefined
      });
      
      runningBalance = repeatBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName3,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: repeatBetData
      });
      return;
    }

    // 4.2.3 Grant Win (close the gameplay)
    const testName4 = "Test 4.2.3: Grant Win";
    updateTestResult({ name: testName4, status: 'running' });

    const uniqid4 = generateUniqId();
    const timestamp4 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig4 = {
      command: "balance_adj",
      timestamp: timestamp4,
      login,
      internal_session_id: "",
      uniqid: uniqid4,
      amount: "0.00",
      type: "win",
      userid: config.userId,
      custom_data: ""
    };

    const winData = {
      command: "balance_adj",
      uniqid: uniqid4,
      type: "win",
      amount: "0.00",
      timestamp: timestamp4,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "closed",
      hashed_result: await generateTestSignature(dataForSig4, config.apiEncryptionKey)
    };

    try {
      const { response: winResponse, duration: winDuration } = await makeRequest(config.balanceAdjUrl, winData);
      const winBalance = parseFloat(winResponse.balance || 0);
      const expectedWinBalance = runningBalance; // 0 win means balance should stay the same
      
      updateTestResult({
        name: testName4,
        status: Math.abs(winBalance - expectedWinBalance) < 0.01 ? 'passed' : 'failed',
        duration: winDuration,
        actualBalance: winBalance,
        expectedBalance: expectedWinBalance,
        response: winResponse,
        sentData: winData,
        error: Math.abs(winBalance - expectedWinBalance) >= 0.01 ? `Expected ${expectedWinBalance}, got ${winBalance}` : undefined
      });
      
      setCurrentBalance(winBalance);
    } catch (error: any) {
      updateTestResult({
        name: testName4,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: winData
      });
    }
  };

  // Test 5: Idempotency on Win
  const runTest5 = async () => {
    const gpid = generateGpid();
    let runningBalance = currentBalance;

    // 5.1 Get Balance
    const testName1 = "Test 5.1: Get Balance";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const getBalanceData = {
      command: "getbalance",
      uniqid: uniqid1,
      type: "getbalance",
      amount: "0.00",
      timestamp: timestamp1,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
    };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      runningBalance = parseFloat(balanceResponse.balance || 0);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "1" ? 'passed' : 'failed',
        duration: balanceDuration,
        actualBalance: runningBalance,
        response: balanceResponse,
        sentData: getBalanceData
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
      return;
    }

    // 5.2.1 Place Bet
    const testName2 = "Test 5.2.1: Place Bet";
    updateTestResult({ name: testName2, status: 'running' });

    const uniqid2 = generateUniqId();
    const timestamp2 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login,
      internal_session_id: "",
      uniqid: uniqid2,
      amount: "-1.00",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const betData = {
      command: "balance_adj",
      uniqid: uniqid2,
      type: "bet",
      amount: "-1.00",
      timestamp: timestamp2,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      const betBalance = parseFloat(betResponse.balance || 0);
      const expectedBetBalance = runningBalance - 1;
      
      updateTestResult({
        name: testName2,
        status: Math.abs(betBalance - expectedBetBalance) < 0.01 ? 'passed' : 'failed',
        duration: betDuration,
        actualBalance: betBalance,
        expectedBalance: expectedBetBalance,
        response: betResponse,
        sentData: betData,
        error: Math.abs(betBalance - expectedBetBalance) >= 0.01 ? `Expected ${expectedBetBalance}, got ${betBalance}` : undefined
      });
      
      runningBalance = betBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
      return;
    }

    // 5.3 Grant Win (First Time)
    const testName3 = "Test 5.3: Grant Win (First)";
    updateTestResult({ name: testName3, status: 'running' });

    const winUniqId = generateUniqId();
    const timestamp3 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig3 = {
      command: "balance_adj",
      timestamp: timestamp3,
      login,
      internal_session_id: "",
      uniqid: winUniqId,
      amount: "1.00",
      type: "win",
      userid: config.userId,
      custom_data: ""
    };

    const winData = {
      command: "balance_adj",
      uniqid: winUniqId,
      type: "win",
      amount: "1.00",
      timestamp: timestamp3,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "closed",
      hashed_result: await generateTestSignature(dataForSig3, config.apiEncryptionKey)
    };

    try {
      const { response: winResponse, duration: winDuration } = await makeRequest(config.balanceAdjUrl, winData);
      const winBalance = parseFloat(winResponse.balance || 0);
      const expectedWinBalance = runningBalance + 1;
      
      updateTestResult({
        name: testName3,
        status: Math.abs(winBalance - expectedWinBalance) < 0.01 ? 'passed' : 'failed',
        duration: winDuration,
        actualBalance: winBalance,
        expectedBalance: expectedWinBalance,
        response: winResponse,
        sentData: winData,
        error: Math.abs(winBalance - expectedWinBalance) >= 0.01 ? `Expected ${expectedWinBalance}, got ${winBalance}` : undefined
      });
      
      runningBalance = winBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName3,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: winData
      });
      return;
    }

    // 5.3.2 Repeat Same Win (should be idempotent)
    const testName4 = "Test 5.3.2: Repeat Same Win (Idempotency)";
    updateTestResult({ name: testName4, status: 'running' });

    const timestamp4 = getCurrentTimestamp();
    
    // Create data for signature generation (same uniqid, new timestamp)
    const dataForSig4 = {
      command: "balance_adj",
      timestamp: timestamp4,
      login,
      internal_session_id: "",
      uniqid: winUniqId, // Same uniqid for idempotency test
      amount: "1.00",
      type: "win",
      userid: config.userId,
      custom_data: ""
    };

    const repeatWinData = {
      ...winData,
      timestamp: timestamp4,
      hashed_result: await generateTestSignature(dataForSig4, config.apiEncryptionKey)
    };

    try {
      const { response: repeatResponse, duration: repeatDuration } = await makeRequest(config.balanceAdjUrl, repeatWinData);
      const repeatBalance = parseFloat(repeatResponse.balance || 0);
      
      updateTestResult({
        name: testName4,
        status: Math.abs(repeatBalance - runningBalance) < 0.01 ? 'passed' : 'failed',
        duration: repeatDuration,
        actualBalance: repeatBalance,
        expectedBalance: runningBalance,
        response: repeatResponse,
        sentData: repeatWinData,
        error: Math.abs(repeatBalance - runningBalance) >= 0.01 ? `Expected ${runningBalance}, got ${repeatBalance} - transaction should not be processed twice` : undefined
      });
      
      setCurrentBalance(repeatBalance);
    } catch (error: any) {
      updateTestResult({
        name: testName4,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: repeatWinData
      });
    }
  };

  // Test 6: Natural Freespins
  const runTest6 = async () => {
    const gpid = generateGpid();
    let runningBalance = currentBalance;

    // 6.1 Get Balance
    const testName1 = "Test 6.1: Get Balance";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const getBalanceData = {
        command: "getbalance",
        uniqid: uniqid1,
        type: "getbalance",
        amount: "0.00",
        timestamp: timestamp1,
        login,
        userid: config.userId,
        currency: config.currency,
        internal_session_id: "",
        custom_data: "",
        hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
      };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      runningBalance = parseFloat(balanceResponse.balance || 0);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "1" ? 'passed' : 'failed',
        duration: balanceDuration,
        actualBalance: runningBalance,
        response: balanceResponse,
        sentData: getBalanceData
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
      return;
    }

    // 6.2.1 Place Bet
    const testName2 = "Test 6.2.1: Place Bet";
    updateTestResult({ name: testName2, status: 'running' });

    const uniqid2 = generateUniqId();
    const timestamp2 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login,
      internal_session_id: "",
      uniqid: uniqid2,
      amount: "-0.50",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const betData = {
      command: "balance_adj",
      uniqid: uniqid2,
      type: "bet",
      amount: "-0.50",
      timestamp: timestamp2,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      const betBalance = parseFloat(betResponse.balance || 0);
      const expectedBetBalance = runningBalance - 0.5;
      
      updateTestResult({
        name: testName2,
        status: Math.abs(betBalance - expectedBetBalance) < 0.01 ? 'passed' : 'failed',
        duration: betDuration,
        actualBalance: betBalance,
        expectedBalance: expectedBetBalance,
        response: betResponse,
        sentData: betData,
        error: Math.abs(betBalance - expectedBetBalance) >= 0.01 ? `Expected ${expectedBetBalance}, got ${betBalance}` : undefined
      });
      
      runningBalance = betBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
      return;
    }

    // 6.3 Grant Win = 0 (Main spin win)
    const testName3 = "Test 6.3: Grant Win = 0 (Main spin)";
    updateTestResult({ name: testName3, status: 'running' });

    const uniqid3 = generateUniqId();
    const timestamp3 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig3 = {
      command: "balance_adj",
      timestamp: timestamp3,
      login,
      internal_session_id: "",
      uniqid: uniqid3,
      amount: "0.0000",
      type: "win",
      userid: config.userId,
      custom_data: ""
    };

    const zeroWinData = {
      command: "balance_adj",
      uniqid: uniqid3,
      type: "win",
      amount: "0.0000",
      timestamp: timestamp3,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "closed",
      hashed_result: await generateTestSignature(dataForSig3, config.apiEncryptionKey)
    };

    try {
      const { response: zeroWinResponse, duration: zeroWinDuration } = await makeRequest(config.balanceAdjUrl, zeroWinData);
      const zeroWinBalance = parseFloat(zeroWinResponse.balance || 0);
      // Balance should remain the same after 0 win
      
      updateTestResult({
        name: testName3,
        status: Math.abs(zeroWinBalance - runningBalance) < 0.01 ? 'passed' : 'failed',
        duration: zeroWinDuration,
        actualBalance: zeroWinBalance,
        expectedBalance: runningBalance,
        response: zeroWinResponse,
        sentData: zeroWinData,
        error: Math.abs(zeroWinBalance - runningBalance) >= 0.01 ? `Expected ${runningBalance}, got ${zeroWinBalance} - zero win should not change balance` : undefined
      });
      
      runningBalance = zeroWinBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName3,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: zeroWinData
      });
      return;
    }

    // 6.3.2 Grant Win from Freespins
    const testName4 = "Test 6.3.2: Grant Win from Freespins";
    updateTestResult({ name: testName4, status: 'running' });

    const uniqid4 = generateUniqId();
    const timestamp4 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig4 = {
      command: "balance_adj",
      timestamp: timestamp4,
      login,
      internal_session_id: "",
      uniqid: uniqid4,
      amount: "0.50",
      type: "win",
      userid: config.userId,
      custom_data: ""
    };

    const freespinWinData = {
      command: "balance_adj",
      uniqid: uniqid4,
      type: "win",
      amount: "0.50",
      timestamp: timestamp4,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "closed",
      hashed_result: await generateTestSignature(dataForSig4, config.apiEncryptionKey)
    };

    try {
      const { response: freespinResponse, duration: freespinDuration } = await makeRequest(config.balanceAdjUrl, freespinWinData);
      const freespinBalance = parseFloat(freespinResponse.balance || 0);
      const expectedFreespinBalance = runningBalance + 0.5;
      
      updateTestResult({
        name: testName4,
        status: Math.abs(freespinBalance - expectedFreespinBalance) < 0.01 ? 'passed' : 'failed',
        duration: freespinDuration,
        actualBalance: freespinBalance,
        expectedBalance: expectedFreespinBalance,
        response: freespinResponse,
        sentData: freespinWinData,
        error: Math.abs(freespinBalance - expectedFreespinBalance) >= 0.01 ? `Expected ${expectedFreespinBalance}, got ${freespinBalance}` : undefined
      });
      
      setCurrentBalance(freespinBalance);
    } catch (error: any) {
      updateTestResult({
        name: testName4,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: freespinWinData
      });
    }
  };

  // Test 7: Invalid Signature
  const runTest7 = async () => {
    // 7.1 Get Balance with invalid signature
    const testName1 = "Test 7.1: Get Balance with Invalid Signature";
    updateTestResult({ name: testName1, status: 'running' });

    const getBalanceData = {
      command: "getbalance",
      uniqid: generateUniqId().replace('unitest_', ''),
      type: "getbalance",
      amount: "0.00",
      timestamp: getCurrentTimestamp(),
      login: `stg_u${config.operatorId}_${config.username}`,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      hashed_result: "dummy_invalid_hash_12345" // Invalid signature for testing
    };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "0" && balanceResponse.errormsg ? 'passed' : 'failed',
        duration: balanceDuration,
        response: balanceResponse,
        sentData: getBalanceData,
        error: balanceResponse.status !== "0" ? 'Expected status "0" with error message for invalid signature' : undefined
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
    }

    // 7.2 Balance adjust with invalid signature
    const testName2 = "Test 7.2: Bet with Invalid Signature";
    updateTestResult({ name: testName2, status: 'running' });

    const betData = {
      command: "balance_adj",
      uniqid: generateUniqId(),
      type: "bet",
      amount: "-0.50",
      timestamp: getCurrentTimestamp(),
      login: `stg_u${config.operatorId}_${config.username}`,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: generateGpid(),
      gpid_status: "open",
      hashed_result: "dummy_invalid_hash_67890" // Invalid signature for testing
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      
      updateTestResult({
        name: testName2,
        status: betResponse.status === "0" && betResponse.errormsg ? 'passed' : 'failed',
        duration: betDuration,
        response: betResponse,
        sentData: betData,
        error: betResponse.status !== "0" ? 'Expected status "0" with error message for invalid signature' : undefined
      });
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
    }
  };

  // Test 8: Invalid Login
  const runTest8 = async () => {
    // 8.1 Get Balance with invalid login
    const testName1 = "Test 8.1: Get Balance with Invalid Login";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const invalidLogin = "xxxyyy_login";
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login: invalidLogin,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const getBalanceData = {
      command: "getbalance",
      uniqid: uniqid1,
      type: "getbalance",
      amount: "0.00",
      timestamp: timestamp1,
      login: invalidLogin,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
    };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "0" && balanceResponse.errormsg === "Invalid user" ? 'passed' : 'failed',
        duration: balanceDuration,
        response: balanceResponse,
        sentData: getBalanceData,
        error: balanceResponse.status !== "0" ? 'Expected status "0" with "Invalid user" error' : undefined
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
    }

    // 8.2 Balance adjust with invalid login
    const testName2 = "Test 8.2: Bet with Invalid Login";
    updateTestResult({ name: testName2, status: 'running' });

    const uniqid2 = generateUniqId();
    const timestamp2 = getCurrentTimestamp();
    const gpid2 = generateGpid();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login: invalidLogin,
      internal_session_id: "",
      uniqid: uniqid2,
      amount: "-0.50",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const betData = {
      command: "balance_adj",
      uniqid: uniqid2,
      type: "bet",
      amount: "-0.50",
      timestamp: timestamp2,
      login: invalidLogin,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid2,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      
      updateTestResult({
        name: testName2,
        status: betResponse.status === "0" && betResponse.errormsg === "Invalid user" ? 'passed' : 'failed',
        duration: betDuration,
        response: betResponse,
        sentData: betData,
        error: betResponse.status !== "0" ? 'Expected status "0" with "Invalid user" error' : undefined
      });
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
    }
  };

  // Test 9: Bet Too High (Insufficient Funds)
  const runTest9 = async () => {
    let runningBalance = currentBalance;

    // 9.1 Get Balance
    const testName1 = "Test 9.1: Get Balance";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const getBalanceData = {
        command: "getbalance",
        uniqid: uniqid1,
        type: "getbalance",
        amount: "0.00",
        timestamp: timestamp1,
        login,
        userid: config.userId,
        currency: config.currency,
        internal_session_id: "",
        custom_data: "",
        hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
      };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      runningBalance = parseFloat(balanceResponse.balance || 0);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "1" ? 'passed' : 'failed',
        duration: balanceDuration,
        actualBalance: runningBalance,
        response: balanceResponse,
        sentData: getBalanceData
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
      return;
    }

    // 9.2.1 Place Bet Too High
    const testName2 = "Test 9.2.1: Place Bet Too High";
    updateTestResult({ name: testName2, status: 'running' });

    const excessiveAmount = (runningBalance + 1000).toFixed(4);
    const uniqid2 = generateUniqId();
    const timestamp2 = getCurrentTimestamp();
    const gpid2 = generateGpid();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login,
      internal_session_id: "",
      uniqid: uniqid2,
      amount: `-${excessiveAmount}`,
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const betData = {
      command: "balance_adj",
      uniqid: uniqid2,
      type: "bet",
      amount: `-${excessiveAmount}`,
      timestamp: timestamp2,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid2,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      
      updateTestResult({
        name: testName2,
        status: betResponse.status === "0" && (betResponse.errormsg === "Insufficient funds" || betResponse.errormsg === "Invalid signature") ? 'passed' : 'failed',
        duration: betDuration,
        actualBalance: parseFloat(betResponse.balance || 0),
        expectedBalance: runningBalance,
        response: betResponse,
        sentData: betData,
        error: betResponse.status !== "0" ? 'Expected status "0" with error message for insufficient funds' : undefined
      });
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
    }
  };

  // Test 10: Corrupted JSON (same as Test 9 but with different intention)
  const runTest10 = async () => {
    let runningBalance = currentBalance;

    // 10.1 Get Balance
    const testName1 = "Test 10.1: Get Balance";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const getBalanceData = {
        command: "getbalance",
        uniqid: uniqid1,
        type: "getbalance",
        amount: "0.00",
        timestamp: timestamp1,
        login,
        userid: config.userId,
        currency: config.currency,
        internal_session_id: "",
        custom_data: "",
        hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
      };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      runningBalance = parseFloat(balanceResponse.balance || 0);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "1" ? 'passed' : 'failed',
        duration: balanceDuration,
        actualBalance: runningBalance,
        response: balanceResponse,
        sentData: getBalanceData
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
      return;
    }

    // 10.2.1 Place Bet with Corrupted Data
    const testName2 = "Test 10.2.1: Place Bet with Corrupted Data";
    updateTestResult({ name: testName2, status: 'running' });

    const excessiveAmount = (runningBalance + 1000).toFixed(4);
    const uniqid2 = generateUniqId();
    const timestamp2 = getCurrentTimestamp();
    const gpid2 = generateGpid();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login,
      internal_session_id: "",
      uniqid: uniqid2,
      amount: `-${excessiveAmount}`,
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const betData = {
      command: "balance_adj",
      uniqid: uniqid2,
      type: "bet",
      amount: `-${excessiveAmount}`,
      timestamp: timestamp2,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid2,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      
      updateTestResult({
        name: testName2,
        status: betResponse.status === "0" && betResponse.errormsg ? 'passed' : 'failed',
        duration: betDuration,
        actualBalance: parseFloat(betResponse.balance || 0),
        expectedBalance: runningBalance,
        response: betResponse,
        sentData: betData,
        error: betResponse.status !== "0" ? 'Expected status "0" with error message' : undefined
      });
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
    }
  };

  // Test 11: Bet then Cancel Bet
  const runTest11 = async () => {
    const gpid = generateGpid();
    let runningBalance = currentBalance;

    // 11.1 Get Balance
    const testName1 = "Test 11.1: Get Balance";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const getBalanceData = {
        command: "getbalance",
        uniqid: uniqid1,
        type: "getbalance",
        amount: "0.00",
        timestamp: timestamp1,
        login,
        userid: config.userId,
        currency: config.currency,
        internal_session_id: "",
        custom_data: "",
        hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
      };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      runningBalance = parseFloat(balanceResponse.balance || 0);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "1" ? 'passed' : 'failed',
        duration: balanceDuration,
        actualBalance: runningBalance,
        response: balanceResponse,
        sentData: getBalanceData
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
      return;
    }

    // 11.2.1 Place Bet
    const testName2 = "Test 11.2.1: Place Bet";
    updateTestResult({ name: testName2, status: 'running' });

    const uniqid2 = generateUniqId();
    const timestamp2 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login,
      internal_session_id: "",
      uniqid: uniqid2,
      amount: "-1.00",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const betData = {
      command: "balance_adj",
      uniqid: uniqid2,
      type: "bet",
      amount: "-1.00",
      timestamp: timestamp2,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      const betBalance = parseFloat(betResponse.balance || 0);
      const expectedBetBalance = runningBalance - 1;
      
      updateTestResult({
        name: testName2,
        status: Math.abs(betBalance - expectedBetBalance) < 0.01 ? 'passed' : 'failed',
        duration: betDuration,
        actualBalance: betBalance,
        expectedBalance: expectedBetBalance,
        response: betResponse,
        sentData: betData,
        error: Math.abs(betBalance - expectedBetBalance) >= 0.01 ? `Expected ${expectedBetBalance}, got ${betBalance}` : undefined
      });
      
      runningBalance = betBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
      return;
    }

    // 11.3 Cancel Bet
    const testName3 = "Test 11.3: Cancel Bet";
    updateTestResult({ name: testName3, status: 'running' });

    const uniqid3 = generateUniqId();
    const timestamp3 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig3 = {
      command: "balance_adj",
      timestamp: timestamp3,
      login,
      internal_session_id: "",
      uniqid: uniqid3,
      amount: "1.00",
      type: "cancelbet",
      userid: config.userId,
      custom_data: ""
    };

    const cancelBetData = {
      command: "balance_adj",
      uniqid: uniqid3,
      type: "cancelbet",
      amount: "1.00",
      timestamp: timestamp3,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig3, config.apiEncryptionKey)
    };

    try {
      const { response: cancelResponse, duration: cancelDuration } = await makeRequest(config.balanceAdjUrl, cancelBetData);
      const cancelBalance = parseFloat(cancelResponse.balance || 0);
      const expectedCancelBalance = runningBalance + 1;
      
      updateTestResult({
        name: testName3,
        status: Math.abs(cancelBalance - expectedCancelBalance) < 0.01 ? 'passed' : 'failed',
        duration: cancelDuration,
        actualBalance: cancelBalance,
        expectedBalance: expectedCancelBalance,
        response: cancelResponse,
        sentData: cancelBetData,
        error: Math.abs(cancelBalance - expectedCancelBalance) >= 0.01 ? `Expected ${expectedCancelBalance}, got ${cancelBalance} - cancel transaction should not be processed twice` : undefined
      });
      
      setCurrentBalance(cancelBalance);
    } catch (error: any) {
      updateTestResult({
        name: testName3,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: cancelBetData
      });
    }
  };

  // Test 12: Complex Cancellation
  const runTest12 = async () => {
    const gpid = generateGpid();
    let runningBalance = currentBalance;

    // 12.1 Get Balance
    const testName1 = "Test 12.1: Get Balance";
    updateTestResult({ name: testName1, status: 'running' });

    const uniqid1 = generateUniqId().replace('unitest_', '');
    const timestamp1 = getCurrentTimestamp();
    const login = `stg_u${config.operatorId}_${config.username}`;
    
    // Create data for signature generation
    const dataForSig1 = {
      command: "getbalance",
      timestamp: timestamp1,
      login,
      internal_session_id: "",
      uniqid: uniqid1,
      amount: "0.00",
      type: "getbalance",
      userid: config.userId,
      custom_data: ""
    };

    const getBalanceData = {
        command: "getbalance",
        uniqid: uniqid1,
        type: "getbalance",
        amount: "0.00",
        timestamp: timestamp1,
        login,
        userid: config.userId,
        currency: config.currency,
        internal_session_id: "",
        custom_data: "",
        hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
      };

    try {
      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);
      runningBalance = parseFloat(balanceResponse.balance || 0);
      
      updateTestResult({
        name: testName1,
        status: balanceResponse.status === "1" ? 'passed' : 'failed',
        duration: balanceDuration,
        actualBalance: runningBalance,
        response: balanceResponse,
        sentData: getBalanceData
      });
    } catch (error: any) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: getBalanceData
      });
      return;
    }

    // 12.2.1 Place Bet
    const testName2 = "Test 12.2.1: Place Bet";
    updateTestResult({ name: testName2, status: 'running' });

    const betUniqId = generateUniqId();
    const timestamp2 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig2 = {
      command: "balance_adj",
      timestamp: timestamp2,
      login,
      internal_session_id: "",
      uniqid: betUniqId,
      amount: "-1.00",
      type: "bet",
      userid: config.userId,
      custom_data: ""
    };

    const betData = {
      command: "balance_adj",
      uniqid: betUniqId,
      type: "bet",
      amount: "-1.00",
      timestamp: timestamp2,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
    };

    try {
      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);
      const betBalance = parseFloat(betResponse.balance || 0);
      const expectedBetBalance = runningBalance - 1;
      
      updateTestResult({
        name: testName2,
        status: Math.abs(betBalance - expectedBetBalance) < 0.01 ? 'passed' : 'failed',
        duration: betDuration,
        actualBalance: betBalance,
        expectedBalance: expectedBetBalance,
        response: betResponse,
        sentData: betData,
        error: Math.abs(betBalance - expectedBetBalance) >= 0.01 ? `Expected ${expectedBetBalance}, got ${betBalance}` : undefined
      });
      
      runningBalance = betBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName2,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: betData
      });
      return;
    }

    // 12.2.2 Grant Win
    const testName3 = "Test 12.2.2: Grant Win";
    updateTestResult({ name: testName3, status: 'running' });

    const winUniqId = generateUniqId();
    const timestamp3 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig3 = {
      command: "balance_adj",
      timestamp: timestamp3,
      login,
      internal_session_id: "",
      uniqid: winUniqId,
      amount: "5.00",
      type: "win",
      userid: config.userId,
      custom_data: ""
    };

    const winData = {
      command: "balance_adj",
      uniqid: winUniqId,
      type: "win",
      amount: "5.00",
      timestamp: timestamp3,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "closed",
      hashed_result: await generateTestSignature(dataForSig3, config.apiEncryptionKey)
    };

    try {
      const { response: winResponse, duration: winDuration } = await makeRequest(config.balanceAdjUrl, winData);
      const winBalance = parseFloat(winResponse.balance || 0);
      const expectedWinBalance = runningBalance + 5;
      
      updateTestResult({
        name: testName3,
        status: Math.abs(winBalance - expectedWinBalance) < 0.01 ? 'passed' : 'failed',
        duration: winDuration,
        actualBalance: winBalance,
        expectedBalance: expectedWinBalance,
        response: winResponse,
        sentData: winData,
        error: Math.abs(winBalance - expectedWinBalance) >= 0.01 ? `Expected ${expectedWinBalance}, got ${winBalance}` : undefined
      });
      
      runningBalance = winBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName3,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: winData
      });
      return;
    }

    // 12.3.1 Cancel Bet
    const testName4 = "Test 12.3.1: Cancel Bet";
    updateTestResult({ name: testName4, status: 'running' });

    const cancelBetUniqId = `cancel_${betUniqId}`;
    const timestamp4 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig4 = {
      command: "balance_adj",
      timestamp: timestamp4,
      login,
      internal_session_id: "",
      uniqid: cancelBetUniqId,
      amount: "1.00",
      type: "cancelbet",
      userid: config.userId,
      custom_data: ""
    };

    const cancelBetData = {
      command: "balance_adj",
      uniqid: cancelBetUniqId,
      type: "cancelbet",
      amount: "1.00",
      timestamp: timestamp4,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "open",
      hashed_result: await generateTestSignature(dataForSig4, config.apiEncryptionKey)
    };

    try {
      const { response: cancelBetResponse, duration: cancelBetDuration } = await makeRequest(config.balanceAdjUrl, cancelBetData);
      const cancelBetBalance = parseFloat(cancelBetResponse.balance || 0);
      const expectedCancelBetBalance = runningBalance + 1;
      
      updateTestResult({
        name: testName4,
        status: Math.abs(cancelBetBalance - expectedCancelBetBalance) < 0.01 ? 'passed' : 'failed',
        duration: cancelBetDuration,
        actualBalance: cancelBetBalance,
        expectedBalance: expectedCancelBetBalance,
        response: cancelBetResponse,
        sentData: cancelBetData,
        error: Math.abs(cancelBetBalance - expectedCancelBetBalance) >= 0.01 ? `Expected ${expectedCancelBetBalance}, got ${cancelBetBalance} - cancel transaction should not be processed twice` : undefined
      });
      
      runningBalance = cancelBetBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName4,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: cancelBetData
      });
      return;
    }

    // 12.3.2 Cancel Win
    const testName5 = "Test 12.3.2: Cancel Win";
    updateTestResult({ name: testName5, status: 'running' });

    const cancelWinUniqId = `cancel_${winUniqId}`;
    const timestamp5 = getCurrentTimestamp();
    
    // Create data for signature generation
    const dataForSig5 = {
      command: "balance_adj",
      timestamp: timestamp5,
      login,
      internal_session_id: "",
      uniqid: cancelWinUniqId,
      amount: "-5.00",
      type: "cancelwin",
      userid: config.userId,
      custom_data: ""
    };

    const cancelWinData = {
      command: "balance_adj",
      uniqid: cancelWinUniqId,
      type: "cancelwin",
      amount: "-5.00",
      timestamp: timestamp5,
      login,
      userid: config.userId,
      currency: config.currency,
      internal_session_id: "",
      custom_data: "",
      gameid: "5500",
      gpid: gpid,
      gpid_status: "closed",
      hashed_result: await generateTestSignature(dataForSig5, config.apiEncryptionKey)
    };

    try {
      const { response: cancelWinResponse, duration: cancelWinDuration } = await makeRequest(config.balanceAdjUrl, cancelWinData);
      const cancelWinBalance = parseFloat(cancelWinResponse.balance || 0);
      const expectedCancelWinBalance = runningBalance - 5;
      
      updateTestResult({
        name: testName5,
        status: Math.abs(cancelWinBalance - expectedCancelWinBalance) < 0.01 ? 'passed' : 'failed',
        duration: cancelWinDuration,
        actualBalance: cancelWinBalance,
        expectedBalance: expectedCancelWinBalance,
        response: cancelWinResponse,
        sentData: cancelWinData,
        error: Math.abs(cancelWinBalance - expectedCancelWinBalance) >= 0.01 ? `Expected ${expectedCancelWinBalance}, got ${cancelWinBalance} - cancel transaction should not be processed twice` : undefined
      });
      
      runningBalance = cancelWinBalance;
    } catch (error: any) {
      updateTestResult({
        name: testName5,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: cancelWinData
      });
      return;
    }

    // 12.3.3 Idempotency check - Repeat Cancel Bet
    const testName6 = "Test 12.3.3: Repeat Cancel Bet (Idempotency)";
    updateTestResult({ name: testName6, status: 'running' });

    const timestamp6 = getCurrentTimestamp();
    
    // Create data for signature generation (same uniqid, new timestamp)
    const dataForSig6 = {
      command: "balance_adj",
      timestamp: timestamp6,
      login,
      internal_session_id: "",
      uniqid: cancelBetUniqId, // Same uniqid for idempotency test
      amount: "1.00",
      type: "cancelbet",
      userid: config.userId,
      custom_data: ""
    };

    const repeatCancelBetData = {
      ...cancelBetData,
      timestamp: timestamp6,
      hashed_result: await generateTestSignature(dataForSig6, config.apiEncryptionKey)
    };

    try {
      const { response: repeatCancelBetResponse, duration: repeatCancelBetDuration } = await makeRequest(config.balanceAdjUrl, repeatCancelBetData);
      const repeatCancelBetBalance = parseFloat(repeatCancelBetResponse.balance || 0);
      
      updateTestResult({
        name: testName6,
        status: Math.abs(repeatCancelBetBalance - runningBalance) < 0.01 ? 'passed' : 'failed',
        duration: repeatCancelBetDuration,
        actualBalance: repeatCancelBetBalance,
        expectedBalance: runningBalance,
        response: repeatCancelBetResponse,
        sentData: repeatCancelBetData,
        error: Math.abs(repeatCancelBetBalance - runningBalance) >= 0.01 ? `Expected ${runningBalance}, got ${repeatCancelBetBalance} - cancel transaction should not be processed twice` : undefined
      });
    } catch (error: any) {
      updateTestResult({
        name: testName6,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: repeatCancelBetData
      });
    }

    // 12.3.4 Idempotency check - Repeat Cancel Win
    const testName7 = "Test 12.3.4: Repeat Cancel Win (Idempotency)";
    updateTestResult({ name: testName7, status: 'running' });

    const timestamp7 = getCurrentTimestamp();
    
    // Create data for signature generation (same uniqid, new timestamp)
    const dataForSig7 = {
      command: "balance_adj",
      timestamp: timestamp7,
      login,
      internal_session_id: "",
      uniqid: cancelWinUniqId, // Same uniqid for idempotency test
      amount: "-5.00",
      type: "cancelwin",
      userid: config.userId,
      custom_data: ""
    };

    const repeatCancelWinData = {
      ...cancelWinData,
      timestamp: timestamp7,
      hashed_result: await generateTestSignature(dataForSig7, config.apiEncryptionKey)
    };

    try {
      const { response: repeatCancelWinResponse, duration: repeatCancelWinDuration } = await makeRequest(config.balanceAdjUrl, repeatCancelWinData);
      const repeatCancelWinBalance = parseFloat(repeatCancelWinResponse.balance || 0);
      
      updateTestResult({
        name: testName7,
        status: Math.abs(repeatCancelWinBalance - runningBalance) < 0.01 ? 'passed' : 'failed',
        duration: repeatCancelWinDuration,
        actualBalance: repeatCancelWinBalance,
        expectedBalance: runningBalance,
        response: repeatCancelWinResponse,
        sentData: repeatCancelWinData,
        error: Math.abs(repeatCancelWinBalance - runningBalance) >= 0.01 ? `Expected ${runningBalance}, got ${repeatCancelWinBalance} - cancel transaction should not be processed twice` : undefined
      });
      
      setCurrentBalance(repeatCancelWinBalance);
    } catch (error: any) {
      updateTestResult({
        name: testName7,
        status: 'failed',
        duration: error.duration || 0,
        error: `Request failed: ${error.message || error}`,
        sentData: repeatCancelWinData
      });
    }
  };

  const runTest13 = async () => {
    const testName1 = "Test 13.1: Get Balance";
    const testName2 = "Test 13.2: Place $100 Bet";
    const testName3 = "Test 13.3: Grant $0 Win (Lose)";
    const login = `stg_u${config.operatorId}_${config.username}`;

    updateTestResult({ name: testName1, status: 'running' });

    try {
      // Step 1: Get current balance
      const dataForSig1 = {
        command: "getbalance",
        userid: config.userId,
        login: login,
        timestamp: getCurrentTimestamp()
      };

      const getBalanceData = {
        ...dataForSig1,
        hashed_result: await generateTestSignature(dataForSig1, config.apiEncryptionKey)
      };

      const { response: balanceResponse, duration: balanceDuration } = await makeRequest(config.getbalanceUrl, getBalanceData);

      if (balanceResponse.status !== "1") {
        updateTestResult({
          name: testName1,
          status: 'failed',
          duration: balanceDuration,
          error: `Failed to get balance: ${balanceResponse.errormsg || 'Unknown error'}`,
          response: balanceResponse
        });
        return;
      }

      const initialBalance = parseFloat(balanceResponse.balance);
      updateTestResult({
        name: testName1,
        status: 'passed',
        duration: balanceDuration,
        expectedBalance: initialBalance,
        actualBalance: initialBalance,
        response: balanceResponse
      });

      // Step 2: Place $100 bet that loses
      updateTestResult({ name: testName2, status: 'running' });

      const betUniqId = generateUniqId();
      const gpid = generateGpid();

      const dataForSig2 = {
        command: "balance_adj",
        userid: config.userId,
        login: login,
        gpid: gpid,
        type: "bet",
        amount: "-100.00",
        uniqid: betUniqId,
        timestamp: getCurrentTimestamp()
      };

      const betData = {
        ...dataForSig2,
        hashed_result: await generateTestSignature(dataForSig2, config.apiEncryptionKey)
      };

      const { response: betResponse, duration: betDuration } = await makeRequest(config.balanceAdjUrl, betData);

      if (betResponse.status !== "1") {
        updateTestResult({
          name: testName2,
          status: 'failed',
          duration: betDuration,
          error: `Failed to place $100 bet: ${betResponse.errormsg || 'Unknown error'}`,
          response: betResponse,
          sentData: betData
        });
        return;
      }

      const expectedBetBalance = initialBalance - 100.00;
      const betBalance = parseFloat(betResponse.balance);

      updateTestResult({
        name: testName2,
        status: Math.abs(betBalance - expectedBetBalance) < 0.01 ? 'passed' : 'failed',
        duration: betDuration,
        expectedBalance: expectedBetBalance,
        actualBalance: betBalance,
        error: Math.abs(betBalance - expectedBetBalance) >= 0.01 ? `Expected ${expectedBetBalance}, got ${betBalance}` : undefined,
        response: betResponse,
        sentData: betData
      });

      // Step 3: Grant $0 win (lose)
      updateTestResult({ name: testName3, status: 'running' });

      const winUniqId = generateUniqId();
      const dataForSig3 = {
        command: "balance_adj",
        userid: config.userId,
        login: login,
        gpid: gpid,
        type: "win",
        amount: "0.00",
        uniqid: winUniqId,
        timestamp: getCurrentTimestamp()
      };

      const winData = {
        ...dataForSig3,
        hashed_result: await generateTestSignature(dataForSig3, config.apiEncryptionKey)
      };

      const { response: winResponse, duration: winDuration } = await makeRequest(config.balanceAdjUrl, winData);

      if (winResponse.status !== "1") {
        updateTestResult({
          name: testName3,
          status: 'failed',
          duration: winDuration,
          error: `Failed to grant $0 win: ${winResponse.errormsg || 'Unknown error'}`,
          response: winResponse,
          sentData: winData
        });
        return;
      }

      const expectedWinBalance = betBalance + 0.00; // No change since win is $0
      const winBalance = parseFloat(winResponse.balance);

      updateTestResult({
        name: testName3,
        status: Math.abs(winBalance - expectedWinBalance) < 0.01 ? 'passed' : 'failed',
        duration: winDuration,
        expectedBalance: expectedWinBalance,
        actualBalance: winBalance,
        error: Math.abs(winBalance - expectedWinBalance) >= 0.01 ? `Expected ${expectedWinBalance}, got ${winBalance}` : undefined,
        response: winResponse,
        sentData: winData
      });

    } catch (error) {
      updateTestResult({
        name: testName1,
        status: 'failed',
        error: `Error in test: ${(error as Error).message || error}`
      });
    }
  };

  const runAllTests = async (autoLockRate: boolean = true) => {
    setTestSuite(prev => ({ ...prev, isRunning: true, results: [] }));
    
    let rateLocked = false;
    
    try {
      // Lock rate before running tests if requested and not already locked
      if (autoLockRate && !testMode.isActive) {
        console.log('🔒 Locking SOL/USD rate for test consistency...');
        rateLocked = await lockRateForTesting(180); // 3 minutes for full test suite
        
        if (rateLocked) {
          // Add a test result to show rate locking status
          updateTestResult({
            name: "🔒 Test Mode: Rate Locked",
            status: 'passed',
            duration: 0,
            actualBalance: testMode.lockedRate || undefined,
            response: { 
              status: "1", 
              message: `SOL/USD rate locked at $${testMode.lockedRate?.toFixed(8)} for consistent testing` 
            },
            sentData: { command: "test_mode_lock", rate: testMode.lockedRate }
          });
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          updateTestResult({
            name: "⚠️  Test Mode: Rate Lock Failed",
            status: 'failed',
            duration: 0,
            error: 'Failed to lock rate - tests may have small discrepancies due to rate changes',
            response: { status: "0", message: "Rate lock failed" },
            sentData: { command: "test_mode_lock", attempted: true }
          });
        }
      }
      
      await runTest1();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest2();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest3();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest4();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest5();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest6();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest7();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest8();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest9();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest10();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest11();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await runTest12();
      
      await runTest13();
      
      // Optionally unlock rate after tests complete
      if (rateLocked && testMode.isActive) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('🔓 Unlocking SOL/USD rate after test completion...');
        const unlocked = await unlockRate();
        
        updateTestResult({
          name: unlocked ? "🔓 Test Mode: Rate Unlocked" : "⚠️  Test Mode: Unlock Failed",
          status: unlocked ? 'passed' : 'failed',
          duration: 0,
          response: { 
            status: unlocked ? "1" : "0", 
            message: unlocked ? "Rate unlocked successfully" : "Failed to unlock rate"
          },
          sentData: { command: "test_mode_unlock", success: unlocked }
        });
      }
      
    } catch (error) {
      console.error('Test suite execution error:', error);
    } finally {
      setTestSuite(prev => ({ ...prev, isRunning: false }));
    }
  };

  const resetTests = () => {
    setTestSuite({
      totalTests: 13,
      passedTests: 0,
      failedTests: 0,
      results: [],
      isRunning: false
    });
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    const variants = {
      passed: 'default',
      failed: 'destructive',
      running: 'default',
      pending: 'secondary'
    } as const;
    
    return (
      <Badge variant={variants[status]} className="ml-2">
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <AdminLayout title="RGS Unit Testing">
      <div className="container mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-gray-400">
              Comprehensive test suite for CasinoWebScripts API integration
            </p>
          </div>
        <div className="flex gap-2">
          <Button onClick={() => runAllTests(true)} disabled={testSuite.isRunning} className="gap-2">
            <Play className="h-4 w-4" />
            Run All Tests (Auto-Lock)
          </Button>
          <Button 
            onClick={() => runAllTests(false)} 
            disabled={testSuite.isRunning} 
            variant="outline" 
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Run Without Lock
          </Button>
          <Button onClick={resetTests} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          
          {/* Test Mode Controls */}
          <div className="flex gap-1 border-l border-gray-600 pl-2 ml-2">
            {testMode.isActive ? (
              <Button 
                onClick={unlockRate} 
                disabled={testMode.isLoading || testSuite.isRunning}
                variant="outline"
                size="sm"
                className="gap-1 bg-orange-900/20 border-orange-600 text-orange-400 hover:bg-orange-900/40"
              >
                <Unlock className="h-3 w-3" />
                Unlock Rate
              </Button>
            ) : (
              <Button 
                onClick={() => lockRateForTesting(120)} 
                disabled={testMode.isLoading || testSuite.isRunning}
                variant="outline"
                size="sm"
                className="gap-1 bg-blue-900/20 border-blue-600 text-blue-400 hover:bg-blue-900/40"
              >
                <Lock className="h-3 w-3" />
                Lock Rate
              </Button>
            )}
            
            <Button 
              onClick={checkTestModeStatus}
              disabled={testMode.isLoading}
              variant="ghost"
              size="sm"
              className="gap-1 text-gray-400 hover:text-white"
            >
              <Shield className="h-3 w-3" />
              Status
          </Button>
          </div>
        </div>
      </div>

      {/* Test Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{testSuite.results.length}</div>
            <div className="text-sm text-gray-400">Tests Run</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-400">{testSuite.passedTests}</div>
            <div className="text-sm text-gray-400">Passed</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-400">{testSuite.failedTests}</div>
            <div className="text-sm text-gray-400">Failed</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">${currentBalance.toFixed(2)}</div>
            <div className="text-sm text-gray-400">Current Balance</div>
          </CardContent>
        </Card>
        <Card className={`border-gray-700 ${testMode.isActive ? 'bg-blue-900/20 border-blue-600' : 'bg-gray-800'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              {testMode.isActive ? (
                <Lock className="h-4 w-4 text-blue-400" />
              ) : (
                <Unlock className="h-4 w-4 text-gray-400" />
              )}
              <div className={`text-sm font-medium ${testMode.isActive ? 'text-blue-400' : 'text-gray-400'}`}>
                Test Mode
              </div>
            </div>
            {testMode.isActive ? (
              <div className="space-y-1">
                <div className="text-lg font-bold text-blue-400">
                  ${testMode.lockedRate?.toFixed(4)}
                </div>
                <div className="text-xs text-blue-300">
                  {testMode.secondsRemaining > 0 ? `${testMode.secondsRemaining}s remaining` : 'Active'}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-lg font-bold text-gray-400">Inactive</div>
                <div className="text-xs text-gray-500">Rate not locked</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Configuration */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Info className="h-5 w-5" />
            Test Configuration
          </CardTitle>
          <CardDescription className="text-gray-400">
            RGS API endpoints and test parameters. Test Mode locks SOL/USD rate for consistent testing and eliminates small discrepancies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-white font-medium mb-1">Operator ID</label>
              <input
                type="text"
                value={config.operatorId}
                onChange={(e) => setConfig(prev => ({ ...prev, operatorId: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-white font-medium mb-1">
                Username
                <span className="text-gray-400 text-xs ml-2">(First 20 chars, auto-filled from connected wallet)</span>
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig(prev => ({ 
                  ...prev, 
                  username: e.target.value.substring(0, 20) 
                }))}
                placeholder={connected ? "Auto-filled from wallet" : "Enter wallet address"}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-white font-medium mb-1">User ID</label>
              <input
                type="text"
                value={config.userId}
                onChange={(e) => setConfig(prev => ({ ...prev, userId: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-white font-medium mb-1">Currency</label>
              <input
                type="text"
                value={config.currency}
                onChange={(e) => setConfig(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-white font-medium mb-1">Get Balance URL</label>
              <input
                type="text"
                value={config.getbalanceUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, getbalanceUrl: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-white font-medium mb-1">Balance Adj URL</label>
              <input
                type="text"
                value={config.balanceAdjUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, balanceAdjUrl: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-white font-medium mb-1">
                Test Mode Base URL
                <span className="text-gray-400 text-xs ml-2">(For rate locking endpoints)</span>
              </label>
              <input
                type="text"
                value={config.testModeBaseUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, testModeBaseUrl: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-white font-medium mb-1">
                API Encryption Key 
                <span className="text-gray-400 text-xs ml-2">(Optional - for proper HMAC validation)</span>
              </label>
              <input
                type="password"
                value={config.apiEncryptionKey}
                onChange={(e) => setConfig(prev => ({ ...prev, apiEncryptionKey: e.target.value }))}
                placeholder="Enter your test API encryption key..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Without this key, tests will use mock signatures and may fail HMAC validation
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg border border-gray-700">
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          Test Results
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'individual'
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('individual')}
        >
          Individual Tests
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && testSuite.results.length > 0 && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Test Results</CardTitle>
            <CardDescription className="text-gray-400">Detailed results from test execution</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Test Summary */}
            <div className="mb-6 p-4 bg-gray-700 rounded-lg border border-gray-600">
              <h3 className="font-bold text-lg mb-2 text-white">RGS UNIT TESTING RESULTS</h3>
              <div className="text-sm space-y-1 text-gray-300">
                <div><strong className="text-white">Total Tests:</strong> {testSuite.results.length}</div>
                <div className="flex items-center gap-4">
                  <span className="text-red-400">❌ Failed Tests: {testSuite.failedTests}</span>
                  <span className="text-green-400">✅ Passed Tests: {testSuite.passedTests}</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              {testSuite.results.map((result, index) => (
                <div key={index} className="border border-gray-600 rounded-lg p-4 bg-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result.status)}
                      <span className="font-medium text-white">{result.name}</span>
                      {getStatusBadge(result.status)}
                    </div>
                    {result.duration && (
                      <span className="text-sm text-gray-400">
                        Duration: {result.duration}ms
                      </span>
                    )}
                  </div>
                  
                  {/* Transaction Summary */}
                  {result.sentData && (
                    <div className="text-sm mb-2 space-y-1">
                      {result.sentData.amount && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300">💵 Amount:</span>
                          <span className={`font-mono ${parseFloat(result.sentData.amount) < 0 ? 'text-red-400' : 'text-green-400'}`}>
                            ${Math.abs(parseFloat(result.sentData.amount)).toFixed(2)}
                          </span>
                          {result.sentData.uniqid && (
                            <>
                              <span className="text-gray-500">|</span>
                              <span className="text-gray-300">TX ID:</span>
                              <span className="font-mono text-xs text-gray-400">{result.sentData.uniqid}</span>
                            </>
                          )}
                        </div>
                      )}
                      {result.sentData.gpid && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300">🎮 Game Play ID:</span>
                          <span className="font-mono text-xs text-gray-400">{result.sentData.gpid}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {result.error && (
                    <div className="text-sm text-red-400 mb-2">
                      Error: {result.error}
                    </div>
                  )}
                  
                  {(result.expectedBalance !== undefined || result.actualBalance !== undefined) && (
                    <div className="text-sm space-y-1 text-gray-300">
                      {result.expectedBalance !== undefined && (
                        <div>Expected Balance: ${result.expectedBalance.toFixed(2)}</div>
                      )}
                      {result.actualBalance !== undefined && (
                        <div>Actual Balance: ${result.actualBalance.toFixed(2)}</div>
                      )}
                    </div>
                  )}
                  
                                        <div className="mt-2 space-y-2">
                        {result.sentData && (
                          <details className="border border-gray-500 rounded">
                            <summary className="text-sm cursor-pointer text-blue-400 font-medium p-2 bg-gray-600 rounded">
                              ▶ SENT DATA
                            </summary>
                            <pre className="text-xs bg-gray-800 text-gray-300 p-3 rounded-b overflow-x-auto border-t border-gray-500">
                              {JSON.stringify(result.sentData, null, 2)}
                            </pre>
                          </details>
                        )}
                        
                        {result.response && (
                          <details className="border border-gray-500 rounded">
                            <summary className="text-sm cursor-pointer text-green-400 font-medium p-2 bg-gray-600 rounded">
                              ▶ RESPONSE
                            </summary>
                            <pre className="text-xs bg-gray-800 text-gray-300 p-3 rounded-b overflow-x-auto border-t border-gray-500">
                              {JSON.stringify(result.response, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'individual' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { num: 1, name: "Get Balance", desc: "Basic balance retrieval test", func: runTest1 },
            { num: 2, name: "Bet → Win", desc: "Basic bet and win flow", func: runTest2 },
            { num: 3, name: "Multiple Bets → Win", desc: "Multiple bets on same round", func: runTest3 },
            { num: 4, name: "Bet Idempotency", desc: "Duplicate bet transaction handling", func: runTest4 },
            { num: 5, name: "Win Idempotency", desc: "Duplicate win transaction handling", func: runTest5 },
            { num: 6, name: "Freespins Flow", desc: "Zero win then freespin win", func: runTest6 },
            { num: 7, name: "Invalid Signature", desc: "HMAC validation test", func: runTest7 },
            { num: 8, name: "Invalid Login", desc: "User validation test", func: runTest8 },
            { num: 9, name: "Insufficient Funds", desc: "Bet too high validation", func: runTest9 },
            { num: 10, name: "Corrupted JSON", desc: "Malformed request handling", func: runTest10 },
            { num: 11, name: "Cancel Bet", desc: "Bet cancellation flow", func: runTest11 },
            { num: 12, name: "Complex Cancellation", desc: "Bet → Win → Cancel both + Idempotency", func: runTest12 },
        { num: 13, name: "Bet $100 and Lose", desc: "Balance → Bet $100 → Win $0 (lose)", func: runTest13 }
          ].map((test) => (
            <Card key={test.num} className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-white">Test {test.num}</CardTitle>
                <CardDescription className="text-sm text-gray-400">{test.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-gray-300">{test.desc}</p>
                <Button 
                  onClick={test.func}
                  disabled={testSuite.isRunning}
                  size="sm"
                  className="w-full"
                >
                  <Play className="h-3 w-3 mr-1" />
                  Run Test
                </Button>
                {testSuite.results.some(r => r.name.includes(`Test ${test.num}`)) && (
                  <div className="text-xs space-y-1">
                    {testSuite.results
                      .filter(r => r.name.includes(`Test ${test.num}`))
                      .map((result, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          {getStatusIcon(result.status)}
                          <span className={result.status === 'passed' ? 'text-green-400' : 'text-red-400'}>
                            {result.status}
                          </span>
                        </div>
                      ))
                    }
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </AdminLayout>
  );
};

export default RGSUnitTests; 