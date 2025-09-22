import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useState, useMemo } from 'react';
import { useSmartVault } from '@/hooks/useSmartVault';
import { usePrice } from '../../hooks/usePrice';
import { useWalletBalance } from '@/hooks/useWalletBalance';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  showStepLabel?: boolean;
}

export default function AddFundsModal({ open, onOpenChange, showStepLabel = true }: Props) {
  const { depositToVault, depositLoading } = useSmartVault();
  const [amount, setAmount] = useState('');
  const { priceUsd } = usePrice('SOL');
  const { balance: walletBalance } = useWalletBalance();

  const amountLamports = useMemo(() => {
    const n = Number(amount);
    return isNaN(n) ? 0 : n * 1e9;
  }, [amount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-cardDark/30" />
        <DialogContent className="border-0 max-w-[calc(100vw-2rem)] sm:max-w-2xl bg-cardMedium text-white flex flex-col sm:flex-row p-0 overflow-hidden rounded-lg">
          <div className="hidden sm:flex flex-1 p-8 pr-0 flex-col items-center justify-center">
            <Image src="/deposit-vault.png" alt="Deposit Vault" width={400} height={819} className="object-contain" priority />
          </div>

          <div className="flex-[1.2] p-4 sm:p-8 space-y-6">
            <div>
              {showStepLabel && (
                <p className="hidden sm:block text-sm uppercase text-richGold mb-1">Step 3 of 3</p>
              )}
              <DialogHeader className="mb-4">
                <DialogTitle className="text-2xl font-bold">Add Funds</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-300 mb-6">Your Smart Vault gives you complete control over your assets with non-custodial security. Embark on your gaming journey without registration requirements or identity verification - everything operates seamlessly through blockchain technology.</p>
              <ul className="space-y-3 mb-6 text-sm text-gray-200">
                {[
                  'Non-custodial with no registration required',
                  'Instant blockchain settlements and withdrawals',
                  'Fully transparent and publicly verifiable',
                  'Auditable game mechanics and bankroll',
                ].map((txt) => (
                  <li key={txt} className="flex items-start gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full bg-richGold"></span>
                    <span>{txt}</span>
                  </li>
                ))}
              </ul>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Amount to Add</label>
                  <span className="text-sm text-gray-400">Available: {walletBalance.toFixed(4)} SOL</span>
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
                      const maxAmount = Math.max(0, walletBalance - 0.001);
                      setAmount(maxAmount.toFixed(6));
                    }}
                    className="text-xs text-richGold flex-shrink-0 bg-cardMedium px-2 py-1 rounded"
                  >
                    Max
                  </button>
                </div>
              </div>

              <Button
                disabled={depositLoading || !amount}
                onClick={async () => {
                  const ok = await depositToVault(amountLamports);
                  if (ok) {
                    setAmount('');
                    onOpenChange(false);
                  }
                }}
                className="w-full bg-richGold hover:brightness-110 text-black px-4 py-2 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] disabled:opacity-50 disabled:shadow-none"
              >
                {depositLoading ? 'Processing…' : 'Add Funds'}
              </Button>

              <a
                href="https://jup.ag/onboard/onramp"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm text-gray-300 underline mt-4 hover:text-richGold transition-colors duration-200"
              >
                Don't Have Crypto?
              </a>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
} 