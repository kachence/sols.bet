import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import * as anchor from '@coral-xyz/anchor';

// Development logging helper
const isDev = process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet');
const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};
const devWarn = (...args: any[]) => {
  if (isDev) console.warn(...args);
};
const devError = (...args: any[]) => {
  if (isDev) console.error(...args);
};

export function useSmartVault() {
  const walletAdapter = useWallet();
  const { publicKey, connected } = walletAdapter;
  const [needsVault, setNeedsVault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  
  // Transaction locks to prevent duplicate submissions
  const [activeDepositTx, setActiveDepositTx] = useState<string | null>(null);
  const [activeWithdrawTx, setActiveWithdrawTx] = useState<string | null>(null);
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);

  // Constants – replace with real program details in production
  const SMART_VAULT_PROGRAM_ID = new anchor.web3.PublicKey('3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg');
  const SMART_VAULT_IDL = {
    "version": "0.1.0",
    "name": "smart_vault",
    "instructions": [
      {
        "name": "initializeVault",
        "accounts": [
          { "name": "vault", "isMut": true, "isSigner": false },
          { "name": "user", "isMut": true, "isSigner": true },
          { "name": "systemProgram", "isMut": false, "isSigner": false }
        ],
        "args": []
      },
      {
        "name": "deposit",
        "accounts": [
          { "name": "vault", "isMut": true, "isSigner": false },
          { "name": "owner", "isMut": true, "isSigner": true },
          { "name": "user", "isMut": true, "isSigner": false },
          { "name": "pauseConfig", "isMut": false, "isSigner": false },
          { "name": "systemProgram", "isMut": false, "isSigner": false }
        ],
        "args": [{ "name": "amount", "type": "u64" }]
      },
      {
        "name": "withdraw",
        "accounts": [
          { "name": "vault", "isMut": true, "isSigner": false },
          { "name": "owner", "isMut": true, "isSigner": true },
          { "name": "pauseConfig", "isMut": false, "isSigner": false },
          { "name": "systemProgram", "isMut": false, "isSigner": false }
        ],
        "args": [{ "name": "amount", "type": "u64" }]
      }
    ],
    "accounts": [
      {
        "name": "UserVault",
        "type": {
          "kind": "struct",
          "fields": [
            { "name": "owner", "type": "publicKey" },
            { "name": "balance", "type": "u64" },
            { "name": "lockedAmount", "type": "u64" },
            { "name": "activeGames", "type": "u32" }
          ]
        }
      }
    ]
  } as anchor.Idl;

  const { connection } = useConnection();

  useEffect(() => {
    if (!publicKey) return;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`https://casino-worker-v2.fly.dev/user-smart-vault?walletAddress=${publicKey.toBase58()}`);
        const data = await res.json();
        if (res.ok) {
          setNeedsVault(data.smart_vault === null);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchStatus();
  }, [publicKey]);

  const activateVault = async () => {
    if (!publicKey) return false;
    setLoading(true);
    try {
      console.log('🔧 Starting vault activation for:', publicKey.toBase58());
      
      // 1. Check wallet balance first
      const balance = await connection.getBalance(publicKey);
      console.log('💰 Wallet balance:', balance / 1e9, 'SOL');
      
      if (balance < 0.01 * 1e9) { // Less than 0.01 SOL
        console.error('❌ Insufficient SOL for transaction fees. Need at least 0.01 SOL');
        throw new Error('Insufficient SOL for transaction fees. Please add some SOL to your wallet.');
      }

      // 2. On-chain initialize vault
      console.log('⚡ Creating Anchor provider...');
      const provider = new anchor.AnchorProvider(connection, walletAdapter as any, { commitment: 'finalized' });
      anchor.setProvider(provider);
      
      console.log('📜 Loading smart contract...');
      const program = new anchor.Program(SMART_VAULT_IDL, SMART_VAULT_PROGRAM_ID, provider);

      const [userVault] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), publicKey.toBuffer()],
        program.programId,
      );

      console.log('🏛️ User vault PDA:', userVault.toBase58());
      console.log('🔗 Program ID:', SMART_VAULT_PROGRAM_ID.toBase58());

      // 3. Check if program exists
      try {
        const programAccount = await connection.getAccountInfo(SMART_VAULT_PROGRAM_ID);
        if (!programAccount) {
          console.error('❌ Smart contract not found on this network');
          throw new Error('Smart contract not deployed on this network. Please contact support.');
        }
        console.log('✅ Smart contract found on network');
      } catch (err) {
        console.error('❌ Error checking smart contract:', err);
        throw new Error('Failed to verify smart contract deployment');
      }

      console.log('📝 Building initialize vault transaction...');
      
      // Build transaction manually to ensure finalized commitment
      const transaction = await program.methods.initializeVault()
        .accounts({
        vault: userVault,
        user: publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        })
        .transaction();

      // Get fresh blockhash with finalized commitment
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      console.log('📝 Signing transaction with blockhash:', blockhash.substring(0, 8) + '...');

      // Sign and send the transaction manually to ensure finalized commitment
      const signedTransaction = await walletAdapter.signTransaction!(transaction);
      console.log('📡 Sending transaction to network...');
      
      const txSignature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'finalized'
      });

      console.log('⏳ Waiting for finalized confirmation. TX:', txSignature);

      // Wait for confirmation with finalized commitment
      await connection.confirmTransaction({
        signature: txSignature,
        blockhash,
        lastValidBlockHeight
      }, 'finalized');
      
      console.log('✅ Vault created with finalized confirmation! TX:', txSignature);

      // 4. Mark in DB
      console.log('💾 Updating database...');
              const res = await fetch('https://casino-worker-v2.fly.dev/user-smart-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey.toBase58(), vaultAddress: userVault.toBase58() }),
      });

      if (res.ok) {
        console.log('✅ Vault activation complete!');
        setNeedsVault(false);
        setVaultAddress(userVault.toBase58());
        return true;
      } else {
        console.error('❌ Database update failed:', await res.text());
        throw new Error('Vault created on-chain but database update failed');
      }
    } catch (e) {
      console.error('❌ Vault activation failed:', e);
      
      // Provide user-friendly error messages
      const errorMessage = (e as Error)?.message || String(e);
      if (errorMessage.includes('insufficient funds')) {
        throw new Error('Insufficient SOL for transaction fees. Please add some SOL to your wallet.');
      } else if (errorMessage.includes('Program account does not exist')) {
        throw new Error('Smart contract not deployed on this network. Please contact support.');
      } else if (errorMessage.includes('Transaction simulation failed')) {
        throw new Error('Transaction simulation failed. The smart contract may not be properly deployed.');
      }
      
      throw e;
    } finally {
      setLoading(false);
    }
    return false;
  };

  const depositToVault = async (lamports: number) => {
    if (!publicKey) return false;
    
    // Create unique transaction ID for this attempt
    const txId = `deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Prevent duplicate submissions
    if (activeDepositTx) {
      devWarn(`[${txId}] Deposit already in progress: ${activeDepositTx}`);
      return false;
    }
    
    setActiveDepositTx(txId);
    setDepositLoading(true);
    devLog(`[${txId}] Starting deposit transaction...`);
    
    try {
      let transactionSucceeded = false;
      let finalTransactionSignature = '';
      let finalVaultPubkey: anchor.web3.PublicKey | undefined;
      // Get user's smart vault address from database
      let vaultPubkey: anchor.web3.PublicKey | undefined;
      
      if (vaultAddress) {
        vaultPubkey = new anchor.web3.PublicKey(vaultAddress);
      } else {
        // Fetch vault address from database
        const res = await fetch(`https://casino-worker-v2.fly.dev/user-smart-vault?walletAddress=${publicKey.toBase58()}`);
        const data = await res.json();
        
        if (data.smart_vault) {
          vaultPubkey = new anchor.web3.PublicKey(data.smart_vault);
          setVaultAddress(data.smart_vault);
        } else {
          // Fallback to PDA derivation
          const [userVault] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), publicKey.toBuffer()],
            SMART_VAULT_PROGRAM_ID,
          );
          vaultPubkey = userVault;
        }
      }

      const provider = new anchor.AnchorProvider(connection, walletAdapter as any, { 
        commitment: 'finalized',
        preflightCommitment: 'finalized'
      });
      anchor.setProvider(provider);
      const program = new anchor.Program(SMART_VAULT_IDL, SMART_VAULT_PROGRAM_ID, provider);

      // Derive pause config PDA
      const [pauseConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pause_config")],
        SMART_VAULT_PROGRAM_ID
      );

      // Create a unique transaction with fresh blockhash to prevent duplication
      const transaction = await program.methods.deposit(new anchor.BN(lamports)).accounts({
        vault: vaultPubkey,
        owner: publicKey,
        user: publicKey,
        pauseConfig: pauseConfigPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).transaction();

      // Add a small random delay to prevent rapid successive transactions
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

      // Add unique memo instruction to make transaction truly unique
      const uniqueData = `deposit:${txId}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      const memoInstruction = new anchor.web3.TransactionInstruction({
        keys: [],
        programId: new anchor.web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(uniqueData, 'utf-8')
      });
      transaction.add(memoInstruction);

      // Get fresh blockhash with finalized commitment
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = publicKey;

      devLog(`[${txId}] Signing transaction with blockhash: ${blockhash.substring(0, 8)}...`);

      // Sign and send the transaction manually to ensure uniqueness
      const signedTransaction = await walletAdapter.signTransaction!(transaction);
      devLog(`[${txId}] Sending transaction to network...`);
      
      const transactionSignature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'finalized'
      });

      devLog(`[${txId}] Transaction sent, signature: ${transactionSignature}`);

      // Wait for confirmation with finalized commitment
      await connection.confirmTransaction({
        signature: transactionSignature,
        blockhash,
        lastValidBlockHeight
      }, 'finalized');

      devLog(`[${txId}] ✅ Deposit transaction confirmed, signature: ${transactionSignature}`);

        // Mark transaction as successful and store data for database update
        transactionSucceeded = true;
        finalTransactionSignature = transactionSignature;
        finalVaultPubkey = vaultPubkey;
      // CRITICAL: Only update database if blockchain transaction actually succeeded
      if (transactionSucceeded && finalTransactionSignature && finalVaultPubkey) {
          devLog(`[${txId}] 🔄 Starting balance update after successful deposit...`);
        try {
          const walletAddress = publicKey.toBase58();
          const transactionId = txId;
          
          devLog(`[${txId}] 💰 Deposit details:`, {
            lamports,
            solAmount: lamports / 1e9,
            walletAddress,
            transactionId,
            vaultAddress: finalVaultPubkey.toBase58(),
            transactionSignature: finalTransactionSignature
          });

          const updateRes = await fetch('https://casino-worker-v2.fly.dev/balance/deposit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              walletAddress,
              amountLamports: lamports,
              transactionId,
              vaultAddress: finalVaultPubkey.toBase58(),
              transactionHash: finalTransactionSignature,
              currency: 'SOL'
            })
          });

          devLog(`[${txId}] 📨 Deposit API response status:`, updateRes.status);
          
          const responseData = await updateRes.json();
          devLog(`[${txId}] 📨 Deposit API response:`, responseData);

          if (!updateRes.ok || !responseData.success) {
            devWarn(`[${txId}] ❌ Failed to update balance in database after deposit:`, responseData.error);
            // Don't throw here - the on-chain transaction succeeded, database sync can be fixed later
          } else {
            devLog(`[${txId}] ✅ Successfully updated balance after deposit:`, {
              newBalance: responseData.balance,
              newBalanceUsd: responseData.balanceUsd
            });
          }
        } catch (balanceError) {
          devError(`[${txId}] ❌ Error updating balance after deposit:`, balanceError);
          // Don't fail the whole operation if balance update fails - on-chain transaction succeeded
        }

      return true;
      } else {
        devError(`[${txId}] ❌ CRITICAL: No successful deposit transaction - DATABASE WILL NOT BE UPDATED`);
        devLog(`[${txId}] Transaction success status:`, { transactionSucceeded, hasSignature: !!finalTransactionSignature, hasVault: !!finalVaultPubkey });
        return false;
      }
    } catch (e) {
      devError(`[${txId}] Deposit error:`, e);
      
      // Log specific error types to help debug
      if ((e as any)?.message?.includes('InsufficientFunds')) {
        devError(`[${txId}] ❌ INSUFFICIENT FUNDS ERROR - transaction SHOULD NOT update database`);
      }
      if ((e as any)?.message?.includes('Simulation failed')) {
        devError(`[${txId}] ❌ SIMULATION FAILED - transaction SHOULD NOT update database`);
      }
      
      return false;
    } finally {
      setActiveDepositTx(null);
      setDepositLoading(false);
    }
  };

  const withdrawFromVault = async (lamports: number) => {
    if (!publicKey) return false;
    
    // Create unique transaction ID for this attempt
    const txId = `withdraw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Prevent duplicate submissions
    if (activeWithdrawTx) {
      devWarn(`[${txId}] Withdrawal already in progress: ${activeWithdrawTx}`);
      return false;
    }
    
    setActiveWithdrawTx(txId);
    setWithdrawLoading(true);
    devLog(`[${txId}] Starting withdrawal transaction...`);
    
    let attempts = 0;
    const maxAttempts = 3;
    
    try {
      let transactionSucceeded = false;
      let finalTransactionSignature = '';
      let finalVaultPubkey: anchor.web3.PublicKey | undefined;
      
      while (attempts < maxAttempts && !transactionSucceeded) {
        attempts++;
        try {
        // Get user's smart vault address from database
        let vaultPubkey: anchor.web3.PublicKey | undefined;
        
        if (vaultAddress) {
          vaultPubkey = new anchor.web3.PublicKey(vaultAddress);
        } else {
          // Fetch vault address from database
          const res = await fetch(`https://casino-worker-v2.fly.dev/user-smart-vault?walletAddress=${publicKey.toBase58()}`);
          const data = await res.json();
          
          if (data.smart_vault) {
            vaultPubkey = new anchor.web3.PublicKey(data.smart_vault);
            setVaultAddress(data.smart_vault);
          } else {
            // Fallback to PDA derivation
            const [userVault] = anchor.web3.PublicKey.findProgramAddressSync(
              [Buffer.from('vault'), publicKey.toBuffer()],
              SMART_VAULT_PROGRAM_ID,
            );
            vaultPubkey = userVault;
          }
        }

        const provider = new anchor.AnchorProvider(connection, walletAdapter as any, { 
          commitment: 'finalized',
          preflightCommitment: 'finalized'
        });
        anchor.setProvider(provider);
        const program = new anchor.Program(SMART_VAULT_IDL, SMART_VAULT_PROGRAM_ID, provider);

        // Derive pause config PDA
        const [pauseConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("pause_config")],
          SMART_VAULT_PROGRAM_ID
        );

        // Build transaction with unique nonce to make each attempt truly unique
        const nonce = Date.now() + Math.random() * 1000000; // Unique per attempt
        const transaction = await program.methods.withdraw(new anchor.BN(lamports)).accounts({
          vault: vaultPubkey,
          owner: publicKey,
          pauseConfig: pauseConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).transaction();

        // Add unique memo instruction with attempt number
        const uniqueData = `withdraw:${txId}:${nonce}:${attempts}`;
        const memoInstruction = new anchor.web3.TransactionInstruction({
          keys: [],
          programId: new anchor.web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
          data: Buffer.from(uniqueData, 'utf-8')
        });
        transaction.add(memoInstruction);

        // Fresh blockhash with 'finalized' commitment
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
        
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = publicKey;

        devLog(`[${txId}] Attempt ${attempts}: Signing transaction with blockhash: ${blockhash.substring(0, 8)}...`);

        // Sign and send the transaction manually to ensure uniqueness
        const signedTransaction = await walletAdapter.signTransaction!(transaction);
        devLog(`[${txId}] Sending transaction to network...`);
        
        const transactionSignature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'finalized'
        });

        devLog(`[${txId}] Transaction sent, signature: ${transactionSignature}`);

        // Wait for confirmation with 'finalized' commitment
        await connection.confirmTransaction({
          signature: transactionSignature,
          blockhash,
          lastValidBlockHeight
        }, 'finalized');

        devLog(`[${txId}] ✅ Withdrawal transaction confirmed, signature: ${transactionSignature}`);

        // Mark transaction as successful and store data for database update
        transactionSucceeded = true;
        finalTransactionSignature = transactionSignature;
        finalVaultPubkey = vaultPubkey;
        break; // Exit the retry loop on success
        } catch (e: any) {
          devError(`[${txId}] Withdrawal attempt ${attempts} error:`, e);
          
          // Log specific error types to help debug
          if (e?.message?.includes('InsufficientFunds')) {
            devError(`[${txId}] ❌ INSUFFICIENT FUNDS ERROR - transaction SHOULD NOT update database`);
          }
          if (e?.message?.includes('Simulation failed')) {
            devError(`[${txId}] ❌ SIMULATION FAILED - transaction SHOULD NOT update database`);
          }
          
          // Check if it's the specific "already been processed" error and retry
          if (e?.message?.includes('already been processed') && attempts < maxAttempts) {
            devLog(`[${txId}] Retrying due to duplicate error... (attempt ${attempts + 1}/${maxAttempts})`);
            await new Promise(r => setTimeout(r, 500 * attempts)); // Exponential backoff
            continue;
          }
          
          // For other errors or max attempts reached, break out of the retry loop
          devError(`[${txId}] Final withdrawal error after ${attempts} attempts:`, e);
          break;
        }
      }
      
      // CRITICAL: Only update database if blockchain transaction actually succeeded
      if (transactionSucceeded && finalTransactionSignature && finalVaultPubkey) {
          devLog(`[${txId}] 🔄 Starting balance update after successful withdrawal...`);
        try {
          const walletAddress = publicKey.toBase58();
          const transactionId = txId;
          
          devLog(`[${txId}] 💸 Withdrawal details:`, {
            lamports,
            solAmount: lamports / 1e9,
            walletAddress,
            transactionId,
            vaultAddress: finalVaultPubkey.toBase58(),
            transactionSignature: finalTransactionSignature
          });

          const updateRes = await fetch('https://casino-worker-v2.fly.dev/balance/withdraw', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              walletAddress,
              amountLamports: lamports,
              transactionId,
              vaultAddress: finalVaultPubkey.toBase58(),
              transactionHash: finalTransactionSignature,
              currency: 'SOL'
            })
          });

          devLog(`[${txId}] 📨 Withdrawal API response status:`, updateRes.status);
          
          const responseData = await updateRes.json();
          devLog(`[${txId}] 📨 Withdrawal API response:`, responseData);

          if (!updateRes.ok || !responseData.success) {
            devWarn(`[${txId}] ❌ Failed to update balance in database after withdrawal:`, responseData.error);
            // Don't throw here - the on-chain transaction succeeded, database sync can be fixed later
          } else {
            devLog(`[${txId}] ✅ Successfully updated balance after withdrawal:`, {
              newBalance: responseData.balance
            });
          }
        } catch (balanceError) {
          devError(`[${txId}] ❌ Error updating balance after withdrawal:`, balanceError);
          // Don't fail the whole operation if balance update fails - on-chain transaction succeeded
        }

          return true;
      } else {
        devError(`[${txId}] ❌ No successful transaction to update balance for`);
        return false;
      }
    } finally {
      // Clean up state regardless of success or failure
      setActiveWithdrawTx(null);
      setWithdrawLoading(false);
    }
  };

  return { 
    needsVault, 
    activateVault, 
    loading, 
    depositToVault, 
    depositLoading, 
    withdrawFromVault, 
    withdrawLoading,
    isDepositActive: !!activeDepositTx,
    isWithdrawActive: !!activeWithdrawTx,
    vaultAddress
  };
} 