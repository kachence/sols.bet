// IMPORTANT: Import Sentry instrumentation first
import "./instrument.mjs";

import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { solToLamports, lamportsToSol, solToUsd, usdToSol, getSolToUsdRate, extractUsername, rpcWithRetry, initializeDependencies } from './modules/shared-utils.js';
import * as gemCollection from './modules/gem-collection.js';
import dotenv from "dotenv";
import http from 'http';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

console.log("🚀 Casino Worker Starting...");

// Initialize clients
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const pubsubChannel = 'balance_update';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Initialize shared utilities with Redis and Supabase instances
initializeDependencies(redis, supabase);

const connection = new Connection(
  process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.devnet.solana.com',
  'processed'
);

// System keypair for signing transactions
const systemKeypair = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.SYSTEM_WALLET_PRIVATE_KEY))
);

console.log(`🔑 System wallet: ${systemKeypair.publicKey.toBase58()}`);

// Smart Vault Program constants
const SMART_VAULT_PROGRAM_ID = new anchor.web3.PublicKey('3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg');

// Create Anchor provider
const wallet = new anchor.Wallet(systemKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
anchor.setProvider(provider);

// Create program instance with IDL for proper Anchor calls
let program = null;

// Initialize program with IDL
async function initializeAnchorProgram() {
  try {
    // Load IDL from the contract directory using ESM syntax
    const path = await import('path');
    const fs = await import('fs');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const idlPath = path.join(__dirname, 'idl.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    
    // Fix the _bn compatibility issue by ensuring proper program ID format
    // Force creation of a fresh PublicKey to avoid any _bn compatibility issues
    const programId = new anchor.web3.PublicKey('3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg');
    
    // Skip Anchor program initialization - use manual instruction building only
    // program = new anchor.Program(idl, programId, provider);
    console.log(`✅ Skipping Anchor program initialization - using manual instruction building only`);
    console.log(`Program ID: ${programId.toString()}`);
  } catch (error) {
    console.error(`❌ Failed to initialize Anchor program:`, error);
    console.error(`Program ID: ${SMART_VAULT_PROGRAM_ID}`);
    console.error(`Provider: ${provider?.connection?.rpcEndpoint}`);
    throw error;
  }
}

// Manual instruction building with PROPER 8-byte Anchor discriminators
function createInstructionData(methodName, ...u64s) {
  // Calculate proper 8-byte Anchor discriminator using SHA-256
  // Anchor uses: sha256(f"global:{method_name}")[0:8]
  const hash = crypto.createHash('sha256');
  hash.update(`global:${methodName}`);
  const disc = hash.digest().slice(0, 8);
  
  const buf = Buffer.alloc(8 + u64s.length * 8);
  disc.copy(buf, 0);
  u64s.forEach((n, i) => buf.writeBigUInt64LE(BigInt(n.toString()), 8 + i * 8));
  
  // Debug: log the discriminator being generated
  console.log(`🔍 [DEBUG] Method: ${methodName}, Discriminator: ${disc.toString('hex')}, Full data: ${buf.toString('hex')}`);
  
  return buf;
}

// Mixed types instruction builder for bet_and_settle (u64, u64, u16)
function createInstructionDataWithMixedTypes(methodName, stake, payout, multiplier) {
  const hash = crypto.createHash('sha256');
  hash.update(`global:${methodName}`);
  const disc = hash.digest().slice(0, 8);
  
  // bet_and_settle: stake(u64) + payout(u64) + multiplier(u16)
  const buf = Buffer.alloc(8 + 8 + 8 + 2);
  let offset = 0;
  
  // Discriminator (8 bytes)
  disc.copy(buf, offset);
  offset += 8;
  
  // stake: u64 (8 bytes)
  buf.writeBigUInt64LE(BigInt(stake.toString()), offset);
  offset += 8;
  
  // payout: u64 (8 bytes)
  buf.writeBigUInt64LE(BigInt(payout.toString()), offset);
  offset += 8;
  
  // multiplier: u16 (2 bytes)
  buf.writeUInt16LE(multiplier, offset);
  
  console.log(`🔍 [DEBUG] Mixed types - Method: ${methodName}, stake: ${stake}, payout: ${payout}, multiplier: ${multiplier}`);
  console.log(`🔍 [DEBUG] Data: ${buf.toString('hex')}`);
  
  return buf;
}

// OLD FUNCTIONS REMOVED: createCreditWinInstruction and createDebitLossInstruction
// All operations now use createBetAndSettleInstruction with appropriate stake/payout values

// Create instruction data for betAndSettle with String and u64 parameters
function createBatchSettleInstructionData(stakes, payouts, betIds, gameIds, gemDatas) {
  const hash = crypto.createHash('sha256');
  hash.update(`global:batch_settle`);
  const disc = hash.digest().slice(0, 8);
  
  // Proper Borsh encoding for batch_settle parameters:
  // Vec<u64> stakes, Vec<u64> payouts, Vec<String> bet_ids, Vec<u64> game_ids, Vec<Vec<u8>> gem_datas
  
  // Calculate total size needed
  let totalSize = 8; // discriminator
  totalSize += 4 + stakes.length * 8; // Vec<u64> stakes  
  totalSize += 4 + payouts.length * 8; // Vec<u64> payouts
  totalSize += 4; // Vec<String> bet_ids length
  betIds.forEach(id => totalSize += 4 + Buffer.byteLength(id, 'utf8')); // String lengths + content
  totalSize += 4 + gameIds.length * 8; // Vec<u64> game_ids
  totalSize += 4; // Vec<Vec<u8>> gem_datas length  
  gemDatas.forEach(data => totalSize += 4 + data.length); // Vec<u8> lengths + content
  
  const buffer = Buffer.alloc(totalSize);
  let offset = 0;
  
  // Discriminator
  disc.copy(buffer, offset);
  offset += 8;
  
  // Vec<u64> stakes
  buffer.writeUInt32LE(stakes.length, offset);
  offset += 4;
  stakes.forEach(stake => {
    buffer.writeBigUInt64LE(BigInt(stake), offset);
    offset += 8;
  });
  
  // Vec<u64> payouts  
  buffer.writeUInt32LE(payouts.length, offset);
  offset += 4;
  payouts.forEach(payout => {
    buffer.writeBigUInt64LE(BigInt(payout), offset);
    offset += 8;
  });
  
  // Vec<String> bet_ids
  buffer.writeUInt32LE(betIds.length, offset);
  offset += 4;
  betIds.forEach(id => {
    const idBytes = Buffer.from(id, 'utf8');
    buffer.writeUInt32LE(idBytes.length, offset);
    offset += 4;
    idBytes.copy(buffer, offset);
    offset += idBytes.length;
  });
  
  // Vec<u64> game_ids
  buffer.writeUInt32LE(gameIds.length, offset);
  offset += 4;
  gameIds.forEach(gameId => {
    buffer.writeBigUInt64LE(BigInt(parseInt(gameId) || 0), offset);
    offset += 8;
  });
  
  // Vec<Vec<u8>> gem_datas
  buffer.writeUInt32LE(gemDatas.length, offset);
  offset += 4;
  gemDatas.forEach(data => {
    buffer.writeUInt32LE(data.length, offset);
    offset += 4;
    Buffer.from(data).copy(buffer, offset);
    offset += data.length;
  });
  
  return buffer;
}

function createBetAndSettleInstructionData(stake, payout, betId, gameId, gemData = [0,0,0,0,0,0,0]) {
  const hash = crypto.createHash('sha256');
  hash.update(`global:bet_and_settle`);
  const disc = hash.digest().slice(0, 8);
  
  // bet_and_settle: stake(u64) + payout(u64) + bet_id(String) + game_id(u64) + gem_data(Vec<u8>)
  const betIdBytes = Buffer.from(betId, 'utf8');
  const betIdLength = betIdBytes.length;
  
  // Ensure gem_data is exactly 7 bytes as required by contract
  const gemDataArray = Array.isArray(gemData) ? gemData : [0,0,0,0,0,0,0];
  if (gemDataArray.length !== 7) {
    gemDataArray.length = 7;
    gemDataArray.fill(0, gemDataArray.length, 7);
  }
  
  const buf = Buffer.alloc(8 + 8 + 8 + 4 + betIdLength + 8 + 4 + 7);
  let offset = 0;
  
  // Discriminator (8 bytes)
  disc.copy(buf, offset);
  offset += 8;
  
  // stake: u64 (8 bytes)
  buf.writeBigUInt64LE(BigInt(stake.toString()), offset);
  offset += 8;
  
  // payout: u64 (8 bytes)  
  buf.writeBigUInt64LE(BigInt(payout.toString()), offset);
  offset += 8;
  
  // bet_id: String (length + bytes)
  buf.writeUInt32LE(betIdLength, offset);
  offset += 4;
  betIdBytes.copy(buf, offset);
  offset += betIdLength;
  
  // game_id: u64 (8 bytes)
  buf.writeBigUInt64LE(BigInt(parseInt(gameId) || 0), offset);
  offset += 8;
  
  // gem_data: Vec<u8> (length + bytes)
  buf.writeUInt32LE(7, offset); // Always 7 bytes
  offset += 4;
  gemDataArray.forEach((byte, i) => {
    buf.writeUInt8(byte, offset + i);
  });
  
  console.log(`🔍 [DEBUG] betAndSettle - stake: ${stake}, payout: ${payout}, betId: ${betId}, gameId: ${gameId}, gemData: ${gemDataArray}`);
  console.log(`🔍 [DEBUG] Data: ${buf.toString('hex')}`);
  
  return buf;
}

function createBetAndSettleInstruction(userVaultPDA, houseVaultPDA, authority, stake, payout, betId, gameId) {
  // Validate amounts
  if (!Number.isSafeInteger(stake) || stake < 0) {
    throw new Error("Stake must be non-negative u64");
  }
  if (!Number.isSafeInteger(payout) || payout < 0) {
    throw new Error("Payout must be non-negative u64");
  }
  if (!betId || typeof betId !== 'string') {
    throw new Error("betId must be a non-empty string");
  }
  if (!Number.isSafeInteger(gameId) || gameId <= 0) {
    throw new Error("gameId must be positive u64");
  }
  
  return new TransactionInstruction({
    keys: [
      { pubkey: userVaultPDA, isSigner: false, isWritable: true },
      { pubkey: houseVaultPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: pauseConfigPDA, isSigner: false, isWritable: false },
      { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: anchor.web3.SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: SMART_VAULT_PROGRAM_ID,
    data: createBetAndSettleInstructionData(stake, payout, betId, gameId),
  });
}

// Derive house vault PDA
const [houseVaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("house_vault")],
  SMART_VAULT_PROGRAM_ID
);

// Derive pause config PDA
const [pauseConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("pause_config")],
  SMART_VAULT_PROGRAM_ID
);

console.log(`🏠 House vault PDA: ${houseVaultPDA.toBase58()}`);
console.log(`⏸️ Pause config PDA: ${pauseConfigPDA.toBase58()}`);
console.log(`✅ Basic setup completed successfully!`);

// Initialize pause config if needed
await ensurePauseConfigExists();

// Initialize Anchor program
await initializeAnchorProgram();

// Check and initialize pause config if needed
async function ensurePauseConfigExists() {
  try {
    const pauseConfigAccount = await provider.connection.getAccountInfo(pauseConfigPDA);
    
    if (!pauseConfigAccount) {
      console.log(`⚠️ Pause config account not found, initializing...`);
      
      // Create initialize pause config instruction
      const hash = crypto.createHash('sha256');
      hash.update(`global:initialize_pause_config`);
      const disc = hash.digest().slice(0, 8);
      
      const initPauseData = Buffer.alloc(8); // No additional data needed
      disc.copy(initPauseData, 0);
      
      const initPauseIx = new TransactionInstruction({
        keys: [
          { pubkey: pauseConfigPDA, isSigner: false, isWritable: true },
          { pubkey: systemKeypair.publicKey, isSigner: true, isWritable: false },
          { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: SMART_VAULT_PROGRAM_ID,
        data: initPauseData,
      });
      
      const tx = new Transaction().add(initPauseIx);
      const signature = await provider.sendAndConfirm(tx, [systemKeypair], {
        skipPreflight: false,
        maxRetries: 2,
        commitment: 'confirmed',
      });
      
      console.log(`✅ Pause config initialized: ${signature}`);
    } else {
      console.log(`✅ Pause config account already exists`);
    }
  } catch (error) {
    console.error(`❌ Failed to initialize pause config:`, error);
    throw error;
  }
}

// Provider job handler - main business logic from balance_adj.ts
async function handleProviderJob(data, requestId) {
  console.log(`[WORKER-${requestId}] 🎮 Processing provider job:`, {
    type: data.type,
    username: data.username,
    amountUsd: data.amountUsd,
    gpid: data.gpid,
    subtype: data.subtype
  });

  // 1. Idempotency check
  const { data: duplicateRes, error: duplicateErr } = await rpcWithRetry(
    supabase, 'check_duplicate_transaction', 
    { p_transaction_id: data.uniqid }
  );

  if (duplicateErr) {
    throw new Error(`Duplicate check failed: ${duplicateErr.message}`);
  }

  const duplicateResult = Array.isArray(duplicateRes) ? duplicateRes[0] : duplicateRes;
  if (duplicateResult?.found) {
    console.log(`[WORKER-${requestId}] ⟳ Duplicate transaction, skipping`);
    return { balance: duplicateResult.balance };
  }

  // 2. Convert USD → lamports
  const solToUsdRate = await getSolToUsdRate();
  const solAmount = usdToSol(data.amountUsd, solToUsdRate);
  const amountInLamports = solToLamports(solAmount);

  console.log(`[WORKER-${requestId}] 💱 Converted $${data.amountUsd} → ${amountInLamports} lamports (rate: $${solToUsdRate})`);

  // 3. Branch by type + subtype (main business logic)
  if (data.type === 'bet' && data.subtype !== 'gamble') {
    return await stakeOnly(data, amountInLamports, requestId);
  }
  
  if (data.type === 'bet' && data.subtype === 'gamble') {
    return await gambleLoss(data, amountInLamports, requestId);
  }
  
  if (data.type === 'win') {
    return await settleOrBonus(data, amountInLamports, requestId);
  }

  if (data.type === 'cancel' || data.type === 'cancelbet' || data.type === 'cancelwin') {
    return await handleCancelOperation(data, solToUsdRate, requestId);
  }

  throw new Error(`Unsupported transaction type: ${data.type}`);
}

// Check if a gameplay cancellation requires blockchain reversal
async function checkGameplayCancellation(data, requestId) {
  try {
         // Query database for transactions in this gameplay
     const { data: transactions, error } = await supabase
       .from('transactions')
       .select('*')
       .eq('player_id', data.username)
       .eq('game_round', data.gpid)
       .in('type', ['bet', 'win'])
       .in('status', ['completed', 'cancelled']) // Include cancelled to detect already reversed
       .order('created_at', { ascending: true });
      
    if (error) {
      console.warn(`[WORKER-${requestId}] ⚠️ Error checking gameplay transactions:`, error);
      return { requiresReversal: false };
    }
    
    if (!transactions || transactions.length === 0) {
      console.log(`[WORKER-${requestId}] No completed transactions found for gpid ${data.gpid}`);
      return { requiresReversal: false };
    }
    
         // Check if we have both bet and win (indicating atomic settlement)
     const hasBet = transactions.some(tx => tx.type === 'bet' && tx.status === 'completed');
     const hasWin = transactions.some(tx => tx.type === 'win' && tx.status === 'completed');
     const hasBlockchainTx = transactions.some(tx => tx.txid && tx.txid.length > 40); // Solana txid length
     const alreadyCancelled = transactions.some(tx => tx.status === 'cancelled');
     
     console.log(`[WORKER-${requestId}] Gameplay analysis for gpid ${data.gpid}:`, {
       transactionCount: transactions.length,
       hasBet,
       hasWin,
       hasBlockchainTx,
       alreadyCancelled,
       transactions: transactions.map(tx => ({ type: tx.type, amount: tx.amount, status: tx.status, txid: tx.txid?.substring(0, 8) + '...' }))
     });
     
     // Requires reversal if we have both bet and win with blockchain transaction AND not already cancelled
     const requiresReversal = hasBet && hasWin && hasBlockchainTx && !alreadyCancelled;
    
    return {
      requiresReversal,
      transactions,
      totalStake: transactions.filter(tx => tx.type === 'bet').reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0),
      totalPayout: transactions.filter(tx => tx.type === 'win').reduce((sum, tx) => sum + (tx.amount || 0), 0)
    };
    
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Error in checkGameplayCancellation:`, error);
    return { requiresReversal: false };
  }
}

// Handle gameplay-level cancellation (blockchain reversal)
async function handleGameplayReversal(data, gameplayInfo, solToUsdRate, requestId) {
  console.log(`[WORKER-${requestId}] 🔄 Processing gameplay reversal for gpid ${data.gpid}`);
  
  try {
    // Convert cancellation amount to lamports
    const cancellationUsd = parseFloat(data.amountUsd);
    const cancellationLamports = solToLamports(usdToSol(Math.abs(cancellationUsd), solToUsdRate));
    
    console.log(`[WORKER-${requestId}] Cancellation details:`, {
      type: data.type,
      amountUsd: cancellationUsd,
      amountLamports: cancellationLamports,
      gpid: data.gpid
    });

    // Get user vault for blockchain transaction
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('smart_vault')
      .eq('username', username)
      .single();

    if (userError || !userData?.smart_vault) {
      throw new Error(`User vault not found for username: ${username}`);
    }

    const userVaultPDA = new anchor.web3.PublicKey(userData.smart_vault);
    let txSignature = null;
    let vaultCallType = 'cancel';
    let balanceUpdateAmount;
    let operation;

    // Execute specific blockchain transaction based on cancellation type
    if (data.type === 'cancelwin') {
        // Cancel win: Use batch_settle with stake=amount, payout=0
      // This debits the win amount from user's vault
      console.log(`[WORKER-${requestId}] 🔄 Executing cancelwin blockchain transaction: stake=${cancellationLamports}, payout=0`);
        await addToBlockchainQueue(
          username,
          cancellationLamports, // stake = amount to debit
          0, // payout = 0 (no payout)
          data.uniqid, // betId = cancel transaction ID (matches transaction_id in DB)
          data.gameId || 0, // gameId from payload
          null, // no gems for cancellations
          requestId
        );
      vaultCallType = 'cancelwin_blockchain';
      balanceUpdateAmount = -cancellationLamports; // Deduct the win amount
      operation = 'withdrawal';
      
    } else if (data.type === 'cancelbet') {
      // Cancel bet: Use batch_settle with stake=0, payout=amount  
      // This credits the bet amount back to user's vault
      console.log(`[WORKER-${requestId}] 🔄 Executing cancelbet blockchain transaction: stake=0, payout=${cancellationLamports}`);
      await addToBlockchainQueue(
        username,
        0, // stake = 0 (no debit)
        cancellationLamports, // payout = amount to credit
        data.uniqid, // betId = cancel transaction ID (matches transaction_id in DB)
        data.gameId || 0, // gameId from payload
        null, // no gems for cancellations
        requestId
      );
      vaultCallType = 'cancelbet_blockchain';
      balanceUpdateAmount = cancellationLamports; // Refund the bet amount
      operation = 'deposit';
      
    }
    
    // Mark original transactions as cancelled
    try {
      await supabase
        .from('transactions')
        .update({ 
          status: 'cancelled',
          metadata: { 
            ...gameplayInfo.transactions[0]?.metadata,
            cancelled_at: new Date().toISOString(),
            cancelled_by: data.uniqid,
            reversal_reason: 'gameplay_cancellation',
            blockchain_reversal_tx: txSignature
          }
        })
        .eq('player_id', data.username)
        .eq('game_round', data.gpid)
        .in('type', ['bet', 'win']);
        
      console.log(`[WORKER-${requestId}] ✅ Marked original transactions as cancelled`);
    } catch (markErr) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to mark transactions as cancelled:`, markErr);
    }

    // Update user balance with the cancellation effect
    const result = await updateUserBalance(data, balanceUpdateAmount, operation, requestId, {
      vault_call_type: vaultCallType,
      vault_transaction_hash: txSignature,
      original_gpid: data.gpid,
      cancelled_stake: gameplayInfo.totalStake,
      cancelled_payout: gameplayInfo.totalPayout,
      cancellation_amount_lamports: cancellationLamports,
      cancellation_type: data.type
    });
    
    console.log(`[WORKER-${requestId}] ✅ Gameplay reversal completed with blockchain transaction: ${txSignature}`);
    return result;
    
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Error in handleGameplayReversal:`, error);
    throw error;
  }
}

// Handle cancel operations (cancelbet, cancelwin, cancel)
async function handleCancelOperation(data, solToUsdRate, requestId) {
  console.log(`[WORKER-${requestId}] 🚫 Processing cancel: ${data.type}, amount: ${data.amountUsd}, gpid: ${data.gpid}`);
  
  // Extract username - try direct username first, then extract from login
  let username = data.username;
  if (!username && data.login) {
    username = extractUsername(data.login);
  }
  if (!username) {
    throw new Error(`Could not extract username. data.username: ${data.username}, data.login: ${data.login}`);
  }
  
  // Validate amount to prevent NaN issues
  const adjustmentUsd = parseFloat(data.amountUsd);
  if (isNaN(adjustmentUsd)) {
    throw new Error(`Invalid cancel amount: ${data.amountUsd} resulted in NaN`);
  }
  
  // Check if this is a gameplay-level cancellation (requires blockchain reversal)
  if (data.gpid && (data.type === 'cancelbet' || data.type === 'cancelwin')) {
    const gameplayCancellation = await checkGameplayCancellation(data, requestId);
    if (gameplayCancellation.requiresReversal) {
      console.log(`[WORKER-${requestId}] 🔄 Detected gameplay cancellation requiring blockchain reversal`);
      return await handleGameplayReversal(data, gameplayCancellation, solToUsdRate, requestId);
    }
  }
  
  // Handle individual transaction cancellations with new logic
  if (data.type === 'cancelbet') {
    // Store cancelbet amount for later use when cancelwin comes
    const cancelBetKey = `cancelbet:${username}:${data.gpid}`;
    try {
      await redis.set(cancelBetKey, Math.abs(adjustmentUsd), { ex: 3600 }); // 1 hour TTL
      console.log(`[WORKER-${requestId}] 💾 Stored cancelbet amount ${Math.abs(adjustmentUsd)} for gpid ${data.gpid}`);
    } catch (redisErr) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to store cancelbet amount:`, redisErr);
    }
    
    // For cancelbet, just update the balance (refund) - no blockchain transaction yet
    const refundLamports = solToLamports(usdToSol(Math.abs(adjustmentUsd), solToUsdRate));
    
    return await updateUserBalance(data, refundLamports, 'cancelbet', requestId, { 
      vault_call_type: 'cancelbet_pending',
      adjustment_lamports: refundLamports,
      cancel_type: data.type,
      original_amount_usd: adjustmentUsd,
      pending_blockchain_reversal: true
    });
    
  } else if (data.type === 'cancelwin') {
    // Get stored cancelbet amount to determine blockchain transaction
    const cancelBetKey = `cancelbet:${username}:${data.gpid}`;
    let cancelBetAmount = 0;
    
    try {
      const storedAmount = await redis.get(cancelBetKey);
      if (storedAmount !== null) {
        cancelBetAmount = parseFloat(storedAmount);
        await redis.del(cancelBetKey); // Clean up after use
        console.log(`[WORKER-${requestId}] 🔍 Retrieved stored cancelbet amount: ${cancelBetAmount} for gpid ${data.gpid}`);
      } else {
        console.log(`[WORKER-${requestId}] ⚠️ No stored cancelbet amount found for gpid ${data.gpid}`);
      }
    } catch (redisErr) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to retrieve cancelbet amount:`, redisErr);
    }
    
    // Convert amounts to lamports
    const cancelWinLamports = solToLamports(usdToSol(Math.abs(adjustmentUsd), solToUsdRate)); // stake
    const cancelBetLamports = solToLamports(usdToSol(cancelBetAmount, solToUsdRate)); // payout
    
    // Get user vault for blockchain transaction
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('smart_vault')
      .eq('username', username)
      .single();

    if (userError || !userData?.smart_vault) {
      throw new Error(`User vault not found for username: ${username}`);
    }

    const userVaultPDA = new anchor.web3.PublicKey(userData.smart_vault);
    let txSignature = null;
    let vaultCallType = 'cancelwin_with_reversal';
    
    // Execute blockchain reversal transaction
    if (cancelWinLamports > 0) {
        // Use batch_settle with cancelwin amount as stake, cancelbet amount as payout
      console.log(`[WORKER-${requestId}] 🔄 Executing cancelwin reversal: stake=${cancelWinLamports}, payout=${cancelBetLamports}`);
        await addToBlockchainQueue(
          username,
          cancelWinLamports, // stake = amount to debit from user
          cancelBetLamports, // payout = amount to credit to user
          data.uniqid, // betId = cancel transaction ID (matches transaction_id in DB)
          data.gameId || 0, // gameId from payload
          null, // no gems for cancellations
          requestId
        );
    } else {
        // If cancelwin amount is 0, use batch_settle for the cancelbet amount (if any)
      if (cancelBetLamports > 0) {
          console.log(`[WORKER-${requestId}] 🎁 Zero cancelwin, using batch_settle for cancelbet amount: ${cancelBetLamports}`);
          await addToBlockchainQueue(
            username,
            0, // stake = 0 (no debit)
            cancelBetLamports, // payout = cancelbet amount
            data.uniqid, // betId = cancel transaction ID (matches transaction_id in DB)
            data.gameId || 0, // gameId from payload
            null, // no gems for cancellations
            requestId
          );
        vaultCallType = 'cancelwin_credit_only';
      } else {
        console.log(`[WORKER-${requestId}] 🔄 Zero amounts for both cancelwin and cancelbet, no blockchain transaction needed`);
        vaultCallType = 'cancelwin_no_action';
      }
    }
    
    // For cancelwin, deduct the win amount from balance
    const deductLamports = cancelWinLamports; // Pass positive amount, SQL function will make it negative
    
    console.log(`[WORKER-${requestId}] Cancelwin calculation: ${adjustmentUsd} USD → ${deductLamports} lamports (cancelwin), queued for blockchain processing`);
    
    // Clear stakes from cache and DB
    if (data.gpid) {
      const stakeKey = `stake:${username}:${data.gpid}`;
      try {
        await redis.del(stakeKey);
        console.log(`[WORKER-${requestId}] Cleared stake cache for gpid ${data.gpid}`);
      } catch (redisErr) {
        console.warn(`[WORKER-${requestId}] ⚠️ Failed to clear stake cache:`, redisErr);
      }
      
      try {
        const { data: cancelResult } = await supabase.rpc('cancel_game_stake', { 
          p_username: username, 
          p_gpid: String(data.gpid) 
        });
        
        if (cancelResult && cancelResult.length > 0) {
          const result = cancelResult[0];
          console.log(`[WORKER-${requestId}] Cancelled ${result.cancelled_count} stakes totaling ${result.total_stake_lamports} lamports`);
        }
      } catch (cancelErr) {
        console.warn(`[WORKER-${requestId}] ⚠️ Failed to cancel stake in DB:`, cancelErr);
      }
    }
    
    return await updateUserBalance(data, deductLamports, 'cancelwin', requestId, { 
      vault_call_type: vaultCallType,
      vault_transaction_hash: 'queued', // Transaction queued for batch processing
      adjustment_lamports: deductLamports,
      cancel_type: data.type,
      original_amount_usd: adjustmentUsd,
      cancelbet_amount_usd: cancelBetAmount,
      cancelwin_amount_lamports: cancelWinLamports,
      cancelbet_amount_lamports: cancelBetLamports
    });
    
  } else {
    // Generic cancel - legacy behavior
    const adjustmentLamports = solToLamports(usdToSol(Math.abs(adjustmentUsd), solToUsdRate)) * (adjustmentUsd > 0 ? 1 : -1);
    
    console.log(`[WORKER-${requestId}] Generic cancel calculation: ${adjustmentUsd} USD → ${adjustmentLamports} lamports (cancel)`);
    
    return await updateUserBalance(data, adjustmentLamports, 'cancel', requestId, { 
      vault_call_type: 'cancel_generic',
      adjustment_lamports: adjustmentLamports,
      cancel_type: data.type,
      original_amount_usd: adjustmentUsd
    });
  }
}

// Stake-only processing (regular bets)
async function stakeOnly(data, amountInLamports, requestId) {
  console.log(`[WORKER-${requestId}] 💾 Stake-only bet: ${amountInLamports} lamports`);

  // Save stake in both Redis and Database - ACCUMULATE for multi-bet scenarios
  const stakeKey = `stake:${data.username}:${data.gpid}`;
  
  // Save to Redis (fast access) - ACCUMULATE existing stake
  try {
    const existingStake = await redis.get(stakeKey) || 0;
    const newCumulativeStake = Number(existingStake) + amountInLamports;
    await redis.set(stakeKey, newCumulativeStake, { ex: 86400 }); // 24-hour TTL
    console.log(`[WORKER-${requestId}] 💾 Accumulated stake to Redis: ${existingStake} + ${amountInLamports} = ${newCumulativeStake} for gpid ${data.gpid}`);
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Failed to accumulate stake to Redis:`, error);
    throw new Error('Redis stake save failed');
  }
  
  // Save to Database (durable backup) - RPC handles accumulation via INSERT
  try {
    const { error: saveError } = await supabase.rpc('save_game_stake', {
      p_username: data.username,
      p_player_id: data.username,
      p_gpid: String(data.gpid),
      p_stake_lamports: amountInLamports, // RPC will INSERT new row (accumulation via SUM later)
      p_game_id: data.gameId || 'unknown',
      p_transaction_id: data.uniqid,
      p_currency: 'SOL'
    });
    
    if (saveError) {
      console.error(`[WORKER-${requestId}] ❌ Failed to save stake to database:`, saveError);
      throw new Error('DB stake save failed');
    } else {
      console.log(`[WORKER-${requestId}] 💾 Saved stake to database for gpid ${data.gpid}`);
    }
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Database stake save error:`, error);
    throw error;
  }

  // Calculate and store gems based on the new wager amount
  let gemData = null;
  try {
    // Calculate multiplier for gem rolling (use default 1.0x for bets)
    const multiplier = calculateMultiplier(data.username, requestId);
    console.log(`[WORKER-${requestId}] 💎 STAKE-ONLY: Calculating gems for ${data.username}, stake: ${amountInLamports}, multiplier: ${multiplier}, gpid: ${data.gpid}`);
    
    // Calculate gems for this bet (happens after total_wagered will be updated)
    gemData = await calculateAndAwardGemsOnBet(data.username, amountInLamports, multiplier, data.gpid, requestId);
    if (gemData) {
      console.log(`[WORKER-${requestId}] 💎 STAKE-ONLY: Storing gems for gpid ${data.gpid}:`, gemData.gemsAwarded);
    } else {
      console.log(`[WORKER-${requestId}] 💎 STAKE-ONLY: No gems calculated for gpid ${data.gpid}`);
    }
  } catch (gemError) {
    console.warn(`[WORKER-${requestId}] ⚠️ Failed to process gems on bet:`, gemError);
    // Don't fail the transaction for gem processing errors
  }

  // Deduct the bet amount from balance for stake-only bets
  return await updateUserBalance(data, -amountInLamports, 'bet', requestId, {
    vault_call_type: 'stake_only',
    stake_lamports: amountInLamports
  });
}

// Gamble loss processing
async function gambleLoss(data, amountInLamports, requestId) {
  console.log(`[WORKER-${requestId}] 🎮 Gamble loss: ${amountInLamports} lamports`);

  // Calculate and store gems for gamble losses too (they are wagers)
  let gemData = null;
  try {
    const multiplier = calculateMultiplier(data.username, requestId);
    console.log(`[WORKER-${requestId}] 💎 GAMBLE-LOSS: Calculating gems for ${data.username}, stake: ${amountInLamports}, multiplier: ${multiplier}, gpid: ${data.gpid}`);
    gemData = await calculateAndAwardGemsOnBet(data.username, amountInLamports, multiplier, data.gpid, requestId);
    if (gemData) {
      console.log(`[WORKER-${requestId}] 💎 GAMBLE-LOSS: Storing gems for gpid ${data.gpid}:`, gemData.gemsAwarded);
    } else {
      console.log(`[WORKER-${requestId}] 💎 GAMBLE-LOSS: No gems calculated for gpid ${data.gpid}`);
    }
  } catch (gemError) {
    console.warn(`[WORKER-${requestId}] ⚠️ Failed to process gems on gamble loss:`, gemError);
  }

  // Add to blockchain queue instead of immediate execution
  const queueId = await addToBlockchainQueue(
    data.username,
    amountInLamports, // stake = amount (loss amount)
    0, // payout = 0 (no payout for loss)
    data.uniqid, // betId from CWS uniqid
    data.gameId || 0, // gameId from payload
    gemData ? gemData.gemsAwarded : null, // Include gems if awarded
    requestId
  );

  // Update user balance
  return await updateUserBalance(data, amountInLamports, 'bet', requestId, {
    vault_call_type: 'queued_debit_loss',
    blockchain_queue_id: queueId,
    stake_lamports: amountInLamports
  });
}

// Settle or bonus win processing
async function settleOrBonus(data, amountInLamports, requestId) {
  console.log(`[WORKER-${requestId}] 🎰 Processing win: ${amountInLamports} lamports`);

  // Try to retrieve original stake
  const stakeKey = `stake:${data.username}:${data.gpid}`;
  let stakeLamports = 0;
  let stakeFound = false;
  
  // First try Redis
  try {
    const cachedStake = await redis.get(stakeKey);
    if (cachedStake !== null && cachedStake !== undefined) {
      stakeLamports = Number(cachedStake);
      stakeFound = true;
      console.log(`[WORKER-${requestId}] 🔍 Retrieved stake ${stakeLamports} lamports from Redis`);
      
      // Clean up Redis cache
      await redis.del(stakeKey);
    }
  } catch (error) {
    console.warn(`[WORKER-${requestId}] ⚠️ Redis stake lookup failed:`, error);
  }
  
  // Fallback to database
  if (!stakeFound) {
    try {
      const { data: stakeData, error: stakeError } = await supabase.rpc('consume_game_stake', {
        p_username: data.username,
        p_gpid: String(data.gpid)
      });
      
      if (!stakeError && stakeData && stakeData.length > 0) {
        const stakeResult = stakeData[0];
        if (stakeResult.found) {
          stakeLamports = Number(stakeResult.stake_lamports);
          stakeFound = true;
          console.log(`[WORKER-${requestId}] 📊 Retrieved stake ${stakeLamports} lamports from database`);
        }
      }
    } catch (error) {
      console.error(`[WORKER-${requestId}] ❌ Database stake lookup error:`, error);
    }
  }

  console.log(`[WORKER-${requestId}] Stake found: ${stakeFound}, value: ${stakeLamports}`);

  let vaultCallType;
  let balanceUpdateAmount; // Amount to add/subtract from DB balance
  let gemDataForTransaction = null;
  let queueId = null;

  if (stakeFound) {
    // Regular win - atomic settlement
    // Calculate multiplier for payout calculations
    const multiplier = calculateMultiplier(data.username, requestId);
    
    // Retrieve gems that were calculated during the bet operation
    let gemData = null;
    try {
      gemData = await retrieveGemsForWin(data.gpid, requestId);
      if (gemData) {
        gemDataForTransaction = {
          gems: gemData.gemsAwarded,
          total_gems: gemData.totalGems,
          multiplier_applied: gemData.multiplierApplied
        };
        console.log(`[WORKER-${requestId}] 💎 Retrieved gems for win gpid ${data.gpid}:`, gemData.gemsAwarded);
      }
    } catch (gemError) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to retrieve gems for win:`, gemError);
      // Don't fail the transaction for gem retrieval errors
    }
    
    console.log(`[WORKER-${requestId}] ⚡ Queuing atomic settlement - stake: ${stakeLamports} (original stake), payout: ${amountInLamports}, multiplier: ${multiplier}`);
    
    // Add to blockchain queue with original stake + payout for proper batch_settle
    queueId = await addToBlockchainQueue(
      data.username,
      stakeLamports, // stake = original stake amount (needed for batch_settle)
      amountInLamports, // payout = win amount
      data.uniqid, // betId from CWS uniqid
      data.gameId || 0, // gameId from payload
      gemData ? gemData.gemsAwarded : null, // gem data
      requestId
    );
    
    vaultCallType = 'queued_bet_settle';
    balanceUpdateAmount = amountInLamports; // Add full payout (stake already deducted in prior bets)
    console.log(`[WORKER-${requestId}] 📊 Adding full payout to DB: ${amountInLamports} (stake already deducted)`);
    
  } else {
    // Bonus win - credit win (only if amount > 0)
    if (amountInLamports > 0) {
      console.log(`[WORKER-${requestId}] 🎁 Bonus win - queuing credit: ${amountInLamports} lamports`);
      
      queueId = await addToBlockchainQueue(
        data.username,
        0, // stake = 0 (no stake)
        amountInLamports, // payout = bonus amount
        data.uniqid, // betId from CWS uniqid
        data.gameId || 0, // gameId from payload
        null, // no gems for bonus wins typically
        requestId
      );
      
      vaultCallType = 'queued_credit_win';
      balanceUpdateAmount = amountInLamports; // Full payout for bonus
    } else {
      // $0 bonus win - no blockchain transaction needed
      console.log(`[WORKER-${requestId}] 🎁 $0 bonus win - no blockchain transaction`);
      vaultCallType = 'none';
      balanceUpdateAmount = 0; // No change for $0 bonus
    }
  }

  // Update user balance with calculated amount (net profit for regular wins, full payout for bonus)
  return await updateUserBalance(data, balanceUpdateAmount, 'win', requestId, {
    vault_call_type: vaultCallType,
    blockchain_queue_id: queueId,
    stake_lamports: stakeLamports,
    payout_lamports: amountInLamports,
    profit_lamports: balanceUpdateAmount - stakeLamports, // Log net for metadata
    is_bonus_win: !stakeFound,
    ...(gemDataForTransaction && { gem_awards: gemDataForTransaction })
  }, gemDataForTransaction);
}

// Update user balance helper
async function updateUserBalance(data, amountInLamports, operation, requestId, extraMetadata = {}, gemData = null, status = 'completed') {
  const metadata = {
    original_amount: data.amountUsd,
    original_currency: 'USD',
    gpid_status: 'nt',
    vault_call_started: true,
    ...extraMetadata
  };

  console.log(`[WORKER-${requestId}] 📊 Updating user balance: ${operation} ${amountInLamports} lamports (status: ${status})`);
  if (gemData) {
    console.log(`[WORKER-${requestId}] 💎 Including gem data: ${gemData.total_gems} gems awarded`);
  }

  // Calculate USD amount from the actual lamports being processed
  let amountUsdCents = null;
  try {
    const solToUsdRate = await getSolToUsdRate();
    const solAmount = lamportsToSol(amountInLamports);
    const usdAmount = solToUsd(solAmount, solToUsdRate);
    amountUsdCents = Math.round(usdAmount * 100); // Convert to cents
    console.log(`[WORKER-${requestId}] 💱 Calculated USD: ${solAmount} SOL × $${solToUsdRate} = $${usdAmount.toFixed(4)} (${amountUsdCents} cents)`);
  } catch (error) {
    console.warn(`[WORKER-${requestId}] ⚠️ Failed to calculate USD amount:`, error);
    // Fallback to data.amountUsd if available
    amountUsdCents = data.amountUsd ? Math.round(parseFloat(data.amountUsd) * 100) : null;
  }

  // Prepare gems_awarded JSONB for database
  let gemsAwarded = null;
  if (gemData && gemData.gems) {
    gemsAwarded = gemData.gems;
    
    // Process referral gem bonuses before updating main user
    try {
      await processReferralGemBonuses(data.username, gemData.gems, requestId);
    } catch (referralError) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to process referral gem bonuses:`, referralError);
      // Don't fail the main transaction for referral bonus errors
    }
    
    // Invalidate gem cache when gems are awarded
    try {
      await gemCollection.invalidateGemCache(data.username);
    } catch (cacheError) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to invalidate gem cache:`, cacheError);
    }
  }

  const { data: updateRes, error: updateErr } = await rpcWithRetry(supabase, 'update_user_balance', {
    p_username: data.username,
    p_amount_lamports: amountInLamports,
    p_amount_usd: amountUsdCents,
    p_operation: operation,
    p_transaction_id: data.uniqid,
    p_game_id: data.gameId || 'unknown',
    p_game_round: String(data.gpid),
    p_metadata: metadata,
    p_gems_awarded: gemsAwarded,
    p_status: status
  });

  if (updateErr) {
    throw new Error(`Balance update failed: ${updateErr.message}`);
  }

  const result = Array.isArray(updateRes) ? updateRes[0] : updateRes;
  
  if (!result?.success) {
    throw new Error(`Balance update rejected: ${result?.error || 'unknown_error'}`);
  }

  console.log(`[WORKER-${requestId}] ✅ Balance updated: ${result.balance} lamports (status: ${status})`);
  
  // Add small delay to ensure DB commit completes before pubsub (only for completed transactions)
  if (status === 'completed') {
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Publish balance update for real-time cache sync
    try {
      await redis.publish(pubsubChannel, JSON.stringify({ 
        username: data.username, 
        balance: result.balance, 
        timestamp: data.timestamp || Date.now() // provide logical timestamp for freshness check
      }));
      console.log(`[WORKER-${requestId}] 📡 Published balance update via pubsub`);
    } catch (pubsubErr) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to publish balance update:`, pubsubErr);
      // Don't throw here - pubsub failure shouldn't fail the transaction
    }

    // Invalidate user caches to reflect new bets/wins immediately
    try {
      const achievementsCacheKey = `user-achievements:${data.username}`;
      await redis.del(achievementsCacheKey);
      
      // Also invalidate user-bets cache (for different limits)
      const pattern = `user-bets:${data.username}:*`;
      const keys = await redis.keys(pattern);
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
      
      console.log(`[WORKER-${requestId}] 🗑️ Invalidated user caches for immediate update`);
    } catch (cacheInvalidateErr) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to invalidate user caches:`, cacheInvalidateErr);
    }

    // Update Redis cache for immediate UI access
    try {
      const cacheKey = `user:balance:${data.username}`;
      const tsKey = `user:balance_ts:${data.username}`;

      // Use the logical timestamp that originated with the API payload if present,
      // otherwise fall back to "now". This preserves the original ordering the API saw.
      const currentTs = data.timestamp || Date.now();

      // Read existing timestamp – if it is newer, skip the write to avoid clobbering.
      const existingTsRaw = await redis.get(tsKey);
      const existingTs = existingTsRaw ? Number(existingTsRaw) : null;

      if (!existingTs || currentTs > existingTs) {
        // Pipeline the cache writes into one network round-trip
        const workerCachePipe = redis.pipeline();
        workerCachePipe.set(cacheKey, result.balance, { ex: 300 });     // Single cache with 5 minutes TTL
        workerCachePipe.set(tsKey, currentTs, { ex: 300 });             // Companion timestamp key
        await workerCachePipe.exec();
        console.log(`[WORKER-${requestId}] ✅ Pipelined Redis cache update (ts: ${currentTs})`);
      } else {
        console.log(`[WORKER-${requestId}] ⏩ Skipped cache write – newer timestamp exists (${existingTs} >= ${currentTs})`);
      }
    } catch (cacheErr) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to update Redis cache:`, cacheErr);
    }
  }

  return { balance: result.balance };
}

// Circuit breaker state
let circuitBreakerActive = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

// Enhanced circuit breaker logic
async function checkCircuitBreaker() {
  // Check if circuit breaker should be disabled
  const pauseUntil = await redis.get("queue:pause");
  if (pauseUntil && Date.now() < parseInt(pauseUntil)) {
    circuitBreakerActive = true;
    const remainingMs = parseInt(pauseUntil) - Date.now();
    console.log(`⏸️ Circuit breaker active for ${Math.ceil(remainingMs / 1000)}s more`);
    return true;
  } else if (pauseUntil) {
    // Circuit breaker timeout expired, reset
    await redis.del("queue:pause");
    circuitBreakerActive = false;
    consecutiveFailures = 0;
    console.log("🔄 Circuit breaker reset - resuming queue processing");
  }
  return circuitBreakerActive;
}

async function handleCircuitBreakerFailure(error) {
  consecutiveFailures++;
  console.error(`❌ Failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}: ${error.message}`);
  
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    const pauseUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
    await redis.set("queue:pause", pauseUntil.toString());
    circuitBreakerActive = true;
    consecutiveFailures = 0;
    
    console.error(`🚨 CIRCUIT BREAKER ACTIVATED - Queue paused for ${CIRCUIT_BREAKER_TIMEOUT/1000}s`);
    console.error(`🚨 Reason: ${consecutiveFailures} consecutive failures`);
    
    // Alert mechanism (could integrate with Discord/Slack webhook)
    await alertOperators(`Circuit breaker activated: ${error.message}`);
  }
}

async function handleCircuitBreakerSuccess() {
  if (consecutiveFailures > 0) {
    console.log(`✅ Success after ${consecutiveFailures} failures - resetting counter`);
    consecutiveFailures = 0;
  }
}

async function alertOperators(message) {
  // Simple logging for now - in production you'd send to Discord/Slack
  console.error(`🚨 OPERATOR ALERT: ${message}`);
  
  // Store alert in Redis for monitoring dashboard
  await redis.lpush("alerts", JSON.stringify({
    timestamp: new Date().toISOString(),
    message,
    severity: "critical"
  }));
  await redis.ltrim("alerts", 0, 99); // Keep last 100 alerts
}

// Helper function to create memo instruction
function createMemoInstruction(requestId) {
  return new TransactionInstruction({
    keys: [],
    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: Buffer.from(requestId, 'utf-8'),
  });
}

// Process a single balance adjustment job
async function processBalanceAdjustment(jobData) {
  const { id: requestId, payload } = jobData;
  
  console.log(`[WORKER-${requestId}] 🔄 Processing job...`);
  
  try {
    // Handle payload - it might be a string or already parsed object
    const requestData = typeof payload === 'string' ? JSON.parse(payload) : payload;
    
    // Check for new provider job format first
    if (requestData.amountUsd !== undefined) {
      console.log(`[WORKER-${requestId}] 🎮 Provider job - type: ${requestData.type}, amount: $${requestData.amountUsd}`);
      await handleProviderJob(requestData, requestId);
      await handleCircuitBreakerSuccess();
      console.log(`[WORKER-${requestId}] ✅ Provider job completed successfully`);
      return;
    }
    
    // Check if this is the new job format (from queueWorkerJob)
    if (requestData.username && requestData.stakeLamports !== undefined) {
      // New format: { type, username, stakeLamports, payoutLamports?, requestId, timestamp }
      const { type, username, stakeLamports, payoutLamports } = requestData;
      
      console.log(`[WORKER-${requestId}] 🆕 New job format - type: ${type}, username: ${username}, stake: ${stakeLamports}`);
      
      // Get user vault info
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('smart_vault, wallet_address')
        .eq('username', username)
        .single();
      
      if (userError || !userData?.smart_vault) {
        throw new Error(`User vault not found for username: ${username}`);
      }
      
      const userVaultPDA = new anchor.web3.PublicKey(userData.smart_vault);
      
      // Execute the appropriate transaction type
      if (type === 'credit_win') {
        await executeAtomicSettlement(
          userVaultPDA, 
          0, // stake = 0 (no stake)
          stakeLamports, // payout = amount
          requestId, 
          requestData.betId || requestData.uniqid || 'unknown', // betId from request data
          requestData.gameId || 0 // gameId already extracted in payload
        );
      } else if (type === 'debit_loss') {
        await executeAtomicSettlement(
          userVaultPDA, 
          stakeLamports, // stake = amount (loss amount)
          0, // payout = 0 (no payout for loss)
          requestId, 
          requestData.betId || requestData.uniqid || 'unknown', // betId from request data
          requestData.gameId || 0 // gameId already extracted in payload
        );
      } else if (type === 'bet_settle') {
        const newFormatSettlementResult = await executeAtomicSettlement(
          userVaultPDA, 
          stakeLamports, 
          payoutLamports, 
          requestId, 
          requestData.betId || requestData.uniqid || 'unknown', // betId from request data
          requestData.gameId || 0 // gameId already extracted in payload
        );
      } else {
        throw new Error(`Unknown job type: ${type}`);
      }
      
    } else {
      // Old format: { login, type, gpid, amount, ... }
      console.log(`[WORKER-${requestId}] 📰 Old job format - processing legacy job`);
      
      // Validate legacy job structure
      if (!requestData.login || !requestData.type) {
        console.warn(`[WORKER-${requestId}] ⚠️ Malformed legacy job - missing required fields:`, {
          hasLogin: !!requestData.login,
          hasType: !!requestData.type,
          payload: requestData
        });
        // Skip this malformed job
        return;
      }
      
      // Extract username from login
      const username = extractUsername(requestData.login);
      if (!username) {
        console.warn(`[WORKER-${requestId}] ⚠️ Could not extract username from login: ${requestData.login}`);
        // Skip this malformed job
        return;
      }
      
      // Get user vault info
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('smart_vault, wallet_address')
        .eq('username', username)
        .single();
      
      if (userError || !userData?.smart_vault) {
        console.warn(`[WORKER-${requestId}] ⚠️ User vault not found for username: ${username}`);
        // Skip this job - user might not exist yet
        return;
      }
      
      const userVaultPDA = new anchor.web3.PublicKey(userData.smart_vault);
      
      // Determine transaction type and execute
      if (requestData.type === 'bet') {
        // For bets, we just store the stake - no on-chain call needed
        console.log(`[WORKER-${requestId}] 📝 Legacy bet processed (stake-only)`);
        return;
      }
      
      if (requestData.type === 'win') {
        // Check if this is a bonus win or regular win
        const stakeKey = `stake:${username}:${requestData.gpid}`;
        const stakeData = await redis.get(stakeKey);
        
        if (stakeData) {
          // Regular win - atomic settlement
          const stake = parseInt(stakeData);
          const payout = Math.round(Math.abs(parseFloat(requestData.amount)) * 1e9 / 146.7); // Convert USD to lamports
          
          const legacySettlementResult = await executeAtomicSettlement(
            userVaultPDA, 
            stake, 
            payout, 
            requestId, 
            requestData.uniqid || requestData.id || 'unknown', // betId from request data
            requestData.gameId || 0 // gameId already extracted in payload
          );
          
          // Clean up stake cache
          await redis.del(stakeKey);
        } else {
          // Bonus win - credit win
          const amount = Math.round(Math.abs(parseFloat(requestData.amount)) * 1e9 / 146.7);
          await executeAtomicSettlement(
            userVaultPDA, 
            0, // stake = 0 (no stake)
            amount, // payout = bonus amount
            requestId, 
            requestData.uniqid || requestData.id || 'unknown', // betId from request data
            requestData.gameId || 0 // gameId already extracted in payload
          );
        }
      }
    }
    
    // Reset circuit breaker on success
    await handleCircuitBreakerSuccess();
    
    console.log(`[WORKER-${requestId}] ✅ Job completed successfully`);
    
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Job failed:`, error);
    
    // Increment failure counter
    await handleCircuitBreakerFailure(error);
    
    throw error; // Re-throw to leave job in stream for retry
  }
}

// Convert gem data from object format to array format required by contract
function convertGemDataToArray(gemObject) {
  if (!gemObject || typeof gemObject !== 'object') {
    return [0, 0, 0, 0, 0, 0, 0]; // Default: no gems
  }
  
  return [
    gemObject.garnet || 0,
    gemObject.amethyst || 0,
    gemObject.topaz || 0,
    gemObject.sapphire || 0,
    gemObject.emerald || 0,
    gemObject.ruby || 0,
    gemObject.diamond || 0
  ];
}

// Add transaction to blockchain queue instead of executing immediately
async function addToBlockchainQueue(username, stakeAmount, payoutAmount, betId, gameId, gemData, requestId) {
  try {
    // Get user vault PDA
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('smart_vault')
      .eq('username', username)
      .single();

    if (userError || !userData?.smart_vault) {
      throw new Error(`User vault not found for username: ${username}`);
    }

    // Convert gem data to array format
    const gemDataArray = convertGemDataToArray(gemData);

    // Add to blockchain queue using the RPC function
    const { data: queueResult, error: queueError } = await supabase.rpc('add_to_blockchain_queue', {
      p_bet_id: betId,
      p_username: username,
      p_user_vault_pda: userData.smart_vault,
      p_stake_lamports: stakeAmount,
      p_payout_lamports: payoutAmount,
      p_game_id: parseInt(gameId) || 0,
      p_game_round: betId, // Use betId as game_round for now
      p_gem_data: gemDataArray,
      p_metadata: {
        request_id: requestId,
        added_at: new Date().toISOString()
      }
    });

    if (queueError) {
      throw new Error(`Failed to add to blockchain queue: ${queueError.message}`);
    }

    console.log(`[WORKER-${requestId}] ✅ Added to blockchain queue: ${queueResult} (stake: ${stakeAmount}, payout: ${payoutAmount})`);
    return queueResult; // Returns the queue ID
    
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Failed to add to blockchain queue:`, error);
    throw error;
  }
}

// Execute single blockchain transaction using betAndSettle
async function executeSingleBlockchainTransaction(transactionData, requestId) {
  const { username, user_vault_pda, stake_lamports, payout_lamports, bet_id, game_id, gem_data } = transactionData;
  
  console.log(`[WORKER-${requestId}] ⚡ Executing single betAndSettle - stake: ${stake_lamports}, payout: ${payout_lamports}, betId: ${bet_id}, gameId: ${game_id}`);
  
  // Using manual instruction building instead of Anchor program
  
  // Validate parameters
  if (stake_lamports < 0 || payout_lamports < 0) {
    throw new Error('Stake and payout must be non-negative');
  }
  if (!bet_id || typeof bet_id !== 'string') {
    throw new Error('betId must be a non-empty string');
  }
  if (!game_id || game_id <= 0) {
    throw new Error('gameId must be positive');
  }
  if (!Array.isArray(gem_data) || gem_data.length !== 7) {
    throw new Error('gem_data must be array of 7 integers');
  }
  
  const userVaultPDA = new anchor.web3.PublicKey(user_vault_pda);
  
  const startTime = Date.now();
  
  // Build manual bet and settle transaction
  const betSettleData = createBetAndSettleInstructionData(stake_lamports, payout_lamports, bet_id, game_id);
  
  const betSettleIx = new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: userVaultPDA, isSigner: false, isWritable: true },
      { pubkey: houseVaultPDA, isSigner: false, isWritable: true },
      { pubkey: systemKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: pauseConfigPDA, isSigner: false, isWritable: false },
    ],
    programId: SMART_VAULT_PROGRAM_ID,
    data: betSettleData,
  });
  
  const transaction = new anchor.web3.Transaction().add(betSettleIx);
  const tx = await anchor.web3.sendAndConfirmTransaction(provider.connection, transaction, [systemKeypair]);
  
  const processingTime = Date.now() - startTime;
  
  console.log(`[WORKER-${requestId}] ✅ Single betAndSettle tx: ${tx} (${processingTime}ms)`);
  
                return {
    signature: tx,
    processingTime
  };
}

// Execute batch blockchain transactions using batchSettle
async function executeBatchBlockchainTransactions(transactionsData, requestId) {
  console.log(`[WORKER-${requestId}] ⚡ Executing batchSettle for ${transactionsData.length} transactions`);
  
  // Using manual instruction building instead of Anchor program
  
  if (transactionsData.length === 0 || transactionsData.length > 10) {
    throw new Error('Batch size must be between 1 and 10');
  }
  
  // Prepare batch data
  const stakes = [];
  const payouts = [];
  const betIds = [];
  const gameIds = [];
  const gemDatas = [];
  const userVaultPDAs = [];
  
  for (const tx of transactionsData) {
    // Validate each transaction
    if (tx.stake_lamports < 0 || tx.payout_lamports < 0) {
      throw new Error(`Invalid amounts for bet ${tx.bet_id}: stake=${tx.stake_lamports}, payout=${tx.payout_lamports}`);
    }
    if (!Array.isArray(tx.gem_data) || tx.gem_data.length !== 7) {
      throw new Error(`Invalid gem_data for bet ${tx.bet_id}: must be array of 7 integers`);
    }
    
    stakes.push(tx.stake_lamports);
    payouts.push(tx.payout_lamports);
    betIds.push(tx.bet_id);
    gameIds.push(tx.game_id);
    gemDatas.push(tx.gem_data);
    userVaultPDAs.push({
      pubkey: new anchor.web3.PublicKey(tx.user_vault_pda),
      isWritable: true,
      isSigner: false
    });
  }
  
  const startTime = Date.now();
  
  // Build manual batch settle transaction
  const batchSettleData = createBatchSettleInstructionData(stakes, payouts, betIds, gameIds, gemDatas);
  
  const accounts = [
    { pubkey: houseVaultPDA, isSigner: false, isWritable: true },
    { pubkey: systemKeypair.publicKey, isSigner: true, isWritable: false },
    { pubkey: pauseConfigPDA, isSigner: false, isWritable: false },
    ...userVaultPDAs.map(vault => ({ pubkey: vault.pubkey, isSigner: false, isWritable: true }))
  ];
  
  const batchSettleIx = new anchor.web3.TransactionInstruction({
    keys: accounts,
    programId: SMART_VAULT_PROGRAM_ID,
    data: batchSettleData,
  });
  
  const transaction = new anchor.web3.Transaction().add(batchSettleIx);
  const tx = await anchor.web3.sendAndConfirmTransaction(provider.connection, transaction, [systemKeypair]);
  
  const processingTime = Date.now() - startTime;
  
  console.log(`[WORKER-${requestId}] ✅ Batch settle tx: ${tx} (${processingTime}ms, ${transactionsData.length} transactions)`);
  
  return {
    signature: tx,
    processingTime
  };
}

// Execute immediate atomic settlement (for cancellations and special cases)
async function executeAtomicSettlement(userVaultPDA, stakeAmount, payoutAmount, requestId, betId, gameId, gemData = null) {
  console.log(`[WORKER-${requestId}] ⚡ Executing immediate atomic settlement - stake: ${stakeAmount}, payout: ${payoutAmount}, betId: ${betId}, gameId: ${gameId}`);
  
  // Using manual instruction building instead of Anchor program
  
  // Validate parameters
  if (stakeAmount < 0 || payoutAmount < 0) {
    throw new Error('Stake and payout must be non-negative');
  }
  if (!betId || typeof betId !== 'string') {
    throw new Error('betId must be a non-empty string');
  }
  if (!gameId || gameId <= 0) {
    throw new Error('gameId must be positive');
  }
  
  // Convert gem data to array format
  const gemDataArray = convertGemDataToArray(gemData);
  
  const startTime = Date.now();
  
  // Build manual bet and settle transaction
  const betSettleData = createBetAndSettleInstructionData(stakeAmount, payoutAmount, betId, gameId);
  
  const betSettleIx = new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: userVaultPDA, isSigner: false, isWritable: true },
      { pubkey: houseVaultPDA, isSigner: false, isWritable: true },
      { pubkey: systemKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: pauseConfigPDA, isSigner: false, isWritable: false },
    ],
    programId: SMART_VAULT_PROGRAM_ID,
    data: betSettleData,
  });
  
  const transaction = new anchor.web3.Transaction().add(betSettleIx);
  const tx = await anchor.web3.sendAndConfirmTransaction(provider.connection, transaction, [systemKeypair]);
  
  const processingTime = Date.now() - startTime;
  
  console.log(`[WORKER-${requestId}] ✅ Immediate betAndSettle tx: ${tx} (${processingTime}ms)`);
  
  return {
    signature: tx,
    processingTime
  };
}

// Send Discord alert for house insufficient funds
async function sendHouseInsufficientAlert(data, payoutLamports, stakeLamports, requestId) {
  const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1401215152854007899/1jcn9xshKikrLuKOhcm3BK_Nv4-dH1-K0E9tc3pSFDRlvD5tySQ_1DCvh1eAl4Y9fcJp';
  
  try {
    const payoutSol = payoutLamports / 1000000000;
    const stakeSol = stakeLamports / 1000000000;
    const profitSol = payoutSol - stakeSol;
    
    const alertData = {
      content: null,
      embeds: [{
        title: "🚨 CRITICAL: House Vault Insufficient Funds",
        description: `**Transaction failed due to house vault having insufficient funds for payout.**\n\n**This requires immediate attention!**`,
        color: 15158332, // Red color
        fields: [
          {
            name: "📊 Transaction Details",
            value: `**User:** ${data.username}\n**Request ID:** ${requestId}\n**Game ID:** ${data.gameId || 'unknown'}`,
            inline: false
          },
          {
            name: "💰 Financial Impact",
            value: `**Stake:** ${stakeSol.toFixed(6)} SOL\n**Payout:** ${payoutSol.toFixed(6)} SOL\n**Profit:** ${profitSol.toFixed(6)} SOL`,
            inline: true
          },
          {
            name: "🎯 Action Required",
            value: `**• Fund house vault immediately**\n**• Review failed transactions in DB**\n**• Check type='failed' records**`,
            inline: true
          }
        ],
        footer: {
          text: `Casino Worker • ${new Date().toISOString()}`
        },
        timestamp: new Date().toISOString()
      }]
    };

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertData)
    });

    if (response.ok) {
      console.log(`[WORKER-${requestId}] 📢 House insufficient alert sent to Discord`);
    } else {
      const errorText = await response.text();
      console.error(`[WORKER-${requestId}] 📢 Discord house insufficient webhook failed:`, response.status, errorText);
    }
  } catch (error) {
    console.error(`[WORKER-${requestId}] 📢 House insufficient Discord notification error:`, error.message);
  }
}

// Calculate multiplier based on user level/VIP status
function calculateMultiplier(username, requestId) {
  // Default multiplier (100 = 1.0x) - no bonus for regular users
  let multiplier = 100;
  
  // TODO: Implement user level/VIP system
  // For now, use basic logic:
  
  // VIP usernames or special patterns get bonus multipliers
  if (username && typeof username === 'string' && username.length > 0) {
    const usernameLower = username.toLowerCase();
    if (usernameLower.includes('vip') || usernameLower.includes('premium')) {
      multiplier = 150; // 1.5x for VIP users
    } else if (usernameLower.includes('diamond') || usernameLower.includes('platinum')) {
      multiplier = 200; // 2.0x for diamond/platinum users
    }
    // TODO: Query database for actual user level/rank
    // const userLevel = await getUserLevel(username);
    // multiplier = calculateMultiplierByLevel(userLevel);
  }
  
  console.log(`[WORKER-${requestId}] 💎 Gem multiplier for ${username || 'unknown'}: ${multiplier / 100}x`);
  return multiplier;
}

// NEW: Backend gem calculation and awarding on BET operations
async function calculateAndAwardGemsOnBet(username, stakeAmount, multiplier, gpid, requestId) {
  console.log(`[WORKER-${requestId}] 💎 Calculating gems on BET for ${username}, stake: ${stakeAmount}, multiplier: ${multiplier}, gpid: ${gpid}`);
  
  try {
    // Get current user total_wagered BEFORE it gets updated by this bet
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('total_wagered')
      .eq('username', username)
      .single();

    if (userError || !userData) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to get user data for gem calculation:`, userError);
      return null;
    }

    const currentTotalWagered = userData.total_wagered || 0;
    // Calculate what total_wagered will be AFTER this bet (since updateUserBalance will add to it)
    const newTotalWagered = currentTotalWagered + stakeAmount;
    
    // Gem rolling threshold: 0.1 SOL = 100,000,000 lamports
    const GEM_THRESHOLD = 100_000_000;
    
    // Calculate how many gem rolls we should process
    const rollsBefore = Math.floor(currentTotalWagered / GEM_THRESHOLD);
    const rollsAfter = Math.floor(newTotalWagered / GEM_THRESHOLD);
    const newRolls = rollsAfter - rollsBefore;
    
    if (newRolls <= 0) {
      console.log(`[WORKER-${requestId}] 💎 No new gem rolls (${rollsBefore} -> ${rollsAfter})`);
      return null;
    }
    
    console.log(`[WORKER-${requestId}] 💎 Processing ${newRolls} gem rolls for ${username} (wagered: ${currentTotalWagered} -> ${newTotalWagered})`);
    
    // Process each roll
    const awardedGems = {};
    let totalGemsAwarded = 0;
    
    for (let roll = 0; roll < newRolls; roll++) {
      
      const rollSeed = `${username}:${rollsAfter - newRolls + roll}:${Date.now()}`;
      const rollHash = crypto.createHash('sha256').update(rollSeed).digest();
      const rollValue = rollHash.readUInt32BE(0) % 1000; // 0-999
      
      // Base award probability: 30% (300/1000)
      const baseAwardProb = 300;
      const effectiveAwardProb = Math.min(1000, (baseAwardProb * multiplier) / 100);
      const nothingProb = 1000 - effectiveAwardProb;
      
      if (rollValue < nothingProb) {
        continue; // No gem this roll
      }
      
      // Determine gem type based on rarity distribution (same logic as before)
      const awardRoll = rollValue - nothingProb;
      const normalizedRoll = (awardRoll * 1000) / effectiveAwardProb;
      
      let gemType;
      if (normalizedRoll < 500) gemType = 'garnet';
      else if (normalizedRoll < 767) gemType = 'amethyst';
      else if (normalizedRoll < 900) gemType = 'topaz';
      else if (normalizedRoll < 967) gemType = 'sapphire';
      else if (normalizedRoll < 990) gemType = 'emerald';
      else if (normalizedRoll < 997) gemType = 'ruby';
      else gemType = 'diamond';
      
      awardedGems[gemType] = (awardedGems[gemType] || 0) + 1;
      totalGemsAwarded++;
      
      console.log(`[WORKER-${requestId}] 💎 Roll ${roll + 1}: ${gemType} (roll: ${rollValue}, threshold: ${nothingProb})`);
    }
    
    if (totalGemsAwarded === 0) {
      console.log(`[WORKER-${requestId}] 💎 No gems awarded in ${newRolls} rolls`);
      return null;
    }
    
    console.log(`[WORKER-${requestId}] 💎 Awarded ${totalGemsAwarded} gems:`, awardedGems);
    
    const gemData = {
      username,
      gemsAwarded: awardedGems,
      totalGems: totalGemsAwarded,
      multiplierApplied: multiplier,
      rollsProcessed: newRolls,
      gpid: gpid
    };
    
    // Store gems in Redis for later retrieval by win operation
    const gemKey = `gems:${username}:${gpid}`;
    try {
      const gemDataJson = JSON.stringify(gemData);
      console.log(`[WORKER-${requestId}] 💎 Storing gem data:`, gemData);
      console.log(`[WORKER-${requestId}] 💎 Serialized to JSON:`, gemDataJson);
      await redis.set(gemKey, gemDataJson, { ex: 3600 }); // 1 hour TTL
      console.log(`[WORKER-${requestId}] 💎 Stored gems in Redis key: ${gemKey}`);
    } catch (redisError) {
      console.error(`[WORKER-${requestId}] ❌ Failed to store gems in Redis:`, redisError);
      // Continue anyway - we'll still return the gem data
    }
    
    return gemData;
    
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Error in calculateAndAwardGemsOnBet:`, error);
    throw error;
  }
}

// Retrieve gems for WIN operations (from Redis storage)
async function retrieveGemsForWin(gpid, requestId) {
  // Try to find gems for any username with this gpid
  // Since we don't have username in win operation easily, we'll scan for the key pattern
  const gemPattern = `gems:*:${gpid}`;
  
  try {
    console.log(`[WORKER-${requestId}] 💎 Looking for gems with pattern: ${gemPattern}`);
    const keys = await redis.keys(gemPattern);
    console.log(`[WORKER-${requestId}] 💎 Found ${keys.length} gem keys:`, keys);
    
    if (keys.length === 0) {
      console.log(`[WORKER-${requestId}] 💎 No gems found for gpid ${gpid}`);
      return null;
    }
    
    // Use the first matching key (should only be one per gpid)
    const gemKey = keys[0];
    console.log(`[WORKER-${requestId}] 💎 Retrieving gems from key: ${gemKey}`);
    const gemDataStr = await redis.get(gemKey);
    
    if (!gemDataStr) {
      console.log(`[WORKER-${requestId}] 💎 Gem key ${gemKey} expired or empty`);
      return null;
    }
    
    console.log(`[WORKER-${requestId}] 💎 Raw gem data from Redis:`, typeof gemDataStr, gemDataStr);
    
    // Handle case where data might not be JSON string
    let gemData;
    if (typeof gemDataStr === 'string') {
      try {
        gemData = JSON.parse(gemDataStr);
      } catch (parseError) {
        console.error(`[WORKER-${requestId}] ❌ JSON parse error:`, parseError);
        console.log(`[WORKER-${requestId}] 💎 Raw data that failed to parse:`, gemDataStr);
        return null;
      }
    } else {
      // If it's already an object, use it directly
      gemData = gemDataStr;
    }
    
    // Delete the key after retrieval to prevent duplicate usage
    await redis.del(gemKey);
    console.log(`[WORKER-${requestId}] 💎 Retrieved and deleted gem key: ${gemKey}`);
    
    return gemData;
    
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Error retrieving gems for gpid ${gpid}:`, error);
    return null;
  }
}

// LEGACY: Backend gem calculation and awarding (kept for reference)
async function calculateAndAwardGems(username, stakeAmount, multiplier, requestId) {
  console.log(`[WORKER-${requestId}] 💎 Calculating backend gems for ${username}, stake: ${stakeAmount}, multiplier: ${multiplier}`);
  
  try {
    // Get current user total_wagered to calculate accumulated wager
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('total_wagered')
      .eq('username', username)
      .single();

    if (userError || !userData) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to get user data for gem calculation:`, userError);
      return null;
    }

    const currentTotalWagered = userData.total_wagered || 0;
    const newTotalWagered = currentTotalWagered + stakeAmount;
    
    // Gem rolling threshold: 0.1 SOL = 100,000,000 lamports
    const GEM_THRESHOLD = 100_000_000;
    
    // Calculate how many gem rolls we should process
    const rollsBefore = Math.floor(currentTotalWagered / GEM_THRESHOLD);
    const rollsAfter = Math.floor(newTotalWagered / GEM_THRESHOLD);
    const newRolls = rollsAfter - rollsBefore;
    
    if (newRolls <= 0) {
      console.log(`[WORKER-${requestId}] 💎 No new gem rolls (${rollsBefore} -> ${rollsAfter})`);
      return null;
    }
    
    console.log(`[WORKER-${requestId}] 💎 Processing ${newRolls} gem rolls for ${username}`);
    
    // Process each roll
    const awardedGems = {};
    let totalGemsAwarded = 0;
    
    for (let roll = 0; roll < newRolls; roll++) {
      // Create deterministic but unpredictable seed for this roll
      const rollSeed = `${username}:${rollsAfter - newRolls + roll}:${Date.now()}`;
      const rollHash = crypto.createHash('sha256').update(rollSeed).digest();
      const rollValue = rollHash.readUInt32BE(0) % 1000; // 0-999
      
      // Base award probability: 30% (300/1000)
      const baseAwardProb = 300;
      const effectiveAwardProb = Math.min(1000, (baseAwardProb * multiplier) / 100);
      const nothingProb = 1000 - effectiveAwardProb;
      
      if (rollValue < nothingProb) {
        continue; // No gem this roll
      }
      
      // Determine gem type based on rarity distribution
      // Drop rates per 0.1 SOL (matching UI display):
      // Garnet: 15%
      // Amethyst: 8%
      // Topaz: 4%
      // Sapphire: 2%
      // Emerald: 0.7%
      // Ruby: 0.2%
      // Diamond: 0.1%
      // Total: 30% chance of getting a gem per roll
      
      const awardRoll = rollValue - nothingProb; // 0 to effectiveAwardProb-1
      const normalizedRoll = (awardRoll * 1000) / effectiveAwardProb; // Scale to 0-999
      
      // Calculate cumulative thresholds based on relative proportions within 30% award window
      // Garnet: 15/30 = 50% of awards (500/1000)
      // Amethyst: 8/30 = 26.67% of awards (267/1000) 
      // Topaz: 4/30 = 13.33% of awards (133/1000)
      // Sapphire: 2/30 = 6.67% of awards (67/1000)
      // Emerald: 0.7/30 = 2.33% of awards (23/1000)
      // Ruby: 0.2/30 = 0.67% of awards (7/1000)
      // Diamond: 0.1/30 = 0.33% of awards (3/1000)
      
      let gemType;
      if (normalizedRoll < 500) gemType = 'garnet';         // 15% (50% of 30%)
      else if (normalizedRoll < 767) gemType = 'amethyst';  // 8% (26.67% of 30%)
      else if (normalizedRoll < 900) gemType = 'topaz';     // 4% (13.33% of 30%)
      else if (normalizedRoll < 967) gemType = 'sapphire';  // 2% (6.67% of 30%)
      else if (normalizedRoll < 990) gemType = 'emerald';   // 0.7% (2.33% of 30%)
      else if (normalizedRoll < 997) gemType = 'ruby';      // 0.2% (0.67% of 30%)
      else gemType = 'diamond';                             // 0.1% (0.33% of 30%)
      
      awardedGems[gemType] = (awardedGems[gemType] || 0) + 1;
      totalGemsAwarded++;
      
      console.log(`[WORKER-${requestId}] 💎 Roll ${roll + 1}: ${gemType} (roll: ${rollValue}, threshold: ${nothingProb})`);
    }
    
    if (totalGemsAwarded === 0) {
      console.log(`[WORKER-${requestId}] 💎 No gems awarded in ${newRolls} rolls`);
      return null;
    }
    
    console.log(`[WORKER-${requestId}] 💎 Awarded ${totalGemsAwarded} gems:`, awardedGems);
    
    return {
      username,
      gemsAwarded: awardedGems,
      totalGems: totalGemsAwarded,
      multiplierApplied: multiplier,
      rollsProcessed: newRolls
    };
    
  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Error in calculateAndAwardGems:`, error);
    throw error;
  }
}

// Process referral gem bonuses
async function processReferralGemBonuses(username, awardedGems, requestId) {
  console.log(`[WORKER-${requestId}] 💎 Processing referral gem bonuses for user: ${username}`);
  
  try {
    // 1. Get the user's referral information
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('referral')
      .eq('username', username)
      .single();

    if (userError) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to fetch user referral data:`, userError);
      return;
    }

    if (!userData?.referral) {
      console.log(`[WORKER-${requestId}] 💎 No referrer found for user ${username}`);
      return;
    }

    console.log(`[WORKER-${requestId}] 👥 Found referrer for ${username}: ${userData.referral}`);

    // 2. Get referrer's username
    const { data: referrerData, error: referrerError } = await supabase
      .from('users')
      .select('username')
      .eq('wallet_address', userData.referral)
      .single();

    if (referrerError || !referrerData) {
      console.warn(`[WORKER-${requestId}] ⚠️ Failed to find referrer user data:`, referrerError);
      return;
    }

    const referrerUsername = referrerData.username;
    console.log(`[WORKER-${requestId}] 👥 Referrer username: ${referrerUsername}`);

    // 3. Process each gem type with 15% chance
    const referralGemsAwarded = {};
    const REFERRAL_CHANCE = 0.15; // 15% chance

    for (const [gemType, count] of Object.entries(awardedGems)) {
      if (count > 0) {
        let referralGems = 0;
        
        // For each gem awarded, roll for referral bonus
        for (let i = 0; i < count; i++) {
          const random = Math.random();
          if (random < REFERRAL_CHANCE) {
            referralGems++;
          }
        }

        if (referralGems > 0) {
          referralGemsAwarded[gemType] = referralGems;
          console.log(`[WORKER-${requestId}] 🎁 Awarding ${referralGems}x ${gemType} to referrer ${referrerUsername}`);
        }
      }
    }

    // 4. If any referral gems were awarded, update the referrer's gem counts
    if (Object.keys(referralGemsAwarded).length > 0) {
      console.log(`[WORKER-${requestId}] 💎 Updating referrer gems:`, referralGemsAwarded);

      // Update each gem type for the referrer
      for (const [gemType, count] of Object.entries(referralGemsAwarded)) {
        const { error: updateError } = await supabase.rpc('update_user_gems', {
          p_username: referrerUsername,
          p_gem_type: gemType,
          p_amount: count
        });

        if (updateError) {
          console.error(`[WORKER-${requestId}] ❌ Failed to update ${gemType} for referrer ${referrerUsername}:`, updateError);
        } else {
          console.log(`[WORKER-${requestId}] ✅ Added ${count}x ${gemType} to referrer ${referrerUsername}`);
        }
      }

      // Invalidate referrer's gem cache
      try {
        await gemCollection.invalidateGemCache(referrerUsername);
        console.log(`[WORKER-${requestId}] 🗑️ Invalidated gem cache for referrer ${referrerUsername}`);
      } catch (cacheError) {
        console.warn(`[WORKER-${requestId}] ⚠️ Failed to invalidate referrer gem cache:`, cacheError);
      }

      const totalReferralGems = Object.values(referralGemsAwarded).reduce((sum, count) => sum + count, 0);
      console.log(`[WORKER-${requestId}] 🎉 Successfully awarded ${totalReferralGems} referral gems to ${referrerUsername}`);
    } else {
      console.log(`[WORKER-${requestId}] 🎲 No referral gems awarded this time (15% chance per gem)`);
    }

  } catch (error) {
    console.error(`[WORKER-${requestId}] ❌ Error processing referral gem bonuses:`, error);
    throw error;
  }
}

// Worker configuration
const WORKER_ID = process.env.FLY_MACHINE_ID || `worker-${Math.random().toString(36).substr(2, 9)}`;
const STREAM_NAME = "balance_adj";

console.log(`🔧 Worker ID: ${WORKER_ID}`);

// Worker processes messages using XRANGE and XDEL

// Main worker loop with simple stream reading
async function startWorker() {
  console.log("🔄 Worker loop started, waiting for jobs...");
  
  while (true) {
    try {
      // Check circuit breaker
      if (await checkCircuitBreaker()) {
        console.log("⏸️ Circuit breaker active, waiting...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      // Use XRANGE to read messages from the stream
      const messages = await redis.xrange(STREAM_NAME, "-", "+", "COUNT", 1);

      // Handle Upstash Redis format - messages is an object with message IDs as keys
      const messageIds = Object.keys(messages || {});
      if (messageIds.length === 0) {
        // No messages available – sleep briefly then poll again
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      // Get the first message
      const messageId = messageIds[0];
      const messageData = messages[messageId];

      if (!messageData) {
        console.log("⚠️ Invalid message data, skipping...");
        await redis.xdel(STREAM_NAME, messageId);
        continue;
      }

      // The message data is already an object with fields
      const rawFields = messageData;

      // rawFields is already an object from Upstash Redis
      let messageObj = rawFields;

      // attach message id into object so downstream has it
      messageObj.id = messageId;

      if (!messageObj.payload) {
        console.log("⚠️ Message missing payload field, skipping...");
        await redis.xdel(STREAM_NAME, messageId);
        continue;
      }

      try {
        console.log(`📨 Processing message ${messageId}`);

        await processBalanceAdjustment(messageObj);

        await redis.xdel(STREAM_NAME, messageId);
        await updateWorkerStats("processed");
        console.log(`✅ Successfully processed message ${messageId}`);

      } catch (error) {
        console.error(`❌ Failed to process message ${messageId}:`, error);
        await moveToDeadLetterQueue(messageId, messageObj, error);
        await redis.xdel(STREAM_NAME, messageId);
        await updateWorkerStats("failed");
      }
      
    } catch (error) {
      console.error("❌ Worker loop error:", error);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying
    }
  }
}

// Dead letter queue implementation

async function moveToDeadLetterQueue(messageId, messageData, error) {
  try {
    const deadLetterData = {
      original_message_id: messageId || "unknown",
      original_data: JSON.stringify(messageData || {}),
      error_message: error?.message || "Unknown error",
      error_stack: error?.stack || "No stack trace",
      failed_at: new Date().toISOString(),
      worker_id: WORKER_ID
    };
    
    // Add to dead letter queue using object format for Upstash Redis
    await redis.xadd("balance_adj_dlq", "*", deadLetterData);
    
    console.error(`☠️ Moved poison message ${messageId} to dead letter queue`);
    
    // Alert operators about poison message
    await alertOperators(`Poison message moved to DLQ: ${messageId} - ${error.message}`);
    
  } catch (dlqError) {
    console.error("❌ Failed to move message to dead letter queue:", dlqError);
  }
}

// Worker statistics tracking
async function updateWorkerStats(type) {
  const timestamp = Date.now();
  const minute = Math.floor(timestamp / 60000) * 60000; // Round to minute
  
  try {
    // Pipeline all worker stats updates into one network round-trip
    const statsPipe = redis.pipeline();
    statsPipe.hincrby(`worker_stats:${WORKER_ID}`, `${type}_count`, 1);
    statsPipe.hincrby(`worker_stats:${WORKER_ID}`, `${type}_minute_${minute}`, 1);
    statsPipe.hset(`worker_stats:${WORKER_ID}`, "last_activity", timestamp);
    statsPipe.expire(`worker_stats:${WORKER_ID}`, 86400); // 24 hours
    statsPipe.hincrby("global_worker_stats", `${type}_total`, 1);
    statsPipe.hincrby("global_worker_stats", `${type}_minute_${minute}`, 1);
    await statsPipe.exec();
    
  } catch (error) {
    console.error("Error updating worker stats:", error);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  stopQueueProcessor();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  stopQueueProcessor();
  process.exit(0);
});

// Health check server
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      worker: WORKER_ID,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

healthServer.listen(3000, () => {
  console.log('🏥 Health check server listening on port 3000');
});

// ============================================================================
// BLOCKCHAIN QUEUE PROCESSING SYSTEM
// ============================================================================

// Queue processing state
let queueProcessorRunning = false;
let queueProcessorTimer = null;

// Process blockchain queue (called every 10 seconds or when 10+ transactions)
async function processBlockchainQueue() {
  if (queueProcessorRunning) {
    console.log('🔄 Queue processor already running, skipping...');
    return;
  }
  
  queueProcessorRunning = true;
  
  try {
    // Get pending transactions
    const { data: pendingTxs, error: fetchError } = await supabase.rpc('get_pending_blockchain_transactions', {
      p_limit: 10
    });
    
    if (fetchError) {
      console.error('❌ Failed to fetch pending transactions:', fetchError);
      return;
    }
    
    if (!pendingTxs || pendingTxs.length === 0) {
      // console.log('📭 No pending blockchain transactions');
      return;
    }
    
    console.log(`📦 Processing ${pendingTxs.length} blockchain transactions`);
    
    // Mark transactions as processing
    const transactionIds = pendingTxs.map(tx => tx.id);
    const betIds = pendingTxs.map(tx => tx.bet_id);
    
    const { error: markError } = await supabase.rpc('mark_transactions_processing', {
      p_transaction_ids: transactionIds
    });
    
    if (markError) {
      console.error('❌ Failed to mark transactions as processing:', markError);
      return;
    }
    
    let result;
    const batchId = crypto.randomUUID();
    
    try {
      if (pendingTxs.length === 1) {
        // Single transaction - use betAndSettle
        console.log('⚡ Processing single transaction with betAndSettle');
        result = await executeSingleBlockchainTransaction(pendingTxs[0], 'QUEUE-PROCESSOR');
        
        // Record success
        await supabase.rpc('record_blockchain_success', {
          p_bet_ids: [pendingTxs[0].bet_id],
          p_blockchain_hash: result.signature,
          p_transaction_type: 'single',
          p_batch_id: null,
          p_processing_time_ms: result.processingTime
        });
        
      } else {
        // Multiple transactions - use batchSettle
        console.log(`⚡ Processing ${pendingTxs.length} transactions with batchSettle`);
        result = await executeBatchBlockchainTransactions(pendingTxs, 'QUEUE-PROCESSOR');
        
        // Record success
        await supabase.rpc('record_blockchain_success', {
          p_bet_ids: betIds,
          p_blockchain_hash: result.signature,
          p_transaction_type: 'batch',
          p_batch_id: batchId,
          p_processing_time_ms: result.processingTime
        });
      }
      
      console.log(`✅ Successfully processed ${pendingTxs.length} transactions: ${result.signature}`);
      
    } catch (blockchainError) {
      console.error('❌ Blockchain transaction failed:', blockchainError);
      
      // Mark transactions as failed
      const errorMessage = blockchainError.message || 'Unknown blockchain error';
      await supabase.rpc('mark_blockchain_transaction_failed', {
        p_bet_ids: betIds,
        p_error_message: errorMessage
      });
      
      console.log(`⏰ Transactions marked as failed, will retry after 60 seconds`);
    }
    
  } catch (error) {
    console.error('❌ Queue processor error:', error);
  } finally {
    queueProcessorRunning = false;
  }
}

// Start queue processing timer (10 second intervals, reset after each process)
function startQueueProcessor() {
  console.log('🔄 Starting blockchain queue processor...');
  
  function scheduleNextProcess() {
    queueProcessorTimer = setTimeout(async () => {
      await processBlockchainQueue();
      scheduleNextProcess(); // Reset timer after processing
    }, 10000); // 10 seconds
  }
  
  scheduleNextProcess();
}

// Stop queue processor
function stopQueueProcessor() {
  if (queueProcessorTimer) {
    clearTimeout(queueProcessorTimer);
    queueProcessorTimer = null;
    console.log('⏹️ Blockchain queue processor stopped');
  }
}

// Manual queue processing trigger (for when queue reaches 10 items)
async function triggerQueueProcessing() {
  console.log('🚀 Manually triggering queue processing due to queue size');
  
  // Cancel current timer and process immediately
  if (queueProcessorTimer) {
    clearTimeout(queueProcessorTimer);
  }
  
  await processBlockchainQueue();
  
  // Restart timer after manual processing
  startQueueProcessor();
}

// ============================================================================
// STARTUP
// ============================================================================

// Start the worker
startWorker().catch(error => {
  console.error('💥 Worker startup failed:', error);
  process.exit(1);
});

// Start the blockchain queue processor
startQueueProcessor();