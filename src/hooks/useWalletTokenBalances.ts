import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';

// TOKEN_PROGRAM_ID constant
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Known token mint addresses (mainnet)
const TOKEN_MINTS = {
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  SOL: PublicKey.default, // Native SOL doesn't have a mint
};

interface TokenBalance {
  symbol: string;
  balance: number;
  usdValue: number;
  mintAddress?: string;
}

interface WalletTokenBalances {
  balances: TokenBalance[];
  loading: boolean;
  error: string | null;
}

export function useWalletTokenBalances(): WalletTokenBalances {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [state, setState] = useState<WalletTokenBalances>({
    balances: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!connected || !publicKey) {
      setState({
        balances: [],
        loading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;

    async function fetchTokenBalances() {
      if (!publicKey) return;

      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        // Fetch SOL balance
        const solBalance = await connection.getBalance(publicKey);
        const solInSol = solBalance / 1e9;

        // Fetch SPL token accounts for the wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        const balances: TokenBalance[] = [];

        // Add SOL balance
        balances.push({
          symbol: 'SOL',
          balance: solInSol,
          usdValue: 0, // Will be calculated with price data
        });

        // Process SPL token accounts
        for (const tokenAccount of tokenAccounts.value) {
          const accountData = tokenAccount.account.data.parsed;
          const mintAddress = accountData.info.mint;
          const balance = accountData.info.tokenAmount.uiAmount || 0;

          // Check if this is USDC or USDT
          if (mintAddress === TOKEN_MINTS.USDC.toBase58()) {
            balances.push({
              symbol: 'USDC',
              balance,
              usdValue: balance, // USDC is roughly $1
              mintAddress,
            });
          } else if (mintAddress === TOKEN_MINTS.USDT.toBase58()) {
            balances.push({
              symbol: 'USDT',
              balance,
              usdValue: balance, // USDT is roughly $1
              mintAddress,
            });
          }
        }

        // Ensure all tokens are present (with 0 balance if not found)
        const tokens = ['SOL', 'USDC', 'USDT'];
        for (const token of tokens) {
          if (!balances.find(b => b.symbol === token)) {
            balances.push({
              symbol: token,
              balance: 0,
              usdValue: 0,
              mintAddress: token !== 'SOL' ? TOKEN_MINTS[token as keyof typeof TOKEN_MINTS].toBase58() : undefined,
            });
          }
        }

        if (!cancelled) {
          setState({
            balances,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch wallet token balances:', error);
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: 'Failed to fetch wallet balances',
          }));
        }
      }
    }

    fetchTokenBalances();

    // Refresh balances every 30 seconds
    const interval = setInterval(fetchTokenBalances, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connected, publicKey, connection]);

  return state;
} 