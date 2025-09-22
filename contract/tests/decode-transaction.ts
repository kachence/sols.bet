#!/usr/bin/env ts-node

/**
 * Smart Vault V2 Transaction Decoder
 * 
 * This script decodes betAndSettle and batchSettle instructions from a transaction hash.
 * Usage: ts-node decode-transaction.ts <transaction_hash>
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, VersionedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEVNET_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = "3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg";

interface DecodedBetAndSettle {
    instructionName: "betAndSettle";
    accounts: {
        vault: string;
        houseVault: string;
        authority: string;
        pauseConfig: string;
    };
    data: {
        stake: string;
        payout: string;
        betId: string;
        gameId: string;
        gemData: number[];
    };
}

interface DecodedBatchSettle {
    instructionName: "batchSettle";
    accounts: {
        houseVault: string;
        authority: string;
        pauseConfig: string;
        userVaults: string[];
    };
    data: {
        stakes: string[];
        payouts: string[];
        betIds: string[];
        gameIds: string[];
        gemDatas: number[][];
    };
}

type DecodedInstruction = DecodedBetAndSettle | DecodedBatchSettle;

class TransactionDecoder {
    private connection: Connection;
    private program: anchor.Program<any>;
    private programId: PublicKey;

    constructor() {
        this.connection = new Connection(DEVNET_URL, "confirmed");
        this.programId = new PublicKey(PROGRAM_ID);
        
        // Load IDL
        const idlPath = path.join(__dirname, "..", "src", "idl.json");
        const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
        
        // Create a dummy provider for the program
        const dummyWallet = {
            publicKey: PublicKey.default,
            signTransaction: async () => { throw new Error("Not implemented"); },
            signAllTransactions: async () => { throw new Error("Not implemented"); }
        };
        
        const provider = new anchor.AnchorProvider(
            this.connection,
            dummyWallet as any,
            { commitment: "confirmed" }
        );
        
        this.program = new anchor.Program(idl, this.programId, provider);
    }

    async decodeTransaction(txHash: string): Promise<DecodedInstruction[]> {
        console.log(`🔍 Decoding transaction: ${txHash}`);
        
        try {
            // Fetch transaction
            const tx = await this.connection.getTransaction(txHash, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0
            });
            
            if (!tx) {
                throw new Error("Transaction not found");
            }
            
            console.log(`📊 Transaction found with ${tx.transaction.message.compiledInstructions.length} instructions`);
            
            const decodedInstructions: DecodedInstruction[] = [];
            
            // Process each instruction
            for (let i = 0; i < tx.transaction.message.compiledInstructions.length; i++) {
                const instruction = tx.transaction.message.compiledInstructions[i];
                const accountKeys = tx.transaction.message.staticAccountKeys;
                
                // Check if this instruction is for our program
                const programIdIndex = instruction.programIdIndex;
                const programKey = accountKeys[programIdIndex];
                
                if (programKey.toBase58() === this.programId.toBase58()) {
                    console.log(`🎯 Found smart vault instruction at index ${i}`);
                    
                    try {
                        const decoded = await this.decodeInstruction(instruction, accountKeys, tx);
                        if (decoded) {
                            decodedInstructions.push(decoded);
                        }
                    } catch (error) {
                        console.error(`❌ Failed to decode instruction ${i}:`, error);
                    }
                }
            }
            
            return decodedInstructions;
            
        } catch (error) {
            console.error("❌ Error decoding transaction:", error);
            throw error;
        }
    }

    private async decodeInstruction(
        instruction: any,
        accountKeys: PublicKey[],
        tx: VersionedTransactionResponse
    ): Promise<DecodedInstruction | null> {
        
        const data = Buffer.from(instruction.data);
        
        // Extract discriminator (first 8 bytes)
        const discriminator = data.slice(0, 8);
        
        // Try to decode based on discriminator
        try {
            const decodedData = this.program.coder.instruction.decode(data);
            
            if (!decodedData) {
                console.log("⚠️ Could not decode instruction data");
                return null;
            }
            
            const instructionName = decodedData.name;
            console.log(`📝 Instruction: ${instructionName}`);
            
            // Get account addresses for this instruction
            const instructionAccounts = instruction.accounts.map((accountIndex: number) => 
                accountKeys[accountIndex].toBase58()
            );
            
            if (instructionName === "betAndSettle") {
                return this.decodeBetAndSettle(decodedData.data, instructionAccounts, tx);
            } else if (instructionName === "batchSettle") {
                return this.decodeBatchSettle(decodedData.data, instructionAccounts, tx);
            } else {
                console.log(`ℹ️ Skipping ${instructionName} (not a game instruction)`);
                return null;
            }
            
        } catch (error) {
            console.error("❌ Error decoding instruction:", error);
            return null;
        }
    }

    private decodeBetAndSettle(data: any, accounts: string[], tx: VersionedTransactionResponse): DecodedBetAndSettle {
        // Parse gemData bytes
        const gemData = Array.from(data.gemData as Buffer);
        
        const decoded: DecodedBetAndSettle = {
            instructionName: "betAndSettle",
            accounts: {
                vault: accounts[0],
                houseVault: accounts[1],
                authority: accounts[2],
                pauseConfig: accounts[3]
            },
            data: {
                stake: data.stake.toString(),
                payout: data.payout.toString(),
                betId: data.betId,
                gameId: data.gameId.toString(),
                gemData: gemData
            }
        };
        
        console.log("🎲 betAndSettle instruction decoded:");
        console.log(`   Stake: ${this.lamportsToSol(data.stake.toString())} SOL`);
        console.log(`   Payout: ${this.lamportsToSol(data.payout.toString())} SOL`);
        console.log(`   Bet ID: ${data.betId}`);
        console.log(`   Game ID: ${data.gameId.toString()}`);
        console.log(`   Gem Data: [${gemData.join(', ')}]`);
        console.log(`   Outcome: ${this.getOutcome(data.stake, data.payout)}`);
        
        return decoded;
    }

    private decodeBatchSettle(data: any, accounts: string[], tx: VersionedTransactionResponse): DecodedBatchSettle {
        // Parse arrays
        const stakes = data.stakes.map((s: any) => s.toString());
        const payouts = data.payouts.map((p: any) => p.toString());
        const betIds = data.betIds;
        const gameIds = data.gameIds.map((g: any) => g.toString());
        const gemDatas = data.gemDatas.map((g: Buffer) => Array.from(g));
        
        // User vaults are in remaining accounts (starting from account 3)
        const userVaults = accounts.slice(3);
        
        const decoded: DecodedBatchSettle = {
            instructionName: "batchSettle",
            accounts: {
                houseVault: accounts[0],
                authority: accounts[1],
                pauseConfig: accounts[2],
                userVaults: userVaults
            },
            data: {
                stakes: stakes,
                payouts: payouts,
                betIds: betIds,
                gameIds: gameIds,
                gemDatas: gemDatas
            }
        };
        
        console.log("📦 batchSettle instruction decoded:");
        console.log(`   Number of games: ${stakes.length}`);
        
        for (let i = 0; i < stakes.length; i++) {
            console.log(`   Game ${i + 1}:`);
            console.log(`     Stake: ${this.lamportsToSol(stakes[i])} SOL`);
            console.log(`     Payout: ${this.lamportsToSol(payouts[i])} SOL`);
            console.log(`     Bet ID: ${betIds[i]}`);
            console.log(`     Game ID: ${gameIds[i]}`);
            console.log(`     Gem Data: [${gemDatas[i].join(', ')}]`);
            console.log(`     Outcome: ${this.getOutcome(stakes[i], payouts[i])}`);
            if (userVaults[i]) {
                console.log(`     User Vault: ${userVaults[i]}`);
            }
        }
        
        return decoded;
    }

    private lamportsToSol(lamports: string): string {
        const sol = parseInt(lamports) / 1000000000;
        return sol.toFixed(6);
    }

    private getOutcome(stake: any, payout: any): string {
        const stakeNum = typeof stake === 'string' ? parseInt(stake) : stake.toNumber();
        const payoutNum = typeof payout === 'string' ? parseInt(payout) : payout.toNumber();
        
        if (payoutNum > stakeNum) return "WIN";
        if (payoutNum < stakeNum) return "LOSS";
        return "DRAW";
    }

    async printTransactionSummary(txHash: string) {
        console.log("=".repeat(80));
        console.log("🔍 SMART VAULT TRANSACTION DECODER");
        console.log("=".repeat(80));
        console.log(`Transaction Hash: ${txHash}`);
        console.log(`Program ID: ${this.programId.toBase58()}`);
        console.log(`RPC Endpoint: ${DEVNET_URL}`);
        console.log();
        
        try {
            const instructions = await this.decodeTransaction(txHash);
            
            if (instructions.length === 0) {
                console.log("ℹ️ No smart vault instructions found in this transaction");
            } else {
                console.log(`✅ Successfully decoded ${instructions.length} smart vault instruction(s)`);
            }
            
            console.log("=".repeat(80));
            
            return instructions;
            
        } catch (error) {
            console.error("❌ Failed to decode transaction:", error);
            console.log("=".repeat(80));
            throw error;
        }
    }
}

// CLI Usage
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length !== 1) {
        console.error("Usage: ts-node decode-transaction.ts <transaction_hash>");
        console.error("Example: ts-node decode-transaction.ts 5xK7mBtGfPxV2qK4H8J3N9fQ2R8L6wX4v3Y1z7A9...");
        process.exit(1);
    }
    
    const txHash = args[0];
    
    if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(txHash)) {
        console.error("❌ Invalid transaction hash format");
        process.exit(1);
    }
    
    try {
        const decoder = new TransactionDecoder();
        const instructions = await decoder.printTransactionSummary(txHash);
        
        // Export decoded data as JSON for further processing
        const outputPath = path.join(__dirname, `decoded-${txHash.substring(0, 8)}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(instructions, null, 2));
        console.log(`💾 Decoded data saved to: ${outputPath}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error("❌ Decoding failed:", error);
        process.exit(1);
    }
}

// Run if called directly
main();

export { TransactionDecoder, DecodedBetAndSettle, DecodedBatchSettle, DecodedInstruction };