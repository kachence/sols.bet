#!/usr/bin/env ts-node

/**
 * Transfer V1 Program Upgrade Authority to Multisig
 * 
 * This script should be executed by the CURRENT UPGRADE AUTHORITY holder:
 * 5oXAyYNMXsUvgYMferxdyVPe5UKmgERd6xyN9MJkddP
 * 
 * NOT the operational authority (CBKPbz...) - that's hardcoded and can't transfer authority
 * 
 * Usage:
 * 1. Current upgrade authority holder must have their keypair file
 * 2. Run: npm run transfer-upgrade-authority
 * 3. This will transfer upgrade control to your multisig
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';

// BPF Loader Upgradeable Program ID
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
import * as fs from 'fs';

// Program and authority details
const V1_PROGRAM_ID = new PublicKey('9yWzBLvPQxyezB9LvRqGEZHG4aQMBKuXzGPNxQRqxDXj');
const CURRENT_UPGRADE_AUTHORITY = new PublicKey('5oXAyYNMXsUvgYMferxdyVPe5UKmgERd6xyN9MJkddP');
const NEW_MULTISIG_AUTHORITY = new PublicKey('BMprzPNF9FTni4mJWwCJnk91ZzhKdxGCx7BwPckMRzBt');

async function transferUpgradeAuthority() {
    console.log('🔄 Transferring V1 Program Upgrade Authority to Multisig\n');
    
    // Connect to devnet (where V1 was found)
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    console.log('📋 Transfer Details:');
    console.log(`   Program ID: ${V1_PROGRAM_ID.toBase58()}`);
    console.log(`   Current Authority: ${CURRENT_UPGRADE_AUTHORITY.toBase58()}`);
    console.log(`   New Authority: ${NEW_MULTISIG_AUTHORITY.toBase58()}\n`);
    
    // Load current upgrade authority keypair
    console.log('🔑 Loading upgrade authority keypair...');
    
    let upgradeAuthorityKeypair: Keypair;
    
    try {
        // Try multiple possible keypair locations
        const possiblePaths = [
            './upgrade-authority-keypair.json',
            '~/.config/solana/id.json',
            './wallet-keypair.json'
        ];
        
        let keypairData: number[] | null = null;
        let usedPath = '';
        
        for (const path of possiblePaths) {
            try {
                if (fs.existsSync(path)) {
                    keypairData = JSON.parse(fs.readFileSync(path, 'utf8'));
                    usedPath = path;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!keypairData) {
            console.log('❌ Keypair not found. Please provide upgrade authority keypair:');
            console.log('   1. Save keypair as upgrade-authority-keypair.json');
            console.log('   2. Or update the script with correct path');
            console.log('\n💡 The upgrade authority keypair should contain the private key for:');
            console.log(`   ${CURRENT_UPGRADE_AUTHORITY.toBase58()}`);
            return;
        }
        
        upgradeAuthorityKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
        console.log(`   ✅ Loaded from: ${usedPath}`);
        console.log(`   ✅ Public key: ${upgradeAuthorityKeypair.publicKey.toBase58()}`);
        
        // Verify this is the correct upgrade authority
        if (!upgradeAuthorityKeypair.publicKey.equals(CURRENT_UPGRADE_AUTHORITY)) {
            console.log('❌ ERROR: Loaded keypair does not match expected upgrade authority!');
            console.log(`   Expected: ${CURRENT_UPGRADE_AUTHORITY.toBase58()}`);
            console.log(`   Got: ${upgradeAuthorityKeypair.publicKey.toBase58()}`);
            return;
        }
        
    } catch (error) {
        console.log(`❌ Error loading keypair: ${error}`);
        return;
    }
    
    // Check current program state
    console.log('\n🔍 Verifying current program state...');
    
    try {
        const programInfo = await connection.getAccountInfo(V1_PROGRAM_ID);
        if (!programInfo) {
            console.log('❌ Program not found on devnet');
            return;
        }
        
        // Get program data account
        const [programDataAddress] = PublicKey.findProgramAddressSync(
            [V1_PROGRAM_ID.toBuffer()],
            BPF_LOADER_UPGRADEABLE_PROGRAM_ID
        );
        
        const programDataInfo = await connection.getAccountInfo(programDataAddress);
        if (!programDataInfo) {
            console.log('❌ Program data account not found');
            return;
        }
        
        console.log('   ✅ Program verified on devnet');
        console.log(`   ✅ Program data account: ${programDataAddress.toBase58()}`);
        
    } catch (error) {
        console.log(`❌ Error verifying program: ${error}`);
        return;
    }
    
    // Create the authority transfer instruction
    console.log('\n🔧 Creating authority transfer transaction...');
    
    try {
        const { Transaction, SystemProgram } = await import('@solana/web3.js');
        
        // Get program data account address
        const [programDataAddress] = PublicKey.findProgramAddressSync(
            [V1_PROGRAM_ID.toBuffer()],
            BPF_LOADER_UPGRADEABLE_PROGRAM_ID
        );
        
        // Create set authority instruction
        const setAuthorityInstruction = {
            keys: [
                { pubkey: programDataAddress, isSigner: false, isWritable: true },
                { pubkey: upgradeAuthorityKeypair.publicKey, isSigner: true, isWritable: false },
                { pubkey: NEW_MULTISIG_AUTHORITY, isSigner: false, isWritable: false },
            ],
            programId: BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
            data: Buffer.from([
                4, // SetAuthority instruction
                0, // Authority type: UpgradeAuthority
            ])
        };
        
        const transaction = new Transaction();
        transaction.add(setAuthorityInstruction);
        
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = upgradeAuthorityKeypair.publicKey;
        
        console.log('   ✅ Transaction created');
        
        // Sign and send transaction
        console.log('\n📡 Sending authority transfer transaction...');
        
        transaction.sign(upgradeAuthorityKeypair);
        
        const signature = await connection.sendTransaction(transaction, [upgradeAuthorityKeypair]);
        
        console.log(`   ✅ Transaction sent: ${signature}`);
        console.log(`   🔗 View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        
        // Wait for confirmation
        console.log('\n⏳ Waiting for confirmation...');
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
            console.log(`❌ Transaction failed: ${confirmation.value.err}`);
            return;
        }
        
        console.log('   ✅ Transaction confirmed!');
        
        // Verify the transfer
        console.log('\n🔍 Verifying authority transfer...');
        
        const updatedProgramDataInfo = await connection.getAccountInfo(programDataAddress);
        if (updatedProgramDataInfo) {
            const data = updatedProgramDataInfo.data;
            const authorityBytes = data.slice(12, 44);
            const newAuthority = new PublicKey(authorityBytes);
            
            if (newAuthority.equals(NEW_MULTISIG_AUTHORITY)) {
                console.log('   ✅ Authority transfer successful!');
                console.log(`   ✅ New upgrade authority: ${newAuthority.toBase58()}`);
            } else {
                console.log('   ⚠️  Authority may not have transferred correctly');
                console.log(`   Current authority: ${newAuthority.toBase58()}`);
            }
        }
        
        console.log('\n🎉 SUCCESS! Upgrade authority transferred to multisig');
        console.log('\n📋 What happens next:');
        console.log('   1. ✅ Your multisig now controls V1 program upgrades');
        console.log('   2. 🔄 You can now deploy V1.1 with changeable authority');
        console.log('   3. 🎯 Or proceed with direct V1→V2 migration');
        console.log('   4. 🔐 All future upgrades require multisig signatures');
        
    } catch (error) {
        console.log(`❌ Error during transfer: ${error}`);
        console.log('\n💡 Common issues:');
        console.log('   - Insufficient SOL for transaction fees');
        console.log('   - Network connectivity issues');
        console.log('   - Incorrect keypair file');
    }
}

console.log('🔑 V1 Upgrade Authority Transfer Script');
console.log('=' .repeat(50));
console.log('\n⚠️  IMPORTANT: This script must be run by the CURRENT upgrade authority holder');
console.log(`   Current upgrade authority: ${CURRENT_UPGRADE_AUTHORITY.toBase58()}`);
console.log('\n📝 Before running:');
console.log('   1. Ensure you have the upgrade authority keypair file');
console.log('   2. Ensure you have devnet SOL for transaction fees');
console.log('   3. Verify the multisig address is correct');

transferUpgradeAuthority().catch(console.error);