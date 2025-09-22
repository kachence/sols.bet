import { useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import { AdminLayout } from '@/components/layout';

interface DbTransaction {
  id: string;
  transaction_id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  txid?: string;
  game_id?: string;
  game_round?: string;
}

interface OnChainTransaction {
  signature: string;
  blockTime: number;
  instructions: any[];
  meta?: any;
  instructionType?: 'BatchSettle' | 'BetAndSettle' | 'Deposit' | 'Withdraw' | 'Unknown';
  stakeAmount?: number;
  payoutAmount?: number;
  depositAmount?: number;
  withdrawAmount?: number;
  batchItems?: Array<{
    betId: string;
    gameId: number;
    stake: number;
    payout: number;
    outcome: string;
    gameData: number[];
  }>;
}

interface ReconciliationResult {
  dbTransactions: DbTransaction[];
  onChainTransactions: OnChainTransaction[];
  discrepancies: {
    missingOnChain: any[];
    missingInDb: OnChainTransaction[];
    balanceMismatches: any[];
  };
}

export default function ReconciliationPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [error, setError] = useState('');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const connection = new Connection(
    process.env.NEXT_PUBLIC_RPC_ENDPOINT as string,
    'confirmed'
  );

  const parseTransactionLogs = (logs: string[], signature?: string) => {
    let instructionType: 'BatchSettle' | 'BetAndSettle' | 'Deposit' | 'Withdraw' | 'Unknown' = 'Unknown';
    let stakeAmount: number | undefined;
    let payoutAmount: number | undefined;
    let depositAmount: number | undefined;
    let withdrawAmount: number | undefined;
    let batchItems: Array<{
      betId: string;
      gameId: number;
      stake: number;
      payout: number;
      outcome: string;
      gameData: number[];
    }> = [];

    // Debug: Log all messages to see what we're parsing
    console.log(`Parsing transaction logs for ${signature?.substring(0, 8)}...:`, logs);

    for (const log of logs) {
      // Check for BatchSettle instruction
      if (log.includes('Instruction: BatchSettle')) {
        instructionType = 'BatchSettle';
        console.log('Found BatchSettle instruction');
      } else if (log.includes('Instruction: BetAndSettle')) {
        instructionType = 'BetAndSettle';
        console.log('Found BetAndSettle instruction');
      } else if (log.includes('Instruction: Deposit')) {
        instructionType = 'Deposit';
        console.log('Found Deposit instruction');
      } else if (log.includes('Instruction: Withdraw')) {
        instructionType = 'Withdraw';
        console.log('Found Withdraw instruction');
      }

      // Parse batch items from BatchSettle logs
      if (log.includes('Batch item ')) {
        const batchMatch = log.match(/Batch item \d+: betId=([^,]+), gameId=(\d+), stake=(\d+), payout=(\d+), outcome=(\w+), gameData=\[([^\]]+)\]/);
        if (batchMatch) {
          const [, betId, gameId, stake, payout, outcome, gameDataStr] = batchMatch;
          const gameData = gameDataStr.split(',').map(n => parseInt(n.trim()));
          
          batchItems.push({
            betId,
            gameId: parseInt(gameId),
            stake: parseInt(stake),
            payout: parseInt(payout),
            outcome,
            gameData
          });
          
          console.log(`Parsed batch item - betId: ${betId}, stake: ${stake}, payout: ${payout}, outcome: ${outcome}`);
        }
      }

      // Parse stake and payout amounts from BetAndSettle logs
      if (log.includes('Atomic bet and settle:')) {
        const atomicMatch = log.match(/betId=([^,]+), gameId=(\d+), stake=(\d+), payout=(\d+), user=([^,]+), outcome=(\w+), gameData=\[([^\]]+)\]/);
        if (atomicMatch) {
          const [, betId, gameId, stake, payout, user, outcome, gameDataStr] = atomicMatch;
          stakeAmount = parseInt(stake);
          payoutAmount = parseInt(payout);
          
          // Store the betId for matching purposes
          batchItems.push({
            betId,
            gameId: parseInt(gameId),
            stake: parseInt(stake),
            payout: parseInt(payout),
            outcome,
            gameData: gameDataStr.split(',').map(n => parseInt(n.trim()))
          });
          
          console.log(`Parsed BetAndSettle - betId: ${betId}, stake: ${stake}, payout: ${payout}, outcome: ${outcome}`);
        }
      }
      
      // Legacy format parsing (kept for backward compatibility)
      if (log.includes('Round settled in one tx:')) {
        const stakeMatch = log.match(/stake (\d+)/);
        const payoutMatch = log.match(/payout (\d+)/);
        if (stakeMatch) stakeAmount = parseInt(stakeMatch[1]);
        if (payoutMatch) payoutAmount = parseInt(payoutMatch[1]);
        console.log(`Parsed legacy amounts - stake: ${stakeAmount}, payout: ${payoutAmount}`);
      }

      // For deposits and withdrawals, we might need to parse amounts differently
      // This may need adjustment based on actual log format
    }

    // For BatchSettle, aggregate totals from all batch items
    if (instructionType === 'BatchSettle' && batchItems.length > 0) {
      stakeAmount = batchItems.reduce((sum, item) => sum + item.stake, 0);
      payoutAmount = batchItems.reduce((sum, item) => sum + item.payout, 0);
    }

    console.log(`Final parsed result - type: ${instructionType}, stake: ${stakeAmount}, payout: ${payoutAmount}, batchItems: ${batchItems.length}`);

    return {
      instructionType,
      stakeAmount,
      payoutAmount,
      depositAmount,
      withdrawAmount,
      batchItems
    };
  };

  const fetchDbTransactions = async (walletAddress: string): Promise<DbTransaction[]> => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('player_id', walletAddress)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    console.log(`DEBUG: Fetched ${data?.length || 0} transactions from database for wallet ${walletAddress}`);
    if (data && data.length > 0) {
      console.log('Sample transaction structure:', data[0]);
      const txidsWithBlockchain = data.filter(tx => tx.txid && tx.txid.length > 40);
      console.log(`Transactions with blockchain txids: ${txidsWithBlockchain.length}`);
    }
    
    return data || [];
  };

  const groupDbTransactions = (transactions: DbTransaction[]) => {
    const grouped: { [key: string]: { bets?: DbTransaction[]; wins?: DbTransaction[]; deposit?: DbTransaction; withdraw?: DbTransaction; cancelbet?: DbTransaction; cancelwin?: DbTransaction; type: string } } = {};

    for (const tx of transactions) {
      // Debug logging for specific transaction
      if (tx.txid && tx.txid.startsWith('eVva4uB8')) {
        console.log(`DEBUG: Grouping transaction:`, tx);
      }
      
      if (tx.type === 'cancelbet' || tx.type === 'cancelwin') {
        // Group cancel operations by game_round, just like bet/win transactions
        const key = tx.game_round || tx.txid || tx.id; // Use game_round as primary key like bet/win
        if (!grouped[key]) {
          grouped[key] = { type: 'cancel' };
        }
        if (tx.type === 'cancelbet') {
          grouped[key].cancelbet = tx;
        } else if (tx.type === 'cancelwin') {
          grouped[key].cancelwin = tx;
        }
        
        if (tx.txid && tx.txid.startsWith('eVva4uB8')) {
          console.log(`DEBUG: Added ${tx.type} to cancel group ${key} (game_round: ${tx.game_round}):`, grouped[key]);
        }
      } else if (tx.type === 'bet' || tx.type === 'win') {
        // Group bet and win by game_round or txid
        const key = tx.game_round || tx.txid || tx.id;
        
        if (tx.txid && tx.txid.startsWith('eVva4uB8')) {
          console.log(`DEBUG: Using grouping key: ${key} for txid: ${tx.txid}`);
        }
        
        // Don't overwrite cancel groups - regular wins should not mix with cancel operations
        if (!grouped[key] || grouped[key].type !== 'cancel') {
          if (!grouped[key]) {
            grouped[key] = { type: 'game' };
          }
          
          if (tx.type === 'bet') {
            // Collect multiple bets in an array
            if (!grouped[key].bets) {
              grouped[key].bets = [];
            }
            grouped[key].bets!.push(tx);
          } else if (tx.type === 'win') {
            // Collect multiple wins in an array (bonus scenarios can have multiple wins)
            if (!grouped[key].wins) {
              grouped[key].wins = [];
            }
            grouped[key].wins!.push(tx);
            
            if (tx.txid && tx.txid.startsWith('eVva4uB8')) {
              console.log(`DEBUG: Added win to game group ${key}:`, grouped[key]);
            }
          }
        } else {
          // If we're trying to add a regular win/bet to a cancel group, create a separate group
          const gameKey = `${key}_game`;
          if (!grouped[gameKey]) {
            grouped[gameKey] = { type: 'game' };
          }
          
          if (tx.type === 'bet') {
            if (!grouped[gameKey].bets) {
              grouped[gameKey].bets = [];
            }
            grouped[gameKey].bets!.push(tx);
          } else if (tx.type === 'win') {
            if (!grouped[gameKey].wins) {
              grouped[gameKey].wins = [];
            }
            grouped[gameKey].wins!.push(tx);
            
            if (tx.txid && tx.txid.startsWith('eVva4uB8')) {
              console.log(`DEBUG: Added win to separate game group ${gameKey} (avoided cancel conflict):`, grouped[gameKey]);
            }
          }
        }
      } else if (tx.type === 'deposit') {
        grouped[tx.txid || tx.id] = { deposit: tx, type: 'deposit' };
      } else if (tx.type === 'withdrawal') {
        grouped[tx.txid || tx.id] = { withdraw: tx, type: 'withdrawal' };
      }
    }

    return grouped;
  };

  const fetchOnChainTransactions = async (vaultAddress: string): Promise<OnChainTransaction[]> => {
    try {
      const vaultPubkey = new PublicKey(vaultAddress);
      
      // Get transaction signatures for the vault
      const signatures = await connection.getSignaturesForAddress(vaultPubkey, { limit: 100 });
      
      const transactions: OnChainTransaction[] = [];
      
      for (const sig of signatures) {
        try {
          const tx = await connection.getTransaction(sig.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          });
          
          if (tx) {
            // Skip vault initialization transactions
            const logs = tx.meta?.logMessages || [];
            
            // Method 1: Check logs (when available)
            const isVaultInitFromLogs = logs.some(log => 
              log.includes('Instruction: InitializeVault') || 
              log.includes('InitializeVault') ||
              (log.includes('Unknown Program') && log.includes('3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg'))
            );
            
            // Method 2: Fallback for when logs are missing
            // Check if it's a known vault initialization signature or matches the pattern
            const isKnownVaultInit = sig.signature === '341AJqQgbZRGusFbtjyNoWYbYNVwkbGePHriodpYsS2bSezHhysRvCxecUKJDPnoagdbBwcJnMB5YcqyHDqxRpnH';
            const hasThreeInstructions = tx.transaction.message.compiledInstructions?.length === 3;
            const isVaultInitFromPattern = hasThreeInstructions && logs.length === 0 && isKnownVaultInit;
            
            const isVaultInitialization = isVaultInitFromLogs || isVaultInitFromPattern;
            
            // Debug specific transaction
            if (sig.signature.startsWith('341AJqQgbZ')) {
              console.log('DEBUG - Found 341AJqQgbZ transaction');
              console.log('Logs:', logs);
              console.log('Is vault initialization?', isVaultInitialization);
            }
            
            if (!isVaultInitialization) {
              // Parse transaction logs to extract instruction type and amounts
              console.log(`Processing transaction ${sig.signature.substring(0, 8)}... with ${logs.length} log messages`);
              const parsedTx = parseTransactionLogs(logs, sig.signature);
              
            transactions.push({
              signature: sig.signature,
              blockTime: tx.blockTime || 0,
              instructions: tx.transaction.message.compiledInstructions || [],
                meta: tx.meta || undefined,
                ...parsedTx
            });
            } else {
              console.log(`Skipping vault initialization transaction: ${sig.signature}`);
            }
          }
        } catch (txError) {
          console.warn(`Failed to fetch transaction ${sig.signature}:`, txError);
        }
      }
      
      // Remove duplicates based on signature before returning
      const uniqueTransactions = transactions.reduce((unique, tx) => {
        const existing = unique.find(existingTx => existingTx.signature === tx.signature);
        if (!existing) {
          unique.push(tx);
        } else {
          console.log(`DEBUG: Duplicate transaction signature found: ${tx.signature} - skipping duplicate`);
        }
        return unique;
      }, [] as OnChainTransaction[]);
      
      console.log(`DEBUG: Fetched ${transactions.length} transactions, ${uniqueTransactions.length} unique transactions`);
      return uniqueTransactions;
    } catch (error) {
      console.error('Error fetching on-chain transactions:', error);
      return [];
    }
  };

  const performReconciliation = async () => {
    if (!walletAddress.trim()) {
      setError('Please enter a wallet address');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Get user info and vault address
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('smart_vault')
        .eq('wallet_address', walletAddress.trim())
        .single();

      if (userError || !userData) {
        throw new Error('User not found');
      }

      if (!userData.smart_vault) {
        throw new Error('User does not have a smart vault');
      }

      // Fetch both data sources
      const [dbTransactions, onChainTransactions] = await Promise.all([
        fetchDbTransactions(walletAddress.trim()),
        fetchOnChainTransactions(userData.smart_vault)
      ]);

      // Group database transactions
      const groupedDbTransactions = groupDbTransactions(dbTransactions);

      // Perform reconciliation analysis
      const discrepancies = {
        missingOnChain: [] as any[],
        missingInDb: [] as OnChainTransaction[],
        balanceMismatches: [] as any[]
      };

      // Check each grouped DB transaction against on-chain transactions
      for (const [key, group] of Object.entries(groupedDbTransactions)) {
        if (group.type === 'game' && group.bets && group.bets.length > 0) {
          // Calculate totals from all bets and wins
          const totalDbBetAmount = group.bets.reduce((sum, bet) => sum + Math.abs(bet.amount), 0);
          const totalDbWinAmount = group.wins ? group.wins.reduce((sum, win) => sum + win.amount, 0) : 0;
          
          // For checking on-chain match, we need to check each win's txid since each win can have its own on-chain transaction
          const allTxids = [
            ...(group.wins || []).map(win => win.txid).filter(Boolean),
            ...(group.bets || []).map(bet => bet.txid).filter(Boolean)
          ];
          
          // Check each unique txid for on-chain matches
          const uniqueTxids = Array.from(new Set(allTxids.filter(Boolean))) as string[];
          
          for (const txidToMatch of uniqueTxids) {
            const signatureMatch = onChainTransactions.find(
              onChainTx => onChainTx.signature === txidToMatch
            );
            
            if (!signatureMatch) {
              discrepancies.missingOnChain.push({
                type: 'game',
                bets: group.bets,
                wins: group.wins,
                txid: txidToMatch,
                totalStake: totalDbBetAmount,
                totalWin: totalDbWinAmount,
                issue: 'No transaction found on-chain with this signature'
              });
            } else if (signatureMatch.instructionType === 'BatchSettle') {
              // Handle BatchSettle transactions - since we found the signature match,
              // this on-chain transaction is already accounted for by the database txid
              // The detailed batch item matching will be handled in the second pass below
              console.log(`DEBUG: Found BatchSettle signature ${txidToMatch} referenced by DB - skipping detailed batch validation here`);
            } else if (signatureMatch.instructionType === 'BetAndSettle') {
              // Legacy BetAndSettle handling
              const specificWin = group.wins?.find(win => win.txid === txidToMatch);
              const specificWinAmount = specificWin?.amount || 0;
              
              const onChainStake = signatureMatch.stakeAmount;
              const onChainPayout = signatureMatch.payoutAmount;

              if (onChainPayout !== specificWinAmount) {
                discrepancies.balanceMismatches.push({
                  type: 'game',
                  txid: txidToMatch,
                  dbBet: totalDbBetAmount,
                  dbWin: specificWinAmount,
                  onChainStake,
                  onChainPayout,
                  betCount: group.bets.length,
                  winCount: group.wins?.length || 0,
                  issue: 'Amount mismatch between DB and on-chain'
                });
              }
            } else {
              // Handle unexpected instruction types
              discrepancies.balanceMismatches.push({
                type: 'game',
                txid: txidToMatch,
                expectedInstruction: 'BetAndSettle or BatchSettle',
                actualInstruction: signatureMatch.instructionType,
                issue: `Transaction found but instruction type is ${signatureMatch.instructionType}, expected BetAndSettle or BatchSettle`
              });
            }
          }
        } else if (group.type === 'cancel' && (group.cancelbet || group.cancelwin)) {
          // Handle each cancel operation separately
          const cancelTransactions = [group.cancelbet, group.cancelwin].filter(Boolean) as DbTransaction[];
          
          for (const cancelTx of cancelTransactions) {
            const txidToMatch = cancelTx.txid;
            
            // Only look for on-chain matches if there's a valid txid (not N/A, null, or undefined)
            if (!txidToMatch || txidToMatch === 'N/A') {
              // Cancel operations without txid are expected (bet->cancelbet before going on-chain)
              console.log(`DEBUG: Cancel operation ${cancelTx.type} has no txid (${txidToMatch}) - no on-chain transaction expected`);
              continue;
            }

            // Look for matching on-chain transaction (could be BetAndSettle or other)
            const signatureMatch = onChainTransactions.find(
              onChainTx => onChainTx.signature === txidToMatch
            );
            
            if (!signatureMatch) {
              discrepancies.missingOnChain.push({
                type: 'cancel',
                transaction: cancelTx,
                txid: txidToMatch,
                issue: 'No transaction found on-chain for cancel operation'
              });
            } else {
              // Debug log for successful cancel matches
              console.log(`DEBUG: Found on-chain match for ${cancelTx.type} transaction ${txidToMatch}:`, signatureMatch);
            }
          }
        } else if (group.type === 'deposit' && group.deposit) {
          // First, find by signature match
          const signatureMatch = onChainTransactions.find(
            onChainTx => onChainTx.signature === group.deposit!.txid
          );
          
          if (!signatureMatch) {
            discrepancies.missingOnChain.push({
              type: 'deposit',
              transaction: group.deposit,
              txid: group.deposit.txid,
              issue: 'No transaction found on-chain with this signature'
            });
          } else if (signatureMatch.instructionType !== 'Deposit') {
            discrepancies.balanceMismatches.push({
              type: 'deposit',
              txid: group.deposit.txid,
              expectedInstruction: 'Deposit',
              actualInstruction: signatureMatch.instructionType,
              issue: `Transaction found but instruction type is ${signatureMatch.instructionType}, expected Deposit`
            });
          }
        } else if (group.type === 'withdrawal' && group.withdraw) {
          // First, find by signature match
          const signatureMatch = onChainTransactions.find(
            onChainTx => onChainTx.signature === group.withdraw!.txid
          );
          
          if (!signatureMatch) {
            discrepancies.missingOnChain.push({
              type: 'withdrawal',
              transaction: group.withdraw,
              txid: group.withdraw.txid,
              issue: 'No transaction found on-chain with this signature'
            });
          } else if (signatureMatch.instructionType !== 'Withdraw') {
            discrepancies.balanceMismatches.push({
              type: 'withdrawal',
              txid: group.withdraw.txid,
              expectedInstruction: 'Withdraw',
              actualInstruction: signatureMatch.instructionType,
              issue: `Transaction found but instruction type is ${signatureMatch.instructionType}, expected Withdraw`
            });
          }
        }
      }

      // Find on-chain transactions without corresponding DB transactions
      for (const onChainTx of onChainTransactions) {
        let dbMatch = false;
        
        // Debug logging for specific transaction
        if (onChainTx.signature.startsWith('eVva4uB8') || onChainTx.signature.startsWith('5W8vJxCH')) {
          console.log(`DEBUG: Checking signature ${onChainTx.signature}`);
          console.log('Instruction type:', onChainTx.instructionType);
          console.log('Available grouped transactions:', Object.keys(groupedDbTransactions));
          console.log('Total DB transactions:', dbTransactions.length);
        }
        
        // For BatchSettle and BetAndSettle transactions, check if any batch items have corresponding DB transactions
        if ((onChainTx.instructionType === 'BatchSettle' || onChainTx.instructionType === 'BetAndSettle') && onChainTx.batchItems) {
          let matchedBatchItems = 0;
          let totalBatchItems = onChainTx.batchItems.length;
          
          for (const batchItem of onChainTx.batchItems) {
            // Look for a DB transaction with matching transaction_id
            let batchItemMatch = false;
            
            for (const dbTx of dbTransactions) {
              if (dbTx.transaction_id === batchItem.betId) {
                batchItemMatch = true;
                matchedBatchItems++;
                
                if (onChainTx.signature.startsWith('eVva4uB8') || onChainTx.signature.startsWith('5W8vJxCH') || onChainTx.signature.startsWith('2cPxWo5X')) {
                  console.log(`DEBUG: Found match for batch item ${batchItem.betId} in DB transaction:`, dbTx.transaction_id);
                }
                break;
              }
            }
            
            if (!batchItemMatch && (onChainTx.signature.startsWith('eVva4uB8') || onChainTx.signature.startsWith('5W8vJxCH') || onChainTx.signature.startsWith('2cPxWo5X'))) {
              console.log(`DEBUG: Batch item ${batchItem.betId} not found in DB transactions`);
            }
          }
          
          // Mark as matched if any batch items were found (not requiring all)
          if (matchedBatchItems > 0) {
            dbMatch = true;
            if (onChainTx.signature.startsWith('eVva4uB8') || onChainTx.signature.startsWith('5W8vJxCH') || onChainTx.signature.startsWith('2cPxWo5X')) {
              console.log(`DEBUG: ${onChainTx.instructionType} transaction ${onChainTx.signature} matched: ${matchedBatchItems}/${totalBatchItems} batch items found`);
            }
          } else {
            if (onChainTx.signature.startsWith('eVva4uB8') || onChainTx.signature.startsWith('5W8vJxCH') || onChainTx.signature.startsWith('2cPxWo5X')) {
              console.log(`DEBUG: No batch items matched for ${onChainTx.instructionType} transaction ${onChainTx.signature}`);
            }
          }
        } else {
          // Legacy matching for non-BatchSettle transactions
          for (const [key, group] of Object.entries(groupedDbTransactions)) {
            // For game transactions, check all win and bet transaction txids
            const lastBetTxid = group.bets && group.bets.length > 0 ? group.bets[group.bets.length - 1]?.txid : undefined;
            const winTxids = group.wins ? group.wins.map(win => win.txid).filter(Boolean) : [];
            const allGameTxids = [...winTxids, lastBetTxid].filter(Boolean);
            const hasGameMatch = allGameTxids.includes(onChainTx.signature);
            // For cancel transactions, check all cancel transaction txids (excluding N/A)
            const cancelTxids = [group.cancelbet?.txid, group.cancelwin?.txid]
              .filter(txid => txid && txid !== 'N/A');
            const hasCancelMatch = cancelTxids.includes(onChainTx.signature);
            
            // Debug logging for specific transaction
            if (onChainTx.signature.startsWith('eVva4uB8')) {
              console.log(`DEBUG: Checking group ${key}, type: ${group.type}`);
              console.log(`  winTxids:`, winTxids);
              console.log(`  allGameTxids:`, allGameTxids);
              console.log(`  hasGameMatch:`, hasGameMatch);
              console.log(`  cancelTxids:`, cancelTxids);
              console.log(`  hasCancelMatch:`, hasCancelMatch);
            }
            
            if ((group.type === 'game' && hasGameMatch) ||
                (group.type === 'cancel' && hasCancelMatch) ||
                (group.deposit && group.deposit.txid === onChainTx.signature) ||
                (group.withdraw && group.withdraw.txid === onChainTx.signature)) {
              dbMatch = true;
              if (onChainTx.signature.startsWith('eVva4uB8')) {
                console.log(`DEBUG: Found match in group ${key}, type: ${group.type}`);
              }
              break;
            }
          }
        }
        
        // Fallback: Check all individual transactions if no grouped match found
        if (!dbMatch) {
          // For BatchSettle transactions, also check if individual batch items match DB transactions
          if (onChainTx.instructionType === 'BatchSettle' && onChainTx.batchItems) {
            for (const batchItem of onChainTx.batchItems) {
              for (const dbTx of dbTransactions) {
                if (dbTx.transaction_id === batchItem.betId) {
                  dbMatch = true;
                  if (onChainTx.signature.startsWith('eVva4uB8') || onChainTx.signature.startsWith('5W8vJxCH')) {
                    console.log(`DEBUG: Found BatchSettle fallback match for ${onChainTx.signature} via batch item ${batchItem.betId}:`, dbTx);
                  }
                  break;
                }
              }
              if (dbMatch) break;
            }
          } else {
            // Legacy fallback matching for non-BatchSettle transactions
            for (const dbTx of dbTransactions) {
              // Check exact match first
              if (dbTx.txid === onChainTx.signature) {
                dbMatch = true;
                if (onChainTx.signature.startsWith('eVva4uB8')) {
                  console.log(`DEBUG: Found exact fallback match for ${onChainTx.signature} in individual transaction:`, dbTx);
                }
                break;
              }
              // Check case-insensitive match
              if (dbTx.txid && dbTx.txid.toLowerCase() === onChainTx.signature.toLowerCase()) {
                dbMatch = true;
                if (onChainTx.signature.startsWith('eVva4uB8')) {
                  console.log(`DEBUG: Found case-insensitive fallback match for ${onChainTx.signature} in individual transaction:`, dbTx);
                }
                break;
              }
              // Check if on-chain signature starts with stored txid (in case DB has truncated values)
              if (dbTx.txid && onChainTx.signature.startsWith(dbTx.txid)) {
                dbMatch = true;
                if (onChainTx.signature.startsWith('eVva4uB8')) {
                  console.log(`DEBUG: Found partial fallback match (DB truncated) for ${onChainTx.signature} in individual transaction:`, dbTx);
                }
                break;
              }
              // Check if stored txid starts with on-chain signature (in case on-chain is truncated)
              if (dbTx.txid && dbTx.txid.startsWith(onChainTx.signature)) {
                dbMatch = true;
                if (onChainTx.signature.startsWith('eVva4uB8')) {
                  console.log(`DEBUG: Found partial fallback match (on-chain truncated) for ${onChainTx.signature} in individual transaction:`, dbTx);
                }
                break;
              }
            }
          }
        }
        
        if (!dbMatch) {
          if (onChainTx.signature.startsWith('eVva4uB8') || onChainTx.signature.startsWith('5W8vJxCH') || onChainTx.signature.startsWith('3xv5Xgdu') || onChainTx.signature.startsWith('5RDUZg4a') || onChainTx.signature.startsWith('2mR9MVfK') || onChainTx.signature.startsWith('2cPxWo5X')) {
            console.log(`DEBUG: No match found for ${onChainTx.signature} even after fallback check`);
            console.log('All DB transaction txids:', dbTransactions.map(tx => tx.txid).filter(Boolean));
            console.log('All DB transaction_ids:', dbTransactions.map(tx => tx.transaction_id));
            if (onChainTx.batchItems) {
              console.log('Batch items looking for:', onChainTx.batchItems.map(item => item.betId));
            }
          }
          console.log(`Adding ${onChainTx.signature} to missingInDb (instructionType: ${onChainTx.instructionType})`);
          discrepancies.missingInDb.push(onChainTx);
        } else {
          if (onChainTx.signature.startsWith('eVva4uB8') || onChainTx.signature.startsWith('5W8vJxCH') || onChainTx.signature.startsWith('3xv5Xgdu') || onChainTx.signature.startsWith('5RDUZg4a') || onChainTx.signature.startsWith('2mR9MVfK') || onChainTx.signature.startsWith('2cPxWo5X')) {
            console.log(`DEBUG: Successfully matched ${onChainTx.signature} - NOT adding to missingInDb`);
          }
        }
      }

      setResult({
        dbTransactions,
        onChainTransactions,
        discrepancies
      });

    } catch (err) {
      console.error('Reconciliation error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    if (currency === 'SOL') {
      return `${(amount / 1e9).toFixed(6)} SOL`;
    }
    return `$${(amount / 100).toFixed(2)}`;
  };

  const formatDate = (timestamp: string | number) => {
    const date = new Date(typeof timestamp === 'string' ? timestamp : timestamp * 1000);
    return date.toLocaleString();
  };

  return (
    <AdminLayout title="Transaction Reconciliation">
      <div className="mx-auto">
        
        {/* Input Section */}
        <div className="bg-cardMedium rounded-lg p-6 mb-8">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-white font-medium mb-2">
                Wallet Address
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Enter wallet address..."
                className="w-full p-3 bg-darkLuxuryPurple border border-gray-600 rounded text-white"
              />
            </div>
            <button
              onClick={performReconciliation}
              disabled={loading}
              className="px-6 py-3 bg-richGold text-black font-medium rounded hover:bg-yellow-400 disabled:opacity-50"
            >
              {loading ? 'Reconciling...' : 'Reconcile'}
            </button>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-900 border border-red-600 rounded text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Results Section */}
        {result && (
          <div className="space-y-8">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-cardMedium rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">Database Transactions</h3>
                <p className="text-2xl font-bold text-blue-400">{result.dbTransactions.length}</p>
              </div>
              <div className="bg-cardMedium rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">On-Chain Transactions</h3>
                <p className="text-2xl font-bold text-green-400">{result.onChainTransactions.length}</p>
              </div>
              <div className="bg-cardMedium rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">Discrepancies</h3>
                <p className="text-2xl font-bold text-red-400">
                  {result.discrepancies.missingOnChain.length + result.discrepancies.missingInDb.length + result.discrepancies.balanceMismatches.length}
                </p>
              </div>
            </div>

            {/* Discrepancies */}
            {(result.discrepancies.missingOnChain.length > 0 || result.discrepancies.missingInDb.length > 0 || result.discrepancies.balanceMismatches.length > 0) && (
              <div className="bg-cardMedium rounded-lg p-6">
                <h2 className="text-xl font-bold text-red-400 mb-4">Discrepancies Found</h2>
                
                {result.discrepancies.balanceMismatches.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-yellow-400 mb-3">
                      Amount Mismatches ({result.discrepancies.balanceMismatches.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-600">
                            <th className="text-left text-gray-300 py-2">TxID</th>
                            <th className="text-left text-gray-300 py-2">Type</th>
                            <th className="text-left text-gray-300 py-2">Expected/Actual</th>
                            <th className="text-left text-gray-300 py-2">Details</th>
                            <th className="text-left text-gray-300 py-2">Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.discrepancies.balanceMismatches.map((mismatch, index) => (
                            <tr key={`mismatch-${index}`} className="border-b border-gray-700">
                              <td className="text-white py-2 font-mono text-xs">
                                {mismatch.txid?.substring(0, 8)}...
                              </td>
                              <td className="text-white py-2">{mismatch.type}</td>
                              <td className="text-white py-2">
                                {mismatch.expectedInstruction ? (
                                  <>
                                    <span className="text-green-300">{mismatch.expectedInstruction}</span>
                                    {' / '}
                                    <span className="text-red-300">{mismatch.actualInstruction}</span>
                                  </>
                                ) : (
                                  <>
                                    {mismatch.dbBet ? `${(mismatch.dbBet / 1e9).toFixed(6)} SOL` : 'N/A'}
                                    {mismatch.betCount > 1 && ` (${mismatch.betCount} bets)`} / 
                                    {mismatch.dbWin ? ` ${(mismatch.dbWin / 1e9).toFixed(6)} SOL` : ' 0 SOL'}
                                    {mismatch.winCount > 1 && ` (${mismatch.winCount} wins)`}
                                  </>
                                )}
                              </td>
                              <td className="text-white py-2">
                                {mismatch.expectedInstruction ? (
                                  'Instruction Type Mismatch'
                                ) : (
                                  <>
                                    {mismatch.onChainStake ? `${(mismatch.onChainStake / 1e9).toFixed(6)} SOL` : 'N/A'} / 
                                    {mismatch.onChainPayout ? ` ${(mismatch.onChainPayout / 1e9).toFixed(6)} SOL` : ' 0 SOL'}
                                  </>
                                )}
                              </td>
                              <td className="text-red-200 py-2">{mismatch.issue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {result.discrepancies.missingOnChain.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Missing On-Chain ({result.discrepancies.missingOnChain.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-600">
                            <th className="text-left text-gray-300 py-2">Type</th>
                            <th className="text-left text-gray-300 py-2">Transaction Hash</th>
                            <th className="text-left text-gray-300 py-2">Amount</th>
                            <th className="text-left text-gray-300 py-2">Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.discrepancies.missingOnChain.map((discrepancy, index) => (
                            <tr key={`missing-onchain-${index}`} className="border-b border-gray-700">
                              <td className="text-white py-2">{discrepancy.type}</td>
                              <td className="text-white py-2 font-mono text-xs">
                                {discrepancy.txid ||
                                 (discrepancy.bets && discrepancy.bets.length > 0 ? discrepancy.bets[discrepancy.bets.length - 1]?.txid : undefined) ||
                                 (discrepancy.wins && discrepancy.wins.length > 0 ? discrepancy.wins[discrepancy.wins.length - 1]?.txid : undefined) ||
                                 discrepancy.transaction?.txid ||
                                 (discrepancy.type === 'cancel' && discrepancy.transaction ? discrepancy.transaction.txid?.substring(0, 8) + '...' : undefined) ||
                                 'Unknown'}
                              </td>
                              <td className="text-white py-2">
                                {discrepancy.bets && discrepancy.totalStake && formatAmount(discrepancy.totalStake, 'SOL')}
                                {discrepancy.wins && discrepancy.totalWin && ` + ${formatAmount(discrepancy.totalWin, 'SOL')}`}
                                {discrepancy.transaction && formatAmount(discrepancy.transaction.amount, discrepancy.transaction.currency)}
                              </td>
                              <td className="text-red-200 py-2">{discrepancy.issue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {result.discrepancies.missingInDb.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Missing in Database ({result.discrepancies.missingInDb.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-600">
                            <th className="text-left text-gray-300 py-2">Signature</th>
                            <th className="text-left text-gray-300 py-2">Instructions</th>
                            <th className="text-left text-gray-300 py-2">Block Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.discrepancies.missingInDb.map((tx, index) => (
                            <tr key={`missing-db-${index}-${tx.signature}`} className="border-b border-gray-700">
                              <td className="text-white py-2 font-mono text-xs">{tx.signature}</td>
                              <td className="text-white py-2">{tx.instructions.length} instructions</td>
                              <td className="text-white py-2">{formatDate(tx.blockTime)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* All Transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Database Transactions */}
              <div className="bg-cardMedium rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Database Transactions</h2>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-cardMedium">
                      <tr className="border-b border-gray-600">
                        <th className="text-left text-gray-300 py-2">Type</th>
                        <th className="text-left text-gray-300 py-2">Amount</th>
                        <th className="text-left text-gray-300 py-2">Status</th>
                        <th className="text-left text-gray-300 py-2">TxID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.dbTransactions.map((tx, index) => (
                        <tr key={`db-${index}-${tx.id}`} className="border-b border-gray-700">
                          <td className="text-white py-2">{tx.type}</td>
                          <td className="text-white py-2">{formatAmount(tx.amount, tx.currency)}</td>
                          <td className="text-white py-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              tx.status === 'completed' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="text-white py-2 font-mono text-xs">
                            {tx.txid ? tx.txid.substring(0, 8) + '...' : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* On-Chain Transactions */}
              <div className="bg-cardMedium rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">On-Chain Transactions</h2>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-cardMedium">
                      <tr className="border-b border-gray-600">
                        <th className="text-left text-gray-300 py-2">Signature</th>
                        <th className="text-left text-gray-300 py-2">Type</th>
                        <th className="text-left text-gray-300 py-2">Batch Items</th>
                        <th className="text-left text-gray-300 py-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.onChainTransactions.map((tx, index) => (
                        <tr key={`onchain-${index}-${tx.signature}`} className="border-b border-gray-700">
                          <td className="text-white py-2 font-mono text-xs">
                            {tx.signature.substring(0, 8)}...
                          </td>
                          <td className="text-white py-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              tx.instructionType === 'BatchSettle' ? 'bg-blue-800 text-blue-200' :
                              tx.instructionType === 'BetAndSettle' ? 'bg-green-800 text-green-200' :
                              tx.instructionType === 'Deposit' ? 'bg-yellow-800 text-yellow-200' :
                              tx.instructionType === 'Withdraw' ? 'bg-red-800 text-red-200' :
                              'bg-gray-800 text-gray-200'
                            }`}>
                              {tx.instructionType || 'Unknown'}
                            </span>
                          </td>
                          <td className="text-white py-2">
                            {tx.instructionType === 'BatchSettle' && tx.batchItems ? (
                              <div className="text-xs">
                                <div className="font-semibold">{tx.batchItems.length} items</div>
                                <div className="text-gray-400">
                                  Total: {formatAmount(tx.stakeAmount || 0, 'SOL')} stake, {formatAmount(tx.payoutAmount || 0, 'SOL')} payout
                                </div>
                              </div>
                            ) : (
                              tx.instructionType === 'BetAndSettle' ? (
                                <div className="text-xs text-gray-400">
                                  {formatAmount(tx.stakeAmount || 0, 'SOL')} / {formatAmount(tx.payoutAmount || 0, 'SOL')}
                                </div>
                              ) : '-'
                            )}
                          </td>
                          <td className="text-white py-2">{formatDate(tx.blockTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
} 