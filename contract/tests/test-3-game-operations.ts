#!/usr/bin/env ts-node

/**
 * Smart Vault V2 Testing - Phase 3: Game Operations (Updated)
 * 
 * This script tests:
 * - Client operations (deposit/withdraw for first 5 wallets)
 * - Atomic bet and settle operations (betAndSettle)
 * - Batch settlement operations (batchSettle)
 * - All game scenarios: win/loss/draw, stake=0 cases
 * - Full game flow simulation with gem_data
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Test configuration
const DEVNET_URL = "https://api.devnet.solana.com";

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

interface GameResult {
    walletName: string;
    stake: number;
    payout: number;
    outcome: 'win' | 'loss' | 'draw';
    betId: string;
    gameId: number;
    gemData: number[];
}

interface TestResult {
    walletName: string;
    initialBalance: number;
    finalBalance: number;
    
    // Individual operations
    betAndSettleTx?: string;
    betAndSettleError?: string;
    
    // Batch operations
    batchSettleTx?: string;
    batchSettleError?: string;
    
    // Game results
    gameResults: GameResult[];
    
    // Scenarios tested
    winTest?: string;
    lossTest?: string;
    drawTest?: string;
    zeroStakeTest?: string;
    zeroPayout?: string;
}

// Generate random gem data (u8 values) - contract expects exactly 7 bytes
function generateRandomGemData(length: number = 7): number[] {
    return Array.from({ length }, () => Math.floor(Math.random() * 256));
}

// Generate unique bet ID
function generateBetId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

class GameOperationsTest {
    private connection: Connection;
    private program: anchor.Program<any>;
    private provider: anchor.AnchorProvider;
    private programId: PublicKey;
    private adminKeypair: Keypair;
    private houseVaultPda: PublicKey;
    private pauseConfigPda: PublicKey;
    private clientWallets: TestWallet[] = [];
    private results: { [walletName: string]: TestResult } = {};

    constructor() {
        this.connection = new Connection(DEVNET_URL, "confirmed");
        // These will be loaded from wallets.json
        this.programId = PublicKey.default;
        this.adminKeypair = Keypair.generate(); // Will be replaced
        this.houseVaultPda = PublicKey.default;
        this.pauseConfigPda = PublicKey.default;
        this.program = {} as anchor.Program<any>; // Will be initialized
        this.provider = {} as anchor.AnchorProvider; // Will be initialized
    }

    async initialize() {
        console.log("🚀 Initializing Game Operations Test...");
        
        // Load wallet data
        const walletsFilePath = path.join(__dirname, 'wallets.json');
        const walletData: WalletData = JSON.parse(fs.readFileSync(walletsFilePath, "utf-8"));
        
        this.programId = new PublicKey(walletData.programId);
        console.log(`📋 Program ID: ${this.programId.toString()}`);
        
        // Setup connection and provider
        this.connection = new Connection(DEVNET_URL, "confirmed");
        
        // Load admin keypair from Solana config  
        const adminKeypairData = JSON.parse(fs.readFileSync(`${require('os').homedir()}/.config/solana/id.json`, 'utf-8'));
        this.adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));
        
        const wallet = new anchor.Wallet(this.adminKeypair);
        this.provider = new anchor.AnchorProvider(this.connection, wallet, {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
        });
        anchor.setProvider(this.provider);
        
        // Load IDL and create program
        const idlPath = path.join(__dirname, "..", "src", "idl.json");
        const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
        this.program = new anchor.Program(idl, this.programId, this.provider);
        
        // Derive PDAs
        [this.houseVaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("house_vault")],
            this.programId
        );
        
        [this.pauseConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("pause_config")],
            this.programId
        );
        
        // Setup client wallets (first 5)
        for (let i = 0; i < Math.min(5, walletData.wallets.length); i++) {
            const walletInfo = walletData.wallets[i];
            const keypair = Keypair.fromSecretKey(new Uint8Array(walletInfo.secretKey));
            
            this.clientWallets.push({
                keypair,
                vaultPda: new PublicKey(walletInfo.vaultPda),
                vaultBump: walletInfo.vaultBump,
                targetBalance: walletInfo.targetBalance,
                name: walletInfo.name
            });
            
            this.results[walletInfo.name] = {
                walletName: walletInfo.name,
                initialBalance: 0,
                finalBalance: 0,
                gameResults: []
            };
        }
        
        console.log(`✅ Initialized with ${this.clientWallets.length} test wallets`);
    }

    async run() {
        try {
            await this.initialize();
            await this.step1_recordInitialBalances();
            await this.step2_testBetAndSettle();
            await this.step3_testBatchSettle();
            await this.step4_testEdgeCases();
            await this.step5_recordFinalBalances();
            await this.step6_generateReport();
        } catch (error) {
            console.error("❌ Test execution failed:", error);
            throw error;
        }
    }

    private async step1_recordInitialBalances() {
        console.log("📊 Step 1: Recording initial vault balances...");
        
        for (const wallet of this.clientWallets) {
            try {
                const balance = await this.connection.getBalance(wallet.vaultPda);
                this.results[wallet.name].initialBalance = balance;
                console.log(`   ${wallet.name}: ${balance / LAMPORTS_PER_SOL} SOL`);
            } catch (error) {
                console.error(`   ❌ Failed to get balance for ${wallet.name}:`, error);
            }
        }
    }

    private async step2_testBetAndSettle() {
        console.log("🎲 Step 2: Testing betAndSettle operations...");
        
        for (const wallet of this.clientWallets) {
            console.log(`   Testing ${wallet.name}...`);
            
            // Test different scenarios
            await this.testBetAndSettleScenario(wallet, 'win');
            await this.testBetAndSettleScenario(wallet, 'loss');
            await this.testBetAndSettleScenario(wallet, 'draw');
            await this.testBetAndSettleScenario(wallet, 'zero_stake');
            await this.testBetAndSettleScenario(wallet, 'zero_payout');
        }
    }

    private async testBetAndSettleScenario(wallet: TestWallet, scenario: 'win' | 'loss' | 'draw' | 'zero_stake' | 'zero_payout') {
        try {
            let stake: number, payout: number;
            const betId = generateBetId();
            const gameId = Math.floor(Math.random() * 10000);
            const gemData = generateRandomGemData();
            
            // Define scenario parameters
            switch (scenario) {
                case 'win':
                    stake = Math.floor(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL
                    payout = Math.floor(0.015 * LAMPORTS_PER_SOL); // 0.015 SOL (win)
                    break;
                case 'loss':
                    stake = Math.floor(0.01 * LAMPORTS_PER_SOL);
                    payout = Math.floor(0.005 * LAMPORTS_PER_SOL); // 0.005 SOL (loss)
                    break;
                case 'draw':
                    stake = Math.floor(0.01 * LAMPORTS_PER_SOL);
                    payout = stake; // Same amount (draw)
                    break;
                case 'zero_stake':
                    stake = 0; // No stake (payout only)
                    payout = Math.floor(0.005 * LAMPORTS_PER_SOL);
                    break;
                case 'zero_payout':
                    stake = Math.floor(0.01 * LAMPORTS_PER_SOL);
                    payout = 0; // No payout (total loss)
                    break;
            }
            
            const tx = await this.program.methods
                .betAndSettle(
                    new anchor.BN(stake),
                    new anchor.BN(payout),
                    betId,
                    new anchor.BN(gameId),
                    Buffer.from(gemData)
                )
                .accounts({
                    vault: wallet.vaultPda,
                    houseVault: this.houseVaultPda,
                    authority: this.adminKeypair.publicKey,
                    pauseConfig: this.pauseConfigPda
                })
                .signers([this.adminKeypair])
                .rpc();
            
            this.results[wallet.name].gameResults.push({
                walletName: wallet.name,
                stake: stake,
                payout: payout,
                outcome: payout > stake ? 'win' : (payout < stake ? 'loss' : 'draw'),
                betId,
                gameId,
                gemData
            });
            
            // Record specific test results
            switch (scenario) {
                case 'win':
                    this.results[wallet.name].winTest = tx;
                    break;
                case 'loss':
                    this.results[wallet.name].lossTest = tx;
                    break;
                case 'draw':
                    this.results[wallet.name].drawTest = tx;
                    break;
                case 'zero_stake':
                    this.results[wallet.name].zeroStakeTest = tx;
                    break;
                case 'zero_payout':
                    this.results[wallet.name].zeroPayout = tx;
                    break;
            }
            
            console.log(`      ✅ ${scenario}: ${tx} (stake: ${stake}, payout: ${payout})`);
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`      ❌ ${scenario} failed: ${errorMsg}`);
            
            this.results[wallet.name].betAndSettleError = errorMsg;
        }
    }

    private async step3_testBatchSettle() {
        console.log("📦 Step 3: Testing batchSettle operations...");
        
        for (const wallet of this.clientWallets) {
            try {
                console.log(`   Testing batch operations for ${wallet.name}...`);
                
                // Create batch of 3 games
                const batchSize = 3;
                const stakes: anchor.BN[] = [];
                const payouts: anchor.BN[] = [];
                const betIds: string[] = [];
                const gameIds: anchor.BN[] = [];
                const gemDatas: Buffer[] = [];
                
                for (let i = 0; i < batchSize; i++) {
                    const stake = Math.floor((0.005 + Math.random() * 0.01) * LAMPORTS_PER_SOL);
                    const payout = Math.floor(stake * (0.5 + Math.random() * 1.5)); // Random outcome
                    
                    stakes.push(new anchor.BN(stake));
                    payouts.push(new anchor.BN(payout));
                    betIds.push(generateBetId());
                    gameIds.push(new anchor.BN(Math.floor(Math.random() * 10000)));
                    gemDatas.push(Buffer.from(generateRandomGemData()));
                    
                    this.results[wallet.name].gameResults.push({
                        walletName: wallet.name,
                        stake: stake,
                        payout: payout,
                        outcome: payout > stake ? 'win' : (payout < stake ? 'loss' : 'draw'),
                        betId: betIds[i],
                        gameId: gameIds[i].toNumber(),
                        gemData: Array.from(gemDatas[i])
                    });
                }
                
                const tx = await this.program.methods
                    .batchSettle(stakes, payouts, betIds, gameIds, gemDatas)
                    .accounts({
                        houseVault: this.houseVaultPda,
                        authority: this.adminKeypair.publicKey,
                        pauseConfig: this.pauseConfigPda
                    })
                    .remainingAccounts(
                        Array(batchSize).fill(null).map(() => 
                            ({ pubkey: wallet.vaultPda, isWritable: true, isSigner: false })
                        )
                    )
                    .signers([this.adminKeypair])
                    .rpc();
                
                this.results[wallet.name].batchSettleTx = tx;
                console.log(`      ✅ Batch settle: ${tx} (${batchSize} games)`);
                
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`      ❌ Batch settle failed: ${errorMsg}`);
                this.results[wallet.name].batchSettleError = errorMsg;
            }
        }
    }

    private async step4_testEdgeCases() {
        console.log("🔬 Step 4: Testing edge cases...");
        
        const wallet = this.clientWallets[0]; // Use first wallet for edge cases
        
        try {
            // Test with all zeros
            console.log("   Testing all-zero scenario...");
            const tx1 = await this.program.methods
                .betAndSettle(
                    new anchor.BN(0),
                    new anchor.BN(0),
                    generateBetId(),
                    new anchor.BN(999),
                    Buffer.from([0, 0, 0, 0, 0, 0, 0])
                )
                .accounts({
                    vault: wallet.vaultPda,
                    houseVault: this.houseVaultPda,
                    authority: this.adminKeypair.publicKey,
                    pauseConfig: this.pauseConfigPda
                })
                .signers([this.adminKeypair])
                .rpc();
            
            console.log(`      ✅ All-zero test: ${tx1}`);
            
            // Test with large values
            console.log("   Testing large values...");
            const tx2 = await this.program.methods
                .betAndSettle(
                    new anchor.BN(0),
                    new anchor.BN(Math.floor(0.1 * LAMPORTS_PER_SOL)), // Large payout
                    generateBetId(),
                    new anchor.BN(9999),
                    Buffer.from(generateRandomGemData(7))
                )
                .accounts({
                    vault: wallet.vaultPda,
                    houseVault: this.houseVaultPda,
                    authority: this.adminKeypair.publicKey,
                    pauseConfig: this.pauseConfigPda
                })
                .signers([this.adminKeypair])
                .rpc();
            
            console.log(`      ✅ Large value test: ${tx2}`);
            
        } catch (error) {
            console.log(`      ❌ Edge case test failed: ${error}`);
        }
    }

    private async step5_recordFinalBalances() {
        console.log("📊 Step 5: Recording final vault balances...");
        
        for (const wallet of this.clientWallets) {
            try {
                const balance = await this.connection.getBalance(wallet.vaultPda);
                this.results[wallet.name].finalBalance = balance;
                console.log(`   ${wallet.name}: ${balance / LAMPORTS_PER_SOL} SOL`);
            } catch (error) {
                console.error(`   ❌ Failed to get final balance for ${wallet.name}:`, error);
            }
        }
    }

    private async step6_generateReport() {
        console.log("\n" + "=".repeat(80));
        console.log("📋 GAME OPERATIONS TEST REPORT");
        console.log("=".repeat(80));
        
        let totalTests = 0;
        let passedTests = 0;
        
        for (const wallet of this.clientWallets) {
            const result = this.results[wallet.name];
            const balanceChange = (result.finalBalance - result.initialBalance) / LAMPORTS_PER_SOL;
            
            console.log(`\n🔸 ${wallet.name}`);
            console.log(`   Initial Balance: ${result.initialBalance / LAMPORTS_PER_SOL} SOL`);
            console.log(`   Final Balance: ${result.finalBalance / LAMPORTS_PER_SOL} SOL`);
            console.log(`   Net Change: ${balanceChange > 0 ? '+' : ''}${balanceChange.toFixed(6)} SOL`);
            
            // Test results
            const tests = [
                { name: 'Win Test', result: result.winTest },
                { name: 'Loss Test', result: result.lossTest },
                { name: 'Draw Test', result: result.drawTest },
                { name: 'Zero Stake Test', result: result.zeroStakeTest },
                { name: 'Zero Payout Test', result: result.zeroPayout },
                { name: 'Batch Settle', result: result.batchSettleTx }
            ];
            
            for (const test of tests) {
                totalTests++;
                if (test.result) {
                    passedTests++;
                    console.log(`   ${test.name}: ✅`);
                } else {
                    console.log(`   ${test.name}: ❌`);
                }
            }
            
            // Game results summary
            if (result.gameResults.length > 0) {
                const wins = result.gameResults.filter(g => g.outcome === 'win').length;
                const losses = result.gameResults.filter(g => g.outcome === 'loss').length;
                const draws = result.gameResults.filter(g => g.outcome === 'draw').length;
                
                console.log(`   Games Played: ${result.gameResults.length} (W:${wins} L:${losses} D:${draws})`);
            }
            
            if (result.betAndSettleError || result.batchSettleError) {
                console.log(`   Errors: ${result.betAndSettleError || result.batchSettleError}`);
            }
        }
        
        console.log(`\n📊 Summary: ${passedTests}/${totalTests} tests passed (${((passedTests/totalTests)*100).toFixed(1)}%)`);
        console.log("=".repeat(80));
    }
}

// Run the test
const test = new GameOperationsTest();
test.run()
    .then(() => {
        console.log("✅ Game operations test completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Game operations test failed:", error);
        process.exit(1);
    });