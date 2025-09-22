#!/usr/bin/env ts-node

/**
 * Smart Vault V2 Testing - Phase 0: Wallet Setup & PDA Creation
 * 
 * This script:
 * - Creates 10 different test wallets
 * - Funds wallets from devnet faucet
 * - Derives vault PDAs for each wallet
 * - Verifies program deployment
 * - Saves wallet data to wallets.json for use in other phases
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Test configuration - ACTUAL DEPLOYED PROGRAM
const DEVNET_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg");
const MULTISIG_AUTHORITY = new PublicKey("BMprzPNF9FTni4mJWwCJnk91ZzhKdxGCx7BwPckMRzBt");
const ADMIN_AUTHORITY = new PublicKey("4y1oXmheqD5VNScoNwLH17WQQExXSxBasH6TTwCb4iN5");

interface TestWallet {
    name: string;
    keypair: Keypair;
    vaultPda: PublicKey;
    vaultBump: number;
    targetBalance: number; // Final balance in SOL for Phase 1 testing
}

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

class WalletSetupTester {
    private connection: Connection;
    private testWallets: TestWallet[] = [];

    constructor() {
        this.connection = new Connection(DEVNET_URL, "confirmed");
    }

    async run() {
        console.log("🔧 Starting Smart Vault V2 - Phase 0: Wallet Setup & PDA Creation");
        console.log(`📍 Program ID: ${PROGRAM_ID.toBase58()}`);
        console.log(`🔐 Multisig: ${MULTISIG_AUTHORITY.toBase58()}`);
        console.log(`👮 Admin: ${ADMIN_AUTHORITY.toBase58()}\n`);

        try {
            await this.step1_verifyProgram();
            await this.step2_createWallets();
            await this.step3_derivePDAs();
            await this.step4_fundWallets();
            await this.step5_verifySetup();
            await this.step6_saveWalletData();
            
            console.log("\n✅ Phase 0 Setup Complete!");
            this.printSummary();
            
        } catch (error) {
            console.error("❌ Setup failed:", error);
            throw error;
        }
    }

    private async step1_verifyProgram() {
        console.log("🔍 Step 1: Verifying deployed program...");
        
        try {
            const programAccount = await this.connection.getAccountInfo(PROGRAM_ID);
            
            if (!programAccount) {
                throw new Error(`Program not found at ${PROGRAM_ID.toBase58()}`);
            }
            
            if (!programAccount.executable) {
                throw new Error("Account is not executable");
            }
            
            console.log(`   ✅ Program verified: ${PROGRAM_ID.toBase58()}`);
            console.log(`   ✅ Program is executable: ${programAccount.executable}`);
            console.log(`   ✅ Program owner: ${programAccount.owner.toBase58()}`);
            console.log(`   ✅ Program data length: ${programAccount.data.length} bytes`);
            
        } catch (error) {
            console.log("   ❌ Program verification failed:", error instanceof Error ? error.message : String(error));
            throw error;
        }
        
        console.log();
    }

    private async step2_createWallets() {
        console.log("📝 Step 2: Creating 10 test wallets...");
        
        // Target balances for Phase 1 testing (0 to 0.7 SOL)
        const targetBalances = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.35, 0.15];
        
        for (let i = 0; i < 10; i++) {
            const keypair = Keypair.generate();
            
            const testWallet: TestWallet = {
                name: `Wallet_${i + 1}`,
                keypair,
                vaultPda: PublicKey.default, // Will be set in step 3
                vaultBump: 0,
                targetBalance: targetBalances[i]
            };
            
            this.testWallets.push(testWallet);
            
            console.log(`   ✅ ${testWallet.name}:`);
            console.log(`      Address: ${keypair.publicKey.toBase58()}`);
            console.log(`      Target Balance: ${targetBalances[i]} SOL`);
        }
        
        console.log(`\n   Created ${this.testWallets.length} test wallets\n`);
    }

    private async step3_derivePDAs() {
        console.log("🏦 Step 3: Deriving vault PDAs...");
        
        for (const wallet of this.testWallets) {
            // Derive vault PDA using the actual program ID
            const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), wallet.keypair.publicKey.toBuffer()],
                PROGRAM_ID
            );
            
            wallet.vaultPda = vaultPda;
            wallet.vaultBump = vaultBump;
            
            console.log(`   ✅ ${wallet.name}:`);
            console.log(`      Vault PDA: ${vaultPda.toBase58()}`);
            console.log(`      Vault Bump: ${vaultBump}`);
            
            // Check if PDA already exists
            try {
                const existingAccount = await this.connection.getAccountInfo(vaultPda);
                if (existingAccount) {
                    const balance = await this.connection.getBalance(vaultPda);
                    console.log(`      ⚠️  PDA already exists with ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
                } else {
                    console.log(`      📝 PDA not initialized yet`);
                }
            } catch (error) {
                console.log(`      ❌ Error checking PDA: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        
        console.log("\n   All vault PDAs derived\n");
    }

    private async step4_fundWallets() {
        console.log("💰 Step 4: Funding wallets from devnet faucet...");
        
        const fundingAmount = 1.5 * LAMPORTS_PER_SOL; // 1.5 SOL each
        
        for (const wallet of this.testWallets) {
            try {
                console.log(`   Funding ${wallet.name}...`);
                
                // Check current balance first
                const currentBalance = await this.connection.getBalance(wallet.keypair.publicKey);
                const currentSOL = currentBalance / LAMPORTS_PER_SOL;
                
                if (currentSOL >= 1.0) {
                    console.log(`   ✅ ${wallet.name}: Already funded (${currentSOL.toFixed(3)} SOL)`);
                    continue;
                }
                
                // Request airdrop
                const signature = await this.connection.requestAirdrop(
                    wallet.keypair.publicKey,
                    fundingAmount
                );
                
                // Wait for confirmation
                await this.connection.confirmTransaction(signature, "confirmed");
                
                // Verify balance
                const newBalance = await this.connection.getBalance(wallet.keypair.publicKey);
                const newBalanceSOL = newBalance / LAMPORTS_PER_SOL;
                
                console.log(`   ✅ ${wallet.name}: Funded with ${newBalanceSOL.toFixed(3)} SOL`);
                
                // Delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1500));
                
            } catch (error) {
                console.log(`   ⚠️  ${wallet.name}: Airdrop may have failed - ${error instanceof Error ? error.message : String(error)}`);
                
                // Check current balance anyway
                const balance = await this.connection.getBalance(wallet.keypair.publicKey);
                const balanceSOL = balance / LAMPORTS_PER_SOL;
                console.log(`      Current balance: ${balanceSOL.toFixed(3)} SOL`);
                
                if (balanceSOL < 0.1) {
                    console.log(`   ⚠️  ${wallet.name}: Low balance, may need manual funding`);
                }
            }
        }
        
        console.log("\n   Wallet funding complete\n");
    }

    private async step5_verifySetup() {
        console.log("🔍 Step 5: Verifying setup...");
        
        let totalBalance = 0;
        let fundedWallets = 0;
        
        for (const wallet of this.testWallets) {
            const balance = await this.connection.getBalance(wallet.keypair.publicKey);
            const balanceSOL = balance / LAMPORTS_PER_SOL;
            totalBalance += balanceSOL;
            
            if (balanceSOL >= 0.1) {
                fundedWallets++;
            }
            
            console.log(`   ${wallet.name}: ${balanceSOL.toFixed(6)} SOL ${balanceSOL >= 0.1 ? '✅' : '❌'}`);
        }
        
        console.log(`\n   Summary:`);
        console.log(`   Total wallets: ${this.testWallets.length}`);
        console.log(`   Funded wallets: ${fundedWallets}`);
        console.log(`   Total balance: ${totalBalance.toFixed(3)} SOL`);
        console.log(`   Ready for testing: ${fundedWallets === this.testWallets.length ? '✅' : '⚠️'}`);
        
        if (fundedWallets < this.testWallets.length) {
            console.log(`   ⚠️  ${this.testWallets.length - fundedWallets} wallets need manual funding`);
        }
        
        console.log();
    }

    private async step6_saveWalletData() {
        console.log("💾 Step 6: Saving wallet data...");
        
        const walletData: WalletData = {
            programId: PROGRAM_ID.toBase58(),
            multisigAuthority: MULTISIG_AUTHORITY.toBase58(),
            adminAuthority: ADMIN_AUTHORITY.toBase58(),
            createdAt: new Date().toISOString(),
            wallets: this.testWallets.map(w => ({
                name: w.name,
                publicKey: w.keypair.publicKey.toBase58(),
                secretKey: Array.from(w.keypair.secretKey),
                vaultPda: w.vaultPda.toBase58(),
                vaultBump: w.vaultBump,
                targetBalance: w.targetBalance
            }))
        };
        
        const outputPath = path.join(__dirname, 'wallets.json');
        fs.writeFileSync(outputPath, JSON.stringify(walletData, null, 2));
        
        console.log(`   ✅ Wallet data saved to: ${outputPath}`);
        console.log(`   ✅ ${walletData.wallets.length} wallets saved`);
        console.log();
    }

    private printSummary() {
        console.log("📊 PHASE 0 SUMMARY");
        console.log("==================");
        console.log(`✅ Program verified: ${PROGRAM_ID.toBase58()}`);
        console.log(`✅ Wallets created: ${this.testWallets.length}`);
        console.log(`✅ Vault PDAs derived: ${this.testWallets.length}`);
        console.log(`✅ Wallets funded from devnet faucet`);
        console.log(`✅ Wallet data saved to wallets.json`);
        
        console.log("\n📝 Created wallets:");
        this.testWallets.forEach((wallet, i) => {
            console.log(`   ${i + 1}. ${wallet.name}: ${wallet.keypair.publicKey.toBase58().substring(0, 8)}... (${wallet.targetBalance} SOL target)`);
        });
        
        console.log("\n🎯 Next Steps:");
        console.log("1. Run Phase 1: npm run test-phase-1 (deposit/withdrawal testing)");
        console.log("2. Run Phase 2: npm run test-phase-2 (house setup testing)");
        console.log("3. Continue with remaining test phases");
        
        console.log("\n✨ Ready for Phase 1 testing!");
    }
}

// Run the test if called directly
if (require.main === module) {
    const tester = new WalletSetupTester();
    
    tester.run()
        .then(() => {
            console.log("\n🎉 Phase 0 setup completed successfully!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Phase 0 setup failed!");
            console.error(error);
            process.exit(1);
        });
}

export { WalletSetupTester };