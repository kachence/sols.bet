#!/usr/bin/env ts-node

/**
 * Update Vault Balances for Testing
 * 
 * This script adds sufficient funds to each user vault for testing betting operations.
 * It will deposit enough SOL to each vault to allow for multiple betting rounds.
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

// Load the real deployed IDL
const IDL_PATH = path.join(__dirname, '../src/idl.json');
const SMART_VAULT_IDL = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));

class VaultBalanceUpdater {
    private connection: Connection;
    private program!: anchor.Program;
    private clientWallets: TestWallet[] = [];
    private adminWallet!: TestWallet;
    private programId: PublicKey;
    private multisigAuthority: PublicKey;
    private adminAuthority: PublicKey;
    private houseVaultPda: PublicKey;
    private pauseConfigPda: PublicKey;
    private results: { [key: string]: any } = {};

    constructor() {
        this.connection = new Connection(DEVNET_URL, "confirmed");
        // Will be initialized after loading wallet data
        this.programId = PublicKey.default;
        this.multisigAuthority = PublicKey.default;
        this.adminAuthority = PublicKey.default;
        this.houseVaultPda = PublicKey.default;
        this.pauseConfigPda = PublicKey.default;
    }

    async run() {
        console.log("💰 Starting Vault Balance Update for Testing\n");
        console.log("⚠️  WARNING: This will perform REAL transactions on devnet!");
        console.log("   Adding funds to user vaults for betting operations.\n");

        try {
            await this.step1_loadWallets();
            await this.step2_setupProgram();
            await this.step3_checkCurrentBalances();
            await this.step4_updateVaultBalances();
            await this.step5_verifyFinalBalances();

            console.log("\n✅ Vault Balance Update Complete!");
            this.printSummary();

        } catch (error) {
            console.error("❌ Update failed:", error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    private async step1_loadWallets() {
        console.log("📂 Step 1: Loading wallets and admin authority...");

        const walletsFilePath = path.join(__dirname, 'wallets.json');

        if (!fs.existsSync(walletsFilePath)) {
            throw new Error("❌ wallets.json not found! Please run Phase 0 first (npm run test-phase-0)");
        }

        const walletData: WalletData = JSON.parse(fs.readFileSync(walletsFilePath, 'utf8'));

        // Load program configuration
        this.programId = new PublicKey(walletData.programId);
        this.multisigAuthority = new PublicKey(walletData.multisigAuthority);
        this.adminAuthority = new PublicKey(walletData.adminAuthority);

        console.log(`   Program ID: ${this.programId.toBase58()}`);
        console.log(`   Multisig Authority: ${this.multisigAuthority.toBase58()}`);
        console.log(`   Admin Authority: ${this.adminAuthority.toBase58()}`);

        // Load all wallets
        this.clientWallets = walletData.wallets.map(w => ({
            keypair: Keypair.fromSecretKey(new Uint8Array(w.secretKey)),
            vaultPda: new PublicKey(w.vaultPda),
            vaultBump: w.vaultBump,
            targetBalance: w.targetBalance,
            name: w.name
        }));

        console.log(`   ✅ Loaded ${this.clientWallets.length} client wallets`);

        // Load admin authority from CLI config
        try {
            const adminKeypairPath = os.homedir() + '/.config/solana/id.json';
            const adminKeypairData = JSON.parse(fs.readFileSync(adminKeypairPath, 'utf8'));
            const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));

            if (!adminKeypair.publicKey.equals(this.adminAuthority)) {
                throw new Error(`Admin keypair mismatch! Expected: ${this.adminAuthority.toBase58()}, Got: ${adminKeypair.publicKey.toBase58()}`);
            }

            this.adminWallet = {
                keypair: adminKeypair,
                vaultPda: PublicKey.default,
                vaultBump: 0,
                targetBalance: 0,
                name: "CLI_Admin"
            };

            console.log(`   ✅ Loaded admin authority: ${this.adminWallet.keypair.publicKey.toBase58()}`);

        } catch (error) {
            console.error(`   ❌ Failed to load admin keypair from ~/.config/solana/id.json`);
            throw error;
        }

        // Derive house vault PDA
        const [houseVaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("house_vault")],
            this.programId
        );
        this.houseVaultPda = houseVaultPda;

        // Derive pause config PDA
        const [pauseConfigPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("pause_config")],
            this.programId
        );
        this.pauseConfigPda = pauseConfigPda;

        console.log(`   ✅ House Vault PDA: ${this.houseVaultPda.toBase58()}`);
        console.log(`   ✅ Pause Config PDA: ${this.pauseConfigPda.toBase58()}\n`);
    }

    private async step2_setupProgram() {
        console.log("⚙️  Step 2: Setting up Anchor program connection...");

        try {
            // Create provider with admin wallet
            const provider = new anchor.AnchorProvider(
                this.connection,
                new anchor.Wallet(this.adminWallet.keypair),
                { commitment: "confirmed" }
            );

            // Create program instance using real deployed IDL
            this.program = new anchor.Program(SMART_VAULT_IDL, this.programId, provider);

            console.log(`   ✅ Program connected with real IDL: ${this.programId.toBase58()}`);

            // Verify program exists
            const programInfo = await this.connection.getAccountInfo(this.programId);
            if (!programInfo) {
                throw new Error("Program not found on devnet!");
            }

            console.log(`   ✅ Program verified on devnet (${programInfo.data.length} bytes)\n`);

        } catch (error) {
            console.error("   ❌ Failed to setup program:", error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    private async step3_checkCurrentBalances() {
        console.log("🔍 Step 3: Checking current vault balances...");

        for (const wallet of this.clientWallets) {
            try {
                // Check wallet balance
                const walletBalance = await this.connection.getBalance(wallet.keypair.publicKey);
                const walletSOL = walletBalance / LAMPORTS_PER_SOL;

                // Check vault balance
                let vaultBalance = 0;
                let vaultExists = false;
                try {
                    vaultBalance = await this.connection.getBalance(wallet.vaultPda);
                    vaultExists = vaultBalance > 0;
                } catch (error) {
                    // Vault doesn't exist or no balance
                }

                const vaultSOL = vaultBalance / LAMPORTS_PER_SOL;

                console.log(`   ${wallet.name}:`);
                console.log(`      Wallet: ${walletSOL.toFixed(6)} SOL`);
                console.log(`      Vault: ${vaultSOL.toFixed(6)} SOL (${vaultExists ? 'exists' : 'empty'})`);

                this.results[wallet.name] = {
                    walletBalance: walletSOL,
                    vaultBalance: vaultSOL,
                    vaultExists: vaultExists
                };

            } catch (error) {
                console.log(`   ${wallet.name}: ❌ Error checking state`);
                this.results[wallet.name] = { error: error instanceof Error ? error.message : String(error) };
            }
        }

        console.log();
    }

    private async step4_updateVaultBalances() {
        console.log("💸 Step 4: Updating vault balances for testing...");

        // Target balance for each vault (0.1 SOL for multiple betting rounds)
        const targetVaultBalance = 0.1; // SOL
        const targetVaultLamports = Math.floor(targetVaultBalance * LAMPORTS_PER_SOL);

        for (const wallet of this.clientWallets) {
            try {
                const currentVaultBalance = this.results[wallet.name].vaultBalance;
                const currentVaultLamports = Math.floor(currentVaultBalance * LAMPORTS_PER_SOL);

                if (currentVaultLamports >= targetVaultLamports) {
                    console.log(`   ${wallet.name}: ✅ Already has sufficient balance (${currentVaultBalance.toFixed(6)} SOL)`);
                    continue;
                }

                const neededAmount = targetVaultLamports - currentVaultLamports;
                const neededSOL = neededAmount / LAMPORTS_PER_SOL;

                console.log(`   ${wallet.name}: Adding ${neededSOL.toFixed(6)} SOL to vault...`);

                // Check if vault needs to be initialized
                if (!this.results[wallet.name].vaultExists) {
                    console.log(`      🔧 Initializing vault...`);
                    
                    const initTx = await this.program.methods
                        .initializeVault()
                        .accounts({
                            vault: wallet.vaultPda,
                            user: wallet.keypair.publicKey,
                            systemProgram: SystemProgram.programId,
                        })
                        .rpc();

                    console.log(`      ✅ Vault initialized! Tx: ${initTx}`);
                }

                // Use admin authority to fund the vault directly
                // Transfer SOL from admin to the vault PDA
                const transferTx = await this.connection.sendTransaction(
                    new anchor.web3.Transaction().add(
                        SystemProgram.transfer({
                            fromPubkey: this.adminWallet.keypair.publicKey,
                            toPubkey: wallet.vaultPda,
                            lamports: neededAmount,
                        })
                    ),
                    [this.adminWallet.keypair]
                );

                console.log(`      ✅ Transfer completed! Tx: ${transferTx}`);

                this.results[wallet.name].transferTx = transferTx;
                this.results[wallet.name].transferAmount = neededSOL;

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`   ${wallet.name}: ❌ Failed to update balance - ${errorMsg}`);
                this.results[wallet.name].updateError = errorMsg;
            }
        }

        console.log();
    }

    private async step5_verifyFinalBalances() {
        console.log("✅ Step 5: Verifying final vault balances...");

        let totalVaultBalance = 0;
        let successfulUpdates = 0;

        for (const wallet of this.clientWallets) {
            try {
                const walletBalance = await this.connection.getBalance(wallet.keypair.publicKey);
                const vaultBalance = await this.connection.getBalance(wallet.vaultPda);

                const walletSOL = walletBalance / LAMPORTS_PER_SOL;
                const vaultSOL = vaultBalance / LAMPORTS_PER_SOL;

                console.log(`   ${wallet.name}:`);
                console.log(`      Final Wallet: ${walletSOL.toFixed(6)} SOL`);
                console.log(`      Final Vault: ${vaultSOL.toFixed(6)} SOL`);
                console.log(`      Ready for games: ${vaultSOL >= 0.05 ? '✅' : '❌'}`);

                if (vaultSOL >= 0.05) {
                    successfulUpdates++;
                }

                totalVaultBalance += vaultSOL;

            } catch (error) {
                console.log(`   ${wallet.name}: ❌ Error checking final state`);
            }
        }

        // Check house vault balance
        try {
            const houseBalance = await this.connection.getBalance(this.houseVaultPda);
            const houseSOL = houseBalance / LAMPORTS_PER_SOL;
            console.log(`\n   🏦 House Vault: ${houseSOL.toFixed(6)} SOL`);
            console.log(`   👥 Total Client Vaults: ${totalVaultBalance.toFixed(6)} SOL`);
            console.log(`   🎯 Ready for Testing: ${successfulUpdates}/${this.clientWallets.length} vaults`);
        } catch (error) {
            console.log(`   🏦 House Vault: Error checking balance`);
        }

        console.log(`   ✅ Final balance verification complete\n`);
    }

    private printSummary() {
        console.log("📊 VAULT BALANCE UPDATE SUMMARY");
        console.log("=================================");
        console.log(`✅ Program: ${this.programId.toBase58()}`);

        console.log("\n💰 Balance Update Results:");

        let successfulUpdates = 0;
        let totalDeposited = 0;

        for (const wallet of this.clientWallets) {
            const result = this.results[wallet.name];
            
            if (result.transferTx) {
                successfulUpdates++;
                totalDeposited += result.transferAmount || 0;
                console.log(`   ${wallet.name}: ✅ +${(result.transferAmount || 0).toFixed(6)} SOL`);
            } else if (result.updateError) {
                console.log(`   ${wallet.name}: ❌ ${result.updateError}`);
            } else {
                console.log(`   ${wallet.name}: ⏭️  Already sufficient balance`);
            }
        }

        console.log("\n📈 Statistics:");
        console.log(`   Successful Updates: ${successfulUpdates}/${this.clientWallets.length}`);
        console.log(`   Total Deposited: ${totalDeposited.toFixed(6)} SOL`);
        console.log(`   Average per Vault: ${(totalDeposited / this.clientWallets.length).toFixed(6)} SOL`);

        console.log("\n🎯 Ready for Phase 3: Game Operations Testing!");
        console.log("   Each vault now has sufficient balance for multiple betting rounds.");
    }
}

// Run the updater
async function main() {
    try {
        const updater = new VaultBalanceUpdater();
        await updater.run();
    } catch (error) {
        console.error("❌ Main execution failed:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
} 