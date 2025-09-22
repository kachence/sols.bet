#!/usr/bin/env ts-node

/**
 * Smart Vault V2 Testing - Test 11: Real Devnet Transactions
 * 
 * ⚠️  WARNING: This script performs ACTUAL transactions on devnet!
 * 
 * This test:
 * - Uses real SOL from your funded wallets  
 * - Makes real blockchain transactions
 * - Creates actual vault PDAs on devnet
 * - Tests real deposit/withdrawal operations
 * 
 * What it does:
 * 1. Loads wallets from wallets.json (created by Phase 0)
 * 2. Connects to the deployed Smart Vault V2 contract on devnet
 * 3. Initializes user vaults for each wallet (if not exists)
 * 4. Performs real deposits to vault PDAs
 * 5. Performs real withdrawals to reach target balances
 * 6. Verifies all operations were successful
 * 
 * Prerequisites:
 * - All test wallets must be funded (0.1 SOL each recommended)
 * - Smart Vault V2 contract deployed at: 3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg
 * 
 * Usage: npm run test-11-real
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

interface WalletData {
    programId: string;
    multisigAuthority: string;
    adminAuthority: string;
    createdAt: string;
    wallets: {
        name: string;
        publicKey: string;
        secretKey: number[];
        vaultPda: string;
        vaultBump: number;
        targetBalance: number;
    }[];
}

interface TestWallet {
    keypair: Keypair;
    vaultPda: PublicKey;
    vaultBump: number;
    targetBalance: number;
    name: string;
}

// Smart Vault V2 IDL (based on actual deployed contract)
const SMART_VAULT_IDL = {
    "version": "0.1.0",
    "name": "smart_vault_v2",
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
                { "name": "owner", "isMut": false, "isSigner": true },
                { "name": "user", "isMut": true, "isSigner": true },
                { "name": "systemProgram", "isMut": false, "isSigner": false }
            ],
            "args": [
                { "name": "amount", "type": "u64" }
            ]
        },
        {
            "name": "withdraw",
            "accounts": [
                { "name": "vault", "isMut": true, "isSigner": false },
                { "name": "owner", "isMut": true, "isSigner": true }
            ],
            "args": [
                { "name": "amount", "type": "u64" }
            ]
        }
    ],
    "accounts": [
        {
            "name": "UserVault",
            "type": {
                "kind": "struct",
                "fields": [
                    { "name": "owner", "type": "publicKey" },
                    { "name": "bump", "type": "u8" },
                    { "name": "lockedAmount", "type": "u64" },
                    { "name": "activeGames", "type": "u32" },
                    { "name": "accumWager", "type": "u64" },
                    { "name": "version", "type": "u8" }
                ]
            }
        }
    ]
};

class RealTransactionTester {
    private connection: Connection;
    private program!: anchor.Program;
    private testWallets: TestWallet[] = [];
    private programId: PublicKey;
    private multisigAuthority: PublicKey;
    private adminAuthority: PublicKey;
    private results: { [key: string]: any } = {};

    constructor() {
        this.connection = new Connection("https://api.devnet.solana.com", "confirmed");
        // Will be initialized after loading wallet data
        this.programId = PublicKey.default;
        this.multisigAuthority = PublicKey.default;
        this.adminAuthority = PublicKey.default;
    }

    async run() {
        console.log("🚀 Starting Smart Vault V2 - Test 11: Real Devnet Transactions\n");
        console.log("⚠️  WARNING: This will perform REAL transactions on devnet!");
        console.log("   Make sure your wallets are funded with sufficient SOL.\n");

        try {
            await this.step1_loadWallets();
            await this.step2_setupProgram();
            await this.step3_verifyBalances();
            await this.step4_initializeVaults();
            await this.step5_performDeposits();
            await this.step6_performWithdrawals();
            await this.step7_verifyFinalState();
            
            console.log("\n✅ Test 11 Complete - Real Transactions Executed!");
            this.printSummary();
            
        } catch (error) {
            console.error("❌ Real transaction test failed:", error);
            throw error;
        }
    }

    private async step1_loadWallets() {
        console.log("📂 Step 1: Loading wallets from wallets.json...");
        
        const walletsFilePath = path.join(__dirname, 'wallets.json');
        
        if (!fs.existsSync(walletsFilePath)) {
            throw new Error("❌ wallets.json not found! Please run Phase 0 first");
        }
        
        const walletData: WalletData = JSON.parse(fs.readFileSync(walletsFilePath, 'utf8'));
        
        // Load program configuration
        this.programId = new PublicKey(walletData.programId);
        this.multisigAuthority = new PublicKey(walletData.multisigAuthority);
        this.adminAuthority = new PublicKey(walletData.adminAuthority);
        
        console.log(`   Program ID: ${this.programId.toBase58()}`);
        console.log(`   Multisig Authority: ${this.multisigAuthority.toBase58()}`);
        console.log(`   Admin Authority: ${this.adminAuthority.toBase58()}`);
        
        // Convert wallet data to TestWallet objects
        this.testWallets = walletData.wallets.map(w => ({
            keypair: Keypair.fromSecretKey(new Uint8Array(w.secretKey)),
            vaultPda: new PublicKey(w.vaultPda),
            vaultBump: w.vaultBump,
            targetBalance: w.targetBalance,
            name: w.name
        }));
        
        console.log(`   ✅ Loaded ${this.testWallets.length} test wallets\n`);
    }

    private async step2_setupProgram() {
        console.log("⚙️  Step 2: Setting up Anchor program connection...");
        
        try {
            // Create a temporary provider just to verify the program exists
            // We'll create individual providers for each transaction
            const tempProvider = new anchor.AnchorProvider(
                this.connection,
                new anchor.Wallet(this.testWallets[0].keypair),
                { commitment: "confirmed" }
            );
            
            // Create program instance (we'll update provider per transaction)
            this.program = new anchor.Program(SMART_VAULT_IDL as any, this.programId, tempProvider);
            
            console.log(`   ✅ Program connected: ${this.programId.toBase58()}`);
            
            // Verify program exists
            const programInfo = await this.connection.getAccountInfo(this.programId);
            if (!programInfo) {
                throw new Error("Program not found on devnet!");
            }
            
            console.log(`   ✅ Program verified on devnet (${programInfo.data.length} bytes)\n`);
            
        } catch (error) {
            console.error("   ❌ Failed to setup program:", error);
            throw error;
        }
    }

    // Helper method to create a program instance with the correct wallet
    private getProgramWithWallet(wallet: TestWallet): anchor.Program {
        const provider = new anchor.AnchorProvider(
            this.connection,
            new anchor.Wallet(wallet.keypair),
            { commitment: "confirmed" }
        );
        
        return new anchor.Program(SMART_VAULT_IDL as any, this.programId, provider);
    }

    private async step3_verifyBalances() {
        console.log("💰 Step 3: Verifying wallet balances before operations...");
        
        let totalBalance = 0;
        let readyWallets = 0;
        
        for (const wallet of this.testWallets) {
            const balance = await this.connection.getBalance(wallet.keypair.publicKey);
            const balanceSOL = balance / LAMPORTS_PER_SOL;
            totalBalance += balanceSOL;
            
            const minRequired = wallet.targetBalance + 0.05; // Include extra for fees
            const ready = balanceSOL >= minRequired;
            
            if (ready) readyWallets++;
            
            console.log(`   ${wallet.name}:`);
            console.log(`      Balance: ${balanceSOL.toFixed(6)} SOL`);
            console.log(`      Required: ${minRequired.toFixed(6)} SOL`);
            console.log(`      Status: ${ready ? '✅ Ready' : '❌ Insufficient'}`);
            
            this.results[wallet.name] = {
                initialBalance: balanceSOL,
                required: minRequired,
                ready: ready
            };
        }
        
        console.log(`\n   Summary: ${readyWallets}/${this.testWallets.length} wallets ready`);
        console.log(`   Total balance: ${totalBalance.toFixed(3)} SOL\n`);
        
        if (readyWallets === 0) {
            throw new Error("No wallets have sufficient balance for testing!");
        }
    }

    private async step4_initializeVaults() {
        console.log("🏦 Step 4: Initializing user vaults with real transactions...");
        
        let successful = 0;
        let failed = 0;
        
        for (const wallet of this.testWallets) {
            try {
                console.log(`   ${wallet.name}: Initializing vault...`);
                
                // Check if vault already exists
                try {
                    const programWithWallet = this.getProgramWithWallet(wallet);
                    const existingVault = await programWithWallet.account.userVault.fetch(wallet.vaultPda);
                    console.log(`      ⚠️  Vault already exists, skipping initialization`);
                    this.results[wallet.name].vaultExists = true;
                    successful++;
                    continue;
                } catch (error) {
                    // Vault doesn't exist, proceed with initialization
                }
                
                // Create initialize transaction with the correct wallet
                const programWithWallet = this.getProgramWithWallet(wallet);
                const tx = await programWithWallet.methods
                    .initializeVault()
                    .accounts({
                        vault: wallet.vaultPda,
                        user: wallet.keypair.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                
                console.log(`      ✅ Vault initialized! Tx: ${tx}`);
                this.results[wallet.name].initTx = tx;
                this.results[wallet.name].vaultInitialized = true;
                successful++;
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.log(`      ❌ Failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
                this.results[wallet.name].initError = error instanceof Error ? error.message : String(error);
                failed++;
            }
        }
        
        console.log(`\n   Vault Initialization: ${successful} successful, ${failed} failed\n`);
    }

    private async step5_performDeposits() {
        console.log("💳 Step 5: Performing real deposit transactions...");
        
        let successful = 0;
        let failed = 0;
        
        for (const wallet of this.testWallets) {
            try {
                const depositAmount = wallet.targetBalance + 0.02; // Target + buffer
                const depositLamports = Math.floor(depositAmount * LAMPORTS_PER_SOL);
                
                console.log(`   ${wallet.name}: Depositing ${depositAmount} SOL...`);
                
                // Check wallet balance
                const balance = await this.connection.getBalance(wallet.keypair.publicKey);
                if (balance < depositLamports + 0.01 * LAMPORTS_PER_SOL) {
                    throw new Error("Insufficient balance for deposit + fees");
                }
                
                // Create deposit transaction with the correct wallet
                const programWithWallet = this.getProgramWithWallet(wallet);
                const tx = await programWithWallet.methods
                    .deposit(new anchor.BN(depositLamports))
                    .accounts({
                        vault: wallet.vaultPda,
                        owner: wallet.keypair.publicKey,
                        user: wallet.keypair.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                
                console.log(`      ✅ Deposited ${depositAmount} SOL! Tx: ${tx}`);
                this.results[wallet.name].depositTx = tx;
                this.results[wallet.name].depositAmount = depositAmount;
                successful++;
                
                // Verify vault balance (check PDA lamports, not account fields)
                const vaultBalance = await this.connection.getBalance(wallet.vaultPda);
                const vaultBalanceSOL = vaultBalance / LAMPORTS_PER_SOL;
                console.log(`      💰 Vault balance: ${vaultBalanceSOL.toFixed(6)} SOL`);
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1500));
                
            } catch (error) {
                console.log(`      ❌ Failed to deposit: ${error instanceof Error ? error.message : String(error)}`);
                this.results[wallet.name].depositError = error instanceof Error ? error.message : String(error);
                failed++;
            }
        }
        
        console.log(`\n   Deposits: ${successful} successful, ${failed} failed\n`);
    }

    private async step6_performWithdrawals() {
        console.log("💸 Step 6: Performing real withdrawal transactions...");
        
        let successful = 0;
        let failed = 0;
        
        for (const wallet of this.testWallets) {
            try {
                // Get current vault balance (from PDA lamports, not account data)
                const currentVaultBalance = await this.connection.getBalance(wallet.vaultPda);
                const targetLamports = Math.floor(wallet.targetBalance * LAMPORTS_PER_SOL);
                
                // Account for rent exemption (minimum balance ~2.5M lamports for account)
                const rentExemption = 2500000; // Approximate rent exemption for UserVault account
                const minWithdrawThreshold = targetLamports + rentExemption;
                
                if (currentVaultBalance <= minWithdrawThreshold) {
                    console.log(`   ${wallet.name}: Vault balance already at target, skipping withdrawal`);
                    this.results[wallet.name].withdrawalSkipped = true;
                    successful++;
                    continue;
                }
                
                const withdrawalLamports = currentVaultBalance - minWithdrawThreshold;
                const withdrawalSOL = withdrawalLamports / LAMPORTS_PER_SOL;
                
                console.log(`   ${wallet.name}: Withdrawing ${withdrawalSOL.toFixed(6)} SOL...`);
                console.log(`      Current vault: ${(currentVaultBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
                console.log(`      Target vault: ${wallet.targetBalance} SOL`);
                
                // Create withdrawal transaction with the correct wallet
                const programWithWallet = this.getProgramWithWallet(wallet);
                const tx = await programWithWallet.methods
                    .withdraw(new anchor.BN(withdrawalLamports))
                    .accounts({
                        vault: wallet.vaultPda,
                        owner: wallet.keypair.publicKey,
                    })
                    .rpc();
                
                console.log(`      ✅ Withdrew ${withdrawalSOL.toFixed(6)} SOL! Tx: ${tx}`);
                this.results[wallet.name].withdrawTx = tx;
                this.results[wallet.name].withdrawAmount = withdrawalSOL;
                successful++;
                
                // Verify final vault balance
                const finalVaultBalance = await this.connection.getBalance(wallet.vaultPda);
                const finalVaultBalanceSOL = finalVaultBalance / LAMPORTS_PER_SOL;
                console.log(`      💰 Final vault balance: ${finalVaultBalanceSOL.toFixed(6)} SOL`);
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1500));
                
            } catch (error) {
                console.log(`      ❌ Failed to withdraw: ${error instanceof Error ? error.message : String(error)}`);
                this.results[wallet.name].withdrawError = error instanceof Error ? error.message : String(error);
                failed++;
            }
        }
        
        console.log(`\n   Withdrawals: ${successful} successful, ${failed} failed\n`);
    }

    private async step7_verifyFinalState() {
        console.log("🔍 Step 7: Verifying final state after all transactions...");
        
        let totalWalletBalance = 0;
        let totalVaultBalance = 0;
        
        for (const wallet of this.testWallets) {
            try {
                // Get wallet balance
                const walletBalance = await this.connection.getBalance(wallet.keypair.publicKey);
                const walletBalanceSOL = walletBalance / LAMPORTS_PER_SOL;
                totalWalletBalance += walletBalanceSOL;
                
                // Get vault balance
                let vaultBalanceSOL = 0;
                try {
                    const vaultBalance = await this.connection.getBalance(wallet.vaultPda);
                    vaultBalanceSOL = vaultBalance / LAMPORTS_PER_SOL;
                    totalVaultBalance += vaultBalanceSOL;
                } catch (error) {
                    console.log(`      ⚠️  Could not fetch vault balance`);
                }
                
                const targetMet = Math.abs(vaultBalanceSOL - wallet.targetBalance) < 0.001;
                
                console.log(`   ${wallet.name}:`);
                console.log(`      Wallet: ${walletBalanceSOL.toFixed(6)} SOL`);
                console.log(`      Vault: ${vaultBalanceSOL.toFixed(6)} SOL`);
                console.log(`      Target: ${wallet.targetBalance} SOL`);
                console.log(`      Target Met: ${targetMet ? '✅' : '❌'}`);
                
                this.results[wallet.name].finalWalletBalance = walletBalanceSOL;
                this.results[wallet.name].finalVaultBalance = vaultBalanceSOL;
                this.results[wallet.name].targetMet = targetMet;
                
            } catch (error) {
                console.log(`   ❌ ${wallet.name}: Error checking final state: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        
        console.log(`\n   Total wallet balance: ${totalWalletBalance.toFixed(3)} SOL`);
        console.log(`   Total vault balance: ${totalVaultBalance.toFixed(3)} SOL`);
        console.log("   ✅ Final state verification complete\n");
    }

    private printSummary() {
        console.log("📊 TEST 11 SUMMARY - REAL DEVNET TRANSACTIONS");
        console.log("=".repeat(50));
        console.log(`✅ Program: ${this.programId.toBase58()}`);
        
        let vaultInits = 0;
        let deposits = 0;
        let withdrawals = 0;
        let targetsMet = 0;
        
        console.log("\n📋 Transaction Results:");
        this.testWallets.forEach((wallet) => {
            const result = this.results[wallet.name];
            console.log(`\n   ${wallet.name}:`);
            
            if (result.vaultInitialized || result.vaultExists) {
                console.log(`      ✅ Vault: ${result.vaultExists ? 'Already existed' : 'Initialized'}`);
                vaultInits++;
            }
            
            if (result.depositTx) {
                console.log(`      ✅ Deposit: ${result.depositAmount} SOL`);
                deposits++;
            }
            
            if (result.withdrawTx) {
                console.log(`      ✅ Withdraw: ${result.withdrawAmount.toFixed(6)} SOL`);
                withdrawals++;
            } else if (result.withdrawalSkipped) {
                console.log(`      ⏭️  Withdraw: Skipped (already at target)`);
                withdrawals++;
            }
            
            if (result.targetMet) {
                console.log(`      ✅ Target: ${wallet.targetBalance} SOL achieved`);
                targetsMet++;
            }
            
            // Show any errors
            if (result.initError) console.log(`      ❌ Init Error: ${result.initError}`);
            if (result.depositError) console.log(`      ❌ Deposit Error: ${result.depositError}`);
            if (result.withdrawError) console.log(`      ❌ Withdraw Error: ${result.withdrawError}`);
        });
        
        console.log("\n📈 Statistics:");
        console.log(`   Vault Initializations: ${vaultInits}/${this.testWallets.length}`);
        console.log(`   Successful Deposits: ${deposits}/${this.testWallets.length}`);
        console.log(`   Successful Withdrawals: ${withdrawals}/${this.testWallets.length}`);
        console.log(`   Targets Met: ${targetsMet}/${this.testWallets.length}`);
        
        if (targetsMet === this.testWallets.length) {
            console.log("\n🎉 ALL REAL TRANSACTIONS COMPLETED SUCCESSFULLY! 🚀");
            console.log("   Your Smart Vault V2 contract is working perfectly on devnet!");
        } else {
            console.log(`\n⚠️  ${this.testWallets.length - targetsMet} wallet(s) did not meet targets`);
            console.log("   Check the errors above and ensure sufficient funding");
        }
        
        console.log("\n💾 Full results saved to contract/tests/test-11-results.json");
        
        // Save detailed results
        const outputPath = path.join(__dirname, 'test-11-results.json');
        fs.writeFileSync(outputPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            programId: this.programId.toBase58(),
            results: this.results,
            statistics: { vaultInits, deposits, withdrawals, targetsMet, total: this.testWallets.length }
        }, null, 2));
    }
}

// Run the test if called directly
if (require.main === module) {
    const tester = new RealTransactionTester();
    
    tester.run()
        .then(() => {
            console.log("\n🎉 Test 11 (Real Transactions) completed!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Test 11 (Real Transactions) failed!");
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        });
}

export { RealTransactionTester };