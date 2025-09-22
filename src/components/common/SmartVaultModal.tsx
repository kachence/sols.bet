import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onActivate: () => void;
  loading?: boolean;
}

export default function SmartVaultModal({ open, onOpenChange, onActivate, loading }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/50" />
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl w-full bg-cardMedium text-white flex flex-col sm:flex-row p-0 rounded-xl border-0 overflow-hidden">
          {/* Left image - hidden on mobile */}
          <div className="hidden sm:flex flex-1 p-8 pr-0 flex-col items-center justify-center">
            <Image src="/golden-vault.png" alt="Vault" width={400} height={400} className="object-contain" priority />
          </div>
          {/* Right content */}
          <div className="flex-[1.2] p-8">
            <p className="hidden sm:block text-sm uppercase text-richGold mb-1">Step 2 of 3</p>
            <DialogHeader className="mb-4">
              <DialogTitle className="text-2xl font-bold">Activate Smart Vault</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-400 mb-6">Smart Vault lets you keep custody of your funds at every moment. Powered by secure smart contracts, we can never touch your money.</p>
            <ul className="space-y-3 mb-8 text-sm text-gray-200">
              {[
                'Maintain complete control of your assets',
                'Instant on-chain withdrawals',
                'No sign-ups or KYC needed',
              ].map((txt) => (
                <li key={txt} className="flex items-start gap-2">
                  <span className="mt-1 w-2 h-2 rounded-full bg-richGold"></span>
                  <span>{txt}</span>
                </li>
              ))}
            </ul>
            <Button
              onClick={onActivate}
              disabled={loading}
              className="w-full bg-richGold hover:brightness-110 text-darkLuxuryPurple px-4 py-2 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] hover:shadow-[0_0_30px_rgba(255,215,0,0.6)] flex items-center justify-center"
            >
              {loading ? 'Activating…' : 'Activate Smart Vault'}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
} 