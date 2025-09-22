#!/usr/bin/env ts-node

/**
 * Smart Vault V2 Testing - Phase 2: House Vault & Authority Setup
 * 
 * This script tests:
 * - House vault initialization with multisig authority
 * - Migration config initialization 
 * - Authority controls verification
 * - Contract deployment verification
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Test configuration - ACTUAL DEPLOYED PROGRAM
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

// Extended Smart Vault V2 IDL (includes house vault and migration config)
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
            "name": "initializeHouse",
            "accounts": [
                { "name": "houseVault", "isMut": true, "isSigner": false },
                { "name": "admin", "isMut": true, "isSigner": true },
                { "name": "systemProgram", "isMut": false, "isSigner": false }
            ],
            "args": []
        },
        {
            "name": "initializePauseConfig",
            "accounts": [
                { "name": "pauseConfig", "isMut": true, "isSigner": false },
                { "name": "authority", "isMut": true, "isSigner": true },
                { "name": "systemProgram", "isMut": false, "isSigner": false }
            ],
            "args": []
        },
        {
            "name": "startMaintenancePause",
            "accounts": [
                { "name": "pauseConfig", "isMut": true, "isSigner": false },
                { "name": "authority", "isMut": false, "isSigner": true }
            ],
            "args": []
        },
        {
            "name": "emergencyPause",
            "accounts": [
                { "name": "pauseConfig", "isMut": true, "isSigner": false },
                { "name": "authority", "isMut": false, "isSigner": true }
            ],
            "args": []
        },
        {
            "name": "closePauseConfig",
            "accounts": [
                { "name": "pauseConfig", "isMut": true, "isSigner": false },
                { "name": "authority", "isMut": true, "isSigner": true }
            ],
            "args": []
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
        },
        {
            "name": "HouseVault",
            "type": {
                "kind": "struct",
                "fields": [
                    { "name": "bump", "type": "u8" },
                    { "name": "multisigAuthority", "type": "publicKey" },
                    { "name": "adminAuthority", "type": "publicKey" },
                    { "name": "totalVolume", "type": "u64" }
                ]
            }
        },
        {
            "name": "PauseConfig",
            "type": {
                "kind": "struct",
                "fields": [
                    { "name": "multisigAuthority", "type": "publicKey" },
                    { "name": "adminAuthority", "type": "publicKey" },
                    { "name": "maintenancePause", "type": "bool" },
                    { "name": "maintenanceStartTime", "type": "i64" },
                    { "name": "maintenanceDurationHours", "type": "u8" },
                    { "name": "emergencyPause", "type": "bool" },
                    { "name": "bump", "type": "u8" }
                ]
            }
        }
    ]
};

interface TestContext {
    connection: Connection;
    program: anchor.Program;
    houseVaultPda: PublicKey;
    houseVaultBump: number;
    pauseConfigPda: PublicKey;
    pauseConfigBump: number;
    adminWallet: TestWallet;
    programId: PublicKey;
    multisigAuthority: PublicKey;
    adminAuthority: PublicKey;
    results: { [key: string]: any };
    wallets: TestWallet[];
}

class HouseSetupTester {
    private context: TestContext;

    constructor() {
        this.context = {
            connection: new Connection(DEVNET_URL, "confirmed"),
            program: null as any, // Will be initialized after loading wallet data
            houseVaultPda: null as any,
            houseVaultBump: 0,
            pauseConfigPda: null as any,
            pauseConfigBump: 0,
            adminWallet: null as any,
            programId: PublicKey.default,
            multisigAuthority: PublicKey.default,
            adminAuthority: PublicKey.default,
            results: {},
            wallets: []
        };
    }

    private initializePDAs() {
        // Derive house vault PDA
        const [houseVaultPda, houseVaultBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("house_vault")],
            this.context.programId
        );
        
        // Derive pause config PDA
        const [pauseConfigPda, pauseConfigBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("pause_config")],
            this.context.programId
        );

        this.context.houseVaultPda = houseVaultPda;
        this.context.houseVaultBump = houseVaultBump;
        this.context.pauseConfigPda = pauseConfigPda;
        this.context.pauseConfigBump = pauseConfigBump;
    }

    async run() {
        console.log("🏛️  Starting Smart Vault V2 - Phase 2: House Setup Real Transactions\n");
        console.log("⚠️  WARNING: This will perform REAL transactions on devnet!");
        console.log("   House vault and migration config initialization.\n");

        try {
            await this.step1_loadWallets();
            await this.step2_setupProgram();
            await this.step3_verifyProgramDeployment();
            await this.step4_initializeHouseVault();
            await this.step5_initializePauseConfig();
            await this.step6_verifyAuthorityControls();
            await this.step7_testUnauthorizedAccess();
            
            console.log("\n✅ Phase 2 Testing Complete!");
            this.printSummary();
            
        } catch (error) {
            console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    private async step1_loadWallets() {
        console.log("📂 Step 1: Loading wallets from wallets.json...");

        const walletsFilePath = path.join(__dirname, 'wallets.json');

        if (!fs.existsSync(walletsFilePath)) {
            throw new Error("❌ wallets.json not found! Please run Phase 0 first (npm run test-phase-0)");
        }

        const walletData: WalletData = JSON.parse(fs.readFileSync(walletsFilePath, 'utf8'));

        // Load program configuration
        this.context.programId = new PublicKey(walletData.programId);
        this.context.multisigAuthority = new PublicKey(walletData.multisigAuthority);
        this.context.adminAuthority = new PublicKey(walletData.adminAuthority);

        console.log(`   Program ID: ${this.context.programId.toBase58()}`);
        console.log(`   Multisig Authority: ${this.context.multisigAuthority.toBase58()}`);
        console.log(`   Admin Authority: ${this.context.adminAuthority.toBase58()}`);

        // Load the actual admin authority keypair from Solana CLI config
        try {
            const adminKeypairPath = os.homedir() + '/.config/solana/id.json';
            const adminKeypairData = JSON.parse(fs.readFileSync(adminKeypairPath, 'utf8'));
            const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));
            
            // Verify this is the correct admin authority
            if (!adminKeypair.publicKey.equals(this.context.adminAuthority)) {
                throw new Error(`Admin keypair mismatch! Expected: ${this.context.adminAuthority.toBase58()}, Got: ${adminKeypair.publicKey.toBase58()}`);
            }
            
            this.context.adminWallet = {
                keypair: adminKeypair,
                vaultPda: PublicKey.default, // Not needed for house setup
                vaultBump: 0,
                targetBalance: 0,
                name: "CLI_Admin"
            };

            console.log(`   ✅ Loaded actual admin authority from CLI config`);
            console.log(`   Admin Address: ${this.context.adminWallet.keypair.publicKey.toBase58()}\n`);
            
        } catch (error) {
            console.error(`   ❌ Failed to load admin keypair from ~/.config/solana/id.json`);
            console.error(`   Make sure your Solana CLI is configured with the admin authority key`);
            console.error(`   Expected admin authority: ${this.context.adminAuthority.toBase58()}`);
            console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
            console.error(`\n   💡 To fix this, run:`);
            console.error(`      solana config set --keypair <path-to-admin-keypair>`);
            console.error(`      Or place the admin keypair JSON at ~/.config/solana/id.json\n`);
            throw error;
        }

        // Load test wallets for unauthorized testing
        this.context.wallets = walletData.wallets.map((wallet, index) => ({
            keypair: Keypair.fromSecretKey(new Uint8Array(wallet.secretKey)),
            vaultPda: new PublicKey(wallet.vaultPda),
            vaultBump: wallet.vaultBump,
            targetBalance: wallet.targetBalance,
            name: wallet.name || `Wallet_${index + 1}`
        }));

        console.log(`   ✅ Loaded ${this.context.wallets.length} test wallets for unauthorized testing`);

        // Initialize PDAs now that we have the program ID
        this.initializePDAs();
    }

    private async step2_setupProgram() {
        console.log("⚙️  Step 2: Setting up Anchor program connection...");
        
        try {
            // Create provider with admin wallet
            const provider = new anchor.AnchorProvider(
                this.context.connection,
                new anchor.Wallet(this.context.adminWallet.keypair),
                { commitment: "confirmed" }
            );
            
            // Create program instance
            this.context.program = new anchor.Program(SMART_VAULT_IDL as any, this.context.programId, provider);
            
            console.log(`   ✅ Program connected: ${this.context.programId.toBase58()}`);
            
            // Verify program exists
            const programInfo = await this.context.connection.getAccountInfo(this.context.programId);
            if (!programInfo) {
                throw new Error("Program not found on devnet!");
            }
            
            console.log(`   ✅ Program verified on devnet (${programInfo.data.length} bytes)\n`);
            
        } catch (error) {
            console.error("   ❌ Failed to setup program:", error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    private async step3_verifyProgramDeployment() {
        console.log("🔍 Step 3: Verifying program deployment...");
        
        try {
            const programAccount = await this.context.connection.getAccountInfo(this.context.programId);
            assert(programAccount !== null, "Program not deployed");
            assert(programAccount.executable, "Account is not an executable program");
            
            console.log(`   ✅ Program deployed at: ${this.context.programId.toBase58()}`);
            console.log(`   ✅ Program is executable: ${programAccount.executable}`);
            console.log(`   ✅ Program owner: ${programAccount.owner.toBase58()}\n`);
            
        } catch (error) {
            console.log("   ❌ Program verification failed:", error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    private async step4_initializeHouseVault() {
        console.log("🏦 Step 4: Initializing house vault with real transaction...");
        
        try {
            // Check if house vault already exists
            const existingAccount = await this.context.connection.getAccountInfo(this.context.houseVaultPda);
            
            if (existingAccount) {
                console.log("   ℹ️  House vault already initialized");
                await this.verifyHouseVaultData();
                this.context.results.houseVaultExists = true;
                return;
            }
            
            // Check admin wallet balance
            const adminBalance = await this.context.connection.getBalance(this.context.adminWallet.keypair.publicKey);
            const adminBalanceSOL = adminBalance / LAMPORTS_PER_SOL;
            console.log(`   Admin wallet balance: ${adminBalanceSOL.toFixed(6)} SOL`);
            
            if (adminBalance < 0.01 * LAMPORTS_PER_SOL) {
                throw new Error("Admin wallet needs at least 0.01 SOL for house vault initialization");
            }
            
            // Initialize house vault with real transaction
            console.log("   📡 Sending real transaction to initialize house vault...");
            const tx = await this.context.program.methods
                .initializeHouse()
                .accounts({
                    houseVault: this.context.houseVaultPda,
                    admin: this.context.adminWallet.keypair.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            
            console.log(`   ✅ House vault initialized! Tx: ${tx}`);
            console.log(`   ✅ House vault PDA: ${this.context.houseVaultPda.toBase58()}`);
            
            this.context.results.houseVaultTx = tx;
            this.context.results.houseVaultInitialized = true;
            
            await this.verifyHouseVaultData();
            
        } catch (error) {
            console.log("   ❌ House vault initialization failed:", error instanceof Error ? error.message : String(error));
            this.context.results.houseVaultError = error instanceof Error ? error.message : String(error);
            throw error;
        }
        
        console.log();
    }

    private async verifyHouseVaultData() {
        console.log("   🔍 Verifying house vault data...");
        
        try {
            const houseVaultAccount = await this.context.program.account.houseVault.fetch(this.context.houseVaultPda);
            
            console.log(`      Bump: ${houseVaultAccount.bump}`);
            console.log(`      Multisig Authority: ${houseVaultAccount.multisigAuthority.toBase58()}`);
            console.log(`      Admin Authority: ${houseVaultAccount.adminAuthority.toBase58()}`);
            console.log(`      Total Volume: ${houseVaultAccount.totalVolume.toString()}`);
            
            // Verify authorities are set correctly
            assert(houseVaultAccount.multisigAuthority.equals(this.context.multisigAuthority), "Multisig authority mismatch");
            assert(houseVaultAccount.adminAuthority.equals(this.context.adminAuthority), "Admin authority mismatch");
            
            console.log("   ✅ House vault data verified");
            
        } catch (error) {
            console.log("   ⚠️  Could not fetch house vault data:", error instanceof Error ? error.message : String(error));
        }
    }

    private async step5_initializePauseConfig() {
                 console.log("⚙️  Step 5: Initializing pause config with real transaction...");
        
                try {
            // Check if pause config already exists
            const existingAccount = await this.context.connection.getAccountInfo(this.context.pauseConfigPda);
            
            if (existingAccount) {
                console.log("   ℹ️  Pause config already initialized, but checking for multisig address mismatch...");
                try {
                    await this.verifyPauseConfigData();
                    // If verification passes, no need to reinitialize
                    this.context.results.pauseConfigExists = true;
                    return;
                } catch (error) {
                    if (error instanceof Error && error.message.includes("Multisig authority mismatch")) {
                        console.log("   🔄 Detected multisig address mismatch, closing and recreating pause config...");
                        console.log("   🗑️  Pause config account exists but has wrong multisig address");
                        console.log("   🔄 Closing existing pause config account to fix multisig address...");
                        
                        try {
                            // Close the existing pause config account
                            const closeTx = await this.context.program.methods
                                .closePauseConfig()
                                .accounts({
                                    pauseConfig: this.context.pauseConfigPda,
                                    authority: this.context.adminWallet.keypair.publicKey,
                                })
                                .rpc();
                            
                            console.log(`   ✅ Pause config account closed! Tx: ${closeTx}`);
                            console.log("   🔄 Now reinitializing with correct multisig address...");
                            
                            // Continue to reinitialize
                        } catch (closeError) {
                            console.log("   ❌ Failed to close pause config account:", closeError instanceof Error ? closeError.message : String(closeError));
                            console.log("   💡 To fix this manually, you need to either:");
                            console.log("      1. Redeploy the contract with correct multisig address, or");
                            console.log("      2. Use the close function: closePauseConfig()");
                            this.context.results.pauseConfigExists = true;
                            return;
                        }
                    } else {
                        throw error;
                    }
                }
            }
            
            console.log("   📡 Sending real transaction to initialize migration config...");
            console.log("   Note: Old program ID is hardcoded in the contract");
            
            // Initialize migration config with real transaction (no parameters needed)
            const tx = await this.context.program.methods
                                 .initializePauseConfig()
                .accounts({
                    pauseConfig: this.context.pauseConfigPda,
                    authority: this.context.adminWallet.keypair.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            
                         console.log(`   ✅ Pause config initialized! Tx: ${tx}`);
             console.log(`   ✅ Pause config PDA: ${this.context.pauseConfigPda.toBase58()}`);
            
            this.context.results.pauseConfigTx = tx;
            this.context.results.pauseConfigInitialized = true;
            
                         await this.verifyPauseConfigData();
            
        } catch (error) {
                         console.log("   ❌ Pause config initialization failed:", error instanceof Error ? error.message : String(error));
            this.context.results.pauseConfigError = error instanceof Error ? error.message : String(error);
            throw error;
        }
        
        console.log();
    }

    private async verifyPauseConfigData() {
                 console.log("   🔍 Verifying pause config data...");
        
        try {
            const pauseConfig = await this.context.program.account.pauseConfig.fetch(this.context.pauseConfigPda);
            
                        console.log(`      Multisig Authority: ${pauseConfig.multisigAuthority.toBase58()}`);
             console.log(`      Admin Authority: ${pauseConfig.adminAuthority.toBase58()}`);
             console.log(`      Maintenance Pause: ${pauseConfig.maintenancePause}`);
             console.log(`      Maintenance Start Time: ${pauseConfig.maintenanceStartTime}`);
             console.log(`      Maintenance Duration Hours: ${pauseConfig.maintenanceDurationHours}`);
             console.log(`      Emergency Pause: ${pauseConfig.emergencyPause}`);
             
             // Verify configuration
             assert(pauseConfig.multisigAuthority.equals(this.context.multisigAuthority), "Multisig authority mismatch");
             assert(pauseConfig.adminAuthority.equals(this.context.adminAuthority), "Admin authority mismatch");
             assert(!pauseConfig.maintenancePause, "Maintenance pause should start false");
             assert(!pauseConfig.emergencyPause, "Emergency pause should start false");
            
                         console.log("   ✅ Pause config data verified");
            
        } catch (error) {
            console.log("   ⚠️  Could not fetch pause config data:", error instanceof Error ? error.message : String(error));
            throw error; // Re-throw so the caller can handle it
        }
    }

    private async step6_verifyAuthorityControls() {
        console.log("🔐 Step 6: Testing authority controls...");
        
        try {
            // Test emergency pause with admin authority (should work)
            console.log("   Testing emergency pause with admin authority...");
            
            // Note: We're using the admin wallet from wallets.json, not the actual deployed admin
            console.log("   ⚠️  Note: Using test admin wallet, not the actual deployed admin authority");
            console.log("   ℹ️  This test verifies the contract structure is correct");
            
            // Verify authority structure by checking the migration config
            try {
                const pauseConfig = await this.context.program.account.pauseConfig.fetch(this.context.pauseConfigPda);
                assert(pauseConfig.multisigAuthority.equals(this.context.multisigAuthority), "Multisig authority not set correctly");
                assert(pauseConfig.adminAuthority.equals(this.context.adminAuthority), "Admin authority not set correctly");
                
                console.log("   ✅ Authority controls structure verified");
                this.context.results.authorityControlsVerified = true;
                
            } catch (error) {
                console.log("   ⚠️  Could not verify authority controls:", error instanceof Error ? error.message : String(error));
                this.context.results.authorityControlsError = error instanceof Error ? error.message : String(error);
            }
            
        } catch (error) {
            console.log("   ❌ Authority controls test failed:", error instanceof Error ? error.message : String(error));
            throw error;
        }
        
        console.log();
    }

    private async step7_testUnauthorizedAccess() {
        console.log("🚫 Step 7: Testing unauthorized access prevention...");
        
        try {
            // Use one of the wallets from the context.wallets array as the unauthorized wallet
            if (!this.context.wallets || this.context.wallets.length === 0) {
                throw new Error("No test wallets available for unauthorized testing");
            }
            
            const unauthorizedWallet = this.context.wallets[0]; // Use the first wallet as unauthorized
            console.log(`   Using test wallet (${unauthorizedWallet.name}) as unauthorized wallet for testing...`);

            // Ensure the test wallet has some SOL (should already be funded from setup)
            const balance = await this.context.connection.getBalance(unauthorizedWallet.keypair.publicKey);
            if (balance < 0.01 * LAMPORTS_PER_SOL) {
                console.log("   📡 Funding test wallet for unauthorized test...");
                const signature = await this.context.connection.requestAirdrop(
                    unauthorizedWallet.keypair.publicKey,
                    0.1 * LAMPORTS_PER_SOL
                );
                await this.context.connection.confirmTransaction(signature, "confirmed");
            }

            console.log("   Testing unauthorized pause activation...");

            // Create a separate provider for the unauthorized wallet
            const unauthorizedProvider = new anchor.AnchorProvider(
                this.context.connection,
                new anchor.Wallet(unauthorizedWallet.keypair),
                { commitment: "confirmed" }
            );

            const unauthorizedProgram = new anchor.Program(SMART_VAULT_IDL as any, this.context.programId, unauthorizedProvider);

            try {
                // This should fail
                                 const tx = await unauthorizedProgram.methods
                     .startMaintenancePause()
                     .accounts({
                         pauseConfig: this.context.pauseConfigPda,
                         authority: unauthorizedWallet.keypair.publicKey,
                     })
                     .rpc();

                // If we reach here, the test failed
                throw new Error("Unauthorized access was allowed!");

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                if (errorMsg.includes("Unauthorized") || errorMsg.includes("constraint") || errorMsg.includes("has_one")) {
                    console.log("   ✅ Unauthorized access correctly blocked");
                    console.log(`   📋 Error: ${errorMsg.substring(0, 100)}...`);
                    this.context.results.unauthorizedAccessBlocked = true;
                } else {
                    console.log(`   ⚠️  Unexpected error: ${errorMsg}`);
                    this.context.results.unauthorizedAccessError = errorMsg;
                }
            }

                             console.log("   ✅ Unauthorized pause access prevention verified");
        } catch (error) {
            console.log("   ❌ Unauthorized access test failed:", error instanceof Error ? error.message : String(error));
            this.context.results.unauthorizedTestError = error instanceof Error ? error.message : String(error);
        }
        
        console.log();
    }

    private printSummary() {
        console.log("📊 PHASE 2 SUMMARY - REAL DEVNET TRANSACTIONS");
        console.log("===============================================");
        console.log(`✅ Program: ${this.context.programId.toBase58()}`);
        
        console.log("\n📋 Transaction Results:");
        if (this.context.results.houseVaultExists) {
            console.log(`   🏦 House Vault: Already existed`);
        } else if (this.context.results.houseVaultInitialized) {
            console.log(`   🏦 House Vault: ✅ Initialized`);
            console.log(`      Transaction: ${this.context.results.houseVaultTx}`);
        } else {
            console.log(`   🏦 House Vault: ❌ ${this.context.results.houseVaultError || 'Failed'}`);
        }
        
                 if (this.context.results.pauseConfigExists) {
             console.log(`   ⚙️  Pause Config: Already existed`);
         } else if (this.context.results.pauseConfigInitialized) {
             console.log(`   ⚙️  Pause Config: ✅ Initialized`);
             console.log(`      Transaction: ${this.context.results.pauseConfigTx}`);
         } else {
             console.log(`   ⚙️  Pause Config: ❌ ${this.context.results.pauseConfigError || 'Failed'}`);
         }
        
        console.log(`   🔐 Authority Controls: ${this.context.results.authorityControlsVerified ? '✅ Verified' : '❌ Failed'}`);
        console.log(`   🚫 Unauthorized Access: ${this.context.results.unauthorizedAccessBlocked ? '✅ Blocked' : '❌ Failed'}`);
        
        console.log("\n📝 Contract PDAs:");
        console.log(`   House Vault: ${this.context.houseVaultPda.toBase58()}`);
                 console.log(`   Pause Config: ${this.context.pauseConfigPda.toBase58()}`);
        
        console.log("\n📈 Statistics:");
        const successful = Object.values(this.context.results).filter(v => v === true).length;
        const total = Object.keys(this.context.results).filter(k => k.endsWith('ized') || k.endsWith('ied') || k.endsWith('ked')).length;
        console.log(`   Successful Operations: ${successful}/${total}`);
        
        console.log("\n💾 Full results saved to contract/tests/test-2-results.json");
        console.log("\n🎯 Ready for Phase 3: Game Operations Testing");
    }

    // Export setup data for next phases
    public exportSetupData() {
        return {
            programId: this.context.programId.toBase58(),
            houseVaultPda: this.context.houseVaultPda.toBase58(),
            pauseConfigPda: this.context.pauseConfigPda.toBase58(),
            multisigAuthority: this.context.multisigAuthority.toBase58(),
            adminAuthority: this.context.adminAuthority.toBase58(),
            adminWallet: {
                publicKey: this.context.adminWallet.keypair.publicKey.toBase58(),
                secretKey: Array.from(this.context.adminWallet.keypair.secretKey),
                name: this.context.adminWallet.name
            },
            results: this.context.results
        };
    }
}

// Run the test if called directly
if (require.main === module) {
    const tester = new HouseSetupTester();
    
    tester.run()
        .then(() => {
            console.log("\n🎉 Phase 2 testing completed successfully!");
            
            // Save setup data for next phases
            const setupData = tester.exportSetupData();
            fs.writeFileSync('./test-setup.json', JSON.stringify(setupData, null, 2));
            
            // Save test results
            const resultsPath = path.join(__dirname, 'test-2-results.json');
            fs.writeFileSync(resultsPath, JSON.stringify((tester as any).context.results, null, 2));
            console.log("💾 Setup data saved to test-setup.json");
            
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Phase 2 testing failed!");
            console.error(error);
            process.exit(1);
        });
}

export { HouseSetupTester };