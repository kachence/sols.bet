#!/usr/bin/env ts-node

/**
 * Smart Vault V2 Test Runner
 * 
 * Comprehensive test suite for the Smart Vault V2 smart contract.
 * Tests all functionality including vault operations, game mechanics, and pause controls.
 */

import { execSync } from "child_process";
import * as path from "path";

const tests = [
    {
        name: "Wallet Setup",
        script: "test-0-setup-wallets.ts",
        description: "Initialize test wallets and vault accounts"
    },
    {
        name: "Vault Operations", 
        script: "test-1-vault-operations.ts",
        description: "Test basic vault operations (deposit/withdraw)"
    },
    {
        name: "House Setup",
        script: "test-2-house-setup.ts", 
        description: "Initialize house vault and configuration"
    },
    {
        name: "Game Operations",
        script: "test-3-game-operations.ts",
        description: "Test betAndSettle and batchSettle with all scenarios"
    },
    {
        name: "Pause/Unpause",
        script: "test-4-pause-unpause.ts",
        description: "Test pause functionality and emergency controls"
    }
];

async function runTest(test: typeof tests[0]) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🧪 Running: ${test.name}`);
    console.log(`📄 Script: ${test.script}`);
    console.log(`📝 Description: ${test.description}`);
    console.log(`${"=".repeat(80)}`);
    
    const testPath = path.join(__dirname, test.script);
    
    try {
        const startTime = Date.now();
        execSync(`ts-node --compiler-options '{"module":"commonjs"}' "${testPath}"`, { 
            stdio: 'inherit',
            cwd: __dirname
        });
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`\n✅ ${test.name} completed successfully in ${duration}s`);
        return true;
        
    } catch (error) {
        console.error(`\n❌ ${test.name} failed:`, error);
        return false;
    }
}

async function main() {
    console.log("🚀 Smart Vault V2 Test Suite");
    console.log("📅 " + new Date().toISOString());
    console.log(`🔧 Running ${tests.length} test suites...`);
    
    const results: { [testName: string]: boolean } = {};
    let passed = 0;
    let failed = 0;
    
    // Check if user wants to run specific tests
    const args = process.argv.slice(2);
    let testsToRun = tests;
    
    if (args.length > 0) {
        const testNumbers = args.map(arg => parseInt(arg)).filter(n => !isNaN(n) && n >= 0 && n < tests.length);
        if (testNumbers.length > 0) {
            testsToRun = testNumbers.map(i => tests[i]);
            console.log(`🎯 Running specific tests: ${testNumbers.join(', ')}`);
        }
    }
    
    for (const test of testsToRun) {
        const success = await runTest(test);
        results[test.name] = success;
        
        if (success) {
            passed++;
        } else {
            failed++;
        }
    }
    
    // Summary
    console.log(`\n${"=".repeat(80)}`);
    console.log("📊 TEST SUITE SUMMARY");
    console.log(`${"=".repeat(80)}`);
    
    for (const test of testsToRun) {
        const status = results[test.name] ? "✅ PASSED" : "❌ FAILED";
        console.log(`${status.padEnd(12)} ${test.name}`);
    }
    
    console.log(`\n📈 Results: ${passed} passed, ${failed} failed (${((passed/(passed+failed))*100).toFixed(1)}% success rate)`);
    
    if (failed > 0) {
        console.log("\n⚠️  Some tests failed. Check the output above for details.");
        process.exit(1);
    } else {
        console.log("\n🎉 All tests passed successfully!");
        process.exit(0);
    }
}

// Usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log("Usage: npm test [test_numbers...]");
    console.log("\nAvailable tests:");
    tests.forEach((test, index) => {
        console.log(`  ${index}: ${test.name} - ${test.description}`);
    });
    console.log("\nExamples:");
    console.log("  npm test           # Run all tests");
    console.log("  npm test 3         # Run only test 3 (Game Operations)");
    console.log("  npm test 3 4       # Run tests 3 and 4");
    console.log("  npm test -- --help # Show this help");
    process.exit(0);
}

// Run the test suite
main().catch(console.error);