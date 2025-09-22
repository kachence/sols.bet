import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useState, useMemo, useCallback, useRef } from 'react';
import { useSmartVault } from '@/hooks/useSmartVault';
import { usePrice } from '../../hooks/usePrice';
import { useTokenBalance } from '@/hooks/useTokenBalance';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function WithdrawFundsModal({ open, onOpenChange }: Props) {
  const { withdrawFromVault, withdrawLoading } = useSmartVault();
  const [amount, setAmount] = useState('');
  const { priceUsd } = usePrice('SOL');
  const { balanceLamports } = useTokenBalance(); // Get vault balance from database

  const amountLamports = useMemo(() => {
    const n = Number(amount);
    return isNaN(n) ? 0 : n * 1e9;
  }, [amount]);

  const vaultBalanceSol = balanceLamports / 1e9; // Convert lamports to SOL

  // Debounced withdraw handler to prevent double-clicks
  const lastCallTime = useRef(0);
  const handleWithdraw = useCallback(async () => {
    const now = Date.now();
    // Prevent calls within 1 second of each other
    if (now - lastCallTime.current < 1000) {
      if (process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet')) {
        console.warn('Withdraw button clicked too quickly, ignoring...');
      }
      return;
    }
    lastCallTime.current = now;

    const ok = await withdrawFromVault(amountLamports);
    if (ok) {
      setAmount('');
      onOpenChange(false);
    }
  }, [withdrawFromVault, amountLamports, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-cardDark/30" />
        <DialogContent className="border-0 max-w-[calc(100vw-2rem)] sm:max-w-2xl bg-cardMedium text-white flex flex-col sm:flex-row p-0 overflow-hidden rounded-lg">
          <div className="hidden sm:flex flex-1 p-8 pr-0 flex-col items-center justify-center">
            <Image src="/deposit-vault.png" alt="Withdraw Vault" width={400} height={819} className="object-contain" priority />
          </div>

          <div className="flex-[1.2] p-4 sm:p-8 space-y-6">
            <div>
              <DialogHeader className="mb-4">
                <DialogTitle className="text-2xl font-bold">Withdraw Funds</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-300 mb-6">Withdraw your SOL from the Smart Vault back to your wallet. Your funds remain under your complete control with instant blockchain settlements and full transparency.</p>
              <ul className="space-y-3 mb-6 text-sm text-gray-200">
                {[
                  'Instant withdrawal to your connected wallet',
                  'No withdrawal fees or waiting periods',
                  'Complete control over your assets',
                  'All transactions are publicly verifiable',
                ].map((txt) => (
                  <li key={txt} className="flex items-start gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full bg-richGold"></span>
                    <span>{txt}</span>
                  </li>
                ))}
              </ul>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Amount to Withdraw</label>
                  <span className="text-sm text-gray-400">Available: {vaultBalanceSol.toFixed(4)} SOL</span>
                </div>
                <div className="relative rounded-lg flex items-center px-3 py-2 mt-2 bg-darkLuxuryPurple w-full">
                                        <Image src="/solana-logo.png" alt="SOL" width={24} height={24} className="w-6 h-6" />
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.0"
                    className="flex-1 bg-transparent appearance-none outline-none focus:outline-none focus:ring-0 border-0 text-white placeholder-gray-500 min-w-0"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0 mr-3 w-20 text-right">
                    ≈${(Number(amount) * priceUsd).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      // Set max amount to full vault balance
                      setAmount(vaultBalanceSol.toFixed(6));
                    }}
                    className="text-xs text-richGold flex-shrink-0 bg-cardMedium px-2 py-1 rounded"
                  >
                    Max
                  </button>
                </div>
              </div>

              <Button
                disabled={withdrawLoading || !amount || Number(amount) > vaultBalanceSol}
                onClick={handleWithdraw}
                className="w-full bg-richGold hover:brightness-110 text-black px-4 py-2 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] disabled:opacity-50 disabled:shadow-none"
              >
                {withdrawLoading ? 'Processing…' : 'Withdraw Funds'}
              </Button>

              <p className="text-center text-xs text-gray-400 mt-4">
                Withdrawals are processed instantly on the Solana blockchain
              </p>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
} 